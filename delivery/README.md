# 本地分支交付与恢复

本环境原始 `.git` 只读；实际实现分支在 `/tmp/dsh-painter-v1-git/.git`，工作文件仍在本仓库。`feat/v1-impl.bundle` 包含从设计冻结到全部实现/测试/文档的可恢复Git历史；`feat-v1-impl.patch` 是相对24259b4的补充文本补丁。两份大产物按现有.gitignore不再提交进自身历史。

正常腾讯镜像安装、全部CNB读取、每模块push、最终push和`cnb pulls post-pull`均已实际尝试。网络限制导致DNS/ConnectionRefused，没有成功PR链接，没有合并或修改main。PR请求失败原始输出在 `docs/test-evidence/pr-attempt.log`。

在有网络、Git元数据可写且CNB CLI已登录的环境，可恢复到新的目录，保留现有工作区：

```bash
git clone --branch feat/v1-impl /absolute/path/to/feat-v1-impl.bundle /tmp/dsh-douyin-painter-v1-recovered
git -C /tmp/dsh-douyin-painter-v1-recovered remote set-url origin https://cnb.cool/stevelife524/bloomstage/dsh-douyin-painter.git
git -C /tmp/dsh-douyin-painter-v1-recovered push -u origin feat/v1-impl
cnb pulls post-pull --repo stevelife524/bloomstage/dsh-douyin-painter --base main --head feat/v1-impl --title '实现弹幕画师 v1：DESIGN v1.3 七模块与66条AC' --body-file /tmp/dsh-douyin-painter-v1-recovered/docs/PR-BODY.md
```

已有同名远端分支/PR时先核对远端状态，不强推、不重复建PR。上述命令只推实现分支并创建PR，不合并。完整66行正文、测试失败原因、模块完成情况与待Mac清单均在PR-BODY中。
