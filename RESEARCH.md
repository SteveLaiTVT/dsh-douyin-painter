# 弹幕画师 · 一词成画 — 设计对线资料包

调研日：2026-11-06。范围只到取证：每条关键结论带来源。不在本文做设计裁定，不给实现代码。

本机工作区 `/root/projects/dsh-douyin-painter` 只有说明「仓库已清空、从需求重走」的 `README.md`。下文 DSH / Slack 插件证据来自 GitHub 原文，不是本机克隆。

---

## 1. 抖音直播弹幕接入

### 1.1 官方渠道：有，而且不止一条

抖音开放平台把「直播小玩法」（弹幕玩法）写成正式产品。开放平台首页把直播小玩法与小程序、小游戏并列，示例玩法包括「骑兵冲冲冲」「飙车派对」：观众用评论、点赞、礼物召唤单位或赛车。  
来源：<https://open.douyin.com/platform>

**直播小玩法的评论不是公网 WebSocket 拉全量弹幕。** 平台把一段时间内的直播间数据推送抽象成「数据推送任务」，由（直播间 id，小玩法 id，消息类型）唯一确定。评论类型名是 `live_comment`。开发者启动任务后，平台用 **HTTP POST 回调** 推到开发者服务器。

- 启动任务：`POST https://webcast.bytedance.com/api/live_data/task/start`，body 含 `appid`、`msg_type`（`live_comment` / `live_gift` / `live_like` / `live_fansclub`）、`roomid`。单 app 限 10 次/秒。评论、礼物、点赞要各自起任务。  
  来源：<https://developer.open-douyin.com/docs/resource/zh-CN/interaction/develop/server/live-room-scope/data-open/start-task>
- 推送头：`x-nonce-str`、`x-timestamp`、`x-signature`、`x-roomid`、`x-msg-type`（`live_comment` 等）。文档要求校验签名，否则可能被伪造数据攻击。  
  来源：<https://developer.open-douyin.com/docs/resource/zh-CN/interaction/develop/server/live-room-scope/data-open/data-open-desc>
- 评论 payload 字段（文档示例）：`msg_id`、`sec_openid`、`content`、`avatar_url`、`nickname`、`timestamp`（毫秒）。  
  同一页可靠性表：评论是秒级；**不保证绝对时序**；**可能重复，要用 msg_id 去重**；**不保证可靠，会丢**。礼物侧文档写了有限的丢失回查，评论行的备注是不保证可靠性。  
  来源：同上 data-open-desc。
- 评论能力说明原文：「可通过该能力获取观众在挂载该玩法的直播间评论**包含特殊指令**的消息。」申请入口在控制台「直播小玩法 → 能力 → 互动数据 → 直播间评论互动数据」。  
  来源：<https://developer.open-douyin.com/docs/resource/zh-CN/interaction/jierushuoming/hudongshuju/pinglunshuju>
- FAQ 明确：**没有**让开发者主动拉取「指定用户评论」或「直播间全量评论」的接口，「受数据合规性限制」。  
  来源：<https://developer.open-douyin.com/docs/resource/zh-CN/interaction/introduction/FAQ/FAQ>（Q：直播间数据推送）

**关键词过滤与长度，是自由投稿提示词的硬约束（已在官方页读到）：**

- 礼物/评论配置里「新增关键词」后，观众评论必须包含**完整评论指令**才会下发。例：关键词 `123`，发 `12` 不下发，发 `51234` 下发。  
  来源：<https://developer.open-douyin.com/docs/resource/zh-CN/interaction/introduction/zn/toybox-start> 第 7 步
- FAQ：一款玩法**最多配置 10 个弹幕指令**。超出时官方建议配一个前缀词（如「选」），再在服务端解析「选1」「选2」。  
  来源：FAQ 同上，Q12
- OpenAPI 自测工具：「评论内容最多 10 字（和线上要求一致）」。  
  来源：<https://developer.open-douyin.com/docs/resource/zh-CN/interaction/develop/test-tools/openAPI-tool>

因此，按已读到的小玩法文档，评论通道是「短指令命中后推送」，不是任意长度的投稿全文。10 字是否对所有已上线玩法一刀切，自测工具写了「和线上要求一致」，但是否存在另案放宽，本次没找到例外条款。

**另一条官方面：直播互动工具（挂在直播伴侣 / 抖音 App 上的插件，不是小玩法 exe）。**

- 直播伴侣向插件推 `OPEN_LIVE_DATA`。评论示例含 `msg_type_str: "live_comment"`、`content`、`nickname`、`sec_open_id`、`timestamp`。示例文案是「主播厉害」，看起来是评论正文，不是关键词表。  
  来源：<https://developer.open-douyin.com/docs/resource/zh-CN/live-interactive-tools/introduction/live-tool-guide>
- JS API：`tt.subscribeLiveInteractPluginMessage`，`messageType` 可含 `live_comment`。基础库 3.41.0 起。前提是开放平台创建插件并申请「互动数据」。  
  来源：<https://developer.open-douyin.com/docs/resource/zh-CN/live-interactive-tools/development/js-api/live-streaming-capability/tt-subscribe-message>
- 本次**没有**在互动工具文档里读到「最多 10 个关键词 / 评论最多 10 字」这句。不能据此断言互动工具能收任意长提示词，只能断言小玩法文档写了这两条、互动工具示例页没写这两条。

抖音云把小玩法指令改成内网推送，避免公网域名备案。传统链路写明：接收平台推送要申请域名并备案，备案常要 7–14 天。面向「弹幕玩法」类目。  
来源：<https://partner.open-douyin.com/docs/resource/zh-CN/interaction/develop/douyincloud/guide>  
以及 <https://developer.open-douyin.com/docs/resource/zh-CN/developer/tools/cloud/develop-guide/danmu-callback>

### 1.2 准入条件（小玩法，已读到的）

创建步骤（toybox-start）：创建小玩法 → 选类型 → **提案评估**（飞书文档；先对照《直播玩法规范自查 checklist》；审核大约 **2 个工作日**）→ 进开发者社群 → 提案通过后申请能力 → 配置推送 → 配礼物与评论关键词 → 填基础信息与资质。  
来源：<https://developer.open-douyin.com/docs/resource/zh-CN/interaction/introduction/zn/toybox-start>

FAQ 原文：

- 「个人开发者和企业开发者均可以参与玩法创意投稿环节提案，提案通过即可接入。」
- 玩法资质要软著。「软著形式不限制，注意不能是 APP 或游戏类软著」。玩法名称必须和软著名称一致。
- 包体：「主包体可自行选择引擎开发，最终为可运行的 **exe** 程序即可」。小魔盒 H5 规则页用平台开发者工具，兼容 cocos / laya / 白鹭。
- 玩法内容若围绕主播：点赞、评论、送礼不得对主播造成严重负面效果，不能丑化、恶搞、恶性攻击（文档举例：棒打、射击、扇耳光；「软糖掉落」一类包装可接受）。
- 互动不能只有付费：必须包含点赞、评论等免费行为，且免费行为每一次都要有反馈；可以在基础反馈之上加概率彩蛋。

来源：<https://developer.open-douyin.com/docs/resource/zh-CN/interaction/introduction/FAQ/FAQ>

