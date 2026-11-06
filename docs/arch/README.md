# 弹幕画师：数据流与软件架构两张图

[设计稿 v1.3](../../DESIGN.md) · [十三问裁定 v1.2](../../DECISIONS.md)

2026-11-06，提出人指出原稿缺少软件架构说明，Liu 裁定补章并新增互补视图。两图都是尚未实现的设计关系，HTML 自包含，不依赖线上图表服务；不能据图宣称目标 Mac 已验证或首播就绪。

| 视图 | 看哪类问题 | 源文件 | 当前检查状态 |
|---|---|---|---|
| [v1.1 数据流与安全链路图](danmu-painter-v1.1.html) | 看投稿、审词、评选、生成、落盘与上屏怎样衔接，以及迟到拦截、撤播、回执和告警如何传递。 | [Archify JSON](danmu-painter-v1.1.architecture.json) | 历史原生渲染预览已生成；标准交付因 EPERM 失败，严格出处未通过，浏览器检查与视觉审阅未完成。 |
| [v1.3 软件架构图](danmu-painter-sw-v1.3.html) | 看同一台 Mac 的进程/页面、DSH 内组件归属、HTTP/WS 主动连接方向、端口、文件所有权与部署边界。 | [Archify JSON](danmu-painter-sw-v1.3.architecture.json) | 本轮原生渲染预览已生成；标准交付同样因 EPERM 失败，严格出处拒绝信任预览，浏览器检查与视觉审阅未完成。 |

v1.1 图保留 dot review 与 Liu 裁定中的独立控制窗、舞台本地安全画面、双向心跳/应用回执、安全撤销与未确认切源告警。它包含 T1 停收/T2 冻结、全候选评分复算、实际文件检查和单场预算闸门；数值是设计初值，不是现场测量。v1.2 在 M7 内补撤销意图先行 fsync、running/clean-shutdown 见证、非正常退出隔离及 AC-66，未改原图连线，因此 v1.1 图继续有效，本轮不重画该图。

v1.3 图补软件结构：DSH 的 driver、接入层、领域层、生成层、发布者/本地服务及状态中心放在同一宿主进程边界内；douyinLive、控制页、舞台页、伴侣和本场文件在 Mac 边界内分别列明。M1 主动连 1088；浏览器主动连动态 P，P 不占 1088；本插件本地服务没有额外常驻进程。控制页与舞台页是权限/窗口边界，不声称浏览器一定为每页分配独立 OS 进程。

图中状态中心向 M5 发送已落盘赢家/预算许可，安全/费用回调独立于普通迟到结果；M7 对应用日志、屏障与恢复见证负责，M5 受控写素材字节。解码任务的隔离方式/IPC、文本 provider 的本地/远端部署及协议/端口、目标 Mac 宿主 SHA 和安装命令均标为待实现期定；图外的文本 provider 只表示宿主配置依赖。伴侣采集及平台推流、douyinLive 上游连接以现场版本核验。宿主 sessionPersistence 目录独立，不把应用 7 天保留建议套给宿主。

DESIGN 现为 **v1.3**，DECISIONS 保留 **v1.2**。新增软件架构章只解释既有契约，M1–M7 与 AC-01–AC-66 正文保持原样，没有新增 AC；接口表的名称用于语义对齐，不承诺已实现的函数或 URL。两图有疑义时以 DESIGN 的模块小节和 AC 为准。历史 [v1 图](danmu-painter-v1.html)、[v1 源文件](danmu-painter-v1.architecture.json)及其检查记录保留，不作为当前契约。

**检查限制。** 新旧图均使用已装 Archify 原生 architecture renderer 生成 HTML 预览。新图本轮的 `finalize` 停在 deliver，单独 deliver/validate 诊断仍是 `spawnSync /usr/bin/node EPERM`，无法启动标准渲染子进程；直接调用原生 renderer 成功生成预览，随后重试标准交付仍失败。严格出处检查因保留的失败交付/恢复记录拒绝信任该 HTML。未删除失败标记或恢复屏障，也未把预览写成“验证通过”。工具自动保留的交付暂存目录同样保留，不把其中的文件作为第二份交付。

**完整自动交付未通过，真实浏览器检查未运行，视觉审阅未进行；两份 HTML 均按设计预览交付。** 原生渲染成功不等于完整静态检查或浏览器检查通过，本次文档核对也不等于后续 66 条运行 AC 已执行。

| 记录 | v1.1 数据流图 | v1.3 软件架构图 |
|---|---|---|
| finalize 摘要 / 完整记录 | [摘要](danmu-painter-v1.1.finalize-summary.json) / [完整](danmu-painter-v1.1.finalize.json) | [摘要](danmu-painter-sw-v1.3.finalize-summary.json) / [完整](danmu-painter-sw-v1.3.finalize.json) |
| 失败交付 / 保留的交付恢复记录 | [交付](danmu-painter-v1.1.delivery.json) / [恢复记录](danmu-painter-v1.1.delivery-pending.json) | [交付](danmu-painter-sw-v1.3.delivery.json) / [恢复记录](danmu-painter-sw-v1.3.delivery-pending.json) |
| 独立严格出处检查 | 见历史检查说明，未完成可信交付 | [本轮拒绝记录](danmu-painter-sw-v1.3.check.json) |

本轮未触发 Archify 更新通知；没有安装宿主、调用付费模型或测试目标 Mac。
