# 给Mac本地Agent的安装启动提示词

请在这台Mac安装并运行EcuStudio教创工作台。我提供的ZIP路径为：`<填写macOS安装包的完整路径>`。请直接完成安装和启动，不只给操作建议。

1. 确认系统为macOS14+，完整解压到独立目录；有SHA256文件时先校验ZIP。阅读《产品说明》《Mac安装与使用指南》。不要运行Windows安装脚本或复制Windows原生依赖。
2. 默认安装目录为 `~/Library/Application Support/EcuStudio`。我指定其他目录时，通过ECUSTUDIO_INSTALL_DIR传入。已有data先备份，禁止删除或空库覆盖。不要使用sudo安装。
3. 用 `bash "/完整解压目录/Install.command"` 运行。自动检测Apple Silicon/Intel、下载校验官方Node、安装锁定依赖和PDF浏览器、配置用户LaunchAgent并启动。无需Homebrew/Swift编译器。
4. 如Gatekeeper、钥匙串或防火墙提示需要用户操作，说明具体对应程序和操作，让我完成标准系统授权；不要关闭整体安全功能，不索要Mac登录密码或从其他软件搜集密钥。Mac实机未验证的步骤不要伪称通过。
5. 检查installation-result.json和本实例/health，记录实际地址与端口；使用安装目录的Start.command、Stop.command、Status.command。检查运行环境可执行bash Check.command；只有我要求全面验收时再加ECUSTUDIO_DEEP_TEST=1，不调用付费模型。
6. 浏览器在服务器本机初始化管理员，让我自行设置密码和DeepSeek Key，随后从账号管理分配成员。钥匙串凭证不写报告、不进备份；深度自检仅使用自己的临时条目并清理。
7. 汇报安装路径、版本、当前启动方式、登录自启是否实际加载、服务器地址/局域网地址、日志/数据位置和未完成项目。失败请先看日志，不删除业务库，不停止其他目录的服务。

范围仅为安装此工作台及必要依赖；不发送钉钉/邮件/社交消息，不开放公网端口，不修改其他项目。Mac安装包为联网版，首次安装需要网络；不能把Windows上的构建检查当作Mac原生能力的实机验收。

0.4.0补充：首次联网安装，保留原data并先备份。启动后确认健康接口版本0.6.0及「文件与语音」入口。不要默认运行付费AI验收；由用户自行配置DeepSeek并选择测试文件，可按《DeepSeek文件图像语音使用指南》验证解析、图像、转写与配音。局域网HTTP不能直接录音时，引导上传已有音频。

升级入口（优先于以上首次安装步骤）：若已有app/data/ecustudio.json，请勿卸载或另建账号。将UpgradeReady ZIP解压到原安装目录之外的新目录，阅读升级指南.md，Windows运行Upgrade-EcuStudio.ps1 -InstallDir 原目录 -NoBrowser；Mac设置ECUSTUDIO_INSTALL_DIR为原目录并运行Upgrade.command。沿用原系统用户、不使用sudo；升级器自动备份并保留账号、资料和DeepSeek配置，失败自动回滚。结束后核对upgrade-result.json和健康接口，不发起付费AI测试。


## 0.6.0 更新

新增一句话任务管家、政策影响追踪、整套内容包与来源预审，内置 ACKS 和 HTML Creator Studio。支持 HTML 预览及核对后本机制作无声 MP4。0.5.0 用户在设置里检查更新并升级，保留账号、资料和 DeepSeek 配置。新版本的完整流程、范围及限制详见《0.6.0使用与升级指南》，开发资料与验证记录一并随包提供。


## 0.7.0 视觉创作更新

网页、原生可编辑 PPT、演示 PDF、GIF 图卡和带配音 MP4 共用同一视觉项目。任务管家、素材模板和已有内容可进入统一制作页。0.5.0/0.6.0 管理员可在设置中升级，保留账号、资料与 DeepSeek 配置。详情见《0.7.0发布与升级说明》《0.7.0视觉创作使用指南》。给本地 Agent 的新版完整提示词见《0.7.0本地Agent安装升级提示词》。GIF 需 Python 3.10+，管理员可安装独立 Pillow 环境。
