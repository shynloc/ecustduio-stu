# HTML Creator Studio v1.8 开发候选安装与验证

## 1. 适用范围

这是独立 Skill 包，主要供可读取本地 Skill 文件夹、执行本地脚本的 Codex / Agent 工具试用。没有 WorkBuddy 专属配置或依赖。**v1.8 当前是候选版，需要真实用户图片、个人审美反馈及目标客户端验收后才能宣称完成公测。**不同 ChatGPT 客户端的 Skill 安装入口和权限可能不同；如果当前客户端没有 ZIP 导入/目录读取功能，本包不会凭空为它开启该能力。

## 2. 安装

1. 从发布者提供的公网链接下载完整 ZIP，核对发布页提供的 SHA-256（如有）。
2. 解压后保留 `html-creator-studio/` 目录及其中所有 `references/`、`scripts/`、`templates/`、`shared/`、`examples/`、`tests/`。不要把 ZIP 内容平铺成许多独立 Skill。
3. 在 Codex 等支持本地 Skills 的客户端，根据该客户端**当前**说明把目录加入其已授权的 Skill 位置；不要覆盖已有同名 Skill，先备份或采用独立测试环境。安装路径、权限与重载方式以该客户端为准。
4. 进入 Skill 目录运行（Windows 可按环境改用 `py`）：

```bash
python scripts/beta_doctor.py --run-tests --out beta-doctor.json
```

此命令仅检查包结构、Python 单元测试和本地可选工具是否存在。没有 Playwright/Chromium 仍可阅读并运行文本工作流；需要浏览器截图时再按客户端环境安装必要依赖。**被检测到的 Node、npm 或 ffmpeg 不代表 Remotion/Hyperframes 已经渲染成功。**

## 3. 首次使用

- **Quick（默认）**：上传有权使用的文档，发送 `START-HERE.md` 的 01。先看两套不同的实际 HTML 视觉样稿，选择方向；再审核观众文案，之后制作。
- **Studio**：适合大型报告、品牌、视频和复杂资料。发送 02/03/04/05 的一份任务卡；根据目标提供多案、素材计划、分镜、横竖版和完整 QA。
- **已有 HTML 改稿**：使用 10，先评估静态页面、JS 动画、Canvas/WebGL、字体与资源，再决定是否做逐帧视频。
- **审美采集（新增）**：发送 `START-HERE.md` 的 12；上传真实参考与局部喜欢/不喜欢之处，完成上传并核对后发送 13“开始分析”。无真实图像访问就只能基于文字讨论，不能填写已看图的证据。用户确认后另存本地 Design DNA。
- **已有 Design DNA（新增）**：复制 `templates/PROJECT-BRIEF.json` 并填写具体受众、内容、目标设备；执行 `python scripts/project_art_direction.py --profile <profile.json> --brief <brief.json> --out <new-direction.json>`。该命令生成结构化创意指导，并不自行完成 AI 绘图、观众审稿或截图。
- **简历建站（新增）**：发送 `START-HERE.md` 的 14；可用 `python scripts/extract_resume.py --input <resume.docx|pdf|md|txt> --out <private-evidence.json>` 在本地保留原文及段落/页码证据（PDF 需 `pdftotext`），但原文取证文件可能包含所有私人联系方式，只保存在本地，不得外传。Agent 对照原件核实事实、审阅隐私项，生成 `templates/RESUME-CONTENT.json` 同结构的数据；配合已确认的 DNA 和 art direction 执行 `python scripts/build_resume_site.py --resume <resume.json> --profile <profile.json> --direction <direction.json> --out <new.html>`。这里得到带草稿提示的离线技术样稿，正式公开需另行审批与验收。
- **反馈更新（新增）**：发送任务卡 15；严格区分仅改变本项目的意见与长期审美，后者使用 `python scripts/design_dna.py revise --profile <old.json> --feedback <feedback.json> --out <new.json>`；只写新文件，审批状态重置。
- **没有资料**：可以要求概念设计，但要标注“示意/占位”；不要假造事实、引用或用户批准。

## 4. 公测验收清单

| 检查项 | 通过依据 |
|---|---|
| 识别 Skill | 客户端能读取 `SKILL.md` 和要求的参考文件，而非仅收到一段复制提示词 |
| 上传与分析分离 | 用户未上传完成/未明确要求分析，或者图像视觉没有实际访问，必须 BLOCKED |
| 用户品味准确性 | `OBSERVED / INFERRED / CONFIRMED` 有证据区别；仅已确认的具体维度进入长期 Profile |
| 隐私导出 | 原始素材、路径、用户原话、身份规则不进入 Portable Profile；明显个人信息被拦截，导出后仍需人工检查 |
| 风格不锁死 | 同一 DNA 在不同内容下产生不同项目 Art Direction；同一份简历用不同 DNA 有实质不同的方案 |
| 简历个人网站 | 原简历事实可追踪；草稿不输出私人联系方式；HTML 本地可打开；正式发布单独取得授权 |
| 真实材料 | 新资料被理解，事实/推断/缺漏分开，source-map 与内容一致 |
| 视觉样稿 | Quick 两套或 Studio 三套可打开 HTML，排版/视觉主体/交互有实质差异 |
| 文案审批 | 真实用户尚未批准时 production gate 应阻止正式成品 |
| 源素材 | 来源、权利、隐私、外传授权与降级路径记录明确 |
| 网页 QA | 实际桌面/手机页面截图、控制台、键盘焦点、减少动态效果、点击测试 |
| 视频交接 | Visual Master、逐帧规则、Remotion 生成工程；只有官方 CLI 实际渲染才标记已验证 |
| 交付 | HTML/源文件、测试记录、截图、剩余缺陷、是否可公开发布均有清晰说明 |

## 5. 常见问题与恢复

- **找不到 Skill**：检查客户端是否支持本地 Skill、是否放入正确位置、目录是否完整；不能默认为已加载。
- **浏览器打不开**：区分 `file://` 安全策略、外部资源路径、缺少 Playwright/Chromium、实际 JS 错误；用允许的本地浏览器或受控预览重新测试，并在报告中说明降级方式。
- **Remotion 报错**：记录 Node/npm/Remotion 版本、安装日志、具体失败命令；保留已通过的 HTML/Visual Master，不用 Chromium+FFmpeg 的视频冒充官方渲染。
- **内容有误**：回到原材料与来源映射纠正数据，再重新走文案审批和截图 QA，不直接修改已批准的哈希。
- **设计太像模板**：根据资料重做视觉隐喻、主素材、信息布局与互动，而不只改颜色或添加动效。
- **期望“完全没有模板”**：Skill 主流程要求内容驱动的个性化设计，不锁定模板；随包的简历离线生成器有四种**技术演示布局**，仅用于 QA 和快速预览，不能把它们冒充无需人为设计的最终艺术作品。
- **审美偏好不确定**：保留 `INFERRED`，询问只喜欢哪一个局部；用户对某张风景照的喜爱不能证明其性格、职业或对所有颜色的喜欢。
- **跨 Agent 复用**：本地 Profile 可长期保留并按版本演进；Portable 只用于用户自己选择的目的地，生成成功不意味着已获公开分享授权。

## 6. 反馈

请提供：公测包版本、客户端与 OS、输入资料类型（无需发送私密原文）、复现步骤、预期结果、实际结果、关键截图和脱敏日志。不要发送密码、API 密钥、Cookie、客户私人文件。
