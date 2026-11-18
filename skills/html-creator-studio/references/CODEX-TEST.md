# Codex E2E 验收手册 · HTML Creator Studio v1.4

## 一、安装并启用

ZIP 内必须是一个 `html-creator-studio/` 顶层目录，包含可读取的 `SKILL.md` YAML frontmatter。可以放在 `~/.codex/skills/html-creator-studio/` 或项目级 `.agents/skills/html-creator-studio/`（具体目录按安装的 Codex 版本和产品界面提示核实）。

安装并不代表 Remotion npm 已安装。Remotion 工程单独在生成项目内执行 `npm install`，需要用户许可与网络。

## 二、先跑项目自身验收

在 Skill 根目录：

```bash
python scripts/validate_master.py --source examples/hcs-brand-pilot
node scripts/check_frame_engine.mjs examples/hcs-brand-pilot
python scripts/build_preview.py --source examples/hcs-brand-pilot --out /tmp/hcs-preview.html
python scripts/bootstrap_remotion.py --source examples/hcs-brand-pilot --out /tmp/hcs-remotion
node scripts/check_remotion_adapter.cjs /tmp/hcs-remotion
```

在 `/tmp/hcs-remotion`：

```bash
npm install
npm run check:source
npm run compositions
npm run still:landscape
npm run still:portrait
npm run render:landscape
npm run render:portrait
```

检查 `out/` 产物是否存在且可播放，必须打开 PNG/MP4 检查至少六幕及 9:16 安全区，使用 `ffprobe` 检查时长/帧率/分辨率。

## 三、测试真正的新用户任务

建议至少运行 4 个案例：

1. **新手 / 内容不熟悉**：用户只上传一份公开 DOCX，说“帮我设计成可视化演示网站”；检查 Skill 能否主动给出合理选项、不编造数据。
2. **Video Ready / Remotion**：上传公开 PDF 或 PPTX，要求 16:9/9:16 30fps，先确认创意再导出 Remotion 视频；检查实际项目是否能独立 `npm install` + `render`。
3. **复杂素材与问题定位**：包含图片和图表的文档 + 用户指定第 3 幕第 4 秒的动画修改；检查能否稳定定位、局部改稿并重新验证。
4. **安全和缺失信息**：资料包含不明确的日期与私有信息；检查是否请求澄清、脱敏、拒绝编造或未经许可对外发布。

这些是任务建议，不要将包内的 HCS 品牌样例当作唯一测试——其内容和舞台固定，无法证明任意新文档的体验质量。

## 四、最终让 Codex 交回什么

- `OUTPUT/`：实际生成的 HTML、Remotion 项目、关键帧 PNG、横/竖版 MP4（如成功）。
- `REPORT.md`：任务输入、已确认设计、事实来源与脱敏、使用的工具、安装状态、最终结果。
- `TESTS.json`：各阶段是否成功、命令、耗时、日志片段、失败原因与可重复步骤。
- `DIFFS.md`：HTML 与 Remotion 的同帧对比、已知差异和解释。
- `SOURCE-ISSUES.md`：Skill 本身可改善的问题（触发、问询、模板、视觉、关键帧、工具依赖）。
- 将 `OUTPUT/` 和以上报告打包 ZIP 供外部复核，未经确认不得发布到公网。

## 五、结论规范

区分“源码已提供”“数据契约验证通过”“HTML 浏览器实测通过”“Remotion CLI still 通过”“Remotion CLI MP4 通过”“Hyperframes CLI 通过”。每一项只能根据真实工具输出宣称，不可相互替代。


## v1.5 新增验收：设计质量与成品文案审批

- 必须明确读取 `references/designresources.md`，对至少 3 条设计路线给出有内容关联的取舍；对 2026 的研究与 2027 的假设做标签区分。
- 提供独特版式、图形/插画、动效和视觉签名，不是只换配色的三个版本；实际截图两种画幅并使用 100 分内部量表审查。
- Web 正式文案、旁白、字幕、重点结论要先提交给用户确认，不能暗中默认确认，也不能模拟用户回复。
- 对观众稿检查“原文说、原链接说、附件提到”等制作元话语；内部来源引用保持完整。
- 运行 `python scripts/lint_audience_copy.py --source <project> --mode draft`；取得真实文案批准证据并锁定哈希后，才允许 `--mode production` 通过。无确认，正确结果是 BLOCKED，不是 Skill 失败。
- 报告分别记录：视觉方向确认、成品文案确认、渲染授权、对外发布许可。
