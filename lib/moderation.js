import { id, hash, canonical, sameK, length, requireThat } from "./util.js";
// These are a first local filter; context remains a model/manual decision.
export const CATEGORIES = [
  "政治与违法信息",
  "色情淫秽与性暗示",
  "血腥惊悚与自杀自残",
  "侵害未成年人",
  "赌博与封建迷信",
  "侮辱诽谤与隐私",
  "低俗诱导打赏",
];
const rules = [
  [/色情|强奸|裸照/u, CATEGORIES[1]],
  [/血腥|自杀|自残/u, CATEGORIES[2]],
  [/未成年.*性/u, CATEGORIES[3]],
  [/赌博|下注|招魂/u, CATEGORIES[4]],
  [/身份证|住址|电话|\b\d{11}\b/u, CATEGORIES[5]],
  [/打赏.*(脱|加分)|送礼.*(复活|上榜)/u, CATEGORIES[6]],
];
export function classify(value) {
  const text =
    typeof value === "string"
      ? value
      : Object.values(value || {})
          .filter((v) => typeof v === "string")
          .join("\n");
  for (const [r, category] of rules)
    if (r.test(text)) return { status: "reject", category };
  if (
    /现实人物|真实姓名|时政|未成年人|忽略规则|执行.*命令|system prompt|<script/iu.test(
      text,
    )
  )
    return { status: "manual", category: "需人工判断" };
  return { status: "manual", category: "上下文待审" };
}
export class Moderation {
  constructor(j, assets) {
    this.j = j;
    this.assets = assets;
    this.pending = new Map();
  }
  active(K) {
    return this.j.isAllowed(K) && sameK(this.j.state.rounds[K.round_id]?.K, K);
  }
  async reviewText(K, content, { alias = "观众", kind = "submission" } = {}) {
    requireThat(this.active(K), "text round unavailable");
    const safe = { ...content };
    if ("nickname" in safe) {
      if (classify(safe.nickname).status === "reject" || !safe.nickname)
        safe.nickname = alias;
      else if (length(safe.nickname) > 12)
        safe.nickname = [
          ...new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(
            safe.nickname,
          ),
        ]
          .slice(0, 12)
          .map((s) => s.segment)
          .join("");
    }
    const decision = classify(safe);
    const rec = {
      id: id(),
      K: { ...K },
      kind,
      version: 1,
      sha256: hash(canonical(safe)),
      approved: false,
      status: decision.status,
      category: decision.category,
    };
    if (rec.status !== "reject")
      this.pending.set(rec.id, { ...rec, content: safe });
    await this.j.commit("text-reviewed", [
      { table: "texts", id: rec.id, value: rec },
    ]);
    return { ...rec, ...(rec.status === "reject" ? {} : { content: safe }) };
  }
  async approveText({ operator, K, id: recordId, sha256, version }) {
    const rec = this.pending.get(recordId) || this.j.state.texts[recordId];
    requireThat(
      operator &&
        rec &&
        this.active(K) &&
        sameK(rec.K, K) &&
        rec.sha256 === sha256 &&
        rec.version === version &&
        rec.status !== "reject" &&
        rec.content,
      "text approval mismatch",
    );
    requireThat(hash(canonical(rec.content)) === sha256, "text changed");
    if (rec.approved) return rec;
    const approved = {
      ...rec,
      approved: true,
      status: "pass",
      operator,
      approved_at: Date.now(),
    };
    await this.j.commit("text-approved", [
      { table: "texts", id: recordId, value: approved },
    ]);
    this.pending.delete(recordId);
    return approved;
  }
  isApprovedText(recordId, sha256) {
    const r = this.j.state.texts[recordId];
    return (
      !!r?.approved &&
      this.active(r.K) &&
      r.sha256 === sha256 &&
      hash(canonical(r.content)) === sha256
    );
  }
  async rewrite(recordId, content) {
    const old = this.pending.get(recordId) || this.j.state.texts[recordId];
    requireThat(old && this.active(old.K), "text unavailable");
    const decision = classify(content);
    const rec = {
      ...old,
      version: old.version + 1,
      content,
      sha256: hash(canonical(content)),
      approved: false,
      status: decision.status,
      category: decision.category,
    };
    this.pending.set(recordId, rec);
    const { content: _, ...metadata } = rec;
    await this.j.commit("text-rewritten", [
      { table: "texts", id: recordId, value: metadata },
    ]);
    return rec;
  }
  async approveAsset({
    operator,
    K,
    id: assetId,
    sha256,
    version,
    all_frames = false,
    loop_seen = false,
  }) {
    const a = this.j.state.assets[assetId];
    requireThat(
      operator &&
        a &&
        this.active(K) &&
        sameK(a.K, K) &&
        a.version === version &&
        a.sha256 === sha256 &&
        a.checked,
      "asset approval mismatch",
    );
    if (a.kind === "gif")
      requireThat(
        all_frames && loop_seen && a.info.contactSheet,
        "GIF all frames and one loop required",
      );
    await this.assets.read(assetId);
    requireThat(this.active(K), "asset revoked");
    const prior = this.j.state.approvals[assetId];
    if (
      prior &&
      sameK(prior.K, K) &&
      prior.sha256 === sha256 &&
      prior.version === version
    )
      return prior;
    const rec = {
      operator,
      K: { ...K },
      id: assetId,
      sha256,
      version,
      all_frames,
      loop_seen,
      time: Date.now(),
    };
    await this.j.commit("asset-approved", [
      { table: "approvals", id: assetId, value: rec },
    ]);
    return rec;
  }
  async rejectAsset(assetId, reason = "人工发现输出违规") {
    const a = this.j.state.assets[assetId];
    requireThat(a, "unknown asset");
    return this.j.revoke(a.K, reason, this.assets.lineage(a.K));
  }
  async moderationBlocked(requestId, error, produced = false) {
    const r = this.j.state.requests[requestId];
    requireThat(r, "unmapped safety event");
    const detail =
      error.moderation_details || error.error?.moderation_details || {};
    const stage = detail.moderation_stage;
    const info = {
      stage: stage || "unknown",
      categories: Array.isArray(detail.categories) ? detail.categories : [],
    };
    if (stage === "input" && !produced) {
      await this.j.commit("input-blocked", [
        {
          table: "results",
          id: requestId,
          value: { K: r.K, status: "input-blocked", ...info },
        },
      ]);
      return "neutral";
    }
    await this.j.revoke(
      r.K,
      `output moderation (${info.stage})`,
      this.assets.lineage(r.K),
    );
    return "revoked";
  }
  async rejectText(recordId) {
    const rec = this.pending.get(recordId) || this.j.state.texts[recordId];
    if (!rec) return;
    const { content, ...metadata } = rec;
    this.pending.delete(recordId);
    await this.j.commit("text-rejected", [
      {
        table: "texts",
        id: recordId,
        value: {
          ...metadata,
          approved: false,
          status: "reject",
          category: "manual/model",
        },
      },
    ]);
  }
  privateTexts() {
    return [
      ...new Map([
        ...Object.values(this.j.state.texts).map((t) => [t.id, t]),
        ...this.pending,
      ]).values(),
    ];
  }
}
