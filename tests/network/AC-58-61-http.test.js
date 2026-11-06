import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
const mod = await import("../../lib/server.js").catch(() => ({}));
test("AC-50/58–61: real loopback HTTP validates exact Host/Origin and every private/control endpoint", async (t) => {
  assert.equal(typeof mod.LocalServer, "function");
  let changes = 0;
  const local = new mod.LocalServer({
    state: () => ({ private: "private text" }),
    command: async () => {
      changes++;
      return { ok: true };
    },
    assets: { read: async () => Buffer.from("private") },
    publisher: {
      connect: () => {},
      receive: () => false,
      disconnect: () => {},
    },
  });
  await local.start();
  t.after(() => local.close());
  const url = local.origin;
  const origin = { Origin: url };
  let response = await fetch(url + "/stage");
  assert.equal(response.status, 200);
  assert.equal((await response.text()).includes("private text"), false);
  assert.equal((await fetch(url + "/api/state")).status, 403);
  assert.equal(
    (
      await fetch(url + "/api/exchange", {
        method: "POST",
        headers: { Origin: "null", "Content-Type": "application/json" },
        body: JSON.stringify({ token: local.auth.oneTime }),
      })
    ).status,
    403,
  );
  response = await fetch(url + "/api/exchange", {
    method: "POST",
    headers: { ...origin, "Content-Type": "application/json" },
    body: JSON.stringify({ token: local.auth.oneTime }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie").split(";")[0],
    session = await response.json();
  const headers = {
    ...origin,
    Authorization: `Bearer ${session.token}`,
    Cookie: cookie,
    "X-CSRF-Token": session.csrf,
    "Content-Type": "application/json",
  };
  assert.equal(
    (
      await fetch(url + "/api/state", {
        headers: { Authorization: headers.Authorization },
      })
    ).status,
    200,
  );
  assert.equal((await fetch(url + "/api/command", { headers })).status, 405);
  assert.equal(
    (
      await fetch(url + "/api/command", {
        method: "POST",
        headers: { ...headers, "X-CSRF-Token": "" },
        body: '{"action":"start"}',
      })
    ).status,
    403,
  );
  assert.equal(changes, 0);
  assert.equal(
    (
      await fetch(url + "/api/command", {
        method: "POST",
        headers,
        body: '{"action":"start"}',
      })
    ).status,
    200,
  );
  assert.equal(changes, 1);
  assert.equal(
    (await fetch(url + "/private/anything", { headers })).status,
    404,
  );
});
