import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { fixtures } from "./ocr-fixtures.js";
import { setupInjected } from "./auth-helper.js";
mkdirSync("test-results", { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  join(process.cwd(), "test-results/ocr-core-"),
);
const D = await import("../server/db.js"),
  domain = await import("../server/domain.js"),
  ocr = await import("../server/ocr.js"),
  tasks = await import("../server/tasks.js"),
  { buildApp } = await import("../server/app.js");
const app = await buildApp(false),
  f = fixtures();
const { cookie, csrf } = await setupInjected(app);
const call = (url: string, body: any) =>
  app.inject({
    method: "POST",
    url,
    headers: { host: "localhost", cookie, "x-csrf-token": csrf },
    payload: body,
  });
after(async () => {
  await app.close();
  D.db.close();
});
let recognized: any, assetId: string, ocrJobId: string;
test("JPEG与WebP实际识别，混合PDF逐页选择OCR或文本层", async () => {
  for (const [ext, bytes, mime] of [
    ["jpg", f.jpg, "image/jpeg"],
    ["webp", f.webp, "image/webp"],
  ] as const) {
    const a = domain.asset(bytes, "fixture." + ext, mime);
    const r = await ocr.recognizeDocument(
      a.id,
      new AbortController().signal,
      () => {},
    );
    assert.match(r.text, /北京教育考试院/);
  }
  const mixed = domain.asset(
    fixtures(true).pdf,
    "mixed.pdf",
    "application/pdf",
  );
  const r = await ocr.recognizeDocument(
    mixed.id,
    new AbortController().signal,
    () => {},
  );
  assert.deepEqual(
    r.pages.map((p) => p.method),
    ["windows-ocr", "pdf-text"],
  );
  assert.match(r.pages[1].text, /Mixed PDF text page/);
});
test("本机OCR能力探测和中文图片真实识别", async () => {
  const cap = await ocr.ocrCapability();
  assert.equal(cap.available, true);
  assert.ok(cap.languages.includes("zh-Hans-CN"));
  const a = domain.asset(f.png, "fixture.png", "image/png");
  assetId = a.id;
  recognized = await ocr.recognizeDocument(
    a.id,
    new AbortController().signal,
    () => {},
  );
  assert.equal(recognized.pageCount, 1);
  assert.match(recognized.text, /北京教育考试院/);
  assert.ok(recognized.text.replace(/\s/g, "").includes("2026年11月7日"));
  assert.equal(recognized.confidence, null);
  assert.ok(recognized.pages[0].rawText);
});
test("无文字层两页PDF实际逐页OCR并保留页码", async () => {
  const parsed: any = await domain.extract(f.pdf, "scan.pdf");
  assert.equal(parsed.needsOcr, true);
  const a = domain.asset(f.pdf, "scan.pdf", "application/pdf");
  const result = await ocr.recognizeDocument(
    a.id,
    new AbortController().signal,
    () => {},
  );
  assert.equal(result.pageCount, 2);
  assert.ok(
    result.pages.every(
      (p) => p.method === "windows-ocr" && p.text.includes("北京教育考试院"),
    ),
  );
  assert.match(result.text, /第 2 页/);
});
test("OCR任务完成、校正导入、原件关联、页码及候选事实进入母稿", async () => {
  const response = await call("/api/ocr", { assetId });
  assert.equal(response.statusCode, 200);
  ocrJobId = response.json().id;
  await new tasks.Worker().tick();
  assert.equal(
    D.get("SELECT state FROM jobs WHERE id=?", ocrJobId).state,
    "succeeded",
  );
  const scope = {
    region: "北京",
    district: "全市",
    stage: "中考",
    year: 2027,
    audience: "OCR自检",
  };
  const imported = await call("/api/import-upload", {
    assetId,
    ocrJobId,
    title: "OCR校正自检",
    scope,
    text: "[第 1 页]\nOCR校正后的资料内容，保留报名时间与适用条件，具体以官方原文为准。",
  });
  assert.equal(imported.statusCode, 200);
  await new tasks.Worker().tick();
  const snapshot = domain.snapshotView(
    D.get(
      "SELECT * FROM snapshots WHERE id=?",
      D.parse(
        D.get("SELECT result FROM jobs WHERE id=?", imported.json().id).result,
      ).id,
    ),
  );
  assert.equal(snapshot.asset_id, assetId);
  assert.equal(snapshot.paragraphs[1].page, 1);
  assert.ok(
    D.get(
      "SELECT 1 FROM audit WHERE entity_id=? AND action='snapshot.ocr'",
      snapshot.id,
    ),
  );
  const claim = domain.addClaim({
    snapshotId: snapshot.id,
    text: snapshot.paragraphs[1].text,
    quote: snapshot.paragraphs[1].text,
    paragraphId: "p2",
  });
  assert.equal(claim.status, "pending");
  const p = domain.createProject({
    title: "OCR流程",
    scope,
    snapshotIds: [snapshot.id],
  });
  assert.equal(domain.masterFromSources(p.id).blocks[0].claimIds[0], claim.id);
  const other = domain.asset(
    Buffer.from("different"),
    "other.txt",
    "text/plain",
  );
  assert.equal(
    (
      await call("/api/import-upload", {
        assetId: other.id,
        ocrJobId,
        title: "拒绝错配",
        scope,
      })
    ).statusCode,
    422,
  );
});
test("未识别任务拒绝导入、空白图片明确失败及取消边界", async () => {
  const queued = tasks.enqueue("ocr", { assetId });
  tasks.cancelJob(queued.id);
  assert.equal(
    D.get("SELECT state FROM jobs WHERE id=?", queued.id).state,
    "canceled",
  );
  const { createCanvas } = await import("@napi-rs/canvas"),
    canvas = createCanvas(600, 600),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 600, 600);
  const blank = domain.asset(
    canvas.toBuffer("image/png"),
    "blank.png",
    "image/png",
  );
  await assert.rejects(
    ocr.recognizeDocument(blank.id, new AbortController().signal, () => {}),
    /未识别/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    ocr.recognizeDocument(assetId, controller.signal, () => {}),
  );
});
