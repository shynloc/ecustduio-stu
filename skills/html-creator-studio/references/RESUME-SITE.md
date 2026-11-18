# Resume to Personal Website｜个人简历网站专项流程

## 输入与真实性

允许 DOCX、PDF、Markdown、TXT、JSON 简历，**读取能力取决于宿主 Agent 当前具备的工具**。可用自带的离线提取器 `scripts/extract_resume.py` 对 DOCX、PDF、Markdown、TXT 提取原文与页码/行号证据：

`python scripts/extract_resume.py --input <原始简历.pdf|docx|md|txt> --out <private-evidence.json>`

DOCX 使用标准库读取正文与表格文字，PDF 依赖宿主已安装的 Poppler `pdftotext`。扫描件或图像 PDF 需要独立 OCR，并明确工具是否真正成功读取；复杂栏位与表格阅读顺序必须人工核对。提取 JSON 是**包含所有原文隐私字段的本地私有文件**，不得分享或上传。提取器不负责推断身份信息、职业总结或自动批准公开。Agent 应对照原件，把核实的内容逐项整理到 `templates/RESUME-CONTENT.json`，保留来源证据 ID，标记待核实项目。不得从姓名或行业猜测工作经历；日期、任职机构、证书、联系信息必须来自可读资料。

## 审美与内容

读取用户已经确认的 Personal Design DNA；没有则按 `references/TASTE-INTAKE.md` 做短引导。提供 Professional、Creative、Personal Brand 三个**信息目标**，不要把它们写成固定页面 Skin。借助 `references/PROJECT-ART-DIRECTION.md` 形成至少两套真正不同的 HTML 视觉提案，用户定方向后才进入正式制作。

## 隐私与发布

- 联系方式、家庭住址、私人手机号、证件号、生日、个人邮箱等按敏感字段处理；默认不展示在公开站点。用户明确选择公开的字段也应再次确认公开范围。
- 简历成品文案审批与公网部署授权各自单独确认。仅有简历文件或“做成网站”这句话，不构成公开发布许可。
- 导出可以是一个可离线打开的 HTML。对公开发布前检查链接、图片使用权、移动端、键盘访问、元信息以及隐私字段。外部 CDN 与第三方追踪默认禁用。

## 可运行的离线参考实现

`python scripts/build_resume_site.py --resume <resume-content.json> --profile <design-profile.json> --direction <project-art-direction.json> --out <new-index.html>`

默认输出带 `DRAFT / PRIVATE PREVIEW` 明示的单文件离线 HTML，自动隐藏 `visibility=private` 的联系信息。只有明确传入 `--production` 且结构化审批证据满足要求时才允许去掉草稿标记；**脚本无法验证签字/会话真实性**，使用者仍须核对用户的实际授权。

内置生成器只是可复现的技术参考，不能被冒充为 AI 已理解了任意简历、图片与个人审美。实际创意质量须以真实用户的三类任务和截图验收。
