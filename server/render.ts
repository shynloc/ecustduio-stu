import {paginateText} from "../shared/visual.js";
import {conversationWord} from "./conversation-word.js";
import {marked} from "marked";
import sanitize from "sanitize-html";
import { readFileSync, writeFileSync } from "node:fs";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ExternalHyperlink,
} from "docx";
import PptxGenJS from "pptxgenjs";
import { writeVisualPresentation } from "./visual-presentation.js";
import { masterHtml } from "./visual-document.js";
import { chromium } from "playwright";
const esc = (s: any) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function conversationHtml(markdown:string) {
  return sanitize(marked.parse(markdown,{async:false}) as string,{
    allowedTags:["p","h1","h2","h3","h4","h5","h6","ul","ol","li","blockquote","pre","code","strong","em","del","hr","br","table","thead","tbody","tr","th","td","a"],
    allowedAttributes:{a:["href"]},allowedSchemes:["https","http"],allowProtocolRelative:false
  });
}
export function reportHtml(p: any) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.title)}</title><style>body{max-width:850px;margin:40px auto;padding:0 28px;color:#242821;font:16px/1.8 'Microsoft YaHei',sans-serif}header{border-bottom:2px solid #23483d;padding-bottom:18px}h1{font-size:30px;line-height:1.4}h2{font-size:21px;color:#23483d}p{white-space:pre-wrap}section{margin:28px 0}.meta,small{color:#62675f;font-size:13px}.tag{color:#9b571f}a{color:#23483d;overflow-wrap:anywhere}aside{padding:14px;background:#f6f5f1}@page{size:A4;margin:18mm 15mm} @media print{body{margin:0;max-width:none;padding:0}h2{break-after:avoid}section{break-inside:auto}}</style></head><body><header><div class="meta">EcuStudio教创工作台 · ${esc(p.mode === "release" ? "已审核版本" : "研究草稿 · 不作为发布依据")}</div><h1>${esc(p.title)}</h1><div class="meta">${esc(p.meta)}</div></header>${p.chatMarkdown ? conversationHtml(p.chatMarkdown) : p.blocks.map((b: any) => `<section><h2>${esc(b.title)}</h2><p>${esc(b.text)}</p>${b.notes ? `<aside>讲述／画面提示：${esc(b.notes)}</aside>` : ""}${b.scene ? `<p>场景：${esc(b.scene)}<br>机位：${esc(b.camera)}<br>提示词：${esc(b.prompt)}</p>` : ""}${b.claimIds?.length ? `<small>事实引用：${esc(b.claimIds.join("，"))}</small>` : ""}</section>`).join("")}${p.unverified?.length ? `<aside><h2>待核实</h2>${p.unverified.map((s: string) => `<p>${esc(s)}</p>`).join("")}</aside>` : ""}<h2>信息来源</h2>${p.sources.map((s: any, i: number) => `<p>${i + 1}. ${esc(s.title)} · ${esc(s.publisher)} · ${esc(s.published || "日期待核实")}<br>${/^https?:/.test(s.url) ? `<a href="${esc(s.url)}">${esc(s.url)}</a>` : "用户提供资料"}</p>`).join("")}<footer class="meta">版本 ${esc(p.versionId)} · 生成于 ${esc(p.generatedAt)} · 教育研究辅助工具，具体政策以主管部门原文为准。</footer></body></html>`;
}
function chunks(text: string, size = 480) {
  const result = [];
  let remaining = text;
  while (remaining.length > size) {
    let cut = remaining.lastIndexOf("\n", size);
    if (cut < size / 2) cut = size;
    result.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  result.push(remaining);
  return result;
}
export async function render(p: any, format: string, out: string) {
  const md =
    `# ${p.title}\n\n${p.mode === "release" ? "已审核版本" : "研究草稿 · 待复核"}\n\n${p.meta}\n\n` +
    (p.chatMarkdown || p.blocks
      .map(
        (b: any) =>
          `## ${b.title}\n\n${b.text}\n\n${b.notes ? `备注：${b.notes}\n\n` : ""}${b.scene ? `场景：${b.scene}\n机位：${b.camera}\n提示词：${b.prompt}\n\n` : ""}${b.claimIds?.length ? `事实引用：${b.claimIds.join("，")}\n` : ""}`,
      )
      .join("\n")) +
    `\n## 待核实\n${(p.unverified || []).join("\n")}\n\n## 来源\n` +
    p.sources
      .map(
        (s: any) =>
          `- ${s.title} · ${s.publisher} · ${s.published || "日期待核实"} ${/^https?:/.test(s.url) ? s.url : "本地资料"}`,
      )
      .join("\n") +
    `\n\n版本 ${p.versionId} · ${p.generatedAt}`;
  if (format === "md") writeFileSync(out, md);
  else if (format === "html") writeFileSync(out, reportHtml(p));
  else if (format === "json")
    writeFileSync(out, JSON.stringify({ schemaVersion: "1.0", ...p }, null, 2));
  else if (format === "csv") {
    const cell = (s: any) =>
      '"' +
      String(s ?? "")
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    writeFileSync(
      out,
      "\uFEFF" +
        [
          ["schemaVersion", "versionId", "title", "text", "claimIds"],
          ...p.blocks.map((b: any) => [
            "1.0",
            p.versionId,
            b.title,
            b.text,
            (b.claimIds || []).join(";"),
          ]),
        ]
          .map((row) => row.map(cell).join(","))
          .join("\r\n"),
    );
  } else if (format === "docx" && p.chatMarkdown) {
    writeFileSync(out, await conversationWord(p));
  } else if (format === "docx") {
    const children: any[] = [
      new Paragraph({ text: p.title, heading: HeadingLevel.TITLE }),
      new Paragraph({
        text: p.mode === "release" ? "已审核版本" : "研究草稿 · 待复核",
      }),
      new Paragraph(p.meta),
    ];
    for (const b of p.blocks) {
      children.push(
        new Paragraph({ text: b.title, heading: HeadingLevel.HEADING_1 }),
      );
      for (const line of b.text.split("\n")) children.push(new Paragraph(line));
      if (b.notes) children.push(new Paragraph("备注：" + b.notes));
      if (b.scene)
        children.push(
          new Paragraph(
            `场景：${b.scene}\n机位：${b.camera}\n提示词：${b.prompt}`,
          ),
        );
      if (b.claimIds?.length)
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "事实引用：" + b.claimIds.join("，"),
                size: 18,
                color: "666666",
              }),
            ],
          }),
        );
    }
    if (p.unverified?.length) {
      children.push(
        new Paragraph({ text: "待核实", heading: HeadingLevel.HEADING_1 }),
      );
      p.unverified.forEach((s: string) => children.push(new Paragraph(s)));
    }
    children.push(
      new Paragraph({ text: "来源", heading: HeadingLevel.HEADING_1 }),
    );
    for (const s of p.sources) {
      children.push(
        new Paragraph(
          s.title + " · " + s.publisher + " · " + (s.published || "日期待核实"),
        ),
      );
      if (/^https?:/.test(s.url))
        children.push(
          new Paragraph({
            children: [
              new ExternalHyperlink({
                link: s.url,
                children: [new TextRun({ text: s.url, style: "Hyperlink" })],
              }),
            ],
          }),
        );
    }
    children.push(new Paragraph(`版本 ${p.versionId} · ${p.generatedAt}`));
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { font: "Microsoft YaHei", size: 22 },
            paragraph: { spacing: { after: 160, line: 340 } },
          },
        },
      },
      sections: [{ children }],
    } as any);
    writeFileSync(out, await Packer.toBuffer(doc));
  } else if (format === "pptx" && p.visualMaster) {
    await writeVisualPresentation(p.visualMaster,out,p.versionId);
  } else if (format === "pptx") {
    const ppt = new ((PptxGenJS as any).default || PptxGenJS)();
    ppt.layout = "LAYOUT_WIDE";
    ppt.author = "EcuStudio";
    ppt.subject = p.meta;
    ppt.title = p.title;
    ppt.lang = "zh-CN";
    ppt.theme = {
      headFontFace: "Microsoft YaHei",
      bodyFontFace: "Microsoft YaHei",
      lang: "zh-CN",
    };
    let n = 0;
    const pages = [
      {
        title: p.title,
        text: p.meta,
        notes:
          "说明：" +
          (p.mode === "release"
            ? "已审核版本"
            : "研究草稿，待核实与审核后发布"),
      },
      ...p.blocks,
      {
        title: "来源与核验说明",
        text: p.sources.map((s: any) => `${s.title}\n${s.url || "本地资料"}`).join("\n\n"),
        notes: p.unverified?.join("\n") || "核对各来源适用范围与时效。",
      },
    ];
    for (const b of pages) {
      const parts = p.chatMarkdown ? paginateText(b.text) : chunks(b.text);
      for (const [part, txt] of parts.entries()) {
        const slide = ppt.addSlide();
        slide.background = { color: "F7F8FA" };
        slide.addShape(ppt.ShapeType.rect, {
          x: 0,
          y: 0,
          w: 0.15,
          h: 7.5,
          fill: { color: "16304C" },
          line: { color: "16304C" },
        });
        slide.addText("E C U S T U D I O  /  教育研究", {
          x: 0.6,
          y: 0.3,
          w: 11.5,
          h: 0.3,
          fontSize: 11,
          color: "647580",
          margin: 0,
        });
        slide.addText(b.title + (part ? " · 续" : ""), {
          x: 0.6,
          y: 1,
          w: 12.1,
          h: 1,
          fontSize: 28,
          bold: true,
          color: "16304C",
          breakLine: false,
          margin: 0,
          fit: "shrink",
        });
        slide.addText(txt, {
          x: 0.65,
          y: 2.2,
          w: 11.8,
          h: 4.2,
          fontSize: p.chatMarkdown && txt.length < 150 ? 24 : 19,
          color: "253442",
          valign: "top",
          margin: 0,
          paraSpaceAfterPt: 10,
          fit: "shrink",
        });
        slide.addText(
          `${p.mode === "release" ? "已审核" : "研究草稿"}  ·  ${p.versionId.slice(0, 8)}  /  ${++n}`,
          {
            x: 0.65,
            y: 7,
            w: 12,
            h: 0.2,
            fontSize: 9,
            color: "647580",
            margin: 0,
          },
        );
        slide.addNotes(
          (b.notes || "") +
            "\n引用：" +
            (b.claimIds || []).join(",") +
            "\n来源：" +
            p.sources.map((s: any) => p.chatMarkdown ? [s.title,s.url].filter(Boolean).join(" · ") : s.url).join("\n"),
        );
      }
    }
    await ppt.writeFile({ fileName: out });
  } else if (format === "pdf") {
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      browser = await chromium.launch({ channel: "msedge", headless: true });
    }
    try {
      const page = await browser.newPage();
      await page.route("**/*", (route) => route.abort());
      await page.setContent(p.visualMaster ? masterHtml(p.visualMaster) : reportHtml(p), { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      await page.pdf({
        path: out,
        ...(p.visualMaster ? {preferCSSPageSize:true} : {format: "A4" as const}),
        printBackground: true,
        displayHeaderFooter: !p.visualMaster,
        headerTemplate: "<span></span>",
        footerTemplate:
          '<div style="font-size:9px;width:100%;text-align:center;color:#666">EcuStudio · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
        margin: p.visualMaster ? {top:0,bottom:0,left:0,right:0} : { top: "18mm", bottom: "20mm", left: "15mm", right: "15mm" },
      });
    } finally {
      await browser.close();
    }
  } else throw new Error("不支持的导出格式");
  return {
    format,
    visual:
      format === "pdf"
        ? "rendered_not_reviewed"
        : ["docx", "pptx"].includes(format)
          ? "unverified"
          : "not_required",
  };
}
if (process.argv[2] && process.argv[3] && process.argv[4]) {
  try {
    const p = JSON.parse(readFileSync(process.argv[2], "utf8"));
    const quality = await render(p, process.argv[3], process.argv[4]);
    process.stdout.write(JSON.stringify(quality));
  } catch (e) {
    process.stderr.write(String((e as Error).message));
    process.exitCode = 1;
  }
}
