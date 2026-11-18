# HTML Creator Studio v1.8 · Development Candidate QA

**版本状态：开发候选（未公开发布）**；核对日期 2026-11-07（UTC+8）。本次升级建立在独立版 v1.7 基础上，未覆盖原公开安装包。

## 已完成的实现

| 模块 | 代码/规范 | 本轮状态 |
|---|---|---|
| 图片与文字 Taste Intake | `references/TASTE-INTAKE.md`、`templates/TASTE-INTAKE.json`、`scripts/design_dna.py check-intake` | 分离上传完成/开始分析/实际视觉访问；静态阻断条件经测试 |
| 个人 Design DNA | `references/DESIGN-DNA.md`、`scripts/design_dna.py` | 逐条 OBSERVED/INFERRED/CONFIRMED，确认权限、配色可读性、长期版本、新文件修改与隐私导出校验 |
| 跨项目 Art Direction | `references/PROJECT-ART-DIRECTION.md`、`scripts/project_art_direction.py` | Quick 2 / Studio 3 个项目方案合约；同一 DNA 跨内容、同一内容跨 DNA 对照测试 |
| 简历原文取证 | `scripts/extract_resume.py` | 本地 MD/TXT/DOCX 文字与位置、PDF（需 pdftotext）分页文字；保留私密文件边界，未自动判断事实真实性 |
| 简历网站样稿 | `scripts/build_resume_site.py` | 同一虚构简历三种不同结构单文件 HTML；草稿提示、HTML 转义、安全 URL、私人联系方式隐藏、独立审批门禁 |
| 试验展示 | `examples/personal-dna-pilot/rendered/standalone-preview.html` | 三种虚构风格嵌入单文件、可切换及下载当前 HTML；Node 内联脚本语法通过，尚无真实浏览器截图证据 |
| 历史功能 | v1.5–v1.7 工作流、来源追溯、素材、Quick/Studio、文案审批、Video Ready | 保留文件和既有回归测试；本轮未运行外部视频官方 CLI |

## 技术验证记录

- `python scripts/beta_doctor.py --run-tests`：**PASS**，36 个必备文件存在，Python Playwright/Chromium、Node/npm、FFmpeg、`pdftotext` 均检测到；存在 ≠ 浏览器/视频引擎已成功运行。
- `python -m unittest discover -s tests -q`：**PASS · 66/66**，包含 v1.7 旧版回归、Personal DNA、隐私导出、Art Direction、简历 DOCX/Markdown 取证、简历网站样稿、单文件对照和门禁测试。
- `python scripts/extract_resume.py --input examples/personal-dna-pilot/fictional-resume.md ...`：**PASS**，13 条原文证据，本地 JSON 标记私有与待核验；这是虚构资料，不包含真人信息。
- `scripts/design_dna.py check-intake`：未上传完成 / 未真实看图 / 未明确开始分析 → **BLOCKED**；合法的纯文本显式请求 → **READY**。
- 三种虚构 DNA 的 Art Direction 与离线简历 HTML：**生成成功**；只证明示例数据与结构能闭环，不证明 AI 真正理解任何用户图片或喜好。
- `node -e` 编译单文件预览内联脚本：**PASS**。这只证明脚本语法，不等于功能已在真实浏览器点击验证。
- 本地 `visual_qa.py`：10 组桌面/手机视觉测试尝试 **BLOCKED**。本机 `/usr/bin/chromium` 在 process singleton 创建 socket 时返回 `Operation not permitted`；因此**没有截图、交互、溢出及移动端真实浏览器 PASS 证据**。正式公测前需换允许启动 Chromium 的环境运行并人工检查实际截图。

## 公测前未完成 / 必须独立复验

1. **真实多模态审美解析**：目前没有用户完成上传并明示开始分析后的真实授权素材样本。必须在能看图的宿主 Agent 上验证观察/推断/用户确认的分离是否有效。
2. **审美一致性与个性**：虚构示例展示跨版式差异；需真实用户判断是否反映本人品味，以及不同项目是否真正不雷同。内置四种简历生成布局只是技术参照，仍需 Agent 根据内容创作。
3. **真实简历格式兼容性**：DOCX 混合表格、PDF 双栏、扫描件 OCR、超长中文断行，以及事实来源映射都需要用户文件脱敏实测。`extract_resume.py` 不进行 OCR 或智能字段归一化。
4. **隐私审查**：自动导出过滤能拦截常见私人字面量，但无法保证任意描述、项目名称都已经完全匿名；必须由用户检查 Portable Profile。
5. **浏览器交互与视觉 QA**：目标环境中桌面 1440×900、手机 390×844，对比至少三种不同真实作品/方向；检查 Tab、Enter、Space、触摸、减少动效、滚动与导航。当前结果 BLOCKED。
6. **公共发布与外部模型**：本次未调用第三方图像模型、未上传用户私密素材、未推送 GitHub、未替换 v1.7 文件站公链/展示页，也没有真实用户的文案、视觉或公开发布批准。

## 版本判定

适合：**内部安装 / 离线体验 / 收集真实反馈**。

暂不适合：将 v1.8 宣传为已经完成真实图片审美识别、已经经过真实浏览器全量验收或已经向公众正式发布的稳定公测版。
