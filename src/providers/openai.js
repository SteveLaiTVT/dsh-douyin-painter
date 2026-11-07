import omggif from 'omggif';
import { endpoint, requestJson, text } from './http.js';
import { buildArtPrompt } from '../art-direction.js';

function inspectGif(bytes) {
  try {
    if (!['GIF87a', 'GIF89a'].includes(bytes.subarray(0,6).toString('ascii')) || bytes.at(-1) !== 0x3b) throw Error();
    const reader = new omggif.GifReader(bytes);
    const frames = reader.numFrames(), { width, height } = reader;
    if (frames < 2 || frames > 16) throw Error();
    if (width < 1 || height < 1 || width > 2048 || height > 2048 || width * height > 4194304) throw Error();
    let durationMs = 0;
    for (let i = 0; i < frames; i++) {
      const frame = reader.frameInfo(i);
      const delayMs = frame.delay * 10;
      if (!Number.isInteger(delayMs) || delayMs < 20 || delayMs > 655350 || frame.width < 1 || frame.height < 1 || frame.x + frame.width > width || frame.y + frame.height > height || frame.palette_offset == null || frame.palette_offset + frame.palette_size * 3 > bytes.length || frame.data_offset + frame.data_length > bytes.length) throw Error();
      durationMs += delayMs;
    }
    return { frames, width, height, durationMs };
  } catch { throw new Error('GIF 动图数据无效，需要至少2帧、有效尺寸和帧间隔的完整 GIF'); }
}

function referenceImages(references) {
  if (!Array.isArray(references) || references.length > 3) throw new Error('参考图必须为最多3张本机图片');
  let total = 0;
  const safe = references.map(reference => {
    if (!reference || typeof reference !== 'object' || !Buffer.isBuffer(reference.bytes) || reference.bytes.length < 1 || reference.bytes.length > 5 * 1024 * 1024) throw new Error('参考图数据无效，每张必须为不超过5MB的本机图片');
    const {bytes,mime} = reference;
    const valid = mime === 'image/png' ? bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))
      : mime === 'image/jpeg' ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : mime === 'image/webp' ? bytes.length >= 12 && bytes.subarray(0,4).toString('ascii') === 'RIFF' && bytes.subarray(8,12).toString('ascii') === 'WEBP' : false;
    if (!valid) throw new Error('参考图格式无效，仅接受真实 PNG、JPEG 或 WebP 图片');
    total += bytes.length;
    if (total > 10 * 1024 * 1024) throw new Error('参考图总大小不能超过10MB');
    return {bytes,mime};
  });
  // No URL, filesystem path, file_id or arbitrary input fields cross this
  // boundary. The caller supplies already-loaded local reference bytes.
  return safe.map(({bytes,mime}) => ({image_url:`data:${mime};base64,${bytes.toString('base64')}`}));
}

export class OpenAIImage {
  constructor({ apiKey, baseUrl = 'https://api.openai.com/v1', model = 'gpt-image-2.6-flare', fetchImpl = fetch, timeoutMs = 120000, size = '1024x1024', quality = 'medium', format = 'png' } = {}) {
    Object.assign(this, { apiKey, model, fetchImpl, timeoutMs, size, quality, format });
    this.url = endpoint(baseUrl, 'images/generations');
    this.editUrl = endpoint(baseUrl, 'images/edits');
  }
  async generate({ prompt, signal, format = this.format, originalText = '', theme = '', style = '', artDirected = false, references = [] } = {}) {
    if (signal?.aborted) throw new Error('图片请求已取消');
    const images = referenceImages(references);
    if (!['png', 'gif'].includes(format)) throw new Error('图片格式仅支持 PNG 或 GIF');
    const animation = format === 'gif';
    const sourcePrompt = text(prompt, '绘画描述', 8000);
    // Only the application's internal call contract can skip the second
    // wrapper. Text returned by a model cannot manufacture this boolean.
    const directedPrompt = artDirected === true ? sourcePrompt : buildArtPrompt({prompt:sourcePrompt,originalText,theme,style,format});
    const body = { model: this.model, prompt: directedPrompt, n: 1, size: animation ? 'auto' : this.size, quality: this.quality, output_format: format };
    if (animation) Object.assign(body, { frame_count: 6, frame_duration_ms: 200, stream: false });
    if (images.length) body.images = images;
    // GIF preview/model failures propagate; never retry as a static image.
    const result = await requestJson({ url: images.length ? this.editUrl : this.url, apiKey: this.apiKey, keyName: 'OPENAI_API_KEY', label: animation ? 'GIF 图片' : '图片', fetchImpl: this.fetchImpl, timeoutMs: this.timeoutMs, signal, maxBytes: 32 * 1024 * 1024, body });
    const encoded = result.data?.[0]?.b64_json;
    if (typeof encoded !== 'string' || !encoded.length || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error(animation ? 'GIF 图片返回数据无效' : '图片返回数据无效');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length > 20 * 1024 * 1024) throw new Error(animation ? 'GIF 动图超过20MB限制' : '图片超过20MB限制');
    if (animation) return { bytes, mime: 'image/gif', info: {...inspectGif(bytes), ...(images.length ? {referenceCount: images.length} : {})} };
    if (bytes.length < 8 || !bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) throw new Error('图片返回格式无效，需要 PNG 图片');
    return { bytes, mime: 'image/png', ...(images.length ? {info: {referenceCount: images.length}} : {}) };
  }
}
