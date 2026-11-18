# EcuStudio 开发交接

更新于 2026-11-19。当前交接基线为公开仓库 `main` 的源码与锁文件。新开发聊天可直接复制 [接手提示词](docs/NEXT_AGENT_PROMPT.md)。下一阶段的优先级和完成条件见 [开发方向](docs/DEVELOPMENT_DIRECTION.md)。

## 1. 先读这些

1. [README](README.md)：启动、数据隔离、命令与模块导航。
2. [Mac 开发指南](docs/MAC_DEVELOPMENT.md)：从克隆到运行及常见故障。
3. [PRD](docs/product/01_产品需求文档_PRD.md)、[开发设计](docs/product/02_开发设计与实施文档.md)、[需求追溯](docs/product/03_需求追溯与验收计划.md)。这些是早期完整设计，当前实现以本交接和对应版本说明为准。
4. [0.10.0 开发记录](docs/0.10.0开发与验证记录.md)、[0.9.0 开发记录](docs/0.9.0开发与验证记录.md)、[统一视觉创作方案](docs/视觉创作统一适配方案-HCS-GIF-PPT.md)。

用户最重要的产品要求：使用者是普通职场用户，操作必须简单、易理解。遵循「输入 → 处理 → 输出」，默认提供可读富文本和合理自动值，把专业参数放进折叠项。书院是默认主题，曜石可切换并自动保存。

## 2. 当前状态

- 产品发布基线：0.10.0。0.9.0 的资料输入、知识库、多格式输出已接通，0.10.0 补齐公众号连接与草稿流程。
- 公开仓库为 `shynloc/ecustduio-stu`，保留原拼写。账号、业务资料和凭据保存在各安装实例内。
- 初始提交是已存在的项目源码快照，并非重建过去每个版本的 Git 历史。旧版发布记录保存在 docs 中。
- 本次建仓增加 Mac 开发脚本、跨平台核心/UI 测试入口、文档及 CI，不重新发布或覆盖现有 0.10.0 ZIP。
- 真实公众号凭据未配置，用户明确要求先交付安装包；真实微信草稿保存是待验收项，不要将 HTTP 夹具结果写成微信实测成功。
- 2026-11-18 继续完成公众号操作衔接：未提交预览/保存记录刷新恢复、编辑笔记后带原设置返回、正文变更后重新预览、复制完整可读正文及局域网富文本回退。见[本次修复记录](docs/公众号创作衔接修复-2026-11-18.md)。这些是仓库后续改动，尚未纳入已发布安装包。

## 3. Mac 开发约定

从仓库根目录运行 `bash Dev.command`。手动方式是 Node 24.15+ 的 24.x、`npm ci`、`npm run dev:setup`、`npm run dev`。前端 5173 热更新，后端 37892；后端代码改完重启 dev。数据强制放在 `.local-data`，仅本机监听，不使用正式安装版 data。

正式安装用户启动的是安装目录中的 Start.command / Start-EcuStudio.cmd，数据目录是安装目录的 data。两套环境分别创建账号和凭据；从 Git 克隆不会得到现有业务账号或 API Key。

在 Mac 执行 `npm ci` 获取 Darwin 原生依赖，不复制 Windows node_modules。基础开发不要求 Python；GIF Factory 的额外渲染链和语音工具在设置中按需安装。不要在仓库里启用线上更新覆盖源代码，开发更新用 Git pull 和重新安装锁定依赖。

## 4. 已完成的主流程

