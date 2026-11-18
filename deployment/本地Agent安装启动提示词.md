# 交给本地Agent的安装启动提示词

将下面文字与实际ZIP的完整路径一起交给用户电脑上的Agent。

---

请在这台Windows电脑安装并运行 EcuStudio 教创工作台。我提供的安装包路径为：`<在这里填写完整ZIP路径>`。安装目录默认使用 `%LOCALAPPDATA%\EcuStudio`，如我另外指定目录则使用我的目录。请直接完成安装与启动，不要停在告诉我可以如何做。

1. 检查Windows为x64，安装包存在。将ZIP完整解压到独立目录；如有同名旧目录，不要覆盖不明业务数据。若同时提供ZIP.sha256，请先校验。阅读根目录《产品说明》《详细使用指南》，以及manifest.json。
2. 检查目标目录是否已有data。升级先使用工作台备份或复制一致的数据备份，不删除、清空或用空数据库覆盖原data，不读取/输出用户密钥。
3. 从解压目录运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-EcuStudio.ps1 -InstallDir "<目标目录>" -NoBrowser`。默认启用局域网、启动后台及用户登录自启。脚本会使用自带Node、生产依赖和PDF浏览器，必要时尝试联网修复。不要用模型假结果替代缺失能力。
4. 若Windows防火墙或中文OCR语言包需要系统权限，让用户完成标准UAC授权；不能授权时，说明哪些可选步骤未完成，给出Enable-Lan.cmd/Repair-OCR.ps1的准确操作，不宣称已经配置成功，不关闭整个防火墙。
5. 查看installation-result.json确认实际目录、端口、网络模式和firewall状态；验证localUrl的/health为EcuStudio且instanceId属于本安装。不要因为其他目录已有同名服务就误认为本次安装成功，不要停止其他软件或不明Node进程。
6. 在目标目录运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Check-EcuStudio.ps1` 做快速运行环境检查；如我要求完整验收，再加 `-Repair -DeepTest`，并按指南测试真实模型制作和其他物理设备。自检采用隔离数据，不向我的业务库插入测试账号/伪造政策。
7. 打开服务器本机localUrl，让我自行创建管理员和填写自己的DeepSeek凭证。不要预设通用密码，不索要或搜集Codex、浏览器或其他项目的现有密钥，不把密码写入报告。管理员从界面添加创作者和业务员。
8. 汇报实际安装路径、版本、服务器本机地址、实际网卡局域网地址、启动/停止命令、数据和日志位置，以及尚未完成的权限/网络/模型配置。明确区分已验证项和待用户验证项。

范围：只安装和配置这套工作台，不发送钉钉/邮件/社交消息，不进行公网端口映射，不修改其他项目，不删除用户原始文件。客户端电脑和手机只需打开服务器局域网地址并登录，不必重复安装服务器。

0.4.0补充：首次联网安装，保留原data并先备份。启动后确认健康接口版本0.6.0及「文件与语音」入口。不要默认运行付费AI验收；由用户自行配置DeepSeek并选择测试文件，可按《DeepSeek文件图像语音使用指南》验证解析、图像、转写与配音。局域网HTTP不能直接录音时，引导上传已有音频。

升级入口（优先于以上首次安装步骤）：若已有app/data/ecustudio.json，请勿卸载或另建账号。将UpgradeReady ZIP解压到原安装目录之外的新目录，阅读升级指南.md，Windows运行Upgrade-EcuStudio.ps1 -InstallDir 原目录 -NoBrowser；Mac设置ECUSTUDIO_INSTALL_DIR为原目录并运行Upgrade.command。沿用原系统用户、不使用sudo；升级器自动备份并保留账号、资料和DeepSeek配置，失败自动回滚。结束后核对upgrade-result.json和健康接口，不发起付费AI测试。


## 0.6.0 更新

新增一句话任务管家、政策影响追踪、整套内容包与来源预审，内置 ACKS 和 HTML Creator Studio。支持 HTML 预览及核对后本机制作无声 MP4。0.5.0 用户在设置里检查更新并升级，保留账号、资料和 DeepSeek 配置。新版本的完整流程、范围及限制详见《0.6.0使用与升级指南》，开发资料与验证记录一并随包提供。


## 0.7.0 视觉创作更新

网页、原生可编辑 PPT、演示 PDF、GIF 图卡和带配音 MP4 共用同一视觉项目。任务管家、素材模板和已有内容可进入统一制作页。0.5.0/0.6.0 管理员可在设置中升级，保留账号、资料与 DeepSeek 配置。详情见《0.7.0发布与升级说明》《0.7.0视觉创作使用指南》。给本地 Agent 的新版完整提示词见《0.7.0本地Agent安装升级提示词》。GIF 需 Python 3.10+，管理员可安装独立 Pillow 环境。
