# Remotion Adapter | HTML Creator Studio 1.4

This is a **real React / Remotion Composition** driven by `useCurrentFrame()`.
It renders the HTML visual master's DOM and static CSS as React markup and computes
its per-frame animated CSS from the **same `frame-styles.mjs`** used by the offline
HTML preview. No iframe/MP4 embedding or wall-clock recording.

## First use

```bash
npm install
npm run check:source
npm run compositions
npm run studio
npm run still:landscape
npm run still:portrait
npm run render:landscape
npm run render:portrait
```

If Chrome Headless Shell downloads are blocked, see current official Remotion
browser-executable flags and set the browser executable in your environment.

- `HCS-Landscape`: 1920×1080, 30fps, 1080 frames (this sample)
- `HCS-Portrait`: 1080×1920, with hand-authored reflow in `portrait.css` (only registered when source `portrait.css` exists)

Use `python ../../scripts/bootstrap_remotion.py` from the installed Skill root
to regenerate this adapter for another visual master. Keep all `@remotion/*`
packages on the exact same version; the included example pins 4.0.536.

## Precise edits

Edit visual-master JSON and stage files in the **source master**, not the
generated copies inside `src/generated`. Re-run `bootstrap_remotion.py`
and the HTML preview builder. Seek to the same frame in both renderers and
compare stills before production rendering.

## Known boundaries

Raw WebGL or independent browser interactions do not automatically translate
into Remotion. Convert them into deterministic React/Canvas components or
pre-render with disclosed loss of editability. This starter focuses on
DOM / SVG / CSS visuals and frame-keyframed animations.

Do not claim CLI render success until the actual `remotion` package is installed
and the commands have been executed on the target machine.
