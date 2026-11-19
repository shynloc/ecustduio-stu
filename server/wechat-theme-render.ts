import juice from "juice";
import * as cheerio from "cheerio";
import {
  themeDefinitions,
  themeCss,
  themeSignaturePng,
} from "./wechat-theme-data.js";
import { wechatRecipes, type WechatFormat } from "../shared/wechat-themes.js";

export function signatureBytes(id: string) {
  return Object.hasOwn(themeSignaturePng, id)
    ? Buffer.from(themeSignaturePng[id], "base64")
    : undefined;
}
const tokenKeys: Record<string, string> = {
  accent: "accent",
  accent2: "accent2",
  emphasis: "emphasis",
  text: "text",
  heading: "heading",
  bg: "bg",
  "section-heading": "sectionHeading",
  "title-text": "titleText",
  "title-bg": "titleBg",
  muted: "muted",
  "mark-text": "markText",
  "body-size": "bodySize",
  "line-height": "lineHeight",
  "letter-spacing": "letterSpacing",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  radius: "radius",
  "hr-color": "hrColor",
  link: "link",
  "mark-bg": "markBg",
  "th-bg": "thBg",
  "th-text": "thText",
  zebra: "zebra",
  border: "border",
  "code-bg": "codeBg",
  "code-text": "codeText",
  "codeblock-bg": "codeBlockBg",
  "codeblock-text": "codeBlockText",
  "tk-kw": "tkKw",
  "tk-str": "tkStr",
  "tk-cmt": "tkCmt",
  "tk-num": "tkNum",
  "tk-tag": "tkTag",
  "tk-punc": "tkPunc",
  "quote-border": "quoteBorder",
  "quote-bg": "quoteBg",
  "quote-text": "quoteText",
  "body-font": "fontFamily",
  "heading-font": "headingFamily",
};
const pixelKeys = new Set([
  "bodySize",
  "letterSpacing",
  "h1",
  "h2",
  "h3",
  "h4",
  "radius",
]);
const css = themeCss.replace(/\.md-signature svg/g, ".md-signature img");
const safeProperties =
  /^(color|background-color|font-(size|family|weight|style)|line-height|letter-spacing|text-(align|indent|decoration(?:-line|-color|-style)?|underline-offset|emphasis-style|emphasis-position)|-webkit-text-emphasis-(style|position)|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|border(?:-(?:top|right|bottom|left))?(?:-(?:width|style|color))?|border-radius|table-layout|border-collapse|border-spacing|width|max-width|min-width|height|max-height|box-sizing|display|white-space|word-break|overflow-wrap|list-style(?:-type|-position)?|vertical-align|tab-size)$/;

