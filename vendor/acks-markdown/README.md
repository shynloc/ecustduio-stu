# ACKS Markdown themes

Source: https://github.com/shynloc/ACKS-Markdown-Editor
Reference: https://mdeditor.acks.com.cn/
Commit: 9a2d84c87c0f38a5da1409d830986faeb6fbb3f6
License: MIT (see LICENSE).

43 complete catalog entries and 9 recipes are imported. Original CSS and theme definitions are retained here for audit. Generated server styles are in server/wechat-theme-data.ts, public raster signatures in public/wechat-themes. The server inlines CSS, resolves custom properties, and flattens vertical layouts for WeChat. It never fetches resources while rendering.

Rebuild with node scripts/import-wechat-theme-catalog.mjs /path/to/upstream-checkout after reviewing upstream changes.
