import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { dataDir, err, get, parse, requireRow } from "./db.js";
import { assetBuffer } from "./domain.js";
import { checkMediaAsset } from "./media-access.js";
import { renderPdfPage } from "./document-quality.js";

const converting = new Map<string, Promise<Buffer>>();
const exec = promisify(execFile);
export function officeBinary() {
  if (process.platform === "darwin")
    return "/Applications/LibreOffice.app/Contents/MacOS/soffice";
  if (process.platform === "win32")
    return join(
      process.env.ProgramFiles || "C:\\Program Files",
      "LibreOffice",
      "program",
      "soffice.com",
    );
  return "soffice";
}

// Only derived pagination files are evicted; originals live in the asset store.
async function prunePreviews(dir: string, keep: string) {
  const entries = await Promise.all(
    (await readdir(dir))
      .filter((name) => /^[0-9a-f]{64}\.pdf$/.test(name))
      .map(async (name) => {
        const path = join(dir, name);
        const info = await stat(path).catch(() => null);
        return { path, size: info?.size || 0, time: info?.mtimeMs || 0 };
      }),
  );
  let bytes = 0;
  for (const [i, file] of entries
    .sort(
      (a, b) =>
        Number(b.path === keep) - Number(a.path === keep) || b.time - a.time,
    )
    .entries()) {
    bytes += file.size;
    if (file.path !== keep && (i >= 50 || bytes > 256 * 1024 * 1024))
      await rm(file.path, { force: true });
  }
}
async function converted(a: any, format: string) {
  const cache = join(dataDir, "staging", "chat-office-preview");
  await mkdir(cache, { recursive: true });
  const path = join(cache, a.hash + ".pdf");
  try {
    return await readFile(path);
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
  const inFlight = converting.get(path);
  if (inFlight) return inFlight;
  if (converting.size >= 2)
    err("PREVIEW_BUSY", "正在准备其他文件的预览，请稍后重试", 503);
  const work = (async () => {
    const dir = await mkdtemp(join(cache, "render-"));
    try {
      const file = join(dir, "document." + format);
      await writeFile(file, assetBuffer(a.id).data);
      const filter =
        format === "pptx" ? "impress_pdf_Export" : "writer_pdf_Export";
      await exec(
        officeBinary(),
        [
          "-env:UserInstallation=" + pathToFileURL(join(dir, "profile")).href,
          "--headless",
          "--norestore",
          "--convert-to",
          "pdf:" + filter,
          "--outdir",
          dir,
          file,
        ],
        { timeout: 90000, windowsHide: true },
      );
      const output = join(dir, "document.pdf"),
        pdf = await readFile(output);
      if (pdf.subarray(0, 5).toString() !== "%PDF-")
        throw new Error("empty conversion");
      await rename(output, path);
      await prunePreviews(cache, path);
      return pdf;
    } catch (e: any) {
      if (e.code === "ENOENT" && e.syscall?.startsWith("spawn"))
        err(
          "PREVIEW_RUNTIME",
          "此工作台需要安装 LibreOffice 才能显示 Office 真实分页。安装后可在此重试。",
          503,
        );
      if (e.killed || e.code === "ETIMEDOUT")
        err(
          "PREVIEW_TIMEOUT",
          "LibreOffice 在 90 秒内没有完成分页。请重试，或下载原文件打开。",
          503,
        );
      err("PREVIEW_FAILED", "Office 分页预览未完成，可重试或下载原文件。", 503);
    } finally {
      await rm(dir, { recursive: true, force: true, maxRetries: 3 });
    }
  })();
  converting.set(path, work);
  try {
    return await work;
  } finally {
    converting.delete(path);
  }
}

export async function officePage(
  conversationId: string,
  id: string,
  page: number,
  user: any,
) {
  const a = requireRow(
    get(
      "SELECT s.id,s.hash,f.format,f.manifest FROM artifacts f JOIN assets s ON s.id=f.asset_id WHERE f.id=? AND f.target_id=?",
      id,
      conversationId,
    ),
  );
  if (
    parse(a.manifest).conversationId !== conversationId ||
    !["docx", "pptx"].includes(a.format)
  )
    err("INVALID_PREVIEW", "请选择当前对话生成的演示或文档", 422);
  checkMediaAsset(a.id, user);
  if (!Number.isInteger(page) || page < 1)
    err("PAGE_NOT_FOUND", "页码无效", 404);
  return {
    ...(await renderPdfPage(await converted(a, a.format), page)),
    sourceHash: a.hash,
  };
}
