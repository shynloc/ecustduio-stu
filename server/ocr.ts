import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import {
  createCanvas,
  loadImage,
  DOMMatrix,
  ImageData,
  Path2D,
} from "@napi-rs/canvas";
import { imageSize } from "image-size";
import { assetBuffer, asset } from "./domain.js";
import { root, dataDir, id, err } from "./db.js";
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
let capability: any;
async function native(args: string[], signal?: AbortSignal) {
  return await new Promise<string>((resolve, reject) => {
    const mac = process.platform === "darwin";
    const child = spawn(
      mac ? "/usr/bin/osascript" : "powershell.exe",
      mac
        ? ["-l", "JavaScript", join(root, "scripts/macos-ocr.js"), ...args]
        : [
            "-NoProfile",
            "-NonInteractive",
            "-File",
            join(root, "scripts/windows-ocr.ps1"),
            ...args,
          ],
      {
        windowsHide: true,
        signal,
        env: {
          ...process.env,
          PSModulePath: join(
            process.env.SystemRoot || "C:\\Windows",
            "System32/WindowsPowerShell/v1.0/Modules",
          ),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "",
      error = "";
    const timer = setTimeout(() => child.kill(), 60000);
    child.stdout.on("data", (c) => (output += c));
    child.stderr.on("data", (c) => (error = (error + c).slice(-2000)));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(output.replace(/^\uFEFF/, ""))
        : reject(
            new Error(
              "本机 OCR 执行失败，请检查图片、系统版本或识别语言：" +
                error.slice(-600),
            ),
          );
    });
  });
}
export async function ocrCapability() {
  if (capability) return capability;
  try {
    if (!["win32", "darwin"].includes(process.platform)) throw new Error();
    const result = JSON.parse(await native(["-Probe"]));
    if (!result.languages?.length) throw new Error();
    capability = { available: true, ...result };
  } catch {
    capability = {
      available: false,
      engine: process.platform === "darwin" ? "apple-vision" : "windows-ocr",
      languages: [],
      reason:
        process.platform === "darwin"
          ? "需要macOS 14及以上及可用的Apple Vision识别语言"
          : "需要 Windows OCR 及已安装的识别语言包",
    };
  }
  return capability;
}
export async function recognizeDocument(
  assetId: string,
  signal: AbortSignal,
  progress: (stage: string, payload: any) => void,
  force = false,
) {
  const cap = await ocrCapability();
  if (!cap.available) err("OCR_UNAVAILABLE", cap.reason, 503);
  const { a, data } = assetBuffer(assetId),
    ext = extname(a.name).toLowerCase(),
    dir = join(dataDir, "staging", "ocr-" + a.hash + (force?"-all":"-auto") + "-v2");
  mkdirSync(dir, { recursive: true });
  const pages: any[] = [];
  const warnings = [
    "OCR可能误识别日期、数字及版面顺序，请对照原文件校正后再核验。",
  ];
  async function image(bytes: Buffer, page: number) {
    signal.throwIfAborted();
    const dimensions = imageSize(bytes);
    if (
      !dimensions.width ||
      !dimensions.height ||
      dimensions.width * dimensions.height > 40_000_000
    )
      err("OCR_IMAGE_LIMIT", "图片像素超过限制，请缩小到4000万像素以内", 422);
    const img = await loadImage(bytes),
      ratio = Math.min(1, 4000 / Math.max(img.width, img.height)),
      canvas = createCanvas(
        Math.round(img.width * ratio),
        Math.round(img.height * ratio),
      );
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const path = join(dir, "page-" + page + ".png"),
      out = join(dir, "page-" + page + ".json");
    writeFileSync(path, canvas.toBuffer("image/png"));
    progress("ocr", { message: `正在识别第 ${page} 页`, page });
    if(!existsSync(out))await native(["-InputPath", path, "-OutputPath", out], signal);
    signal.throwIfAborted();
    return {
      ...JSON.parse(readFileSync(out, "utf8")),
      image: {
        sourceWidth: img.width,
        sourceHeight: img.height,
        width: canvas.width,
        height: canvas.height,
        scale: ratio,
      },
    };
  }
  if (ext === ".pdf") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"),
      task = pdfjs.getDocument({
        data: new Uint8Array(data),
        useSystemFonts: true,
      });
    let doc: any;
    try {
      doc = await task.promise;
      if (doc.numPages > 2000)
        err("OCR_PAGE_LIMIT", "文件超过工作台2000页处理上限", 422);
      for (let n = 1; n <= doc.numPages; n++) {
        signal.throwIfAborted();
        const page = await doc.getPage(n),
          content = await page.getTextContent(),
          text = content.items
            .map((x: any) => x.str || "")
            .join(" ")
            .trim();
        const operators=await page.getOperatorList();
        const hasVisual=operators.fnArray.some((op:number)=>[pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject,pdfjs.OPS.constructPath].includes(op));
        if (!force && !hasVisual && text.replace(/\s/g, "").length >= 20) {
          pages.push({ page: n, method: "pdf-text", text, confidence: null });
          progress("extract", { message: `第 ${n} 页使用文本层`, page: n });
          continue;
        }
        const raw = page.getViewport({ scale: 1 }),
          scale = Math.min(2.5, 3600 / Math.max(raw.width, raw.height)),
          viewport = page.getViewport({ scale }),
          canvas = createCanvas(
            Math.ceil(viewport.width),
            Math.ceil(viewport.height),
          );
        await page.render({
          canvasContext: canvas.getContext("2d"),
          canvas,
          viewport,
        }).promise;
        const result = await image(canvas.toBuffer("image/png"), n);
        pages.push({ page: n, method: cap.engine, ...result });
        page.cleanup();
      }
    } catch (e: any) {
      if (e.name === "PasswordException")
        err("PDF_PASSWORD_REQUIRED", "PDF受密码保护，请先解密后识别", 422);
      throw e;
    } finally {
      await task.destroy();
    }
  } else if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    const result = await image(data, 1);
    pages.push({ page: 1, method: cap.engine, ...result });
  } else err("OCR_UNSUPPORTED", "OCR支持PNG、JPEG、WebP图片及PDF", 422);
  for (const p of pages) {
    p.rawText = p.text;
    p.text = p.text?.replace(
      /(?<=\p{Script=Han})[ \t]+(?=\p{Script=Han})/gu,
      "",
    );
  }
  const empty = pages.filter((p) => !p.text?.trim());
  if (empty.length)
    warnings.push(
      `第 ${empty.map((p) => p.page).join("、")} 页未识别到文字，请检查是否为空白或模糊。`,
    );
  const text = pages
    .map((p) => `[第 ${p.page} 页]\n${p.text || "（本页未识别到文字）"}`)
    .join("\n\n");
  if (pages.every((p) => !p.text?.trim()))
    err("OCR_EMPTY", "未识别到文字，请上传更清晰、方向正确的图片或PDF", 422);
  const payload = {
    engine: cap.engine,
    languages: cap.languages,
    sourceAssetId: a.id,
    sourceHash: a.hash,
    pages,
    warnings,
    text,
    confidence: null,
  };
  const resultAsset = asset(
    Buffer.from(JSON.stringify(payload)),
    "ocr-result.json",
    "application/json",
    "ocr-result",
  );
  return { ...payload, resultAssetId: resultAsset.id, pageCount: pages.length };
}
