# 弹幕画师交互架构 v1.1

[打开 v1.1 交互图](danmu-painter-v1.1.html) · [Archify JSON 源](danmu-painter-v1.1.architecture.json) · [设计稿 v1.1](../../DESIGN.md) · [十三问 v1.1](../../DECISIONS.md)

2026-11-06，依据用户转述的 dot（小刘同学）review 与 Liu 全采纳裁定，将 v1 升为 v1.1。这是尚未实现的首播设计方案；HTML 自包含，可在浏览器打开查看节点关系、主题和动态/静态展示，不依赖线上图表服务。

图中结构同步增加了独立控制窗、舞台浏览器内的本地安全画面、舞台→发布者的心跳/遮罩回执、发布者→控制窗的未确认切源告警，以及 M5→状态中心的迟到拦截安全撤销链路。舞台只读，回执不是控制权限；控制请求经本地鉴权与哈希审批闸门。已落盘赢家由状态中心交给 M5，不绕过落盘。

图内同步标明 T1 停收/T2 冻结、全候选程序评分复算、实际文件检查、单场预算未配置禁付费及建议5美元/场。安全撤销依请求的轮次＋代次隔离，永久撤销整轮及衍生物；旧轮撤销不遮新轮。舞台1秒心跳、3秒超时清屏、1秒遮罩回执期限，重连先安全并待操作员确认；具体契约、文件资源限额和65条AC以 DESIGN 对应小节为准。数值是设计初值，尚非现场测量。

主链仍为弹幕→DSH插件→过滤/评审→Images API→逐项审核→落盘→舞台→Mac伴侣，七模块方向未变；榜单先发布，图像后发布，原文/会话/待审像素不能直通舞台。官方通道只留后续替换位置。应用文件见 DESIGN M7，宿主 sessionPersistence 的真实目录仍待核实。

图、源JSON、DESIGN与DECISIONS当前版本均为 **v1.1**。历史 [v1图](danmu-painter-v1.html)、[v1源文件](danmu-painter-v1.architecture.json)及其检查记录保留，不作为当前契约。

当前交付限制：已用已装 Archify 的原生 architecture renderer 成功生成 v1.1 HTML 预览。标准 `finalize` 停在 deliver，单独诊断 deliver 确认环境拒绝启动渲染子进程：`spawnSync /usr/bin/node EPERM`，与 v1 相同。严格出处检查因未完成的交付记录而拒绝信任预览；未删除失败屏障、未伪造通过记录。**完整自动交付、真实浏览器检查与视觉审阅未通过/未完成；HTML只按可打开的设计预览交付。** 这不代表设计的后续运行AC已执行。

本轮记录：[v1.1 finalize摘要](danmu-painter-v1.1.finalize-summary.json)、[完整finalize记录](danmu-painter-v1.1.finalize.json)、[失败交付记录](danmu-painter-v1.1.delivery.json)、[保留的交付恢复记录](danmu-painter-v1.1.delivery-pending.json)。未触发 Archify 更新通知。
