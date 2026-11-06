import { join, resolve } from "node:path";
import { Runtime } from "../lib/runtime.js";
import { loadConfig } from "../lib/config.js";
import { Journal } from "../lib/journal.js";
import { Budget } from "../lib/budget.js";
import { RoundEngine } from "../lib/rounds.js";
import { AssetStore } from "../lib/assets.js";
import { Moderation } from "../lib/moderation.js";
import { Ranking } from "../lib/ranking.js";
import { Images } from "../lib/images.js";
import { Ingress } from "../lib/transport.js";
import { sameK, requireThat } from "../lib/util.js";
import { BossServer } from "./http.js";
import { BossPublisher } from "./publisher.js";
import { MockImages } from "./mock.js";
import { Settings } from "./settings.js";
import { OpenAIImages } from "../lib/openai.js";
import { TaskQueue } from "../lib/queue.js";

export class StandaloneHost extends Runtime {
  static async open(input = {}, options = {}) {
    const host = new StandaloneHost(input, options);
    try { await host.init(); return host; }
    catch (e) {
      clearInterval(host.timer);
      await host.server?.close().catch(() => {});
      await host.images?.close().catch(() => {});
      await host.j?.close({ quiescent: true }).catch(() => {});
      throw e;
    }
  }
  constructor({ dataRoot = resolve("data"), showId = "boss" } = {}, options = {}) {
    const config = loadConfig({ runtimeRoot: join(dataRoot, "runtime"), showId, transport: "manual", budgetLimit: 5 }, {});
    config.gifModel = config.stillModel;
    config.mock = true;
    super(config, { ...options, serverFactory: (opts) => new BossServer(opts) });
    this.dataRoot = dataRoot;
    this.listen = options.listen !== false;
    this.settingsQueue = new TaskQueue(32);
  }
  async init() {
    const c = this.config;
    // Acquire the port before touching the show journal: duplicate launch must not
    // turn a running show's recovery witness into a second writer's state.
    this.server = this.serverFactory({ state: () => this.privateState(), command: (input) => this.command(input), updateSettings: (patch) => this.updateSettings(patch) });
    this.server.ready = false;
    if (this.listen) await this.server.start();
    this.settings = await Settings.open(this.dataRoot);
    c.roomKey = this.settings.current.roomKey;
    c.transport = this.settings.current.douyinLive ? "ws" : "manual";
    c.mock = !this.settings.current.apiKey;
    this.j = await Journal.open(join(c.runtimeRoot, "shows", c.showId), c.showId);
    this.budget = new Budget(this.j);
    await this.budget.configure(this.settings.current.budgetUsd);
    this.rounds = new RoundEngine(this.j, { clock: this.clock });
    this.assets = new AssetStore(this.j);
    this.m = new Moderation(this.j, this.assets);
    this.ranking = new Ranking(this.j, this.m, { clock: this.clock });
    this.images = new Images({ j: this.j, rounds: this.rounds, assets: this.assets, moderation: this.m, budget: this.budget, api: c.mock ? new MockImages() : new OpenAIImages({ apiKey: this.settings.current.apiKey }), config: c, clock: this.clock });
    this.configureImagePaths();
    this.publisher = new BossPublisher({ j: this.j, assets: this.assets, ranking: this.ranking, rounds: this.rounds, clock: this.clock });
    this.j.onSafety = ({ K }) => { this.publisher.revoke(K); void this.images.cancel(K); };
    this.j.onFailure = () => { this.error = "持久化未确认；停止发布/付费，请切备用安全场景"; this.publisher.mask(); this.budget.stop(); };
    this.budget.onStop = () => { void this.images.cancel(); };
    this.ingress = new Ingress({ clock: this.clock, roomKey: c.roomKey, mode: c.transport, accept: (e) => this.admit(e) });
    const old = this.j.state.results.public_snapshot;
    const r = old && this.j.state.rounds[old.K.round_id];
    if (old && r && this.j.isAllowed(old.K) && sameK(r.K, old.K)) {
      this.rounds.current = { ...r, K: { ...r.K }, phase: "paused", phase_start: this.clock(), deadline: 0, pool: [], pending: new Map(), attempts: new Map(), tasks: {}, used: new Set(), plannedT1: 0 };
      this.publisher.projection = { ...old, seq: this.j.seq, phase: "paused", status: "待恢复确认" };
    }
    Object.assign(this.server, { assets: this.assets, publisher: this.publisher, settings: this.settings, ready: true });
    if (c.transport === "ws" && c.roomKey) this.startTransport();
    if (this.autoTick) this.timer = setInterval(() => { void this.tick().catch(() => { this.error = "状态推进失败，保持安全"; this.publisher.mask(); }); }, 100);
  }
  configureImagePaths() {
    const c = this.config;
    c.project = "";
    c.verifiedPaths = ["still", "gif"].map((phase) => ({ phase, model: c[`${phase}Model`], project: "", endpoint: "generations", verified: true }));
    for (const p of c.verifiedPaths) p.signature = this.images.signature(p.phase);
    c.costRules = ["still", "gif"].flatMap((phase) => [6, 4].map((frames) => ({ signature: this.images.signature(phase, frames), verified: true, upper_bound_usd: c.mock ? .000001 : 1, max_prompt_chars: 500, max_image_bytes: 20 * 1024 * 1024, evidence: c.mock ? "本地 MOCK，完成后按零费用结算" : "独立版固定参数单次预留 $1，实际费用待账单核对" })));
    const gifRetry = { ...c.verifiedPaths[1], signature: this.images.signature("gif", 4) };
    c.verifiedPaths.push(gifRetry);
  }
  privateState() {
    return { ...super.privateState(), standalone: true, settings: this.settings.view(), generation: { mock: this.j.state.config[`demo:${this.rounds.current?.K.round_id}`] ?? this.config.mock, nextRoundMock: !this.settings.current.apiKey }, candidates: this.rounds.current?.pool || [] };
  }
  updateSettings(patch) {
    requireThat(!this.closing, "服务正在关闭");
    return this.settingsQueue.push(async () => {
      const previous = this.settings.current;
      await this.settings.save(patch);
      const s = this.settings.current;
      await this.budget.configure(s.budgetUsd);
      if (s.roomKey !== previous.roomKey || s.douyinLive !== previous.douyinLive) {
        await this.transport?.close();
        this.transport = null;
        this.health = { connected: false, live: null };
        this.config.roomKey = s.roomKey; this.ingress.roomKey = s.roomKey;
        this.config.transport = this.ingress.mode = s.douyinLive ? "ws" : "manual";
        if (s.douyinLive) this.startTransport();
      }
      return { ...this.settings.view(), restartRequired: false, keyApplies: "next-round" };
    });
  }
  async command(input, session = { operator: "本机操作员" }) {
    if (input.action === "stop-rank") {
      requireThat(this.rounds.current?.phase === "collect" && !this.privateState().submissions.length, "先完成待审投稿，再停收评选");
      await super.command({ action: "stop" }, session);
      return super.command({ ...input, action: "rank-manual" }, session);
    }
    const result = await super.command(input, session);
    if (input.action === "start") {
      this.config.mock = !this.settings.current.apiKey;
      this.images.api = this.config.mock ? new MockImages() : new OpenAIImages({ apiKey: this.settings.current.apiKey });
      this.configureImagePaths();
      await this.j.commit("standalone-round-mode", [{ table: "config", id: `demo:${this.rounds.current.K.round_id}`, value: this.config.mock }]);
      await this.publisher.publish();
    }
    return result;
  }
  async generate(K, phase, options) {
    const mock = this.j.state.config[`demo:${K.round_id}`] !== false;
    try { return await super.generate(K, phase, options); }
    finally {
      if (mock) for (const r of Object.values(this.j.state.requests))
        if (sameK(r.K, K) && r.phase === phase && r.actual === null) await this.budget.settle(r.request_id, 0, { source: "本地 MOCK，无网络调用" });
    }
  }
  async close() {
    this.closing = true;
    await this.settingsQueue.close();
    return super.close();
  }
}
