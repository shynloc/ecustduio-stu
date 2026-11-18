import { fixtures } from "../tests/ocr-fixtures.js";
import { authenticatedSession } from './authenticated-session.js';
import { writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const out = "test-results/ocr-live";
mkdirSync(out, { recursive: true });
const base = "http://127.0.0.1:37891/api",
  s = await authenticatedSession(base),
  cookie = s.headers.get("set-cookie")!.split(";")[0],
  { csrf } = (await s.json()) as any;
const record: any = {
  startedAt: new Date().toISOString(),
  kind: "OCR raster fixture derived from imported official source",
};
function save() {
  writeFileSync(out + "/result.json", JSON.stringify(record, null, 2));
}
async function api(path: string, body?: any) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      cookie,
      "x-csrf-token": csrf,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value: any = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(value.error));
  return value;
}
async function wait(j: any) {
  for (let i = 0; i < 900; i++) {
    const v = await api("/jobs/" + j.id);
    if (v.state === "succeeded") return v;
    if (["failed", "canceled", "interrupted"].includes(v.state))
      throw new Error(JSON.stringify(v.error));
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("timeout");
}
try {
  const f = fixtures();
  writeFileSync(out + "/source.png", f.png);
  writeFileSync(out + "/scanned.pdf", f.pdf);
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(f.pdf)], { type: "application/pdf" }),
    "ocr-scan.pdf",
  );
  const response = await fetch(base + "/uploads", {
    method: "POST",
    headers: { cookie, "x-csrf-token": csrf },
    body: form,
  });
  const uploaded: any = await response.json();
  assert.equal(response.status, 200);
  assert.equal(uploaded.needsOcr, true);
  record.sourceAssetId = uploaded.id;
  const job = await api("/ocr", { assetId: uploaded.id });
  record.ocrJob = job.id;
  save();
  const ocr = (await wait(job)).result;
  assert.equal(ocr.pageCount, 2);
  record.ocrPages = ocr.pageCount;
  record.ocrEngine = ocr.engine;
  // The fixture is a known single-column scan. Correct digit spacing against its visible image.
  const corrected = ocr.text
    .replace(/(?<=\d)[ \t]+(?=\d)/g, "")
    .replace(/[ \t]*：[ \t]*/g, ":")
    .replace(/(?<=\d)[ \t]+(?=[年月日])/g, "");
  assert.ok(corrected.replace(/\s/g, "").includes("2026年11月7日8:30"));
  assert.ok(corrected.replace(/\s/g, "").includes("11月13日17:00"));
  record.manuallyCorrectedDigitSpacing = true;
  const scope = {
    region: "北京",
    district: "全市",
    stage: "中考",
    year: 2027,
    audience: "北京初三家长",
  };
  const imported = await wait(
    await api("/import-upload", {
      assetId: uploaded.id,
      ocrJobId: job.id,
      text: corrected,
      title: "OCR实际验收｜2027初中学考报名扫描件",
      publisher: "OCR验收扫描样本（依据北京教育考试院网页）",
      documentType: "媒体解读",
      scope,
    }),
  );
  record.snapshotId = imported.result.id;
  save();
  console.log(
    JSON.stringify({ ocr: "passed", pages: 2, snapshotId: record.snapshotId }),
  );
  const research = await api("/agent/runs", {
    kind: "research",
    snapshotIds: [record.snapshotId],
    prompt:
      "此材料是根据官方文字制作的OCR验收扫描件。仅提取3条确有原文支持的日期/报名事实和1个选题，逐字引用OCR已校正文，不要把样本当作正式公文。保持候选待核实。",
  });
  record.researchJob = research.id;
  save();
  const rr = (await wait(research)).result;
  assert.ok(rr.claimIds.length > 0);
  record.claimCount = rr.claimIds.length;
  record.researchUsage = rr.usage;
  console.log("OCR → real AI research passed.");
  const p = await api("/projects", {
    title: "OCR扫描件 · 真实AI闭环验收",
    scope,
    snapshotIds: [record.snapshotId],
  });
  record.projectId = p.id;
  for (const kind of ["master", "speech"]) {
    const j = await api("/agent/runs", {
      kind,
      projectId: p.id,
      masterId: kind === "speech" ? record.masterId : undefined,
      duration: 60,
      prompt:
        kind === "master"
          ? "基于OCR校正后的资料及候选事实，生成简洁研究母稿，不超过4块、400字，逐块引用claimId。事实尚待核验，保留unverified，不将OCR验收样本认定为原始公文。"
          : "基于同版母稿生成60秒口播草稿，200至230字，聚焦报名窗口与各区自行确定时段的限制，不扩展其他政策。逐块引用claimId，保留待核实说明。",
    });
    record[kind + "Job"] = j.id;
    save();
    const result = (await wait(j)).result;
    record[kind + "Id"] = result.versionId;
    record[kind + "Usage"] = result.usage;
    save();
    console.log("OCR → " + kind + " passed.");
  }
  const exportJob = await api("/exports", {
    targetType: "version",
    targetId: record.speechId,
    format: "docx",
    mode: "draft",
  });
  const exported = (await wait(exportJob)).result;
  record.artifactId = exported.id;
  const file = await fetch(base + "/artifacts/" + exported.id + "/download", {
    headers: { cookie },
  });
  assert.equal(file.status, 200);
  writeFileSync(
    out + "/OCR口播草稿.docx",
    Buffer.from(await file.arrayBuffer()),
  );
  record.status = "passed";
  record.finishedAt = new Date().toISOString();
  save();
  console.log(
    JSON.stringify({
      status: "passed",
      projectId: p.id,
      claims: record.claimCount,
      artifactId: exported.id,
    }),
  );
} catch (e: any) {
  record.status = "failed";
  record.error = e.message;
  save();
  console.error(e.message);
  process.exitCode = 1;
}
