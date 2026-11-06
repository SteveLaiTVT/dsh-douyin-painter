import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { Journal } from "../lib/journal.js";
import { RoundEngine } from "../lib/rounds.js";
import { Runtime } from "../lib/runtime.js";
import { loadConfig } from "../lib/config.js";
import { StageState } from "../public/stage-model.js";
import { LocalServer } from "../lib/server.js";
import { Auth } from "../lib/auth.js";
import { imageBytes } from "../lib/openai.js";
import { png, gif } from "./fixtures.js";
const control = await import("../public/control-model.js").catch(() => ({}));
async function runtime() {
  const config = loadConfig(
    {
      runtimeRoot: await mkdtemp(join(tmpdir(), "ac-review-")),
      showId: "s",
      transport: "manual",
    },
    {},
  );
  return Runtime.open(config, {
    autoTick: false,
    serverFactory: () => ({
      start: async () => {},
      close: async () => {},
      auth: { oneTime: "test-only" },
      origin: "http://127.0.0.1:14001",
    }),
    bridge: { close: async () => {} },
  });
}
const op = { operator: "operator" };
test("AC-14/15/55: cancelled or paused collection cannot be reopened by timer or late review", async () => {
  let clock = 0;
  const j = await Journal.open(
    await mkdtemp(join(tmpdir(), "ac-terminal-")),
    "s",
  );
  const r = new RoundEngine(j, { clock: () => clock });
  await r.start();
  await r.cancel();
  clock = 45000;
  await r.tick();
  assert.equal(r.current.phase, "cancelled");
  await r.review([]);
  assert.equal(r.current.phase, "cancelled");
  await r.start();
  await r.quiesce();
  await r.tick();
  assert.equal(r.current.phase, "paused");
  await j.close();
});
test("AC-09: model decisions reversed near pool capacity still adopt earliest ingress in one batch", async () => {
  const r = await runtime();
  await r.command({ action: "start" }, op);
  for (let n = 1; n <= 31; n++) {
    await r.command(
      { action: "manual", text: `画：猫${n}`, viewer_key: `u${n}` },
      op,
    );
    if (n <= 29) {
      const s = r.privateState().submissions.at(-1);
      await r.command(
        {
          action: "review-submission",
          id: s.id,
          status: "pass",
          K: s.K,
          sha256: s.text_review.sha256,
          version: 1,
        },
        op,
      );
    }
  }
  const pending = r.privateState().submissions;
  const first = pending[0].id;
  Object.assign(r.config, {
    toolIsolationVerified: true,
    hostSha: "mock-host",
    textModel: "mock",
    textProvider: "mock",
    costRules: [
      {
        phase: "text",
        task: "review",
        verified: true,
        model: "mock",
        provider: "mock",
        upper_bound_usd: 0.1,
        evidence: "fixture",
        max_input_chars: 10000,
        max_output_tokens: 1000,
        context_token_upper_bound: 100000,
        max_requests_per_task: 1,
      },
    ],
  });
  await r.budget.configure(5);
  r.bridge.run = async (prompt) => ({
    taskId: "test",
    text: JSON.stringify(
      JSON.parse(prompt)
        .items.reverse()
        .map((s) => ({ id: s.id, status: "pass", category: "safe" })),
    ),
  });
  r.scheduleText();
  await r.idle();
  assert.equal(r.rounds.current.pool.at(-1).id, first);
  await r.close();
});
test("AC-14/25/34: committed approval returning late cannot move a newer round to GIF", async () => {
  const r = await runtime();
  await r.command({ action: "start" }, op);
  const K = { ...r.rounds.current.K };
  const a = await r.assets.checked(png(), {
    K,
    kind: "still",
    locked: { size: "1x1" },
  });
  await r.rounds.phase("still_review", { K });
  let finish, committed;
  const gate = new Promise((resolve) => (finish = resolve)),
    done = new Promise((resolve) => (committed = resolve));
  const approve = r.m.approveAsset.bind(r.m);
  r.m.approveAsset = async (input) => {
    const result = await approve(input);
    committed();
    await gate;
    return result;
  };
  const result = r
    .command(
      { action: "approve-asset", K, id: a.id, sha256: a.sha256, version: 1 },
      op,
    )
    .then(
      () => true,
      () => false,
    );
  await done;
  await r.command({ action: "cancel" }, op);
  await r.command({ action: "start" }, op);
  finish();
  assert.equal(await result, false);
  assert.equal(r.rounds.current.phase, "collect");
  await r.close();
});
test("AC-55: GIF recovery authorizes the restored still URL and later ticks cannot replay the old GIF", async () => {
  const r = await runtime();
  await r.command({ action: "start" }, op);
  const K = { ...r.rounds.current.K };
  const still = await r.assets.checked(png(), {
      K,
      kind: "still",
      locked: { size: "1x1" },
    }),
    motion = await r.assets.checked(gif(), {
      K,
      kind: "gif",
      locked: { frame_count: 6, frame_duration_ms: 200 },
    });
  await r.m.approveAsset({
    operator: "op",
    K,
    id: still.id,
    sha256: still.sha256,
    version: 1,
  });
  await r.m.approveAsset({
    operator: "op",
    K,
    id: motion.id,
    sha256: motion.sha256,
    version: 1,
    all_frames: true,
    loop_seen: true,
  });
  await r.rounds.phase("closing", { K });
  await r.publisher.publish();
  const stage = new StageState({ render: async () => {} });
  r.publisher.connect({
    send: (b) =>
      queueMicrotask(async () => {
        const ack = await stage.receive(JSON.parse(b));
        if (ack) r.publisher.receive(ack);
      }),
    close: () => stage.disconnect(),
  });
  r.publisher.tick();
  await new Promise(setImmediate);
  const candidate = r.publisher.candidate();
  await r.publisher.restore({ K, operator: "op", sha256: candidate.sha256 });
  await new Promise(setImmediate);
  assert.equal(r.publisher.projection.asset_id, still.id);
  await r.publisher.publish();
  assert.equal(r.publisher.projection.asset_kind, "still");
  const local = new LocalServer({ assets: r.assets, publisher: r.publisher });
  local.auth = new Auth(14001);
  const req = Readable.from([]);
  Object.assign(req, {
    url: `/asset/${still.id}`,
    method: "GET",
    headers: { host: "127.0.0.1:14001" },
  });
  let status = 200;
  const res = {
    setHeader() {},
    writeHead(n) {
      status = n;
    },
    end() {},
  };
  await local.handle(req, res);
  assert.equal(status, 200);
  await r.close();
});
test("AC-54: safety cut-source instruction survives simultaneous task/budget errors", () => {
  assert.equal(typeof control.warningText, "function");
  const text = control.warningText({
    error: "任务失败",
    stage: {
      warning: "遮罩/撤播未确认，请立即在直播伴侣切断该采集源或切备用安全场景",
    },
    budget: { stopped: true, reason: "预算不足" },
  });
  assert.match(text, /切断.*采集源/);
  assert.match(text, /任务失败/);
});
test("AC-39: realistic multi-MiB base64 file decodes without regular-expression stack overflow", () => {
  const bytes = Buffer.alloc(2 * 1024 * 1024, 0xf9);
  const decoded = imageBytes(bytes.toString("base64"));
  assert.equal(decoded.length, bytes.length);
  assert.deepEqual(decoded, bytes);
});
test("AC-15/45/48: reservation cannot be sent after its ordinary generation was cancelled", async () => {
  const r = await runtime();
  await r.command({ action: "start" }, op);
  await r.budget.configure(5);
  const reservation = await r.budget.reserve({
    K: { ...r.rounds.current.K },
    phase: "text",
    bound: 0.1,
    evidence: { verified: true },
  });
  await r.command({ action: "cancel" }, op);
  await assert.rejects(r.budget.send(reservation.request_id));
  assert.equal(r.budget.summary().reserved, 0.1);
  await r.close();
});
test("AC-47: a positive sub-microdollar conservative bound never rounds down to a free reservation", async () => {
  const r = await runtime();
  await r.command({ action: "start" }, op);
  await r.budget.configure(5);
  const request = await r.budget.reserve({
    K: { ...r.rounds.current.K },
    phase: "text",
    bound: 0.0000004,
    evidence: { verified: true },
  });
  assert.equal(request.reserved, 1);
  await r.close();
});
test("AC-49: explicitly disabling budget cancels already scheduled local paid work", async () => {
  const r = await runtime();
  await r.command({ action: "start" }, op);
  await r.budget.configure(5);
  let stopped = false;
  r.budget.onStop = () => {
    stopped = true;
  };
  await r.budget.configure(0);
  assert.equal(stopped, true);
  await r.close();
});
