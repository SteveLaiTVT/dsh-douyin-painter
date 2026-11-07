# 每日主题大赛 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 交付从本机真实弹幕捕获到主题比赛、选词、图片、语音、对话的完整模块应用，最后提供 Harness 插件。
**Architecture:** Node ESM 业务核心 + 可注入 provider + 应用管理的 Go 采集器 + 本机 HTTP/SSE + 浏览器操作台/舞台。
**Tech Stack:** Node >=22, Go, douyinLive library, browser native modules, node:test.
**Spec:** docs/superpowers/specs/2026-11-07-daily-theme-design.md

## Global Constraints
仅本机；无登录秘密；复用已有凭据但本轮不发付费请求；不得覆盖旧 worktree；插件最后接；不冒充实测。

## Review Focus
主题更换/重复点击时的迟到结果；上游错误或未开播；模型虚构候选和异常音频；语音重叠/停止；浏览器状态与真实配置不一致。

### Task 1: 模型模块
Files: src/providers/{http,deepseek,openai,minimax}.js; tests/providers.test.js.
Interfaces: TextProvider explain/evaluate/select/reply, ImageProvider.generate, SpeechProvider.synthesize，详见 spec。
- [x] 写协议和错误测试，确认失败。
- [x] 实现可注入 fetch/AbortSignal、有限超时和结构化校验，确认测试通过。

### Task 2: 完整弹幕采集
Files: capture/**, scripts/setup-capture.mjs, src/capture.js; tests/capture.test.js.
Interfaces: Capture extends EventEmitter, constructor({binary,cookie,...}), start(room), async stop(); emits comment {id,text,nickname,userId,receivedAt}, status {state,message}.
- [x] 规范化房间、封包、子进程生命周期的失败测试。
- [x] 应用管理的 Go 库桥接、自动准备脚本、许可证和清晰错误。
- [x] 编译本机采集器并测试，不将无直播样本计为成功。

### Task 3: 业务和 HTTP
Files: src/{config,app,server}.js, scripts/start.mjs, package.json; tests/app.test.js, tests/server.test.js.
Interfaces: Application({text,image,speech,capture,dataDir}), snapshot(), dispatch({action,...}), close(); emits change。所有接口详见 spec。
- [x] 写主题切换、选词ID校验、迟到任务、付费重复点击和媒体存储测试并验证失败。
- [x] 实现状态、独立任务忙碌锁、轮次检查、文件持久化和 loopback HTTP/SSE。
- [x] 用注入依赖实测 HTTP 完整流程。

### Task 4: 工作台和舞台
Files: public/{control,stage}.html, public/{control,stage}.js, public/app.css.
- [x] 三工作区 UI、可折叠设置、直播状态、主题、选词、作品、回复、语音。
- [x] 串行语音播放和停止；舞台字幕与音频。
- [x] 浏览器验证主流程、窄屏和错误可读性。

### Task 5: Harness 和交付
Files: src/plugin.js, cordis.patch.yml, README.md, docs/VALIDATION.md.
- [x] 插件可导入且复用业务核心，宿主接入可验证的文本适配器。
- [x] 运行全套测试及语法检查；读取界面最终状态；记录真实/未验证边界。

验证结果及尚未实测边界详见 ../../VALIDATION.md；本轮未提交或push。

### Task 6: UID、噪音与设置增量（用户已同意）
- [x] 通用身份/去重/候选公平模块，源ID与房间命名空间。
- [x] 业务透传UID、多创意保留、每人单名额与原文依据。
- [x] 今日主题和房间号独立保存，UI可读UID及重复计数。
- [x] Node协议/业务回归及浏览器保存恢复/出处验证，无真实付费调用。
