# 弹幕画师 · 一词成画

按冻结 [DESIGN v1.3](DESIGN.md)（24259b4，66条AC）实现的 DSH 进程内 external protocol driver。M1–M7 代码、按AC组织的离线测试和独立控制/舞台已提交到本地 `feat/v1-impl`；尚未通过主播Mac彩排。本环境网络阻断，push/PR没有成功，不合并、不改main。

- [66条AC逐条状态](docs/AC-STATUS.md)：45通过、21待彩排。
- [实际测试记录](docs/TEST-RESULTS.md)：55项离线通过，真实网络/浏览器各1项环境失败。
- [Mac部署与三轮彩排清单](docs/MAC-REHEARSAL.md)、[审查修正记录](docs/CODE-REVIEW.md)。
- [实施计划](docs/implementation-plan.md)、[续跑账本](docs/implementation-progress.md)、[两张架构图](docs/arch/README.md)。

```bash
npm ci --ignore-scripts --registry=https://mirrors.cloud.tencent.com/npm/
npm test
npm run check
npm run test:network
npm run test:browser
```

本轮Node24.22.0实测。默认test使用同进程Node测试运行器，文件检查实际使用独立可中止Worker；浏览器命令另需本机playwright与Chromium。网络/浏览器失败不能视为通过；代码导入也不等于DSH已加载。

插件通过包入口和 `cordis.patch.yml` 加到实际官方宿主profile，模块/补丁双写inject。它不提供独立常驻后端：HTTP与WS由driver在127.0.0.1动态端口创建，端口不占douyinLive的1088。具体安装/profile命令及官方宿主SHA必须在目标Mac记录。

`.env.example` 只列配置名；不会自动读取仓库`.env`。新场未显式保存有效`show_budget_limit_usd`时，所有付费通道禁用；缺可靠费用上界、已测路径或宿主工具隔离证据也不自动调用。测试只用mock，不读取/创建真实key、不发付费请求。完整参数、项目/模型/端点、已审SHA与请求映射都在本场私有账本。

控制窗从本机私有令牌文件兑换本次会话；舞台不取得控制凭证，只接白名单投影、受限心跳与应用回执。实际采集只选舞台窗口。安全撤销立即禁播/撤播，不等磁盘；running/clean与独立意图屏障共同决定重启信任，永久撤销或未排除的旧快照不能恢复。缺回执时必须由操作员切断采集源。

实现合约依据：[官方external driver cookbook](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/cookbook/extension-cookbook.md)、[官方Agent与maxTokens](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/core/agent/README.md)、[官方Tools限制/guard](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/core/tools/README.md)、[Images事件参考](https://developers.openai.com/api/reference/resources/images/methods/generate)。C2PA使用[官方c2patool只读报告](https://github.com/contentauth/c2patool/blob/main/docs/usage.md)适配，缺工具/未知结果如实记录，不伪造信任或SynthID验证。
