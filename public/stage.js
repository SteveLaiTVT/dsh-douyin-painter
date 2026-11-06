import { StageState } from "./stage-model.js";
const scene = document.getElementById("scene");
let socket,
  reconnect,
  images = [];
const frame = () =>
  new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
const el = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
const model = new StageState({
  render: async (projection, epoch) => {
    for (const image of images) {
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("src");
    }
    images = [];
    scene.replaceChildren();
    if (!projection) {
      const safe = el("div", undefined, "safe");
      safe.append(
        el("span", "一词成画"),
        el("h1", "安全待机"),
        el("p", "等待操作员确认"),
      );
      scene.append(safe);
      await frame();
      return;
    }
    const p = projection,
      layout = el("div", undefined, "stage-layout"),
      canvas = el("section", undefined, "canvas"),
      aside = el("aside", undefined, "cards");
    canvas.append(el("div", p.status, "phase"));
    if (p.asset_url && /^\/asset\/[a-f0-9-]{36}$/.test(p.asset_url)) {
      const image = el("img");
      image.alt = "已审核 AI 画作";
      image.onload = () => {
        if (!model.isCurrent(epoch)) {
          image.removeAttribute("src");
          image.remove();
        }
      };
      image.src = p.asset_url;
      images.push(image);
      canvas.append(image);
    } else {
      const art = el("div", undefined, "neutral-brush");
      art.append(el("span", "一词成画"));
      canvas.append(art);
    }
    canvas.append(
      el(
        "p",
        p.asset_kind === "gif" ? "已审核收尾动图" : p.process_label,
        "process-label",
      ),
    );
    aside.append(el("h2", p.label));
    for (const card of p.cards || []) {
      const section = el("article");
      section.append(
        el("div", `第 ${card.rank} 名 · ${card.nickname}`),
        el("h3", card.text),
        el("p", card.reason),
        el("small", card.source),
      );
      aside.append(section);
    }
    layout.append(canvas, aside);
    scene.append(layout);
    const footer = el("footer");
    if (p.phase === "collect")
      footer.textContent = `发「画：提示词」· 1–40 字 · 前30条通过审核者参评，已入池每人一条 · ${Math.ceil(p.remaining_ms / 1000)} 秒`;
    else footer.textContent = p.result || "画面由 AI 生成，过程含演绎动画";
    footer.append(
      el(
        "span",
        `已收 ${p.accepted} · 入池 ${p.qualified} · 未参评 ${p.not_selected}`,
      ),
    );
    scene.append(footer);
    await frame();
  },
});
function connect() {
  socket = new WebSocket(`${location.origin.replace("http", "ws")}/stage-ws`);
  socket.onmessage = async (event) => {
    try {
      const ack = await model.receive(JSON.parse(event.data));
      if (ack && socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify(ack));
    } catch {
      model.disconnect();
      socket.close();
    }
  };
  socket.onclose = () => {
    model.disconnect();
    clearTimeout(reconnect);
    reconnect = setTimeout(connect, 1000);
  };
  socket.onerror = () => model.disconnect();
}
setInterval(() => model.tick(), 100);
window.addEventListener("pagehide", () => {
  clearTimeout(reconnect);
  model.disconnect();
  socket?.close();
});
connect();
