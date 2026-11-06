const $ = (id) => document.getElementById(id);
let state;
async function api(path, body) {
  const r = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  if (!r.ok) throw Error("操作未接受，请核对当前轮次与审核期限");
  return r.json();
}
async function command(input) { try { await api("/api/command", input); await poll(); } catch (e) { $("warning").textContent = e.message; } }
document.querySelector("nav").onclick = (e) => {
  const action = e.target.dataset.action;
  if (!action) return;
  const p = state?.stage.candidate;
  void command(action === "restore" ? { action, K: p?.K, sha256: p?.sha256 } : { action });
};
$("manual").onsubmit = (e) => { e.preventDefault(); void command({ action: "manual", text: $("comment").value, viewer_key: $("viewer").value || undefined, nickname: $("nickname").value || undefined }); };
async function poll() { try { state = await api("/api/state"); $("status").textContent = JSON.stringify({ round: state.round, budget: state.budget, generation: state.generation }, null, 2); $("warning").textContent = [state.generation.mock ? "MOCK 演示模式" : "OpenAI 模式", state.stage.warning, state.error].filter(Boolean).join(" · "); } catch { $("warning").textContent = "与本机服务断连，请保持备用安全场景"; } }
void poll(); setInterval(poll, 1000);
