# 每日主题大赛：本机首版

用户最新需求取代旧分支的设计：本机免登录；完整弹幕捕获；主题槽；DeepSeek 非思考模式负责解说规则、评估选词和回复观众；GPT Image 出图；MiniMax 合成朗读；业务模块独立运行，最后接 DeepSeek Harness 插件。复用已有凭据，开发期间不发付费请求。

## 方案与产品流程
采用 Node.js 本机应用、浏览器操作台与独立舞台、模块化业务核心。采集使用应用管理的 Go 子进程（douyinLive 开源库），通过标准输出 JSONL 传消息，避免让用户安装、启动另一套服务。模型直接 API 适配器在独立模式可用，Harness 插件最终注入文本任务适配器，复用同一业务核心。与仅提供外部 WS 接口相比，交付包含采集器；与重写抖音协议相比，复用现有采集库更可维护。方案为实现者选择；用户已明确先实现模块流程、插件最后接。

主播控制节奏为首版默认：设置每日主题及规则，连接直播间，开始收词，结束收词，DeepSeek 选前三并给简短理由、绘画提示词，点选作品生成图片。完整评论流独立于参赛词，随时可对单条发言评估、回复或朗读；AI 回复也可朗读。规则解说可生成文本并朗读。观众投稿不强制前缀；每条文字以纯文本显示。舞台展示今日主题、规则、入选词、图片和朗读字幕，作品生成后自动展示，可切换历史作品。提供停止语音和清空舞台。

操作台采用三个工作区：今日主题/比赛控制；实时弹幕及评估回复；入选词和作品。右侧/底部有语音队列；设置折叠，缺凭据有明确提示，不阻塞其他模块。首次只有直播间输入和连接、主题与开始按钮是主要操作。不向主播展示技术 JSON/哈希审批。支持窄屏。仅绑定 127.0.0.1；支持 localhost；不设密码、登录 token、CSRF 令牌。模型凭据只留服务端环境或本机忽略文件，浏览器仅可查看配置是否存在。无需高级安全配置。

## 模块契约
- Config：读取当前环境及本项目 .env.local（不覆盖环境）；支持 OPENAI_API_KEY、MINIMAX_API_KEY、DEEPSEEK_API_KEY（兼容 deepseek-api-key）。模型/端点可配置。
- TextProvider：explain({theme,rules}) -> {text}；evaluate({theme,rules,comment}) -> {eligible,score:0–100整数,reason,reply}；select({theme,rules,comments}) -> {selections:[{commentId,reason,prompt}]}；reply({theme,rules,comment}) -> {text}。DeepSeek thinking disabled，结构化输出需校验，不能选模型捏造的 commentId。
- ImageProvider：generate({prompt,signal}) -> {bytes,mime}。请求超时有明确失败，不自动重试付费操作。
- SpeechProvider：synthesize({text,signal}) -> {bytes,mime}。校验 MiniMax business status 和音频数据。
- Capture：start(room), stop(), on comment/status；输入房间号或 live.douyin.com URL。子进程自动管理并区分未开播、验证失败、服务错误。构建/安装由 npm run setup:capture 完成，启动器在缺失时提示一键准备或自动准备；不得假装捕获成功。固定依赖版本及许可证。
- Application：保存主题/轮次/评论/候选/作品/语音/回复，状态事件推送浏览器；重复点击并发保护；异步完成校验主题轮次，不污染新比赛。评论缓存有界，业务状态落本机数据目录；不自动重发付费请求。图片音频以本地资源 URL 供浏览器读取。
- HTTP：GET /api/state, GET /api/events SSE, POST /api/actions, GET /media/:id, /control, /stage；错误返回可读 message。可注入所有依赖供离线联调。
- Harness：最后增加插件入口和补丁配置，注入/复用业务核心与宿主文本任务，不改变前述产品操作。

## 首版边界与验收
不实现 GIF、礼物支付、发送弹幕到抖音、账号体系、云部署和自动日程。对话是本软件里的 AI 回复和音频播报。抖音若要求有效登录态，提供可选 Cookie 配置及明确错误，不声称 localhost 可以跳过上游验证。

验收分开记录：模块协议测试；本机 HTTP/采集子进程测试；浏览器操作台与舞台测试；真实直播弹幕；付费模型；Harness 宿主加载。只有实际验证才标通过。测试默认用注入适配器，不用模拟结果冒充真实模型或真实弹幕。

## 官方及上游依据
- https://api-docs.deepseek.com/guides/thinking_mode/
- https://developers.openai.com/api/reference/resources/images/methods/generate
- https://platform.minimax.cn/docs/api-reference/speech-t2a-http
- https://github.com/jwwsjlm/douyinLive/blob/main/docs/library.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md
