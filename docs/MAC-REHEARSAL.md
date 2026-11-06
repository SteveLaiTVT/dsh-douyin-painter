# 待 Mac 彩排清单

此清单尚未执行。开发环境为 Linux / Node 24.22.0，不能据离线 mock 链路宣称插件首播通过。DESIGN v1.3 的 66 条 AC 是准据；下面的实机记录完成后再更新 AC-STATUS。

## 安装、宿主与凭据

- 在主播 Mac 的官方 `deepseek-ai/deepseek-harness` 工作副本记录 `git rev-parse HEAD`、Node/DSH/浏览器/douyinLive/伴侣版本、CPU 架构；核对本插件使用的官方 cookbook、Agent/Tools 契约。当前没有可验证的实际宿主 SHA，不能填研究时的旧 fork 或网页缓存 SHA。
- 安装插件依赖：`npm ci --ignore-scripts --registry=https://mirrors.cloud.tencent.com/npm/`。运行 `npm test`、`npm run check`；另运行 `npm run test:network`。Node 的 `--test-isolation=none` 需要兼容小版本，建议与本轮 Node 24 先对齐再测宿主。
- 按目标官方宿主的外部 bundle 安装/profile 文档加载包，核对 `package.json` 的 `dsh.bundle.patch` 和导出的 patch，补丁行与模块双写 `agents / sessions / sessionPersistence`。具体 profile 安装命令由该宿主版本决定，本仓库不编造已验证的一键命令。
- 用已注入的三项服务实际加载 `name/inject/apply`。验证自有 session、入队回执不是答案、已提交输出＋本任务运行区间＋idle 结算，`followup` 仅一次格式修复，卸载只 dispose 自有 handle。
- 核对审词/评选 session 的工具掩码、monotonic guard、单次 step、禁自动重试和 `AgentOptions.maxTokens`。尚未证实隔离时保持 `PAINTER_TOOL_ISOLATION_VERIFIED=false`；人工审词与全量评分可用。
- 记录宿主 `sessionPersistence` 真实路径、权限、保留策略。应用默认 7 天是建议，**本实现没有定时删除任务**；宿主转录可能保留拒词原文，不宣称一起清除。
- 由主播在本机安全配置凭据并注入进程；本轮没有读取、创建或使用真实 key。仓库不自动加载 `.env`，不在 profile、日志、URL、舞台或截图中放密钥/Cookie/控制令牌。

## 单场配置与费用

- 选择 `PAINTER_RUNTIME_ROOT / PAINTER_SHOW_ID`，应用默认目录是 `~/Library/Application Support/dsh-douyin-painter/shows/<show_id>/`。本轮测试只使用临时目录。
- 本场已保存预算优先于重启环境；新场预算空/非法/≤0禁本项目付费调用。控制窗可显式保存建议 5 美元；价格规则缺失仍然禁调用。$0.025/图和9次$0.225只是规划估算。
- 填入持有人已成功使用的精确 model/项目/端点/参数组合，`PAINTER_VERIFIED_IMAGE_PATHS` 的每项必须含 `phase, model, project, endpoint, signature, verified`。`signature` 对 `Images.signature(phase)` 的规范化静态参数计算，提示词不参与组合权限推断；6→4帧也须有独立已测配置。
- `PAINTER_COST_RULES` 的图像规则含相同 `signature`、`verified: true`、可靠依据 `evidence`、`upper_bound_usd`、`max_prompt_chars`、`max_image_bytes`。金额上界须覆盖该请求的模型/端点/输入/输出/partial及必要费用；不是当前单价。控制窗查请求完整参数、在途保留与待核费用，真实账单核对后才结算。
- 若启自动收费文本，另需精确 provider/model/任务规则，含 `phase:text, task:review|rank, model, provider, max_input_chars, max_output_tokens, context_token_upper_bound, max_requests_per_task:1, upper_bound_usd, evidence, verified:true`；完整上下文/宿主附加费用无法给可靠上界时继续人工，不把费用移出同场账本。
- 未知费用、取消、超时、普通迟到与重启不释放预留；在控制窗验证不足不发、预算超限立即停调度并尽力取消，不能宣称远端停止或费用追回。

## 接入、节目和审核

