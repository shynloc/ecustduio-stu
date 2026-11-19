# EcuStudio 教创工作台

把资料变成可交付的作品。你可以对工作台说：“根据这份叶脉观察笔记，给老师做一份可编辑 PPT，再给学生做一份 Word 活动单。”成稿和文件会回到这条对话里；继续说“把活动单改成适合三年级”，可以在下一轮拿到新稿，并找回原附件。

在同一场对话里还可以说“用第 2 版活动单写一篇给家长看的公众号文章，用中式古典主题”。预览后可以换主题，也可以确认要保存的公众号。说“把最初的教师 PPT 做成一分钟配音视频”，可逐页看讲稿、核对用量并试听，继续说“第三页慢一点”，最后确认渲染并下载 MP4 和 SRT。视频使用原演示的实际分页画面，需安装 LibreOffice。

公开源码仓库为 [shynloc/ecustduio-stu](https://github.com/shynloc/ecustduio-stu)。下文介绍 `main` 的开发基线。当前版本为 **0.11.2**。AI 创作对话可以自动续写长网页，完成后提供可预览、可下载的 HTML 附件。管理员可以在设置中保存单次输出额度和任务时限。[发布与升级说明](docs/0.11.2发布与升级说明.md)

[网页版文件与生成设置使用指南](docs/0.11.2使用指南.md) · [工作台完整使用指南](docs/0.11.0使用指南.md)

首页支持真实 3D 与任务指令；AI 对话具备历史分类搜索、附件、知识多选、恢复草稿、流式回答和实际用量。项目简化为「资料、写稿、作品」。账号、资料和凭据只在安装实例内，Git 仓库及安装包不携带用户数据。

当前源码的默认浅色主题为「晴空 · Daylight」：冷白画布、明亮蓝与橙色点缀，搭配书页与笔画组成的教创标志。在设置中可切换到「曜石」并自动保存。此视觉更新在 0.11.0 发布后加入，现有 `scholar` 偏好直接沿用，无需迁移数据；已发布安装包暂保留原发布内容。

## 可以用它做什么

| 从哪里开始 | 可以完成的工作 |
| --- | --- |
| AI 创作对话 | 结合资料、笔记和对话上下文写作，生成可编辑 PPT、Word、PDF、Markdown 和 HTML。可拖入课程文件、录音或粘贴公开网址，在原消息查看进度和重试，打开 Office 分页预览，点「修改这份」定向改稿、找回上一版。成果库可定位到来源附件。 |
| 资料库与知识库 | 导入文字、网址、文档、图片或录音，保存原件和出处。默认所见即所得，统一图标工具栏；分类文件夹、标签、卡片/列表、筛选、多选、回收与撤销。 |
| 内容创作与项目 | 按模板制作，或从选定的笔记和原始资料开始。共享私人笔记时确认具体版本；进度和交付格式随任务保存，动图和配音视频先核对设计。 |
| 公众号编辑器 | 直接编辑富文本，左侧改稿、右侧看手机排版，提供 ACKS 43 款模板、9 套配方及 3 款旧主题，先预览再应用，支持搜索、收藏与微调。稿件自动保存；连接公众号后复制时自动转存配图，也可确认账号后保存草稿。 |
| 成果库 | 按项目、文件名或格式找回文件，查看来源、下载或打包。管理员、创作者和业务员按各自权限访问。 |

首次接手可以依次阅读 [工程交接](HANDOFF.md)、[开发方向与验收目标](docs/DEVELOPMENT_DIRECTION.md) 和 [Mac 开发指南](docs/MAC_DEVELOPMENT.md)。另有一份 [可直接复制的新聊天提示词](docs/NEXT_AGENT_PROMPT.md)。

2026-11-19 最新产品要求见 [全面体验整改方案](docs/plans/2026-11-19-experience-redesign.md) 与 [实施、审计和验收计划](docs/plans/2026-11-19-experience-implementation.md)：统一所见即所得编辑器、3D 工作台、知识/成果管理、完整 Agent 对话与简化项目。该轮已落实到 0.11.0 源码；逐项进展和测试边界见 [实施记录](docs/plans/2026-11-19-experience-progress.md) 与 [0.11.0验证记录](docs/0.11.0开发与验证记录.md)。可运行 `node docs/plans/render-experience-plan.mjs` 生成离线 HTML 阅读版。

### HTML 转视频

在 AI 对话添加 HTML 并说“保留原网页，做成 6 秒视频”，或在创作项目展开「HTML 转视频」，选择本地文件、公开网页或项目已有 HTML。两个入口默认都直接绘制网页，保留中文排版、CSS、SVG 及按时间播放的脚本动画。长页面自动滚动。明确说“重新编排成分镜”或选择对应选项后，才按网页标题与正文拆段。无声视频在本机生成，配音可先改稿、核对用量并试听。

本地文件须为 UTF-8 HTML，图片、字体和脚本请内嵌。公开地址先保存网页及可解析的静态资源，再离线渲染；登录页面、依赖运行时联网的应用和需要人工点击的流程不在本次验收范围。公众号编辑器用于写稿与排版。

## Mac：从仓库启动开发

支持 macOS 14 及以上版本的 Apple Silicon 和 Intel Mac。首次启动需要联网下载开发依赖。在终端执行：

```bash
git clone https://github.com/shynloc/ecustduio-stu.git
cd ecustduio-stu
bash Dev.command
```

公开仓库可直接通过 HTTPS 克隆。Mac 首次运行 Git 时若提示安装 Apple Command Line Tools，请按系统提示完成。

`Dev.command` 会检查 Node.js：没有合适版本时，自动从 Node 官方站下载并校验到仓库的 `.dev` 目录；安装锁定依赖和 Chromium，检查 SQLite、Canvas、PDF 浏览器及本机 OCR，再启动工作台。不会改动系统 Node，也不需要 sudo、Docker、Homebrew 或全局 Python。

打开 **http://127.0.0.1:5173**，创建本次开发环境的管理员。前端修改自动刷新；后端修改后按 Ctrl+C，再运行 `bash Dev.command`。锁文件未变化时会复用依赖。退出终端前按 Ctrl+C 停止本次开发服务。

如果你已有 Node.js 24.15 或更新的 24.x，也可以手动执行：

```bash
npm ci
npm run dev:setup
npm run dev
```

**Office 分页预览**使用工作台电脑上的 LibreOffice 打开实际生成的 PPTX、DOCX。Mac 使用安装在「应用程序」中的 LibreOffice，Windows 使用标准 Program Files 安装位置。缺少该组件时可先下载原文件，安装后在对话里重试预览。

## Windows 开发

安装 Node.js 24.15 或更新的 24.x 与 Git，克隆本仓库后，在仓库根目录运行同样的三个 npm 命令。运行时不要复制其他电脑的 `node_modules`，它包含平台相关的原生模块。

开发默认使用前端 5173、后端 37892；正式安装版通常使用 37891。端口占用时可以设置 `ECUSTUDIO_DEV_PORT` 和 `ECUSTUDIO_DEV_WEB_PORT` 后再启动，程序不会结束其他正在运行的工作台。

## 开发数据与已安装数据相互独立

| 内容 | 仓库开发环境 | 正式安装版 |
| --- | --- | --- |
| 数据、账号、笔记、资产 | 仓库下 `.local-data/` | 安装目录下 `data/` |
| 开发依赖与浏览器 | `node_modules/`、`.dev/` | 安装目录下 `app/node_modules/`、`runtime/` |
| Mac 正式安装默认位置 | 不使用该位置 | `~/Library/Application Support/EcuStudio` |
| 凭据 | Windows DPAPI / Mac 当前用户钥匙串 | 同类机制，按数据目录区分 |

**仓库不包含生产账号、资料、数据库、DeepSeek/公众号密钥或更新签名私钥。**开发环境首次打开是空工作台，这是正常情况。不要把旧版 `data` 直接复制进仓库；需要已有资料做调试时，用应用备份和独立副本，保留原目录。

`npm run dev` 强制使用本仓库 `.local-data` 和本机监听。`npm start` 则是正式构建入口，默认数据目录仍为 `../data`，不要把它误当作隔离开发命令。CI 与功能测试使用 `test-results` 的临时数据库。

公众号主题的操作步骤、迁移来源和复制验收边界见 [公众号排版说明](docs/公众号主题选择器与复制-2026-11-19.md)。

## 配置 AI 和公众号

- DeepSeek：进入「设置」，填写自己的 API Key，允许调用并测试连接。模型、文件解析、图像、语音能力以该账号实际权限为准。不需要 Codex、WorkBuddy 或其他助手进程。
- 公众号：管理员在「设置 → 连接公众号」填写名称、AppID、AppSecret。需要公众号具备草稿箱和素材接口权限；遇到 IP 白名单问题按页面提示处理。这是官方接口直连，不是第三方平台扫码授权。
- 创作者：从知识库选笔记，生成排版、检查预览，保存到公众号草稿箱。封面、摘要和配图自动准备；保存草稿不会发布或群发。
- Mac 凭据写入可能需要系统钥匙串授权。不要用 sudo 启动，也不要将密钥写入 Git、日志或聊天。

首次本地开发可先不填凭据；笔记、排版和模拟协议测试均可执行。没有密钥时真实 AI 任务不会假装成功。

## 日常开发与验证

```bash
npm run check       # TypeScript 检查
npm run build       # 构建前后端，同时同步升级运行器
npm run test:core   # 跨平台核心接口、权限、知识库、公众号与升级契约
npm run test:dev    # 验证隔离开发入口、Vite代理与会话
npm run test:ui     # 资料管线、公众号、笔记本、导航与对话文件的浏览器回归
```

首次运行浏览器测试前执行 `npm run dev:setup`。UI 测试读取当前 `dist`，所以改完前端应先 `npm run build`。`npm test` 保留全部历史测试入口，其中部分测试依赖 Windows、外部能力或额外运行环境；日常和 CI 使用上述明确范围的命令。

GitHub Actions 会在 Windows 与 macOS 上执行依赖安装、构建、核心测试、开发入口和 UI 流程；Mac 还检查脚本语法及双平台源码打包。它不会填真实凭据、发布公众号、上传安装包或更新线上 stable feed。实际结果以 [Actions](https://github.com/shynloc/ecustduio-stu/actions) 为准。

对话文件回归使用注入的模型协议响应，实际运行浏览器和文件渲染器，验证附件可下载、继续改稿、历史回答转格式、失败重试与跨账号隔离。真实模型的工具选择、内容质量及费用需使用对应账户另行验收。

## 工程导航

| 路径 | 用途 |
| --- | --- |
| `server/app.ts`、`server/auth.ts` | API 路由、请求校验、三角色权限 |
| `server/db.ts`、`migrations/` | SQLite、迁移、审计；新增迁移按序追加 |
| `server/tasks.ts` | 持久队列、取消、恢复、租约及调度 |
| `server/deepseek.ts`、`server/agent.ts`、`server/native-explore.ts` | DeepSeek 协议和受控 Agent 工具 |
| `server/explore.ts`、`server/conversation-files.ts`、`web/ConversationFiles.tsx` | 对话成稿、附件渲染、消息关联、继续改稿与下载 |
| `server/knowledge.ts`、`server/pipeline.ts`、`server/production.ts` | 知识库、资料交接和成果制作 |
| `server/media.ts`、`server/ocr.ts`、`server/ingestion-web.ts` | 文件、语音、OCR、网页采集 |
| `server/wechat.ts`、`server/wechat-client.ts` | 公众号连接、预览、图片和草稿恢复 |
| `server/visual-*`、`server/render.ts` | HTML、可编辑 PPT、GIF、配音视频与文档导出 |
| `web/`、`shared/` | React 页面、富文本、主题、共享 Schema |
| `deployment/` | Windows/Mac 安装、启动和升级脚本 |
| `scripts/`、`tests/` | 开发辅助、发布工具、隔离测试 |
| `docs/product/`、`docs/` | PRD、开发设计、版本说明和历史验收 |
| `skills/` | 工作台内置技能与第三方组件；保留各自许可证 |

## 构建安装包

完成上面的构建后，在 Mac 用系统或自行安装的 Python 3；Python 仅用于打包及可选 GIF 扩展，不是基础工作台开发启动的前置条件。

```bash
python3 scripts/package-macos.py .artifacts/macos
python3 scripts/package-online.py .artifacts/windows
```

Windows 可将 `python3` 换成 `python`。打包所需 PRD 已收进仓库，不依赖 `D:\EduStudio` 或仓库外的文档。输出是联网安装包，首次安装会补齐运行环境。生成 ZIP 不等于上线；签名、上传、旧版升级验收和保留数据的步骤见 [HANDOFF.md](HANDOFF.md)。

历史 `deploy-v*`、`prepare-v*`、`record-v*`、`verify-v*`、`live-*` 脚本保留了原维护机路径和真实验收条件，**不要在新 Mac 直接运行这些历史脚本**。按交接文档选择当前跨平台命令。

## 已发布版本与已知边界

- [0.10.0 使用与升级说明](https://dshdisk.acks.com.cn/ecustudio/0.10.0/EcuStudio-0.10.0-Guide.html)
- [0.10.0 发布验收记录](https://dshdisk.acks.com.cn/ecustudio/0.10.0/EcuStudio-0.10.0-Acceptance.json)
- [后续开发交接与待办](HANDOFF.md)

0.10.0 已完成 Windows 上的桌面/手机流程、模拟公众号 HTTP 协议和原始 0.9.0 页面升级验收。用户选择先交付安装包，真实公众号保存仍需连接账号后验收。仓库 CI 的 Mac 构建和浏览器测试，不等于真实 Mac 用户的钥匙串授权、Vision OCR、LaunchAgent 和原生安装升级全部验收；这些应在目标电脑继续验证。
