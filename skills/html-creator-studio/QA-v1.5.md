# HTML Creator Studio v1.5｜修订包测试与边界

**测试日期：2026-10-18。测试对象：v1.4 完整 Skill 的 v1.5 修订副本。** 原始 v1.4 ZIP 没有被覆盖。

## 1. 本轮变更范围

- **Fix DESIGN-01**：读取 `references/designresources.md` 的 2026 研究与真实设计案例；2027 只作为前瞻假设。三套非表面换色的艺术方向、项目视觉签名、截图与 100 分量表。
- **Fix COPY-01**：观众文本与原始来源映射隔离；正式标题、正文、口播、字幕先由用户审稿。新增 `copy_approval` 与 `copy-draft.md` 哈希门禁，允许带标记的占位技术原型，不能冒充成品。
- **脚本**：`lint_audience_copy.py --mode draft|production`；生成器 `build_preview.py --production`、`bootstrap_remotion.py --production` 新增正式构建检查。

## 2. 结果

| 测试 | 结果 | 说明 |
|---|---|---|
| 核心 Skill 参考路径 | PASS | 两份新参考与两个模板均存在且主指令已路由 |
| 文案 linter 8 项独立单元测试 | PASS | 未批准、批准版本变更、文案元话语、来源信息免误报等 |
| 未批准内容 `lint --mode draft` | PASS / WARN | 正常生成内部草稿审查结果 |
| 未批准内容 `lint --mode production` | EXPECTED BLOCK | 拦截正式交付 |
| 未批准内容 HTML `--production` | EXPECTED BLOCK | 不生成正式预览 |
| 未批准内容 Remotion `--production` | EXPECTED BLOCK | 不生成正式视频工程 |
| **仅用于 QA 的临时虚拟审批样本** | PASS | 手工生成测试 fixture，验证审批哈希匹配时两个生产构建可进行；**不代表用户授权**，且不会收入发布包 |
| 现有 36 秒 Visual Master 结构 | PASS | 6 幕、18 轨道、1080 帧、30 FPS；保持样例未批准状态 |
| 原 v1.4 逐帧引擎 | PASS | 484 项检查 |
| 原 v1.4 Remotion 适配 | PASS | 80 项离线组件检查，两个画幅 |
| 源工程检查 | PASS | 在生成 Remotion 工程目录运行 `node scripts/check_source.mjs` |
| HTML 预览生成 | PASS | 无网络离线生成可逐帧寻址 HTML |
| npm 安装/Remotion 官方 CLI MP4 | NOT RUN | 与 v1.4 相同，仍需 Codex 端实测，不能声称已经证明运行 |
| 设计成果真实任务审美复测 | NOT RUN | 必须用用户的新附件和真人确认判断 v1.5 是否显著改善 |
| 观众口播与用户文案确认真实体验 | NOT RUN | 必须由 Codex 在用户实战中发起并等待真实批准 |

## 3. 复现命令

```bash
# 在 Skill 根目录
python -m unittest discover -s tests -v
python scripts/validate_master.py --source examples/hcs-brand-pilot
node scripts/check_frame_engine.mjs examples/hcs-brand-pilot
python scripts/lint_audience_copy.py --source examples/hcs-brand-pilot --mode draft
python scripts/lint_audience_copy.py --source examples/hcs-brand-pilot --mode production # 应失败：样例未批准
python scripts/build_preview.py --source examples/hcs-brand-pilot --out /tmp/hcs-v15-preview.html
python scripts/bootstrap_remotion.py --source examples/hcs-brand-pilot --out /tmp/hcs-v15-remotion
node scripts/check_remotion_adapter.cjs /tmp/hcs-v15-remotion
(cd /tmp/hcs-v15-remotion && node scripts/check_source.mjs)
```

**生产路径**：必须取得真实用户对具体稿件的批准证据，写入真实审批与版本哈希后，再使用两个生成器的 `--production` 标志。不能为通过测试自行编写 `approved`。

## 4. 与真实 Codex 任务的下一步验收

1. 用户上传一份新的可公开或脱敏文档。
2. Codex 提出**构图/字体/动画都有实质差异**的三套方案并说明 2026 来源与 2027 假设。
3. 用户选择其一；先出全部观众文案/旁白/字幕审稿包。用户若未回复批准，应**停在等待审稿**，而不是照旧一口气生成完成的 MP4。
4. 用户批准后，记录文本哈希并生成高质量 HTML 和视频 Visual Master；检查观众稿不出现无意义的“原文说”。
5. 使用 `--production` 门禁，在能够访问 npm 的 Codex 环境运行真正的 Remotion 官方 CLI，检查关键帧保真与成品质量。
6. 提供 `DESIGN-REVIEW.md`、`COPY-REVIEW.md`、截图、实际结果与报告；不把视觉/口播试验模拟为用户批准。

## 5. 重要风险

设计研究只为启发，不代表“2027 世界公认趋势”，也不能保证获奖品质。文案 linter 是有限模式匹配，会有漏报与误报，真实语义由人审。示例含 v1.4 技术演示用营销文字，已明确标记未批准，不是正式成品。官方 Hyperframes / Remotion CLI 是否在 Codex 端可用需要独立验证。

## 6. ZIP 全新解压复验

将发行候选 ZIP 解压到**干净目录**后运行 `sha256sum -c SHA256SUMS.txt`，92 个文件逐项校验成功。随后重新执行 8 项文案门禁单元测试、Visual Master 验证、484 项逐帧检查、HTML Preview 生成、Remotion 工程引导、80 项离线组件检查，以及生成工程目录中的 `node scripts/check_source.mjs`，全部 PASS。此测试不等于官方 Remotion CLI 的 MP4 渲染验证。