能力申请通过后自动开通的项里，礼物、点赞、评论、玩法客户端（exe）为必选；弹幕云启动、粉丝团为可选；直播信息无需申请。exe 上传后，主播在直播伴侣下载玩法；伴侣用启动参数 `-token=xxx` 拉起。  
来源：toybox-start；<https://developer.open-douyin.com/docs/resource/zh-CN/interaction/jierushuoming/pingtaijichu/zipmanage>

专题合作（不是首播准入）另有数据门槛：老玩法「近 14 日日均 ≥15 万」或「近 30 日曾有 1 日流水 ≥50 万」等。那是 2026-01 起的联合推广/专题规则，不是创建玩法本身的门槛。  
来源：<https://developer.open-douyin.com/docs/resource/zh-CN/interaction/operation/guide/publish>

收益（供对线时知道官方玩法是礼物分账，不是本资料的商业建议）：FAQ 写实际开发者收益默认为主播收益的 16%、流水的 8%，可自定价。  
来源：FAQ 同上。

**今晚从零走官方小玩法：** 文档上的提案约 2 个工作日，另加软著名称一致、exe 包体、回调域名备案或抖音云。这些步骤的日历都不在「当晚」。本次没有查到「已有资质的玩法可以当天挂到任意直播间」的例外条款。

### 1.3 社区方案：jwwsjlm/douyinLive

仓库：<https://github.com/jwwsjlm/douyinLive>  
最新发布 **v2.3.2**，发布时间 **2026-10-23**。资产含 `darwin-arm64`、`darwin-amd64`、linux、windows。  
来源：`gh api repos/jwwsjlm/douyinLive/releases/latest`（2026-11-06 查询）；发布说明亦见 <https://github.com/jwwsjlm/douyinLive/releases>

项目自述边界（README 原文大意）：只研究和记录抖音直播 WebSocket 的逆向获取、连接和基础接收；**不承诺**某类业务消息一定能收到或完整解析；礼物缺失、字段解析失败、消息结构变化、个别直播间不完整，**不作为后续适配目标**。不录 FLV/M3U8。  
来源：<https://github.com/jwwsjlm/douyinLive/blob/main/README.md>

**原理（仓库文档，不是推断）：**

1. 独立进程监听本地端口，默认 `1088`。客户端连 `ws://127.0.0.1:1088/ws/<直播间标识>`，一个进程可看多个房间。业务方法名示例：`WebcastChatMessage`、`WebcastGiftMessage`、`WebcastLikeMessage`。  
   来源：README；<https://github.com/jwwsjlm/douyinLive/blob/main/docs/websocket-client.md>
2. HTTP 侧 `a_bogus`：`sign.AbSign` 用 URL 查询参数和 User-Agent 生成。实现是内置 SM3、RC4 和变体 Base64，**不依赖** JavaScript 运行时。签名含时间，同样输入不保证得到同一串。**WebSocket 的 `signature` 不由这个包生成**，由上层 WebSocket signer 负责，两种签名不要混用。  
   来源：<https://github.com/jwwsjlm/douyinLive/blob/main/sign/README.md>
3. WebSocket 签名来源：`local`（默认，原生 Go；失败时用独立 Goja 运行时回退）或 `tikhub`（在线，要 API key）。上游画像默认 `protocol.mode: web`；`pc` 是实验，不保证稳定。  
   来源：<https://github.com/jwwsjlm/douyinLive/blob/main/docs/configuration.md>
4. Cookie：`CookieManager` 管读取、解析和 CookieJar。优先级：WebSocket 临时 Cookie > `cookie.rooms` > `cookie.douyin` > 自动获取。无 Cookie 时会尝试拿 `ttwid`，**不保证**绕过匿名高频触发的验证码。文档写：不是每次都要 Cookie；拿不到消息、被限制、页面异常、需要登录态时再补。持续「直播页状态不存在」且 `web/enter` 空响应，通常是验证页或访问限制，要有效登录 Cookie 或换出口 IP/代理。代理失败**不会**自动改直连。  
   来源：configuration.md；websocket-client.md 的 `ROOM_STATUS_UNKNOWN`
5. 只读：HTTP API 不提供发弹幕、点赞、送礼。默认不强制 API key；端口若暴露公网，文档建议自行加 key 和防火墙。  
   来源：README

**维护状态：** 2026-10-23 仍在发多平台正式包；Go 版本在 README 标为 1.27.3；发布说明写 Dependabot 自动更新已关，依赖手动更新。提交历史可见到 2026-09 的协议画像与重连修复（例如离线后再开播、匿名访问提示）。相对「今晚」，最近正式包大约两周前。  
来源：README；<https://github.com/jwwsjlm/douyinLive/commits/main>；releases v2.3.2 说明（下播后再开播、匿名访问提示、代理）。

**风险，按文档有没有写分开：**

| 风险 | 文档里有没有 | 出处 |
| --- | --- | --- |
| 掉线 | 有。README 写断线重连、未开播轮询、保活。CLI 文档：`live=false` 时建议保持本地连接；只有 WebSocket 自己断了才按客户端策略重连。读取失败会分类为 timeout、closed_network_connection 等。 | README；<https://github.com/jwwsjlm/douyinLive/blob/main/docs/cli.md> |
| 协议变更 | 有，而且项目拒绝承诺跟进。消息结构变化、礼物字段缺失不在适配目标内。历史 README 也曾写 protobuf 不全、未知消息可关。 | 当前 README 边界段 |
| 验证码 / 匿名风控页 | 有。`ROOM_STATUS_UNKNOWN`：验证码、Cookie 失效、风控或页面结构变化。频繁新建匿名会话更容易触发验证码。 | websocket-client.md；configuration.md |
| 封号 | **本仓库文档没有写「用了就会封号」。** 登录 Cookie（含 `sessionid`）会把请求绑到具体抖音账号。相邻录制项目 issue 里有用户报告打开直播页出现「服务区开小差」、像被流控，其中一条注明在 MacBook M1 上跑录制（那是 DouyinLiveRecorder，不是 douyinLive 本身）。 | 未在 douyinLive 文档中证实封号；对照 <https://github.com/ihmily/DouyinLiveRecorder/issues/1254> |
| 平台条款 | 本次没有逐条打开《抖音用户服务协议》里关于自动化访问的条款原文，不能把「必然违规/必然封号」写成已核实结论。官方开放能力与逆向 WebSocket 不是同一条接入。 | 见资料完整度 |

### 1.4 Mac 上落地时已经能确定的点

- **抖音直播伴侣有官方 Mac 版。** 下载页写：PC 伴侣支持 Win10 及以上；**Mac 伴侣支持 macOS 13 及以上**。  
  来源：<https://www.douyin.com/falcon/webcast_openpc/pages/streamingtool_download/index.html>
- **小玩法包体文档写的是 exe**，伴侣用 `-token=` 启动。本次没有读到「Mac 版伴侣可以挂载并启动该 exe 玩法」的句子，也没有读到明确写「不支持」。这是缺口，不是结论。  
  来源：zipmanage 页只描述 exe 与 `-token=xxx`。
- **douyinLive 有 darwin-arm64 / darwin-amd64 包**（v2.3.2）。文档把 macOS 与 Linux 放在同一段 CLI 示例里，没有单独的 Mac 故障篇。`.goreleaser.yaml` 的构建是 `CGO_ENABLED=0` 的 Go 二进制，**没有**写 Apple 公证或 Developer ID。首次打开会不会被 Gatekeeper 拦住，仓库没写，要在主播那台 Mac 上实测。  
  来源：releases；<https://github.com/jwwsjlm/douyinLive/blob/main/.goreleaser.yaml>；docs/cli.md
