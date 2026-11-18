# HTML Creator Studio v1.8 · Personal Design DNA（开发候选）

**面向能够读取本地 Skill 的 AI 客户端，尤其是 Codex 的文档 → 创意 HTML → Video Ready / Remotion 独立 Skill。与 WorkBuddy 适配版分开维护。**

> 状态：**v1.8 开发候选**，尚未取代公开的 v1.7。核心静态校验、样例输出与未测试边界见 `QA-RESULTS-v1.8.md`。没有真实上传的个人视觉资料与用户审美确认时，不得宣称已完成多模态个人品味识别。

## v1.8 核心：让内容理解和用户审美真正连接

- **Taste Intake**：图片、穿搭、汽车、风景、网站或文字都能作为审美来源。上传和分析分阶段；未实际看图时必须停下来，不凭图片名称猜内容。
- **Personal Design DNA**：区分 `OBSERVED`（真实观察）、`INFERRED`（AI 推断）和 `CONFIRMED`（用户逐项确认）。局部好恶与禁用清单独立记录。
- **本地档案与版本**：`scripts/design_dna.py` 验证、反馈修订、脱敏导出；默认移除原始素材索引、来源路径、用户原话、身份规则与未经确认的信号。明显的联系方式/路径/URL 会拦截，**自由文字仍需用户人工检查，导出不等于获得分享许可**。
- **Project Art Direction**：长期品味 × 项目内容/受众/设备。每个项目重新设计，不把个人档案变成固定 Skin。
- **Resume to Personal Website**：本地 TXT/MD/DOCX 原文取证，PDF 可用本地 `pdftotext`，保留段落/页码证据；由 Agent 与用户复核事实及隐私后，再设计个性化网站。另有单文件离线示例生成器，它不具备 AI 自动看图或识别人事真实性的能力。

### 可复现的离线流程

```bash
python scripts/design_dna.py check-intake --intake examples/personal-dna-pilot/intake-blocked.json
# 预期 BLOCKED：没有完成上传、没有视觉访问、未收到“开始分析”

python scripts/design_dna.py validate --profile examples/personal-dna-pilot/precision-profile.json
python scripts/extract_resume.py --input /path/to/your-resume.docx --out /path/to/private-evidence.json
# 此命令是文档原文证据提取，不会自动对简历事实、隐私与发布作出决定。
python scripts/project_art_direction.py \
  --profile examples/personal-dna-pilot/precision-profile.json \
  --brief examples/personal-dna-pilot/brief-resume.json \
  --out /tmp/hcs-precision-direction.json
python scripts/build_resume_site.py \
  --resume examples/personal-dna-pilot/fictional-resume.json \
  --profile examples/personal-dna-pilot/precision-profile.json \
  --direction /tmp/hcs-precision-direction.json \
  --out /tmp/hcs-precision-resume.html
```

虚构示例只验证技术通路，不构成 AI 已理解真实图片/人物或用户已经批准发布。三个虚构 profile 的网站可以用于比较 Design DNA 对排版结构、材质表达和配色的影响；可直接打开 `examples/personal-dna-pilot/rendered/standalone-preview.html` 看**无需附带资源的单文件对照页**。其四类版式是技术参考，**Skill 的项目创作流程不强制套用这些布局**。真正的创意能力仍以 Agent 对**新用户资料**的真实视觉提案为准。

**安装包轻量化**：公测 ZIP 保留 Skill、参考资料、脚本、模板、可运行 HTML 示例、文本/JSON 测试数据和 QA 报告；旧版截图集、录屏 MP4 等较大的历史验收素材另行归档，安装与基本测试不依赖这些媒体文件。

## 三步开始

1. 解压本包，保留完整 `html-creator-studio/` 文件夹，并按客户端支持的方式安装/添加此 Skill。**不要只放 `SKILL.md`**；`references/`、`scripts/`、`templates/`、`shared/` 必须保留。对于不支持 ZIP/自定义 Skill 导入的环境，先使用其正式支持的工作区指令或文件引用机制，不能假称安装成功。
2. 在该文件夹执行 `python scripts/beta_doctor.py --run-tests`，查看本机依赖与本包静态检查。浏览器、ffmpeg、Node、Remotion 等缺失只影响相关功能；是否能够渲染以实际运行结果为准。
3. 上传有权使用的资料，复制 `START-HERE.md` 中的 **01（新手）**、**02（定制）**、**04（视频）** 或 **05（双用途）** 一个任务卡。默认 Quick，复杂任务 Studio。

