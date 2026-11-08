import {createHash} from 'node:crypto';
import {endpoint, requestJson, text} from './http.js';

export const VOICE_PRESETS: ReadonlyArray<Readonly<{id: string; label: string}>> = Object.freeze([
    Object.freeze({id: 'Chinese (Mandarin)_Radio_Host', label: '电台男主播'}),
    Object.freeze({id: 'Chinese (Mandarin)_Warm_Bestie', label: '温暖闺蜜'}),
    Object.freeze({id: 'Chinese (Mandarin)_Crisp_Girl', label: '清脆少女'}),
]);

function validVoice(value: any) {
    if (typeof value !== 'string' || value.length < 1 || value.length > 128 || !/^[\p{L}\p{N}][\p{L}\p{N} _().-]*$/u.test(value)) throw new Error('MiniMax 音色编号无效，请选择有效音色');
    return value;
}

class SpeechStreamError extends Error {}
const streamError: any = (message: any) => new SpeechStreamError(`语音${message}`);
const isMp3: any = (bytes: any) => bytes.length >= 3 && (bytes.subarray(0,3).toString() === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));

async function* sseData(reader: any, read: any, maxWireBytes: any, maxEventChars: any) {
    const decoder: any = new TextDecoder('utf-8', {fatal: true});
    let pending: any = '', data: any = [], eventChars: any = 0, received: any = 0;
    const line: any = (value: any) => {
        if (!value) { const event: any = data.length ? data.join('\n') : null; data = []; eventChars = 0; return event; }
        if (value.startsWith('data:')) {
            const part: any = value.slice(5).replace(/^ /, '');
            eventChars += part.length;
            if (eventChars > maxEventChars) throw streamError('流响应过大');
            data.push(part);
        }
        return null;
    };
    while (true) {
        const {value, done} = await read();
        if (!done) { received += value.length; if (received > maxWireBytes) throw streamError('流响应过大'); }
        try { pending += done ? decoder.decode() : decoder.decode(value, {stream: true}); }
        catch { throw streamError('流返回格式无效'); }
        while (true) {
            const match: any = /[\r\n]/.exec(pending);
            if (!match || (!done && pending[match.index] === '\r' && match.index === pending.length - 1)) break;
            const length: any = pending[match.index] === '\r' && pending[match.index+1] === '\n' ? 2 : 1;
            const event: any = line(pending.slice(0, match.index));
            pending = pending.slice(match.index + length);
            if (event !== null) yield event;
        }
        if (pending.length > maxEventChars) throw streamError('流响应过大');
        if (done) {
            if (pending) { const event: any = line(pending); if (event !== null) yield event; }
            if (data.length) yield data.join('\n');
            return;
        }
    }
}

export interface SpeechOptions {apiKey?: string; baseUrl?: string; model?: string; voiceId?: string; fetchImpl?: typeof fetch; timeoutMs?: number; maxStreamBytes?: number}
export interface SpeechInput {text?: string; signal?: AbortSignal; voiceId?: string}
export class MiniMaxSpeech {
  declare apiKey?: string; declare model: string; declare voiceId: string;
 declare fetchImpl: typeof fetch; declare timeoutMs: number; declare maxStreamBytes: number;
 private url: string;

    constructor({
                    apiKey,
                    baseUrl = 'https://api.minimax.cn/v1',
                    model = 'speech-2.8-hd',
                    voiceId = 'Chinese_worker_male',
                    fetchImpl = fetch,
                    timeoutMs = 60000,
                    maxStreamBytes = 10 * 1024 * 1024
                }: SpeechOptions = {}) {
        Object.assign(this, {apiKey, model, voiceId, fetchImpl, timeoutMs, maxStreamBytes});
        this.url = endpoint(baseUrl, 't2a_v2');
    }

