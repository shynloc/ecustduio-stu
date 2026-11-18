# HTML Creator Studio v1.7 · Public Beta QA

**日期**：2026-11-06（UTC+8）  
**基线**：独立 v1.6 Codex Full Skill ZIP。原版归档不覆盖。  
**测试范围**：源文件与脚本静态/离线验证、公测安装预检、视觉提案的输出结构、来源映射、Video Ready 逐帧规则、展示页。实际新用户端到端的艺术质量与外部视频引擎仍需要后续公测反馈。

## 1. 已运行的检查

| 项目 | 结果 | 证据/范围 |
|---|---|---|
| `unittest discover` | PASS · **28/28** | v1.6 既有测试 + v1.7 环境预检、来源覆盖、Quick/Studio 个数测试 |
| `scripts/beta_doctor.py --run-tests` | PASS | 22 个核心文件存在，单元测试通过；环境中检测到 Python Playwright、Chromium、Node/npm、ffmpeg，但这不证明视频引擎已运行 |
| `scripts/check_source_coverage.py --strict` | PASS · 6/6 | 内置 Visual Master 样例 6 场景均有映射；不构成任何事实真伪证明 |
| `scripts/build_visual_pitch.py --mode quick` | PASS · 2 方向 | 实际输出 `index.html` + `editorial.html`、`signal.html` 与 manifest |
| `scripts/build_visual_pitch.py --mode studio` | PASS · 3 方向 | 实际输出 `index.html` + 三套 HTML 与 manifest |
| `scripts/build_visual_pitch.py --style collision` | PASS · 1 方向 | 单方向输出与 manifest 正确；只作参考设计语言 |
| `scripts/validate_asset_plan.py --production` | PASS · 3 个示例素材 | 均为内联原创 SVG/CSS 的演示资产；真实用户项目需单独核对权利 |
| `scripts/validate_master.py` | PASS / 待用户审批 | 6 场景、18 tracks、30 FPS、1080 frames；示例无真实用户批准，保持警告 |
| `scripts/check_frame_engine.mjs` | PASS · 484 检查 | 99 采样帧；验证离线帧规则，不等于官方视频 CLI 渲染 |
| `scripts/lint_audience_copy.py --mode production` | EXPECTED BLOCK | 演示项目状态 `prototype_placeholder`，正式生产正确阻断；未伪造用户批准 |

## 2. 环境限制与未验证项

- 当前执行环境的 Chromium 在启动进程 singleton 时返回 `socket() failed: Operation not permitted (1)`，所以本地 `scripts/visual_qa.py` 无法完成截图。此项必须在可启动浏览器的环境重跑，不能把脚本启动失败算作 PASS。
- 离线 Remotion 适配检查当前因缺少 TypeScript 模块而无法运行；`npm install`、官方 Remotion `compositions/still/render` 与 Hyperframes CLI 没有在此环境完成。不能宣称视频引擎已通过实际渲染。
- `build_visual_pitch.py` 的默认三种视觉语言是**演示性起点**，不能推断陌生行业和新文档自动得到同等美术水平。
- 本包没有接入任何真实用户私密文档或第三方声音服务。商用素材许可、私人内容处理、用户观众稿批准均必须按新任务逐一核实。

## 3. 网页公测展示验证

展示页的在线浏览器功能验收及公网下载联通性，发布前应另行记录在同批次交付报告中。该网页为独立单文件 HTML，不向服务器上传访客填写的任务卡文字。

## 4. 正式用户公测验收建议

新用户提供资料后，按 `CODEX-E2E-PROMPT.md` 完整运行并记录：实际读取材料、差异明显的视觉提案、观众文案批准、HTML 交互、横竖版截图、精准改稿、无障碍/性能、源文件、可复现日志以及未通过项。上述自动测试不得代替这一步。
