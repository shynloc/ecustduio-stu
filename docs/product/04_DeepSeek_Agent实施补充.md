# EcuStudio教创工作台 DeepSeek Agent 实施补充

版本：1.2｜日期：2026-11-08｜适用应用：0.1.0

本补充记录用户在文档阶段之后的明确指示：在 D:\EduStudio 开发、启动并测试工作台，AI 采用 DeepSeek API，做成工作台内可运行的轻量 Agent。它更新早期文档的“只交付设计”状态；不改变三份原始需求文件。完整 PRD 仍是产品目标，实际完成及待验收项以应用验收报告为准。

## R07 及开发 §4 的确定方案

采用 React + Fastify + Node内置SQLite 的本机模块化单体。Agent为服务端有限循环，不依赖Codex/WorkBuddy进程；以DeepSeek官方Chat Completions和Tool Calls为接口，不调用OpenAI凭据。

模型默认deepseek-flash，可自定义模型ID。密钥在工作台设置页录入并由Windows DPAPI加密，支持环境变量优先。资料外发开关、连接验证、预算和调用日志独立显示。调用费用未知时不填零。

研究、母稿、政策解读、口播、公众号、PPT、分镜和局部补丁共用此Agent。任务冻结Skill、资料、事实、母稿、角色、参数和配置；工具仅可读取任务内资料和事实。无任意Shell、无任意网络、无自动事实确认、无模型发送权限。

本次按提示词新建educontent-studio工作流，不宣称使用了找不到的原始Skill。注册、导入与运行状态区分，工作流hash可追溯。

## R01—R13 实现映射

| 需求 | 入口/实现 | 当前边界 |
|---|---|---|
| R01 资料 | 政策情报、domain.ts、security.ts | 公开URL/文本文件，原文快照与元数据审计；扫描OCR待接入 |
| R02 核验 | 资料详情、claims/verifications | 人工逐条核验；自动冲突识别、生效失效与替代关系需增强 |
| R03 选题 | 选题策划、五维评分、范围筛选 | AI候选需真实密钥验证；不伪造热度 |
| R04 母稿 | 创作项目、versions/drafts/reviews | 不可变版本、草稿、项目补充资料、并发保护已实现 |
| R05 多成果 | 六类内容编辑器、agent.ts/render.ts | 真实AI生成待验收；固定PPT模板，品牌主题编辑需增强 |
| R06 修改 | 锁定块、定向补丁、服务端门禁 | 真实模型补丁质量待验收；接口和锁定规则已测 |
| R07 执行器 | DeepSeek有限工具Agent、工作流包 | 模型未配置，不把替身调用当实连 |
| R08 任务 | 任务页、SQLite队列/租约/事件/调度 | 进程需运行，计划默认暂停；未创建系统定时任务 |
| R09 日报 | 固定窗口与配置、不可变日报版本 | 空结果/部分失败/全失败区分；语义变化分析需增强 |
| R10 通知 | 钉钉预览、授权、独立outbox | 无凭据及发送授权，真实消息未测试 |
| R11 导出 | 七格式、成果中心、项目交付ZIP | 可编辑文件样本已打开检查；每份新成果仍需看版 |
| R12 数据 | 在线备份、校验、恢复与安全备份 | 真正恢复已测；跨Windows用户需重配密钥 |
| R13 设置 | 配置版本、预算、来源、调度、凭据 | 本机单用户；无远程/多用户认证 |

## 运行约定与验收

工程位于D:\EduStudio\app，生产数据位于D:\EduStudio\data。启动脚本是根目录Start-EcuStudio.cmd；默认127.0.0.1:37891，4317在本机被Windows保留。基础导入、人工创作、导出、备份不依赖模型。

实际API以server/app.ts为准，数据模型以migrations/001_initial.sql和shared/schema.ts为准；早期开发文档的接口草案不保证逐项同名。工作流、环境、数据维护说明分别见app/docs/SKILL_INTEGRATION.md、ENV_CAPABILITIES.md、DATA_AND_BACKUP.md。

自动化测试、真实来源记录、Office样本检查见app/docs/ACCEPTANCE_REPORT.md。该报告区分实现、测试子项和完整验收，不能把当前首版当作所有V1门槛全部通过。

接口核查来源：[DeepSeek官方接口](https://api-docs.deepseek.com/)、[工具调用](https://api-docs.deepseek.com/guides/tool_calls/)、[Chat Completions参数](https://api-docs.deepseek.com/api/create-chat-completion/)。
