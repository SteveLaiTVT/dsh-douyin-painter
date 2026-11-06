# AC-01–AC-66 逐条状态

准据：冻结 DESIGN v1.3（24259b4）。共66条：**45通过、21待彩排、0未做**。这里“通过”表示对应离线软件契约有实际执行证据；含真实宿主/浏览器/伴侣或文件签名验证的复合AC从严保留“待彩排”，不会把mock或代码存在计为实机通过。无真实付费调用。

M1–M7代码和按AC组织的测试均已提交。真实loopback测试失败（listen EPERM），浏览器测试失败（未安装playwright/Chromium）；详细命令与结果见[测试记录](TEST-RESULTS.md)，待做步骤见[Mac彩排](MAC-REHEARSAL.md)。AC-65始终待真实三轮。

| AC | 状态 | 本轮证据 / 待做原因 | 主要离线用例入口 |
|---|---|---|---|
| AC-01 | 待彩排 | 真实douyinLive封包/来源切换待Mac | [AC-01-03.test.js](../tests/AC-01-03.test.js) |
| AC-02 | 通过 | 同源消息id及3秒退化去重、身份别名 | [AC-01-03.test.js](../tests/AC-01-03.test.js) |
| AC-03 | 待彩排 | 真实断线/live=false/身份与登录态待Mac | [AC-01-03.test.js](../tests/AC-01-03.test.js) |
| AC-04 | 通过 | 字数/冷却/第4次/第61次/首条锁定 | [AC-04-16.test.js](../tests/AC-04-16.test.js) |
| AC-05 | 通过 | T1−1归轮与收尾 | [AC-04-16.test.js](../tests/AC-04-16.test.js) |
| AC-06 | 通过 | T1等时拒绝和source_time不倒签 | [AC-04-16.test.js](../tests/AC-04-16.test.js) |
| AC-07 | 通过 | T1后通过仍入原池 | [AC-04-16.test.js](../tests/AC-04-16.test.js) |
| AC-08 | 通过 | D等时/之后不入池；冻结不可变 | [AC-04-16.test.js](../tests/AC-04-16.test.js) |
| AC-09 | 通过 | 10项批次、60受理、30容量、受理顺序占位 | [AC-04-16.test.js](../tests/AC-04-16.test.js) |
| AC-10 | 通过 | 冻结SHA-256复算与迟到不增补 | [AC-04-16.test.js](../tests/AC-04-16.test.js) |
| AC-11 | 通过 | 空池/1人/2人、暂停不重开 | [AC-04-16.test.js](../tests/AC-04-16.test.js) |
| AC-12 | 通过 | 357秒配置与严格审核期限，未确认不发布 | [AC-04-16.test.js](../tests/AC-04-16.test.js) |
| AC-13 | 通过 | durable事件/检查点/任务幂等、故障即时安全 | [AC-04-16.test.js](../tests/AC-04-16.test.js) |
| AC-14 | 通过 | K/phase/attempt、重复/取消结果拒绝 | [AC-04-16.test.js](../tests/AC-04-16.test.js) |
| AC-15 | 通过 | 取消/重启不自动付费、未知保留 | [AC-04-16.test.js](../tests/AC-04-16.test.js) |
| AC-16 | 通过 | 取消后迟到输出拦截按原请求撤销 | [AC-04-16.test.js](../tests/AC-04-16.test.js) |
| AC-17 | 通过 | 整轮全部代次及衍生取用禁用 | [AC-17-26.test.js](../tests/AC-17-26.test.js) |
| AC-18 | 通过 | 旧轮撤播保留新轮并报告当前K | [AC-17-26.test.js](../tests/AC-17-26.test.js) |
| AC-19 | 通过 | 撤销后再批准/改代/复制血缘/恢复均拒绝 | [AC-17-26.test.js](../tests/AC-17-26.test.js) |
| AC-20 | 通过 | 撤销/屏障/见证/缺索引及遗失日志恢复从严 | [AC-17-26.test.js](../tests/AC-17-26.test.js) |
| AC-21 | 待彩排 | 浏览器纯文本渲染实检未运行；服务端审核/改字节用例通过 | [AC-17-26.test.js](../tests/AC-17-26.test.js) |
| AC-22 | 待彩排 | 实际宿主无工具隔离须Mac证实，默认关闭自动评审 | [AC-17-26.test.js](../tests/AC-17-26.test.js) |
| AC-23 | 通过 | auto参数、input-only中性、unknown/output撤销 | [AC-17-26.test.js](../tests/AC-17-26.test.js) |
| AC-24 | 通过 | partial与final各自检查审批、无批准不公开 | [AC-17-26.test.js](../tests/AC-17-26.test.js) |
| AC-25 | 通过 | operator/K/id/version/hash复核、换字节拒绝与幂等 | [AC-17-26.test.js](../tests/AC-17-26.test.js) |
| AC-26 | 待彩排 | 真实控制窗联系表/循环与人审操作待Mac；全帧解码通过 | [AC-17-26.test.js](../tests/AC-17-26.test.js) |
| AC-27 | 通过 | 全候选覆盖/重复/类型/范围严格校验 | [AC-27-33.test.js](../tests/AC-27-33.test.js) |
| AC-28 | 通过 | 8/7/5权重及总分/受理序号/id排序 | [AC-27-33.test.js](../tests/AC-27-33.test.js) |
| AC-29 | 通过 | 模型/人工相同复算和快照哈希，版本历史保留 | [AC-27-33.test.js](../tests/AC-27-33.test.js) |
| AC-30 | 通过 | 10秒总限、理由22–36字、独立文字审批 | [AC-27-33.test.js](../tests/AC-27-33.test.js) |
| AC-31 | 通过 | 评审投影不含消费信号、固定权重 | [AC-27-33.test.js](../tests/AC-27-33.test.js) |
| AC-32 | 待彩排 | 揭榜投影时序通过，真实舞台与采集可读性待Mac | [AC-27-33.test.js](../tests/AC-27-33.test.js) |
| AC-33 | 通过 | 普通失败记录结果形态；揭榜锁定/安全撤销优先 | [AC-27-33.test.js](../tests/AC-27-33.test.js) |
| AC-34 | 通过 | 同一图像串行队列，已审静图才GIF | [AC-34-38-48.test.js](../tests/AC-34-38-48.test.js) |
| AC-35 | 通过 | Images精确SSE字段、partial不结束等待、真实标注 | [AC-34-38-48.test.js](../tests/AC-34-38-48.test.js) |
| AC-36 | 待彩排 | mock路径通过，账号精确edits/GIF组合未做真实调用 | [AC-34-38-48.test.js](../tests/AC-34-38-48.test.js) |
| AC-37 | 通过 | 固定静图/GIF参数，无GIF不支持字段，全帧审批 | [AC-34-38-48.test.js](../tests/AC-34-38-48.test.js) |
| AC-38 | 通过 | 共用120秒/一次重试/请求计数/取消未知处理 | [AC-34-38-48.test.js](../tests/AC-34-38-48.test.js) |
| AC-39 | 通过 | 魔数/CRC/截断/大小/编码传输及流数量限制 | [AC-34-44.test.js](../tests/AC-34-44.test.js) |
| AC-40 | 通过 | 实际尺寸、锁定最终尺寸、APNG拒绝 | [AC-34-44.test.js](../tests/AC-34-44.test.js) |
| AC-41 | 通过 | 实际6/4/7帧和200ms时长检查 | [AC-34-44.test.js](../tests/AC-34-44.test.js) |
| AC-42 | 通过 | GIF完整容器/LZW/逐帧合成、不同帧哈希/联系表 | [AC-34-44.test.js](../tests/AC-34-44.test.js) |
| AC-43 | 待彩排 | 独立Worker/像素/超时用例通过，Mac并行负载与资源实测待做 | [AC-34-44.test.js](../tests/AC-34-44.test.js) |
| AC-44 | 通过 | 检查/审批/取用同一SHA，替换原文件读取拒绝 | [AC-34-44.test.js](../tests/AC-34-44.test.js) |
| AC-45 | 通过 | 无预算/非法/非正/无上界禁全部付费 | [AC-20-45-49-58-66.test.js](../tests/AC-20-45-49-58-66.test.js) |
| AC-46 | 通过 | 无默认5，估算不作费用上界 | [AC-20-45-49-58-66.test.js](../tests/AC-20-45-49-58-66.test.js) |
| AC-47 | 通过 | 4.70+0.20+0.11拒绝，+0.10原子余额竞争 | [AC-20-45-49-58-66.test.js](../tests/AC-20-45-49-58-66.test.js) |
| AC-48 | 通过 | 取消/迟到/重启保留预留，文本同账本 | [AC-20-45-49-58-66.test.js](../tests/AC-20-45-49-58-66.test.js) |
| AC-49 | 通过 | 实际超限后halt及持续摘要，未知不结零 | [AC-20-45-49-58-66.test.js](../tests/AC-20-45-49-58-66.test.js) |
| AC-50 | 待彩排 | 核心分权通过；真实HTTP/WS监听被EPERM阻断，窗口隔离待Mac | [AC-50-57.test.js](../tests/AC-50-57.test.js) |
| AC-51 | 待彩排 | 舞台状态机通过，真实DOM/浏览器/离线画面待Mac | [AC-50-57.test.js](../tests/AC-50-57.test.js) |
| AC-52 | 待彩排 | 租期模型通过，实际双向WS/浏览器计时待Mac | [AC-50-57.test.js](../tests/AC-50-57.test.js) |
| AC-53 | 待彩排 | 精确回执模型通过，浏览器渲染后回执待Mac | [AC-50-57.test.js](../tests/AC-50-57.test.js) |
| AC-54 | 待彩排 | 未确认告警模型通过；冻结采集/人工切源须Mac | [AC-50-57.test.js](../tests/AC-50-57.test.js) |
| AC-55 | 待彩排 | 恢复/撤销模型与干净重启通过，真实应用回执/预览待Mac | [AC-50-57.test.js](../tests/AC-50-57.test.js) |
| AC-56 | 待彩排 | 常驻角标代码具备；真实采集裁切/口播/平台声明待Mac | [AC-50-57.test.js](../tests/AC-50-57.test.js) |
| AC-57 | 待彩排 | 原字节/血缘与c2patool只读适配具备，真实签名/签发者验证工具与样本待补 | [AC-57-provenance.test.js](../tests/AC-57-provenance.test.js) |
| AC-58 | 待彩排 | Host/Origin处理函数通过；实际loopback/WS握手被EPERM阻断 | [AC-58-61-handler.test.js](../tests/AC-58-61-handler.test.js) |
| AC-59 | 通过 | 一次性/有效期/注销及运行期会话 | [AC-58-61-handler.test.js](../tests/AC-58-61-handler.test.js) |
| AC-60 | 通过 | Cookie+显式Authorization+CSRF；GET不写 | [AC-58-61-handler.test.js](../tests/AC-58-61-handler.test.js) |
| AC-61 | 通过 | 舞台无控制令牌，回执严格字段白名单 | [AC-58-61-handler.test.js](../tests/AC-58-61-handler.test.js) |
| AC-62 | 待彩排 | Bridge合约mock通过；官方实际SHA、bundle加载与宿主运行待Mac | [AC-62-64.test.js](../tests/AC-62-64.test.js) |
| AC-63 | 待彩排 | 本场日志重放通过；宿主实际转录路径/权限/留存待Mac | [AC-20-45-49-58-66.test.js](../tests/AC-20-45-49-58-66.test.js) |
| AC-64 | 待彩排 | mock静止退出与clean屏障通过；实际DSH卸载/并行回调待Mac | [AC-62-64.test.js](../tests/AC-62-64.test.js) |
| AC-65 | 待彩排 | 未在主播Mac/真实DSH/伴侣并行负载做三轮，明确不计通过 | [AC-01-66-integration.test.js](../tests/AC-01-66-integration.test.js) |
| AC-66 | 通过 | 意图写/fsync、事件/索引、闭合fsync故障后重启及后续clean均不复活 | [AC-20-45-49-58-66.test.js](../tests/AC-20-45-49-58-66.test.js) |

审查回归入口：[AC-review-regressions.test.js](../tests/AC-review-regressions.test.js)。原始最终输出：[offline](test-evidence/offline.log)、[check](test-evidence/check.log)、[network](test-evidence/network.log)、[browser](test-evidence/browser.log)。
