import { Publisher } from "../lib/publisher.js";

export class BossPublisher extends Publisher {
  build() {
    const p = super.build();
    if (!p) return p;
    const demo = this.j.state.config[`demo:${p.K.round_id}`] !== false;
    return { ...p, demo, mode_label: demo ? "MOCK 演示 · 非真实 AI 出图" : "OpenAI 生成 · 已审核后展示" };
  }
}
