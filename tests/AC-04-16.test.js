import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Journal } from "../lib/journal.js";
import { hash, canonical } from "../lib/util.js";
const mod = await import("../lib/rounds.js").catch(() => ({}));
async function setup() {
  assert.equal(typeof mod.RoundEngine, "function");
  let time = 0;
  const j = await Journal.open(await mkdtemp(join(tmpdir(), "ac-round-")), "s");
  const r = new mod.RoundEngine(j, { clock: () => time });
  await r.start();
  return { j, r, set: (n) => (time = n) };
}
const event = (n, text = "画：月亮猫", t = 1, viewer = `u${n}`) => ({
  source: "ws",
  viewer_key: viewer,
  alias: `观众 ${n}`,
  nickname: "私有名字",
  text,
  received_at: t,
  ingress_seq: n,
});
async function pass(f, items) {
  const results = [];
  for (const s of items) {
    const content = { text: s.text, nickname: s.alias };
    const record = {
      id: `text-${s.id}`,
      K: s.K,
      content,
      sha256: hash(canonical(content)),
      approved: true,
    };
    await f.j.commit("text-approved", [
      { table: "texts", id: record.id, value: record },
    ]);
    results.push({ id: s.id, status: "pass", text_id: record.id });
  }
  return f.r.review(results);
}
test("AC-04: grapheme format edges, cooldown, three attempts and first qualified lock", async () => {
  const f = await setup();
  assert.equal((await f.r.receive(event(1, "画："))).status, "format");
  assert.equal(
    (await f.r.receive(event(2, "画:" + "猫".repeat(41)))).status,
    "format",
  );
  const a = await f.r.receive(event(3, "画：猫".slice(0), 1, "u"));
  assert.equal(a.status, "pending");
  assert.equal(
    (await f.r.receive(event(4, "画：狗", 9999, "u"))).status,
    "cooldown",
  );
  await f.r.review([{ id: a.id, status: "reject", category: "context" }]);
  const b = await f.r.receive(event(5, "画：狗", 10001, "u"));
  await f.r.review([{ id: b.id, status: "reject" }]);
  const c = await f.r.receive(event(6, "画：鸟", 20001, "u"));
  await f.r.review([{ id: c.id, status: "reject" }]);
  assert.equal(
    (await f.r.receive(event(7, "画：鱼", 30001, "u"))).status,
    "attempts",
  );
  const d = await f.r.receive(event(8, "画:" + "猫".repeat(40), 30002));
  await pass(f, [d]);
  assert.equal(
    (await f.r.receive(event(9, "画：风", 40002, "u8"))).status,
    "locked",
  );
});
test("AC-05/06/07: T1-1 belongs to original; T1 equality rejects; source_time cannot backdate", async () => {
  const f = await setup();
  f.set(44999);
  const a = await f.r.receive(event(1, "画：猫", 44999));
  f.set(45000);
  await f.r.tick();
  assert.equal(f.r.current.T1, 45000);
  assert.equal(f.r.current.T2, null);
  assert.equal(
    (await f.r.receive({ ...event(2, "画：狗", 45000), source_time: 1 }))
      .status,
    "closed",
  );
  f.set(45001);
  await pass(f, [a]);
  assert.equal(f.r.current.pool.length, 1);
  assert.equal(f.r.current.T2, 45001);
});
for (const at of [60000, 60001])
  test(`AC-08: review at ${at} cannot enter and frozen pool stays unchanged`, async () => {
    const f = await setup();
    const a = await f.r.receive(event(1));
    f.set(at);
    await pass(f, [a]);
    assert.equal(f.r.current.pool.length, 0);
    assert.equal(f.r.current.T2, 60000);
  });
test("AC-09/10: 60 admissions total, batches of 10, deterministic capacity, immutable canonical freeze", async () => {
  const f = await setup();
  const all = [];
  for (let n = 1; n <= 60; n++) all.push(await f.r.receive(event(n)));
  assert.equal((await f.r.receive(event(61))).status, "full");
  assert.equal(f.r.batch().length, 10);
  await pass(f, all.slice(0, 25));
  await pass(f, all.slice(25, 40).reverse());
  assert.deepEqual(
    f.r.current.pool.map((x) => x.ingress_seq),
    Array.from({ length: 30 }, (_, i) => i + 1),
  );
  assert.equal(f.r.batch().length, 0);
  f.set(45000);
  await f.r.tick();
  const frozen = f.j.state.frozen[f.r.current.K.round_id];
  assert.equal(frozen.sha256, hash(canonical(frozen.snapshot)));
  const bytes = canonical(frozen);
  await pass(f, [all[45]]);
  assert.equal(canonical(f.j.state.frozen[f.r.current.K.round_id]), bytes);
});
test("AC-11/12: empty no ranking; pause never reopens, controlled phase clocks never autoapprove", async () => {
  const f = await setup();
  f.set(100);
  await f.r.stop();
  assert.equal(f.r.current.phase, "empty");
  assert.equal(f.r.current.T1, 100);
  assert.equal(f.r.current.T2, 100);
  assert.equal(f.r.current.public_status, "本轮没有可用投稿");
  assert.equal(
    Object.values(mod.TIMINGS).reduce((a, b) => a + b, 0),
    357000,
  );
  await assert.rejects(f.r.resumeCollecting());
});
test("AC-14/15/16: request identity and duplicate attempt gates, cancelled round cannot adopt late ordinary result", async () => {
  const f = await setup();
  const t = await f.r.task("still", 1);
  assert.equal(await f.r.accept(t), true);
  assert.equal(await f.r.accept(t), false);
  const newer = await f.r.task("still", 2);
  assert.equal(await f.r.accept(t), false);
  await f.r.cancel();
  assert.equal(await f.r.accept(newer), false);
  assert.equal(f.r.current.K.generation, 2);
});
