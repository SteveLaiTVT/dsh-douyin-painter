import { id, requireThat } from "./util.js";
// The host owns transport and committed transcript. No token stream reaches the stage.
export class DshBridge {
  constructor(
    ctx,
    {
      isolationVerified = false,
      createUserMessage,
      expandAssistantStream,
      provider,
      model,
    } = {},
  ) {
    this.ctx = ctx;
    this.agents = ctx.agents;
    this.options = {
      isolationVerified,
      createUserMessage,
      expandAssistantStream,
      provider,
      model,
    };
    this.tasks = new Map();
    this.closed = false;
    this.listeners = [
      ctx.on("session/event", (s, e) => this.event(s, e)),
      ctx.on("agent/status", (e) => this.status(e)),
      ctx.on("agent/error", ({ agent }) => {
        const t = [...this.tasks.values()].find(
          (t) => t.handle.agent === agent,
        );
        t?.pending?.reject(Error("host agent failed"));
      }),
    ];
  }
  async contract() {
    if (
      !this.options.createUserMessage ||
      !this.options.expandAssistantStream
    ) {
      try {
        const m = await import("@deepseek-ai/dsh-llm");
        this.options.createUserMessage = m.createUserMessage;
        this.options.expandAssistantStream = m.expandAssistantStream;
      } catch {
        throw Error(
          "DSH compatibility: @deepseek-ai/dsh-llm exports unavailable",
        );
      }
    }
  }
  async run(text, { K, timeout = 10000, signal, maxOutputTokens } = {}) {
    requireThat(
      !this.closed && this.options.isolationVerified,
      "automatic text review disabled: tool isolation unverified",
    );
    await this.contract();
    const taskId = id();
    const task = { taskId, K, pending: null };
    const handle = await this.agents.create({
      sessionId: taskId,
      meta: { cwd: process.cwd() },
      agentOptions: {
        provider: this.options.provider,
        model: this.options.model,
        maxTokens: maxOutputTokens,
      },
      signal,
      setup: (scope) => {
        requireThat(
          scope.tools?.guard,
          "DSH compatibility: monotonic tool guard unavailable",
        );
        scope.tools.restrict({ allow: [] });
        scope.tools.guard(() => "review sessions have no tools");
        scope.on("agent/pre-step", async (_payload, next) => {
          const p = task.pending;
          if (!p || p.steps++ >= 1) return { kind: "reject" };
          return next();
        });
        scope.on("agent/request-error", async () => undefined);
      },
    });
    task.handle = handle;
    this.tasks.set(taskId, task);
    return this.followup(taskId, text, { timeout, signal });
  }
  async followup(taskId, text, { timeout = 10000, signal } = {}) {
    const t = this.tasks.get(taskId);
    requireThat(t && !t.pending && !this.closed, "task unavailable");
    const wait = Promise.withResolvers();
    const pending = {
      ...wait,
      text: "",
      admitted: false,
      busy: false,
      idle: false,
      ended: false,
      seen: new Set(),
      steps: 0,
    };
    t.pending = pending;
    const timer = setTimeout(
      () => {
        pending.reject(Error("text task timed out"));
        void t.handle.agent.cancel({ kind: "user" });
      },
      Math.max(1, timeout),
    );
    const abort = () => {
      pending.reject(Error("text task cancelled"));
      void t.handle.agent.cancel({ kind: "user" });
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const receipt = await t.handle.agent.followup(
        this.options.createUserMessage({
          content: [{ type: "text", text }],
          source: { kind: "user" },
        }),
      );
      pending.receipt = receipt;
      pending.admitted = true;
      this.finish(t);
      return { taskId, text: await wait.promise };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (t.pending === pending) t.pending = null;
    }
  }
  event(session, event) {
    const t = [...this.tasks.values()].find(
      (t) => t.handle.agent.session === session,
    );
    const p = t?.pending;
    if (!p) return;
    if (event.type === "turn/start") p.busy = true;
    if (event.type === "turn/end") p.ended = true;
    if (["assistant/message", "assistant/attempt"].includes(event.type)) {
      if (event.id && p.seen.has(event.id)) return;
      if (event.id) p.seen.add(event.id);
      for (const { chunk } of this.options.expandAssistantStream(
        event.data.stream,
      ))
        if (chunk.type === "text-delta") p.text += chunk.text;
      if (p.text.length > 1000000) p.reject(Error("text output too large"));
    }
    this.finish(t);
  }
  status({ agent, status }) {
    const t = [...this.tasks.values()].find((t) => t.handle.agent === agent);
    if (!t?.pending) return;
    const p = t.pending;
    if (status === "idle") p.idle = true;
    else {
      p.busy = true;
      p.idle = false;
    }
    this.finish(t);
  }
  finish(t) {
    const p = t.pending;
    if (p?.admitted && p.busy && p.ended && p.idle) p.resolve(p.text);
  }
  async release(taskId) {
    const t = this.tasks.get(taskId);
    if (!t) return;
    t.pending?.reject(Error("task closing"));
    await t.handle.agent.cancel({ kind: "user" });
    await t.handle.dispose();
    this.tasks.delete(taskId);
  }
  async close() {
    this.closed = true;
    for (const taskId of [...this.tasks.keys()].reverse())
      await this.release(taskId);
    for (const off of this.listeners) if (typeof off === "function") off();
  }
}
