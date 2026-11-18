---
name: html-creator-studio
description: 将 DOCX/PDF/PPTX/Markdown、简历及有权使用的资料制作成个性化 HTML 网站、交互演示和 Video Ready 视觉母版。用户可提供喜欢或不喜欢的图片、穿搭、汽车、风景、建筑、设计参考或文字，由具备视觉能力的 Agent 在取得明确授权与真实视觉访问后分析审美线索，形成经用户确认、可本地保存和复用的 Personal Design DNA，再针对具体项目生成不同视觉提案。包含 Quick/Studio、Resume to Personal Website、审美确认/反馈版本、真实 HTML 视觉与无障碍 QA、来源追溯及独立文案/发布门禁。无视觉能力时必须说明，不得捏造用户品味或模型测试结果。
---

# HTML Creator Studio / Personal Design DNA — v1.8 Development Candidate

本目录是独立、跨客户端的 Skill 工程；不依赖 WorkBuddy。**v1.8 仍是开发候选，未经目标环境真实图像与用户公测，不得宣称多模态审美提取已完全验收。**首次运行读 `references/INSTALL-AND-TEST.md`，用 `python scripts/beta_doctor.py --run-tests` 检查包结构。静态校验不能替代真实审美体验。

## 首先做对三件事

1. **真实附件先行**：先读取用户提供且有访问权限的全部相关材料；保留证据/来源映射、指出不完整/待核实内容，不能虚构数据。不得未经授权公开或把私有附件传给第三方。
2. **设计先行且可看**：需要创作视觉方向时，先按需阅读 `references/designresources.md`、`references/VISUAL-PITCH.md` 与 `references/ASSET-DIRECTION.md`。AI 必须给用户看可打开的真实 HTML 样稿及截图，而不是只说几个设计名词。Quick 2 个、Studio 3 个；已锁定方向可只做 1 个。样稿需比较不同构图、字体、视觉素材、动效，**换色不算不同方案**。
3. **观众文案必须独立审批**：写标题、正文、图表标签、旁白、字幕、CTA 等时，先读 `references/AUDIENCE-COPY.md` 和 `templates/COPY-REVIEW.md`。提交完整观众稿，请用户**明确批准具体版本和范围**，才正式实施。用户说“你决定/直接做”仅授权非事实的设计选择，不代表审批文案、录音、公开发布。未批准只可做显著标注的占位/脱敏样稿。源文档位置、“原文说”等制作元话语不进入观众稿（必要且明确的合法归因除外）。

**v1.8 增加个人审美关口**：用户只给标题也能继续概念创作；用户要建立 Personal Design DNA 时，严格执行 `references/TASTE-INTAKE.md`、`references/DESIGN-DNA.md`。先等“上传完成”，核验视觉可访问，再等“开始分析”。`OBSERVED`、`INFERRED`、`CONFIRMED` 必须分开，只有具体经用户确认的偏好可进入长期内核；原图与 portable profile 隔离。未经允许不得调用外部模型或上传私人素材。

## 一、任务路由（按需读取，不把全部参考文件塞进上下文）

