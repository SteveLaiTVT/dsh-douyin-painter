# 实现期测试记录

冻结准据：24259b4，DESIGN v1.3，AC-01–AC-66。执行环境：Linux、Node v24.22.0、npm 11.19.1。本轮未读取/创建真实凭据、未做任何付费调用；Images与宿主边界使用明确mock，文件解析/独立Worker、磁盘读写和状态机是真实执行。

| 命令/操作 | 实际结果 | 解释 |
|---|---|---|
| 正常腾讯镜像 `npm install`，非offline | 失败，EAI_AGAIN | mirrors.cloud.tencent.com DNS受限；没有卡在omggif |
| 从现有omggif 1.0.10包与ws 8.22.1缓存恢复 | 成功 | lockfile补齐sha512完整性与标准包URL；后续`npm ci`仍需可用网络/完整缓存 |
| Node默认测试子进程隔离 | 失败 | 此沙箱spawn EPERM；改为同进程测试入口 |
| `npm test`（审查前） | 45通过，0失败，0跳过 | 真实独立解码Worker可运行；每模块RED→GREEN记录见implementation-progress |
| `npm run check`（审查前） | 41模块语法通过，包入口导入成功 | VM模块有Node实验性提示；不等同宿主加载 |
| `npm run test:network` | 0通过，1失败，0跳过 | `listen EPERM 127.0.0.1`，真实loopback HTTP/WS未验证；核心请求处理函数另有通过测试 |
| `npm run test:browser` | 0通过，1失败，0跳过 | 未安装playwright/Chromium；未运行真实DOM/视觉检查，不冒充通过 |
| `cnb issues get-issue #3–#10` | 全部失败 | ConnectionRefused；读取上一轮/tmp/issues摘录作辅助，冻结v1.3正文权威 |
| `cnb issues list-issue-comments #10/#9/#5` | 全部失败 | AC-66同步评论无法在线读取；冻结正文的AC-66已实现故障测试 |
| 每模块 `git push origin feat/v1-impl` | 全部失败 | cnb.cool DNS不可解析；没有远端分支/PR成功证明 |

Git原始`.git`只读；实际实现提交位于`/tmp/dsh-painter-v1-git/.git`（work-tree仍为本仓库），基于24259b4的feat/v1-impl。`main`与设计分支原始引用均未修改。最终提供bundle/补丁与PR正文，不能把本地提交写成push或PR已创建。

审查后最终结果在本文件后续追加，以最终命令输出为准。Mac待验证内容见MAC-REHEARSAL，66条逐条状态见AC-STATUS。

## 审查修正后最终命令

- `npm test`：**55通过 / 0失败 / 0跳过**，实际约18秒。
- `npm run check`：**45模块语法通过＋包入口导入成功**；Node VM实验性提示保留。
- 五项Important审查问题全部先RED再GREEN，详见CODE-REVIEW；原有取消后安全回调测试改为等待真实mock发送开始，避免把“已预留”错当“已发出”。
- 真实loopback与浏览器分别仍为0通过/1失败；原因是沙箱listen EPERM与缺playwright，不删除、不跳过、不报成功。
- 全部真实OpenAI调用、douyinLive实连、DSH实跑、C2PA签名验证样本和伴侣采集均未执行。

原始最终输出保留在 `docs/test-evidence/`；network/browser是明确失败日志，review-red保留修正前的真实复现，offline为最终成功输出。
