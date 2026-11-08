# 语音生成与图像生成服务 SDK 设计

## 目标与已确认约束

用户需要按能力独立维护的服务 SDK，而非集中封装供应商 HTTP 请求。已确认第一版为 Node.js / TypeScript 进程内 SDK，预留扩展；不在第一版引入独立部署、跨进程队列与重启恢复。SDK 源码与版本归属 CNB `stevelife524/lib`，业务项目通过固定版本消费。

本设计的命名、接口和默认值是实施建议，待用户审阅。现有 `ai-kit` 保持兼容，不删除已有发布版本。

## 方案选择

1. 继续一个 ai-kit：版本与能力混在一起，无法体现语音和生图各自服务边界，不采用。
2. 两个能力 SDK，各自复制任务机制：对外边界清楚，但取消、队列和重试会重复维护。
3. 两个能力 SDK，加一个小型 task-runtime：推荐。能力契约和 provider 属于各自 SDK；执行内核仅处理通用任务调度，不认识音频、图片和业务。

用户选择了进程内 SDK；建议采用第三种代码组织，以下均据此展开。

## 仓库与责任

| CNB 仓库 | npm 包 | 责任 |
| --- | --- | --- |
| lib/task-runtime | @stevelife/task-runtime | 有界队列、并发、任务生命周期、取消/截止时间、重试策略、结构化事件 |
| lib/speech-generation | @stevelife/speech-generation | 语音生成契约、音色/格式能力、整段与流式结果、MiniMax provider、音频验证 |
| lib/image-generation | @stevelife/image-generation | 生图契约、本地参考图、格式/尺寸能力、OpenAI-compatible provider、图片验证 |

task-runtime 为两个能力 SDK 的依赖，业务通常无需直接使用。禁止其承载供应商请求、通用大模型 API 或业务提示词。两个能力 SDK 均可独立安装、测试、打包和发布；不从 dsh-douyin-painter 或 ai-kit 导入运行时代码。

语音识别、文本请求暂时继续由旧 ai-kit 提供；不把 ASR 混进语音生成契约。本轮仅将项目中正在使用的 TTS 与生图迁移到新 SDK。

## Provider 槽位

语音 provider 暴露 `id`、`capabilities`、`synthesize(request, context)` 和可选 `stream(request, context)`。能力描述包含支持的格式、是否流式及可提供的音色信息。语音请求统一包含 text、voice、model 和输出选项；供应商特有参数放独立 namespace，不能与统一字段冲突。

图片 provider 暴露 `id`、`capabilities`、`generate(request, context)`，请求包含 prompt、model、format、size、quality、可选本地参考图。PNG/GIF 和参考图支持情况需要显式声明：GIF 扩展不是 OpenAI 标准能力，不支持时在发送请求前拒绝。固定协议的参数映射由 provider 负责。

context 包含 taskId、attempt、signal 和事件出口。新增 provider 只需实现能力契约和合约测试；不得要求业务更改调度代码。

服务配置明确选择 provider 或默认 provider；第一版不自动切换供应商。provider 注册重复 id、无 provider、无效并发数和无效队列容量在初始化时拒绝。

## 面向业务的服务接口

```ts
const speech = new SpeechService({
  providers: [new MiniMaxProvider({ apiKey })],
  defaultProvider: 'minimax',
  concurrency: 2,
  maxPending: 32,
  logger,
});

const image = new ImageService({
  providers: [new OpenAICompatibleImageProvider({ apiKey, capabilities })],
  defaultProvider: 'openai-compatible',
  concurrency: 1,
  maxPending: 8,
  logger,
});

const task = speech.submit({ text: '你好', voice: voiceId }, {
  signal,
  timeoutMs: 60_000,
  metadata: { workflowId: roundId },
});
const audio = await task.result;
const picture = await image.generate({ prompt, format: 'png' }, { signal });
await Promise.all([speech.close({ mode: 'drain' }), image.close({ mode: 'cancel' })]);
```