| 用户任务或阶段 | 必需读取 | 执行与产物 |
|---|---|---|
| 第一次使用 / 启动任务卡 | `START-HERE.md`、`references/WORKFLOW-MODES.md` | Quick / Studio；少量询问受众与目的 |
| 喜欢的照片/穿搭/风景等审美线索、用户审美画像 | `references/TASTE-INTAKE.md`、`references/DESIGN-DNA.md` | 分阶段采集与真实视觉访问、维度级好恶、证据与置信度、用户确认 |
| 创建/更新/复用个人或品牌 Design DNA | `references/DESIGN-DNA.md`、`scripts/design_dna.py` | `design-profile.json`、确认状态、可携带脱敏导出、反馈版本 |
| 从长期审美到本项目独立设计 | `references/PROJECT-ART-DIRECTION.md`、`references/VISUAL-PITCH.md` | 项目特定 Art Direction、解释稳定/临时决策、真正不同的可看 HTML |
| 简历变为个性化个人网站 | `references/RESUME-SITE.md`、`references/PROVENANCE-QA.md`、`scripts/extract_resume.py` | DOCX/PDF/MD/TXT 本地文本取证、事实核对、联系信息隐私分级、审美转换、离线 HTML 与真实 QA |
| 文档理解与内容架构 | `references/CORE-WORKFLOW-v1.5.md` 的 Step 1–3、`references/PROVENANCE-QA.md` | 内容模型、事实/观点/推断分类、缺失事项、来源覆盖 |
| 风格研究、视觉提案与分镜 | `references/designresources.md`、`references/VISUAL-PITCH.md`、`references/ASSET-DIRECTION.md` | 真实 HTML 候选、视觉签名、素材计划、用户方向选择 |
| 标题/正文/口播/字幕等观众文案 | `references/AUDIENCE-COPY.md`、`templates/COPY-REVIEW.md` | 观众完整草稿、用户真实批准、版本哈希 |
| HTML 制作/部署/响应式 | `references/CORE-WORKFLOW-v1.5.md` 的 Step 10–22 | 经批准的页面、交互、资源、测试 |
| 视频 / 逐帧 / Remotion / Hyperframes | `references/VIDEO-READY.md`、`references/CONTRACT.md`、相关 `references/*-ADAPTER.md` | Visual Master、HTML 可跳帧预览、视频交接与真实 CLI 测试 |
| 视频口播、音效、字幕、音乐 | `references/AUDIO-DIRECTION.md`、`references/AUDIENCE-COPY.md` | 句群与时间轴/声音计划；按需创建合法素材 |
| 精准改稿 / 撤销 / 局部修改 | `references/REVIEW-LOOP.md`、`references/CORE-WORKFLOW-v1.5.md` Step 23–26 | stable ID、明确范围、视觉前后对比 |
| 截图质量审查 / 完整交付 | `references/VISUAL-QA.md`、`references/ACCESSIBILITY-QUALITY.md`、`references/PROVENANCE-QA.md` | 截图、交互与键盘测试、结构报告、人工美术判断、独立审批证据 |
| 公测版安装 / 现场排错 | `references/INSTALL-AND-TEST.md`、`CODEX-E2E-PROMPT.md` | 安装预检、依赖差异、可复现测试记录、限制说明 |

**旧版 8 阶段 / 26 步操作规范没有删除。** 为降低入口长度，v1.5 完整主规范保留在 `references/CORE-WORKFLOW-v1.5.md`，各类任务请加载表中对应章节。原有 Remotion、Hyperframes、WebGL/Canvas 和精准改稿限制继续生效，不因为新版本覆盖原有禁令。

## 二、从零开始的实际流程（用户不知道怎么选也能继续）

### Step A｜确认本次目标

提取附件、用途/受众、目标 `web / video_ready / dual`、隐私、核心准确性要求和已明确偏好；无信息时根据资料提供默认建议。采用 `Quick`（默认）或 `Studio`（视频/品牌/复杂任务）。不要把十几个独立问题一次抛给新用户；已明确的要求不要重复追问。Quick 也必须执行文案审批和真实视觉 QA。

用户只提供审美参考、尚未上传完成或尚未明确请求分析时，**停在 Taste Intake**；不得仅凭参考图名称、文件路径或模糊文本臆测。宿主没有视觉读取能力时允许文字型偏好分析，但必须明确“未实际看图”。运行 `python scripts/design_dna.py check-intake --intake <file>` 仅验证结构和声明，不能当作实际视觉访问的证据。

用户已有本地 Design DNA 时，运行 `python scripts/design_dna.py validate --profile <file>`，只用 `CONFIRMED` 长期偏好。没有档案则基于材料做项目临时视觉方案，不用强迫用户建立档案。新增/修改长期偏好后以新版本写出，不覆盖原文件；脚本禁止静默确认用户审美。

如果只有标题或一句话而没有附件，可先确认作品用途和可信信息来源；允许生成明确标注的**概念视觉草稿**，但不能为其补写未经提供或核实的事实、数据与真实机构背书。链接、无法读取的本地文件及未授权网页也不能假装已解析。

### Step B｜设计研究 → 实际可看样稿

