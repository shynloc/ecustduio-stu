// Developer-only thumbnail build; installed workstations do not need a browser for themes.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import * as cheerio from "cheerio";
import { wechatThemeCatalog } from "../shared/wechat-themes.js";
import { signatureBytes } from "../server/wechat-theme-render.js";
import { testBrowser } from "../tests/browser-helper.js";
mkdirSync("test-results", { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  resolve("test-results/theme-preview-build-"),
);
const { wechatHtml } = await import("../server/wechat-export.js");
const browser = await testBrowser(),
  page = await browser.newPage({
    viewport: { width: 375, height: 610 },
    deviceScaleFactor: 1,
  });
const out = resolve("public/wechat-themes");
mkdirSync(out, { recursive: true });
try {
  for (const t of wechatThemeCatalog) {
    const html = wechatHtml(
      {
        title: "让技术有用，也有温度",
        body: "## 主题标题\n\n> 内容摘要\n\n把资料整理成清晰的表达，让知识成为作品。",
      },
      t.id as any,
    );
    const $ = cheerio.load(html, null, false);
    $("img").each((_, el) => {
      const src = $(el).attr("src") || "";
      if (src.startsWith("ecustudio-theme:"))
        $(el).attr(
          "src",
          "data:image/png;base64," +
            signatureBytes(src.slice(16))!.toString("base64"),
        );
    });
    await page.setContent(
      '<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><body style="margin:0;background:' +
        t.bg +
        '">' +
        $.html() +
        "</body></html>",
    );
    await page.screenshot({ path: join(out, t.id + "-preview.png") });
  }
  console.log("Built " + wechatThemeCatalog.length + " theme thumbnails.");
} finally {
  await browser.close();
}
