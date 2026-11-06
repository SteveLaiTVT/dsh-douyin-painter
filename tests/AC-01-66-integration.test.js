import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../lib/config.js";
import { StageState } from "../public/stage-model.js";
import { png, gif } from "./fixtures.js";
const mod = await import("../lib/runtime.js").catch(() => ({}));
test("AC-01/10/13/16/17/24/26/34/37/45/48/55/64 integration: manual submission to full ranking/still/GIF, then late safety revokes and shutdown closes", async () => {
  assert.equal(typeof mod.Runtime, "function");
  let time = 0;
  let loop;
  const config = loadConfig(
    {
      runtimeRoot: await mkdtemp(join(tmpdir(), "ac-runtime-")),
      showId: "s",
      transport: "manual",
    },
    {},
  );
  const fakeServer = () => ({
    start: async () => {},
    close: async () => {},
    auth: { oneTime: "test-only" },
    origin: "http://127.0.0.1:14001",
  });
  const runtime = await mod.Runtime.open(config, {
    serverFactory: fakeServer,
    autoTick: false,
    clock: () => time,
    api: {
      async *stream() {
        yield { type: "completed", bytes: png(1024, 1024) };
      },
      async gif() {
        return { bytes: gif() };
      },
    },
    bridge: { close: async () => {} },
  });
  const op = { operator: "operator" };
  const command = (data) => runtime.command(data, op);
  await command({ action: "start" });
  await command({
    action: "manual",
    text: "画：月亮猫",
    viewer_key: "one",
    nickname: "观众一",
  });
  const s = runtime.privateState().submissions[0];
  await command({
    action: "review-submission",
    id: s.id,
    status: "pass",
    K: s.K,
    sha256: s.text_review.sha256,
    version: 1,
  });
  time = 45000;
  await runtime.tick();
  const K = runtime.rounds.current.K;
  assert.equal(runtime.rounds.current.phase, "rank");
  const reason = "把熟悉的小动物送入幻想场景，轻柔的动作也让画面充满故事感。";
  await command({
    action: "rank-manual",
    scores: [{ id: s.id, visual: 5, surprise: 4, motion: 5, reason }],
    prompt: "月亮上送信的小猫",
  });
  const rank = runtime.j.state.rankings[K.round_id],
    text = runtime.j.state.texts[rank.text_id];
  await command({
    action: "publish-ranking",
    K,
    id: text.id,
    sha256: text.sha256,
    version: 1,
  });
  assert.equal(runtime.ranking.project(K, time).cards[0].text, "月亮猫");
  runtime.config.project = "mock";
  runtime.config.verifiedPaths = ["still", "gif"].map((phase) => ({
    phase,
    model: "gpt-image-2.6-flare",
    project: "mock",
    endpoint: "generations",
    verified: true,
  }));
  runtime.config.gifModel = "gpt-image-2.6-flare";
  for (const p of runtime.config.verifiedPaths)
    p.signature = runtime.images.signature(p.phase);
  runtime.config.costRules = ["still", "gif"].map((phase) => ({
    signature: runtime.images.signature(phase),
    verified: true,
    upper_bound_usd: 0.2,
    max_prompt_chars: 500,
    max_image_bytes: 20 * 1024 * 1024,
    evidence: "mock fixture",
  }));
  await command({ action: "budget", limit: 5 });
  time = 57000;
  await command({ action: "generate-still" });
  await runtime.idle();
  const still = Object.values(runtime.j.state.assets).find(
    (a) => a.kind === "still",
  );
  await command({
    action: "approve-asset",
    K,
    id: still.id,
    sha256: still.sha256,
    version: 1,
  });
  await runtime.idle();
  const g = Object.values(runtime.j.state.assets).find((a) => a.kind === "gif");
  assert.ok(g);
  await command({
    action: "approve-asset",
    K,
    id: g.id,
    sha256: g.sha256,
    version: 1,
    all_frames: true,
    loop_seen: true,
  });
  assert.equal(runtime.j.state.rankings[K.round_id].result, "完整 GIF");
  const stage = new StageState({ clock: () => time, render: async () => {} });
  runtime.publisher.connect({
    send: (bytes) =>
      queueMicrotask(async () => {
        const ack = await stage.receive(JSON.parse(bytes));
        if (ack) runtime.publisher.receive(ack);
      }),
    close: () => stage.disconnect(),
  });
  runtime.publisher.tick();
  await new Promise(setImmediate);
  await runtime.publisher.publish();
  const candidate = runtime.publisher.candidate();
  await command({ action: "restore", K, sha256: candidate.sha256 });
  await new Promise(setImmediate);
  assert.equal(stage.safe, false);
  assert.notEqual(stage.projection.asset_kind, "gif");
  const req = Object.values(runtime.j.state.requests)[0];
  await runtime.m.moderationBlocked(req.request_id, {
    code: "moderation_blocked",
  });
  await new Promise(setImmediate);
  assert.equal(stage.safe, true);
  assert.equal(runtime.assets.canPublish(still.id), false);
  await assert.rejects(
    command({ action: "restore", K, sha256: candidate.sha256 }),
  );
  assert.equal(runtime.budget.summary().reserved, 0.4);
  time += 2000;
  await runtime.close();
  assert.equal(runtime.j.closed, true);
});
test("AC-55/64: clean restart preserves an effective still candidate but never auto resumes or replays paid work", async () => {
  assert.equal(typeof mod.Runtime, "function");
  const config = loadConfig(
    {
      runtimeRoot: await mkdtemp(join(tmpdir(), "ac-clean-")),
      showId: "clean",
      transport: "manual",
    },
    {},
  );
  const serverFactory = () => ({
    start: async () => {},
    close: async () => {},
    auth: { oneTime: "test-only" },
    origin: "http://127.0.0.1:14001",
  });
  const options = {
    serverFactory,
    autoTick: false,
    bridge: { close: async () => {} },
  };
  const r = await mod.Runtime.open(config, options);
  await r.command({ action: "start" }, { operator: "op" });
  await r.publisher.publish();
  const K = { ...r.rounds.current.K };
  await r.close();
  const restarted = await mod.Runtime.open(config, options);
  assert.equal(restarted.j.trusted, true);
  assert.deepEqual(restarted.publisher.candidate()?.K, K);
  assert.equal(restarted.publisher.resumed, false);
  assert.equal(restarted.budget.summary().requests, 0);
  await restarted.close();
});
