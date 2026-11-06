# 老板模式返工说明 · 2026-11-07

依据：**提出人 2026-11-07 亲自裁定，单机、单人、本人 Mac 自用**，覆盖 v1.3 冻结口径中以下三处运维要求，**仅影响独立形态**。

| 项目 | 原 v1.3 / DSH | 独立形态 |
|---|---|---|
| 控制端登录 | 一次性令牌换会话、私有令牌文件 | 打开即用，无登录或控制令牌文件；仍校验 Host / Origin / JSON |
| 单场预算 | 未配置即禁止付费 | 控制页设置字段，默认 **5 USD**，保存立即生效，无需 `.env` |
| 入口 | DSH / cordis 插件 | `npm start` = `node server.js`，固定 **127.0.0.1:7321**；独立页面与 macOS 启动器 |

`lib/` M1–M7、`index.js`、`cordis.patch.yml`、原控制页/舞台页均与 `feat/v1-impl` **无差异**。新增 `standalone/` 装配既有审核、解码、账本和发布链。Key 密码框写入本机 `data/settings.json`（明文，600 权限），接口不回显；预算/接入热更新，Key 下一轮生效。默认关闭 douyinLive，控制页「手动代录」输入投稿。每次启动新一场，历史保留；当前场不因开新轮重置预算，单场最多 9 次图片请求（含 MOCK / 重试）。

**内容安全保留**：先审后播、未审不上屏、版本/哈希绑定审批；舞台常驻「AI 生成内容」，MOCK 舞台和图片可见演示标注且按轮冻结；违规整轮立即撤销，不能恢复。独立审查发现的来源/费用竞态及跨启动次数问题已用回归测试修复，复审无新增重要问题。

交付：**feat/standalone-v1** 从 `feat/v1-impl@d19c883` 建立，逐项提交，不合并、不动 main、不改 PR #11。[ZIP](../delivery/danmu-painter-mac.zip) **143,278 字节**（[SHA256](../delivery/danmu-painter-mac.zip.sha256)），无测试、项目长文、delivery 自身或 data 密钥；启动器 0755、依赖纯 JS。

**已验证**：原 **55/55**、新增 **9/9**、语法检查、启动器三分支行为；干净解压后用系统 Node 跑通离线页面处理器 200、设置保存重读、完整 MOCK 审核/出图/StageState 上屏回执与撤销。详见[自测记录](test-evidence/boss/RESULTS.md)。

**尚未完整验收**：两个下载域名 DNS 失败，缺 `runtime/node`，无法核验 Mach-O arm64；当前 ZIP 明确标为「需系统 Node」的降级包，`selfContained:false`，无假二进制。沙箱禁止 loopback 监听（EPERM），真实启动/curl 与网络测试未通过；缺 Playwright/Chromium，浏览器测试未通过。取得官方运行时后用 `scripts/fetch-mac-runtime.sh` 校验下载，再严格打包；Mac 首启、关窗停服、真实 API / douyinLive 和直播伴侣采集均待现场确认。Linux 不执行 darwin 程序。

原 `.git` 只读，历史在 `/tmp/dsh-painter-v1-git/.git`。推送 DNS 失败，交付 [bundle](../delivery/feat-standalone-v1.bundle)；最终 HEAD 见 `git bundle list-heads delivery/feat-standalone-v1.bundle`。本地可用 `git fetch /路径/feat-standalone-v1.bundle feat/standalone-v1:feat/standalone-v1` 导入分支。
