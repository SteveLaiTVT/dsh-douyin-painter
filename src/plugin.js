import { loadConfig } from './config.js';
import { createApplication } from './bootstrap.js';
import { HarnessText } from './harness-text.js';
export const name = 'dsh-douyin-painter';
export const inject = ['agents', 'sessions', 'sessionPersistence'];

export function apply(ctx, input = {}) {
  const config = loadConfig(input);
  const text = input.textMode === 'api' ? undefined : new HarnessText(ctx, {
    provider: input.provider || 'deepseek-official',
    model: input.model || 'deepseek-flash',
    timeoutMs: input.textTimeoutMs || 30000,
  });
  // Dependency override permits a host-lifecycle test without opening ports.
  const ready = (input.createApplication || createApplication)(config, { text });
  let stopping;
  const stop = () => stopping ||= (async () => {
    await text?.close();
    const runtime = await ready.catch(() => null);
    await runtime?.close();
  })();
  ctx.on('dispose', stop);
  return ready.then(runtime => {
    ctx.logger?.info?.(`每日主题大赛：${runtime.server.origin}/control；舞台 ${runtime.server.origin}/stage`);
    return runtime;
  }, async () => {
    await text?.close();
    throw new Error('每日主题大赛启动失败，请检查本机端口与数据目录');
  });
}
