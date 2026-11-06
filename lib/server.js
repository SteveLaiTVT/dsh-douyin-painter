import http from "node:http";
import { readFile } from "node:fs/promises";
import { WebSocketServer } from "ws";
import { Auth } from "./auth.js";
import { requireThat } from "./util.js";
const shells = new Map([
  ["/", "stage.html"],
  ["/stage", "stage.html"],
  ["/control", "control.html"],
  ["/stage.js", "stage.js"],
  ["/stage-model.js", "stage-model.js"],
  ["/control.js", "control.js"],
  ["/app.css", "app.css"],
]);
export class LocalServer {
  constructor({ state, command, assets, publisher }) {
    Object.assign(this, { state, command, assets, publisher });
    this.http = http.createServer((req, res) => this.handle(req, res));
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
    this.http.on("upgrade", (req, socket, head) => {
      try {
        this.auth.source(req.headers, true);
        requireThat(req.url === "/stage-ws", "forbidden");
        this.wss.handleUpgrade(req, socket, head, (ws) => {
          const session = this.publisher.connect(ws);
          ws.on("message", (b) => {
            try {
              this.publisher.receive(JSON.parse(String(b)));
            } catch {
              ws.close(1008, "invalid receipt");
            }
          });
          ws.on("close", () => this.publisher.disconnect(session));
          ws.on("error", () => this.publisher.disconnect(session));
        });
      } catch {
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      }
    });
  }
  async start() {
    await new Promise((resolve, reject) => {
      this.http.once("error", reject);
      this.http.listen(0, "127.0.0.1", resolve);
    });
    const port = this.http.address().port;
    requireThat(port !== 1088, "dynamic port collision");
    this.auth = new Auth(port);
    this.origin = this.auth.origin;
    return this.origin;
  }
  async body(req) {
    const buffers = [];
    let n = 0;
    for await (const b of req) {
      n += b.length;
      requireThat(n <= 1024 * 1024, "request too large");
      buffers.push(b);
    }
    return JSON.parse(Buffer.concat(buffers).toString("utf8"));
  }
  async handle(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    const json = (status, value) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(value));
    };
    try {
      requireThat(this.auth, "not started");
      this.auth.source(req.headers, req.method !== "GET");
      const path = req.url;
      requireThat(!path.includes("?"), "queries not accepted");
      if (shells.has(path)) {
        if (req.method !== "GET") return json(405, { error: "method" });
        const file = shells.get(path);
        res.setHeader(
          "Content-Type",
          file.endsWith(".html")
            ? "text/html; charset=utf-8"
            : file.endsWith(".css")
              ? "text/css; charset=utf-8"
              : "text/javascript; charset=utf-8",
        );
        res.end(await readFile(new URL(`../public/${file}`, import.meta.url)));
        return;
      }
      if (path === "/api/exchange") {
        if (req.method !== "POST") return json(405, { error: "method" });
        const { token } = await this.body(req);
        const s = this.auth.exchange(req.headers, token);
        res.setHeader("Set-Cookie", s.cookie);
        const { cookie, ...session } = s;
        return json(200, session);
      }
      if (path === "/api/state") {
        if (req.method !== "GET") return json(405, { error: "method" });
        this.auth.authorize(req.headers, "GET");
        return json(200, this.state());
      }
      if (path === "/api/command" || path === "/api/logout") {
        if (req.method !== "POST") return json(405, { error: "method" });
        const s = this.auth.authorize(req.headers, "POST");
        if (path === "/api/logout") {
          this.auth.logout(req.headers);
          return json(200, { ok: true });
        }
        const input = await this.body(req);
        return json(200, await this.command(input, s));
      }
      const preview = path.match(/^\/api\/preview\/([a-f0-9-]{36})$/);
      if (preview) {
        if (req.method !== "GET") return json(405, { error: "method" });
        this.auth.authorize(req.headers, "GET");
        const bytes = await this.assets.read(preview[1]);
        res.setHeader(
          "Content-Type",
          bytes.subarray(0, 3).toString() === "GIF" ? "image/gif" : "image/png",
        );
        res.end(bytes);
        return;
      }
      const asset = path.match(/^\/asset\/([a-f0-9-]{36})$/);
      if (asset) {
        if (req.method !== "GET") return json(405, { error: "method" });
        requireThat(
          this.publisher.resumed &&
            this.publisher.projection?.asset_id === asset[1],
          "not current public asset",
        );
        const bytes = await this.assets.read(asset[1], {
          public: true,
          K: this.publisher.projection.K,
        });
        res.setHeader(
          "Content-Type",
          bytes.subarray(0, 3).toString() === "GIF" ? "image/gif" : "image/png",
        );
        res.end(bytes);
        return;
      }
      return json(404, { error: "not found" });
    } catch {
      return json(403, { error: "request rejected" });
    }
  }
  async close() {
    this.auth?.close();
    for (const ws of this.wss.clients) ws.terminate();
    this.wss.close();
    this.http.closeAllConnections();
    await new Promise((resolve) => this.http.close(resolve));
  }
}
