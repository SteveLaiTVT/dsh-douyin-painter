import { warningText } from "./control-model.js";
const $ = (id) => document.getElementById(id);
let session = null,
  state = null,
  lastResponse = 0,
  working = false,
  scoreKey = "",
  assetKey = "",
  previewUrls = [];
const cut = "遮罩/撤播未确认，请立即在直播伴侣切断该采集源或切备用安全场景";
const node = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
async function api(path, body) {
  const headers = {};
  if (session) headers.Authorization = `Bearer ${session.token}`;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    if (session) headers["X-CSRF-Token"] = session.csrf;
  }
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok)
    throw Error("操作未被接受：请核对本轮状态、期限、哈希、权限与预算");
  return r.json();
}
async function command(input) {
  try {
    await api("/api/command", input);
    await poll();
  } catch (e) {
    $("warning").textContent = e.message;
  }
}
$("login").onsubmit = async (e) => {
  e.preventDefault();
  try {
    session = await api("/api/exchange", { token: $("token").value });
    $("token").value = "";
    $("login").hidden = true;
    $("console").hidden = false;
    await poll();
  } catch (e) {
    $("warning").textContent = e.message;
  }
};
document.querySelector("nav").addEventListener("click", async (e) => {
  const action = e.target.dataset.action;
  if (!action) return;
  if (action === "logout") {
    try {
      await api("/api/logout", {});
    } finally {
      session = null;
      state = null;
      clearPreviews();
      $("console").hidden = true;
      $("login").hidden = false;
      $("warning").textContent = "会话已注销";
    }
    return;
  }
  const candidate = state?.stage?.candidate;
  if (action === "restore" || action === "replay") {
    if (!candidate) {
      $("warning").textContent =
        "没有有效已审恢复候选，请保持安全画面或另开新轮";
      return;
    }
    if (
      !confirm(
        `核对恢复：轮次 ${candidate.K.round_id} / 代次 ${candidate.K.generation}\n哈希 ${candidate.sha256}\n素材 ${candidate.asset_id || "中性画面"}\n请先核对预览、恢复依据和真实采集画面。`,
      )
    )
      return;
    await command({ action, K: candidate.K, sha256: candidate.sha256 });
  } else await command({ action });
});
document.querySelectorAll("button[data-action]").forEach((button) => {
  if (button.closest("nav")) return;
  button.onclick = async () => {
    const action = button.dataset.action;
    if (action === "publish-ranking") {
      const rank = state?.ranking,
        text = state?.texts.find((t) => t.id === rank?.text_id);
      if (!text) return;
      $("warning").textContent = "请核对当前理由、画面说明与文字哈希";
      await command({
        action,
        K: state.K,
        id: text.id,
        sha256: text.sha256,
        version: text.version,
      });
    } else await command({ action });
  };
});
$("budget-form").onsubmit = (e) => {
  e.preventDefault();
  void command({ action: "budget", limit: $("budget-limit").value });
};
$("mode").onclick = () =>
  command({
    action: "mode",
    mode: state?.transport.mode === "manual" ? "ws" : "manual",
  });
