# HTML Creator Studio v1.8 · Personal Design DNA / Development Candidate

日期：2026-11-07。基于 v1.7 独立版构建新的候选工程，保留原公开 ZIP、展示页及 QA 归档。未获得用户的真实视觉/简历端到端体验反馈前，**不覆盖 v1.7 公链，不对外宣称 v1.8 已稳定发布**。

## v1.8 增量

1. **Taste Intake + Vision Gate**：支持多参考、维度级部分喜欢/讨厌、两阶段上传与开始分析；未看图、未经分析授权时正确 BLOCKED。
2. **Personal Design DNA**：`OBSERVED/INFERRED/CONFIRMED`、可解释偏好证据、独立审批、版本化反馈；Portable Export 剔除原始路径、原话和身份规则，拦截明显联系方式/URL/私有路径，并要求人工审阅。
3. **Project Art Direction**：长期品味与本次材料、受众、设备分层，编译出可追溯的项目专属创意合约；默认 Quick 两案、Studio 三案。
4. **Resume to Personal Website**：支持 TXT/MD/DOCX 本地取证，PDF 可用本地 `pdftotext` 提取原文；再由 Agent 与用户核实结构化真实经历。隐私默认隐藏、文案/视觉/部署独立确认；单文件静态 HTML 参考构建器提供不同构图演示。
5. **虚构对照样例与自动测试**：同简历三种审美、同审美三种内容、反馈撤销、导出隐私与正式发布拒绝等回归用例；新增可单独下载的三套页面内嵌 HTML 对照页。**66/66 单元测试通过**；10 个真实 Chromium 截图测试因环境禁止创建 socket 而 **BLOCKED**，不能算视觉 QA 通过。

### 重要范围声明

- `scripts/design_dna.py` 不具备图像识别模型；图像观察需宿主 Agent 实际提供视觉能力与用户授权。`vision_state=verified` 是声明性证据，不等同机器可自动核实视觉真假。
- 公测版演示 HTML 生成器仅验证可执行与差异结构，真实美术水准与长期偏好准确性必须由用户在实际资料上评审。
- 无额外授权，不公开网站、不上传参考图、简历或私密资料到外部模型与服务。

---

## 历史：v1.7 Workflow Stabilization / Public Beta

日期：2026-11-06。基于独立 v1.6 候选包制作，**不覆盖 v1.6 原版**。这是公开测试交付，不是 WorkBuddy 版，也不宣称所有外部引擎和客户端均通过安装验收。

## v1.7 增量

1. 新增 `scripts/beta_doctor.py`，完整性/版本检查、环境工具探测和单元测试入口。可选依赖被发现不等于对应引擎真实可用。
2. 新增 `scripts/check_source_coverage.py` 与 `references/PROVENANCE-QA.md`，补齐章节 ID、来源映射、孤儿映射及私人内容申明的结构审查；事实真伪仍需独立核实。
3. 新增 `references/ACCESSIBILITY-QUALITY.md`，把键盘、焦点、阅读、减少动画、移动触控和浏览器资源路径纳入体验验收。
4. 将 `README.md`、`START-HERE.md`、`CODEX-E2E-PROMPT.md` 调整为可独立试用的公测入口，解释 Quick、Studio、HTML、Video Ready、Dual 的流程及未批准文案的边界。
5. 补充新测试、真实浏览器页面验证与可复现发布记录。具体实测结果以 `QA-RESULTS-v1.7.md` 为准，不能用 v1.6 的测试数字充当 v1.7 的通过证明。
6. 公测下载版裁剪历史录屏与截图证据，保留完整可执行 Skill 代码、参考文件、示例网页与验收报告，降低安装体积；原始完整工程归档不覆盖。

## 已知未解决的外部验证

- 不承诺所有 ChatGPT 客户端均能直接安装 ZIP；以客户端支持的 Skill 方式为准。
- Remotion / Hyperframes 官方 CLI、第三方素材或音频服务与真实陌生用户审美评价，必须在对应环境和授权条件下单独验收。
- `scripts/build_visual_pitch.py` 只提供三种可用原型语言，真实项目需要 Agent 围绕具体资料重新设计，不得机械套皮肤。

---

## 历史基线：v1.6

发布日期：2026-10-19（内部候选）。以 `HTML-Creator-Studio-v1.5-Codex-Full-Skill.zip` 为基线，另行生成本版本 ZIP；**原 ZIP 与原有 Codex 安装目录不覆盖**。

## 基于 v1.5 用户反馈进行的系统性补强

### 1. Visual Pitch：不再用文字选择设计
- 输入用户附件后，优先形成实际可看的 HTML **首屏 + 内容密集内页**（Quick 推荐 2 套、Studio 推荐 3 套）。
- 参考实现 `scripts/build_visual_pitch.py`，含三种实质不同的排版方案、可离线运行的切换器与移动预览。
- 视觉决定记录在 `visual-pitch/DECISION.md`，不伪造用户批准；此决定不等于审稿/部署授权。
- 固定的 3 套参考皮肤只是示范，不可冒充任意主题通用优质创意。

### 2. Asset Direction：让“主题专属视觉主体”进入流程
- 新增原创/授权素材规划、图形语义和横竖版构图规范。
- 素材清单脚本对来源、授权、替代方案做字段检查，待授权不得正式发布。

### 3. Visual QA：有截图证据才能交差
- `visual_qa.py` 检查脚本错误、横向溢出、坏图、局部裁切与微小文字。
- 可输出桌面/手机真实截图、JSON 和人工评审清单；可选基线差分。
- 自动检查不等于美术评分，也不等于 Remotion 官方 still/MP4 完成。

### 4. 视频 Audio Direction
- 句群/字幕/关键帧同源，口播需先审稿，避免视频做完强塞配音；所有外部 TTS/声音资产尊重授权。

### 5. Quick / Studio 与 Skill 瘦身
- 新手 Quick 少问讯，仍先看 HTML 样稿和确认完整观众稿；Studio 做完整制片规格。
- 根 `SKILL.md` 作为轻量主路由；原 v1.5 8 阶段 26 步整体保留 `references/CORE-WORKFLOW-v1.5.md`。
- 修复 START-HERE.md 内重复 07/08 编号为连续 01–10。

## 兼容与边界

- `references/AUDIENCE-COPY.md`、生产审批哈希/`--production` 的真实用户确认流程保留，测试 Fixture 不能替代审批。
- Remotion React Composition、Frame Styles、Hyperframes 参考交接与原品牌样例均不覆盖。
- 仍然无法声明“任意 HTML 一键无损 Remotion 转换”。官方引擎 CLI 需在可安装 npm 的用户/Codex 环境真实检验。
- 设计成品质量必须通过用户提供新文档后的真实体验验证；不能以演示模板截图和自动测试代替用户审美评价。
