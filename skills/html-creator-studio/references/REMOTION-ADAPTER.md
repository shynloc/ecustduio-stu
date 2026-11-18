# Remotion Adapter · 实现与验收（v1.4）

## 技术实现

这是一个真正的 Remotion React Composition，源文件见 `templates/remotion/src/`：

- `src/index.ts` 通过 `registerRoot()` 注册 Composition。
- `src/Root.tsx` 注册 `HCS-Landscape` 和 `HCS-Portrait`。样例使用 1920×1080、1080×1920、30fps、1080 帧。
- `src/VideoMaster.tsx` 以 `useCurrentFrame()` 和 `useVideoConfig()` 获得准确帧与画布信息。
- `src/generated/master.ts` 从真实视觉母版 JSON 和 HTML 生成，不包含独立手写的“第二份文案”。
- `src/generated/frame-styles.mjs` 与 HTML 预览共用，按 `timeline.json` 的关键帧计算 DOM/SVG 样式；不使用 `iframe` 播放视频，不以录屏代替 Remotion 动画。
- `src/generated/stage.css` 为普通静态 CSS；`portrait.css` 为独立的 9:16 布局规则。

**注意**：`dangerouslySetInnerHTML` 只用于已经由 Skill 创建并经校验的可信 Stage HTML。不得直接嵌入未经清理的用户网页或 PDF 提取 HTML；应转义文案并拒绝脚本、事件处理属性及危险 URL。`validate_master.py` 是基础静态检查，不等于完整的 HTML 安全沙箱。

## 首次创建项目

假设 Codex 已经获得安装权限、机器可连接 npm，Node.js 可用：

```bash
# 在本 Skill 根目录
python scripts/validate_master.py --source examples/hcs-brand-pilot
python scripts/bootstrap_remotion.py \
  --source examples/hcs-brand-pilot \
  --out /tmp/hcs-remotion-test
cd /tmp/hcs-remotion-test
npm install
npm run check:source
npm run compositions
npm run studio
npm run still:landscape
npm run still:portrait
npm run render:landscape
npm run render:portrait
```

Remotion 样例锁定 `remotion` 和 `@remotion/cli` 为相同的 **4.0.536** 版本，避免版本漂移；这份版本依据 2026-10 官方文档，但仍应由 Codex 在真实环境确认其注册表可用、Node/浏览器/字体依赖满足要求。必要时同时升级两个包至同一版本，记录变更并重新运行验收。

正常时可以得到：

```text
out/landscape.png
out/portrait.png
out/landscape.mp4
out/portrait.mp4
```

**必须实际打开这四份媒体并比对构图**。`npm install` 或 TSX 转译成功都不等于真实渲染成功。

## 关键帧检查

至少在以下帧比较 HTML 预览与 Remotion Still：60、240、420、600、780、960，另外检查 0、场景交界帧、最后一帧 1079。

```bash
npx remotion still src/index.ts HCS-Landscape out/S03-f420.png --frame=420
npx remotion still src/index.ts HCS-Portrait out/portrait-S03-f420.png --frame=420
```

要求：文字来源一致、稳定元素 ID、字体和位置合理、场景切换与帧吻合、无越界与高亮闪烁。两种引擎的抗锯齿差异允许存在，但明显构图偏差不允许当作通过。

## HTML 修改后如何同步

1. 对 `visual-master/*.json` 和 `stage/*.html,css` 做最小范围修改，保留快照。
2. `validate_master.py` 和 `check_frame_engine.mjs` 检查。
3. 重建 HTML 预览 `build_preview.py`。
4. 用新的空目录重新执行 `bootstrap_remotion.py`（生成目录是构建产物，不要在里面做唯一的编辑）。
5. 执行官方 `remotion still` / `render`，在同一帧比对修改前后；修改目标以外应保持一致。

## 错误处理

- npm 不通：检查网络和代理，保留合法源码、不要假称 CLI 成功。
- package 版本冲突：保持所有 `@remotion/*` 与 `remotion` **同版本**。
- 中文变成方块：安装/嵌入有授权的 CJK 字体、在 Remotion 浏览器环境检查，不能私下分发系统字体文件。
- 帧出现抖动：定位 Date.now / random / CSS animation / requestAnimationFrame / 不受控异步数据，全部改为可寻址帧状态。
- 视频未按原文：回到 `content.json` 与 `source-map.json`，避免靠视频修饰去改变事实。
- 竖版裁切：修改 `portrait.css` 的构图、分层布局，不靠单一 CSS `scale` 或 `object-fit:cover` 冒充重排。
- 复杂 3D：由 Codex 根据最新官方 Remotion 能力选择 frame-driven Canvas/Three 渲染、稳定 PNG 序列或视频层，并记录可编辑性与硬件影响。

## 官方参考

- https://www.remotion.dev/docs/composition
- https://www.remotion.dev/docs/idea
- https://www.remotion.dev/docs/render
- https://www.remotion.dev/docs/options/props
- https://www.remotion.dev/docs/options/frame
