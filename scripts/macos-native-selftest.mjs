// Run on the customer's Mac. Uses an isolated database and a disposable Keychain service.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
if (process.platform !== "darwin") throw new Error("此自检须在macOS实机执行");
const parent = join(process.env.ECUSTUDIO_DATA_DIR || "../data", "selftest");
mkdirSync(parent, { recursive: true });
const data = mkdtempSync(join(parent, "mac-native-"));
process.env.ECUSTUDIO_DATA_DIR = resolve(data);
delete process.env.DEEPSEEK_API_KEY;
const db = await import("../dist-server/server/db.js"),
  S = await import("../dist-server/server/secrets.js"),
  O = await import("../dist-server/server/ocr.js"),
  D = await import("../dist-server/server/domain.js");
const report = { startedAt: new Date().toISOString(), isolation: true };
try {
  const sample = "ecustudio-selftest-" + randomBytes(20).toString("hex");
  await S.setSecret("deepseek", sample);
  assert.equal(await S.getSecret("deepseek"), sample);
  await S.setSecret("deepseek", "");
  assert.equal(S.hasSecret("deepseek"), false);
  report.keychain = "passed";
  const cap = await O.ocrCapability();
  assert.equal(cap.available, true, cap.reason);
  assert.equal(cap.engine, "apple-vision");
  const canvas = createCanvas(1400, 420),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1400, 420);
  ctx.fillStyle = "#111";
  ctx.font = '72px "PingFang SC", sans-serif';
  ctx.fillText("EcuStudio OCR 本机识别自检", 45, 150);
  ctx.font = '42px "PingFang SC", sans-serif';
  ctx.fillText("仅为自检样例，不是真实政策。", 45, 250);
  const asset = D.asset(
    canvas.toBuffer("image/png"),
    "mac-ocr-selftest.png",
    "image/png",
  );
  const result = await O.recognizeDocument(
    asset.id,
    new AbortController().signal,
    () => {},
  );
  assert.ok(result.text.replace(/\s/g, "").toLowerCase().includes("ecustudio"));
  assert.equal(result.pageCount, 1);
  report.ocr = "passed";
  report.status = "passed";
} catch (e) {
  report.status = "failed";
  report.error = e.message;
  process.exitCode = 1;
} finally {
  try {
    await S.setSecret("deepseek", "");
  } catch {}
  db.db.close();
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(data, "result.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({ ...report, evidence: join(data, "result.json") }, null, 2),
  );
}
