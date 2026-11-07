# 应用内弹幕采集器

Go bridge 固定使用 MIT 开源库 `github.com/jwwsjlm/douyinLive/v2 v2.3.2`，不启动 HTTP/WebSocket 本地服务。主应用通过标准输出 JSONL 接收 `status` 和 `comment`；停止应用时终止子进程。

`node scripts/setup-capture.mjs` 首次编译至 `data/bin/douyin-capture`；需要 Go 1.27.3+ 和首次下载 Go 模块的网络。主应用首次连接也会自动准备，无需另装 douyinLive。后续启动复用本机二进制。

`data/bin/douyin-capture --room 直播间号` 可直接诊断。可选登录态仅从 `PAINTER_CAPTURE_COOKIE` 环境变量传入，不出现在进程参数或桥接输出。主应用使用 `DOUYIN_COOKIE` 配置后传给该变量。`--version` 不访问抖音。

状态区分：`connecting` 建连中、`running` 已完成真实上游 WebSocket 握手、`offline` 已确认未开播、`not_found` 不存在、`error` 未能确认上游状态（可能网络/验证）、`reconnecting` 连接失败重试。连接成功不保证每种消息都存在；真实弹幕需要目标直播间开播及上游允许访问。

源代码及许可证：https://github.com/jwwsjlm/douyinLive ，MIT notice 见 `LICENSE.douyinLive`。
