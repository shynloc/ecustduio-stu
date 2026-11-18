# EcuStudio 开发交接

更新时间：2026-11-18（Asia/Shanghai）。目标：另一位开发者或本地 Agent 在 Mac 从这个私有仓库直接继续开发，无需获取原 Windows 电脑的 node_modules、运行时或业务数据。

## 1. 先读这些

1. [README](README.md)：启动、数据隔离、命令与模块导航。
2. [Mac 开发指南](docs/MAC_DEVELOPMENT.md)：从克隆到运行及常见故障。
3. [PRD](docs/product/01_产品需求文档_PRD.md)、[开发设计](docs/product/02_开发设计与实施文档.md)、[需求追溯](docs/product/03_需求追溯与验收计划.md)。这些是早期完整设计，当前实现以本交接和对应版本说明为准。
4. [0.10.0 开发记录](docs/0.10.0开发与验证记录.md)、[0.9.0 开发记录](docs/0.9.0开发与验证记录.md)、[统一视觉创作方案](docs/视觉创作统一适配方案-HCS-GIF-PPT.md)。

用户最重要的产品要求：使用者是普通职场用户，操作必须简单、易理解。遵循「输入 → 处理 → 输出」，默认提供可读富文本和合理自动值，把专业参数放进折叠项。书院是默认主题，曜石可切换并自动保存。

## 2. 当前状态

- 产品发布基线：0.10.0。0.9.0 的资料输入、知识库、多格式输出已接通，0.10.0 补齐公众号连接与草稿流程。
- 仓库名称严格为 `ecustduio-stu`，属于 `shynloc`，私有。不要擅自纠正拼写、转公开或上传业务数据。
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

### 在目标 Mac 继续做

1. 确认当前仓库 CI 的 Mac 构建、核心与浏览器测试结果。CI runner 的通过只代表该环境。
2. 当前普通用户下，工作台页面保存/读取/删除独立测试 DeepSeek 凭据，检查系统钥匙串授权；勿操作别人的真实条目。
3. 用有已知答案的教学 PDF、图片和图表，验证 Apple Vision OCR、拆分/合并、页码和资料对应关系。不要只看文件名来推断识别内容。
4. 在真实 Safari、手机视口下检查中文输入法、富文本编辑、配图预览和复制。
5. 从真实旧 Mac 安装目录执行页面升级，确认 LaunchAgent、端口进程身份、停服/重启和钥匙串配置保留。
6. 用户连接有接口权限的公众号后，选定一篇验收笔记实际保存、回读，在微信后台确认排版。只保存草稿，不发布或群发。

## 8. 发布下一版

1. 完成功能及对应测试；更新 package.json 和 package-lock.json 根版本、版本说明、开发/验收记录和 `docs/releases/<version>.json`。
2. `npm run check`、`npm run build`、核心及相关UI测试。需要真实外部服务时单独记录授权对象和实际结果，不用模拟成功代替。
3. `python3 scripts/package-online.py .artifacts/windows` 与 `python3 scripts/package-macos.py .artifacts/macos`。检查完整清单、Mac脚本执行位以及无业务库/密钥。
4. 用维护者安全提供的既有签名私钥执行 `node scripts/sign-update-feed.mjs <Windows.zip> <Mac.zip> <private.pem> <stable.json>`。不要将私钥路径写死成自己的Mac路径或提交密钥。没有私钥可以开发、测试、打包，但不能发布让旧客户端信任的在线更新。
5. 先上传两个ZIP到文件站该版本目录，公网下载核对SHA-256，再发布签名 stable.json。不要覆盖历史发布ZIP。
6. 使用原版旧安装包和合成账号/资料测试页面升级，检查账号密码、资产、配置、加密凭据和备份。失败时恢复此前的 signed feed，并修复原因。
7. 上传简明升级指南、给本地Agent的提示词和真实验收记录，最终给用户可点击链接。

`scripts/prepare-v0100-publication.mjs`、`tests/online-update-v0100.e2e.mjs` 等记录了原 Windows 发布执行方式，但硬编码路径是历史证据，不是新 Mac 开发的前置条件。移植发布自动化时将目录参数化，保留其校验语义。

## 9. 给接手 Agent 的启动提示词

```text
你正在开发私有仓库 shynloc/ecustduio-stu（产品名 EcuStudio教创工作台）。
先读 README.md、HANDOFF.md、docs/MAC_DEVELOPMENT.md 和当前版本开发记录。
遵循“输入→处理→输出”，面向普通人，默认合理自动值，专业项折叠。
使用仓库隔离开发入口和 .local-data；不操作已安装工作台的生产 data。
不要读出/提交/打印真实 API Key、公众号密钥、钥匙串内容或更新签名私钥。
先核对当前 Git 状态和 Actions 结果，再按用户当前需求推进，不重做已完成工作。
修改后运行相关核心/浏览器测试；保留原权限、来源链、幂等、草稿未知状态恢复。
真实微信草稿、Mac用户钥匙串、Vision OCR和旧Mac升级有独立验收边界；如未实际执行就如实标明。
不得自行发布公众号文章或替换在线更新签名密钥。没有发布授权时仅提交代码与可审查构建。
```
