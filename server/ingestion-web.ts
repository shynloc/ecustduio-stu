import * as cheerio from "cheerio";
import { err, settings } from "./db.js";
import { fetchPublic, publicUrl } from "./security.js";
import { getSecret } from "./secrets.js";
import { marked } from "marked";
export function webContent(raw: string, base = "https://example.invalid/") {
  const $ = cheerio.load(raw);
  const title =
    $("#activity-name,h1").first().text().trim() || $("title").text().trim();
  const published =
    $(
      'meta[property="article:published_time"],meta[name="PubDate"],meta[name="publishdate"]',
    )
      .first()
      .attr("content")
      ?.slice(0, 10) || null;
  $("script,style,nav,header,footer,iframe,form,noscript").remove();
  let body = $(
    "#js_content,.TRS_Editor,#zoom,#content,.article-content,.article_content,article,.content",
  )
    .filter(
      (_i, e) => $(e).text().trim().length > 30 || $(e).find("img").length > 0,
    )
    .first();
  if (!body.length) body = $("body");
  if (
    body.text().length < 1500 &&
    /环境异常|请完成验证|访问过于频繁|该内容无法查看|链接已过期|内容已被发布者删除/.test(
      body.text(),
    ) &&
    !$("#js_content").text().trim()
  )
    err(
      "SOURCE_ACCESS_RESTRICTED",
      "原站要求验证或内容已失效。请打开原文后粘贴正文，或导入保存的PDF/截图",
      422,
    );
  const images: any[] = [];
  body.find("img").each((_i, e) => {
    const el = $(e),
      src =
        el.attr("data-src") ||
        el.attr("src") ||
        el.attr("srcset")?.split(/[ ,]/)[0];
    if (!src) return;
    try {
      const url = new URL(src, base);
      if (!["http:", "https:"].includes(url.protocol)) return;
      const image = {
        index: images.length + 1,
        url: url.href,
        alt: el.attr("alt") || "",
      };
      images.push(image);
      el.replaceWith("\n[图片 " + image.index + "] " + image.alt + "\n");
    } catch {}
  });
  body.find("table").each((_i, e) => {
    const rows = $(e)
      .find("tr")
      .map((_n, tr) =>
        $(tr)
          .find("th,td")
          .map((_c, td) => $(td).text().trim())
          .get()
          .join(" | "),
      )
      .get();
    $(e).replaceWith("\n" + rows.join("\n") + "\n");
  });
  body.find("p,div,br,li,tr,h1,h2,h3,section").after("\n");
  const text = body
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
  if (text.length < 10 && !images.length)
    err("SOURCE_EMPTY", "没有获取到正文，可粘贴文字或上传页面PDF/截图", 422);
  return { title, published, text, images, warnings: [] as string[] };
}
export async function readWebSource(url: string, signal?: AbortSignal) {
  await publicUrl(url);
  try {
    const response = await fetchPublic(url, signal);
    if (!response.type.includes("pdf"))
      webContent(response.buffer.toString("utf8"), response.url);
    return { ...response, method: "direct" };
  } catch (e: any) {
    if (
      ![
        "SOURCE_UNAVAILABLE",
        "SOURCE_ACCESS_RESTRICTED",
        "SOURCE_EMPTY",
      ].includes(e.code) ||
      !settings().allowExternalAI
    )
      throw e;
    const key = await getSecret("deepseek");
    if (!key) throw e;
    const r = await fetch("https://api.deepseek.com/v1/tools/fetch", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
      redirect: "error",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000),
    });
    if (!r.ok) throw e;
    const body: any = await r.json();
    if (
      typeof body.content !== "string" ||
      body.content.length < 30 ||
      body.content.length > 500000 ||
      /环境异常|请完成验证/.test(body.content.slice(0, 300))
    )
      throw e;
    return {
      url,
      buffer: Buffer.from(
        marked.parse(body.content, { async: false }) as string,
      ),
      type: "text/html",
      method: "deepseek-fetch",
      title: String(body.title || "").slice(0, 300),
    };
  }
}
