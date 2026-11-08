# 妙笔生花 · 每日主题大赛

本机直播互动应用：主播给主题，观众发弹幕，DeepSeek 选出好创意并接话，GPT Image 把创意变成 GIF 动图，MiniMax 朗读规则、弹幕和回复。

## 启动

```bash
npm install
npm start
```

打开 [操作台](http://localhost:3210/control) 和 [直播舞台](http://localhost:3210/stage)。仅监听本机，不需要账号、密码或控制令牌。操作台不进入直播采集，舞台窗口用来展示主题、作品和播音字幕。舞台按照你提供的《每日主题大赛 · 直播荧幕台.pdf》采用1080×1920竖屏四阶段布局，黑底、珊瑚红焦点与青绿提示；请以9:16窗口加入直播采集。

当前分支从 `main` 重建；原实现留在另一工作目录，不复用原来的复杂审核台。

## 跑一轮共创工作流

1. 在工作台保存今日主题和直播间，连接真实弹幕。打开舞台，点击一次「启用舞台声音」。
2. 选择主持音色，点击顶部主控「开场收词」。AI讲解主题和参与方式，开始90秒收词；可提前结束。AI主动挑值得回应的新发言，简短接话/追问，有趣原文和回复排队朗读。不会每条弹幕都调用模型。Agent会参考最近的全场回复，避免换昵称重复接话；同一主题的完整规则首次介绍后每3分钟最多提醒一次，短轮次重开不重复整套规则。暂停、关闭自动朗读或语音积压时不补播过期提醒。
3. 点击「结束收词并推荐」（或等待倒计时结束），DeepSeek按公开标准推荐最多3位观众；主播可移除或补选。失败时可明确点击「重试推荐」，不自动重复付费重试。
4. 点击「开始投票」，观众发送 `投1 / 投2 / 投3`，也接受 `投一 / 投二 / 投三`。按来源＋房间＋UID，每人最后一票生效；未知UID及默认手动代录不计正式票。投票30秒，可提前结束；连接丢失/未开播自动暂停，恢复后主播继续。
5. 有唯一票选赢家后点击「揭晓作画」，生成**原生GIF动图**并展示。0票或平票必须由主播点候选裁定。模型无法绕过投票，旧单项出图按钮在活跃工作流中禁用。
6. 可随时关闭AI接话、关闭/停止语音或暂停互动。生成中暂停不会重复请求GIF，完成后等主播恢复再上屏。音频按舞台播放结束回执串行推进，过时回复丢弃；队列错误会停止并显示原因。

默认音色为 MiniMax Speech 2.8 Turbo 电台男主播，另有温暖闺蜜、清脆少女；环境显式配置仍可覆盖。开始工作流之前不自动调用付费模型。重启恢复主题、直播间、历史作品，但不会自动重开比赛/投票/队列。

旧单项操作保留用于进阶调试。手动发言明确标记，不冒充真实弹幕。舞台只统计应用实际收到的有效票，不宣称平台官方投票或完全无遗漏。

## 凭据与可选设置

已有环境变量会直接复用。也可以复制 `.env.example` 为本机 `.env.local`，填写 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`MINIMAX_API_KEY`。只在服务端读取；浏览器只能看到「已配置/未配置」。未配置的服务会在使用时提示，不妨碍其他模块。

DeepSeek 默认 `deepseek-flash`，显式关闭思考；动图默认 `gpt-image-2.6-flare`（6帧、200ms/帧、size:auto；需账号GIF权限）；语音默认 `speech-2.8-turbo`。模型名、API 地址和音色可通过 `.env.example` 列出的环境变量调整。配置存在不等于账号权限或余额已验证。实际点击 AI 功能会调用相应付费 API；失败不自动重复收费重试。

首次准备采集器需要 Go 1.27.3 或更新版本及下载依赖的网络；当前开发机已成功编译。也可提前运行 `npm run setup:capture`，或用 `PAINTER_CAPTURE_BINARY` 指定已准备好的二进制。捕获使用固定版本的 douyinLive Go 库，应用与采集器之间走标准输入输出，不额外开放 1088 端口。平台若要求登录验证，可配置 `DOUYIN_COOKIE`；应用会区分未开播、无效房间和验证/网络异常。localhost 免登录不替代抖音上游登录要求。

主题、评论、作品和语音保存在 `.data/`，重启恢复记录，但不会自动开赛、重新调用模型或恢复声音。评论缓存上限 500 条：优先淘汰旧轮次，再淘汰占用过多记录的已知 UID，避免一个人刷屏挤掉其他观众的唯一创意。单轮每位已知观众最多提供 10 条不同候选（保留最早 2 条及最近 8 条），跨观众轮询分配全场最多 100 条候选；历史媒体不自动删除。

## UID、噪音和公平评选

采集完整传递消息 ID 和 UID；业务保留房间、来源与 UID，不用昵称识别人。消息传输重复按房间和来源去重。同一 UID 的重复文本在界面折叠并标记次数，不增加评选权重；不同创意及聊天仍保留。未知 UID 明确显示「身份未知」，不强行归并；手动代录可填写 UID 以验证流程，manual 与 live 身份分开。

规则机制位于 `src/comment-processing.ts`，主题相关性、聊天噪音和创意好坏由 DeepSeek 在收词后评选时判断，不对每条弹幕自动收费调用。每个已知观众每轮最多一个入选名额；可结合明确属于同一创意的补充，并展示实际引用的原文依据，不能跨观众拼接。模型若返回越界用户、重复名额或不存在的原文，会明确报错而非自动重试。实际语义筛选质量仍需真实模型调用验证。

## 模块与插件

- `src/app.ts`：主题比赛、任务状态、记录和媒体，不依赖 Harness。
- `src/providers/`：DeepSeek 解说/评估/评选/回复、OpenAI 图片、MiniMax 语音。
- `src/capture.ts`、`capture/`：自动管理的真实弹幕采集器。
- `src/server.ts`、`public/`：本机 HTTP/SSE、工作台和舞台。
- `src/harness-text.ts`、`src/plugin.ts`：最后挂接 Harness 的适配层，复用前述模块。宿主模式由 Harness 的 agents 服务执行文本任务，独立模式直连 DeepSeek API。

Harness 插件导出 `name/inject/apply`，`cordis.patch.yml` 提供 bundle 补丁。先按你的宿主版本将此本地包安装进 profile，再引用补丁；配置 `root` 为本项目绝对路径以读取本项目 `.env.local`/数据目录，`provider` 和 `model` 使用宿主已配置的 DeepSeek 路由。`textMode: api` 可在宿主中继续使用独立 API 模块。未实际加载宿主前，不将导入测试称为宿主验收。适配依据本机官方源码 SHA `571902028a75c64c1d767f4ae5fd099485f0ddf0`。

## 验证

```bash
npm test
npm run check
npm run test:browser
cd capture && go test ./...
```

浏览器测试使用离线注入适配器，不调用真实模型；需本机 Chrome，或 `npx playwright install chromium`。截图保存在 `.data/validation/`。详见 [验证记录](docs/VALIDATION.md)、[首版设计](docs/superpowers/specs/2026-11-07-daily-theme-design.md)。

上游：[douyinLive](https://github.com/jwwsjlm/douyinLive)（保留 MIT 许可）、[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)、[DeepSeek 非思考接口](https://api-docs.deepseek.com/guides/thinking_mode/)、[OpenAI Images](https://developers.openai.com/api/reference/resources/images/methods/generate)、[MiniMax 语音](https://platform.minimax.cn/docs/api-reference/speech-t2a-http)。

## 首播反馈调整

- 未指定画风时，采用朴素、克制、有生活质感的电影实物道具方向：单主体、自然光、日常材质、简单背景。经典电影道具参考须贴合创意；观众明确指定的风格优先。
- GIF 固定机位与主体形体，只做一个清楚的轻动作和自然闭环，避免默认赛博霓虹、密集光效与镜头运动。主播补选也应用同一美术规则。
- 一个词、常见商品和简短补充都能进入候选；旧低分或 eligible:false 不会永久阻止登记。只排除纯投票、明显无意义刷屏。
- MiniMax 使用 Turbo 流式音频，支持的 Chrome 舞台通过 MediaSource 收到首段即播；完整音频保存在本机供回放。最多两条并行合成，播放仍严格串行；待播最多三条，默认20秒过期。自动回复过长只显示文字，长原文不整段朗读。

当前默认美术进一步采用中国电影与生活语境的唯美小景，先保留物体可辨识的轮廓、结构和用途，再做情绪与光影。月光宝盒已接入实际电影片段参考图，通过图片编辑接口生成GIF；同一观众被选入的补充原文也会影响参考图和指定画风。参考素材及来源见 `assets/references/README.md`；其他未收录道具不会冒称已有真实图片参考。

「月亮便利店／月球便利店」目前采用露天月球路边摊：折叠桌或简易小推车直接摆在月壤上，少量小商品与便携暖灯营造摆摊感；远处可见月岩、环形山和蓝白地球。没有店墙、观察窗或室内店门，商品与已确认的电影道具造型仍是主角。


## 动画主持阿月

舞台下方加入原创月球机器人摊主，通过 `@livliv-dev/player` 0.3.0 的自定义 Body 接口播放。支持待机呼吸眨眼、随真实 MiniMax 流式语音开口、候选点头和揭晓微笑轻跳。人物不覆盖作品和字幕，保留直播边缘安全距离。控制板“显示动画主持”开关会保存到本机；隐藏人物不停止声音。

打开 `/stage` 后点击一次“启用舞台声音”，现有 audio 同时承担播音、嘴型分析和播放回执，不创建第二套语音队列。人物和播放器都由 localhost 提供，无摄像头或额外 AI 接口请求；动画依赖加载失败时保留原舞台与语音。系统开启减少动态效果时关闭闲置晃动和庆祝动作。

角色由本项目 Canvas 代码原创绘制，未使用 LivLiv 精选角色素材。播放器采用 Apache-2.0，许可见 [第三方说明](THIRD_PARTY_NOTICES.md)。电影道具截图另为本机可选素材，不随 Git 分发；需要时自行核对来源后运行 `npm run setup:references`，未准备图片也可按结构文字生成。

## 主题策划与 Review

控制板顶部新增“主题策划”：输入一个主题和可选补充，DeepSeek 非思考模式一次生成三个不同题材方向。每份方案包含故事钩子、世界背景、视觉风格、观众参与方式、玩法规则、三个示例、开场词、生图指导和3–5格可编辑故事板。

生成只保存草案。选择一个方向后可以修改所有字段、保存草稿，最后点击“确认并应用这份方案”。直播当前轮次进行时仍可准备草案，应用须等本轮结束。草案和已批准方案跨重启保留；多页面修改有版本校验，实时刷新不会覆盖未保存的编辑。

审核内容会进入主持接话、候选评选和生图；审核后的世界背景替代旧主题预设，观众明确的画风与道具辨识仍优先。开场使用审核后的开场词。故事板组织整场直播叙事，单个商品 GIF 只取一镜轻动作，不生成多镜头长片。虚构示例不会作为观众投稿计入比赛。单次生成不自动重试，失败保留上一份草案；旧的直接设置主题功能仍可使用。


## TypeScript 与通用 npm 包

源码目录为 `src/`、`web/`、`scripts/`、`tests/`，构建输出为 `dist/` 与 `public/*.js`。修改浏览器源码请编辑 `web/*.ts`，生成文件不纳入 Git。执行 `npm ci` 后：

- `npm run build` / `npm run check`：编译通用包、服务端、测试和浏览器源码；编译错误阻止输出。
- `npm test`：189 项应用离线回归；SDK 测试在独立仓库执行。
- `npm run test:browser`：Playwright 浏览器回归。
- `npm start`：先构建再启动；Harness 插件入口为 `dist/src/plugin.js`，安装本地插件前执行构建。
- `cd capture && go test ./...`：Go 采集器测试。

通用生成能力按项目独立维护，主项目通过固定 CNB Git 提交消费，不保留 SDK 源码副本：

| SDK | 责任 | 默认业务配置 |
| --- | --- | --- |
| [speech-generation](https://cnb.cool/stevelife524/lib/speech-generation) | 语音生成服务、MiniMax provider、整段/流式任务、诊断与重试 | 2 路执行，额外容量 8，60 秒总预算 |
| [image-generation](https://cnb.cool/stevelife524/lib/image-generation) | 图片生成服务、OpenAI-compatible provider、本地参考图与媒体校验 | 1 路执行，额外容量 8，120 秒总预算 |
| [task-runtime](https://cnb.cool/stevelife524/lib/task-runtime) | 共用有界队列、并发、生命周期、退避重试和结构化日志 | 由两个生成 SDK 内部使用 |

SDK 均为 strict TypeScript，发布了 CNB Release `v0.1.0` 的 npm tarball。`npm ci` 需要 CNB Git 读取权限，自动安装并构建依赖。当前为 Git/Release 分发，尚未发布 npm registry。

`src/providers/openai.ts`、`minimax.ts` 仅负责业务参数白名单、美术提示词和错误中文显示，实际任务由 SDK 服务队列执行。`PlaybackQueue` 只负责有界播放预取、过期策略、舞台回执与播放顺序，供应商并发由 SDK 统一控制。应用关闭会取消并关闭生成服务；流式音频只有在 SDK completion 和本地写入都完成后才成为成功回放。

重试默认1次（不重试），避免隐式重复付费。其他业务可在 SDK 配置中显式启用有限退避重试；未知扣费结果还需额外 opt-in，音频输出后不自动重试。默认输出结构化 warn/error 日志，可注入 logger 或关闭；事件带 taskId/provider/attempt，SDKError 带 taskId/attempt，支持业务关联与诊断。完整编排示例、接口与故障测试在各 SDK 仓库。

[旧 ai-kit](https://cnb.cool/stevelife524/lib/ai-kit) 继续兼容文本 JSON/文件 ASR 客户端；主项目不再从它消费 TTS 或生图。SDK 的 provider、通用服务机制与测试只在对应 SDK 仓库维护，业务项目显式升级依赖。


比赛提示词、主题策划、图片艺术指导仍属于应用，通用包不依赖这些模块。新增 ASR 是供其他项目复用的文件转录客户端；当前直播应用没有新增麦克风或转录交互。

迁移边界：全部可执行源码已迁移 TypeScript，并真正参与编译，没有 `noCheck` 或 `@ts-nocheck`。生成 SDK 使用 strict 编译并提供公开参数/结果声明。主项目仍是迁移期配置（`strict: false`），历史动态状态、DOM 适配及测试包含显式 `any` 和类索引签名；这并不等于完成领域类型建模。后续应按状态、动作和宿主接口逐模块收紧，而不是把编译通过当作完整类型安全。`dev` 当前监听编译产物；修改源码后需重新执行 build。
