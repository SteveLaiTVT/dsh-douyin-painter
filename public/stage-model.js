// Browser-owned lease. The renderer must finish before returning an applied receipt.
const same = (a, b) =>
  a &&
  b &&
  a.show_id === b.show_id &&
  a.round_id === b.round_id &&
  a.generation === b.generation;
export class StageState {
  constructor({
    clock = () => performance.now(),
    render = async () => {},
  } = {}) {
    this.clock = clock;
    this.render = render;
    this.safe = true;
    this.projection = null;
    this.session = null;
    this.lastHeartbeat = -Infinity;
    this.heartbeatSeq = 0;
    this.projectionSeq = 0;
    this.rev = 0;
    this.blocked = new Set();
    this.commands = new Set();
    this.epoch = 0;
  }
  isCurrent(epoch) {
    return !this.safe && this.epoch === epoch;
  }
  clear() {
    this.safe = true;
    this.projection = null;
    this.epoch++;
    void this.render(null, this.epoch);
  }
  disconnect() {
    this.clear();
    this.session = null;
    this.lastHeartbeat = -Infinity;
  }
  async tick() {
    if (this.clock() - this.lastHeartbeat >= 3000 && !this.safe) this.clear();
  }
  async receive(m) {
    if (m.type === "hello") {
      this.clear();
      this.session = m.stage_session_id;
      this.rev = m.revocation_version;
      this.blocked = new Set(m.revocations);
      this.heartbeatSeq = 0;
      this.projectionSeq = 0;
      this.commands.clear();
      return null;
    }
    if (!this.session || m.stage_session_id !== this.session) return null;
    if (m.type === "heartbeat") {
      if (
        !Number.isInteger(m.seq) ||
        m.seq <= this.heartbeatSeq ||
        m.revocation_version !== this.rev ||
        m.projection_seq < this.projectionSeq
      )
        return null;
      this.heartbeatSeq = m.seq;
      this.lastHeartbeat = this.clock();
      return {
        type: "heartbeat-ack",
        stage_session_id: this.session,
        seq: m.seq,
        projection_seq: this.projectionSeq,
        revocation_version: this.rev,
      };
    }
    if (m.type === "projection") {
      if (
        this.safe ||
        m.revocation_version !== this.rev ||
        m.projection.seq <= this.projectionSeq ||
        this.blocked.has(m.projection.K.round_id)
      )
        return null;
      this.projection = m.projection;
      this.projectionSeq = m.projection.seq;
      this.epoch++;
      await this.render(this.projection, this.epoch);
      return null;
    }
    if (
      m.type !== "command" ||
      typeof m.command_id !== "string" ||
      this.commands.has(m.command_id) ||
      m.revocation_version < this.rev ||
      !["mask", "revoke", "restore"].includes(m.action)
    )
      return null;
    this.commands.add(m.command_id);
    this.rev = m.revocation_version;
    if (m.action === "revoke") {
      this.blocked.add(m.target.round_id);
      if (this.projection?.K.round_id === m.target.round_id) this.clear();
    } else if (m.action === "mask") {
      if (
        m.scope === "global" ||
        this.projection?.K.round_id === m.target?.round_id
      )
        this.clear();
    } else {
      if (
        !m.projection ||
        !same(m.projection.K, m.target) ||
        this.blocked.has(m.target.round_id) ||
        m.projection.seq < this.projectionSeq
      )
        return null;
      this.safe = false;
      this.projection = m.projection;
      this.projectionSeq = m.projection.seq;
      this.epoch++;
    }
    // Even a revoke of an old round awaits a frame and reports the actual current K.
    await this.render(this.safe ? null : this.projection, this.epoch);
    return {
      type: "applied",
      stage_session_id: this.session,
      command_id: m.command_id,
      action: m.action,
      target: m.target ?? null,
      scope: m.scope ?? null,
      revocation_version: this.rev,
      current_K: this.projection?.K ?? null,
    };
  }
}