- 如果使用 Personal Design DNA，**先**按 `references/PROJECT-ART-DIRECTION.md` 将确认的个人偏好与本次内容、受众、设备结合。可用 `python scripts/project_art_direction.py --profile <file> --brief <file> --out <new-file>` 生成可追溯的 Art Direction 合约。档案只能影响决策，不允许成为全项目统一套皮；项目临时风格不默认写回个人档案。
- **先读** `references/designresources.md`，选择与材料逻辑相符的多个艺术方向；离线用现有已注明研究日期的资料，2027 只能标注探索性假设。
- 按 `references/VISUAL-PITCH.md` 生成真实 HTML 方案：至少有首屏 + 一个信息密集页。能使用 `scripts/build_visual_pitch.py` 作为参考起点，但它的三种默认皮肤**不是通用定稿模板**。对每个真实文档必须以内容特定的隐喻、排版、插画和交互重新创作。不要靠无意义装饰球体撑页面。
- 默认提供能打开的 HTML、桌面/手机截图、实际差异表、推荐理由和性能说明；用户看过再选，或明确授权 AI 选择。**选择视觉 ≠ 审批成品文案**。
- 可使用 `templates/VISUAL-PITCH-REVIEW.md` 记录用户反馈与选择，不要自己把未发生的用户意见标记为“已确认”。
- 简历建站遵守 `references/RESUME-SITE.md`：先用宿主真实解析工具，或 `scripts/extract_resume.py` 在本地对 DOCX/PDF/MD/TXT 提取原文与定位，核对复杂排版后整理结构化事实与隐私标记，再结合 Design DNA 做真正的项目设计。原文取证 JSON 含私人信息，只能保留本地。`scripts/build_resume_site.py` 只是离线技术样稿生成器；没有实际模型/视觉/用户批准时必须显示草稿，不能拿其示例网页声称完成了真实用户端到端验收。

### Step C｜素材计划与文案审批

- 重要章节设计 `asset-plan.json`，说明 `purpose、scene_id、origin、版权/授权、替代方案、alt_text、可编辑性`。先读 `references/ASSET-DIRECTION.md`；`python scripts/validate_asset_plan.py --plan <file>` 可校验元数据。不得未经同意外传源资料、调用外部素材服务或使用受限字体/媒体。
- 对叙述性事实、数值、引用、专有名词和图表结论保留来源定位。若使用 `visual-master/content.json` 与 `source-map.json`，按 `references/PROVENANCE-QA.md` 运行 `scripts/check_source_coverage.py` 检查章节覆盖；**结构性覆盖不能替代事实核查**。
- 提交用户最后将看到/听到的**完整标题、正文、图表标签、旁白和字幕**，同时保留内部来源与问题清单。按 `references/AUDIENCE-COPY.md` 等待真实审稿；涉及视频且有声音时同时读 `references/AUDIO-DIRECTION.md`，先确认句群节奏，**再**固定场景时长。
- v1.5 原 `copy_approval`/SHA256 生产门禁继续有效。不能为了通过测试伪造 `approved`。

### Step D｜制作与精准改稿

- 建立有稳定章节和元素 ID 的响应式 HTML，按用户选择实现静态排版、SVG/Canvas/WebGL 动效、演示模式与可跳转索引。每种效果都要有内容理由、移动端方案、低性能和 reduce-motion 回退。
- Video Ready / Dual 使用共享 `visual-master/{content,design-tokens,storyboard,timeline,approval}.json` 与 `scene_id/element_id/frame_index`，HTML 与 Remotion 的状态尽可能由**同一帧输入**计算。Remotion 必须实际用 `useCurrentFrame()`；横竖版重新设计构图，不简单裁切。
- 未批准文案只允许占位/脱敏技术原型，不可生成声称已定稿或可直接发布的正式成品。正式构建必须 `python scripts/lint_audience_copy.py --source <project> --mode production` 通过，且与用户审批事实一致。
- 用户要改文字、位置、动画、光效：按 `references/REVIEW-LOOP.md` 找稳定 ID、标注范围，最小修改、可撤销、重截图。不能把对临时 DOM 的修改当成已同步源母版。

### Step E｜实际渲染 + Visual QA + 交付