`submit` 返回 handle：id、只读状态快照、result、cancel。result 的拒绝立即受到内部观察，调用方晚一点 await 不会造成未处理拒绝；调用方 await 仍收到失败。`synthesize` / `generate` 是走同一队列的快捷调用，不绕开调度。

流式接口 `speech.stream(request, options)` 通过 Promise 返回流式 handle：音频元信息、chunks、completion、cancel。chunks 为单消费者 AsyncIterable<Uint8Array>，重复订阅明确拒绝；提交即入队，在执行并获取合法首段后返回 handle，获取首段前失败则 stream() 拒绝。按消费请求拉取上游，SDK 不预取无界音频；可配置单片段/累计字节上限。for-await 提前 break/throw 自动调用 iterator.return 并取消上游。总预算默认60秒（从提交开始）；拿到 handle 却不消费的流也在预算内超时清理。stream() 以及 completion 的内部派生拒绝均立即被观察；总预算定时器在没有消费者时仍生效。业务可在首段音频到来后播放，但 completion 才表示完整生成成功。不把“拿到 reader”或“首段可播放”记作任务成功。

## 执行内核

- FIFO 有界等待队列；running 单独受 concurrency 限制。接收容量总上限固定为 concurrency + maxPending：queued、running、retry_wait 和尚未清理的任务都占一个接收名额，实际清理完成才归还。maxPending 是额外接收预算；重试恢复可能使瞬时等待长度略大于该值，但不会突破总容量。满容量明确抛 QueueFullError，不静默丢任务。
- 第一版不支持优先级、自动抢占和分布式速率限制；避免将实时业务过期策略硬编码进通用层。
- 状态：queued → running → retry_wait → running → succeeded / failed / cancelled / timed_out；终态只产生一次。handle.result 在成功时返回结果，在其他终态拒绝。
- timeoutMs 是包含排队、重试等待和执行在内的总预算；每次尝试可另设 attemptTimeoutMs。排队任务超时或取消后不触发 provider。
- 重试退避期间不占执行名额，但仍占接收名额；重新就绪后按就绪顺序排队。不得把 retry_wait 移出容量统计后无限接收新任务。
- 逻辑任务终态和资源退出分开记录：取消或总超时立即确定终态、拒绝 result/completion 并发出一次终态事件；resourceState 仍可为 cleaning/stalled。调度并发、容量统计和 close 必须等待资源退出，不能只看逻辑终态。attemptTimeout 只有在旧尝试完全退出后才能重试；忽略 abort 的旧尝试尚在执行时不能开启新尝试。
- 普通结果仅在校验和 provider 清理完成后释放名额。流式结果在完整消费、失败或取消且执行清理后释放，不能提前按首次返回计算并发。
- 取消必须移除排队项、撤销重试定时器、向正在执行的 provider 传递 AbortSignal，并关闭流 reader。忽略 signal 的自定义 provider 不可被 JS 强杀；SDK 不得在其仍执行时假装释放名额。应保留占用并记录 stalled，用户可在 close 中指定有界等待；报告未退出任务，不宣称已完全关闭。
- `close(drain)` 拒绝新任务并等待已接收任务；`close(cancel)` 取消未完成任务。close 超时明确拒绝并给出剩余任务数。
- 第一版内存队列不持久化。通过小型调度与事件接口预留持久化实现扩展，不宣称现有服务能直接跨进程运行。

## 重试、错误与试错

SDKError 包含 code、provider、taskId、attempt、retryable、requestDisposition。可区分输入无效、认证/权限、限流、供应商失败、网络、响应格式、队列满、取消和超时。

默认 maxAttempts=1。应用现有自动付费重试行为不改变。业务可显式配置有限尝试次数、指数退避上限及 jitter，并选择重试错误类别。

