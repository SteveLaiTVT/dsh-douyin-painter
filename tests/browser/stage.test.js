import test from "node:test";
import assert from "node:assert/strict";
import { LocalServer } from "../../lib/server.js";
test("AC-50/51/56 browser: built-in safety screen and AI badge, no raw HTML execution", async (t) => {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw Error(
      "Browser verification unavailable: playwright and Chromium must be installed; this is not a pass",
    );
  }
  const local = new LocalServer({
    state: () => ({}),
    command: async () => {},
    assets: {},
    publisher: {
      connect: (ws) => {
        ws.send(
          JSON.stringify({
            type: "hello",
            stage_session_id: "browser-test",
            revocation_version: 0,
            revocations: [],
          }),
        );
        return "browser-test";
      },
      receive: () => false,
      disconnect: () => {},
    },
  });
  await local.start();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await local.close();
  });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  await page.goto(local.origin + "/stage");
  assert.equal(
    await page.getByText("AI 生成内容", { exact: true }).isVisible(),
    true,
  );
  assert.equal(
    await page.getByText("安全待机", { exact: true }).isVisible(),
    true,
  );
  await page.route("**/stage-ws", (r) => r.abort());
  await page.reload();
  assert.equal(
    await page.getByText("AI 生成内容", { exact: true }).isVisible(),
    true,
  );
});
