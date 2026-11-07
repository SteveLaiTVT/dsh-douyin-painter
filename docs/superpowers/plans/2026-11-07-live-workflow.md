# 直播共创工作流 Implementation Plan
> REQUIRED: superpowers:subagent-driven-development / executing-plans，先回归后实现。
Goal: 用户可实际走通开场→收词互动→候选→UID投票→GIF揭晓，语音串行。
Spec: ../specs/2026-11-07-live-workflow.md

- [x] GIF/音色provider：原生gif参数、真实帧数验证、音色校验；离线协议测试。
- [x] converse/短记忆：限定真实评论、同UID上下文、无回复、节流和取消；离线测试。
- [x] 核心：投票唯一UID/改票/断连暂停、阶段、过时任务、单语音队列；回归测试。
- [x] 工作台/舞台：阶段式界面、投票、GIF、音色和静音；实际浏览器全流程。
- [x] 整合并启动：旧状态迁移、不自动发付费请求、保留直播间设置；验证报告。
