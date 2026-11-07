import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { ensureCapture } from '../scripts/setup-capture.mjs';

export function normalizeRoom(value) {
  if (typeof value !== 'string') throw Error('请输入直播间号或 live.douyin.com 链接');
  let room = value.trim();
  if (/^https?:\/\//i.test(room)) {
    let url;
    try { url = new URL(room); } catch { throw Error('直播间链接格式不正确'); }
    if (url.hostname !== 'live.douyin.com' || url.username || url.password || url.port) throw Error('请使用 live.douyin.com 的直播间链接');
    room = url.pathname.replace(/^\//, '').replace(/\/$/, '');
  }
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(room)) throw Error('请输入有效直播间号或 live.douyin.com 链接');
  return room;
}
export function parseCaptureLine(line) {
  try {
    const input = JSON.parse(line);
    if (input.type === 'status' && typeof input.state === 'string' && typeof input.message === 'string') {
      const status = { type: 'status', state: input.state.slice(0, 40), message: input.message.slice(0, 500) };
      for (const key of ['receivedMessages','receivedComments','decodedComments','lastMessageAt','lastCommentAt','decodeErrors'])
        if (Number.isSafeInteger(input[key]) && input[key] >= 0) status[key] = input[key];
      return status;
    }
    if (input.type !== 'comment' || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4096) return null;
    return { type: 'comment', id: String(input.id || ''), text: input.text.trim(), nickname: String(input.nickname || '观众').slice(0, 100), userId: String(input.userId || ''), receivedAt: Number.isFinite(input.receivedAt) ? input.receivedAt : Date.now() };
  } catch { return null; }
}
export class Capture extends EventEmitter {
  constructor({ binary, cookie = '', spawnImpl = spawn, prepare = ensureCapture, stopTimeoutMs = 2500, killTimeoutMs = 2500 } = {}) {
    super(); Object.assign(this, { binary, cookie, spawnImpl, prepare, stopTimeoutMs, killTimeoutMs });
    this.generation = 0; this.child = null; this.starting = false;
  }
  status(state, message) { this.emit('status', { state, message, active: Boolean(this.child || this.preparation || this.starting) }); }
  async start(value) {
    const room = normalizeRoom(value);
    await this.stop();
    const generation = ++this.generation;
    this.starting = true;
    const controller = new AbortController();
    const preparation = { controller };
    this.preparation = preparation;
    try {
      preparation.promise = Promise.resolve().then(() => this.prepare({ binary: this.binary, signal: controller.signal, onProgress: message => {
        if (generation === this.generation) this.status('preparing', message);
      } }));
      this.status('preparing', '正在准备弹幕采集器…');
      const binary = await preparation.promise;
      if (this.preparation === preparation) this.preparation = null;
      if (generation !== this.generation) return;
      const child = this.spawnImpl(binary, ['--room', room], {
        stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PAINTER_CAPTURE_COOKIE: this.cookie },
      });
      this.child = child;
      let resolveExit;
      this.exited = new Promise(resolve => { resolveExit = resolve; });
      let spawned = false;
      child.once('spawn', () => { spawned = true; });
      child.once('error', () => {
        // A failed spawn has no process and need not emit exit. Runtime errors,
        // however, do not prove an already spawned process has terminated.
        if (!spawned) {
          if (this.child === child) this.child = null;
          resolveExit();
        }
      });
      let buffer = ''; const decoder = new StringDecoder('utf8');
      child.stdout.on('data', bytes => {
        if (generation !== this.generation) return;
        buffer += decoder.write(bytes);
        if (buffer.length > 1024 * 1024) { buffer = ''; this.status('error', '弹幕采集器返回异常数据，已丢弃'); return; }
        let position;
        while ((position = buffer.indexOf('\n')) !== -1) {
          const event = parseCaptureLine(buffer.slice(0, position)); buffer = buffer.slice(position + 1);
          if (!event) continue;
          const { type, ...payload } = event;
          this.emit(type, type === 'status' ? { ...payload, active: true } : payload);
        }
      });
      child.stderr.on('data', () => {}); // Raw upstream diagnostics may contain login data.
      child.once('exit', (code, signal) => {
        resolveExit();
        if (this.child === child) this.child = null;
        if (generation === this.generation) this.status('error', `弹幕采集已结束（${signal || code}），请重新连接直播间`);
      });
      await new Promise((resolveSpawn, reject) => {
        child.once('spawn', resolveSpawn);
        child.once('error', () => reject(Error('无法启动弹幕采集器，请运行 npm run setup:capture 后重试')));
      });
      if (generation === this.generation) this.status('connecting', '正在连接抖音直播间…');
    } catch (error) {
      if (generation !== this.generation && controller.signal.aborted) return;
      if (generation === this.generation) this.status('error', error.message);
      throw error;
    } finally {
      if (this.preparation === preparation) this.preparation = null;
      if (generation === this.generation) this.starting = false;
    }
  }
  async stop() {
    ++this.generation;
    if (this.stopping) return this.stopping;
    const preparation = this.preparation;
    if (preparation) {
      preparation.controller.abort();
      const stopping = preparation.promise.catch(() => {}).then(() => {
        this.starting = false;
        this.status('stopped', '弹幕采集已停止');
      });
      this.stopping = stopping;
      try { await stopping; } finally { if (this.stopping === stopping) this.stopping = null; }
      return;
    }
    const child = this.child;
    if (!child) {
      this.starting = false;
      this.status('stopped', '弹幕采集已停止');
      return;
    }
    const exited = this.exited;
    const waitForExit = async timeout => {
      let timer;
      try {
        return await Promise.race([
          exited.then(() => true),
          new Promise(resolve => { timer = setTimeout(() => resolve(false), timeout); }),
        ]);
      } finally { clearTimeout(timer); }
    };
    const stop = (async () => {
      try { child.kill('SIGTERM'); } catch { /* Exit notification remains authoritative. */ }
      if (!await waitForExit(this.stopTimeoutMs)) {
        try { child.kill('SIGKILL'); } catch { /* Retain ownership until actual exit. */ }
        if (!await waitForExit(this.killTimeoutMs)) {
          const message = '弹幕采集进程尚未退出，暂时不能重新连接，请稍后重试';
          this.status('error', message);
          throw Error(message);
        }
      }
      this.starting = false;
      this.status('stopped', '弹幕采集已停止');
    })();
    this.stopping = stop;
    try { await stop; }
    finally { if (this.stopping === stop) this.stopping = null; }
  }
}
