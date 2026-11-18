# Hyperframes Adapter（待官方 CLI 实测）

这个文件夹可以独立移交给视频 Agent。`index.html` 将共享视觉舞台接入 Hyperframes Composition，根 ID 为 `hcs-video-ready`。源文件依赖已经复制到 `assets/`，但 **GSAP 使用 CDN，要求网络**；如需要彻底离线，请将来自合法包安装的 GSAP 文件放在 `assets/` 并替换 script src。

官方规范参考：<https://hyperframes.app/docs/6-reference/html-schema>

```bash
node --version   # 22 或更高
ffmpeg -version
npx hyperframes check .
npx hyperframes render -o HCS-Hyperframes.mp4
```

**当前环境状态：未验证。** 无法连接 npm Registry；请在有网络的测试机上运行上面的命令并记录 CLI 版本、校验结果与成片截图。若出现 runtime / CSP / 资源路径问题，不得将其称为已经通过。
