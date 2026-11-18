import { PDFDocument } from "pdf-lib";
import { err, hash } from "./db.js";
export async function pdfParts(
  bytes: Buffer,
  maxPages = 10,
  maxBytes = 20 * 1024 * 1024,
) {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes);
  } catch (e: any) {
    err(
      "PDF_PARSE_FAILED",
      /encrypt/i.test(e.message)
        ? "PDF受密码保护，请提供已解密文件"
        : "PDF结构无法读取，请重新导出文件",
      422,
    );
  }
  const count = doc!.getPageCount();
  if (count > 2000)
    err("PDF_PAGE_LIMIT", "原文件超过工作台2000页处理上限", 422);
  async function part(start: number, end: number): Promise<any[]> {
    const next = await PDFDocument.create();
    next.setCreationDate(new Date(0));
    next.setModificationDate(new Date(0));
    for (const p of await next.copyPages(
      doc!,
      Array.from({ length: end - start + 1 }, (_, i) => i + start - 1),
    ))
      next.addPage(p);
    const data = Buffer.from(await next.save());
    if (data.length > maxBytes && end > start) {
      const mid = Math.floor((start + end) / 2);
      return [...(await part(start, mid)), ...(await part(mid + 1, end))];
    }
    return [{ start, end, data, hash: hash(data) }];
  }
  const parts: any[] = [];
  for (let first = 1; first <= count; first += maxPages)
    parts.push(...(await part(first, Math.min(count, first + maxPages - 1))));
  return { count, parts };
}
export function retrySmaller(error: any) {
  return (
    [408, 413, 504].includes(error.httpStatus) ||
    ["OCR_INCOMPLETE", "MODEL_TRUNCATED", "MODEL_CONTEXT_LIMIT"].includes(
      error.code,
    )
  );
}
