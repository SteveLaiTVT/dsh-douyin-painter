import { id, sameK, requireThat } from "./util.js";
import { deny } from "./journal.js";
const units = (n) => Math.round(n * 1e6);
export class Budget {
  constructor(journal) {
    this.j = journal;
    this.halted = false;
    this.onStop = () => {};
  }
  async configure(limit) {
    const value =
      typeof limit === "number"
        ? limit
        : typeof limit === "string" && limit.trim()
          ? Number(limit)
          : NaN;
    await this.j.commit("budget-configured", [
      {
        table: "config",
        id: "budget_limit",
        value: Number.isFinite(value) && value > 0 ? units(value) : null,
      },
    ]);
  }
  summary() {
    const records = Object.values(this.j.state.requests);
    const settled = records.reduce((s, r) => s + (r.actual ?? 0), 0),
      reserved = records.reduce(
        (s, r) => s + (r.actual === null ? r.reserved : 0),
        0,
      );
    const limit = this.j.state.config.budget_limit;
    return {
      limit: limit == null ? null : limit / 1e6,
      settled: settled / 1e6,
      reserved: reserved / 1e6,
      pending: records.filter((r) => r.actual === null).length,
      requests: records.length,
      image_requests: records.filter((r) => r.phase !== "text").length,
      stopped:
        this.halted ||
        !this.j.healthy ||
        !this.j.trusted ||
        !limit ||
        settled + reserved >= limit,
      reason: !limit
        ? "单场预算未显式保存"
        : !this.j.trusted
          ? "恢复状态不可信"
          : this.halted
            ? "预算已超限/调度已停止"
            : null,
    };
  }
  async reserve(spec) {
    const request_id = spec.request_id || id();
    await this.j.transact("request-reserved", (s) => {
      if (!this.j.trusted || this.halted || !this.j.isAllowed(spec.K))
        deny("paid scheduling disabled");
      if (s.requests[request_id]) deny("duplicate request");
      if (!(
        Number.isFinite(spec.bound) &&
        spec.bound > 0 &&
        spec.evidence?.verified === true
      ))
        deny("reliable conservative bound required");
      const sum = this.summary();
      const limit = s.config.budget_limit;
      if (
        !limit ||
        units(sum.settled) + units(sum.reserved) + units(spec.bound) > limit
      )
        deny("budget exceeded");
      const images = Object.values(s.requests).filter(
        (r) => r.phase !== "text",
      );
      if (
        spec.phase !== "text" &&
        (images.length >= 9 ||
          images.filter((r) => r.K.round_id === spec.K.round_id).length >= 3)
      )
        deny("request count exceeded");
      return [
        {
          table: "requests",
          id: request_id,
          value: {
            ...spec,
            request_id,
            reserved: units(spec.bound),
            actual: null,
            status: "reserved",
            created_at: Date.now(),
          },
        },
      ];
    });
    return this.j.state.requests[request_id];
  }
  async send(request_id) {
    await this.j.transact("request-sent", (s) => {
      const r = s.requests[request_id];
      if (
        !r ||
        r.status !== "reserved" ||
        this.halted ||
        !this.j.trusted ||
        !this.j.isAllowed(r.K)
      )
        deny("request not sendable");
      const x = this.summary();
      if (units(x.settled) + units(x.reserved) > (s.config.budget_limit || 0))
        deny("budget exceeded");
      return [
        {
          table: "requests",
          id: request_id,
          value: { ...r, status: "sent", sent_at: Date.now() },
        },
      ];
    });
    return this.j.state.requests[request_id];
  }
  async settle(request_id, cost, usage) {
    requireThat(
      Number.isFinite(cost) && cost >= 0,
      "unknown cost retains reservation",
    );
    await this.j.transact("request-settled", (s) => {
      const r = s.requests[request_id];
      if (!r) deny("unknown request");
      if (r.actual !== null) return null;
      return [
        {
          table: "requests",
          id: request_id,
          value: {
            ...r,
            actual: units(cost),
            usage: usage ?? null,
            status: "settled",
          },
        },
      ];
    });
    const sum = this.summary();
    if (
      units(sum.settled) + units(sum.reserved) >
      (this.j.state.config.budget_limit || 0)
    ) {
      this.halted = true;
      this.onStop();
    }
  }
  async unknown(request_id, reason = "结果不明", usage = null) {
    await this.j.transact("request-unknown", (s) => {
      const r = s.requests[request_id];
      if (!r) deny("unknown request");
      return [
        {
          table: "requests",
          id: request_id,
          value: {
            ...r,
            status: r.actual === null ? "unknown" : r.status,
            reason,
            usage,
          },
        },
      ];
    });
  }
  stop() {
    this.halted = true;
    this.onStop();
  }
}