- 互动工具文档标题是「仅直播伴侣」以及「抖音 App + 直播伴侣」。Mac 伴侣能否加载同一套互动工具，本次未在该指南里看到 macOS 专节。  
  来源：live-tool-guide 页题，无 Mac 专节。

---

## 2. 直播合规（中国）

### 2.1 《人工智能生成合成内容标识办法》

发布与施行：国家网信办、工信部、公安部、广电总局 2025-03-07 印发，**2025-09-01 施行**。文号国信办通字〔2025〕2号。  
来源：<https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm>

办法第三条定义：

- **显式标识**：加在生成合成内容或交互界面上，用文字、声音、图形呈现，用户能明显感知。
- **隐式标识**：用技术措施写进文件数据，用户不容易明显感知。

第四条，与图片/视频/虚拟场景直接相关的显式要求：

- 图片：在适当位置加显著提示。
- 视频：在起始画面和播放周边的适当位置加显著提示；末尾和中间可以再加。
- 虚拟场景：起始画面适当位置要加；持续服务过程中可以再加。
- 提供下载、复制、导出时，文件里仍要有满足要求的显式标识。

第五条隐式：按《互联网信息服务深度合成管理规定》第十六条，在**文件元数据**里写生成合成内容属性、服务提供者名称或编码、内容编号等制作要素。鼓励另加水印。文件元数据指按特定编码嵌在文件头的描述信息。

第六条是**传播平台**的义务（抖音属于这一侧）：核验到隐式标识则在发布内容周边加显著提示；用户声明但没有隐式标识，也要提示「可能为」；没声明但检出显式标识或其他生成痕迹，按疑似生成合成内容提示；并提供声明功能。这些情形还要在元数据里补传播要素（传播平台名称或编码、内容编号等）。

第九条：用户可以申请拿到**不加显式标识**的结果，但服务提供者要在协议里写清用户的标识义务和责任，并依法留存提供对象等信息日志不少于六个月。  
第十条：任何人不得恶意删除、篡改、伪造、隐匿标识，也不得为这种行为提供工具。  
第十一条：标识活动还要符合强制性国家标准。

配套强制标准是 GB 45438-2025《网络安全技术 人工智能生成合成内容标识方法》，与办法同日施行。网信办解读写：文本显式标识应含「人工智能」或「AI」以及「生成」和/或「合成」；图片/视频按场景规定位置和样式。本次打开的是网信办「一图读懂」与专家解读页，**没有**逐条摘录标准 PDF 全文，图片角标的字号、颜色、最小尺寸以标准原文为准，此处不补数字。  
来源：<https://www.cac.gov.cn/2025-03/15/c_1743755846973028.htm>；<https://www.cac.gov.cn/2025-03/15/c_1743755860101917.htm>

**谁有义务：** 办法第二条把适用对象写成符合算法推荐、深度合成、生成式人工智能规定情形的网络信息服务提供者。一场个人直播把 OpenAI 生成的图直接播出去，主播本人是不是「服务提供者」，办法文本没有按「个人直播间」单独立项。传播侧义务写在第六条，落在提供网络信息内容传播服务的平台。直播画面上的显著提示，更接近第四条「图片/视频/虚拟场景」以及第十条用户声明，而不是自动等于平台投稿页那个开关。这条法律身份本次未找到针对「直播实时生成画面」的执法口径，列入第 6 节问题，不在这里下结论。

### 2.2 抖音平台对 AI 内容的标识

2026-09-03，中国网络视听节目服务协会转述抖音落实办法一周年的公告，其中引用抖音自己的两份文件：

- 2025-09-01《抖音关于升级 AI 内容标识功能的公告》
- 2026-05《抖音内容标识使用规范》：使用平台 AI 特效或第三方 AI 工具生成的内容，应添加「内容由 AI 生成」标识

同一篇写的平台行为：创作者应主动声明；未声明的，平台检测疑似 AI 或元数据里已有隐式标识的作品，**补充显式标识**；对站内 AI 内容同步添加或更新隐式标识（含传播要素）。账号若直接在抖音内制作并发布，平台会主动加显式标识。  
来源：<http://www.cnsa.cn/art/2026/9/3/art_1957_49264.html>

2025-09-01 多家媒体转述的公告操作路径（原始公众号全文 URL 本次没打开到）：发布页「高级设置 → 发文助手自主声明 → 内容由 AI 生成」。未主动标识时，平台可能加「疑似使用了 AI 生成技术，请谨慎甄别」；核验到元数据隐式标识时，作品页加「作品含 AI 生成内容」。转述还写：用 AIGC 辅助创作本身不违规，用它做虚假、侵权、低俗博流量则违规。  
来源（转述，不是抖音原文页）：<https://new.qq.com/rain/a/20250901A059O000>；<https://www.163.com/dy/article/K8COJCJ40511A6N9.html>；<https://www.sohu.com/a/930906225_114774>

这些路径写的是**作品发布页**。本次没有找到一份抖音官方文档，说明直播伴侣画面、实时 GIF、或只在直播流里出现、不投稿的 AI 图，必须走同一个「发文助手」开关。直播画面上的显式提示是否被平台认作已标识，是缺口。

### 2.3 与「观众投稿公开展示 + AI 生成图片」相关的禁止类别

下面只列本次读到原文或正式转述的类别。观众文字会变成公屏内容，生成图会变成直播画面，两类都进直播内容，不是只审模型、不审弹幕。

**现行社区规则页（抖音规则中心《社区自律公约》等，页内多段）：** <https://www.douyin.com/rule/policy>

本次从该站抓到的禁止项包括：

- 时政有害信息：反对宪法基本原则，危害国家统一、主权和领土完整，泄露国家秘密，宣扬恐怖主义、极端主义，煽动民族仇恨，破坏宗教政策、宣扬邪教和封建迷信，散布谣言等。
- 色情、淫秽：具体描绘性行为或露骨宣扬色情的文字、图片、视频、音频。
- 低俗：性挑逗、性骚扰、性暗示、诱导性联想的行为，或有类似效果的言语、物品、画面、音乐、音效。
- 自杀、自残：禁止展示、宣扬、诱导、鼓励自杀和自残；禁止泄露并攻击当事人。
- 侵害未成年人：禁止描绘未成年人性行为、暴露未成年人敏感部位、未成年人露骨色情语言；禁止诱导未成年人打赏、打造儿童网红、用儿童不雅姿势带货。规则中心另有未成年规范专页。  
  来源：<https://www.douyin.com/rule/policy>；<https://www.douyin.com/rule/policy?activeId=teenage_content>；<https://www.douyin.com/rule/policy?activeId=self_decipline>

**直播场景的历史文本：** 2023-03-22 的互联网档案馆快照保存过「直播行为规范」草案页。其中一级项包括淫秽色情、未成年人直播、诱导未成年人打赏、冒充官方、非本人实名开播；二级项包括性暗示动作、低俗互动、诱导打赏（利益承诺、带头打赏、赠送违法图片等）、危险行为。  
这是**归档快照，不是 2026 年现行全文**。现行全文的官方 HTML 本次没有稳定抓全（规则中心是前端渲染，FAQ 式直播规范专页没有单独下到）。  
来源：<https://web.archive.org/web/20230322060107/https://sf3-draftcdn-tos.pstatp.com/obj/ies-hotsoon-draft/webcast_all_anchor/webcast_ban_protocol.html>

