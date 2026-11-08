# TypeScript 迁移验证 — 2026-11-08

工作基线：main f4a8e6c，当前实现使用 src/，不是评审中含 lib/ 的旧分支。

- 原 JS 基线：189 / 189 离线测试通过。
- TS 编译：应用、脚本、测试、浏览器全部参与 tsc；通用包 strict，应用迁移期 strict=false，没有 noCheck 或 ts-nocheck。
- 迁移后：189 项应用测试、20 项独立包测试通过。
- 浏览器：13 / 13 Playwright 用例通过，覆盖舞台、直播流程、流式音频和策划审核。
- Go：capture 下 go test ./... 通过。
- npm pack：包只包含 dist、README、LICENSE 和 package.json；在临时空项目安装 tarball 后，四个客户端导入成功，注入 fetch 的图片调用成功。无应用源码依赖。
- 静态文件、艺术参考、采集器和测试音频夹具使用正确项目根路径；构建产物无需拷贝 public 或 Go 源码。

原评审的 lib/bridge.js、lib/runtime.js、lib/ranking.js 不存在于当前基线。当前 Harness 适配在 src/harness-text.ts 中通过 Promise.race 观察失败，并在 finally 释放 handle；web/stage.ts 依据 artwork.id 保留图片节点。此迁移没有更改或修复旧分支，也不能据此宣称旧分支的全部问题已解决。

限制：历史业务状态、动作与宿主接口保留宽类型和动态类字段；真实模型、真实语音识别质量和付费服务调用未验证。ASR 只有复用客户端，没有新增项目 UI。CNB 仓库使用私有可见性，尚未发布公共 npm registry。
