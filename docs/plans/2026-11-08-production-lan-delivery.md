# 制作工作流、局域网和安装交付 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 模板直接启动工作台制作 Agent；启用三角色局域网使用；交付可安装、可启动、带产品文件和指南的 Windows x64 压缩包。

**Architecture:** 复用 DeepSeek、事实引用、不可变版本、导出和任务队列，新增有检查点的制作任务（研究→母稿→目标内容→文件）。网络单独配置，允许本机/局域网实际地址，同源与 CSRF 校验保留，首次管理员仅在服务器本机创建。交付包捆绑 Node、生产依赖和 PDF 浏览器，通过 PowerShell 安装/诊断/启动，数据独立保存。

**Tech Stack:** React/Fastify/SQLite/Node 24、Windows PowerShell、Playwright Chromium、Windows OCR。

## 实施与验收

1. `server/production.ts`、`shared/production.ts`、`server/tasks.ts`：五类模板，结构化参数、资料/项目、角色资产；持久步骤与安全重试、预算、账号撤销、并发保护、草稿文件导出；不自动核实/发布，不承诺生成未接入的图片/音视频。
2. `web/Production.tsx`、`web/main.tsx`：模板「开始制作」，预填表单→真实任务进度→项目/文件；缺资料、凭证和授权有明确入口，复制提示词作为辅助功能。
3. `server/network.ts`、`server/index.ts`、`server/app.ts`、`server/auth.ts`：本机/LAN模式、实际网卡地址白名单、同源校验、私网客户端、首个管理员仅本机、账号权限和资产边界。修复 HTTP LAN 环境的 UUID/剪贴板兼容。
4. `deployment/*`、`scripts/package-release.ps1`：一键安装、检查、启动/停止、可选登录自启、限定本地子网的防火墙规则；离线运行包、依赖补齐、端口冲突检测、不覆盖已有数据。捆绑运行时和浏览器，模型密钥由安装用户录入。
5. 增加工作流/网络后端测试，真实网卡 IP 下浏览器测试管理员/创作者/业务员、桌面和390px手机；真实 DeepSeek 制作并下载验证文件；干净目录安装/重复安装/损坏依赖修复/启动测试。
6. 更新产品说明、详细使用/安装指南、给用户本地 Agent 的安装提示词；生成含源码、构建产物、运行环境、依赖、许可证、校验清单的交付 ZIP，排除本机数据、账号、密钥、备份和测试临时文件；解压最终ZIP重新安装验收。

交付平台为 Windows 10/11 x64 服务器；创作者和业务员仅需同一局域网中的现代浏览器。网络防火墙和 OCR 可选语言包如需系统权限，在安装结果中明确提示，不伪报成功。没有第二台实物设备时，将实际网卡IP访问与手机视口仿真分别记录。