- 启动 douyinLive，只监听本机1088；记录真实 `WebcastChatMessage` JSON 样本、稳定消息id/用户id、room status/live=false封包、Cookie与Gatekeeper情况。核对 `lib/transport.js` 字段适配；WS真断线退避，未开播保持连接。插件不提取Cookie或代管上游签名。
- WS与代录只开一个入口；代录同审、标来源。测 T1−1/T1/T1+1、D−1/D/D+1、提前停收/暂停、60次尝试/30人容量、同批超容量和缺失身份。
- 全候选三项整数分、8/7/5加权、同分受理顺序、22–36字理由、10秒共用期限；否决前后版本留痕，揭榜后不静默换冠军。前三3/3/6秒、赢家与理由贯穿作画。
- 逐张检查 partial/静图；GIF 联系表必须来自完整实际文件，看至少一圈后勾选全帧和循环。终审10/15秒到限不发布。GIF技术失败与内容违规分开，违规帧整轮撤销，不删帧绕过。
- 用 mock 先测无partial、文件损坏/实际尺寸帧数错误、解码超时、取消后迟到；Mac并发负载再测Worker的5秒终止、内存/缓存阈值和UI可操作性。
- 首次真实模型路径仅由主播按已测配置另行决定；本轮不执行付费彩排。优先已测 edits参考静图，只有 generations文字GIF可用则标“同题动图”。

## 采集、权限与安全恢复

- 伴侣先保持备用安全场景。DSH启动后只监听动态 `127.0.0.1:P`，P≠1088，控制/舞台共用该端口；日志只报告页面与本机令牌文件路径，不打印令牌。
- 控制窗一次性令牌从本机 `private/control-token-<run_id>` 取得，5分钟内兑换；会话令牌只在控制页内存，Cookie不能单独授权。实测错误Host/Origin、缺Origin、null、错端口、缺CSRF、重用/过期令牌、舞台回执夹控制命令均拒绝且无副作用。
- 只采独立 `/stage` 窗口，控制窗与私有预览不进画面。安装测试浏览器后运行 `npm run test:browser`（需本机可用 `playwright` 和 Chromium）；自动浏览器测试不替代真实伴侣采集。
- 核对收词、榜单、partial、静图、GIF、等待、错误、安全画面都能读“AI生成内容”；方图等比显示，实际观众端裁切/手机可读性通过。开场口播“画面由AI生成，过程含演绎动画”，使用该账号实际可用的平台直播声明方式。
- 初开/重连/重启安全待机；close/error立即清内容，静默≥3秒切安全，旧实例/倒序/撤销版本落后不续租。所有素材URL在服务器复核K/准确字节/当前引用/撤销及隔离；不提供观众下载或导出入口。
- 遮罩/撤播清屏并渲染后才回精确命令/实例/K/撤销版本回执；旧轮撤播不遮新轮。故意冻结页面、休眠、断网、杀进程和冻结采集：1秒未确认时控制窗必须持续明确要求**切断采集源或切备用安全场景**，操作员实际执行并核对观众画面。
- 恢复先看独立屏障、退出见证与隔离，再核对当前K/预览/哈希、人工确认落盘与应用回执；不自动重播旧GIF/庆祝。永久撤销/未决/无法排除丢失意图的旧快照持续禁用，可另开新轮。
- 复测AC-66五个故障点；业务开放前running已fsync，意图→撤销事件/索引→闭合按序；无clean或未闭合时整场旧批准快照隔离，下一次clean不能解封。卸载静止、刷盘后最后提交同run_id clean，clean后无安全/费用变更。
- 每个真实文件保留原字节、检查记录、审批与衍生链；本地具备只读c2patool验证适配，工具不可用则明确记录unavailable；签名问题/issuer/claim与信任状态分别记录，不能把mock或未知状态说成签名已通过或SynthID已核验。用真实返回文件与可用验证工具核对C2PA签发者/claim和格式覆盖，旁记不冒充文件内标识，采集不宣称携带元数据。

## 三轮记录表（AC-65，全部空白待实测）

| 轮次 | 收词/审词/评选/揭榜/静图/终审/GIF/终审/收尾耗时 | 审批操作者/准确哈希 | 结果形态 | 采集/安全演练结论 |
|---|---|---|---|---|
| 1 | 待测 | 待测 | 待测 | 待测 |
| 2 | 待测 | 待测 | 待测 | 待测 |
| 3 | 待测 | 待测 | 待测 | 待测 |

只有“完整已审静图＋获批原生GIF＋正确归轮及真实采集”计完整链路；没有GIF单列降级。代录只替代来源，不能替代DSH，独立演示不能计首播通过。
