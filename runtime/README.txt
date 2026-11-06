此目录应包含 Node 24 官方 darwin-arm64 包中的 bin/node（可执行）。
构建机可运行 scripts/fetch-mac-runtime.sh：校验 SHASUMS256 后仅提取 node 和其许可证，file 必须报告 Mach-O arm64。

2026-11-07 当前沙箱下载受阻：mirrors.cloud.tencent.com 与 nodejs.org 均 DNS 解析失败。
目前没有 runtime/node；没有放入占位程序或 Linux 二进制。
当前交付降级包需 Mac 已安装系统 Node 24；这不满足“自带运行时、解压即跑”的完整验收。
取得官方运行时后重新打包，才能按自带运行时版验收。Mac 首启与实际采集仍须现场确认。
