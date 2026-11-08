import { randomUUID } from 'node:crypto';
import { DeepSeekText, baseInstruction } from './providers/deepseek.js';

// A fresh, private agent owns each text task. The durable inbox insertion is
// the admission boundary; whenIdle then settles that agent's activity interval.
// Source: deepseek-harness 571902028a75c64c1d767f4ae5fd099485f0ddf0.
export class HarnessText extends DeepSeekText {
  [key: string]: any;

  constructor(ctx: any, { provider = 'deepseek-official', model = 'deepseek-flash', timeoutMs = 30000, createUserMessage }: any = {}) {
    super({ model, timeoutMs });
    if (!ctx?.agents?.create || !ctx?.on) throw new Error('DeepSeek Harness agents 服务不可用');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300000) throw new Error('Harness 请求超时设置无效');
    Object.assign(this, { ctx, provider, createUserMessage, closed: false, tasks: new Set() });
  }
  async complete(instruction: any, payload: any, signal: any, {maxTokens=2500,timeoutMs=this.timeoutMs}: any={}) {
    if (this.closed) throw new Error('Harness 文本模块已关闭');
    if (signal?.aborted) throw new Error('Harness 文本任务已取消');
    const controller: any = new AbortController();
    const combined: any = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const task: any = { controller, promise: null };
    this.tasks.add(task);
    let handle: any, timedOut: any = false;
    const remove: any = [];
    const failed: any = Promise.withResolvers();
    const timer: any = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const aborted: any = () => {
      handle?.agent.cancel({ kind: 'user' });
      failed.reject(new Error(timedOut ? 'Harness 文本任务超时，请手动重试' : 'Harness 文本任务已取消'));
    };
    combined.addEventListener('abort', aborted, { once: true });
    const run: any = async () => {
      const makeMessage: any = this.createUserMessage || (await import('@deepseek-ai/dsh-llm').catch(() => { throw new Error('Harness 的 dsh-llm 消息接口不可用'); })).createUserMessage;
      combined.throwIfAborted();
      handle = await this.ctx.agents.create({
        sessionId: randomUUID(), signal: combined,
        agentOptions: { provider: this.provider, model: this.model, reasoningEffort: 'off', maxTokens },
        setup: (scope: any) => {
          if (!scope.tools?.restrict || !scope.tools?.guard || !scope.on) throw new Error('Harness tools guard 接口不可用');
          scope.tools.restrict({ allow: [] });
          // restrict filters inherited global tools. This monotonic guard also
          // denies tools registered later by the host's agent/preset scopes.
          scope.tools.guard(() => '每日主题文本任务不执行工具');
          let steps: any = 0, requests: any = 0;
          scope.on('agent/pre-step', async (_payload: any, next: any) => {
            if (steps++ >= 1) return { kind: 'reject' };
            return next();
          });
          // Recovery can repeat agent/request inside one step. Bound that
          // path separately so one task cannot spend on hidden model retries.
          scope.on('agent/request', async (_payload: any, next: any) => {
            if (requests++ >= 1) {
              const error: any = new Error('Harness 文本任务只允许一次模型请求');
              failed.reject(error);
              throw error;
            }
            return next();
          });
          scope.on('agent/request-error', async () => undefined);
        },
      });
      if (combined.aborted) { await handle.dispose(); handle = null; combined.throwIfAborted(); }
      const message: any = makeMessage({ content: [{ type: 'text', text: `${baseInstruction}\n${instruction}\n输入：${JSON.stringify(payload)}` }], source: { kind: 'user' } });
      const receipt: any = Promise.withResolvers();
      let admitted: any = false, finalText: any = '';
      remove.push(this.ctx.on('session/event', (session: any, event: any) => {
        if (session !== handle?.agent.session) return;
        if (event.type === 'agent/inbox/spliced' && event.data?.inserted?.some((item: any) => item.id === message.id)) {
          admitted = true; receipt.resolve();
        }
        if (admitted && event.type === 'assistant/message') {
          const content: any = event.data?.message?.content;
          if (!Array.isArray(content)) return;
          finalText = content.filter((block: any) => block.type === 'text').map((block: any) => block.text).join('');
          if (finalText.length > 100000) failed.reject(new Error('Harness 文本结果过长'));
        }
      }));
      remove.push(this.ctx.on('agent/error', ({ agent }: any) => {
        if (agent === handle?.agent) failed.reject(new Error('Harness 文本任务失败，请检查宿主模型配置'));
      }));
      await handle.agent.followup(message);
      await receipt.promise;
      await handle.agent.whenIdle();
      let result: any;
      try { result = JSON.parse(finalText); } catch { throw new Error('Harness 文本结果格式无效，请手动重试'); }
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Harness 文本结果格式无效');
      return result;
    };
    task.promise = (async () => {
      try { return await Promise.race([run(), failed.promise]); }
      catch (error: any) {
        if (combined.aborted) throw new Error(timedOut ? 'Harness 文本任务超时，请手动重试' : 'Harness 文本任务已取消');
        // Errors from the host can contain provider credentials or full prompts.
        if (error.message?.startsWith('Harness ')) throw error;
        throw new Error('Harness 文本任务失败，请检查宿主模型配置');
      } finally {
        clearTimeout(timer);
        combined.removeEventListener('abort', aborted);
        for (const off of remove) off?.();
        if (handle) {
          try { await handle.dispose(); }
          catch { throw new Error('Harness 文本任务清理失败，请检查宿主状态'); }
        }
        this.tasks.delete(task);
      }
    })();
    return task.promise;
  }
  async close() {
    this.closed = true;
    const tasks: any = [...this.tasks];
    for (const task of tasks) task.controller.abort();
    await Promise.allSettled(tasks.map((task: any) => task.promise));
  }
}
