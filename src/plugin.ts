import { loadConfig } from './config.js';
import { createApplication } from './bootstrap.js';
import { HarnessText } from './harness-text.js';
export const name: any = 'dsh-douyin-painter';
export const inject: any = ['agents', 'sessions', 'sessionPersistence'];

export function apply(ctx: any, input: any = {}) {
  const config: any = loadConfig(input);
  const text: any = input.textMode === 'api' ? undefined : new HarnessText(ctx, {
    provider: input.provider || 'deepseek-official',
    model: input.model || 'deepseek-flash',
    timeoutMs: input.textTimeoutMs || 30000,
  });
  // Dependency override permits a host-lifecycle test without opening ports.
  const ready: any = (input.createApplication || createApplication)(config, { text });
  let stopping: any;
  const stop: any = () => stopping ||= (async () => {
    await text?.close();
    const runtime: any = await ready.catch(() => null);
    await runtime?.close();
  })();
  ctx.on('dispose', stop);
  return ready.then((runtime: any) => {
    ctx.logger?.info?.(`每日主题大赛：${runtime.server.origin}/control；舞台 ${runtime.server.origin}/stage`);
    return runtime;
  }, async () => {
    await text?.close();
    throw new Error('每日主题大赛启动失败，请检查本机端口与数据目录');
  });
}