**2025 年平台公告的转述（与 AI 图、观众打赏更近）：**

- 2025 暑期未成年人专项：禁止利用 AI 生成低俗或丑化未成年人形象；禁止诱导未成年人充值打赏。新浪财经稿写，专项期间处置诱导未成年消费直播间 240 个，20 名主播因诱导未成年人打赏被无限期收回直播权限。  
  来源：<https://finance.sina.com.cn/roll/2025-09-17/doc-infquwam4908333.shtml>
- 2025-07-30 升级《抖音直播团播内容管理规范》的报道：禁止用着装、剪影、打湿身体突出敏感部位；禁止营造虚假亲密关系诱导打赏。团播规范不是所有直播的总规范，但「诱导打赏」「低俗」被平台公开重申。  
  来源：<https://www.thepaper.cn/newsDetail_forward_31273138>
- 2025-11-14 报道：中央网信办 2025-10 部署「清朗·整治网络直播打赏乱象」；抖音称 2025 年以来 8.8 万人次因低俗诱导打赏被处罚，11.7 万账号因色情被无限期收回直播权限。健康分、冻结违规场次收益是手段。  
  来源：<https://news.qq.com/rain/a/20251114A03K8U00>

**小玩法自己的内容底线**（若走官方玩法，提案会被这条卡住）：不得丑化、恶搞、恶性攻击主播。见第 1 节 FAQ。

短视频里流传的「11 条封号新规」来自创作者口播，不是规则中心条文，本文不把它当禁止清单。

对「观众投稿 + 公开展示 + AI 出图」可直接对上的禁止簇（来源已在上面分开）：政治与违法信息、色情淫秽与性暗示、血腥惊悚与自杀自残、未成年人（含 AI 生成的低俗/丑化未成年人形象、诱导未成年人打赏）、赌博与封建迷信、侮辱诽谤与隐私、低俗诱导打赏。观众原文一旦上屏，就和生成图一样进入这些类别，不是只审最终图片。

---

## 3. OpenAI GPT-Image-2.6 API

以 2026-11-06 抓取的 `developers.openai.com` 为准。指南里大量示例仍写 2.5，2.6 专节写明 Sunburst / Flare 支持 complexity、markup 编辑、SVG 和 GIF，且 GIF 示例用的是 2.6 Sunburst。

### 3.1 模型 id

Images API 的 `model` 枚举包含：

- `gpt-image-2.6-sunburst`
- `gpt-image-2.6-flare`

同列表还有 `gpt-image-2.5-sunburst`、`gpt-image-2.5-sunburst-2026-09-08`、`gpt-image-2.5-flare`、`gpt-image-2.5-flare-2026-09-08`、`gpt-image-2`、`gpt-image-2-2026-04-21`、`gpt-image-1.5`、`chatgpt-image-latest` 等。  
**2.6 这条枚举里没有带日期的 snapshot id**（不像 2.5 那样并列 `…-2026-09-08`）。模型页写 Flare 的 default snapshot 就是 `gpt-image-2.6-flare`。  
`gpt-image-1` 已于 **2026-10-23 关闭**。  
来源：<https://developers.openai.com/api/reference/ruby/resources/images/methods/generate/>；<https://developers.openai.com/api/docs/models/gpt-image-2.6-flare>

产品差异（公告 + 指南，不是价格差）：

- Flare：迭代快。公告写 quality 为 low 时最快可到约 6 秒。
- Sunburst：细节和跨编辑一致性更好；公告写 quality 为 medium 或 high 时更明显。
- 两者都有 `complexity`：`low` / `medium` / `high`，省略时为 `high`。complexity **不另收费**。`quality` 仍是渲染质量，和 complexity 分开。

来源：<https://openai.com/index/introducing-images-2-6/>（2026-11-04）；<https://developers.openai.com/api/docs/guides/image-generation>（GPT Image 2.6 节）

### 3.2 `output_format=gif`

指南「Generate animated GIF output」：

| 字段 | 取值 | 默认 |
| --- | --- | --- |
| `frame_count` | 整数 2–16 | 9 |
| `frame_duration_ms` | 每帧 20–2000 ms，四舍五入到 10 ms | 200 |
| `size` | `auto`，或宽高都是 16 的正整数倍的 `WIDTHxHEIGHT` | `auto` |

`size` 指每一帧成品尺寸。帧数、帧尺寸、动画条数 `n` 必须同时落在该模型的尺寸限制和**该次请求的总像素预算**里；超出就减少 `frame_count`、边长或 `n`。指南**没有写出 2.6 GIF 的具体像素预算数字**。

响应是完整动画：把 `b64_json` 解码存成 `.gif`。示例：Sunburst，`frame_count=9`，`frame_duration_ms=200`，约 1.8 秒回到起始姿势。

GIF **不支持**：streaming、partial images、自定义 `output_compression`、`prompt_rewriter`。API reference 还写：不支持 masks（`input_image_mask`）；**需要所选模型的 GIF preview 权限**。Responses API 参考写：GIF 不能把 `partial_images` 设成大于 0，但 **Responses 的生命周期事件仍可流式**。  
`frame_count` / `frame_duration_ms` 只能和 GIF 一起用。静图参考要走 **edits** 端点，generations 只靠文字描述主体、动作和循环。

来源：<https://developers.openai.com/api/docs/guides/image-generation> 第 3331 行起（2026-11-06 抓取的 markdown）；<https://developers.openai.com/api/reference/resources/images/methods/generate/>；<https://developers.openai.com/api/reference/resources/responses.md>

### 3.3 `stream` + `partial_images`（静图；GIF 除外）

`partial_images` 取值 0–3，默认 0。为 0 时只有最终图。大于 0 时，若成图更快，**可能收不满**所要的张数。每一张 partial 额外计 **100 个图像输出 token**。

两条线的事件名不同：

**Images API**（`openai.images.generate({ stream: true, partial_images })`）SSE：

- `image_generation.partial_image`：`b64_json`、`partial_image_index`（从 0 起），以及 `background`、`quality`、`size`、`output_format`、`created_at` 等。
- `image_generation.completed`：最终 `b64_json`，并带 `usage`（`total_tokens`、`input_tokens`、`output_tokens`、`input_tokens_details`）。

参考里的示例帧：

```text
event: image_generation.partial_image
data: {"type":"image_generation.partial_image","b64_json":"...","partial_image_index":0}

event: image_generation.completed
data: {"type":"image_generation.completed","b64_json":"...","usage":{...}}
```

**Responses API**（主模型 + `tools: [{ type: "image_generation", model, partial_images }]`）：

- `response.image_generation_call.partial_image`：字段是 `partial_image_b64`（不是 `b64_json`）、`partial_image_index`、`item_id`、`output_index`、`sequence_number`。
- `response.image_generation_call.completed`：工具调用完成。
- 收尾还可在 `response.completed` 里从 `image_generation_call.result` 取最终 base64。

来源：<https://developers.openai.com/api/docs/guides/image-generation> Streaming 节；<https://developers.openai.com/api/reference/resources/images/generation-streaming-events/>；<https://developers.openai.com/api/reference/resources/responses/streaming-events/>；partial 计费在指南「Partial images cost」。

### 3.4 尺寸与质量档