| 能力 | 入口与关键模块 | 接手要点 |
| --- | --- | --- |
| 网址/文件/文本输入 | `web/InputForm.tsx`、`server/ingestion-web.ts`、`server/media.ts`、`server/ocr.ts` | 保存原件、来源、页码和识别覆盖；受限公众号网页不能保证抓取 |
| AI探索与知识库 | `server/explore.ts`、`server/knowledge.ts`、`server/pipeline.ts` | 私有笔记、对话上下文、修订、分类、标签和来源链；共享素材需要明确选择 |
| 一句话任务与生产 | `server/workflows.ts`、`server/production.ts`、`server/tasks.ts` | 计划→来源→事实→母稿→内容→成果；持久任务，不能把失败包装成成功 |
| 多格式创作 | `server/visual-studio.ts`、`server/visual-export.ts`、`server/render.ts` | HTML、可编辑PPT、DOCX、PDF、GIF、配音视频；视觉阶段需预览确认 |
| 来源核对 | `server/pipeline.ts`、`migrations/006_pipeline.sql` | 原件、事实、笔记、版本、成果可追溯；来源变化会标记过期，历史结果保留 |
| 公众号 | `server/wechat*.ts`、`web/WechatEditor.tsx` | 管理员连接一次；默认自动封面与摘要；预览后显式保存远端草稿 |
| 账号/局域网 | `server/auth.ts`、`server/network.ts` | 管理员、创作者、业务员；服务器端权限校验与所有权，不能只隐藏菜单 |
| 更新与保留数据 | `server/updates.ts`、`scripts/update-*`、`deployment/upgrade.mjs` | 签名校验、备份、停服、替换、健康检查、数据清单、回滚 |

## 5. 公众号实现：最值得保持的约束

1. 微信 API 只在服务器端调用，目标固定为微信官方域名；浏览器不接触 token 或 AppSecret。
2. AppID/AppSecret 直连需要公众号自身接口权限。本版没有第三方平台扫码授权服务；不要在 UI 中假装可直接扫码。
3. 连接管理仅管理员；创作者只能操作自己有权访问的笔记、预览、图片和草稿；业务员无公众号权限。
4. `wechat_previews` 冻结笔记 revision、文章、封面、图片哈希。服务端生成 HTML，不接受客户端任意待发送 HTML。预览 iframe 使用内嵌图片，不能改回不带登录 cookie 的本机 URL 图片。
5. `wechat_drafts` 保存队列任务、上传检查点、提交意图、media_id 和回执。发送前先持久写入意图；断网后核对最近最多100篇草稿，不盲目重新创建。
6. 已记录 media_id 后只回读。内容不符或多个匹配时保持待核对；用户确认微信后台确实不存在，才可手动重新保存。已成功保存不自动覆盖微信后台的后续编辑。
7. 草稿保存没有发布、群发或自动删除远端草稿的入口。
8. 同一个 AppID 重新连接保留内部账号身份，以便恢复未完成任务；换公众号后旧任务不能误发到新号。

主要接口：`POST /api/settings/wechat/connect|test|disconnect`、`GET /api/wechat/connection`、`POST /api/notes/:id/wechat-preview`、`GET /api/wechat/previews/:id`、`POST/GET /api/wechat/drafts`、`POST /api/wechat/drafts/:id/retry`。旧的本地 HTML 导出接口 `/api/notes/:id/wechat` 保留。

## 6. 数据、凭据和迁移

- SQLite 启用 WAL；`server/db.ts` 依序加载 migrations。当前到 `007_wechat.sql`。新迁移追加编号、注册在 migrateExtensions 中；不要修改已经发布的迁移来假装完成升级。
- `tx()` 不能嵌套。网络请求不放在长数据库事务中。持久任务对外副作用要有提交前意图、回执和恢复分支。
- Windows 使用 DPAPI，Mac 使用钥匙串。`server/secrets.ts` 的标记文件只是定位信息，不是可跨电脑迁移的密钥。原 Windows 密文不能在 Mac 直接解密；Mac 开发需要重新配置自己的凭据。
- 更新签名私钥在维护者仓库外保管，不进 Git、安装包、CI日志或文档。不能为了方便在新 Mac 生成一把替换旧信任链的密钥。
- 新业务表必须加入 `deployment/upgrade.mjs` 的保留清单。`npm run build` 将运行器同步到 scripts。修改升级器需验证停服身份、恢复与所有旧数据的保留。
- 数据目录搬迁会影响 Mac Keychain 的 service 名称。优先保持旧安装路径；不要用删库、清空 data、sudo 启动解决凭据问题。

