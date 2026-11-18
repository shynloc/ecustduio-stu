# EcuStudio 教创工作台

面向教育与内容团队的本地工作台：**输入资料 → 知识库整理 → AI 研究与创作 → 多格式成果**。支持三类账号、局域网访问、DeepSeek Agent、公众号图文排版与远端草稿箱。

私有仓库：**`shynloc/ecustduio-stu`**。仓库名按项目所有者指定的拼写保留；产品名称仍是 EcuStudio 教创工作台。当前产品发布基线为 **0.10.0**，本仓库另补充了跨平台开发入口和交接说明，不会自动覆盖已发布安装包。

第一次接手请先看 [HANDOFF.md](HANDOFF.md)。详细产品设计在 [docs/product](docs/product)，Mac 开发说明在 [docs/MAC_DEVELOPMENT.md](docs/MAC_DEVELOPMENT.md)。

## Mac：从仓库启动开发

要求 macOS 14 或更新版本，支持 Apple Silicon / Intel，需要联网下载依赖。先让仓库所有者给你的 GitHub 账号访问权限；GitHub 账号密码不能直接用作 Git HTTPS 密码，可用 GitHub CLI 或 GitHub Desktop 完成登录。

已经配置 GitHub 登录后：

```bash
git clone https://github.com/shynloc/ecustduio-stu.git
cd ecustduio-stu
bash Dev.command
```

也可以先 `gh auth login`，再 `gh repo clone shynloc/ecustduio-stu`。Mac 首次运行 Git 时若提示安装 Apple Command Line Tools，请按系统提示完成。

`Dev.command` 会检查 Node.js：没有合适版本时，自动从 Node 官方站下载并校验到仓库的 `.dev` 目录；安装锁定依赖和 Chromium，检查 SQLite、Canvas、PDF 浏览器及本机 OCR，再启动工作台。不会改动系统 Node，也不需要 sudo、Docker、Homebrew 或全局 Python。

打开 **http://127.0.0.1:5173**，创建本次开发环境的管理员。前端修改自动刷新；后端修改后按 Ctrl+C，再运行 `bash Dev.command`。锁文件未变化时会复用依赖。退出终端前按 Ctrl+C 停止本次开发服务。

如果你已有 Node.js 24.15 或更新的 24.x，也可以手动执行：

```bash
npm ci
npm run dev:setup
npm run dev
```

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
npm run test:ui     # 知识库与公众号的桌面/手机浏览器流程
```

首次运行浏览器测试前执行 `npm run dev:setup`。UI 测试读取当前 `dist`，所以改完前端应先 `npm run build`。`npm test` 保留全部历史测试入口，其中部分测试依赖 Windows、外部能力或额外运行环境；日常和 CI 使用上述明确范围的命令。

GitHub Actions 会在 Windows 与 macOS 上执行依赖安装、构建、核心测试、开发入口和 UI 流程；Mac 还检查脚本语法及双平台源码打包。它不会填真实凭据、发布公众号、上传安装包或更新线上 stable feed。实际结果以 [Actions](https://github.com/shynloc/ecustduio-stu/actions) 为准。

## 工程导航

| 路径 | 用途 |
| --- | --- |
| `server/app.ts`、`server/auth.ts` | API 路由、请求校验、三角色权限 |
| `server/db.ts`、`migrations/` | SQLite、迁移、审计；新增迁移按序追加 |
| `server/tasks.ts` | 持久队列、取消、恢复、租约及调度 |
| `server/deepseek.ts`、`server/agent.ts`、`server/native-explore.ts` | DeepSeek 协议和受控 Agent 工具 |
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
