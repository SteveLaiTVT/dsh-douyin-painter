# @stevelife/ai-kit

Node.js >=22 的 TypeScript ESM 通用 AI 客户端。支持 OpenAI 兼容图片生成/本地参考图、MiniMax MP3 与 SSE 流式语音、OpenAI 文件转录、兼容 chat/completions 的 JSON 文本请求。

不包含直播、比赛规则、角色提示词、文件持久化或 UI。调用者注入凭据、模型和地址；默认没有重试。只有调用方法时才请求服务，测试使用注入 fetch，不消耗模型额度。

```ts
import {OpenAIImage, MiniMaxSpeech, OpenAITranscription, JsonTextClient} from '@stevelife/ai-kit';
const image = new OpenAIImage({apiKey: process.env.OPENAI_API_KEY, model: 'your-image-model'});
const picture = await image.generate({prompt: '一只月光下的猫', format: 'png'});
const speech = new MiniMaxSpeech({apiKey: process.env.MINIMAX_API_KEY});
const audio = await speech.synthesize({text: '你好'});
const stream = await speech.openStream({text: '你好', signal: AbortSignal.timeout(30000)});
for await (const chunk of stream.chunks) { /* 写入音频输出 */ }
// 如果提前退出，使用 for-await 的 break 或 iterator.return() 释放响应。
const asr = new OpenAITranscription({apiKey: process.env.OPENAI_API_KEY});
const transcript = await asr.transcribe({bytes: audio.bytes, filename: 'voice.mp3', mime: 'audio/mpeg'});
const text = new JsonTextClient({apiKey: process.env.DEEPSEEK_API_KEY});
const result = await text.complete('只输出 JSON 对象', {question: '你好'});
```

语音识别是文件转录，不采集麦克风，不在直播项目中自动启用。转录默认 `gpt-transcribe`，可覆盖 `model`；文件上限为包自身设置的 25 MiB。接口依据 [OpenAI 文件转录文档](https://developers.openai.com/api/docs/guides/speech-to-text)。真实服务可用性、费用、模型权限需要调用方自行配置并验证。

HTTP 边界限制请求时长及响应体积，拒绝包含凭据、查询或片段的服务地址，屏蔽上游错误文本，传递 AbortSignal。传入的自定义 fetch 应遵守 signal。图片只接受本地字节参考图，不下载模型返回 URL；校验 PNG/GIF。GIF 扩展字段仅适合支持该协议的服务，并非所有 OpenAI 兼容端点都支持。

开发：`npm ci && npm test`。独立分发：`npm pack`，然后消费项目执行 `npm install /path/to/stevelife-ai-kit-0.1.0.tgz`。尚未发布公共 npm registry。仓库使用 MIT 许可，对外入口提供声明文件，内部供应商 JSON 校验保留动态类型。