## 7. 验证范围与待验收项

### 已完成、可重现

- 0.10.0 在 Windows 完成35项核心/相关回归、4项更新协议和7项Mac停服契约测试。
- 知识库→公众号的本地 HTTP 协议、封面、配图、回执、断网恢复、权限隔离、书院/曜石桌面及手机流程。
- 原始已发布0.9.0，从管理员设置页下载公开签名0.10.0并升级；三类原账号密码、资料、笔记、配置和DPAPI字节保留；回读解密测试凭据成功。
- Windows/Mac 安装包公网下载哈希与清单校验，0.5.0旧客户端验签兼容。见公开 [Acceptance.json](https://dshdisk.acks.com.cn/ecustudio/0.10.0/EcuStudio-0.10.0-Acceptance.json)。

### 2026-11-18 Intel Mac 本机接手记录

- 基于 `main` 的 `a3edc67`，在 macOS 15.7.7 x64 用 `bash Dev.command` 启动。仓库内 Node 24.15.0、锁定依赖、Chromium Headless Shell 已就绪。SQLite、Canvas、浏览器生成 PDF 及 Vision 语言探测均通过。该提交的 Windows、Intel Mac、Apple Silicon Mac 三个 CI 作业均成功。[GitHub Actions 记录](https://github.com/shynloc/ecustduio-stu/actions/runs/44242593127)
- 修复 Vite 将前端模块 `/api.ts` 误转给后端导致的白屏。开发入口测试新增模块状态码和 JavaScript 类型断言；测试在 `test-results/` 下启动独立源码副本，用空目录检查开发数据隔离。
- Chromium 实际打开 5173 初始化页；健康检查、代理会话正常。独立测试实例通过页面创建管理员、刷新保持登录、退出和重新登录。日常开发实例保留首次创建管理员入口。
- `check`、`build`、`test:dev` 通过。核心测试 42 项通过，1 项 Windows DPAPI 测试在 Mac 跳过。构建后两组 UI 流程通过，覆盖知识库和公众号本地 HTTP 夹具。首次 UI 运行在编辑器按钮点击处超时，重新构建后带动作日志复测通过，超时原因未确认。
- Apple Vision 实际识别合成中文图表 PNG 和双页扫描 PDF。逐页核对“生物观察／12 分钟”和“化学实验／24 分钟”，原件 ID 与 PDF 哈希对应。样例覆盖标题、数值和页码。

### 2026-11-18 npm 依赖审计

**状态：等待上游修复版。** 在 Node 24.15.0、npm 11.12.1 下，当前锁文件两次全量审计均报告 5 个高危包条目；生产依赖审计（`npm audit --omit=dev`）报告 0 项。5 个条目源自同一份 picomatch 正则表达式拒绝服务公告。npm 上最新的 picomatch 为 4.0.7，仍在受影响范围内，公告尚未列出已修复版本。[GitHub 安全公告 GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)

`npm ls --all` 显示 React 插件 6.2.1 通过 peer 依赖使用 Vite 8.3.6。Vite 直接依赖 picomatch，也使用 tinyglobby 0.2.17；tinyglobby 直接使用 picomatch，并通过 fdir 6.5.0 引用同一份 picomatch 4.0.7。锁文件将这五个包均标记为开发依赖。

| 临时锁文件试验 | 全量审计结果 |
| --- | --- |
| 同主版本最新稳定组合：Vite 8.3.8、React 插件 6.3.0 | 仍解析到 picomatch 4.0.7，5 个高危条目 |
| npm 建议的降级组合：Vite 6.2.7、React 插件 5.2.0 | Vite 本身命中多份公告，仍有 1 个高危包条目 |

两项试验均仅解析临时锁文件。项目继续使用原锁文件。待公告列出修复版后，先检查现有依赖范围能否直接锁定该版 picomatch，再复查全量审计与回归。

**本机回归。** `npm run check`、`build`、`test:dev`、`test:core` 和构建后的 `test:ui` 均通过。核心测试 42 项通过、1 项 Windows 专用测试跳过；两组浏览器流程通过，公众号使用本地 HTTP 夹具。Chromium 实际打开 5173 的创建管理员页，代理健康检查和会话接口正常。

### 2026-11-18 笔记本与公众号主题（源码开发基线）

- 知识库入口 `#notes` 提供多列卡片瀑布流，窄屏单列。卡片直接排版 Markdown 摘要，显示标题、文件夹、标签、日期和版本；搜索与文件夹筛选可组合使用。点击卡片进入原笔记详情，新建入口为 `#notes/new`。
- 笔记详情支持富文本、Markdown 源文与实时预览。首次新建手动保存，已有笔记沿用自动保存、版本校验和历史记录。
- 从笔记进入「公众号排版」选择主题。保留原三种样式，新增清隽阅读、商务报告、公众号文章、杂志随笔、中式古典、暗夜代码六种，配色、字阶和字体取自参考 MD Editor 的 Milestone 配置。服务端使用预设主题生成内联样式，冻结预览后用于复制、下载与草稿。未增加数据库迁移或运行依赖。
- 本机类型检查、构建、开发入口、核心回归及三组 Chromium UI 流程通过。新增 `tests/notebook.e2e.ts` 验证桌面／手机视口布局、Markdown 保存重开、深浅文章主题切换和下载 HTML 与冻结预览一致。浏览器截图使用隔离样例，位于 `test-results/notebook-ui/`。微信草稿回归使用本地协议夹具，实际微信后台和真机显示待验收。

### 2026-11-18 导航整改（源码开发基线）

管理员与创作者共用工作台、资料库、笔记本、AI 研究、内容创作、项目、成果库七个工作入口，底部为任务中心和设置。成员与权限仅对管理员显示；业务员继续通过政策资料和可用成果两个只读入口访问。栏目与旧 hash 路由的对应关系集中在 `web/WorkspaceNavigation.tsx`。

- 资料库整合团队原文、资料导入、识别与转写、更新与影响及监测日报。带旧版本的原文可直接查看差异及关联项目。首页和任务页统一显示「立即检查政策更新」。
- 内容创作提供模板、描述需求、从素材制作、公众号排版与草稿、文字配音。人物素材位于视频与分镜的折叠区；选题池归入项目。笔记发起 PPT 时仅预选可编辑 PPT，继续复用共享确认、来源核对和已有任务恢复流程。
- 成果库集中筛选、下载、预览和打包。按项目或格式筛选使用服务端已有权限过滤后的成果，保留研究草稿、发布状态、质量检查与来源更新提示。日报归入资料库；成果库保留通往日报的链接。
- Intel Mac 已通过类型检查、构建、核心测试（42 通过、1 个 Windows 专用项跳过）、开发入口和全部四组浏览器测试。新增导航回归覆盖三类角色、手机抽屉、PPT 单选默认、原文变化到项目、文件检索下载及打包（PPT 默认值由资料管线回归验证）。本机 5173 已在登录状态确认新导航。真实用户首次点击及找回成果的耗时尚待观察。

### 2026-11-19 对话交付与素材制作（源码开发基线）

- `#explore` 现在是「AI 创作对话」。用户可以在一条消息里要求成稿和附件，再结合上一轮内容改稿。工作台检索模式通过 `deliver_files` 提交一份或多份独立正文；官方联网模式复用已有回复协议，提取交付格式后在本机生成文件。两种方式都使用已有导出器，支持可编辑 PPT、Word、PDF、Markdown 和 HTML。
- 文件附在对应回答下方，也能从成果库返回来源对话。HTML、PDF 和 Markdown 可在浏览器打开。既有回答可在本地另存为其他格式，无需再次请求模型。聊天文件按对话归属授权，未自动转入团队共享原文。普通对话、引用检查、任务取消和恢复沿用现有机制。生成阶段失败可从模型回复检查点重试。
- 素材制作可选政策研究、口播、公众号图文、讲座 PPT 或视频分镜，并仅显示该模板可用的格式。新版 `/api/pipeline/start` 在同一事务中准备素材、冻结请求和排队，相同请求键可重放。任务持久保存交付意图；动图和配音视频在核对设计后生成，原任务保存后续导出任务的 ID。旧版带 `?formats=` 的任务链接仍可使用。从任务中心可以回到制作进度、项目或原对话。
- `tests/conversation-files.e2e.ts` 使用合成材料、隔离数据及注入的模型协议响应；真实运行浏览器、文件渲染器和下载接口。覆盖对话附件、继续改稿、历史回答转格式、重放与跨账号权限。真实 DeepSeek 账户的工具选择、成稿质量、真实联网及费用仍需在设置页配置后验收。

### 2026-11-19 公开源码整合验收

基于上游 `fdf7159` 合入本机开发成果。Intel Mac 上通过 `check`、`build`、`test:dev`，核心测试 43 项通过、1 项 Windows 专用测试跳过。五组 UI 回归覆盖资料管线、公众号、笔记本、角色导航、对话文件；公众号测试保留了刷新恢复、返回编辑、重新生成和完整正文复制的断言。模型与微信协议使用夹具，文件实际渲染并读取验证。其他平台的结果请查看对应提交的 [Actions](https://github.com/shynloc/ecustduio-stu/actions)。

### 尚待验收

1. 用独立测试凭据在工作台设置页验证 Mac 钥匙串的授权、保存、读取和删除。
2. 用实际教学资料进一步验证 Vision 的复杂图表、长文拆分与合并、识别准确性及来源对应。
3. 用真实 Safari 和手机检查中文输入法、富文本编辑、配图预览与复制。
4. 在独立旧 Mac 安装副本验证页面升级、LaunchAgent 停服重启、原账号、资料及钥匙串配置保留。
5. 管理员在设置页连接有接口权限的公众号后，选定一篇验收笔记保存草稿、回读并在微信后台核对排版。真实 DeepSeek 调用也需要在设置页配置后单独验证。

## 8. 发布下一版

1. 完成功能及对应测试；更新 package.json 和 package-lock.json 根版本、版本说明、开发/验收记录和 `docs/releases/<version>.json`。
2. `npm run check`、`npm run build`、核心及相关UI测试。需要真实外部服务时单独记录授权对象和实际结果，不用模拟成功代替。
3. `python3 scripts/package-online.py .artifacts/windows` 与 `python3 scripts/package-macos.py .artifacts/macos`。检查完整清单、Mac脚本执行位以及无业务库/密钥。
4. 用维护者安全提供的既有签名私钥执行 `node scripts/sign-update-feed.mjs <Windows.zip> <Mac.zip> <private.pem> <stable.json>`。不要将私钥路径写死成自己的Mac路径或提交密钥。没有私钥可以开发、测试、打包，但不能发布让旧客户端信任的在线更新。
5. 先上传两个ZIP到文件站该版本目录，公网下载核对SHA-256，再发布签名 stable.json。不要覆盖历史发布ZIP。
6. 使用原版旧安装包和合成账号/资料测试页面升级，检查账号密码、资产、配置、加密凭据和备份。失败时恢复此前的 signed feed，并修复原因。
7. 上传简明升级指南、给本地Agent的提示词和真实验收记录，最终给用户可点击链接。

`scripts/prepare-v0100-publication.mjs`、`tests/online-update-v0100.e2e.mjs` 等记录了原 Windows 发布执行方式，但硬编码路径是历史证据，不是新 Mac 开发的前置条件。移植发布自动化时将目录参数化，保留其校验语义。

## 9. 继续开发

使用 [新聊天接手提示词](docs/NEXT_AGENT_PROMPT.md)。开发优先级、目标用户任务和验收条件集中维护在 [开发方向](docs/DEVELOPMENT_DIRECTION.md)。
