import test from "node:test";
import assert from "node:assert/strict";
const mod = await import("../lib/transport.js").catch(() => ({}));
test("AC-01/02: exclusive modes, local timestamp, source-scoped stable IDs and fallback window", async () => {
  assert.equal(typeof mod.Ingress, "function");
  let now = 1;
  const events = [];
  const i = new mod.Ingress({
    clock: () => now,
    roomKey: "room",
    accept: (e) => events.push(e),
  });
  await i.submit(
    { text: "画：猫", source_msg_id: "1", viewer_key: "u", received_at: -100 },
    "ws",
  );
  await i.submit({ text: "画：猫", source_msg_id: "1", viewer_key: "u" }, "ws");
  assert.equal(events.length, 1);
  assert.equal(events[0].received_at, 1);
  assert.equal(events[0].ingress_seq, 1);
  await i.submit({ text: "画：猫" }, "manual");
  assert.equal(events.length, 1);
  i.mode = "manual";
  await i.submit({ text: "画：猫" }, "manual");
  assert.equal(events[1].source, "manual");
  assert.equal(events[1].identity_unstable, true);
  await i.submit({ text: "画：猫" }, "manual");
  assert.equal(events.length, 2);
  now = 3001;
  await i.submit({ text: "画：猫" }, "manual");
  assert.equal(events.length, 3);
});
test("AC-03: bounded raw buffer, offline stays connected and capped jittered backoff", async () => {
  assert.equal(typeof mod.DouyinTransport, "function");
  const health = [];
  const t = new mod.DouyinTransport({
    roomKey: "room",
    ingress: { submit: async () => {} },
    onHealth: (h) => health.push(h),
    random: () => 0,
  });
  for (let n = 0; n < 201; n++) t.enqueue('{"method":"unknown"}');
  assert.equal(t.buffer.length, 200);
  assert.equal(t.stats.dropped, 1);
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((n) => t.delay(n)),
    [1000, 2000, 4000, 8000, 30000, 30000],
  );
  t.parse({ type: "room_status", live: false });
  assert.equal(t.stats.live, false);
  assert.equal(t.timer, undefined);
  await t.drain();
  assert.equal(t.stats.invalid, 0);
  await t.handle("{bad");
  assert.equal(t.stats.invalid, 1);
  assert.equal(JSON.stringify(health).includes("{bad"), false);
  await t.close();
});
