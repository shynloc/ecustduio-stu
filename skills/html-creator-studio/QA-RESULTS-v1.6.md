# HTML Creator Studio v1.6 · 实际测试记录

**日期：2026-10-19。基线：v1.5 独立 ZIP，原版没有被覆盖。**

## 本次开发范围

- Quick / Studio 创作路径与连续编号 START-HERE 启动卡；
- `SKILL.md` 由约 51 KB 的整体规范改为约 10 KB 的任务路由；v1.5 全流程保留在 `references/CORE-WORKFLOW-v1.5.md`；
- `VISUAL-PITCH.md`、`ASSET-DIRECTION.md`、`VISUAL-QA.md`、`AUDIO-DIRECTION.md`、`WORKFLOW-MODES.md` 以及模板；
- 新增三个可运行工具 `build_visual_pitch.py`、`visual_qa.py`、`validate_asset_plan.py`；
- 新增以 HTML 创意工坊自身公开内容为题的三个真实 HTML 视觉提案与 12 张 QA 截图；
- 保留原有观众文案审核、Visual Master、Frame Styles、Remotion 适配、Hyperframes 参考源码。

## 自动化与浏览器结果

| 项目 | 状态 | 证据与说明 |
|---|---|---|
| 新增 + 旧版 Python 单元测试 | PASS | 19/19，含 8 项文案生产门禁 |
| Visual Pitch 三方向 | PASS / 需用户审美复核 | 三个不只换色的 HTML 组成：暖纸/空间/实验字体；可打开、滚动与响应式 |
| 浏览器截图矩阵 | PASS（结构性） | 3 风格 × 桌面/手机 × 首屏/信息密集区 = **12** 个场景；输出 12 张 PNG 与 JSON；未见坏图、明显溢出、脚本异常 |
| Visual Pitch 展示页交互 | PASS | Chromium 1440×900 与 390×844，三方案切换、iframe 显示、电脑/手机模式、复制选择说明 |
| 素材计划生产校验 | PASS | 3 个示例均为原创内联 SVG/CSS，无第三方素材；授权不足的输入在测试中被警示/拒绝 |
| v1.5 原 36s Visual Master 合约 | PASS | 6 scene、18 track、1080 frames、30 FPS；示例仍为未经真实用户审稿的占位技术展示 |
| 逐帧引擎 | PASS | 484 项检查，99 个采样帧 |
| Remotion 离线组件适配 | PASS | 80 项，两构图；生成工程结构完整且 `check_source` 通过 |
| 观众文案预览 lint | PASS / WARN | 示例文案处于 `prototype_placeholder`，没有真实用户批准记录 |
| 观众文案正式构建 | EXPECTED BLOCK | 未经用户批准，`lint --mode production` 非零退出 |
| Remotion 官方 CLI | NOT RUN | 未在此轮执行 `npm install / remotion render`，不可称官方 Remotion 视频已完成 |
| Hyperframes 官方 CLI | NOT RUN | 适配源码保留，未做官方 CLI 验收 |
| 真实陌生用户的附件任务审美评分 | NOT RUN | 需要交由 Codex 与用户实际测试，样例本身不能证明跨主题设计质量 |

### 管理型 Chromium 的本地导航限制

当前浏览器策略将 `file://` 与本地 HTTP 导航判定为 `ERR_BLOCKED_BY_ADMINISTRATOR`。视觉 QA 使用受控 `page.set_content` 作为**明确标记的本地内联备用加载模式**，所有样例都无外链资源；报告在每个场景写明 `capture_mode=local_inline_fallback`。如果新用户项目含 CSS/JS/字体/图像相对资源，必须在允许本地页面/开发服务器的真实 Chromium 环境重新测试，不能把本次备用截图证明为所有资源加载通过。

### 已进行的人工画面检查

人工检查了三方向首屏接触板和实验字体内页移动截图；能够辨认不同构图、字体层级与主要原创 SVG/CSS 装置。**这不构成目标用户对美感的确认**，也不能保证 Awwwards 等专业评奖品质。

## 已知限制与后续 Codex 实验

1. `build_visual_pitch.py` 是低依赖的创意原型示例，只包含三种参考艺术语法；真实文档要由 Agent 根据来源内容新增主题专属图形/布局，不能机械套入固定页面。
2. `visual_qa.py` 可识别常见布局错误并存档截图；对压行、视觉美学、3D Shader、影片音乐混音、版权和文案质量的判断仍需人审核。
3. 用户视觉方案确认与完整观众文案批准需分别保留真人决定；自动脚本不能生成或代签。
4. 真正的 Remotion/Hyperframes 官方 CLI still/render 成功需在目标 Codex 环境复现；现有 484/80 数字只说明脚本与离线组件测试。
5. 私密用户附件不得上传外部图像/声音服务或公开仓库；素材来源如标为 `needs-permission`，不应把它当正式资源使用。

## 命令复现

```bash
python -m unittest discover -s tests -v
python scripts/build_visual_pitch.py --brief examples/visual-pitch-demo/pitch-brief.json --out /tmp/hcs-demo-pitch
python scripts/validate_asset_plan.py --plan examples/visual-pitch-demo/asset-plan.json --production
python scripts/visual_qa.py --cases examples/visual-pitch-demo/qa-cases.json --out /tmp/hcs-demo-qa
python scripts/validate_master.py --source examples/hcs-brand-pilot
node scripts/check_frame_engine.mjs examples/hcs-brand-pilot
python scripts/bootstrap_remotion.py --source examples/hcs-brand-pilot --out /tmp/hcs-generated-remotion
node scripts/check_remotion_adapter.cjs /tmp/hcs-generated-remotion
(cd /tmp/hcs-generated-remotion && node scripts/check_source.mjs)
python scripts/lint_audience_copy.py --source examples/hcs-brand-pilot --mode production  # 应失败：示例未获批准
```

**这次属于实现与本地测试完成、真实新用户审美实战仍待验证的 v1.6 Skill 候选包。**
