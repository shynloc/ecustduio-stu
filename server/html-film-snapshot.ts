import { load } from "cheerio";
import { fetchPublic } from "./security.js";
import { asset, assetBuffer } from "./domain.js";
import { checkMediaAsset, grantMediaAsset } from "./media-access.js";
import { err } from "./db.js";

export type HtmlBundle = {
  url: string;
  resources: { url: string; finalUrl: string; id: string; type: string }[];
};
export async function snapshotWebFilm(
  url: string,
  uid: string,
  signal: AbortSignal,
  progress: any,
  read = fetchPublic,
) {
  const page = await read(url, signal);
  if (!/text\/html|application\/xhtml\+xml/i.test(page.type))
    err("NOT_HTML", "该地址没有返回 HTML 网页。", 422);
  let html: string;
  try {
    html = new TextDecoder("utf-8", { fatal: true }).decode(page.buffer);
  } catch {
    err("HTML_ENCODING", "请将网页另存为 UTF-8 HTML 后导入。", 422);
  }
  const $ = load(html),
    base = new URL($("base[href]").first().attr("href") || page.url, page.url)
      .href;
  const pending = new Set<string>(),
    resources: HtmlBundle["resources"] = [];
  function add(value: string | undefined, parent: string) {
    if (!value || /^(?:#|data:|blob:)/i.test(value.trim())) return;
    const u = new URL(value, parent);
    u.hash = "";
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
      err("HTML_RESOURCE", "网页依赖不支持的资源地址。", 422);
    pending.add(u.href);
    if (pending.size > 64)
      err(
        "HTML_RESOURCE_LIMIT",
        "网页资源超过 64 项，请导出精简的单文件 HTML。",
        422,
      );
  }
  function css(text: string, parent: string) {
    for (const m of text.matchAll(
      /url\(\s*["']?([^)'"]+)["']?\s*\)|@import\s+["']([^"']+)["']/gi,
    ))
      add((m[1] || m[2]).trim(), parent);
  }
  $("link[rel~=stylesheet]").each((_, e) => add($(e).attr("href"), base));
  $("script[src],img[src],source[src],video[poster]").each((_, e) =>
    add($(e).attr("src") || $(e).attr("poster"), base),
  );
  $("[srcset]").each((_, e) => {
    const list = $(e).attr("srcset") || "";
    if (!list.startsWith("data:"))
      for (const src of list.split(",")) add(src.trim().split(/\s+/)[0], base);
  });
  $("style,[style]").each((_, e) =>
    css(e.tagName === "style" ? $(e).text() : $(e).attr("style") || "", base),
  );
  let total = page.buffer.length;
  for (const href of pending) {
    signal.throwIfAborted();
    progress("snapshot", {
      message:
        "正在保存网页资源 " + (resources.length + 1) + " / " + pending.size,
    });
    const r = await read(
      href,
      signal,
      Math.min(8 * 1048576, 16 * 1048576 - total),
    );
    total += r.buffer.length;
    if (total > 16 * 1048576)
      err("HTML_RESOURCE_LIMIT", "网页与资源超过 16 MB。", 422);
    const type = r.type.split(";")[0].toLowerCase();
    if (type === "text/css") css(r.buffer.toString("utf8"), r.url);
    const f = asset(
      r.buffer,
      "网页资源.bin",
      "application/octet-stream",
      "media",
    );
    grantMediaAsset(f.id, uid);
    resources.push({ url: href, finalUrl: r.url, id: f.id, type });
  }
  const name =
      ($("title").first().text().trim() || "网页").slice(0, 80) + ".html",
    f = asset(page.buffer, name, "text/html", "media");
  grantMediaAsset(f.id, uid);
  return { file: f, name, bundle: { url: page.url, resources } };
}
export function filmResources(bundle: HtmlBundle | undefined, user: any) {
  const resources = new Map<
    string,
    { bytes: Buffer; type: string; finalUrl: string }
  >();
  for (const r of bundle?.resources || []) {
    checkMediaAsset(r.id, user);
    const item = {
      bytes: assetBuffer(r.id).data,
      type: r.type,
      finalUrl: r.finalUrl,
    };
    resources.set(r.url, item);
    resources.set(r.finalUrl, item);
  }
  return resources;
}
