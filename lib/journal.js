import {
  mkdir,
  open,
  readFile,
  rename,
  chmod,
  readdir,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { hash, canonical, id, requireThat } from "./util.js";
import { TaskQueue } from "./queue.js";
const tables = [
  "rounds",
  "frozen",
  "rankings",
  "assets",
  "texts",
  "approvals",
  "requests",
  "revocations",
  "confirmations",
  "results",
  "config",
];
const empty = () => Object.fromEntries(tables.map((t) => [t, {}]));
export class Journal {
  static async open(root, showId, options = {}) {
    const j = new Journal(root, showId, options);
    await j.init();
    return j;
  }
  constructor(root, showId, { fault = () => {} } = {}) {
    this.root = root;
    this.showId = showId;
    this.fault = fault;
    this.queue = new TaskQueue(1000);
    this.state = empty();
    this.seq = 0;
    this.digest = "0".repeat(64);
    this.barriers = [];
    this.pending = new Set();
    this.isolated = new Set();
    this.healthy = true;
    this.trusted = false;
    this.closed = false;
    this.onSafety = () => {};
    this.onFailure = () => {};
  }
  async atomic(name, value, point = name) {
    this.fault(`${point}:write`);
    const tmp = join(this.root, `.${name}.${id()}.tmp`);
    const f = await open(tmp, "wx", 0o600);
    try {
      await f.writeFile(canonical(value));
      this.fault(`${point}:fsync`);
      await f.sync();
    } finally {
      await f.close();
    }
    await rename(tmp, join(this.root, name));
    await this.syncDir();
  }
  async syncDir() {
    const d = await open(this.root, "r");
    try {
      await d.sync();
    } finally {
      await d.close();
    }
  }
  async append(name, value, point) {
    this.fault(`${point}:write`);
    const f = await open(join(this.root, name), "a", 0o600);
    try {
      await f.writeFile(canonical(value) + "\n");
      this.fault(`${point}:fsync`);
      await f.sync();
    } finally {
      await f.close();
    }
    await this.syncDir();
  }
  async json(name) {
    return JSON.parse(await readFile(join(this.root, name), "utf8"));
  }
  async init() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await chmod(this.root, 0o700);
    let witness,
      lines = "",
      barrierText = "",
      fresh = false,
      bad = false;
    try {
      witness = await this.json("recovery.json");
    } catch (e) {
      if (e.code !== "ENOENT") bad = true;
    }
    try {
      lines = await readFile(join(this.root, "events.jsonl"), "utf8");
    } catch (e) {
      if (e.code !== "ENOENT") bad = true;
    }
    try {
      barrierText = await readFile(
        join(this.root, "revocation-barriers.jsonl"),
        "utf8",
      );
    } catch (e) {
      if (e.code !== "ENOENT") bad = true;
    }
    const existing = (await readdir(this.root)).filter(
      (n) => !n.startsWith("."),
    );
    fresh = !witness && !lines && !barrierText && !bad && existing.length === 0;
    if (!fresh && !witness && !lines && !barrierText) bad = true;
    this.isolated = new Set(witness?.isolated || []);
    try {
      for (const line of lines.split("\n").filter(Boolean)) {
        const event = JSON.parse(line);
        const { digest, ...base } = event;
        requireThat(
          event.seq === this.seq + 1 &&
            event.prev === this.digest &&
            hash(canonical(base)) === digest,
          "damaged journal",
        );
        this.apply(event.patches);
        this.seq = event.seq;
        this.digest = digest;
        this.lastEventRun = event.run_id;
      }
      for (const line of barrierText.split("\n").filter(Boolean))
        this.barriers.push(JSON.parse(line));
    } catch {
      bad = true;
    }
    const closed = new Set(
      this.barriers.filter((b) => b.kind === "close").map((b) => b.barrier_id),
    );
    const intents = this.barriers.filter((b) => b.kind === "intent");
    const unclosed = intents.some((b) => !closed.has(b.barrier_id));
    if (!fresh) {
      for (const name of [
        "revocations.json",
        "budget.json",
        "requests.json",
        "state.json",
      ]) {
        try {
          const x = await this.json(name);
          requireThat(
            x.seq === this.seq && x.digest === this.digest,
            "stale index",
          );
          const data =
            name === "state.json"
              ? this.state
              : name === "budget.json"
                ? this.budgetProjection()
                : this.state[
                    name === "requests.json" ? "requests" : "revocations"
                  ];
          requireThat(canonical(x.data) === canonical(data), "index mismatch");
        } catch {
          bad = true;
        }
      }
    }
    this.trusted =
      fresh ||
      (!bad &&
        !unclosed &&
        witness?.status === "clean-shutdown" &&
        witness.seq === this.seq &&
        witness.digest === this.digest &&
        witness.barrier_count === this.barriers.length &&
        witness.barrier_hash === hash(canonical(this.barriers)) &&
        (!this.seq || witness.run_id === this.lastEventRun) &&
        witness.state_hash === hash(canonical(this.state)));
    if (!this.trusted) {
      for (const round of Object.keys(this.state.rounds))
        this.isolated.add(round);
      for (const t of ["assets", "approvals", "frozen"])
        for (const v of Object.values(this.state[t]))
          if (v.K) this.isolated.add(v.K.round_id);
    }
    this.runId = id();
    this.recoveryReason = this.trusted
      ? null
      : "untrusted exit/barrier/index; old snapshots quarantined";
    // Quarantine and running are one durable replacement, before any business interface.
    await this.atomic(
      "recovery.json",
      this.witness("running"),
      "recovery:running",
    );
    if (bad) {
      this.healthy = false;
      return;
    }
    // Every readable intent means permanent revocation, including a missing close.
    for (const b of intents) {
      if (!this.state.revocations[b.K.round_id])
        await this.commit("revoked", [
          {
            table: "revocations",
            id: b.K.round_id,
            value: { ...b, permanent: true },
          },
        ]);
      if (!closed.has(b.barrier_id)) {
        await this.append(
          "revocation-barriers.jsonl",
          {
            kind: "close",
            barrier_id: b.barrier_id,
            seq: this.seq,
            digest: this.digest,
          },
          "barrier:replay",
        );
        this.barriers.push({ kind: "close", barrier_id: b.barrier_id });
      }
    }
    if (fresh) {
      const f = await open(join(this.root, "events.jsonl"), "wx", 0o600);
      await f.sync();
      await f.close();
      await this.syncDir();
      const parent = await open(dirname(this.root), "r");
      await parent.sync();
      await parent.close();
      await this.checkpoint();
    }
    await this.commit("run-started", []);
  }
  witness(status) {
    return {
      version: 1,
      show_id: this.showId,
      run_id: this.runId,
      status,
      seq: this.seq,
      digest: this.digest,
      state_hash: hash(canonical(this.state)),
      barrier_count: this.barriers.length,
      barrier_hash: hash(canonical(this.barriers)),
      isolated: [...this.isolated],
      reason: this.recoveryReason,
    };
  }
  apply(patches) {
    for (const p of patches) {
      requireThat(tables.includes(p.table), "unknown state table");
      this.state[p.table][p.id] = structuredClone(p.value);
    }
  }
  budgetProjection() {
    return {
      limit: this.state.config.budget_limit ?? null,
      requests: this.state.requests,
    };
  }
  async checkpoint() {
    for (const [name, data] of Object.entries({
      "state.json": this.state,
      "leaderboard.json": this.state.rankings,
      "requests.json": this.state.requests,
      "budget.json": this.budgetProjection(),
      "revocations.json": this.state.revocations,
    }))
      await this.atomic(
        name,
        { seq: this.seq, digest: this.digest, data },
        `index:${name.split(".")[0]}`,
      );
  }
  transact(type, decide, { priority = false } = {}) {
    return this.queue.push(
      async () => {
        requireThat(this.healthy && !this.closed, "persistence unavailable");
        try {
          const patches = decide(this.state);
          if (patches === null) return null;
          const base = {
            seq: this.seq + 1,
            run_id: this.runId,
            type,
            patches,
            prev: this.digest,
          };
          const event = { ...base, digest: hash(canonical(base)) };
          await this.append("events.jsonl", event, `event:${type}`);
          this.apply(patches);
          this.seq = event.seq;
          this.digest = event.digest;
          await this.checkpoint();
          return event;
        } catch (e) {
          if (!e.business) {
            this.healthy = false;
            this.onFailure(e);
          }
          throw e;
        }
      },
      { priority },
    );
  }
  commit(type, patches, options) {
    return this.transact(type, () => patches, options);
  }
  isAllowed(K) {
    return (
      !!K &&
      K.show_id === this.showId &&
      !this.pending.has(K.round_id) &&
      !this.state.revocations[K.round_id] &&
      !this.isolated.has(K.round_id) &&
      this.healthy &&
      !this.closed
    );
  }
  revoke(K, reason, lineage = []) {
    requireThat(K?.show_id === this.showId, "unknown source show");
    this.pending.add(K.round_id);
    this.onSafety({ K, reason, lineage });
    return this.queue.push(
      async () => {
        try {
          requireThat(this.healthy && !this.closed, "persistence unavailable");
          if (this.state.revocations[K.round_id]) {
            this.pending.delete(K.round_id);
            return this.state.revocations[K.round_id];
          }
          const b = {
            kind: "intent",
            barrier_id: id(),
            run_id: this.runId,
            K,
            scope: {
              show_id: K.show_id,
              round_id: K.round_id,
              all_generations: true,
            },
            reason,
            lineage,
            no_artifacts: lineage.length === 0,
            revocation_seq: this.seq + 1,
          };
          await this.append("revocation-barriers.jsonl", b, "barrier:intent");
          this.barriers.push(b);
          // In the same writer; never recursively enqueue while holding it.
          const base = {
            seq: this.seq + 1,
            run_id: this.runId,
            type: "revoked",
            patches: [
              {
                table: "revocations",
                id: K.round_id,
                value: { ...b, permanent: true },
              },
            ],
            prev: this.digest,
          };
          const event = { ...base, digest: hash(canonical(base)) };
          await this.append("events.jsonl", event, "event:revoked");
          this.apply(event.patches);
          this.seq = event.seq;
          this.digest = event.digest;
          await this.checkpoint();
          const close = {
            kind: "close",
            barrier_id: b.barrier_id,
            seq: this.seq,
            digest: this.digest,
          };
          await this.append(
            "revocation-barriers.jsonl",
            close,
            "barrier:close",
          );
          this.barriers.push(close);
          this.pending.delete(K.round_id);
          return event;
        } catch (e) {
          this.healthy = false;
          this.onFailure(e);
          throw e;
        }
      },
      { priority: true },
    );
  }
  async confirmRecovery(K, operator, snapshotHash) {
    requireThat(
      this.isAllowed(K) && operator && snapshotHash,
      "recovery forbidden",
    );
    return this.commit("recovery-confirmed", [
      {
        table: "confirmations",
        id: K.round_id,
        value: { K, operator, snapshotHash, run_id: this.runId },
      },
    ]);
  }
  async close({ quiescent = true } = {}) {
    await this.queue.idle();
    requireThat(!this.closed, "already closed");
    if (!quiescent || !this.healthy || this.pending.size) return false;
    await this.checkpoint();
    await this.atomic(
      "recovery.json",
      this.witness("clean-shutdown"),
      "recovery:clean",
    );
    this.closed = true;
    return true;
  }
}
export function deny(message) {
  const e = Error(message);
  e.business = true;
  throw e;
}
