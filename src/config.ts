import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';

export function loadConfig({root = process.cwd(), env = process.env, ...input}: any = {}) {
    let local: any = {};
    try {
        local = parseEnv(readFileSync(resolve(root, '.env.local'), 'utf8'));
    } catch (e: any) {
        if (e.code !== 'ENOENT') throw Error('.env.local 无法读取');
    }
    const values: any = {...local, ...env};
    const port: any = Number(input.port ?? values.PAINTER_PORT ?? 3210);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('PAINTER_PORT 必须是有效端口');
    return {
        root,
        port,
        dataDir: resolve(root, input.dataDir || values.PAINTER_DATA_DIR || '.data'),
        deepseekKey: values.DEEPSEEK_API_KEY || values['deepseek-api-key'] || '',
        minimaxKey: values.MINIMAX_API_KEY || '',
        openaiKey: values.OPENAI_API_KEY || '',
        deepseekBaseUrl: values.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
        deepseekModel: values.DEEPSEEK_MODEL || 'deepseek-flash',
        openaiBaseUrl: values.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        imageModel: values.OPENAI_IMAGE_MODEL || 'gpt-image-2.6-flare',
        outputFormat: values.PAINTER_OUTPUT_FORMAT || 'gif',
        minimaxBaseUrl: values.MINIMAX_BASE_URL || 'https://api.minimax.cn/v1',
        speechModel: values.MINIMAX_SPEECH_MODEL || 'speech-2.8-turbo',
        voiceId: values.MINIMAX_VOICE_ID || 'Chinese (Mandarin)_Radio_Host',
        cookie: values.DOUYIN_COOKIE || '',
        captureBinary: values.PAINTER_CAPTURE_BINARY || undefined
    };
}