完整说明和失败排查见 `references/INSTALL-AND-TEST.md`；公测真实任务模板见 `CODEX-E2E-PROMPT.md`。

## 历史基线：v1.7 Workflow Stabilization

- 独立安装预检 `scripts/beta_doctor.py`：检查目录完整性、版本、入口与可选依赖，可调用已有及新增单元测试；所有可选工具均明确标注“已发现 ≠ 已验证”。
- 来源覆盖 `scripts/check_source_coverage.py` 与 `references/PROVENANCE-QA.md`：按场景检查来源映射、缺失和悬空项；无法自动证明事实准确，数值/引用仍要人工和联网核实。
- `references/ACCESSIBILITY-QUALITY.md`：增加键盘、焦点、减少动态效果、可读性、对比度及移动端交互清单。
- 清晰的公测使用路径、版本命名、证据报告和已知限制。原有审批门禁与 Video Ready 工具保留。

## Quick 与 Studio

| 路线 | 适合 | 首轮交付 | 不可跳过 |
|---|---|---|---|
| Quick（默认） | 常规文档、科普、汇报 | 2 套可打开的真实 HTML 首屏 + 内容内页 | 来源、文案审批、视觉与交互 QA |
| Studio | 品牌叙事、复杂数据、视频、双用途 | 3 套有明显构图差异的提案、素材计划、分镜 | 来源、文案审批、素材授权、跨设备 QA、视频 CLI 真实验证或标注未验证 |

旧版 v1.6 已有的 Visual Pitch、素材和音频规划、文案审批、视觉 QA、Remotion 与 Hyperframes 技术路线仍保留。下文记录了其使用方式。

本次基于 v1.5 增加 **可打开的 Visual Pitch、原创素材方向、截图 Visual QA、音频设计与 Quick / Studio 双模式**，并保留所有原有 8 阶段、26 步核心规范和 Remotion/Hyperframes 交接能力。不是把原文档内容直接套到 3 张模板卡片中。

## 新用户从这里开始

1. 将整个文件夹 `html-creator-studio/` 安装为 Codex 的 Skill（通常放入用户指定的 skills 目录；具体目录以正在使用的客户端为准），**不要只复制 SKILL.md**。保留 `references/`、`scripts/`、`templates/`、`shared/`、`examples/`。
2. 上传 DOCX/PDF/PPTX/MD 或其他有权处理的资料；复制 `START-HERE.md` 中一个任务卡即可。默认 **Quick**：AI 先读内容，再提供 2 个可实际打开的 HTML 视觉样稿供选择，然后单独给用户确认观众文案。
3. 复杂网页、品牌叙事、Remotion/Hyperframes 或需旁白的视频用 **Studio**：3 套样稿、完整素材/分镜、文案审批、横竖版 QA、交接。
4. 选择设计 ≠ 审批文案 ≠ 允许部署/公开发布。用户还未明确批准具体文案，正式构建必须停在待审稿状态。

## 主文件变短，但旧功能没有删

- `SKILL.md`：10 KB 左右的入口路由 + G0–G6 生产门禁。
- `references/CORE-WORKFLOW-v1.5.md`：v1.5 原始 8 阶段/26 步完整指令的只读继承副本（仍需按任务类型读取）。
- `references/designresources.md`：来源与发布日期标注的设计路线库（2027 仍仅前瞻假设）。
- `references/VISUAL-PITCH.md`：如何提交真正的多案 HTML 样稿。
- `references/ASSET-DIRECTION.md`：素材创造、授权、隐私与降级。
- `references/VISUAL-QA.md`：浏览器截图、图像/溢出问题、基线比对、人工评价。
- `references/AUDIO-DIRECTION.md`：口播、音乐、音效、字幕与镜头节奏的关联。
- `references/WORKFLOW-MODES.md`：Quick/Studio 决策与工作流程。
- `references/AUDIENCE-COPY.md`：观众文案/审稿，保留 `copy_approval` 审批门禁。
- `references/VIDEO-READY.md`、`references/REMOTION-ADAPTER.md`、`references/HYPERFRAMES-ADAPTER.md`：原有逐帧工程及视频兼容说明。

