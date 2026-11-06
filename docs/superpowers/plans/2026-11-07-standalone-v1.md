# 老板模式独立包 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. User supplied the design, execution order and authorization; do not add approval gates. Steps use checkbox syntax.

**Goal:** 从 feat/v1-impl 交付本机打开即用的 macOS arm64 独立成品包；不合并。

**Architecture:** 新增 standalone 宿主，直接装配现有 M1–M7 类并复用 Runtime 的命令、调度与关闭逻辑。独立 HTTP 层只绑定 127.0.0.1:7321，不生成控制令牌；独立页面保留逐项审核、哈希审批、舞台心跳和安全撤销。

**Tech Stack:** Node 24 / ESM / ws / omggif / zsh / ZIP。

**Spec:** 用户 2026-11-07 返工裁定；docs/implementation-plan.md（冲突处以用户裁定为准）。

## Global Constraints

- lib/、index.js、cordis.patch.yml 与 DSH 原有页面保持不动。
- 控制端无登录，无会话令牌文件，不读取 .env；设置保存 data/settings.json。
- API Key 密码框、预算默认 5 USD、直播间标识与 douyinLive 开关（默认关）。
- 未审文字/像素不上屏；AI 生成内容常驻；MOCK 来源按轮冻结，不能因填入 key 去掉既有演示图标注；撤销立即执行。
- 设置热更新；当前轮使用开轮时的生成来源，下一轮使用新 key，页面明示。
- 六项按顺序逐个 commit；main 与 PR #11 不动。

## Review Focus

- 保存 key 时不回显、不写日志、不混入账本/成品 ZIP；空值清除，省略保留。
- 设置保存失败不能报告成功；并发请求不能覆盖刚保存的字段。
- 切 key/接入时不能改变当前轮来源，也不能放行旧轮回调。
- 无登录仍校验精确 Host、Origin 和 JSON 类型，拒绝外站写入及 DNS 重绑定。
- 关终端、端口冲突、坏设置文件和重复启动应安全退出；Mac 二进制不能冒充已执行。

### Task 1: 独立入口

**Files:** server.js; standalone/{host,http,mock,publisher}.js; public/boss-*; package.json; tests/standalone/host.test.js。
**Interfaces:** StandaloneHost.open(config, options) -> Runtime-compatible host; BossServer.start() -> fixed loopback origin; command -> inherited safety checks。
- [ ] 先写宿主测试，验证默认无令牌、复用审核链、MOCK 未审不能发布，运行观察失败。
- [ ] 装配既有模块，新增独立 HTTP 与页面入口，npm start = node server.js。
- [ ] 运行宿主测试和原 55 项。Expected: 全过，lib/ 零差异；commit。

### Task 2: 设置区与热更新

**Files:** standalone/settings.js; host/http/boss 页面; tests/standalone/settings.test.js。
**Interfaces:** Settings.open(root); view() -> redacted fields; save(patch) -> persisted settings; host.applySettings() -> budget/transport hot update, key next round。
- [ ] 先写保存/重读/并发/非法值/来源切换测试，运行观察失败。
- [ ] 实现原子本地文件与设置区，补齐可操作的代录、审词、评分、图片审批流程。
- [ ] 运行独立测试、原测试、语法检查。Expected: 全过；commit。

### Task 3: macOS 启动器

**Files:** 启动.command; tests/standalone/launcher.test.js。
- [ ] 用可执行替身验证 runtime/node 优先、系统 node 回退及关窗停止。
- [ ] 新增可执行 zsh 脚本，一秒后 open 控制页，缺 Node 弹窗打开官网。
- [ ] 运行启动器行为测试。Expected: 全过；commit。

### Task 4: 运行时

**Files:** runtime/node; runtime/README.txt; scripts/fetch-mac-runtime.sh。
- [ ] 下载 Node 24 darwin-arm64 官方包，校验官方 SHA256，仅取 bin/node，保留许可证。
- [ ] npm ci；file runtime/node。Expected: Mach-O arm64；若网络阻断，如实记录，不造二进制。
- [ ] commit 可取得的运行时及可复现脚本。

### Task 5: 成品 ZIP

**Files:** scripts/package-boss.py; delivery/danmu-painter-mac.zip; README-BOSS.md。
- [ ] 按白名单打包，包含宿主、lib、public、依赖、runtime 和启动器；排除测试、长文、data 密钥及 delivery 自身。
- [ ] 干净目录解压，用系统 node 启动，curl 两页 200，保存/重读设置，真实 HTTP+WS 手动 MOCK 全轮及撤销。
- [ ] 原 55 项、网络、浏览器和新增测试；记录证据；commit。

### Task 6: 裁定与交付说明

**Files:** docs/REWORK-BOSS.md; docs/test-evidence/boss-*。
- [ ] 一页说明三处偏差及用户裁定依据、测试、Mac 待确认项与网络限制。
- [ ] 按 requesting-code-review 做独立分支审查，修复重要问题并重新验证。
- [ ] commit；尝试 push，失败则生成 delivery/feat-standalone-v1.bundle 并校验 HEAD；不合并。
