# Visual Master Data Contract · v1.4

## 基础文件

`content.json`：内容、源文档出处、语言、敏感信息标记、场景引用。`source-map.json`：被重写或概括的文本追溯回原文件的路径与章节/页码，分清“原文事实”和“AI 提案”。

`design-tokens.json`：viewport.width/height/fps/durationFrames、颜色、字体、运动语言、预设规则、用户批准状态。

`storyboard.json`：每场 `sceneId`、标题、设计目标、`startFrame/endFrame`、静态与动态 `elementIds`、构图、潜在失真。

`timeline.json`：`fps`、`durationFrames`、`scenes[]`（id、startFrame、endFrame、visualMode）、`tracks[]`（scene、element、animation）。

`approval.json`：`status`、`user_approved_visual_master`、用户同意的版本与授权边界；仅用户明确确认时才能标记通过。

## 帧与字段

- 帧号从 0 开始，最后一帧为 `durationFrames-1`。
- `scenes` 不能出现未说明的间隙或重叠，其 `[startFrame,endFrame]` 是闭区间。
- 动画 `from` 和 `to` 使用数值属性：`opacity`、`translateX`、`translateY`、`rotateDeg`、`scale`、`progress`、`strokeDashProgress`。不支持的动画字段不要默默忽略，要提示扩展适配器。
- 缓动：`linear`、`easeOutCubic`、`easeInCubic`、`easeInOut`。
- `element` 要唯一映射到 Stage DOM 的 `data-review-id`，便于精准改稿。
- `startFrame/endFrame/easing` 应落实为实际画面变化；与代码不一致的数据要修正。
- 所有动态变量必须可从输入帧算出，不能依赖隐藏的播放历史或未固定随机种子。

## 接口层次

| 层 | 权威源 | 消费端 |
|---|---|---|
| 文案、数值、来源 | `content.json`、`source-map.json` | HTML、视频、讲解字幕 |
| 艺术样式 | `design-tokens.json`、Stage CSS | HTML、Remotion、Hyperframes |
| 分镜与时长 | `storyboard.json`、`timeline.json` | 播放器、逐帧引擎、交接 |
| 精准改稿 | `sceneId / elementId / frame / profile` | Code Agent 最小修改、复测 |
| 授权 | `approval.json` | 对外发布/调用第三方的执行门槛 |

`shared/frame-styles.mjs` 与 Remotion 工程生成器组成 v1.4 的最小可执行适配。Stage DOM/CSS 需要由设计 Agent 为每个新文档创作；仅复制 Pilot Stage 不能产生新的主题网站。

## 内容槽位（推荐）

用户新项目应在 Stage 使用 `{{S01.headline}}`、`{{S02.headline}}`、`{{tagline}}` 等槽位。`scripts/resolve_content.py` 会从 `content.json` 映射并进行 HTML 转义，再同步构建 HTML / Remotion。未知槽位会报错，不能自动凭空补文案。样例 v1.3 Stage 是保留的人工定制文案，并未全部槽位化。

只有提供了 `stage/portrait.css`，Remotion 模板才注册 `HCS-Portrait`，防止把“未制作竖版”冒充可用竖版。
