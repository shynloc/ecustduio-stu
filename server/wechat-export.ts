import { marked } from "marked";
import sanitize from "sanitize-html";
import * as cheerio from "cheerio";
import { z } from "zod";
import { owned, noteView } from "./explore.js";
import { asset, assetBuffer } from "./domain.js";
import { checkMediaAsset, grantMediaAsset } from "./media-access.js";
import { err, audit } from "./db.js";
const esc = (s: string) =>
  sanitize(s, { allowedTags: [], allowedAttributes: {} });
export function wechatHtml(note: any, palette = "green") {
  const accent =
    palette === "blue" ? "#245b91" : palette === "ink" ? "#292929" : "#23483d";
  const clean = sanitize(marked.parse(note.body, { async: false }) as string, {
    allowedTags: [
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "strong",
      "em",
      "s",
      "ul",
      "ol",
      "li",
      "blockquote",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
      "br",
      "hr",
      "a",
      "img",
      "pre",
      "code",
    ],
    allowedAttributes: { a: ["href"], img: ["src", "alt"] },
    allowedSchemes: ["http", "https"],
    allowedSchemesByTag: { img: [] },
    allowProtocolRelative: false,
  });
  const $ = cheerio.load(
    `<section><h1>${esc(note.title)}</h1>${clean}</section>`,
    null,
    false,
  );
  $("section").attr(
    "style",
    "max-width:677px;margin:auto;padding:16px;color:#303638;background:#fff;font-family:system-ui,sans-serif;font-size:16px;line-height:1.9;word-break:break-word;",
  );
  $("h1").attr(
    "style",
    `font-size:26px;line-height:1.4;color:${accent};margin:24px 0;`,
  );
  $("h2,h3,h4").attr(
    "style",
    `font-size:20px;color:${accent};margin:28px 0 14px;border-left:4px solid ${accent};padding-left:12px;`,
  );
  $("p,li").attr("style", "margin:12px 0;line-height:1.9;");
  $("ul,ol").attr("style", "padding-left:24px;");
  $("blockquote").attr(
    "style",
    `border-left:3px solid ${accent};background:#f4f5f2;padding:12px 16px;margin:16px 0;`,
  );
  $("table").attr(
    "style",
    "width:100%;border-collapse:collapse;font-size:14px;",
  );
  $("th,td").attr(
    "style",
    "border:1px solid #cdd4cf;padding:8px;text-align:left;word-break:break-word;",
  );
  $("a").attr("style", `color:${accent};text-decoration:underline;`);
  $("pre").attr(
    "style",
    "white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f5f2;padding:12px;",
  );
  $("img").each((_, img) => {
    const src = $(img).attr("src") || "";
    if (!/^\/api\/assets\/[a-zA-Z0-9_-]+$/.test(src)) {
      $(img).replaceWith(
        $("<p>").text("【配图待上传】" + ($(img).attr("alt") || "")),
      );
    } else
      $(img).attr(
        "style",
        "max-width:100%;height:auto;display:block;margin:16px auto;",
      );
  });
  if(note.summary)$('h1').after($('<p>').attr('style','color:#68766e;font-size:14px;padding:12px;background:#f4f5f2').text(note.summary));
  if(note.coverAssetId)$('h1').before($('<img>').attr('src','/api/assets/'+note.coverAssetId).attr('style','width:100%;height:auto;display:block'));
  if (note.sources?.length) {
    const refs = $("<section>");
    refs.append($("<h3>").text("参考来源"));
    for (const s of note.sources)
      refs.append(
        $("<p>").text((s.title || "资料") + (s.url ? " · " + s.url : "")),
      );
    $("section").first().append(refs);
  }
  return $.html();
}
export async function registerWechat(app: any) {
  app.post("/api/notes/:id/wechat", async (req: any) => {
    const b = z
        .object({
          revision: z.number().int(),
          summary:z.string().max(300).default(""),
          coverAssetId:z.string().max(100).optional(),
          palette: z.enum(["green", "blue", "ink"]).default("green"),
        })
        .strict()
        .parse(req.body),
      note = noteView(owned("notes", req.params.id, req.user));
    if (note.revision !== b.revision)
      err("VERSION_CONFLICT", "笔记已更新，请重新载入后排版", 409);
    const html = wechatHtml({...note,summary:b.summary,coverAssetId:b.coverAssetId}, b.palette),
      $ = cheerio.load(html, null, false);
    let total = 0,
      count = 0;
    $("img").each((_, img) => {
      const id = ($(img).attr("src") || "").split("/").pop()!;
      checkMediaAsset(id, req.user);
      const a = assetBuffer(id);
      total += a.data.length;
      if (total > 20 * 1024 * 1024)
        err("EXPORT_IMAGE_LIMIT", "配图总量超过20MB，请压缩图片后导出", 422);
      if (
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          a.a.mime,
        )
      )
        err("INVALID_IMAGE", "不支持此图片格式", 422);
      $(img).attr(
        "src",
        `data:${a.a.mime};base64,${a.data.toString("base64")}`,
      );
      count++;
    });
    const offline = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(note.title)}</title><body>${$.html()}</body></html>`;
    const a = asset(
      Buffer.from(offline),
      note.title.slice(0, 80) + "-公众号排版.html",
      "text/html",
      "wechat",
    );
    grantMediaAsset(a.id, req.user.id);
    audit("note.wechat-export", note.id, {
      actor: req.user.id,
      revision: note.revision,
      assetId: a.id,
    });
    return {
      html,
      assetId: a.id,
      name: a.name,
      imageCount: count,
      revision: note.revision,
    };
  });
}
