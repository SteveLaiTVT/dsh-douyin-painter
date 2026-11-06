import { fileURLToPath } from "node:url";
import { join, dirname, resolve } from "node:path";
import { StandaloneHost } from "./standalone/host.js";

export async function startStandalone(options = {}) {
  return StandaloneHost.open({ dataRoot: join(dirname(fileURLToPath(import.meta.url)), "data") }, options);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let host;
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try { await host?.close(); } finally { process.exit(0); }
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, stop);
  try {
    host = await startStandalone();
    console.log("弹幕画师 · 老板模式");
    console.log("控制页：http://127.0.0.1:7321/control");
    console.log("舞台页：http://127.0.0.1:7321/stage");
    console.log("MOCK 演示模式：未配置 API Key，不调用 OpenAI，舞台与图片均标注演示。");
    console.log("关闭这个终端窗口即停止服务；也可按 Ctrl+C 停止。");
  } catch (e) {
    console.error(e.code === "EADDRINUSE" ? "端口 7321 已被占用，请先关闭上一个启动窗口。" : "启动失败，请检查 data 目录权限与本机设置文件。");
    process.exit(1);
  }
}
