# 主题策划实施计划

> 本轮按 executing-plans 原地执行；遵循 test-driven-development 与 verification-before-completion。

**Goal:** 主题输入生成三个可编辑策划方向，人工确认后共同驱动主持和生图。
**Architecture:** 共享结构验证模块、DeepSeek/Harness文本方法、独立持久化草案、控制板Review表单。
**Spec:** ../specs/2026-11-08-theme-planning.md

## 约束与验证重点
仅localhost；无自动发布/重试；草案不影响当前赛程；旧页面不能覆盖新草案；草案编辑不被SSE刷新覆盖；新世界观替代旧主题硬编码；模型示例不作观众原话。

- [x] 先写方案验证/生成/API与Harness参数/草案隔离和持久化/批准内容实际进入生图的失败测试。
- [x] 实现 src/theme-planning.js 与文本生成方法，接入 Application/state、主持上下文和图片美术上下文。
- [x] 增加独立策划区：三个方向、可编辑分镜、保存草稿、明确确认应用；补真实Chrome编辑与并发刷新回归。
- [x] 跑全部Node/Chrome/语法检查，单次DeepSeek真实生成供用户Review，完成独立复核。
- 交付：按策划核心与Review界面分组提交，更新既有PR12；最终答复记录交付结果。

验证：189 Node、13 Chrome、56语法模块通过。单次真实生成12.2秒，三个方向各5格；已保存未应用。独立review无剩余finding。
