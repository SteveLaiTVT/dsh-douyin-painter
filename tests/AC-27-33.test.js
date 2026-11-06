import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Journal } from "../lib/journal.js";
import { Moderation } from "../lib/moderation.js";
import { hash, canonical } from "../lib/util.js";
const mod = await import("../lib/ranking.js").catch(() => ({}));
async function setup() {
  assert.equal(typeof mod.Ranking, "function");
  const j = await Journal.open(await mkdtemp(join(tmpdir(), "ac-rank-")), "s");
  const K = { show_id: "s", round_id: "r", generation: 1 };
  const snapshot = {
    T2: 0,
    candidates: [
      {
        id: "b",
        text: "月亮猫",
        nickname: "观众 1",
        ingress_seq: 2,
        source: "ws",
      },
      {
        id: "a",
        text: "云朵狗",
        nickname: "观众 2",
        ingress_seq: 1,
        source: "manual",
      },
    ],
  };
  await j.commit("freeze", [
    { table: "rounds", id: "r", value: { K } },
    {
      table: "frozen",
      id: "r",
      value: { K, snapshot, sha256: hash(canonical(snapshot)) },
    },
  ]);
  let time = 0;
  const m = new Moderation(j, {});
  return {
    j,
    K,
    m,
    r: new mod.Ranking(j, m, { clock: () => time }),
    set: (n) => (time = n),
  };
}
const reason = "把熟悉的小动物送入幻想场景，轻柔的动作也让画面充满故事感。";
const scores = () => [
  { id: "b", visual: 5, surprise: 3, motion: 4, total: 100, rank: 1, reason },
  { id: "a", visual: 5, surprise: 3, motion: 4, total: 0, rank: 9, reason },
];
for (const mutation of [
  (s) => s.pop(),
  (s) => s.push({ ...s[0] }),
  (s) => (s[0].id = "outside"),
  (s) => (s[0].visual = "5"),
  (s) => (s[0].motion = 1.5),
  (s) => (s[0].surprise = 6),
  (s) => delete s[1].motion,
])
  test("AC-27: malformed or incomplete full-candidate scores never publish", async () => {
    const f = await setup(),
      s = scores();
    mutation(s);
    await assert.rejects(f.r.propose(f.K, { scores: s, prompt: "月亮猫" }));
    assert.equal(Object.values(f.j.state.rankings).length, 0);
  });
test("AC-28/29/30/31/32/33: recompute scores, manual version audit, separate text approval and lock after reveal", async () => {
  const f = await setup();
  const proposal = await f.r.propose(
    f.K,
    { scores: scores(), prompt: "月亮上送信的小猫" },
    "manual",
  );
  assert.deepEqual(
    proposal.ranked.map((s) => s.id),
    ["a", "b"],
  );
  assert.equal(proposal.ranked[0].total, 81);
  assert.deepEqual(proposal.ranked[0].weighted, [40, 21, 20]);
  await assert.rejects(f.r.publish(f.K));
  const t = f.m.privateTexts()[0];
  await f.m.approveText({
    operator: "op",
    K: f.K,
    id: t.id,
    sha256: t.sha256,
    version: 1,
  });
  await f.r.publish(f.K);
  await f.r.reveal(f.K);
  assert.equal(f.r.project(f.K, 0).cards[0].rank, 2);
  assert.equal(f.r.project(f.K, 3000).cards.length, 2);
  await assert.rejects(f.r.propose(f.K, { scores: scores(), prompt: "猫" }));
  assert.equal(f.r.input(f.K).includes("gift"), false);
  await f.r.result(f.K, "仅静图");
  assert.equal(f.j.state.rankings.r.result, "仅静图");
});
test("AC-30: all attempts and manual confirmation share exact 10-second deadline", async () => {
  const f = await setup();
  f.set(10000);
  await assert.rejects(f.r.propose(f.K, { scores: scores(), prompt: "猫" }));
});