认证、参数错误、取消、媒体校验失败不重试。无法判断供应商是否已生成/扣费的超时和断连默认标记为 unknown，不自动重试；业务明确接受可能重复计费后才允许。收到限流响应可在启用重试时遵守有上限的 Retry-After。

流式音频一旦交付首个片段，该任务不再自动重试或切换 provider，避免重复音频和混合音频。原失败原因与各次尝试记录保留在 task 诊断快照中；人工重试是新任务，通过 parentTaskId 关联。

提供注入 fake provider 的可运行示例，演示正常、限流重试、失败诊断、取消和队列满；不依赖真实凭据或产生费用。这里把用户所说“试错”先落实为可诊断失败、显式重试和模拟调试；不增加管理后台。

## 日志和可观测性

日志是 SDK 内建的结构化事件，默认不输出到 console，提供可直接使用的结构化 console logger（默认只输出 warn/error），并允许注入 logger/event sink 或显式关闭日志。宿主可接到自己的文件、日志平台或 OpenTelemetry 适配层；SDK 第一版不强绑定外部平台。事件含 taskId、parentTaskId、provider、attempt、state、queueWaitMs、durationMs、errorCode 和允许的业务关联标识。

提供 queued、started、retry_scheduled、stream_started、succeeded、failed、cancelled、timed_out、stalled、closed 事件，以及等待/执行数量和累计结果的 stats 快照。logger 抛错不能破坏任务执行，不持久保存无限日志。

默认不记录 API key、Authorization、服务 URL 查询、供应商原始错误体、提示词、朗读文本和音频/图片数据。metadata 限制键数和值长度，仅保留字符串/数字/布尔标识，禁止扩散任意大对象。

## 主项目接入

bootstrap 创建 SpeechService/ImageService；项目不再直接 new MiniMax/OpenAI 请求客户端。艺术指导、比赛规则、主题策划、投票等保留业务侧。

当前 SpeechQueue 同时管理两路生成和单路播放。将生成并发与请求超时交给 SDK；业务队列仅保留待播顺序、实时发言过期/丢弃策略、舞台播放/停止回调与 revision 确认。应用媒体存储与 HTTP progressive transport 留在应用层，通过流式 handle 接入；它们不是供应商 TTS 的责任。

停止语音、切换主题、关闭应用必须贯穿 SDK 取消与流清理。项目队列和 SDK 队列要有各自上限，避免嵌套产生无界等待。既有业务生成窗口可保留为前取控制，但不能再作为供应商实际并发的唯一限制。

## 验收与分发

1. 每个仓库 strict 编译，公开契约和核心实现不用 any/索引签名逃避类型。
2. 调度器测试真实覆盖并发上限、满队列、FIFO、排队超时、运行取消、重试退避释放名额、logger 异常和关闭时任务清理。
3. 流式测试覆盖首段后失败、不消费流的总超时、提前退出取消、首段后不重试，以及直到完成才释放名额。
4. 两个 SDK 各自具有供应商适配测试和自定义 fake provider 合约测试。整段音频与图片按格式验证。
5. 用独立空项目安装 CNB 安装包，运行两个 SDK 的编排示例；在主项目通过既有应用和浏览器回归。
6. 三个仓库分别保存源码、测试、README、版本和 Release 安装包；发布前运行独立 npm ci/test/pack。当前 CNB Git/Release 分发方式继续使用，不把 Release 当 npm registry。
7. 测试通过不等于真实供应商验收；真实 API 质量、扣费与服务端限流需要单独记录。

## 实施顺序

先完成 task-runtime 及故障测试，再完成语音生成 SDK（包括流式生命周期），再完成图片 SDK，最后迁移主项目和分别发布。旧 ai-kit 的兼容入口不删除；项目停止从它消费 TTS/生图，ASR/文本可暂留。

设计复核：已补齐总接收容量、单消费者流/背压/不消费超时，以及逻辑终态与资源退出分离的契约。
