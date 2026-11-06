import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StandaloneHost } from "../../standalone/host.js";
import { request } from "./http-utils.js";

test("boss HTTP handlers serve both pages and persist settings without login; Host, Origin and JSON still guard writes", async (t) => {
  const dataRoot = await mkdtemp(join(tmpdir(), "boss-http-"));
  const host = await StandaloneHost.open({ dataRoot }, { listen: false, autoTick: false });
  t.after(async () => { await host.close(); await rm(dataRoot, { recursive: true, force: true }); });
  for (const path of ["/control", "/stage", "/boss-control.js", "/boss-stage.js", "/boss.css", "/api/state", "/api/settings"]) {
    const r = await request(host.server, path);
    assert.equal(r.status, 200, path);
    assert.equal(r.headers["set-cookie"], undefined);
  }
  const saved = await request(host.server, "/api/settings", { body: { apiKey: "test-only-secret", budgetUsd: 9, roomKey: "abc", douyinLive: false } });
  assert.equal(saved.status, 200);
  assert.equal(saved.json().budgetUsd, 9);
  assert.equal(saved.text.includes("test-only-secret"), false);
  assert.equal((await request(host.server, "/api/settings")).json().apiKeyConfigured, true);
  assert.equal((await request(host.server, "/api/state")).text.includes("test-only-secret"), false);
  for (const headers of [{ origin: "https://example.com" }, { origin: "null" }, { host: "evil.example:7321" }, { "content-type": "text/plain" }, { "sec-fetch-site": "cross-site" }]) {
    assert.equal((await request(host.server, "/api/settings", { headers, body: { budgetUsd: 2 } })).status, 403);
  }
  assert.equal(host.settings.view().budgetUsd, 9);
  assert.equal((await request(host.server, "/api/settings", { body: { budgetUsd: -1 } })).status, 400);
  assert.equal((await request(host.server, "/api/exchange", { body: {} })).status, 404);
});
