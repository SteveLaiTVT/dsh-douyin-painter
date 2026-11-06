import { readFile } from "node:fs/promises";
import { LocalServer } from "../lib/server.js";
import { requireThat } from "../lib/util.js";

const pages = new Map([
  ["/", "boss-control.html"], ["/control", "boss-control.html"],
  ["/stage", "boss-stage.html"], ["/boss-control.js", "boss-control.js"],
  ["/boss-stage.js", "boss-stage.js"],
  ["/boss.css", "boss.css"],
]);

export class BossServer extends LocalServer {
  constructor(options) {
    super(options);
    this.settings = options.settings;
    this.updateSettings = options.updateSettings;
    this.origin = "http://127.0.0.1:7321";
    // No login, session, cookie or token file. Source checks still reject remote pages.
    this.auth = {
      source: (headers, write = false) => {
        requireThat(this.ready !== false, "服务正在启动");
        requireThat(headers.host === "127.0.0.1:7321", "本机地址不匹配");
        requireThat(!headers.origin || headers.origin === this.origin, "跨站请求已拒绝");
        requireThat(!headers["sec-fetch-site"] || ["same-origin", "none"].includes(headers["sec-fetch-site"]), "跨站请求已拒绝");
        if (write) requireThat(headers.origin === this.origin, "请从本机控制页操作");
      },
      authorize: () => ({ operator: "本机操作员" }),
      close() {},
    };
  }
  async start() {
    await new Promise((resolve, reject) => {
      this.http.once("error", reject);
      this.http.listen(7321, "127.0.0.1", resolve);
    });
    return this.origin;
  }
  async handle(req, res) {
    try {
      this.auth.source(req.headers, req.method !== "GET");
      if (req.method === "POST") requireThat(req.headers["content-type"]?.split(";")[0].trim() === "application/json", "需要 JSON 请求");
      if (pages.has(req.url)) {
        requireThat(req.method === "GET", "仅支持 GET");
        const file = pages.get(req.url);
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
        res.setHeader("Content-Type", file.endsWith(".html") ? "text/html; charset=utf-8" : file.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8");
        return res.end(await readFile(new URL(`../public/${file}`, import.meta.url)));
      }
      if (req.url === "/api/settings") {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        if (req.method === "GET") return res.end(JSON.stringify(this.settings.view()));
        if (req.method !== "POST") { res.writeHead(405); return res.end(); }
        try { return res.end(JSON.stringify(await this.updateSettings(await this.body(req)))); }
        catch { res.writeHead(400); return res.end(JSON.stringify({ error: "保存失败：预算须为非负数，开关须为布尔值；开启 douyinLive 前请填写直播间标识。请检查 data/settings.json 写入权限。" })); }
      }
      if (["/api/exchange", "/api/logout"].includes(req.url)) {
        res.writeHead(404); return res.end();
      }
      return await super.handle(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(403, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ error: "请求未接受，请核对本机页面、当前轮次、审核期限和预算" }));
    }
  }
}
