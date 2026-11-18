import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { extract, assetBuffer } from "./domain.js";
import { err } from "./db.js";
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
export function assessDocument(source: string, answer: string) {
  const tokens = (
    source.toLowerCase().match(/[a-z]{4,}|[\p{Script=Han}]{2,}/gu) || []
  ).flatMap((w) =>
    /\p{Script=Han}/u.test(w)
      ? Array.from({ length: w.length - 1 }, (_, i) => w.slice(i, i + 2))
      : [w],
  );
  const unique = [...new Set(tokens)],
    matches = unique.filter((t) => answer.toLowerCase().includes(t)).length;
  const warnings: string[] = [];
  if (
    /(?:内容|正文).{0,8}(?:文件名|标题).{0,6}(?:不符|不一致)|(?:文件名|标题).{0,8}(?:内容|正文).{0,6}(?:不符|不一致)/.test(
      answer,
    )
  )
    warnings.push("模型报告文件标题与正文不一致，请核对原件");
  if (unique.length >= 15 && matches / Math.min(unique.length, 150) < 0.04)
    warnings.push("整理结果与可提取原文缺少共同内容，可能偏题或解析异常");
  return {
    status: warnings.length
      ? "needs-review"
      : source.trim().length >= 30
        ? "unverified"
        : "no-text-evidence",
    warnings,
    requiresSourceReview: true,
    notice: "自动检查不能代替原文核对。整理稿不是逐字原文。",
  };
}
export async function originalEvidence(assetId: string) {
  const { a, data } = assetBuffer(assetId);
  try {
    const result = await extract(data, a.name, a.mime);
    return {
      assetId: a.id,
      sourceHash: a.hash,
      text: result.text.slice(0, 500000),
      warnings: result.warnings || [],
    };
  } catch {
    return {
      assetId: a.id,
      sourceHash: a.hash,
      text: "",
      warnings: ["本机未能读取文字层，请查看原件或使用逐页识别"],
    };
  }
}
export async function pdfPage(assetId: string, pageNumber: number) {
  const { a, data } = assetBuffer(assetId);
  if (!a.name.toLowerCase().endsWith(".pdf"))
    err("PREVIEW_UNSUPPORTED", "仅PDF提供分页预览", 422);
  return {...await renderPdfPage(data,pageNumber),sourceHash:a.hash};
}

export async function renderPdfPage(data:Buffer,pageNumber:number) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"),
    task = pdfjs.getDocument({
      data: new Uint8Array(data),
      useSystemFonts: true,
    });
  try {
    const doc = await task.promise;
    if (
      pageNumber < 1 ||
      pageNumber > doc.numPages ||
      !Number.isInteger(pageNumber)
    )
      err("PAGE_NOT_FOUND", "页码不存在", 404);
    const page: any = await doc.getPage(pageNumber),
      raw = page.getViewport({ scale: 1 }),
      viewport = page.getViewport({
        scale: Math.min(1.8, 2000 / Math.max(raw.width, raw.height)),
      }),
      canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
    await page.render({
      canvas,
      canvasContext: canvas.getContext("2d"),
      viewport,
    }).promise;
    return {
      bytes: canvas.toBuffer("image/png"),
      pageCount: doc.numPages,
    };
  } finally {
    await task.destroy();
  }
}
export function requireSourceReview(result: any, sourceChecked?: string) {
  if (
    result.integrity?.requiresSourceReview &&
    sourceChecked !== result.sourceHash
  )
    err(
      "SOURCE_REVIEW_REQUIRED",
      "请先对照原文件校正内容，并勾选已核对原文件；可以先保存为待复核笔记",
      409,
    );
}