- 在可执行环境中**真的打开/截图**首屏和高信息密度区域，至少桌面 1440×900 与手机 390×844；如果做视频，增加 16:9/9:16 开头/中间/结尾关键帧。运行 `python scripts/visual_qa.py --cases <qa-cases.json> --out <qa-dir>` 并人工核对截图；按 `references/ACCESSIBILITY-QUALITY.md` 验证键盘、焦点、减少动态效果、可读性和关键按钮实际行为。不能拿自动检查 PASS 替代美术判断或用户确认。
- 检查文案一致、素材授权、数据真实性、导航及动画动作、低性能和无障碍。发现设计平庸，优先重新设计关键场景，不继续堆统一圆角卡片/渐变/动画。
- Remotion CLI 若可用，运行官方 `compositions / still / render`，核对 MP4 总帧数、分辨率、时长、视频关键帧、字幕和音频。如 CLI 无法使用，交付可运行源工程与准确的“待验证”，**不能将 Chromium/FFmpeg 视频声称为 Remotion 已验证**。Hyperframes 同理。
- 仅在真正成功生成文件时提供下载链接，报告已验证/未验证、剩余缺陷、版本和用户后续如何继续改稿。未经授权不部署/公开发布。

## 三、强制门禁（失败就停在当前阶段）

| 门禁 | 放行条件 | 不满足时 |
|---|---|---|
| G0 SOURCE | 已读取真实附件，事实与来源可追踪 | 明确资料不足，不胡编 |
| G0T TASTE | 审美参考已上传完成、真实可见、用户明确要求开始分析、外部传输经单独授权 | 停止图像分析；可仅解释文字或等待用户 |
| G1D DNA | 长期偏好为 `CONFIRMED` 且用户确认有具体证据；项目方案不机械套 Profile | 仅用 `INFERRED` 做清楚标注的临时方案，不写入长期内核 |
| G1 VISUAL | 用户看过真实视觉样稿并选定/明确委托 AI 决定；关键样稿已实际截图检查 | 先交可看方案，不开始大规模生产 |
| G2 COPY | 完整观众稿经用户明确批准，版本/范围有可核查记录 | 只出显著占位/脱敏原型，停止正式构建 |
| G3 ASSETS | 视觉素材的来源、使用权限、适用范围与降级策略清楚 | 隔离/替换素材；不公开 |
| G4 BUILD | 作品可运行，主要设备/场景的视觉 QA 与交互 QA 真实执行 | 修复后重测；不能只交设计截图冒充网站 |
| G5 VIDEO | 仅对实际运行过的官方视频 CLI / 文件宣称已验证 | 标记未验证并保留可复现命令/日志 |
| G6 PUBLISH | 用户明确同意公开部署或外部服务传输 | 仅本地交付 |
| G7 RELEASE | 安装目录、包内容、版本、测试记录、已知限制和下载校验可核查 | 只标注内部候选，不声称公测版已经验收 |

用户批准内容与视觉的确认记录不得自行生成，测试 fixture 只能用于测试并标明虚拟，不可用于真实作品绕过门禁。

## 四、两种模式如何执行

- **Quick**：两套真正可看的 HTML 视觉方向（或用户已决定时一个），一轮视觉选择，一轮完整文案审核，再开发、截图 QA、交付。用户可以把非重要设计决策交给 AI，不能自动交给 AI 批准观众文案。
- **Studio**：三套差异化视觉方向，选定后为主视觉与内容密集区做原型；`asset-plan`、分镜/运动、文案审批、双设备/双视频画幅、完整 Visual QA 和精确改稿闭环。对于 Video Ready 视用途添加音画联合设计。

完成后报告包含：本次处理了什么、真实视觉选择证据、用户已批准/待批准的文案版本、实际 QA 文件、视频引擎实际验证状态、未完成部分以及如何继续。

**资源与工具在本目录中**：`START-HERE.md`（复制启动卡）、`templates/`（Brief、Taste Intake、Design DNA 与审查表）、`scripts/design_dna.py`（确认、反馈版本、隐私导出）、`scripts/project_art_direction.py`（个人品味与项目内容合成）、`scripts/extract_resume.py`（DOCX/PDF/MD/TXT 离线文本取证）、`scripts/build_resume_site.py`（离线简历站技术参考）、`scripts/build_visual_pitch.py`（参考视觉提案）、`scripts/visual_qa.py`（截图 QA）、`scripts/check_source_coverage.py`（来源覆盖）、`scripts/beta_doctor.py`（安装预检）、`CODEX-E2E-PROMPT.md`（真实端到端测试）。
