import test from "node:test";
import assert from "node:assert/strict";
const S = await import("../public/stage-model.js").catch(() => ({})),
  P = await import("../lib/publisher.js").catch(() => ({}));
const K = { show_id: "s", round_id: "r", generation: 1 };
test("AC-18/51/52/53/55: stage starts safe, heartbeat cannot resume, stale instance/rev cannot renew and commands apply before ack", async () => {
  assert.equal(typeof S.StageState, "function");
  let now = 0;
  const rendered = [];
  const s = new S.StageState({
    clock: () => now,
    render: async (p) => rendered.push(p),
  });
  assert.equal(s.safe, true);
  await s.receive({
    type: "hello",
    stage_session_id: "one",
    revocation_version: 1,
    revocations: [],
  });
  await s.receive({
    type: "heartbeat",
    stage_session_id: "one",
    seq: 1,
    projection_seq: 0,
    revocation_version: 1,
  });
  assert.equal(s.safe, true);
  const projection = {
    K,
    seq: 2,
    phase: "still",
    status: "已审静图",
    cards: [{ text: "月亮猫" }],
    asset_url: "/asset/a",
  };
  const ack = await s.receive({
    type: "command",
    action: "restore",
    command_id: "restore",
    stage_session_id: "one",
    target: K,
    revocation_version: 1,
    projection,
  });
  assert.equal(ack.type, "applied");
  assert.equal(s.safe, false);
  assert.equal(rendered.at(-1).cards[0].text, "月亮猫");
  await s.receive({
    type: "command",
    action: "revoke",
    command_id: "old",
    stage_session_id: "one",
    target: { ...K, round_id: "old" },
    revocation_version: 2,
  });
  assert.equal(s.safe, false);
  now = 2999;
  await s.receive({
    type: "heartbeat",
    stage_session_id: "old",
    seq: 10,
    projection_seq: 2,
    revocation_version: 2,
  });
  now = 3000;
  await s.tick();
  assert.equal(s.safe, true);
  assert.equal(s.projection, null);
});
test("AC-51: disconnect clears synchronously and delayed asset callback cannot resurrect old pixels", async () => {
  assert.equal(typeof S.StageState, "function");
  const s = new S.StageState({ render: async () => {} });
  s.session = "one";
  await s.receive({
    type: "command",
    action: "restore",
    command_id: "x",
    stage_session_id: "one",
    target: K,
    revocation_version: 0,
    projection: { K, seq: 1, phase: "still", cards: [] },
  });
  const epoch = s.epoch;
  s.disconnect();
  assert.equal(s.safe, true);
  assert.equal(s.isCurrent(epoch), false);
});
test("AC-53/54/55: publisher accepts only exact timely receipts; missing receipt warns after one second", async () => {
  assert.equal(typeof P.Publisher, "function");
  let now = 0;
  const sent = [];
  const p = new P.Publisher({
    j: { healthy: true, seq: 0, state: { revocations: {} } },
    assets: {},
    ranking: {},
    rounds: {},
    clock: () => now,
  });
  p.connect({ send: (s) => sent.push(JSON.parse(s)), close: () => {} });
  const command = p.mask();
  assert.equal(p.status().confirmed, false);
  assert.equal(
    p.receive({ ...command, type: "applied", stage_session_id: "wrong" }),
    false,
  );
  now = 1000;
  p.tick();
  assert.match(p.status().warning, /切断.*采集源/);
  assert.equal(p.receive({ ...command, type: "applied" }), false);
});
