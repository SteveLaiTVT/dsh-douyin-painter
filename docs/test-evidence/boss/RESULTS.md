# 老板模式完整交付与自测记录 · 2026-11-07

依据：**提出人 2026-11-07 亲自裁定，单机、单人、本人 Mac 自用**，覆盖 v1.3 冻结设计中以下三处独立形态的运维口径；原 DSH 形态不受影响。

| 项目 | v1.3 / 原 DSH | 本次独立形态 |
|---|---|---|
| 控制端令牌登录 | 一次性令牌换会话、私有令牌文件 | 打开控制页即用；无登录、cookie、控制令牌或会话令牌文件；仍校验精确 Host / Origin / JSON |
| 单场预算 | 未显式配置则禁止付费 | 设置区字段，默认 **5 USD**，随时保存立即生效；不要求 `.env` |
| 运行入口 | DSH / cordis 插件宿主 | `npm start` → `node server.js`，固定 **127.0.0.1:7321**；独立页面与 macOS 双击启动器 |

`lib/` M1–M7、`index.js`、`cordis.patch.yml`、旧控制页和舞台页均与 `feat/v1-impl` **无差异**。新增 `standalone/` 直接装配并复用原 Runtime 命令、审核、账本、解码和发布链。API Key 密码框只写 `data/settings.json`（明文本机文件、600 权限），接口不回显；预算与接入热更新，Key 下一轮生效。默认关闭 douyinLive，控制页「手动代录」输入投稿。默认每次启动新一场，历史保留，不重置进行中场次的账本；单场图片请求上限仍为 9（包含 MOCK / 重试）。独立宿主内置固定图片参数与每次 $1 预留；实际费用保留待核，不声称是服务端硬额度或已通过真实 API 彩排。

内容安全原样保留：**先审后播、未审不上屏**，文字与像素按原版本/哈希批准；舞台常驻 **AI 生成内容**；MOCK 舞台及图片像素明确标注演示，来源按轮冻结；拒绝输出整轮立即撤销，不能恢复违规素材。独立审查发现的来源初始化/费用竞态及跨启动请求次数问题已用先失败后通过的回归测试修复，复审无新增重要问题。

交付分支 **feat/standalone-v1**（从 `feat/v1-impl` 的 `d19c883` 建立），不合并、不动 main、不改 PR #11。原 `.git` 只读，沿用 `/tmp/dsh-painter-v1-git/.git` 保存提交历史。ZIP：[`delivery/danmu-painter-mac.zip`](../../../delivery/danmu-painter-mac.zip)，**143,278 字节**；[SHA256](../../../delivery/danmu-painter-mac.zip.sha256)。无测试、项目 docs、delivery 自身、data 设置/密钥；启动器保留 0755，依赖均为纯 JS。

| 验证 | 结果与证据 |
|---|---|
| 原 55 项 / 新增独立项 | **55/55、9/9 通过**；[原测试](original-55.log)、[独立测试](standalone-9.log)；语法检查通过 |
| 干净解压，用 Linux 系统 Node 24 | **离线处理器与完整 MOCK 链通过**：两页处理器 200、设置保存及接口/磁盘重读、代录→审词→评分→审榜→静图/GIF 审批→StageState 上屏回执→立即撤销；[记录](extracted-zip-offline-smoke.json) |
| 真正启动 / curl / 网络测试 | **未通过：沙箱禁止 loopback 监听（EPERM）**，curl 两页连接失败；不能把处理器 200 当 TCP 实测；[启动](extracted-startup.log)、[网络测试](network-blocked.log) |
| 浏览器测试 | **未通过：环境无 Playwright / Chromium**；[记录](browser-unavailable.log) |
| Node 24 darwin-arm64 | **未取得**：腾讯镜像、nodejs.org 均 DNS 失败；`runtime/node` 不存在，**尚不能 file 核验 Mach-O arm64**；[下载记录](runtime-download-blocked.log) |

**当前 ZIP 是明确标注“需系统 Node”的降级包，尚不满足自带运行时、Mac 解压即跑的完整验收。** 默认打包器拒绝缺运行时的完整构建；本包用显式 `--allow-system-node`，内含 `RUNTIME-MISSING.txt`、`selfContained:false`，无占位或 Linux 二进制。待取得官方包后运行 `scripts/fetch-mac-runtime.sh`（校验 SHA256、只取 node 和许可证）、`python3 scripts/package-boss.py`；仍须在 Mac 确认 Mach-O 首启、终端关闭停服、真实 API / douyinLive 与直播伴侣采集。Linux 不执行 darwin 程序。

推送因沙箱网络失败；交付 [`delivery/feat-standalone-v1.bundle`](../../../delivery/feat-standalone-v1.bundle)，**最终 HEAD 以 `git bundle list-heads delivery/feat-standalone-v1.bundle` 的分支引用为准**；[失败记录](push-blocked.log)。可在可写本地仓库 `git fetch /路径/feat-standalone-v1.bundle feat/standalone-v1:feat/standalone-v1` 后检出该分支，不涉及 main 或 PR #11。
