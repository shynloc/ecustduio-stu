# Video Ready · 从文档到可控视觉母版，再到视频

## 为什么不要直接从文档跳到 MP4？

文档的事实与逻辑、视频的旁白、页面的视觉构图，以及具体的视频引擎是四种不同的资产。把它们混在一次脚本生成里，用户就会难以决定哪里需要修改。

HCS 推荐五步闭环：

1. **提取事实**：读取每一页与嵌入图/表，建立 `content.json`，明确来源定位、核实状态、授权范围。
2. **创意共创**：确认受众、用途、保留程度、艺术风格、配色、动效强度、3D 比例；方案不明确时给 2–3 个可理解的选择。
3. **分镜设计**：按时间标明镜头/场景与重点信息；视频时长不足时列出删减清单，让用户选择。
4. **Visual Master**：`visual-master/*.json` + `stage/*.html,css` + 可寻址动画，浏览器逐帧预览，利用 `scene/element/frame` 精准改稿。
5. **交给视频引擎**：锁定设计后生成 Hyperframes 或 Remotion 工程，运行真实引擎的 still/MP4 验证。

**不要提前宣布视觉母版锁定。** `approval.json` 只有用户明确确认之后才能填成批准状态；批准设计不等于批准公开发布。没有授权不得外传附件或调用云端素材处理服务。

**v1.5 硬性前置关口：** 使用 `references/designresources.md` 和 `templates/DESIGN-DIRECTION.md` 建立艺术方向；将**观众真正看到或听到的**标题、旁白、字幕独立编成 `visual-master/copy-draft.md`。遵守 `references/AUDIENCE-COPY.md`，先提交用户确认。用户批准该具体版本后才能正式植入 Stage/Remotion。字幕不可未经审稿擅自改写旁白、把“原文/原链接/附件说”当作话术。生产时运行 `scripts/lint_audience_copy.py --source <project> --mode production`；技术占位样片可以以 `--mode draft` 生成并显式标注未审批。


## 用户沟通节点

- 节点 A：目标、受众、保留重点与敏感信息。
- 节点 B：配色、艺术方向、动效、3D、横竖版比例与视频时长。
- 节点 C：完整分镜与**观众成品文案（标题/口播/字幕）独立确认**；用户若只批准设计未批文案，不进入正式实施。
- 节点 D：视频合成前确认目标引擎、声音/字幕配置和渲染授权。

用户给了完整简报或说“自由发挥直接做”时，可以减少视觉微决策询问，**但正式文案仍必须提交审核等待明确批准**。默认建议无声 30fps、16:9，30–45s 只是建议，不替代用户确认。

## 动画设计要求

- 以 `frame` 为唯一决定画面的时间状态，遵循 `timeSeconds = frame/fps`。
- `requestAnimationFrame` 只能驱动预览播放进度，不决定画面状态；视频渲染任何一帧不得依赖前一帧。
- `animation.startFrame/endFrame` 及 from/to/easing 必须被 source code 使用；不会被使用的元数据应删除，避免“假共享”。
- DOM/SVG/CSS 可复用 `shared/frame-styles.mjs`；WebGL/物理模拟/实时音频分析必须设计确定性的 frame adapter。必要时允许提前烘焙素材并注明难以编辑的部分。
- 每个可定位对象用稳定 `data-review-id`，匹配 `timeline.tracks[].element`。
- 16:9 和 9:16 是两个构图约束；不要直接裁切关键文字，不要让字幕区压住主题。
- 默认首屏/每场结尾清楚可读，不为视觉效果把核心文案停留时间做得太短。

## 推荐资产结构

```text
<project>/
  visual-master/
    content.json
    design-tokens.json
    storyboard.json
    timeline.json
    source-map.json
    approval.json
  stage/
    stage-markup.html
    stage.css
    portrait.css           # 可选，但输出竖版时应具备重排规则
  preview/
    video-master.html
  remotion/
    src/index.ts
    src/Root.tsx
    src/VideoMaster.tsx
    src/generated/*
    package.json
```

## 一键脚本（在 Skill 根目录执行）

```bash
python scripts/validate_master.py --source examples/hcs-brand-pilot
node scripts/check_frame_engine.mjs examples/hcs-brand-pilot
python scripts/build_preview.py --source examples/hcs-brand-pilot --out /tmp/hcs-preview.html
python scripts/bootstrap_remotion.py --source examples/hcs-brand-pilot --out /tmp/hcs-remotion
node scripts/check_remotion_adapter.cjs /tmp/hcs-remotion
```

不要把案例的 `hcs-brand.preset` 用在新用户文档上；新项目需要独立创作内容、场景与艺术方向。未有真实 CLI 视频成品时，在报告中将其标记为“引擎待验证”。


## v1.6 补充：先看的视频构图与声音

在 Video Ready / Dual 中必须优先完成 `references/VISUAL-PITCH.md` 的真实可观看方案，16:9 和 9:16 采用各自构图；若有声音/旁白，按 `references/AUDIO-DIRECTION.md` 先提交已批准的口播稿、句群与时间码，再安排镜头时长。运行 `scripts/visual_qa.py` 捕获真实 HTML 关键帧；Remotion `still` / `render` 仍需另行官方引擎实测。
