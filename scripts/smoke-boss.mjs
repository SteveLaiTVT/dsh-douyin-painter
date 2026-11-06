import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

// Offline acceptance against modules loaded from an already-extracted ZIP.
// This exercises real request handlers and StageState, not socket/browser capture.
const root = resolve(process.argv[2] || ".");
const { StandaloneHost } = await import(pathToFileURL(join(root, "standalone/host.js")));
const { StageState } = await import(pathToFileURL(join(root, "public/stage-model.js")));
let time = Date.now();
const host = await StandaloneHost.open({ dataRoot: join(root, "data") }, { listen: false, autoTick: false, clock: () => time });
const result = { systemNode: process.version, extractedRoot: root, networkListener: "NOT TESTED (offline handler mode)", assertions: [] };
async function request(path, body) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.url = path; req.method = body === undefined ? "GET" : "POST";
  req.headers = { host: "127.0.0.1:7321", origin: "http://127.0.0.1:7321", "content-type": "application/json" };
  let code = 200, bytes = Buffer.alloc(0);
  const res = { setHeader() {}, writeHead(n) { code = n; }, end(b = "") { bytes = Buffer.from(b); } };
  await host.server.handle(req, res);
  assert.equal(code, 200, `${path}: ${bytes.toString().slice(0, 200)}`);
  return { bytes, json: () => JSON.parse(bytes.toString()) };
}
const command = async (input) => (await request("/api/command", input)).json();
try {
  for (const path of ["/control", "/stage"]) { await request(path); result.assertions.push(`${path} production handler 200`); }
  await request("/api/settings", { apiKey: "", budgetUsd: 6.5, roomKey: "manual-test", douyinLive: false });
  const saved = (await request("/api/settings")).json();
  assert.equal(saved.budgetUsd, 6.5); assert.equal(saved.apiKeyConfigured, false);
  assert.equal(JSON.parse(await readFile(join(root, "data/settings.json"), "utf8")).budgetUsd, 6.5);
  result.assertions.push("settings API save, GET reread and disk reread");
  await command({ action: "start" });
  await command({ action: "manual", text: "画：月亮上的小猫", nickname: "观众甲", viewer_key: "one" });
  const s = (await request("/api/state")).json().submissions[0];
  assert.equal(host.publisher.build().cards.length, 0);
  await command({ action: "review-submission", K: s.K, id: s.id, status: "pass", sha256: s.text_review.sha256, version: 1 });
  await command({ action: "stop-rank", scores: [{ id: s.id, visual: 5, surprise: 4, motion: 5, reason: "把熟悉的小动物送入幻想场景，轻柔的动作也让画面充满故事感。" }], prompt: "月亮上的小猫" });
  const text = host.m.privateTexts().find((t) => t.id === host.privateState().ranking.text_id);
  await command({ action: "publish-ranking", K: s.K, id: text.id, sha256: text.sha256, version: text.version });
  time += 12000; await host.tick(); await host.idle();
  const still = host.privateState().assets.find((a) => a.kind === "still");
  assert.ok(still); assert.equal(host.publisher.build().asset_id, null);
  await command({ action: "approve-asset", K: s.K, id: still.id, sha256: still.sha256, version: 1 });
  await host.idle();
  const gif = host.privateState().assets.find((a) => a.kind === "gif");
  assert.ok(gif); assert.equal(host.publisher.build().asset_id, still.id);
  await command({ action: "approve-asset", K: s.K, id: gif.id, sha256: gif.sha256, version: 1, all_frames: true, loop_seen: true });
  assert.equal(host.publisher.build().demo, true);
  assert.equal(host.publisher.build().asset_id, gif.id);
  const stage = new StageState({ clock: () => time, render: async () => {} });
  host.publisher.connect({ send: (bytes) => queueMicrotask(async () => { const ack = await stage.receive(JSON.parse(bytes)); if (ack) host.publisher.receive(ack); }), close: () => stage.disconnect() });
  host.publisher.tick(); await new Promise(setImmediate);
  const p = host.publisher.candidate();
  await command({ action: "restore", K: p.K, sha256: p.sha256 });
  await new Promise(setImmediate);
  assert.equal(stage.safe, false); assert.equal(stage.projection.demo, true);
  result.assertions.push("manual submission → human text review → full ranking → ranking approval → MOCK still → still approval → GIF → full-frame GIF approval → stage applied state");
  result.assertions.push("unreviewed text/pixels never projected; demo round label retained; reconnect restores approved still");
  await request(`/asset/${stage.projection.asset_id}`);
  await command({ action: "reject-asset", id: still.id });
  await new Promise(setImmediate);
  assert.equal(stage.safe, true); assert.equal(host.assets.canPublish(still.id), false);
  assert.equal(host.budget.summary().settled, 0); assert.equal(host.budget.summary().reserved, 0);
  result.assertions.push("immediate round-wide safety revocation; MOCK actual/reserved cost both zero");
  result.status = "PASS (offline; real TCP/curl and Mac capture remain unverified)";
} finally { host.publisher.clock = Date.now; await host.close(); }
console.log(JSON.stringify(result, null, 2));