    async openStream({text: content, signal, voiceId = this.voiceId}: SpeechInput = {}): Promise<{mime: string; chunks: AsyncGenerator<Buffer>}> {
        const selectedVoice: any = validVoice(voiceId);
        const narration: any = text(content, '朗读内容', 3000);
        if (typeof this.apiKey !== 'string' || !this.apiKey.trim()) throw new Error('请配置 MINIMAX_API_KEY');
        if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 300000) throw new Error('请求超时设置无效');
        if (!Number.isInteger(this.maxStreamBytes) || this.maxStreamBytes < 3 || this.maxStreamBytes > 10 * 1024 * 1024) throw new Error('语音流大小设置无效');
        const timer: any = AbortSignal.timeout(this.timeoutMs);
        const combined: any = signal ? AbortSignal.any([timer, signal]) : timer;
        let reader: any;
        const aborted: any = Promise.withResolvers();
        // The caller may abort before it begins consuming the returned iterator.
        aborted.promise.catch(() => {});
        const cancelledError: any = () => signal?.aborted ? streamError('请求已取消') : streamError('请求超时，请手动重试');
        const onAbort: any = () => { void reader?.cancel().catch(() => {}); aborted.reject(cancelledError()); };
        combined.addEventListener('abort', onAbort, {once: true});
        const cleanup: any = async () => {
            combined.removeEventListener('abort', onAbort);
            if (reader) { try { await reader.cancel(); } catch {} try { reader.releaseLock(); } catch {} }
        };
        const safe: any = (error: any) => {
            if (combined.aborted) return cancelledError();
            return error instanceof SpeechStreamError ? error : streamError('网络连接失败，请检查网络及服务地址');
        };
        try {
            if (combined.aborted) throw cancelledError();
            const request: any = this.fetchImpl(this.url, {
                method: 'POST',
                headers: {Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream'},
                signal: combined,
                body: JSON.stringify({model: this.model, text: narration, stream: true,
                    // Official T2AStreamOption: false includes the complete audio
                    // again in status=2. Exclude it and still defend below.
                    stream_options: {exclude_aggregated_audio: true},
                    voice_setting: {voice_id: selectedVoice, speed: 1, vol: 1, pitch: 0},
                    audio_setting: {sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1}}),
            });
            Promise.resolve(request).then((response: any) => { if (combined.aborted) void response.body?.cancel().catch(() => {}); }, () => {});
            const response: any = await Promise.race([request, aborted.promise]);
            if (!response.ok) {
                await response.body?.cancel();
                if ([401,403].includes(response.status)) throw streamError('认证失败，请核对凭据和账号权限');
                if (response.status === 429) throw streamError('请求受限，请稍后手动重试');
                throw streamError(`服务返回 HTTP ${response.status}，请稍后手动重试`);
            }
            if (!response.body) throw streamError('流返回格式无效，需要 SSE 响应');
            reader = response.body.getReader();
            if (!response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) {
                // HTTP 200 may still be a JSON business failure. Inspect only a
                // bounded envelope and never expose its status_msg/body.
                const parts: any = []; let count: any = 0;
                while (true) {
                    if (combined.aborted) throw cancelledError();
                    const item: any = await Promise.race([reader.read(), aborted.promise]);
                    if (item.done) break;
                    count += item.value.length;
                    if (count > 65536) throw streamError('流返回格式无效，需要 SSE 响应');
                    parts.push(Buffer.from(item.value));
                }
                let errorCode: any;
                try { errorCode = JSON.parse(Buffer.concat(parts).toString('utf8')).base_resp?.status_code; } catch {}
                if (Number.isInteger(errorCode) && errorCode !== 0) throw streamError(`服务未完成合成（错误码 ${errorCode}），请核对 MiniMax 凭据、余额和音色权限`);
                throw streamError('流返回格式无效，需要 SSE 响应');
            }
            const maxAudioBytes: any = this.maxStreamBytes;
            const chunks: any = (async function* () {
                let total: any = 0, header: any = Buffer.alloc(0), started: any = false, events: any = 0;
                const digest: any = createHash('sha256');
                const read: any = () => {
                    if (combined.aborted) throw cancelledError();
                    return Promise.race([reader.read(), aborted.promise]);
                };
                try {
                    for await (const event of sseData(reader, read, maxAudioBytes * 4 + 1024 * 1024, maxAudioBytes * 2 + 65536)) {
                        if (++events > 10000) throw streamError('流响应包过多');
                        if (event === '[DONE]') continue; // Not a substitute for status=2.
                        let packet: any;
                        try { packet = JSON.parse(event); } catch { throw streamError('流返回格式无效'); }
                        if (packet?.base_resp?.status_code !== 0) {
                            const code: any = Number.isInteger(packet?.base_resp?.status_code) ? `（错误码 ${packet.base_resp.status_code}）` : '';
                            throw streamError(`服务未完成合成${code}，请核对 MiniMax 凭据、余额和音色权限`);
                        }
                        const {audio, status} = packet.data || {};
                        if (![1,2].includes(status) || (audio != null && typeof audio !== 'string')) throw streamError('流返回格式无效');
                        const hex: any = audio || '';
                        if (hex.length % 2 || (hex && !/^[0-9a-fA-F]+$/.test(hex))) throw streamError('流音频编码无效');
                        if (hex.length / 2 > maxAudioBytes) throw streamError('流音频过大');
                        const bytes: any = Buffer.from(hex, 'hex');
                        if (status === 2) {
                            if (total && bytes.length) {
                                // Some gateways ignore exclude_aggregated_audio.
                                // The last packet is the full aggregate, not a delta.
                                if (bytes.length !== total || createHash('sha256').update(bytes).digest('hex') !== digest.digest('hex')) throw streamError('流汇总音频与已接收片段不一致');
                            } else if (!total && bytes.length) {
                                total = bytes.length; header = bytes;
                            }
                            if (!total || (!started && !isMp3(header))) throw streamError('流没有完整有效的 MP3 音频');
                            // audio_size describes the vendor's complete file,
                            // not a promised byte count for streamed MP3 chunks.
                            // Treat it as advisory; actual bytes remain bounded.
                            if (packet.extra_info?.audio_format !== undefined && packet.extra_info.audio_format !== 'mp3') throw streamError('流音频格式无效，需要 MP3');
                            if (!started && header.length) yield header;
                            return;
                        }
                        if (!bytes.length) continue;
                        total += bytes.length;
                        if (total > maxAudioBytes) throw streamError('流音频过大');
                        digest.update(bytes);
                        if (!started) {
                            header = Buffer.concat([header, bytes]);
                            if (header.length < 3) continue;
                            if (!isMp3(header)) throw streamError('流音频格式无效，需要 MP3');
                            started = true; yield header; header = Buffer.alloc(0);
                        } else yield bytes;
                    }
                    throw streamError('流未完整结束，请手动重试');
                } catch (error: any) { throw safe(error); }
                finally { await cleanup(); }
            })();
            return {mime: 'audio/mpeg', chunks};
        } catch (error: any) { await cleanup(); throw safe(error); }
    }

