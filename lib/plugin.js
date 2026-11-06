import { loadConfig } from "./config.js";
import { Runtime } from "./runtime.js";
import { OpenAIImages } from "./openai.js";
export const name = "dsh-douyin-painter";
export const inject = ["agents", "sessions", "sessionPersistence"];
export function apply(ctx, input = {}) {
  const config = loadConfig(input);
  config.project = process.env.OPENAI_PROJECT_ID || "";
  const api = new OpenAIImages({
    apiKey: process.env.OPENAI_API_KEY,
    project: config.project,
  });
  const ready = Runtime.open(config, { ctx, api });
  let stopping;
  const stop = () =>
    (stopping ??= (async () => {
      const runtime = await ready.catch(() => null);
      await runtime?.close();
    })());
  ctx.on("dispose", stop);
  return ready.then((runtime) => {
    ctx.logger?.info?.(
      `弹幕画师：控制窗 ${runtime.server.origin}/control；采集舞台 ${runtime.server.origin}/stage；本次令牌见本机私有文件 ${runtime.tokenFile}`,
    );
  });
}
