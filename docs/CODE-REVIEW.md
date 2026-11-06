# 最终只读审查与修正

一次独立审查范围：24259b4..e6fe400，DESIGN v1.3 + 七模块 + 软件架构，审查者不改工作树、不派生其他审查者。审查时45项测试通过，结论是须修正后再评估；没有以通过测试替代设计核验。

| 重要问题 | 修正 | 回归证据 |
|---|---|---|
| cancelled/paused仍可被T1计时或迟到review恢复处理，排队文本K可漂移 | 只有collect/drain可审词/停收；调度时复制K，付费与结果落入前再次检查K/phase/deadline | AC-review-regressions：terminal state及旧预留send拒绝 |
| 模型反序决定最后名额，末项非法可能部分入池 | 全数组先验证，准备准确文字审批后一次交给RoundEngine，单一登记时点按ingress顺序占位 | 29/30容量＋反序模型真实运行回归 |
| 旧审批异步返回后把新轮推进GIF | phase与task转换带源K/可选from/task，并在轮次队列内核对 | 已提交审批延后返回＋取消/开新轮，新轮仍collect |
| GIF恢复发静图URL但服务器权威投影仍为GIF，后续tick重播 | 恢复精确投影先落盘再采用；当前URL匹配；对该次恢复前的GIF保持禁止自动播放 | 恢复静图真实handler取用成功，随后publish仍static |
| 任务错误遮住1秒缺回执的切源告警 | 控制告警组合stage/task/budget，切源文案独立保留 | 同时有任务失败/预算问题仍显示切断采集源 |

每项先复现RED，再修正GREEN；最终全套55/55。另补sub-microdollar金额上界、停预算通知、2MiB真实编码和C2PA报告解释用例。没有二次派审；修正后按回归和整套测试收尾。

审查未判断的实际环境：DSH安装/真实SHA/合约兼容、douyin封包与live重连、浏览器休眠/GIF/伴侣采集、真实模型/价格/C2PA验证。处理裁定：全部保留为AC-STATUS及MAC-REHEARSAL的明确待验项，未将mock冒充实际验证。
