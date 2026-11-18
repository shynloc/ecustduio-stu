# 环境与能力

核查日期：2026-11-08；应用 0.1.0。

| 能力 | 实际结果 |
|---|---|
| 系统 | Windows，本机可读写 D:\EduStudio |
| Node/SQLite | Node 24.15.0，内置 SQLite 3.51.3 |
| 技术栈 | React 19、Vite 8、Fastify 5、TypeScript；精确版本见 lockfile |
| 数据持久化 | WAL、外键、事务；重开数据库与实际备份恢复通过 |
| 账号与权限 | 管理员、创作者、业务员；持久登录、首次改密、禁用/重置撤销会话、接口权限和数据裁剪已验收 |
| AI探索与笔记 | DeepSeek官方Search真实联网 + 本地检索；回答存笔记、笔记回填对话、素材/母稿/口播/DOCX闭环通过 |
| PDF | 本机 Edge 无头渲染可用；样本已逐页查看 |
| Office | Word/PPT COM 可用；只读打开并渲染样本，Word 1页、PPT 3页已查看 |
| DeepSeek | 已配置本机加密凭证；真实连接、资料研究、母稿及内容生成通过；OCR闭环见OCR_ACCEPTANCE.md |
| OCR | Windows本机引擎已接入，zh-Hans-CN语言包；图片和扫描PDF真实识别、校正导入及DeepSeek闭环通过，见OCR_ACCEPTANCE.md |
| 钉钉 | 适配器已实现；没有真实发送配置或回执 |
| 来源 | 两个北京教育考试院列表访问成功；一份真实资料保存63段原文 |
| DNS | 本机隧道对公网域名返回内网地址时，通过固定公共 DoH 查询公网IP并固定连接；仍拒绝私网和本机地址 |

仅监听 127.0.0.1:37891。未实测 macOS/Linux。正常导出不依赖 Office COM；COM 仅用于本次样本 QA。应用不继承 Codex/WorkBuddy 的工具权限和模型登录。