$("manual").onsubmit = (e) => {
  e.preventDefault();
  void command({
    action: "manual",
    text: $("comment").value,
    viewer_key: $("viewer").value || undefined,
    nickname: $("nickname").value || undefined,
  });
  $("comment").value = "";
};
$("rank").onclick = () => {
  const scores = [...$("scores").querySelectorAll(".score-row")].map((row) => ({
    id: row.dataset.id,
    visual: Number(row.querySelector("[name=visual]").value),
    surprise: Number(row.querySelector("[name=surprise]").value),
    motion: Number(row.querySelector("[name=motion]").value),
    reason: row.querySelector("textarea").value,
  }));
  void command({ action: "rank-manual", scores, prompt: $("prompt").value });
};
function renderSubmissions() {
  const root = $("submissions");
  root.replaceChildren();
  for (const s of state.submissions) {
    const card = node("article", undefined, "review-card"),
      t = s.text_review;
    card.append(
      node("h3", s.text),
      node(
        "p",
        `昵称预览：${t?.content?.nickname || s.alias} · ${s.source === "manual" ? "主播代录" : "WS"}${s.identity_unstable ? " · 身份不稳定" : ""}`,
      ),
      node("p", `轮次 ${s.K.round_id} / 代次 ${s.K.generation}`),
      node("code", t?.sha256 || "检查中"),
    );
    for (const [status, label] of [
      ["pass", "通过"],
      ["reject", "拒绝"],
    ]) {
      const button = node("button", label);
      button.disabled = !t;
      button.onclick = () =>
        command({
          action: "review-submission",
          id: s.id,
          K: s.K,
          sha256: t.sha256,
          version: t.version,
          status,
        });
      card.append(button);
    }
    root.append(card);
  }
}
function renderScores() {
  const frozen = state.frozen;
  if (!frozen) {
    if (scoreKey) {
      $("scores").replaceChildren();
      scoreKey = "";
    }
    return;
  }
  if (scoreKey === frozen.sha256) return;
  scoreKey = frozen.sha256;
  $("scores").replaceChildren();
  for (const c of frozen.snapshot.candidates) {
    const row = node("div", undefined, "score-row");
    row.dataset.id = c.id;
    row.append(node("strong", `${c.nickname} · ${c.text}`));
    for (const [name, label] of [
      ["visual", "画面感"],
      ["surprise", "意外组合"],
      ["motion", "适合动起来"],
    ]) {
      const l = node("label", label),
        input = node("input");
      Object.assign(input, {
        type: "number",
        name,
        min: "0",
        max: "5",
        step: "1",
        required: true,
        value: "0",
      });
      l.append(input);
      row.append(l);
    }
    const reason = node("textarea");
    reason.placeholder = "一句可播理由，22–36个可见字符";
    row.append(reason);
    $("scores").append(row);
  }
}
function clearPreviews() {
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls = [];
  for (const image of $("assets").querySelectorAll("img")) {
    image.onload = null;
    image.removeAttribute("src");
  }
}
async function preview(id, image, key) {
  try {
    const r = await fetch(`/api/preview/${id}`, {
      headers: { Authorization: `Bearer ${session.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) throw Error("素材字节变化/预览不可用");
    const blob = await r.blob();
    if (assetKey !== key || !session) return;
    const url = URL.createObjectURL(blob);
    previewUrls.push(url);
    image.src = url;
  } catch (e) {
    $("warning").textContent = e.message;
  }
}
function renderAssets() {
  const key = JSON.stringify(
    state.assets.map((a) => [a.id, a.sha256, a.approved]),
  );
  if (key === assetKey) return;
  assetKey = key;
  clearPreviews();
  $("assets").replaceChildren();
  const lastGif = state.assets.filter((a) => a.kind === "gif").at(-1)?.id;
  for (const a of state.assets) {
    if (a.kind === "gif" && a.id !== lastGif) continue;
    const card = node("article", undefined, "review-card"),
      image = node("img");
    card.append(
      node("h3", `${a.kind} · ${a.approved ? "已批准" : "待审批"}`),
      node(
        "p",
        `轮次 ${a.K.round_id} / 代次 ${a.K.generation} / 版本 ${a.version}`,
      ),
      node("code", a.sha256),
      image,
    );
    void preview(a.id, image, key);
    let allFrames, loopSeen;
    if (a.kind === "gif") {
      card.append(
        node(
          "p",
          `实际 ${a.info.frames} 帧 · ${a.info.width}×${a.info.height} · 一圈 ${a.info.durations.reduce((a, b) => a + b, 0)}ms`,
        ),
      );
      const sheet = node("img");
      sheet.src = a.info.contactSheet;
      sheet.alt = "同一份检查文件的全部合成帧联系表";
      card.append(sheet);
      for (const [name, label] of [
        ["all", "已逐帧检查完整联系表"],
        ["loop", "已看过至少一次完整循环"],
      ]) {
        const l = node("label", label),
          check = node("input");
        check.type = "checkbox";
        l.prepend(check);
        card.append(l);
        if (name === "all") allFrames = check;
        else loopSeen = check;
      }
    }
    const approve = node("button", "通过"),
      reject = node("button", "拒绝（输出违规，整轮撤播）"),
      mask = node("button", "紧急遮罩");
    mask.className = "danger";
    approve.onclick = () =>
      command({
        action: "approve-asset",
        K: a.K,
        id: a.id,
        sha256: a.sha256,
        version: a.version,
        all_frames: allFrames?.checked || false,
        loop_seen: loopSeen?.checked || false,
      });
    reject.onclick = () =>
      command({
        action: "reject-asset",
        K: a.K,
        id: a.id,
        sha256: a.sha256,
        version: a.version,
      });
    mask.onclick = () => command({ action: "mask" });
    card.append(approve, reject, mask);
    $("assets").append(card);
  }
}
async function poll() {
  if (!session || working) return;
  working = true;
  try {
    state = await api("/api/state");
    lastResponse = performance.now();
    $("status").textContent = JSON.stringify(
      {
        K: state.K,
        round: state.round,
        transport: state.transport,
        image: state.image_status,
      },
      null,
      2,
    );
    $("recovery").textContent = JSON.stringify(
      { recovery: state.recovery, stage: state.stage, host: state.host },
      null,
      2,
    );
    $("budget").textContent = JSON.stringify(state.budget, null, 2);
    $("audit").textContent = JSON.stringify(
      { requests: state.requests, ranking: state.ranking },
      null,
      2,
    );
    $("warning").textContent = warningText(state);
    $("ranking").replaceChildren();
    if (state.ranking) {
      $("ranking").append(
        node(
          "pre",
          JSON.stringify(
            {
              K: state.K,
              version: state.ranking.version,
              prompt: state.ranking.prompt,
              ranked: state.ranking.ranked,
              text_hash: state.ranking.text_hash,
            },
            null,
            2,
          ),
        ),
      );
    }
    renderSubmissions();
    renderScores();
    renderAssets();
  } catch {
    $("warning").textContent = `控制窗与后端断连；${cut}`;
  } finally {
    working = false;
  }
}
setInterval(poll, 1000);
setInterval(() => {
  if (session && performance.now() - lastResponse >= 3000)
    $("warning").textContent = `控制状态不明；${cut}`;
  else if (session && state?.stage.last_ack_age >= 3000)
    $("warning").textContent = cut;
}, 100);
window.addEventListener("pagehide", clearPreviews);

$("cost-form").onsubmit = (e) => {
  e.preventDefault();
  void command({
    action: "settle-cost",
    request_id: $("cost-request").value,
    cost: Number($("cost-value").value),
    evidence: $("cost-evidence").value,
  });
};
