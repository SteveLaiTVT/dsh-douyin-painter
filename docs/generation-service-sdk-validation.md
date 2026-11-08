# 生成服务 SDK 交付验证 — 2026-11-08

## 边界

语音生成与生图分别独立项目，依赖小型 task-runtime 执行内核。三个 SDK strict 编译，src 无 any；应用宽类型迁移限制未改变。旧 ai-kit 保留兼容，不删除既有版本。

## 证据

- task-runtime：12 项测试，覆盖 FIFO/容量、重试占用、取消资源退出、排队/尝试/总超时、关闭、日志异常和错误关联。
- speech-generation：25 项测试，覆盖 provider 合约、MiniMax 整段与 SSE、聚合校验、取消 setup/read 竞态、不消费流超时、首段后不重试、输入快照与未知结果重试。
- image-generation：14 项测试，覆盖 provider 槽位、PNG/GIF/参考图、输入拒绝、可观测错误与显式 unknown-outcome 重试。
- 主项目：192 项测试（原189 + 服务并发/关闭/完成状态3项），浏览器13项通过。PNG 正例夹具升级为完整小图片，未放宽媒体校验。
- 两个 SDK npm tarball 在空项目安装，自动解析远程 task-runtime 后完成 fake 语音/图片并行编排。源码目录和 file: 依赖均不参与独立安装。
- 三个 CNB Release 附件已上传、回读并下载，下载内容 SHA-256 与服务器元数据一致。
- 三个 SDK 与主项目分别由 Git archive 导出到干净目录，独立 npm ci / npm test 均通过；三个 SDK 的远端 main 与 v0.1.0 tag 均与本地源码 SHA 一致。
- 代码复核发现的两处流取消卡住、图片 unknown 重试、错误关联与 provider ID 初始化问题已修复并补测试；业务读取完 chunk 而未等待 SDK completion 的问题也已补回归。

## 发布记录

| 仓库 | 源码提交 | 包 SHA-256 |
| --- | --- | --- |
| [stevelife524/lib/task-runtime](https://cnb.cool/stevelife524/lib/task-runtime) | `9b364b99cecd2b0405aa47a05be42a131f0bc100` | `b3d97114417d4afc12cbe76d2f3f76c9b085fdf0a859968cfa034f9c2950af0c` |
| [stevelife524/lib/speech-generation](https://cnb.cool/stevelife524/lib/speech-generation) | `b250cf6466743cf1cd1c396b5276c6954086f697` | `947a435d5f75f704552fceae8ba1742b8e66ad5bdbacd71860179868a1bdfe32` |
| [stevelife524/lib/image-generation](https://cnb.cool/stevelife524/lib/image-generation) | `5c199095b30c058114162c7907487331ad67309c` | `635342f61b9353bd4b021609f1b4f5152e39b1dcb30f87ae8126de0117f4a54d` |

每个 SDK 的版本为 0.1.0。当前采用私有 CNB Git/Release 分发，尚未发布 npm registry；首次安装需要 CNB Git 读取权限。没有执行真实供应商付费调用，故不宣称真实生成质量、费用、供应商限流或生产验收已通过。
