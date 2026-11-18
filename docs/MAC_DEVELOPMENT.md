# Mac 继续开发：操作指南

## 最短路径

1. 已有 `shynloc/ecustduio-stu` 工作副本时，先检查分支与本地改动；首次获取公开源码时使用下方 HTTPS 地址。
2. 使用 GitHub Desktop 克隆，或在终端执行 `git clone https://github.com/shynloc/ecustduio-stu.git`。
3. 进入克隆目录，运行 `bash Dev.command`。不要双击正式安装包里的 Install.command 来替代开发启动。
4. 打开 http://127.0.0.1:5173，创建开发管理员账号。这个账号和已安装版相互独立。

脚本支持 macOS14+、Apple Silicon和Intel。不需要sudo。缺少Node时自动下载Node24.15.0，并用官方SHASUMS256校验；依赖、浏览器和缓存仅放在仓库内。默认前端5173，后端37892，数据在`.local-data`。关闭开发服务用Ctrl+C。

## 每天开发

```bash
git pull --ff-only
bash Dev.command
```

脚本检查锁文件、平台和Node版本，变化时重新安装依赖；失败不会标记为安装完成。首次下载可能稍慢，后续复用缓存。前端热更新，后端改动后重启开发命令。开发期间不要在设置里执行安装版的一键升级；从Git同步源码。

若已有Node24.15或更新24.x，可不使用自动脚本：

```bash
npm ci
npm run dev:setup
npm run dev
```

需要独立的开发端口：

```bash
ECUSTUDIO_DEV_PORT=37902 ECUSTUDIO_DEV_WEB_PORT=5174 npm run dev
```

界面打不开时先看终端的实际地址和错误。端口占用会明确报错，不会自动结束其他工作台。首次管理员必须从本机127.0.0.1访问；不要把开发服务器暴露到互联网。

## 检查代码

```bash
npm run check
npm run build
npm run test:core
npm run test:dev
npm run test:ui
```

测试使用合成内容、隔离数据库和本地HTTP服务，不要求真实DeepSeek或公众号密钥。Windows DPAPI真实加密测试在Mac明确跳过；Mac钥匙串适配有模拟协议测试，但真实系统授权仍需单独验收。浏览器测试优先用Chromium，Windows才可退回Edge，Mac不依赖Edge。

## 原生与可选能力

- **SQLite/Canvas/PDF**：dev:setup实际检查原生模块和Chromium PDF生成。安装失败先确认Node是24.x且架构匹配，再运行npm ci；不要复制Windows依赖。
- **OCR**：Mac使用系统Vision，经JXA调用；自检列出能力。实际扫描教学资料、图表和准确性仍要做样例验收。
- **凭据**：工作台使用当前登录用户的Keychain，可能弹出系统授权。使用设置页填写；不在聊天、.env或命令行里粘贴密钥。不用sudo。
- **GIF/视频/语音扩展**：基础工作台和文档输出不要求全套扩展。需要时在创作中心/设置中按已有运行时检查安装；部分功能另需Python、FFmpeg或联网语音服务。
- **正式安装与升级**：仓库里的deployment/macos是打包模板，正式Install.command期望相邻app和manifest。先用Python打包，再在隔离目录验收，不能在仓库根直接运行这些安装模板。

## 开发与业务资料

仓库不提供原业务账号和API配置。.local-data可随开发保留，但不进Git；Mac Keychain按数据目录区分。迁移开发目录前记录原路径，不随意复制Windows DPAPI文件到Mac。需要使用既有资料时用应用导出/备份到独立副本，不要覆盖正式安装的data。

发布用的签名私钥不在仓库。Mac可以独立继续开发、运行测试和生成安装包；接管正式在线更新发布时，由维护者安全提供签名流程和文件站权限，不能用新生成的密钥替换旧用户信任链。

## 把工作交给本地Agent

将仓库路径和根目录HANDOFF.md交给Agent即可。文档内有可直接复制的启动提示词、当前功能状态、待验收任务及发布约束。开始前让Agent检查Git状态与Actions，不要从旧的0.1.0历史说明重建项目。
