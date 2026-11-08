# TypeScript 与通用 AI 包实施计划

目标：服务端、浏览器源码、脚本与测试统一 TypeScript，抽离可独立发布的 Node ESM npm 包。

用户已要求继续执行，沿用现有 main 的 src 架构；不处理旧 lib 分支。通用包放 packages/ai-kit，通过 npm workspace 引用，同时推送独立 CNB 仓库。保留比赛提示词、主题策划和图片艺术指导在应用层。默认不执行付费 API 调用，也不发布 npm 公共 registry。

- [x] 记录原有测试基线；建立 ASR 与包隔离测试，观察缺失能力失败。
- [x] 抽离 HTTP、通用 JSON 文本请求、OpenAI 图像和 MiniMax TTS；添加可注入 fetch 的 ASR。
- [x] 迁移 src、web、scripts、tests，接入构建，修复构建后静态文件、采集器与夹具路径。
- [x] 编译、原有回归、包测试、浏览器和 Go 测试；用 npm pack 验证独立安装。
- [x] 编写迁移限制和包使用文档；分组提交，推送任务分支与独立包仓库，核对远端 SHA。

验证重点：超时取消和安全错误、GIF/参考图保持原行为、流式 TTS 清理、构建产物路径和 workspace 外独立安装。迁移中若保留宽类型，应明确记录，不能把语法迁移称为完整领域类型建模。