## 不用 npm 的视觉提案演示

项目内的 `examples/visual-pitch-demo/rendered/index.html` 可单独打开，内嵌三种可切换 HTML 风格，无外部字体、图片或脚本 CDN。

**这些是 Skin/创意方向的实现示范，绝不等于“拿到任意文档后自动设计出获奖作品”**。Skill 仍需根据源材料手工/代理生成独有的视觉元素与内容页面。示例只用 HTML 创意工坊自身可公开的介绍内容，不包含任何用户原始文档或私有业务资料。

从自己的项目创建真实视觉提案：

```bash
python scripts/build_visual_pitch.py \
  --brief examples/visual-pitch-demo/pitch-brief.json \
  --out /tmp/hcs-my-visual-pitch
```

查看/修改 `templates/VISUAL-PITCH-BRIEF.json`。默认 3 套不同构图，不只是换色；如用户已锁定品牌风格，按其要求创作本项目专属样稿，不必运行固定三套生成器。

## 资产许可与截图检查

```bash
python scripts/validate_asset_plan.py \
  --plan examples/visual-pitch-demo/asset-plan.json --production

python scripts/visual_qa.py \
  --cases examples/visual-pitch-demo/qa-cases.json \
  --out /tmp/hcs-v16-visual-qa

python -m unittest discover -s tests -v
```

`visual_qa.py` 默认依赖 Playwright Python 包、可用 Chromium；像素差异另需 Pillow。它会输出截图、`visual-qa.json` 和 `VISUAL-QA.md`。**在安全策略禁止 `file://` 导航的浏览器环境，会使用仅用于内联/无资源页面的 fallback，并在 JSON 中标记**；依赖相对资源的完整站点必须在实际浏览器环境复验。自动检查不代表美术品质可被客观程序测量。

## v1.5 完整 HTML / Remotion 保留路线

```bash
python scripts/validate_master.py --source examples/hcs-brand-pilot
node scripts/check_frame_engine.mjs examples/hcs-brand-pilot
python scripts/lint_audience_copy.py --source examples/hcs-brand-pilot --mode draft
python scripts/build_preview.py --source examples/hcs-brand-pilot --out /tmp/hcs-v16-preview.html
python scripts/bootstrap_remotion.py --source examples/hcs-brand-pilot --out /tmp/hcs-v16-remotion
node scripts/check_remotion_adapter.cjs /tmp/hcs-v16-remotion
(cd /tmp/hcs-v16-remotion && node scripts/check_source.mjs)
```

正式产品请在真实用户明确批准文案后（保留真实审批证据与内容哈希），运行 `lint_audience_copy.py --mode production` 再使用 `--production` 的构建器。**不得通过模拟批准或测试数据完成真实成品。**

要验证 Remotion 官方渲染：在可访问 npm 的 Codex 环境中执行生成工程的 `npm install`、`npm run compositions`、`npm run still:landscape`、`npm run still:portrait`、`npm run render:landscape` 等。Hyperframes 官方 CLI 也要独立检查。**脚本/离线组件测试通过不等于官方 CLI 已完成视频渲染。**

## 真实端到端任务

把安装包交给 Codex，用用户本次新资料执行 `CODEX-E2E-PROMPT.md`。需要检查的是首次使用引导是否顺畅、视觉是否真正超越平庸、素材语义是否正确、文案审批是否等待、最小改稿是否准确、HTML/视频母版质量和各 CLI 兼容性。输出 `REPORT.md / TESTS.json / DESIGN-REVIEW.md / COPY-REVIEW.md / VISUAL-QA.md / SOURCE-ISSUES.md` 和成果 ZIP。

**隐私边界**：本地演示样稿不上传附件；联网研究与外部素材/TTS 服务必须先符合用户授权。未知版权、未核实数据、未批准文案都不能当正式交付。未经明确授权不能发布网站、录制真人仿声或把资料上传公共仓库。
