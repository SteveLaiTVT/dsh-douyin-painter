import WebSocket from "ws";
import { now, hash, requireThat } from "./util.js";
export class Ingress {
  constructor({ clock = now, roomKey, accept, mode = "ws" }) {
    this.clock = clock;
    this.roomKey = roomKey;
    this.accept = accept;
    this.mode = mode;
    this.seq = 0;
    this.stable = new Set();
    this.recent = new Map();
    this.alias = 0;
    this.closed = false;
  }
  async submit(input, source) {
    if (
      this.closed ||
      source !== this.mode ||
      !["ws", "manual"].includes(source)
    )
      return { status: "inactive" };
    requireThat(
      typeof input.text === "string" && input.text.length <= 4096,
      "invalid comment",
    );
    const received_at = this.clock();
    const text = input.text.trim().replace(/\s+/gu, " ");
    const prefix = `${source}/${this.roomKey}/`;
    const stable =
      input.source_msg_id == null ? null : prefix + String(input.source_msg_id);
    const fallback =
      prefix + (input.viewer_key || "unstable") + "/" + hash(text);
    if (
      stable
        ? this.stable.has(stable)
        : this.recent.has(fallback) &&
          received_at - this.recent.get(fallback) < 3000
    )
      return { status: "duplicate" };
    if (stable) this.stable.add(stable);
    else this.recent.set(fallback, received_at);
    for (const [k, t] of this.recent)
      if (received_at - t >= 3000) this.recent.delete(k);
    const alias = `观众 ${String(++this.alias).padStart(3, "0")}`;
    const event = {
      source,
      room_key: this.roomKey,
      source_msg_id:
        input.source_msg_id == null ? undefined : String(input.source_msg_id),
      viewer_key: input.viewer_key
        ? String(input.viewer_key)
        : `local-${this.alias}`,
      text,
      nickname: typeof input.nickname === "string" ? input.nickname : alias,
      alias,
      identity_unstable: !input.viewer_key,
      received_at,
      ingress_seq: ++this.seq,
      source_time: input.source_time,
    };
    return this.accept(event);
  }
  close() {
    this.closed = true;
  }
}
export class DouyinTransport {
  constructor({
    roomKey,
    ingress,
    onHealth = () => {},
    WebSocketClass = WebSocket,
    random = Math.random,
  }) {
    this.roomKey = roomKey;
    this.ingress = ingress;
    this.onHealth = onHealth;
    this.WS = WebSocketClass;
    this.random = random;
    this.buffer = [];
    this.stats = {
      connected: false,
      live: null,
      dropped: 0,
      invalid: 0,
      reconnects: 0,
      identity_unstable: false,
    };
    this.closed = false;
    this.attempt = 0;
    this.draining = null;
  }
  delay(n) {
    const base = [1000, 2000, 4000, 8000, 30000][Math.min(n, 4)];
    return Math.min(30000, base + Math.floor(base * 0.2 * this.random()));
  }
  report() {
    this.onHealth({ ...this.stats, buffer: this.buffer.length });
  }
  start() {
    if (this.closed) return;
    this.ws = new this.WS(
      `ws://127.0.0.1:1088/ws/${encodeURIComponent(this.roomKey)}`,
      { maxPayload: 1024 * 1024 },
    );
    this.ws.on("open", () => {
      this.attempt = 0;
      this.stats.connected = true;
      this.report();
    });
    this.ws.on("message", (data) => {
      this.enqueue(data);
      queueMicrotask(() => this.drain());
    });
    this.ws.on("error", () => {
      this.stats.error = "本地弹幕连接异常";
      this.report();
    });
    this.ws.on("close", () => {
      this.stats.connected = false;
      this.report();
      if (!this.closed) {
        this.stats.reconnects++;
        this.timer = setTimeout(() => this.start(), this.delay(this.attempt++));
      }
    });
  }
  enqueue(data) {
    if (this.closed) return;
    if (this.buffer.length >= 200) {
      this.stats.dropped++;
      this.stats.congested = true;
      this.report();
      return;
    }
    this.buffer.push(data);
  }
  async drain() {
    if (this.draining) return this.draining;
    this.draining = (async () => {
      while (this.buffer.length && !this.closed)
        await this.handle(this.buffer.shift());
    })();
    try {
      await this.draining;
    } finally {
      this.draining = null;
    }
  }
  parse(raw) {
    if (
      raw.type === "room_status" ||
      raw.type === "status" ||
      typeof raw.live === "boolean"
    ) {
      if (typeof raw.live === "boolean") this.stats.live = raw.live;
      this.report();
      return null;
    }
    const method = raw.method || raw.data?.method;
    if (method !== "WebcastChatMessage") return null;
    const d = raw.data?.data || raw.data || raw;
    const user = d.user || {};
    if (typeof (d.content ?? d.text) !== "string")
      throw Error("malformed chat");
    return {
      text: d.content ?? d.text,
      source_msg_id:
        d.common?.msgId ?? d.common?.msg_id ?? d.msg_id ?? d.message_id,
      viewer_key: user.idStr ?? user.id_str ?? user.id ?? d.user_id,
      nickname: user.nickName ?? user.nickname ?? d.nickname,
      source_time: d.common?.createTime ?? d.create_time,
    };
  }
  async handle(bytes) {
    try {
      const obj =
        typeof bytes === "object" && !Buffer.isBuffer(bytes)
          ? bytes
          : JSON.parse(String(bytes));
      const input = this.parse(obj);
      if (input) {
        this.stats.identity_unstable = !input.viewer_key;
        await this.ingress.submit(input, "ws");
      }
    } catch {
      this.stats.invalid++;
      this.stats.error = "异常包已丢弃（详情不公开）";
      this.report();
    }
  }
  async close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.buffer.length = 0;
    this.ws?.terminate();
    await this.draining;
  }
}
