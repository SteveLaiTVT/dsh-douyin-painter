import { id, hash, canonical, sameK, now, requireThat } from "./util.js";
export const CUT_SOURCE =
  "遮罩/撤播未确认，请立即在直播伴侣切断该采集源或切备用安全场景";
export class Publisher {
  constructor({ j, assets, ranking, rounds, clock = now }) {
    Object.assign(this, { j, assets, ranking, rounds, clock });
    this.socket = null;
    this.session = null;
    this.pending = new Map();
    this.rev = Object.keys(j.state.revocations).length;
    this.suppressedAnimations = new Set();
    this.blocked = new Set(Object.keys(j.state.revocations));
    this.resumed = false;
    this.confirmed = false;
    this.warning = "舞台待连接/恢复确认";
    this.lastAck = -Infinity;
    this.lastBeat = -Infinity;
    this.heartSeq = 0;
    this.lastAckSeq = 0;
    this.projection = null;
    this.stopping = false;
  }
  send(m) {
    try {
      this.socket?.send(JSON.stringify(m));
    } catch {
      this.disconnect();
    }
  }
  connect(socket) {
    if (this.socket) this.socket.close();
    this.socket = socket;
    this.session = id();
    this.resumed = false;
    this.confirmed = false;
    this.warning = "待恢复确认";
    this.lastAck = -Infinity;
    this.lastBeat = -Infinity;
    this.heartSeq = 0;
    this.lastAckSeq = 0;
    this.pending.clear();
    this.send({
      type: "hello",
      stage_session_id: this.session,
      revocation_version: this.rev,
      revocations: [...this.blocked],
    });
    return this.session;
  }
  disconnect(session = this.session) {
    if (session !== this.session) return;
    this.socket = null;
    this.resumed = false;
    this.confirmed = false;
    this.warning = CUT_SOURCE;
  }
  command(action, target = null, projection = null, scope = null) {
    const m = {
      type: "command",
      action,
      command_id: id(),
      stage_session_id: this.session,
      target,
      scope,
      revocation_version: this.rev,
      ...(projection ? { projection } : {}),
    };
    this.pending.set(m.command_id, {
      message: m,
      at: this.clock(),
      expired: false,
    });
    this.confirmed = false;
    this.send(m);
    return m;
  }
  mask(target = null) {
    this.resumed = false;
    return this.command("mask", target, null, target ? "round" : "global");
  }
  revoke(K) {
    this.blocked.add(K.round_id);
    this.rev++;
    if (this.projection?.K.round_id === K.round_id) {
      this.projection = null;
      this.resumed = false;
    }
    return this.command("revoke", K);
  }
  build() {
    const r = this.rounds.current;
    if (!r || !this.j.isAllowed(r.K)) return null;
    const ranked = this.ranking.project(
      r.K,
      r.phase === "paused" ? Infinity : this.clock(),
    );
    const candidates = Object.values(this.j.state.assets).filter(
      (a) => sameK(a.K, r.K) && this.assets.canPublish(a.id),
    );
    let asset =
      candidates.filter((a) => a.kind === "still").at(-1) ||
      candidates.filter((a) => a.kind === "partial").at(-1);
    if (["closing", "gif_review"].includes(r.phase)) {
      const gif = candidates
        .filter((a) => a.kind === "gif" && !this.suppressedAnimations.has(a.id))
        .at(-1);
      if (gif && r.phase === "closing") asset = gif;
    }
    return {
      K: { ...r.K },
      phase: r.phase,
      status: r.public_status || "一词成画",
      cards: ranked?.cards || [],
      label: ranked?.label || "本轮创意评选",
      result: ranked?.result || "",
      accepted: r.accepted || 0,
      qualified: r.pool?.length ?? r.pool_count ?? 0,
      not_selected: r.not_selected || 0,
      deadline: r.deadline ?? 0,
      remaining_ms: Math.max(
        0,
        Math.ceil(((r.deadline || 0) - this.clock()) / 1000) * 1000,
      ),
      asset_id: asset?.id ?? null,
      asset_url: asset ? `/asset/${asset.id}` : null,
      asset_kind: asset?.kind ?? null,
      process_label:
        asset?.kind === "partial"
          ? "AI 草图预览 · 已审核"
          : "笔刷演绎 · 等待生成",
      ai_label: "AI 生成内容",
    };
  }
  async publish() {
    const candidate = this.build();
    if (!candidate || this.stopping || !this.j.healthy) return null;
    const signature = hash(canonical(candidate));
    if (signature === this.signature) return this.projection;
    const rev = this.rev;
    await this.j.commit("public-snapshot", [
      {
        table: "results",
        id: "public_snapshot",
        value: { ...candidate, sha256: signature },
      },
    ]);
    if (!this.j.isAllowed(candidate.K) || rev !== this.rev) return null;
    this.signature = signature;
    this.projection = { ...candidate, seq: this.j.seq };
    if (this.resumed)
      this.send({
        type: "projection",
        stage_session_id: this.session,
        revocation_version: this.rev,
        projection: this.projection,
      });
    return this.projection;
  }
  candidate() {
    const p = this.projection;
    if (!p || !this.j.isAllowed(p.K)) return null;
    let value = { ...p };
    if (p.asset_kind === "gif") {
      const a = Object.values(this.j.state.assets).find(
        (a) =>
          sameK(a.K, p.K) && a.kind === "still" && this.assets.canPublish(a.id),
      );
      value = {
        ...value,
        asset_id: a?.id ?? null,
        asset_url: a ? `/asset/${a.id}` : null,
        asset_kind: a ? "still" : null,
        phase: "paused",
        status: "恢复已审核静图",
        process_label: "已审核静图",
      };
    }
    return { ...value, sha256: hash(canonical(value)) };
  }
  async restore({ K, sha256, operator }) {
    const p = this.candidate();
    requireThat(
      this.socket &&
        this.clock() - this.lastAck < 3000 &&
        !this.stopping &&
        p &&
        sameK(p.K, K) &&
        p.sha256 === sha256 &&
        this.j.isAllowed(K),
      "recovery unavailable",
    );
    if (p.asset_id) await this.assets.read(p.asset_id, { public: true, K });
    await this.j.confirmRecovery(K, operator, sha256);
    requireThat(
      this.j.isAllowed(K) && sameK(this.rounds.current?.K, K),
      "round revoked/changed",
    );
    for (const a of Object.values(this.j.state.assets))
      if (sameK(a.K, K) && a.kind === "gif")
        this.suppressedAnimations.add(a.id);
    await this.j.commit("public-restored", [
      { table: "results", id: "public_snapshot", value: p },
    ]);
    requireThat(
      this.j.isAllowed(K) && sameK(this.rounds.current?.K, K),
      "round changed during restore",
    );
    this.projection = p;
    this.signature = null;
    this.resumed = true;
    this.warning = "恢复待应用确认";
    return this.command("restore", K, p);
  }
  receive(m) {
    if (!m || m.stage_session_id !== this.session) return false;
    if (m.type === "heartbeat-ack") {
      const allowed = [
        "type",
        "stage_session_id",
        "seq",
        "projection_seq",
        "revocation_version",
      ];
      if (
        Object.keys(m).some((k) => !allowed.includes(k)) ||
        m.seq <= this.lastAckSeq ||
        m.seq > this.heartSeq ||
        m.revocation_version !== this.rev ||
        !Number.isInteger(m.projection_seq) ||
        m.projection_seq > (this.projection?.seq || 0)
      )
        return false;
      this.lastAckSeq = m.seq;
      this.lastAck = this.clock();
      return true;
    }
    if (
      m.type !== "applied" ||
      Object.keys(m).some(
        (k) =>
          ![
            "type",
            "stage_session_id",
            "command_id",
            "action",
            "target",
            "scope",
            "revocation_version",
            "current_K",
          ].includes(k),
      )
    )
      return false;
    const pending = this.pending.get(m.command_id);
    if (!pending || pending.expired || this.clock() - pending.at >= 1000)
      return false;
    const command = pending.message;
    if (
      m.action !== command.action ||
      canonical(m.target ?? null) !== canonical(command.target) ||
      canonical(m.scope ?? null) !== canonical(command.scope) ||
      m.revocation_version !== command.revocation_version
    )
      return false;
    if (m.action === "restore" && !sameK(m.current_K, command.target))
      return false;
    if (
      m.action === "mask" &&
      command.scope === "global" &&
      m.current_K !== null
    )
      return false;
    if (
      m.action === "revoke" &&
      m.current_K?.round_id === command.target.round_id
    )
      return false;
    this.pending.delete(m.command_id);
    this.confirmed = this.pending.size === 0;
    this.lastAck = this.clock();
    if (this.confirmed)
      this.warning =
        m.action === "restore" ? "恢复成功（采集画面仍需现场核对）" : null;
    return true;
  }
  tick() {
    for (const p of this.pending.values())
      if (this.clock() - p.at >= 1000) {
        p.expired = true;
        this.warning = CUT_SOURCE;
        this.confirmed = false;
      }
    if (this.clock() - this.lastAck >= 3000) {
      this.warning = CUT_SOURCE;
      this.confirmed = false;
    }
    if (
      this.socket &&
      this.j.healthy &&
      !this.stopping &&
      this.clock() - this.lastBeat >= 1000
    ) {
      this.lastBeat = this.clock();
      this.send({
        type: "heartbeat",
        stage_session_id: this.session,
        seq: ++this.heartSeq,
        projection_seq: this.projection?.seq || 0,
        revocation_version: this.rev,
      });
    }
  }
  status() {
    return {
      connected: !!this.socket,
      stage_session_id: this.session,
      last_ack_age: this.clock() - this.lastAck,
      confirmed: this.confirmed,
      warning: this.warning,
      pending: [...this.pending.values()].map((p) => ({
        command_id: p.message.command_id,
        action: p.message.action,
        expired: p.expired,
      })),
      candidate: this.candidate(),
    };
  }
  async close() {
    this.mask();
    this.stopping = true;
    const started = this.clock();
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        if (this.pending.size === 0 || this.clock() - started >= 1000) {
          clearInterval(timer);
          resolve();
        }
      }, 20);
    });
    this.socket?.close();
    this.disconnect();
  }
}
