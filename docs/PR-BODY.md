按冻结 DESIGN v1.3（24259b4）实现弹幕画师v1七模块及软件架构：投稿经受理、审核、冻结与全候选复算后，生成已审静图/原生GIF，再由只读舞台发布。普通迟到不采用，安全拦截按原请求映射整轮永久撤销；独立屏障和退出见证封闭AC-66恢复窗口。

目标为 `main`，来源 `feat/v1-impl`。**不合并；main未改。当前环境push及CNB API受阻，此文件是可审阅PR正文，不代表PR已创建。**

关联总纲 #10、模块 #3/#4/#5/#6/#7/#8/#9。cnb CLI已尝试读取全部issue和#10/#9/#5评论，均ConnectionRefused；采用冻结正文v1.3和上一轮本地摘录，不宣称在线同步读取成功。

## 模块完成情况

| 模块 | 实现及本轮验证 | 尚待现场验证 |
|---|---|---|
| M1 | WS/代录独占入口，本机时间/序号，去重，有界缓冲，离线/断线退避 | 实际douyinLive封包、消息/身份、登录态与WS实连 |
| M2 | T1停收/T2冻结，D等时从严，60/30容量与同批排序，规范化快照哈希，K/phase/attempt隔离 | Mac真实节奏与操作员负荷 |
| M3 | 私有待审文字、准确哈希/版本审批、原图逐项/GIF全帧，迟到输出独立整轮撤销与血缘封禁 | 人工预览/逐帧及宿主无工具隔离实测 |
| M4 | 全候选0–5整数，8/7/5程序加权与排序，理由/扩写再审，版本审计和3/3/6揭榜 | 真实模型/舞台时序及可读性 |
| M5 | Images SSE精确字段、静图→获批→GIF串行、已测参数签名、PNG/GIF实际完整解码/联系表、Worker资源闸门、请求及美元预算 | 账号精确组合/edits、真实账单、Mac并发资源 |
| M6 | 独立控制/舞台，常驻AI标识、本地安全画面，心跳/精确回执/未确认切源告警，人工恢复静图且不自动重播旧GIF，原件与C2PA只读适配 | 真实浏览器、伴侣采集、口播/声明、签名样本 |
| M7 | DSH name/inject/apply＋bundle insert，own-session bridge，单写入者、fsync/原子索引、running/clean及撤销屏障，鉴权/CSRF/只读舞台、有序静止退出 | 官方实际SHA、加载/工具/取消/卸载及宿主留存路径 |

## 66条AC逐条状态

45通过、21待彩排、0未做。通过是已运行的离线软件契约；复合AC含真实环境要求时保留待彩排。没有用mock冒充实机验收。

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


## 测试与审查

- `npm test`：55通过、0失败、0跳过（Linux / Node24.22.0）；真实磁盘与独立Worker解码，API/宿主仅mock，无真实付费调用或凭据读取/创建。
- `npm run check`：45模块语法与包入口导入通过；保留Node VM实验性提示，不等同宿主加载。
- `npm run test:network`：0通过、1失败，`listen EPERM 127.0.0.1`；HTTP处理函数的鉴权负例测试另已通过，真实HTTP/WS没有通过证据。
- `npm run test:browser`：0通过、1失败，缺playwright/Chromium；未运行真实浏览器/视觉审阅。
- 正常腾讯镜像安装先尝试，EAI_AGAIN；由现有omggif包及ws缓存恢复，锁文件补sha512。没有把GIF检查弱化成仅读头：实际严格容器/LZW/逐帧合成及联系表均已测。
- 独立只读审查5项Important，全部先复现RED再修正GREEN：终止态复活、同批模型顺序、跨K延后审批、GIF恢复URL/重播、切源告警被任务错误覆盖；修正后完整55项通过。另测旧预留取消后不可send、保留额向上取整、停预算通知及C2PA报告解释。
- v1.1图旁注“安全禁播/撤播立即执行，不等磁盘”已有独立小commit，正文安全口径不改。

原始输出：`docs/test-evidence/{offline,check,network,browser,review-red}.log`。审查修正、实施记录和实际限制详见 `docs/CODE-REVIEW.md`、`docs/implementation-progress.md`、`docs/TEST-RESULTS.md`。

## 待Mac彩排（不声称已验）

1. 记录官方DSH真实SHA/版本与宿主留存目录/策略；实际安装profile/bundle、双写inject、自有session输出/idle、单step/maxTokens/no-tools和静止卸载。
2. douyinLive1088实连、真实JSON/身份/live=false/退避及代录切换；M1不提Cookie、不管上游签名。
3. 安装并执行真实loopback/浏览器测试，核对Host/Origin/CSRF/令牌/受控素材与只读舞台；仅采舞台窗口。
4. 全部节目状态核对实际观众端AI角标/等比裁切/手机可读性；开场口播及真实平台声明方式。逐项partial/静图/GIF全帧联系表与至少一圈人审。
5. 心跳1秒/断连3秒/回执1秒；冻结页、休眠、断网、冻结采集时实际切源；旧轮撤销不遮新轮；重连安全、精确已审快照确认恢复，不自动播旧GIF。
6. AC-66写入/fsync故障与重启，非正常退出隔离、后续clean不解封；未知费用/取消/迟到/重启保留，真实费用上界和账单核对后才启付费。
7. 真实已测静图/GIF/edits组合、C2PA工具及签发/验证样本、Mac并行资源；本轮绝无真实付费调用，不用权限历史推定具体组合全开。
8. 在真实Mac/宿主/伴侣并行负载完成3轮，记录阶段耗时、操作者/哈希和完整/降级结果；只有已审静图＋获批原生GIF计完整。详见 `docs/MAC-REHEARSAL.md` 的空白记录表。

预算没有默认5美元：未显式配置/非法/≤0禁项目付费，完整配置无可靠上界也禁。所有收费文本、partial、重试/人工重发都在一个持久化账本；安全撤销不被人工批准、回退或恢复覆盖。
