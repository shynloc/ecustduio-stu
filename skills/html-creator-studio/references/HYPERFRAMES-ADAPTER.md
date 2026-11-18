# Hyperframes Adapter · 交接说明

包内 `examples/hcs-brand-pilot/hyperframes/` 保留 v1.3 的 HTML/GSAP 合成源文件，供 Codex 验证和迭代。

其 `data-composition-id`、`data-width`、`data-height`、clip 数据属性和暂停的 GSAP 时间轴遵循当时的官方示例结构。需要注意：这个适配目前仍以 v1.3 的 DOM 动画为源，**尚未与 v1.4 的纯逐帧 CSS 引擎完成同一套代码的统一**，因此它是可审查的交接分支，不能把它的兼容性当作 Remotion 分支的验证结果。它加载的 GSAP 来自 CDN，离线运行需要按许可要求提供本地依赖。

在有网络的 Codex 环境中，优先参考安装版本的官方 CLI `--help`，按照官方快速入门安装后，运行 check/lint 和 render；如参数变化，以安装版本为准。必须检查真实 MP4 帧率、时长和关键帧。

官方文档：

- https://hyperframes.app/docs/1-startup/2-quickstart
- https://hyperframes.app/docs/6-reference/html-schema
- https://hyperframes.app/docs/1-startup/1-introduction

不要将 Chromium+FFmpeg 的本地视频结果冒称为官方 Hyperframes CLI 产物。
