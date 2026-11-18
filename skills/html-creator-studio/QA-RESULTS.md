> **v1.5 补充测试请先看 `QA-v1.5.md`**。以下保留为 v1.4 的历史验证报告，不能视为新版 Remotion CLI 已通过。

# HTML Creator Studio v1.4 · Remotion/Video Ready QA

**日期**：2026-10-17  
**交付类型**：可安装 Skill + Visual Master 参考工程 + 真实 React Remotion 适配源码 + Codex 端到端测试指令  
**样例来源**：公开的 HTML Creator Studio 功能介绍；不包含之前的用户私人文档。

## 本地实际验证

| 项目 | 状态 | 实际证据 |
|---|---|---|
| SKILL.md YAML frontmatter | PASS | 根目录有 `name: html-creator-studio`；见安装说明 |
| Visual Master JSON、原文映射和 Stage 对象 | PASS | `qa/contract-validation.json`；6 幕、18 条轨道、18 个唯一 ID、1080 帧、30 FPS |
| 帧驱动算法确定性 | PASS | `node scripts/check_frame_engine.mjs`：484 项，99 帧抽样 |
| Remotion TSX 适配源码结构/模块集成 | PASS | `npm run check:source` 的实际等价 Node 源检查；完整源码已生成 |
| Remotion 组件离线执行（含 `useCurrentFrame()` 模拟） | PASS | `node scripts/check_remotion_adapter.cjs`：80 项；2 个 Composition、8 个指定帧 |
| HTML 浏览器逐幕呈现 | PASS | Chromium Playwright 六幕截图，`qa/browser/` |
| 9:16 独立排版及切换 | PASS | Chromium 1080×1920 截图，非横版中心裁切；逐幕人工查看 |
| 精准点选 | PASS | Chromium 在第 420 帧定位 `S03/director.title` |
| 实际逐帧编码为 MP4（Chromium + FFmpeg） | PASS | `qa/chromium-ffmpeg-smoke.mp4`：1 秒、30 帧、30 FPS、768×432，`verify_video.py` 校验通过 |
| Remotion 官方 CLI 的 `compositions`、`still`、`render` | **待 Codex 实机验证** | 本环境无法访问 npm 注册表：`EAI_AGAIN`，`qa/npm-registry-check.log`；未安装 Remotion 官方 CLI |
| Hyperframes 官方 CLI 视频渲染 | **待验证** | 随包提供 v1.3 试验适配示例，非通用完成品 |
| 新用户附件的完整文档→视频实际体验 | **待 Codex 用户测试** | `CODEX-E2E-PROMPT.md` 中规定用户问询/设计/改稿/渲染/验收全流程 |

## 真实文件及边界

- `examples/hcs-brand-pilot/preview/Video-Ready-v1.4.html` 为已经在 Chromium 中执行的完整离线视觉预览，可跳帧及生成精准修改指令。
- `examples/hcs-brand-pilot/remotion/` 为 `bootstrap_remotion.py` 实际生成的 Remotion React 工程，能够在 npm 可用的机器进行下一阶段验证，**当前尚未证明它能通过官方 CLI 输出 MP4**。
- `examples/hcs-brand-pilot/reference/36s-original-v1.3-Chromium-demo.mp4` 为先前版本 Chromium+FFmpeg 制作的 36 秒参考视频，**不是 Remotion 视频成品**。
- `qa/chromium-ffmpeg-smoke.mp4` 是本轮 v1.4 引擎生成的仅 1 秒视频输出，**不能代替 36 秒 Remotion CLI 验证**。
- 随包代码适用于受控 DOM/SVG/CSS 的确定性动画；复杂 Three.js/WebGL、音频配乐、旁白、未知前端页面的自动无损转换并未声称已实现。
- HCS 样例 `approval.json` 仍为 `user_approved_visual_master=false`；没有擅自将测试视觉当作用户批准。

## Codex 必跑命令

```bash
python scripts/validate_master.py --source examples/hcs-brand-pilot
node scripts/check_frame_engine.mjs examples/hcs-brand-pilot
python scripts/bootstrap_remotion.py --source examples/hcs-brand-pilot --out /tmp/hcs-codex-remotion
cd /tmp/hcs-codex-remotion
npm install
npm run check:source
npm run compositions
npm run still:landscape
npm run still:portrait
npm run render:landscape
npm run render:portrait
```

执行前请用户同意网络安装依赖；禁止把用户的私有文档擅自传到外部云平台。渲染后用 `scripts/verify_video.py` 与关键帧截图核对分辨率、帧率、帧数、场景边界和设计一致性。

## 对验收结果的表述规范

- 数据与 React 组件离线检查通过，不代表 Remotion 官方 CLI 可渲染。
- 浏览器 HTML 逐帧可生成 MP4，不代表 Hyperframes 或 Remotion 的渲染能力已经验证。
- 只要 Codex 在实际 npm 环境中完成 `still`、`render` 并核对生成文件，才能升级 Remotion 的状态为「官方 CLI 渲染验证通过」。
