import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { TaskQueue } from "../lib/queue.js";
import { requireThat } from "../lib/util.js";

const defaults = { apiKey: "", budgetUsd: 5, roomKey: "", douyinLive: false };
function validate(value) {
  requireThat(value && typeof value === "object" && !Array.isArray(value), "设置应为 JSON 对象");
  requireThat(Object.keys(value).every((k) => Object.hasOwn(defaults, k)), "未知设置字段");
  const s = { ...defaults, ...value };
  requireThat(typeof s.apiKey === "string" && s.apiKey.length <= 512 && !/[\r\n]/.test(s.apiKey), "API Key 格式不正确");
  requireThat(typeof s.budgetUsd === "number" && Number.isFinite(s.budgetUsd) && s.budgetUsd >= 0 && s.budgetUsd <= 1000000, "预算应为 0–1000000 的美元数值");
  requireThat(typeof s.roomKey === "string" && s.roomKey.length <= 200 && !/[\x00-\x1f]/.test(s.roomKey), "直播间标识过长或包含控制字符");
  requireThat(typeof s.douyinLive === "boolean", "douyinLive 应为开关值");
  s.apiKey = s.apiKey.trim(); s.roomKey = s.roomKey.trim();
  requireThat(!s.douyinLive || s.roomKey, "开启 douyinLive 前请填写直播间标识");
  return s;
}

export class Settings {
  static async open(root) {
    const settings = new Settings(root);
    await mkdir(root, { recursive: true, mode: 0o700 });
    try { settings.current = validate(JSON.parse(await readFile(settings.file, "utf8"))); }
    catch (e) { if (e.code !== "ENOENT") throw Error("无法读取 data/settings.json；请检查格式（不要公开文件中的 key）"); await settings.save({}); }
    return settings;
  }
  constructor(root) {
    this.root = root; this.file = join(root, "settings.json");
    this.current = { ...defaults }; this.queue = new TaskQueue(32);
  }
  view() {
    const { apiKey, ...publicSettings } = this.current;
    return { ...publicSettings, apiKeyConfigured: !!apiKey };
  }
  save(patch) {
    return this.queue.push(async () => {
      requireThat(patch && typeof patch === "object" && !Array.isArray(patch), "设置应为 JSON 对象");
      const value = validate({ ...this.current, ...patch });
      const tmp = join(this.root, `.settings-${randomUUID()}.tmp`);
      try {
        const f = await open(tmp, "wx", 0o600);
        try { await f.writeFile(JSON.stringify(value, null, 2) + "\n"); await f.sync(); } finally { await f.close(); }
        await rename(tmp, this.file);
        const dir = await open(this.root, "r");
        try { await dir.sync(); } finally { await dir.close(); }
        this.current = value;
      } finally { await unlink(tmp).catch(() => {}); }
      return this.view();
    });
  }
}