/** Uses the complete upstream cascade, then emits self-contained WeChat-safe markup. */
export function renderArticleTheme(
  fragment: string,
  id: string,
  format: WechatFormat = {},
) {
  const base = themeDefinitions[id];
  if (!base) throw new Error("Unknown article theme");
  const t = { ...base, ...wechatRecipes[format.recipe || "default"].overrides };
  if (format.size !== undefined) t.bodySize = format.size;
  if (format.lineHeight !== undefined) t.lineHeight = format.lineHeight;
  if (format.indent !== undefined) t.paraIndent = format.indent;
  const $ = cheerio.load(fragment, null, false),
    root = $("section").first();
  const vars = Object.entries(tokenKeys)
    .map(
      ([key, value]) =>
        "--" +
        key +
        ":" +
        String(t[value]).replace(/"/g, "'") +
        (pixelKeys.has(value) ? "px" : ""),
    )
    .join(";");
  root
    .attr("class", t.milestoneKey ? "ms-doc" : "md-doc")
    .attr("data-revision", "2")
    .attr("data-profile", t.editorialProfile)
    .attr("style", vars);
  if (t.milestoneKey)
    root.attr("data-milestone", t.milestoneKey + "-" + t.milestoneVariant);
  if (t.milestoneKey === "cnvertical")
    root.attr("data-export-layout", "horizontal");
  const attrs: Record<string, string> = {
    h1: "h1Style",
    hm: "headingMark",
    q: "quoteStyle",
    t: "tableStyle",
    d: "dividerStyle",
    l: "listMark",
    shadow: "shadow",
    title: "titleStyle",
    bgmode: "bgMode",
    layout: "layout",
    code: "codeFrame",
    table: "tableShape",
    list: "listGlyph",
    ci: "codeInline",
    h3: "h3Mark",
    thead: "thead",
  };
  for (const [attr, key] of Object.entries(attrs))
    root.attr("data-" + attr, String(t[key] || "none"));
  root.attr("data-indent", t.paraIndent ? "1" : "0");
  for (const [tag, cls] of Object.entries({
    p: "md-p",
    blockquote: "md-bq",
    table: "md-table",
    hr: "md-hr",
    img: "md-img",
    pre: "md-pre",
  }))
    $(tag).addClass(cls);
  $("code").each((_, el) => {
    $(el).addClass($(el).parent().is("pre") ? "md-code" : "md-ci");
  });
  if (root.children().length < 10) root.attr("data-short-article", "true");
  if ($("h1").first().text().length > 24) root.attr("data-long-title", "true");
  if (t.lead) root.children("p").first().addClass("md-lead");
  if (t.h2num)
    $("h2").each((i, el) => {
      $(el).prepend($('<span class="md-num">').text(String(i + 1)));
    });
  if (format.decorations !== false && signatureBytes(id)) {
    const ornament = $('<section class="md-signature">').append(
      $("<img>")
        .attr("src", "ecustudio-theme:" + id)
        .attr("alt", "")
        .attr("width", "180")
        .attr("height", "60"),
    );
    $("h1").first().after(ornament);
  }
  // Explicit declarations make the preview, HTML file and pasted body share one layout.
  const compatibility = `.md-doc,.ms-doc{max-width:677px;width:auto;box-sizing:border-box;overflow-wrap:anywhere}.md-doc pre,.ms-doc pre,.md-doc pre code,.ms-doc pre code{white-space:pre-wrap!important;overflow-wrap:anywhere!important;word-break:break-word!important;text-indent:0!important}.md-doc table,.ms-doc table{width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed}.md-doc th,.ms-doc th,.md-doc td,.ms-doc td{white-space:normal!important;word-break:break-word!important;overflow-wrap:anywhere!important}.md-doc img,.ms-doc img{max-width:100%;height:auto}.md-doc .md-signature img,.ms-doc .md-signature img{border:0;transform:none;max-width:100%;height:auto}.md-doc a,.ms-doc a{overflow-wrap:anywhere}.md-doc .ecu-summary,.ms-doc .ecu-summary{font-size:14px;color:var(--muted);text-indent:0}.md-doc .task-mark,.ms-doc .task-mark{font-family:sans-serif}.md-doc>p,.ms-doc>p{${format.size !== undefined ? "font-size:" + format.size + "px;" : ""}${format.lineHeight !== undefined ? "line-height:" + format.lineHeight + ";" : ""}${format.indent !== undefined ? "text-indent:" + (format.indent ? "2em" : "0") + ";" : ""}}`;
  const inlined = juice($.html(), {
    extraCss: css + "\n" + compatibility,
    decodeStyleAttributes: true,
    resolveCSSVariables: true,
    inlinePseudoElements: true,
    preserveImportant: false,
    preserveMediaQueries: false,
    preserveFontFaces: false,
    preserveKeyFrames: false,
    preservePseudos: false,
    insertPreservedExtraCss: false,
    applyWidthAttributes: false,
    applyHeightAttributes: false,
    applyAttributesTableElements: false,
  });
  const result = cheerio.load(inlined, null, false);
  result("style,script").remove();
  result("*").each((_, el) => {
    const node = result(el),
      value = node.attr("style") || "";
    const declarations = value
      .split(";")
      .map((p) =>
        p
          .trim()
          .replace(
            /^background:\s*(#[\da-f]+|rgba?\([^)]+\)|transparent|none)$/i,
            (_, color) =>
              "background-color:" + (color === "none" ? "transparent" : color),
          ),
      )
      .filter((p) => {
        const at = p.indexOf(":");
        return (
          at > 0 &&
          safeProperties.test(p.slice(0, at).trim()) &&
          !/url\s*\(|var\s*\(|expression\s*\(/i.test(p)
        );
      });
    if (declarations.length) node.attr("style", declarations.join(";"));
    else node.removeAttr("style");
    for (const key of Object.keys((el as any).attribs || {}))
      if (key === "class" || key.startsWith("data-")) node.removeAttr(key);
  });
  return result.html();
}