质量档，指南「Calculating costs」**点名 2.6 与 2.5 的 Sunburst/Flare**：`low`、`medium`、`high`、`xhigh`、`max`。`auto` 由模型选。同一质量档的 token 数可以因模型而不同，**单价相同、单张成本可以不同**。  
来源：image-generation 指南，Cost 节约第 3656 行。

尺寸：指南「Size and quality」先点名 2.5 增加了 `xhigh`/`max`，紧接着写自定义尺寸：宽高为 16 的倍数，宽高比 1:3 到 3:1，单边不超过 3840，总像素 655,360–8,294,400；高于 `2560x1440` 为实验。推荐示例 `1024x1024`、`1536x1024`、`1024x1536`。  
这段「两种模型」紧跟在 2.5 句后面，**没有把 2.6 的静止图再写一遍同样的像素上下限**。GIF 小节只重复了「16 的倍数 + 模型自身限制 + 请求像素预算」。把 2.5 的 655,360–8,294,400 直接套到 2.6 GIF 上，本文不做这个等同。  
来源：同一指南约第 3271–3343 行。

API 参考的 `quality` 枚举也是 `low|medium|high|xhigh|max`（另有流事件里的 `auto`）。  
来源：<https://developers.openai.com/api/reference/resources/images.md>

透明底：`background: "transparent"` 配 `png` 或 `webp`。GIF 小节没有写透明底。  
来源：指南 Size and quality。

### 3.5 `moderation`

只接受两个值：

- `auto`（默认）：标准过滤，限制部分可能不适合年龄的类别。
- `low`：更松。

拦截时 `error.code = "moderation_blocked"`，`error.type` 可为 `image_generation_user_error`。可选 `error.moderation_details`：`moderation_stage` 为 `input` 或 `output`，`categories` 是粗类（文档示例有 `harassment`），不给内部分数。这类错误不要原样自动重试。  
来源：指南 Content Moderation 节；API reference `moderation: low | auto`。

另有 `safety_identifier`：终端用户的稳定标识，用于滥用检测；文档要求不要直接传可识别个人信息，空则回退到已弃用的 `user`。  
来源：<https://developers.openai.com/api/reference/resources/images/methods/generate/>

### 3.6 定价要点

2026-11-06 价格页，**Flare 与 Sunburst 同价**（2.5 也是这组价）：

| 模态 | Input / 1M | Cached input / 1M | Output / 1M |
| --- | --- | --- | --- |
| 图像 token | $8.00 | $2.00 | $30.00 |
| 文本 token | $5.00 | $1.25 | — |

来源：<https://developers.openai.com/api/docs/pricing> Image generation models 表；模型页 <https://developers.openai.com/api/docs/models/gpt-image-2.6-flare> 与指南「GPT Image 2.6 costs」一致（输出 $30/1M）。

其他计费句子：

- 用 `usage` 量真实 token。质量档改变的是 token 量，不是单价。
- partial 每张 +100 图像输出 token。GIF 不能开 partial，这条不作用在 GIF 上。
- markup 编辑无附加费。SVG 另计参考图（图像模型价）和写 SVG 的模型 token。
- 缓存价：指南写 **GPT Image 2 与 2.5** 的缓存只对 Responses API 里的 image generation tool 生效，**不对**直接的 `/v1/images/generations` 或 `/v1/images/edits` 生效。这句话**没有点名 2.6**。2.6 走 Images API 直出时能否吃到 cached input，本次以「文档未写」记录。  
  来源：指南 Cached input pricing 节。

延迟：指南 Limitations 写复杂提示最长可到约 2 分钟。这是模型族的限制段，没有单独给 2.6 GIF 的 SLA。

### 3.7 组织验证

