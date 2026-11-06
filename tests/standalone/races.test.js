import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StandaloneHost } from "../../standalone/host.js";
import { Settings } from "../../standalone/settings.js";

test("round source is frozen before the first publication, so a delayed start cannot classify a live request as MOCK", async (t) => {
  const dataRoot = await mkdtemp(join(tmpdir(), "boss-source-race-"));
  const settings = await Settings.open(dataRoot);
  await settings.save({ apiKey: "test-only-no-network" });
  const host = await StandaloneHost.open({ dataRoot }, { listen: false, autoTick: false });
  t.after(async () => { await host.close(); await rm(dataRoot, { recursive: true, force: true }); });
  let modeAtPublication, firstPublication = true;
  const publish = host.publisher.publish.bind(host.publisher);
  host.publisher.publish = async () => {
    if (firstPublication) { firstPublication = false; modeAtPublication = host.j.state.config[`demo:${host.rounds.current.K.round_id}`]; }
    return publish();
  };
  await host.command({ action: "start" });
  assert.equal(modeAtPublication, false);
});

test("a fresh launch starts a new show and keeps the previous show's journal intact", async (t) => {
  const dataRoot = await mkdtemp(join(tmpdir(), "boss-session-"));
  let active;
  t.after(async () => { await active?.close(); await rm(dataRoot, { recursive: true, force: true }); });
  const first = await StandaloneHost.open({ dataRoot }, { listen: false, autoTick: false });
  active = first;
  const id = first.config.showId;
  await first.command({ action: "start" }); await first.close();
  const second = await StandaloneHost.open({ dataRoot }, { listen: false, autoTick: false });
  active = second;
  assert.notEqual(second.config.showId, id);
  assert.equal(second.budget.summary().requests, 0);
  assert.equal(second.rounds.current, null);
});
