import { access, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const defaultCaptureBinary = join(root, 'data', 'bin', `douyin-capture${process.platform === 'win32' ? '.exe' : ''}`);
let preparing;
export async function ensureCapture({ binary = defaultCaptureBinary, onProgress = () => {}, signal, spawnImpl = spawn, force = false } = {}) {
  signal?.throwIfAborted();
  if (!force) {
    try {
      await access(binary, constants.X_OK);
      const output = await stat(binary);
      const sources = (await readdir(join(root, 'capture'))).filter(file => file.endsWith('.go') && !file.endsWith('_test.go'));
      const inputs = await Promise.all([...sources, 'go.mod', 'go.sum'].map(file => stat(join(root, 'capture', file))));
      signal?.throwIfAborted();
      if (output.mtimeMs >= Math.max(...inputs.map(file => file.mtimeMs)) || binary !== defaultCaptureBinary) return binary;
    } catch { /* First use builds the included bridge. */ }
  }
  signal?.throwIfAborted();
  if (binary !== defaultCaptureBinary) throw Error('找不到指定的弹幕采集器，请检查 PAINTER_CAPTURE_BINARY 路径');
  preparing ??= buildCapture(binary, { onProgress, signal, spawnImpl }).finally(() => { preparing = undefined; });
  return preparing;
}
async function buildCapture(binary, { onProgress, signal, spawnImpl }) {
  onProgress('首次连接正在准备弹幕采集器，请稍候…');
  await mkdir(dirname(binary), { recursive: true });
  signal?.throwIfAborted();
  const temporary = `${binary}.${process.pid}.tmp`;
  try {
    await new Promise((resolveBuild, reject) => {
      const detached = process.platform !== 'win32';
      const child = spawnImpl('go', ['build', '-trimpath', '-o', temporary, '.'], {
        cwd: join(root, 'capture'), stdio: ['ignore', 'ignore', 'pipe'], detached,
      });
      let stderr = '', failure, escalation;
      const kill = signalName => {
        try {
          // Go invokes compiler/linker children. Keep all of them in an owned
          // group so cancelling the parent does not leave its build running.
          if (detached && child.pid) process.kill(-child.pid, signalName);
          else child.kill(signalName);
        } catch { /* Wait for the exit event even if kill reports ESRCH. */ }
      };
      const terminate = error => {
        if (failure) return;
        failure = error;
        kill('SIGTERM');
        escalation = setTimeout(() => kill('SIGKILL'), 1000);
      };
      const abort = () => terminate(signal.reason instanceof Error ? signal.reason : new DOMException('采集器准备已取消', 'AbortError'));
      const cleanup = () => {
        clearTimeout(timer); clearTimeout(escalation);
        signal?.removeEventListener('abort', abort);
        if (failure) kill('SIGKILL'); // Reap any compiler descendants too.
      };
      child.stderr.on('data', data => { stderr = (stderr + String(data)).slice(-8000); });
      const timer = setTimeout(() => terminate(Error('采集器准备超时，请检查网络后运行 npm run setup:capture')), 240000);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      child.once('error', error => {
        cleanup();
        reject(failure || Error(error.code === 'ENOENT'
          ? '首次准备弹幕采集器需要 Go 1.27.3 或更新版本，请安装 Go 后运行 npm run setup:capture'
          : '无法启动采集器构建，请运行 npm run setup:capture 检查本机环境'));
      });
      child.once('exit', code => {
        cleanup();
        if (failure) reject(failure);
        else if (code === 0) resolveBuild();
        else reject(Error('弹幕采集器准备失败，请检查 Go 和网络后运行 npm run setup:capture。' + (stderr.includes('go: downloading') ? '依赖下载尚未完成。' : '')));
      });
    });
    signal?.throwIfAborted();
    await rename(temporary, binary);
    return binary;
  } finally { await unlink(temporary).catch(() => {}); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort); process.once('SIGTERM', abort);
  try { console.log(await ensureCapture({ onProgress: console.log, signal: controller.signal })); }
  catch (error) { console.error(error.name === 'AbortError' ? '采集器准备已取消' : error.message); process.exitCode = error.name === 'AbortError' ? 130 : 1; }
  finally { process.off('SIGINT', abort); process.off('SIGTERM', abort); }
}
