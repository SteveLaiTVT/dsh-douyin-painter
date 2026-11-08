// Shared HTTP boundary: bounded requests, no automatic paid retries, no upstream
// bodies or transport URLs in public errors (they may contain credentials).
export function text(value: any, label: any, max: any = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error(`${label}不能为空，且不得超过 ${max} 字符`);
  return value.trim();
}
export function endpoint(baseUrl: any, path: any) {
  const url: any = new URL(`${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('模型服务地址格式无效');
  return url.href;
}
export interface RequestOptions {
 url: string; apiKey?: string; keyName: string; body: unknown; fetchImpl: typeof fetch;
 timeoutMs: number; signal?: AbortSignal; label: string; maxBytes?: number;
}
export async function requestJson({ url, apiKey, keyName, body, fetchImpl, timeoutMs, signal, label, maxBytes = 2 * 1024 * 1024 }: RequestOptions) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error(`请配置 ${keyName}`);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300000) throw new Error('请求超时设置无效');
  const timer: any = AbortSignal.timeout(timeoutMs);
  const combined: any = signal ? AbortSignal.any([timer, signal]) : timer;
  try {
    combined.throwIfAborted();
    const response: any = await fetchImpl(url, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, ...(body instanceof FormData ? {} : {'Content-Type': 'application/json'}) },
      body: body instanceof FormData ? body : JSON.stringify(body), signal: combined,
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403) throw new Error(`${label}认证失败，请核对凭据和账号权限`);
      if (response.status === 429) throw new Error(`${label}请求受限，请稍后手动重试`);
      throw new Error(`${label}服务返回 HTTP ${response.status}，请稍后手动重试`);
    }
    const declared: any = Number(response.headers.get('content-length'));
    if (declared > maxBytes) { await response.body?.cancel(); throw new Error(`${label}响应过大`); }
    const chunks: any = []; let size: any = 0;
    if (!response.body) throw new Error(`${label}返回格式无效`);
    const reader: any = response.body.getReader();
    try {
      while (true) {
        combined.throwIfAborted();
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) { await reader.cancel(); throw new Error(`${label}响应过大`); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new Error(`${label}返回格式无效`); }
  } catch (error: any) {
    if (signal?.aborted) throw new Error(`${label}请求已取消`);
    if (timer.aborted) throw new Error(`${label}请求超时，请手动重试`);
    // Only emit messages created by this boundary, never arbitrary server/SDK text.
    const safe: any = [`${label}认证失败`, `${label}请求受限`, `${label}服务返回 HTTP`, `${label}响应过大`, `${label}返回格式无效`];
    if (safe.some((prefix: any) => error.message?.startsWith(prefix))) throw error;
    throw new Error(`${label}网络连接失败，请检查网络及服务地址`);
  }
}
