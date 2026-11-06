import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StageState } from "../../public/stage-model.js";
const { StandaloneHost } = await import("../../standalone/host.js").catch(() => ({}));

test("boss host runs the original review pipeline without DSH or token files; unreviewed MOCK pixels stay private and safety revokes immediately", async (t) => {
  assert.equal(typeof StandaloneHost, "function");
  const dataRoot = await mkdtemp(join(tmpdir(), "boss-host-"));
  let time = Date.now();
  const host = await StandaloneHost.open({ dataRoot }, {
    listen: false, autoTick: false, clock: () => time,
  });
  t.after(async () => { host.publisher.clock = Date.now; await host.close(); await rm(dataRoot, { recursive: true, force: true }); });
  const command = (input) => host.command(input);
  assert.equal(host.budget.summary().limit, 5);
  assert.equal(host.ingress.mode, "manual");
  assert.equal(host.tokenFile, undefined);
  assert.equal((await readdir(host.j.root)).some((n) => n.includes("private")), false);
  await command({ action: "start" });
  await command({ action: "manual", text: "画：月亮上的小猫", nickname: "观众甲", viewer_key: "one" });
  const s = host.privateState().submissions[0];
  assert.deepEqual(host.publisher.build().cards, []);
  await command({ action: "review-submission", id: s.id, K: s.K, status: "pass", sha256: s.text_review.sha256, version: 1 });
  await command({ action: "stop" });
  assert.equal(host.rounds.current.phase, "rank");
  await command({ action: "rank-manual", scores: [{ id: s.id, visual: 5, surprise: 4, motion: 5, reason: "把熟悉的小动物送入幻想场景，轻柔的动作也让画面充满故事感。" }], prompt: "月亮上的小猫" });
  const text = host.m.privateTexts().find((x) => x.id === host.privateState().ranking.text_id);
  await command({ action: "publish-ranking", K: s.K, id: text.id, sha256: text.sha256, version: 1 });
  time += 12000;
  await host.tick();
  await host.idle();
  const still = host.privateState().assets.find((a) => a.kind === "still");
  assert.ok(still);
  assert.equal(host.publisher.build().asset_id, null);
  assert.equal(host.publisher.build().demo, true);
  await command({ action: "approve-asset", K: s.K, id: still.id, sha256: still.sha256, version: 1 });
  await host.idle();
  const gif = host.privateState().assets.find((a) => a.kind === "gif");
  assert.ok(gif);
  assert.equal(host.publisher.build().asset_id, still.id);
  await assert.rejects(command({ action: "approve-asset", K: s.K, id: gif.id, sha256: gif.sha256, version: 1 }));
  await command({ action: "approve-asset", K: s.K, id: gif.id, sha256: gif.sha256, version: 1, all_frames: true, loop_seen: true });
  assert.equal(host.publisher.build().asset_id, gif.id);
  assert.equal(host.budget.summary().reserved, 0);
  assert.equal(host.budget.summary().settled, 0);
  const stage = new StageState({ clock: () => time, render: async () => {} });
  host.publisher.connect({
    send: (bytes) => queueMicrotask(async () => { const ack = await stage.receive(JSON.parse(bytes)); if (ack) host.publisher.receive(ack); }),
    close: () => stage.disconnect(),
  });
  host.publisher.tick();
  await new Promise(setImmediate);
  const candidate = host.publisher.candidate();
  await command({ action: "restore", K: candidate.K, sha256: candidate.sha256 });
  await new Promise(setImmediate);
  assert.equal(stage.safe, false);
  await command({ action: "reject-asset", id: still.id });
  await new Promise(setImmediate);
  assert.equal(stage.safe, true);
  assert.equal(host.assets.canPublish(still.id), false);
  await assert.rejects(command({ action: "restore", K: candidate.K, sha256: candidate.sha256 }));
});
