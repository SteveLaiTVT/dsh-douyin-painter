import { TIMINGS } from "./config.js";
import { TaskQueue } from "./queue.js";
import {
  id,
  hash,
  canonical,
  sameK,
  now,
  length,
  requireThat,
} from "./util.js";
export { TIMINGS };
export class RoundEngine {
  constructor(j, { clock = now } = {}) {
    this.j = j;
    this.clock = clock;
    this.queue = new TaskQueue(500);
    this.current = null;
    this.onChange = () => {};
    this.stopped = false;
  }
  async save(type) {
    const r = this.current;
    const value = {
      K: r.K,
      T0: r.T0,
      T1: r.T1,
      T2: r.T2,
      phase: r.phase,
      phase_start: r.phase_start,
      deadline: r.deadline,
      accepted: r.accepted,
      pool_count: r.pool.length,
      not_selected: r.not_selected,
      tasks: r.tasks,
      public_status: r.public_status,
    };
    await this.j.commit(type, [{ table: "rounds", id: r.K.round_id, value }]);
    this.onChange();
  }
  start() {
    return this.queue.push(async () => {
      requireThat(
        !this.stopped &&
          (!this.current ||
            ["closed", "empty", "cancelled", "no_result", "paused"].includes(
              this.current.phase,
            )),
        "round still active",
      );
      const T0 = this.clock();
      this.current = {
        K: { show_id: this.j.showId, round_id: id(), generation: 1 },
        T0,
        T1: null,
        T2: null,
        plannedT1: T0 + TIMINGS.collect,
        phase: "collect",
        phase_start: T0,
        deadline: T0 + TIMINGS.collect,
        accepted: 0,
        not_selected: 0,
        attempts: new Map(),
        pending: new Map(),
        pool: [],
        tasks: {},
        used: new Set(),
        public_status: "收词中",
      };
      await this.save("round-started");
      return this.current.K;
    });
  }
  receive(e) {
    return this.queue.push(async () => {
      const r = this.current;
      if (
        !r ||
        this.stopped ||
        r.phase !== "collect" ||
        e.received_at < r.T0 ||
        e.received_at >= Math.min(r.plannedT1, r.T1 ?? Infinity)
      )
        return { status: "closed" };
      const m = e.text.match(/^画[：:]\s*([\s\S]*)$/u);
      const text = m?.[1].trim().replace(/\s+/gu, " ");
      if (!text || length(text) > 40) return { status: "format" };
      const user = r.attempts.get(e.viewer_key);
      if (user?.locked) return { status: "locked" };
      if (user && e.received_at - user.last < 10000)
        return { status: "cooldown" };
      if (user?.count >= 3) return { status: "attempts" };
      if (r.accepted >= 60 || r.pending.size >= 60 || r.pool.length >= 30)
        return { status: "full" };
      const submission = {
        id: id(),
        K: { ...r.K },
        text,
        nickname: e.nickname,
        alias: e.alias,
        viewer_key: e.viewer_key,
        source: e.source,
        identity_unstable: e.identity_unstable,
        received_at: e.received_at,
        ingress_seq: e.ingress_seq,
        status: "pending",
      };
      r.attempts.set(e.viewer_key, {
        count: (user?.count || 0) + 1,
        last: e.received_at,
        locked: false,
      });
      r.pending.set(submission.id, submission);
      r.accepted++;
      await this.save("submission-admitted");
      return { ...submission };
    });
  }
  batch() {
    if (
      !this.current ||
      this.current.pool.length >= 30 ||
      this.current.T2 !== null
    )
      return [];
    return [...this.current.pending.values()]
      .filter((x) => x.status === "pending")
      .sort((a, b) => a.ingress_seq - b.ingress_seq || a.id.localeCompare(b.id))
      .slice(0, 10);
  }
  review(results) {
    return this.queue.push(async () => {
      const r = this.current;
      if (!r) return;
      const registered = this.clock();
      if (registered >= r.plannedT1 && r.T1 === null) {
        r.T1 = r.plannedT1;
        r.phase = "drain";
      }
      const D = r.T1 === null ? Infinity : r.T1 + TIMINGS.drain;
      for (const result of [...results].sort(
        (a, b) =>
          (r.pending.get(a.id)?.ingress_seq ?? Infinity) -
            (r.pending.get(b.id)?.ingress_seq ?? Infinity) ||
          a.id.localeCompare(b.id),
      )) {
        const s = r.pending.get(result.id);
        if (!s || s.status !== "pending") continue;
        if (r.T2 !== null || registered >= D) {
          s.status = "timeout";
          r.not_selected++;
          continue;
        }
        if (result.status !== "pass") {
          s.status = "rejected";
          r.not_selected++;
          await this.j.commit("submission-rejected", [
            {
              table: "results",
              id: s.id,
              value: {
                K: s.K,
                sha256: hash(s.text),
                category: result.category || "manual",
                status: "rejected",
              },
            },
          ]);
          continue;
        }
        const text = this.j.state.texts[result.text_id];
        if (
          !text?.approved ||
          !sameK(text.K, r.K) ||
          text.sha256 !== hash(canonical(text.content)) ||
          text.content.text !== s.text
        )
          continue;
        const user = r.attempts.get(s.viewer_key);
        if (r.pool.length >= 30 || user.locked) {
          s.status = "full";
          r.not_selected++;
          continue;
        }
        s.status = "qualified";
        user.locked = true;
        r.pool.push({
          id: s.id,
          text: text.content.text,
          nickname: text.content.nickname,
          text_hash: text.sha256,
          text_id: text.id,
          ingress_seq: s.ingress_seq,
          source: s.source,
        });
      }
      if (r.pool.length >= 30)
        for (const s of r.pending.values())
          if (s.status === "pending") {
            s.status = "full";
            r.not_selected++;
          }
      if (
        r.T1 !== null &&
        (registered >= D ||
          ![...r.pending.values()].some((x) => x.status === "pending"))
      )
        await this.freeze(registered >= D ? D : registered);
      else await this.save("reviews-registered");
    });
  }
  async freeze(at) {
    const r = this.current;
    if (r.T2 !== null) return;
    r.T2 = at;
    for (const s of r.pending.values())
      if (s.status === "pending") {
        s.status = "timeout";
        r.not_selected++;
      }
    r.pool.sort(
      (a, b) => a.ingress_seq - b.ingress_seq || a.id.localeCompare(b.id),
    );
    const snapshot = {
      show_id: r.K.show_id,
      round_id: r.K.round_id,
      generation: r.K.generation,
      T0: r.T0,
      T1: r.T1,
      T2: r.T2,
      rules_version: "1.3",
      candidates: structuredClone(r.pool),
    };
    await this.j.commit("candidates-frozen", [
      {
        table: "frozen",
        id: r.K.round_id,
        value: { K: { ...r.K }, snapshot, sha256: hash(canonical(snapshot)) },
      },
    ]);
    r.phase = r.pool.length ? "rank" : "empty";
    r.phase_start = at;
    r.deadline = at + (r.pool.length ? TIMINGS.rank : 0);
    r.public_status = r.pool.length ? "正在选出本轮灵感" : "本轮没有可用投稿";
    await this.save("round-frozen");
  }
  stop() {
    return this.queue.push(async () => {
      const r = this.current;
      requireThat(r?.phase === "collect", "not collecting");
      r.T1 = Math.min(this.clock(), r.plannedT1);
      r.phase = "drain";
      r.deadline = r.T1 + TIMINGS.drain;
      r.public_status = "已停止收词，正在整理本轮投稿";
      if (![...r.pending.values()].some((x) => x.status === "pending"))
        await this.freeze(r.T1);
      else await this.save("collection-stopped");
    });
  }
  resumeCollecting() {
    return Promise.reject(
      Error("start a new round; closed window is immutable"),
    );
  }
  tick() {
    return this.queue.push(async () => {
      const r = this.current;
      if (!r) return;
      const at = this.clock();
      if (r.T1 === null && at >= r.plannedT1) {
        r.T1 = r.plannedT1;
        r.phase = "drain";
        r.deadline = r.T1 + TIMINGS.drain;
        r.public_status = "已停止收词，正在整理本轮投稿";
        await this.save("collection-stopped");
      }
      if (
        r.phase === "drain" &&
        (at >= r.T1 + TIMINGS.drain ||
          ![...r.pending.values()].some((s) => s.status === "pending"))
      )
        await this.freeze(Math.min(at, r.T1 + TIMINGS.drain));
      else if (
        r.deadline &&
        at >= r.deadline &&
        ["rank", "still_review", "gif_review"].includes(r.phase)
      ) {
        r.public_status = "审核/评选到限，未发布";
        r.phase = r.phase === "rank" ? "no_result" : "closing";
        r.phase_start = at;
        r.deadline = at + TIMINGS.closing;
        await this.save("stage-expired");
      } else if (r.phase === "closing" && at >= r.deadline) {
        r.phase = "closed";
        await this.save("round-closed");
      }
    });
  }
  phase(name) {
    return this.queue.push(async () => {
      const r = this.current;
      requireThat(r && this.j.isAllowed(r.K), "round forbidden");
      r.phase = name;
      r.public_status =
        {
          reveal: "本轮创意评选 · 揭榜",
          still: "正在生成静图",
          still_review: "静图终审中",
          gif: "正在制作收尾动图",
          gif_review: "动图全帧终审中",
          closing: "本轮收尾",
          paused: "待恢复确认",
        }[name] || r.public_status;
      r.phase_start = this.clock();
      r.deadline = r.phase_start + (TIMINGS[name] || 0);
      await this.save("phase-changed");
    });
  }
  task(phase, attempt) {
    return this.queue.push(async () => {
      const r = this.current;
      requireThat(
        r && this.j.isAllowed(r.K) && !this.stopped,
        "round forbidden",
      );
      const task = { K: { ...r.K }, phase, attempt, task_id: id() };
      r.tasks[phase] = task;
      if (r.phase !== phase) {
        r.phase = phase;
        r.phase_start = this.clock();
        r.deadline = r.phase_start + (TIMINGS[phase] || 0);
      }
      await this.save("task-registered");
      return task;
    });
  }
  accept(task) {
    return this.queue.push(async () => {
      const r = this.current;
      if (
        this.stopped ||
        !r ||
        !this.j.isAllowed(task.K) ||
        !sameK(r.K, task.K) ||
        r.phase !== task.phase ||
        r.tasks[task.phase]?.task_id !== task.task_id ||
        r.tasks[task.phase]?.attempt !== task.attempt ||
        r.used.has(task.task_id)
      )
        return false;
      r.used.add(task.task_id);
      await this.j.commit("task-adopted", [
        {
          table: "results",
          id: task.task_id,
          value: { ...task, adopted: true },
        },
      ]);
      return true;
    });
  }
  cancel() {
    return this.queue.push(async () => {
      const r = this.current;
      if (!r) return;
      r.K = { ...r.K, generation: r.K.generation + 1 };
      r.phase = "cancelled";
      r.public_status = "本轮已取消";
      await this.save("round-cancelled");
    });
  }
  async quiesce() {
    await this.queue.idle();
    if (this.current) {
      this.current.tasks = {};
      this.current.phase = "paused";
      this.current.deadline = 0;
      await this.save("round-quiescent");
    }
    this.stopped = true;
  }
  async close() {
    this.stopped = true;
    await this.queue.idle();
  }
}
