# AI 探索、创作笔记与账号权限 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有本机工作台接入可溯源的 AI 对话检索、笔记双向流转和三角色登录权限，并完成真实调用与权限测试。

**Architecture:** 保留 Fastify/SQLite/React 和已有 DeepSeek 任务队列。增加账号、持久会话、对话、消息、笔记表；共享政策与创作项目，笔记/对话按创建者隔离，管理员可管理全部。AI 探索通过受限工具访问本地资料、自己的笔记、DeepSeek 官方联网搜索和已检索网页；整合结果带来源，可存笔记再作为明确标记的创作素材。

**Tech Stack:** Node 24 crypto.scrypt、SQLite、Fastify 5、React 19、DeepSeek Chat Completions + Search API，复用现有 fetchPublic SSRF 防护。

## 产品设计和选择

- 推荐独立「AI 探索」「创作笔记」页面，沿用书院/曜石主题。搜索入口不挤进全局列表过滤框，笔记支持持续编辑、检索、回填对话、添加到既有/新建项目。
- 仅扩展原有资料列表不利于多轮整理；接外部聊天产品会割裂资料权限和笔记依赖，因此采用工作台内轻量 Agent。
- 三种检索范围：本地、联网、本地+联网。联网只发送用户问题和模型生成的检索词；调用状态、失败和来源实际呈现，不把无结果伪装为检索成功。
- 回答、笔记和素材均不自动成为已核实政策。存为笔记时保留来源和生成记录，导入创作后生成快照版本，后续改笔记不静默改历史素材。
- 管理员：全部页面和管理接口。创作者：研究/创作/笔记/探索/导出/自身密码与主题；禁止账号、全局模型凭证、监测来源/计划、钉钉、工作流包、备份恢复管理。业务员：只读政策详情、日报和可发布成果，其他接口拒绝。
- 首次打开创建管理员，无预置密码。管理员新建其他账号，首次登录必须修改初始密码。登录、禁用、身份调整、删除和重置密码有审计；最后一个有效管理员不能移除。
- 继续只监听本机，本次不开放局域网或互联网服务。业务账号权限同样在后端实施，不依赖前端隐藏。

## 实施步骤和验证

1. **数据库迁移**：`migrations/002_accounts_explore.sql`、`server/db.ts`。增加账号、会话、失败限流记录、对话消息、笔记；启动及恢复旧备份后补迁移。原政策/项目/凭证保留。验证旧库升级与持久化。
2. **登录与授权**：`server/auth.ts`、`server/app.ts`、`web/api.ts`。密码随机盐 scrypt；token 哈希入库、HttpOnly/SameSite、CSRF、失败限流、登出/禁用/重置撤销会话，按接口白名单授权和资产关联限制。测试匿名、三角色、越权、最后管理员、重启、CSRF。
3. **AI 检索与笔记数据流**：`server/explore.ts`、`server/tasks.ts`、`server/agent.ts`、`server/app.ts`。实现本地排序检索、官方 Search、受限网页读取、带来源回答、任务持久化、笔记 CRUD/版本冲突、回答存笔记/笔记上下文/笔记转资料及加入项目。测试私有隔离、错误检索、来源标记、幂等、失败/取消和上下文版本固定。
4. **页面接入**：`web/workspace.tsx`、`web/main.tsx`、`web/workspace.css`。登录/首次设置/强制改密、账号管理、AI 探索、笔记编辑和素材导入；角色导航和操作入口，桌面/手机布局及两主题。
5. **兼容回归**：调整既有测试走真实账号初始化，执行类型检查、构建、全量后端与相关 Playwright E2E。增加本地+联网真实 DeepSeek 闭环验收，保留匿名化证据。
6. **上线交付**：先备份现有运行数据，再重启部署；实际验证登录入口和升级后资料。报告记录采集现状、权限矩阵、用户操作路径及限制。首个正式管理员由用户在本机页面设置。

参考：[Node scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)、[DeepSeek 工具调用](https://api-docs.deepseek.com/guides/tool_calls/)、[DeepSeek Search & Fetch](https://api-docs.deepseek.com/guides/search/)。
