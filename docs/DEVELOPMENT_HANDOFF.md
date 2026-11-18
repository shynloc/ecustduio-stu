# EcuStudio 开发交接

> 本页是0.1.0历史记录。当前交接以仓库根目录 [HANDOFF.md](../HANDOFF.md) 和 [Mac开发指南](MAC_DEVELOPMENT.md) 为准。

0.1.0 已在 D:\EduStudio\app 实现并构建，启动脚本位于 D:\EduStudio 根目录。用户指定的 DeepSeek 是应用内唯一 AI 提供方；没有使用 OpenAI Key、Codex CLI 或 WorkBuddy 登录。

domain.ts 管理事实、版本和审核；agent.ts 管理模型及有限工具循环；tasks.ts 管理租约、恢复、调度、日报和独立通知；exports.ts 冻结数据，render.ts 在子进程生成文件；backup.ts 管理校验恢复；security.ts 管理公网连接及路径；secrets.ts 管理凭据。

API 在 server/app.ts，Schema在shared/schema.ts，SQL在migrations。前端为React工作台，hash导航；任务轮询和SSE API可用。生产与测试数据隔离。

真实DeepSeek研究及同一母稿多成果验收仍需要密钥；钉钉实际验收需要目标配置和明确发送授权。不能把替身测试当成真实外部调用通过。当前能力、剩余增强项和证据见README、ACCEPTANCE_REPORT.md及实施补充。