    async synthesize({text: content, signal, voiceId = this.voiceId}: SpeechInput = {}): Promise<{bytes: Buffer; mime: string}> {
        const selectedVoice: any = validVoice(voiceId);
        const result: any = await requestJson({
            url: this.url,
            apiKey: this.apiKey,
            keyName: 'MINIMAX_API_KEY',
            label: '语音',
            fetchImpl: this.fetchImpl,
            timeoutMs: this.timeoutMs,
            signal,
            maxBytes: 24 * 1024 * 1024,
            body: {
                model: this.model,
                text: text(content, '朗读内容', 3000),
                stream: false,
                voice_setting: {voice_id: selectedVoice, speed: 1, vol: 1, pitch: 0},
                audio_setting: {sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1}
            }
        });
        if (result.base_resp?.status_code !== 0) {
            const code: any = Number.isInteger(result.base_resp?.status_code) ? `（错误码 ${result.base_resp.status_code}）` : '';
            throw new Error(`语音服务未完成合成${code}，请核对 MiniMax 凭据、余额和音色权限`);
        }
        const encoded: any = result.data?.audio;
        if (result.data?.status !== 2 || typeof encoded !== 'string' || !encoded.length || encoded.length % 2 !== 0 || !/^[a-fA-F0-9]+$/.test(encoded)) throw new Error('语音返回数据无效或尚未完成');
        const bytes: any = Buffer.from(encoded, 'hex');
        const id3: any = bytes.subarray(0, 3).toString() === 'ID3';
        const frame: any = bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
        if (bytes.length < 3 || bytes.length > 10 * 1024 * 1024 || (!id3 && !frame)) throw new Error('语音返回格式无效，需要 MP3 音频');
        return {bytes, mime: 'audio/mpeg'};
    }
}
