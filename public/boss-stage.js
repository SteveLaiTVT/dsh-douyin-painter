import { StageState } from "./stage-model.js";
const scene = document.getElementById("scene"), badge = document.getElementById("demo-badge");
let socket, reconnect, images = [];
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const model = new StageState({ render: async (p, epoch) => {
  for (const img of images) { img.onload = null; img.removeAttribute("src"); }
  images = []; scene.replaceChildren();
  if (!p) { const safe = el("div", undefined, "safe"); safe.append(el("span", "一词成画"), el("h1", "安全待机"), el("p", "等待操作员确认")); scene.append(safe); await frame(); return; }
  badge.textContent = p.demo !== false ? "MOCK 演示 · 非真实 AI 出图" : "OpenAI 生成 · 已审核";
  const layout = el("div", undefined, "stage-layout"), canvas = el("section", undefined, "canvas"), cards = el("aside", undefined, "cards");
  canvas.append(el("div", p.status, "phase"));
  if (p.asset_url && /^\/asset\/[a-f0-9-]{36}$/.test(p.asset_url)) {
    const img = el("img"); img.alt = p.demo ? "已审核 MOCK 演示画面" : "已审核 AI 画作";
    img.onload = () => { if (!model.isCurrent(epoch)) { img.removeAttribute("src"); img.remove(); } };
    img.src = p.asset_url; images.push(img); canvas.append(img);
  } else canvas.append(el("div", "一词成画", "neutral-brush"));
  canvas.append(el("p", p.asset_kind === "gif" ? "已审核收尾动图" : p.process_label, "process-label"));
  cards.append(el("h2", p.label));
  for (const c of p.cards || []) { const card = el("article"); card.append(el("div", `第 ${c.rank} 名 · ${c.nickname}`), el("h3", c.text), el("p", c.reason), el("small", c.source)); cards.append(card); }
  layout.append(canvas, cards); scene.append(layout);
  const footer = el("footer", p.phase === "collect" ? `发「画：提示词」· 1–40字 · ${Math.ceil(p.remaining_ms / 1000)}秒` : p.result || "画面由 AI 生成，过程含演绎动画");
  footer.append(el("span", `已收 ${p.accepted} · 入池 ${p.qualified} · 未参评 ${p.not_selected}`)); scene.append(footer); await frame();
} });
function connect() {
  socket = new WebSocket(`${location.origin.replace("http", "ws")}/stage-ws`);
  socket.onmessage = async (e) => { try { const ack = await model.receive(JSON.parse(e.data)); if (ack && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(ack)); } catch { model.disconnect(); socket.close(); } };
  socket.onclose = () => { model.disconnect(); clearTimeout(reconnect); reconnect = setTimeout(connect, 1000); };
  socket.onerror = () => model.disconnect();
}
setInterval(() => model.tick(), 100);
window.addEventListener("pagehide", () => { clearTimeout(reconnect); model.disconnect(); socket?.close(); });
connect();