指南原文是 **may need to**（可能需要）完成 [API Organization Verification](https://help.openai.com/en/articles/10910291-api-organization-verification)，入口是开发者控制台组织设置，然后才能用 GPT Image 模型。  
来源：image-generation 指南开头。

帮助中心（英文页更新于调研日前约 17 天；中文页写验证组织后可解锁额外推理模型以及 **API 图像生成**）：

- 路径：platform.openai.com → Settings → Organization → General → Verify Organization。
- 需要受支持国家/地区的政府签发证件；该证件过去 90 天内没有用来验证过别的组织。
- **有的组织不验证也已经有权限。** 以 Limits 页或 Playground 实际调用为准。
- 中文帮助中心写验证本身没有消费门槛、大约几分钟；**没有**承诺「提交后 15 分钟一定开通」。

来源：<https://help.openai.com/en/articles/10910291-api-organization-verification>；<https://help.openai.com/zh-hans-cn/articles/10910291-api-%E7%BB%84%E7%BB%87%E9%AA%8C%E8%AF%81>

GIF 另有一层：**GIF preview 权限**（API reference 对 `frame_count` 的说明）。帮助中心的组织验证条目没有写如何申请 GIF preview。这两件事不要并成同一个开关。

生成图可能带 C2PA。内容出处检查文档写：图像可查 C2PA（签发者示例为 OpenAI OpCo, LLC，model 字段示例 `gpt-image`）和 SynthID。这是隐式技术标识的事实，不等于满足中国办法第四条的「用户能看见的显式标识」。  
来源：<https://developers.openai.com/api/docs/guides/content-provenance>

---

## 4. DSH 插件体系

### 4.1 仓在哪里，本机有没有

| 仓 | 事实 | 来源 |
| --- | --- | --- |
| 官方 | `deepseek-ai/deepseek-harness`，公开，默认分支 `master`，说明 “Everything is a Plugin.” 查询时 `pushed_at` 为 2026-11-04。 | `gh api repos/deepseek-ai/deepseek-harness`；<https://github.com/deepseek-ai/deepseek-harness> |
| 用户 fork | `SteveLaiTVT/deepseek-harness`，fork 自官方，默认分支 `master`，`pushed_at` 2026-10-16。与 `deepseek-ai:master` 比较：**ahead 0，behind 3466**。 | `gh api repos/SteveLaiTVT/deepseek-harness/compare/deepseek-ai:master...master` |
| 本机克隆 | 在本机 `/` 下按目录名找 `deepseek-harness`、`dsh-slack`，**没有**。任务书里的 `~/workspace/projects/dsh-slack-plugin` 与 `~/workspace/repos/dsh-slack` 也不存在。 | 2026-11-06 本机 `find` |
| Slack 插件 | 能读到的是 GitHub `SteveLaiTVT/dsh-slack`（README 写 CNB 是主仓，GitHub 是镜像）。版本 0.4.0，`pushed` 2026-11-05。 | <https://github.com/SteveLaiTVT/dsh-slack> |

对线应以**官方 master 的文档和 ACP 包**为准。fork 落后 3466 个提交，不能拿 2026-10-16 的 fork 树当插件契约。

本仓库说明：`README.md` 只写状态是「已清空，从需求重走」。

### 4.2 插件形态

Cordis 五条里和插件有关的原文（`docs/cordis-primer.md`）：

- 插件是实现 Service 的对象：可以是带可选 `inject` 和 `apply(ctx)` 的函数，或由 Cordis 挂上生命周期的 Service 子类。
- `inject` 声明要等哪些服务出现，用依赖而不是手写启动顺序。
- 监听和注册走 `ctx.on()` / `ctx.effect()`，卸载时会卸掉。

来源：<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md>

Cookbook 把扩展收成几类，和本项目最接近的是 **external protocol driver**，不是 tool 插件。  
来源：<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md>

驱动约定（同一篇 “An external protocol driver”）：

- 把外部线路上的对端适配到 `ctx.agents`。
- 示例导出：`name`、`inject = ['agents', 'sessions', 'sessionPersistence']`、`apply(ctx)`。
- 用 `session/event` 上已提交的 `assistant/message` 或 `assistant/attempt` 取正文（经 `expandAssistantStream`）。低层 prompt **返回入队回执**，不靠把 `MessageId` 和 `turn/end` 对上来拿结果。整段 agent 状态另发。
- 自动化调用可以等「下一次空闲」再总结；UI 则继续听开放的事件流。
- 拆掉 agent 用 `AgentHandle.dispose()`，并且要等到静止。

同一篇把 **`packages/acp/acp` 定为这条形态的现成例子**。

**ACP 实现要点**（自动化专用，故意不带 DSH 的卡片/计划/终端 UI）：

- 包 `@deepseek-ai/dsh-acp`。启动：`pnpm dsh --profile acp`。stdout 只跑协议。
- 源码导出：`src/index.ts` 中 `export const name = 'acp'`，`inject = ['agents', 'llm', 'sessionPersistence', 'sessions']`，`export function apply(ctx, config)`。
- 生命周期：`initialize` → `session/new` 或 `session/resume` → `session/prompt`（每会话同时只一个 prompt）→ `session/update` → `session/cancel` → `session/close`。close、断连、Cordis dispose 走同一套静止拆卸：停新工作、取消、排空已提交更新、先子后父地 dispose、刷持久化、只释放自己的 Agent scope。
- 配置示例：`provider`、`model` 可选，留给别的监听者填；demo 里示例是 `deepseek-official` / `deepseek-v4-pro`。
- 已知限制：一个主工作区；提示里的图只接受 PNG/JPEG/WebP/GIF 栅格，且要有附件存储和图像路由；没有 transcript replay、没有 elicitation。

来源：<https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/acp/acp/README.md>；<https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/acp/acp/src/index.ts>（name/inject/apply 在该文件约第 59、61、96 行，以 master 当时内容为准）

**外部包怎么挂进 profile：** 应用用 `packages/bundle/*/cordis.patch.yml` 贡献层。Slack 插件把同一机制用在包外：

- `package.json` 的 `dsh.bundle.patch` 指向 `./cordis.patch.yml`，`exports` 暴露 `./index.js` 和该 yml。`peerDependencies` 写 `@deepseek-ai/cordis` `^4.0.1`，且 optional。
- `cordis.patch.yml` 注释写明：**loader 只认补丁行上的 `inject`，不认模块自己 export 的 inject**；模块里的 `export const inject` 只对测试里直接 `ctx.plugin()` 生效，**两边都要写**。
- `index.js` 只再导出 `name`、`inject`、`apply`。

来源：<https://github.com/SteveLaiTVT/dsh-slack/blob/master/package.json>；<https://github.com/SteveLaiTVT/dsh-slack/blob/master/cordis.patch.yml>；<https://github.com/SteveLaiTVT/dsh-slack/blob/master/index.js>；cookbook 末节 “Runnable wirings”。

### 4.3 dsh-slack 可复用的骨架（不是要抄 Slack）

仓库文件（master）：`index.js`、`cordis.patch.yml`、`lib/plugin.js`、`lib/bridge.js`、`lib/transport.js`、`lib/queue.js`、`lib/config.js`、`lib/parse.js`、`lib/render.js`、`lib/redact.js`、`lib/channel-context.js`、`tests/`。  
来源：`gh api repos/SteveLaiTVT/dsh-slack/git/trees/HEAD?recursive=1`

`lib/plugin.js` 文件头写它对照 cookbook 的 external protocol driver，`INJECT = ['agents', 'sessions', 'sessionPersistence']`。`lib/bridge.js` 文件头写它依赖的宿主形状：

- `ctx.agents.create({ sessionId, meta: { cwd }, agentOptions, signal, setup })` → `{ agent, dispose() }`
- `ctx.agents.resume(...)`
- `agent.followup(createUserMessage(...))`
- `agent.cancel({ kind: 'user' })`
- `ctx.on('session/event', ...)`，其中 `turn/start`、`turn/end`、`assistant/message`
- `createUserMessage` 从宿主 `@deepseek-ai/dsh-llm` 动态导入，失败时用同形状数据兜底（README 已知边界）

可对上「弹幕进、结果出」的部分：

| Slack 里已有的 | 和绘画插件的关系 |
| --- | --- |
| `name` / `inject` / `apply` + `cordis.patch.yml` 双写 inject | 外部包挂进 dsh 的入口形状，可沿用 |
| `DshBridge`：一单一个 session，`create`/`resume`、`followup`、`cancel`、听 `session/event` 到 `turn/end` 再结算 | 「一条投稿 → 一个会话 → 追问/取消 → 收尾」的宿主接法 |
| `TaskQueue` 串行、排队上限、补扫 | 直播里提示词会堆，队列是现成结构；补扫是 Slack 历史消息，直播不一定要 |
| transport 可注入、单测用假 transport | 弹幕来源（官方回调或本地 WebSocket）可以做成另一种 transport，而不改 bridge |
| `dispose` 时断开外部连接 | 对上 cookbook 的拆卸 |
| token 从环境变量读、日志脱敏 | 密钥不要进 profile 明文；模式可沿用，变量名要换 |
| v0.4 起不注册 `tools/pre-execute` | 这是 Slack 场景的选择（README：个人项目不拦工具）。绘画插件要不要在出图前拦截，cookbook 允许 hook，但是 Slack **没有**这份拦截实现 |

不应直接复用的部分：Socket Mode、Block Kit 交卷卡片、`## 交卷` 六字段、频道 topic 定仓、表情取消。那些是 Slack 交卷协议（`SPEC.md`、`lib/render.js`）。

宿主模型：Slack README 写模型走 dsh 默认，建议 DeepSeek V4.1 Flash，且 dsh ≥ 0.2.1-rc.1（SPEC AC-11）。这是 Slack 插件的建议，不是绘画评审模型的规定。  
来源：<https://github.com/SteveLaiTVT/dsh-slack/blob/master/README.md>

本机没有跑过 dsh。官方是否在 macOS 上有可直接开播的桌面宿主，本次只看到生态里有 Tauri/桌面包（例如 `dsh-tauri/deepseek-harness-desktop` 的仓库说明写了 macOS），**没有**在官方 README 里完成「Mac 上今晚能起 agent」的实测。  
来源：`gh search repos deepseek-harness` 结果中的 `dsh-tauri/deepseek-harness-desktop` 描述；未克隆、未运行。

---

## 5. 同类玩法参考

### 5.1 抖音弹幕互动（官方小玩法结构）

开放平台自己的例子「骑兵冲冲冲」：观众选阵营，用点赞、弹幕、礼物召唤兵种，打掉对方主宰则一局结束。  
来源：<https://open.douyin.com/platform>

创建文档要求规则页写清：礼物效果、评论/点赞效果、**排名逻辑、积分清除逻辑**。评论指令例：「蓝：加入蓝方」。  
来源：toybox-start 第 8 步。

平台侧榜，不是玩法内赛季：玩法排行榜每天上午 10 点更新，一次展示 12 款；人气榜按开播主播数和看播；畅销榜按互动和营收。  
来源：FAQ 排行榜规则段。

免费行为必须次次有反馈，不能做成纯付费玩法（第 1 节）。一局的开始、结束、叠加，提案模板里就要写（第三方教程转述官方提案字段，与 toybox-start 的规则页要求一致；教程本身不是规范）。  
来源：FAQ；toybox-start；教程页只作玩法结构的旁证：<https://www.jxxy.net/ai/articles/yhslgg-2113642964341965309/>（2026-10-27，写了提案要说明角色、观众如何参与、弹幕/礼物效果、一局起止）

冷启动，文档里能对上的动作：屏幕上写指令（最多 10 个词）、免费指令立刻有画面反馈、礼物按礼物 ID 而不是礼物昵称匹配（教程与 FAQ 的指令模型一致；礼物 ID 表在开放平台飞书表，toybox-start 给了链接）。没有读到官方「绘画玩法赛季」模板。专题流量门槛（日均 15 万等）是上资源位的条件，不是第一场怎么留住人。

### 5.2 B 站与 Mac 叠加层

少数派 2023-12 的 Mac 虚拟区直播记录：OBS 推流 + VTube Studio + `blivechat` 把弹幕叠到画面上。作者写 blivechat 功能窄，不看进房、不能从叠层发弹幕。  
来源：<https://sspai.com/post/85197>

这是「Mac 上用叠层显示弹幕」的现成结构，平台是 B 站，不是抖音开放平台。B 站开放平台的弹幕接口条款本次没有另开文档核对。

2026-10 的一篇中文技术拆解把「抖音 AI 虚拟主播」收成：弹幕/礼物事件 → LLM → TTS / 动作 → Live2D → OBS → 直播伴侣。作者把弹幕来源分成开放平台、抓直播伴侣、社区弹幕库，并写社区库会失效；建议想快速验证可先用 B 站。这是虚拟主播流水线，不是绘画评选。  
来源：<https://regret.site/2026/ai-vtuber-douyin-live-tech-breakdown/>（2026-10-26）

本次没有找到可引用的「抖音/B 站一词成画」官方玩法页，也没有找到带赛季积分的 AI 绘画直播规则原文。

### 5.3 X 上与 AI 出图相关的观众反应

关键词检索（livestream + AI art）返回 429，**没有**拿到「弹幕投稿绘画直播」的帖子样本。语义检索拿到的是对 AI 动画/图像的评价，不是直播玩法复盘。记录在这里，避免被当成直播数据：

- 高互动帖把「一提 AI 就被叫 slop」写成常见反应。作者 @ChrisGPT，2025-11-26，约 7441 赞、275 万浏览。  
  <https://x.com/ChrisGPT/status/1993792256776745345>
- 相反的高互动帖讨论：当有人认为执行变好时，反对者的话术会从 “slop” 转到 “我们完了”。作者 @RifeWithKaiju，2026-09-23，约 914 赞。  
  <https://x.com/RifeWithKaiju/status/2102676448796365167>
- 短评：画面若在极短时间生成，提示词本身不被看成手艺。作者 @DESTROPOCALYPSE，2026-11-01，互动很低。  
  <https://x.com/DESTROPOCALYPSE/status/2116924704283877428>
- 另一类说法是：同一张图，观众先按「怎么做出来的」故事反应，故事一变，评价就变。作者 @chilltulpa，2026-05-14，约 227 赞。  
  <https://x.com/chilltulpa/status/2054935679511957742>

能用的只有定性观察：英文 X 上，AI 出图会同时遇到「slop」拒绝和「看执行、看叙事」的分裂；**没有**抽到「榜单/赛季/投稿冷却」的观众原话。不能把这四条写成中国直播间的冷启动办法。

---

## 6. 待设计对线确认的问题清单

只列问题、选项和代价。不选边。

1. **弹幕从哪条管道进？**  
   - 官方小玩法 HTTP 回调：有签名、有 msg_id、平台允许挂载；代价是提案约 2 个工作日、软著名称一致、exe、域名备案或抖音云，且文档写的是关键词指令（最多 10 个）和自测工具所称评论最多 10 字，不像自由长提示词。全量评论接口 FAQ 写明不开放。  
   - 官方互动工具（直播伴侣插件）：示例 payload 带评论正文 `content`；代价是准入页面本次没读全，Mac 伴侣能否加载未证实，也可能仍有未写明的过滤。  
   - douyinLive 本地 WebSocket：今晚可在 Mac 上跑 darwin-arm64 包，能收 `WebcastChatMessage` 一类全文；代价是逆向协议、项目不承诺跟进结构变化、匿名访问会验证码、登录 Cookie 绑账号，封号没有被该仓库写成已证实后果，也没有被证伪。

2. **观众投稿的文本形态？**  
   - 短指令（「猫」「赛博」加编号）：对齐小玩法 10 字和 10 个关键词；代价是「一词成画」若允许长句，官方回调可能根本不下发。  
   - 自由长句：对齐社区 WebSocket 或未经证实的互动工具；代价是审核面变大（政治、色情、未成年人、隐私都在公屏原文里），延迟和费用也按 token 涨。  
   - 短指令触发、长句只在主播侧补写：少碰官方长度限制；代价是观众看见的字和送进模型的字可能不是同一句，评选理由要解释这层差异。

3. **GIF 用模型原生还是静图后再做动画？**  
   - `output_format=gif`：`frame_count` 2–16、`frame_duration_ms` 20–2000 且对齐 10ms；代价是不能 partial stream、不能自定义压缩、要 GIF preview 权限（和「组织已验证」不是同一句话），像素预算数字文档没给，失败要当场降帧或降尺寸。  
   - 静图 + 本地动画：可以走 `partial_images`（0–3，每张 +100 输出 token）先上屏；代价是动效不是模型出的，和「GIF 原生」不是同一产物，本地合成要占主播 Mac 的 CPU。  
   - 只出静图：少一个权限和一份像素预算；代价是直播画面没有「在画」的过程，除非另做笔刷动画（那又是本地合成）。

4. **画面过程用哪条流？**  
   - Images API 的 `image_generation.partial_image` / `.completed`（字段 `b64_json`）。  
   - Responses API 的 `response.image_generation_call.partial_image`（字段 `partial_image_b64`）加上主模型 token。  
   - 不流式，只等最终 `b64_json`。  
   代价：GIF 不能走 partial；Responses 多一段主模型费用，但指南写缓存价目前明确覆盖的是 2 与 2.5 的 tool 路径，2.6 直连 Images API 的缓存未写明。复杂提示文档写最长可到约 2 分钟，直播等不等得起是产品问题，不是本文能定的。

5. **出图模型 id？**  
   - `gpt-image-2.6-flare`：公告强调低质量档速度。  
   - `gpt-image-2.6-sunburst`：公告强调质量和编辑一致性。  
   - 单价表相同（图像输出 $30/1M，图像输入 $8/1M，文本输入 $5/1M）。代价差在 token 量、延迟、GIF preview 是否对两个 id 都开。文档没有写「画直播必须用哪一个」。

6. **质量档与 complexity？**  
   - 质量：`low` / `medium` / `high` / `xhigh` / `max` / `auto`。档位升高通常增加 token，单价不变。  
   - complexity：`low` / `medium` / `high`，默认 `high`，不另收费，但指南写高 complexity 会增加延迟，也可能改动不想改的地方。  
   代价是首播延迟预算。没有公开的「一档 = 多少秒」表，不能用单价反推时延。

7. **评审与过滤用哪一层？**  
   - 只靠 OpenAI `moderation=auto|low`：实现面小；`low` 更松，直播公屏仍可能撞上抖音侧色情、未成年人、时政。拦截结构是 `moderation_blocked`，不要盲目重试。  
   - 在调用图像模型前用宿主里的文本模型先拒：可拒政治/色情/未成年人/隐私，并能生成「为什么没采用」的句子；代价是多一次模型调用、多一段延迟，以及评审模型是否就是 dsh 默认模型（Slack 文档建议的是 DeepSeek V4.1 Flash，那是 Slack 的建议）。  
   - 词表 + 模型：词表可解释、可当场改；代价是漏掉谐音和绕过，不能替代未成年人与色情的画面审核（图像模型仍会产出，平台看的是画面）。  
   选项可以叠，但是否叠、谁先谁后，要设计定。

8. **插件放在哪？**  
   - dsh 进程内的 protocol driver：沿用 Slack 的 `apply` + `inject`（agents、sessions、sessionPersistence）+ bridge 的 create/followup/cancel/session event。代价是出图、转码、WebSocket 都在宿主进程里，宿主若在公司 Windows 上（Slack README 的部署描述）而直播在主播 Mac 上，则不是同一台机器。  
   - 独立进程负责弹幕、过滤、出图、动画，dsh 只做评审会话：崩溃面分开；代价是要自己保持「一条投稿一个会话」的对应关系，不能假设 Slack 的 thread ts 还在。  
   - 完全不用 dsh，评审也在独立服务：少一个宿主版本差（fork 已落后官方 3466 提交）；代价是丢掉现成的 session、followup、dispose 静止语义，等于另做一套 agent。  
   本机没有 dsh 克隆，Mac 上官方 CLI 能否今晚拉起，未实测。

9. **榜单与理由的生命周期？**  
   - 只留本场内存：实现小，断线即丢；观众隔天看不到。  
   - 本场落盘（文件或 sqlite）：能复盘和补播；要决定理由是模型原文还是人工改过的句子，以及是否含观众昵称（昵称上榜是公开个人信息）。  
   - 跨日赛季：官方小玩法规则页要求写排名和积分**清除**逻辑，说明平台期望积分会清；没有读到强制赛季长度。自建赛季的代价是存储、作弊（一人多号刷评）和诱导打赏红线（用榜刺激付费会被 2025 年清朗专项的口径扫到）。  
   官方人气榜/畅销榜是玩法之间的榜，不是观众投稿榜。

10. **显式标识放在哪，隐式标识谁来写？**  
    - 直播画面角标 + 开场口播：贴近办法第四条对图片、视频、虚拟场景「显著提示」的字面；代价是挡画面，且没有抖音文档证明这样就算完成了「发文助手」那条投稿标识。  
    - 只依赖 OpenAI 的 C2PA/SynthID：满足不了「用户能看见」的显式定义；办法第五条的隐式要素（服务提供者名称或编码、内容编号）是否已被 OpenAI 元数据覆盖，本次只看到 C2PA 示例签发者是 OpenAI OpCo, LLC，没有对照 GB 45438 的字段表。  
    - 事后把 GIF 再投稿到抖音并走「内容由 AI 生成」：对齐 2026-05 规范的转述；代价是直播当时已经播出去了，投稿标识不覆盖已经播过的那一段。  
    - 按办法第九条向用户提供无显式标识文件：要协议、日志至少六个月；与「直播间所有人都能看见」不是同一场景。

11. **今晚这台 Mac 的画面怎么进直播间？**  
    - Mac 直播伴侣（官方写 macOS 13+）采集绘画窗口。代价：小玩法 exe 与 Mac 伴侣的组合未证实。  
    - 伴侣 + 社区弹幕在本机 1088。代价见问题 1。  
    - 虚拟机里跑 Windows 伴侣：有人这么播过，不在官方文档里；代价是性能和账号环境，本次未核实抖音是否把虚拟机当异常设备。

12. **组织验证和 GIF preview 现在是否已经开通？**  
    这不是设计风格问题，是当晚能不能调用。帮助中心写有的组织不用验证也有图像权限，也写图像生成在验证解锁列表里。GIF 还要 preview。代价：未开通则原生 GIF 选项当晚不存在，只剩静图或本地动画；验证材料是政府证件，不是配置项。

13. **谁对公屏上的观众原文负责？**  
    - 先审后播：违规面小；代价是首条反馈变慢，和官方玩法「免费行为每一次都要有反馈」若走小玩法会一起被看。  
    - 先上字后审图：观众感觉快；代价是违禁原文已经在直播画面上出现，平台罚的是直播内容，不是只罚模型。  
    未成年人、政治、色情、隐私、诱导打赏都在第 2 节的来源里，不需要再发明类别；要定的是拦截点。

---

## 资料完整度自评

**有原文或仓库文件支撑的：**

- 小玩法存在；评论是 HTTP 推送不是全量拉取；`live_comment` 字段、签名、去重、不保证可靠；关键词命中才下发；最多 10 条指令；自测工具写评论最多 10 字；个人/企业都可提案；约 2 个工作日；要软著且名称一致；包体写成 exe；免费行为必须有反馈。
- douyinLive v2.3.2（2026-10-23）含 darwin-arm64；签名、Cookie、重连、不承诺协议跟进；封号未被该仓库写成事实。
- Mac 直播伴侣官方页写 macOS 13+。
- 标识办法第三条至第十条的显式/隐式定义和图片、视频、虚拟场景位置；抖音 2025-09-01 公告与 2026-05 标识规范经由协会页和多篇同期报道互相印证（投稿声明路径、疑似标识、作品含 AI）。
- 社区自律公约页上的时政、色情、低俗、自杀自残、未成年人条款；2025 年未成年人专项对「AI 生成低俗或丑化未成年人」的转述；诱导打赏的平台公告转述。
- GPT-Image-2.6 的两个 id、GIF 帧数和帧间隔、GIF 不能 partial、组织验证是「可能需要」、价格表、moderation 两档、两套 streaming 事件名。
- 官方 harness 与 fork 的落后提交数；cookbook 的 protocol driver；ACP 的 name/inject/apply 与会话生命周期；dsh-slack 的双写 inject 和 bridge 的宿主调用形状。本机没有这两份克隆。

**没查到或不能当成定论的：**

- 互动工具是否也限制评论长度和关键词；Mac 伴侣能否挂载小玩法 exe 或互动工具。
- 《抖音用户服务协议》里自动化抓取条款的原文；douyinLive 是否会导致封号。
- GB 45438 图片角标的毫米/像素尺寸（只读了网信办解读，没读标准 PDF）。
- 直播实时画面（不上传作品）怎样才算抖音认可的显式标识；办法是否把个人主播视为「服务提供者」。
- 2.6 GIF 的数字像素预算；2.6 静止图是否与 2.5 共用 655,360–8,294,400；2.6 走 Images API 时有没有缓存价；GIF preview 的申请入口。
- 主播这台 Mac 上 dsh 能否今晚启动（未安装、未运行）。
- X 上「弹幕投稿 AI 绘画直播」的观众原话（关键词接口 429；语义结果是一般 AI 艺术争议）。
- 一份可引用的抖音/B 站「AI 绘画投稿赛季」官方规则。现行《直播行为规范》全文没有稳定抓取，2023 归档页不能当 2026 年条文。

调研使用了网页抓取、GitHub API 与本机目录查找。价格、枚举和开放平台门槛都会改，对线时以当时页面为准。
