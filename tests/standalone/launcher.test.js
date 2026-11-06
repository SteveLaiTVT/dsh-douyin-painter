import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, copyFile, mkdir, writeFile, readFile, chmod, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
const launcher = new URL("../../启动.command", import.meta.url);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(read, limit = 4000) {
  const end = Date.now() + limit;
  while (Date.now() < end) { const value = await read().catch(() => null); if (value) return value; await pause(25); }
  throw Error("launcher behavior timed out");
}
async function executable(path, source) { await writeFile(path, source); await chmod(path, 0o755); }
test("mac launcher prefers bundled Node, opens control after one second, and HUP terminates the server", async (t) => {
  await access(launcher);
  const root = await mkdtemp(join(tmpdir(), "boss-launcher space-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await copyFile(launcher, join(root, "启动.command"));
  await mkdir(join(root, "runtime")); await mkdir(join(root, "bin"));
  await executable(join(root, "runtime/node"), '#!/bin/sh\nprintf "bundled:%s:%s\\n" "$PWD" "$*" > "$BOSS_TEST_LOG"\ntrap \'echo stopped >> "$BOSS_TEST_LOG"; exit 0\' TERM HUP INT\nwhile :; do /bin/sleep 0.1; done\n');
  await executable(join(root, "bin/node"), '#!/bin/sh\necho system >> "$BOSS_TEST_LOG"\n');
  await executable(join(root, "bin/open"), '#!/bin/sh\necho "opened:$*" >> "$BOSS_TEST_LOG"\n');
  const log = join(root, "activity.log");
  const child = spawn("/usr/bin/zsh", [join(root, "启动.command")], { cwd: "/tmp", env: { ...process.env, PATH: `${root}/bin:/usr/bin:/bin`, BOSS_TEST_LOG: log }, stdio: "ignore" });
  t.after(() => child.kill("SIGTERM"));
  const done = new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", (code, signal) => resolve({ code, signal })); });
  const text = await until(async () => { const s = await readFile(log, "utf8"); return s.includes("opened:") ? s : null; });
  assert.ok(text.includes(`bundled:${root}:server.js`));
  assert.ok(text.includes("opened:http://127.0.0.1:7321/control"));
  assert.equal(text.includes("system"), false);
  child.kill("SIGHUP");
  await done;
  assert.ok((await readFile(log, "utf8")).includes("stopped"));
});

test("launcher falls back to system Node when runtime/node is absent", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "boss-launcher-fallback-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await copyFile(launcher, join(root, "启动.command")); await mkdir(join(root, "bin"));
  await executable(join(root, "bin/node"), '#!/bin/sh\necho "system:$PWD:$*" > "$BOSS_TEST_LOG"\nexit 0\n');
  await executable(join(root, "bin/open"), '#!/bin/sh\nexit 0\n');
  const log = join(root, "activity.log");
  const child = spawn("/usr/bin/zsh", [join(root, "启动.command")], { cwd: "/tmp", env: { ...process.env, PATH: `${root}/bin:/usr/bin:/bin`, BOSS_TEST_LOG: log }, stdio: "ignore" });
  const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
  assert.equal(code, 0);
  assert.ok((await readFile(log, "utf8")).includes(`system:${root}:server.js`));
});

test("launcher with no Node shows the macOS dialog and opens the official download page", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "boss-launcher-missing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await copyFile(launcher, join(root, "启动.command")); await mkdir(join(root, "bin"));
  const log = join(root, "activity.log");
  await executable(join(root, "bin/osascript"), '#!/bin/sh\necho dialog >> "$BOSS_TEST_LOG"\n');
  await executable(join(root, "bin/open"), '#!/bin/sh\necho "opened:$*" >> "$BOSS_TEST_LOG"\n');
  const child = spawn("/usr/bin/zsh", [join(root, "启动.command")], { env: { ...process.env, PATH: `${root}/bin`, BOSS_TEST_LOG: log }, stdio: "ignore" });
  const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
  assert.equal(code, 1);
  const text = await readFile(log, "utf8");
  assert.ok(text.includes("dialog"));
  assert.ok(text.includes("opened:https://nodejs.org/zh-cn/download"));
});
