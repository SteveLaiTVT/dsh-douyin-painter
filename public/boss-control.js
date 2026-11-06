import { warningText } from "./control-model.js";
const $ = (id) => document.getElementById(id);
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
const phases = { collect: "收词中", drain: "待审收尾", rank: "评选待确认", reveal: "揭榜中", still: "正在出静图", still_review: "静图待审", gif: "正在出 GIF", gif_review: "GIF 待审", closing: "本轮收尾", closed: "本轮结束", cancelled: "已取消", empty: "没有合格投稿", no_result: "评选超时", paused: "待恢复确认" };
let state, polling = false, settingsLoaded = false, scoreRound = "", assetKey = "";
async function api(path, body) {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) {
    const detail = await r.json().catch(() => ({}));
    throw Error(detail.error || "操作未接受，请核对当前轮次、审核期限和预算");
  }
  return r.json();
}
async function command(input) {
  try { const result = await api("/api/command", input); await poll(); return result; }
  catch (e) { $("notice").textContent = e.message; return null; }
}
function fillSettings(s) {
  $("budget-usd").value = s.budgetUsd;
  $("room-key").value = s.roomKey;
  $("douyin-live").checked = s.douyinLive;
  $("api-key").value = "";
  $("api-key").placeholder = s.apiKeyConfigured ? "已保存；留空保留现有 Key" : "留空可先跑 MOCK 演示";
  $("key-status").textContent = s.apiKeyConfigured ? "已保存 Key；下一轮使用 OpenAI。" : "未保存 Key；下一轮为 MOCK 演示，不调用 OpenAI。";
}
async function saveSettings(patch) {
  try {
    fillSettings(await api("/api/settings", patch));
    $("notice").textContent = "设置已保存。预算和接入立即生效，Key 在下一轮生效；无需重启。";
    await poll();
  } catch (e) { $("notice").textContent = e.message; }
}
$("settings").onsubmit = (e) => {
  e.preventDefault();
  const patch = { budgetUsd: Number($("budget-usd").value), roomKey: $("room-key").value, douyinLive: $("douyin-live").checked };
  if ($("api-key").value) patch.apiKey = $("api-key").value;
  void saveSettings(patch);
};
$("clear-key").onclick = () => saveSettings({ apiKey: "" });
document.querySelector("nav").onclick = (e) => {
  const action = e.target.dataset.action;
  if (!action) return;
  $("notice").textContent = "";
  if (action === "restore") {
    const p = state?.stage.candidate;
    if (!p) { $("notice").textContent = "当前没有可恢复的已审画面。"; return; }
    void command({ action, K: p.K, sha256: p.sha256 });
  } else void command({ action });
};
$("manual").onsubmit = async (e) => {
  e.preventDefault();
  const result = await command({ action: "manual", text: $("comment").value, viewer_key: $("viewer").value || undefined, nickname: $("nickname").value || undefined });
  if (!result) return;
  $("notice").textContent = result.status === "pending" ? "已收到，等待人工审词。" : `本次未入池：${({ closed: "请先开轮", format: "请用画：加1–40字提示词", duplicate: "重复投稿", cooldown: "同一观众10秒内只能投稿一次", locked: "该观众已入池", full: "本轮已满" })[result.status] || result.status}`;
  if (result.status === "pending") $("comment").value = "";
};
function renderSubmissions() {
  $("pending-count").textContent = `· ${state.submissions.length} 条待审`;
  const root = $("submissions"); root.replaceChildren();
  for (const s of state.submissions.slice(0, 10)) {
    const card = el("article", undefined, "review-card"), text = s.text_review;
    card.append(el("h3", s.text), el("p", `昵称：${text?.content?.nickname || s.alias} · ${s.source === "manual" ? "主播代录" : "douyinLive"}`));
    for (const [status, label] of [["pass", "通过，加入候选"], ["reject", "拒绝"]]) {
      const button = el("button", label); button.disabled = !text;
      button.onclick = () => command({ action: "review-submission", K: s.K, id: s.id, sha256: text.sha256, version: text.version, status }); card.append(button);
    }
    root.append(card);
  }
}
function renderScores() {
  const round = state.K?.round_id || "";
  if (scoreRound !== round) { $("scores").replaceChildren(); $("prompt").value = ""; scoreRound = round; }
  const candidates = state.frozen?.snapshot.candidates || state.candidates;
  for (const c of candidates) {
    if ([...$("scores").children].some((row) => row.dataset.id === c.id)) continue;
    const row = el("div", undefined, "score-row"); row.dataset.id = c.id; row.dataset.text = c.text;
    row.append(el("strong", `${c.nickname} · ${c.text}`));
    for (const [name, label] of [["visual", "画面感"], ["surprise", "意外组合"], ["motion", "适合动起来"]]) {
      const l = el("label", label), input = el("input");
      Object.assign(input, { type: "number", name, min: "0", max: "5", step: "1", value: "3", required: true }); l.append(input); row.append(l);
    }
    const reason = el("textarea"); reason.value = "把熟悉的小动物送入幻想场景，轻柔的动作也让画面充满故事感。"; reason.setAttribute("aria-label", "本条投稿的可播理由，22–36字"); row.append(reason); $("scores").append(row);
  }
  $("rank").disabled = !candidates.length || state.submissions.length > 0 || !["collect", "rank"].includes(state.round?.phase);
  $("rank").textContent = state.round?.phase === "rank" ? "重新提交全量评分" : "停收并提交全量评分";
}
$("rank").onclick = () => {
  const rows = [...$("scores").children];
  const scores = rows.map((row) => ({ id: row.dataset.id, visual: Number(row.querySelector("[name=visual]").value), surprise: Number(row.querySelector("[name=surprise]").value), motion: Number(row.querySelector("[name=motion]").value), reason: row.querySelector("textarea").value }));
  const best = scores.map((s, i) => ({ s, i, total: s.visual * 8 + s.surprise * 7 + s.motion * 5 })).sort((a, b) => b.total - a.total || a.i - b.i)[0];
  void command({ action: state.round?.phase === "collect" ? "stop-rank" : "rank-manual", scores, prompt: $("prompt").value.trim() || rows[best?.i]?.dataset.text, reason: "主播在控制页确认全量评分" });
};
function renderRanking() {
  $("ranking").replaceChildren();
  const rank = state.ranking;
  $("publish-ranking").disabled = !rank || rank.approved || state.round?.phase !== "rank";
  if (!rank) return;
  $("ranking").append(el("p", `画面说明：${rank.prompt}`));
  for (const r of rank.ranked) {
    const c = state.frozen.snapshot.candidates.find((c) => c.id === r.id);
    $("ranking").append(el("p", `第${r.rank}名 · ${c.text} · ${r.total}分 · ${r.reason}`));
  }
}
$("publish-ranking").onclick = () => {
  const text = state?.texts.find((t) => t.id === state.ranking?.text_id);
  if (text) void command({ action: "publish-ranking", K: state.K, id: text.id, sha256: text.sha256, version: text.version });
};
function renderAssets() {
  const key = JSON.stringify(state.assets.map((a) => [a.id, a.sha256, a.approved]));
  if (key === assetKey) return;
  assetKey = key;
  for (const img of $("assets").querySelectorAll("img")) img.removeAttribute("src");
  $("assets").replaceChildren();
  for (const a of state.assets) {
    const card = el("article", undefined, "review-card"), img = el("img");
    img.alt = a.kind === "gif" ? "待审动图预览" : "待审静图预览"; img.src = `/api/preview/${a.id}`;
    card.append(el("h3", `${state.generation.mock ? "MOCK 演示 · " : ""}${a.kind === "gif" ? "动图" : "静图"} · ${a.approved ? "已批准" : "待审批"}`), img);
    let all, loop;
    if (a.kind === "gif") {
      const sheet = el("img"); sheet.src = a.info.contactSheet; sheet.alt = "全部合成帧联系表";
      card.append(el("p", `${a.info.frames}帧 · 一圈 ${a.info.durations.reduce((x, y) => x + y, 0)}ms`), sheet);
      for (const label of ["已逐帧检查完整联系表", "已观看至少一个完整循环"]) {
        const l = el("label", label), check = el("input"); check.type = "checkbox"; l.prepend(check); card.append(l); if (!all) all = check; else loop = check;
      }
    }
    const approve = el("button", "通过审核"), reject = el("button", "拒绝 · 整轮立即撤播", "danger");
    approve.disabled = a.approved;
    approve.onclick = () => command({ action: "approve-asset", K: a.K, id: a.id, sha256: a.sha256, version: a.version, all_frames: all?.checked || false, loop_seen: loop?.checked || false });
    reject.onclick = () => command({ action: "reject-asset", id: a.id });
    card.append(approve, reject); $("assets").append(card);
  }
}
async function poll() {
  if (polling) return;
  polling = true;
  try {
    state = await api("/api/state");
    if (!settingsLoaded) { fillSettings(state.settings); settingsLoaded = true; }
    $("warning").textContent = `${state.generation.mock ? "MOCK 演示模式 · 非真实 AI 出图" : "OpenAI 模式"}\n${warningText(state)}`;
    $("status").textContent = state.round ? `${phases[state.round.phase] || state.round.phase} · 剩余 ${Math.ceil(state.round.remaining_ms / 1000)} 秒 · 收到 ${state.round.accepted} / 入池 ${state.round.qualified}` : "准备好了，点击「开新轮」。";
    $("budget").textContent = `预算 $${state.settings.budgetUsd} · 已核对 $${state.budget.settled} · 预留待核 $${state.budget.reserved}`;
    $("transport").textContent = state.transport.mode === "manual" ? "手动代录模式 · 在下方输入投稿" : `douyinLive · ${state.transport.connected ? "已连接" : "未连接，请检查本机 douyinLive"}`;
    $("manual-section").hidden = state.transport.mode !== "manual";
    $("audit").textContent = JSON.stringify(state.requests, null, 2);
    renderSubmissions(); renderScores(); renderRanking(); renderAssets();
  } catch { $("warning").textContent = "与本机服务断连；遮罩/撤播未确认时，请在直播伴侣切断采集源或切备用安全场景。"; }
  finally { polling = false; }
}
$("cost").onsubmit = (e) => { e.preventDefault(); void command({ action: "settle-cost", request_id: $("cost-request").value, cost: Number($("cost-value").value), evidence: $("cost-evidence").value }); };
void poll(); setInterval(poll, 500);
