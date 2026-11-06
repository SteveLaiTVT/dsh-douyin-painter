# 独立代码审查记录

2026-11-07，requesting-code-review 流程，独立只读 reviewer `boss_review`；不调用真实 API、不读取真实密钥。

- 首轮发现两项 Important：开轮来源标记晚于发布，可能把真实请求按 MOCK 结算；固定 show ID 导致跨启动累计请求达到 9 次后永久无法再生成。
- 先运行失败回归，分别观察到首次发布来源 undefined、重启后 show ID 仍为 boss。
- 修复：开轮初始化屏障、设置快照、先落来源再发布；只有明确 MOCK 标记与 mock-demo 请求可按 0 结算；沿用 loadConfig 每启动新场的默认行为，保留历史。
- 复审做了延迟启动的对抗检查：并发命令/生成被阻止，清 Key 不改变起始轮真实 provider，紧急遮罩立即取消，迟到启动不会恢复轮次，下一轮才使用 MOCK。两项 Important 均已解决。
- 最终检查 ZIP：大小 143278 字节，SHA256 与清单一致；每个清单哈希匹配源码和归档；无 data、.env、Git、测试、项目 docs 或实际 API Key；启动器模式 0755，旧 lib 与 DSH 页面未变。
- 最终结论：无新增 Critical / Important 代码阻断；运行时缺失、网络 / 浏览器 / Mac 未验证仍是交付限制，不能宣称完整验收。
