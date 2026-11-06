import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { LocalServer } from "../lib/server.js";
import { Auth } from "../lib/auth.js";
test("AC-50/58–61: real request handler refuses wrong sources, missing CSRF, Cookie-only access and GET writes", async () => {
  let changes = 0;
  const local = new LocalServer({
    state: () => ({ private: "private" }),
    command: async () => {
      changes++;
      return { ok: true };
    },
    assets: {},
    publisher: {},
  });
  local.auth = new Auth(14001);
  const origin = { host: "127.0.0.1:14001", origin: "http://127.0.0.1:14001" };
  async function request(url, method = "GET", headers = {}, body = {}) {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { url, method, headers: { ...origin, ...headers } });
    const res = {
      headers: {},
      status: 200,
      setHeader(k, v) {
        this.headers[k] = v;
      },
      writeHead(n, h = {}) {
        this.status = n;
        Object.assign(this.headers, h);
      },
      end(body) {
        this.body = String(body);
      },
    };
    await local.handle(req, res);
    return res;
  }
  assert.equal((await request("/api/state")).status, 403);
  assert.equal(
    (
      await request(
        "/api/exchange",
        "POST",
        { origin: "null" },
        { token: local.auth.oneTime },
      )
    ).status,
    403,
  );
  const exchanged = await request(
      "/api/exchange",
      "POST",
      {},
      { token: local.auth.oneTime },
    ),
    session = JSON.parse(exchanged.body);
  assert.equal(exchanged.status, 200);
  const headers = {
    authorization: `Bearer ${session.token}`,
    cookie: exchanged.headers["Set-Cookie"].split(";")[0],
    "x-csrf-token": session.csrf,
  };
  assert.equal((await request("/api/state", "GET", headers)).status, 200);
  assert.equal((await request("/api/command", "GET", headers)).status, 405);
  for (const patch of [
    { host: "localhost:14001" },
    { origin: undefined },
    { "x-csrf-token": "" },
    { authorization: "" },
  ])
    assert.equal(
      (
        await request(
          "/api/command",
          "POST",
          { ...headers, ...patch },
          { action: "start" },
        )
      ).status,
      403,
    );
  assert.equal(changes, 0);
  assert.equal(
    (await request("/api/command", "POST", headers, { action: "start" }))
      .status,
    200,
  );
  assert.equal(changes, 1);
  assert.equal(
    (await request("/api/state", "GET", { cookie: headers.cookie })).status,
    403,
  );
  assert.equal((await request("/private/a", "GET", headers)).status, 404);
  local.auth.close();
});
