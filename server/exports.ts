import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import AdmZip from "adm-zip";
import {
  get,
  all,
  parse,
  dataDir,
  root,
  id,
  json,
  now,
  requireRow,
  run,
  err,
  hash,
  tx,
} from "./db.js";
import { grantMediaAsset } from "./media-access.js";
import { asset, canExport, versionView } from "./domain.js";
export const formats = ["md", "html", "pdf", "docx", "pptx", "json", "csv"];
export function freezeExport(input: any) {
  let p: any;
  const mode = input.mode || "draft";
  if (input.targetType === "version") {
    const v = canExport(input.targetId, mode),
      project = requireRow(
        get("SELECT * FROM projects WHERE id=?", v.project_id),
      );
    const sources = parse(project.snapshot_ids, []).map((sid: string) =>
      requireRow(
        get(
          "SELECT id,url,title,publisher,published FROM snapshots WHERE id=?",
          sid,
        ),
      ),
    );
    p = {
      ...v.body,
      title: v.body.title,
      versionId: v.id,
      sources,
      meta: `${parse(project.scope).region} · ${parse(project.scope).year} 年 · ${parse(project.scope).stage} · ${v.kind} v${v.number}`,
    };
  } else if (input.targetType === "report") {
    const report = requireRow(
        get("SELECT * FROM reports WHERE id=?", input.targetId),
      ),
      body = parse(report.payload);
    p = {
      title: `每日教育情报 ${report.date}`,
      versionId: report.id,
      meta: `${report.date} · 日报 v${report.number} · ${body.windowStart} 至 ${body.windowEnd}`,
      blocks: body.topics.map((t: any) => ({
        id: t.id,
        title: t.title,
        text: `${t.summary}\n创作角度：${t.angle}\n系统选题评分：${t.total}`,
        claimIds: [],
      })),
      sources: body.sources,
      unverified: body.warnings,
    };
    if (!p.blocks.length)
      p.blocks = [
        {
          id: id(),
          title: "本次监测",
          text: body.message || "暂无符合条件的已核实推荐",
          claimIds: [],
        },
      ];
  } else if (input.targetType === "snapshot") {
    const s = requireRow(
      get("SELECT * FROM snapshots WHERE id=?", input.targetId),
    );
    p = {
      title: s.title,
      versionId: s.id,
      meta: `${parse(s.scope).region} · ${parse(s.scope).year} 年 · 原文资料`,
      blocks: [{ id: s.id, title: "原文", text: s.body, claimIds: [] }],
      sources: [s],
      unverified: ["原文导出不代表已完成政策核验"],
    };
  } else if (input.targetType === "topics") {
    const list = all("SELECT * FROM topics ORDER BY total DESC").filter(
      (t) => !input.ids || input.ids.includes(t.id),
    );
    p = {
      title: "选题筛选结果",
      versionId: hash(list),
      meta: `固定选集 · ${list.length} 条`,
      blocks: list.map((t) => ({
        id: t.id,
        title: t.title,
        text: t.summary + "\n" + t.angle,
        claimIds: [],
      })),
      sources: list.map((t) =>
        get("SELECT * FROM snapshots WHERE id=?", t.snapshot_id),
      ),
      unverified: ["选题列表研究草稿"],
    };
  } else err("INVALID_EXPORT", "导出范围不支持");
  if (input.targetType !== "version" && mode === "release")
    err("REVIEW_REQUIRED", "该范围仅支持标记状态的研究资料导出");
  if (!formats.includes(input.format)) err("INVALID_FORMAT", "不支持的格式");
  if (input.format === "pptx" && input.targetType !== "version")
    err("INVALID_FORMAT", "请选择项目演示稿导出 PPTX");
  return {
    ...input,
    mode,
    payload: { schemaVersion: "1.0", ...p, mode, generatedAt: now() },
  };
}
export async function exportFile(
  input: any,
  jobId: string,
  signal: AbortSignal,
  beforeStore?: () => void,
) {
  const previous = get(
    "SELECT a.*, s.name FROM artifacts a JOIN assets s ON s.id=a.asset_id WHERE a.job_id=? AND a.format=?",
    jobId,
    input.format,
  );
  if (previous) return previous;
  const token = id(),
    path = join(dataDir, "staging", token + "." + input.format),
    payload = join(dataDir, "staging", token + ".json");
  try {
    writeFileSync(payload, json(input.payload));
    const script = existsSync(join(root, "dist-server/server/render.js"))
      ? join(root, "dist-server/server/render.js")
      : join(root, "server/render.ts");
    const quality: any = await new Promise((resolve, reject) => {
      const args = script.endsWith(".ts")
        ? ["--import", "tsx", script, payload, input.format, path]
        : [script, payload, input.format, path];
      const p = spawn(process.execPath, args, {
        cwd: root,
        windowsHide: true,
        signal,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "",
        stderr = "";
      const timeout = setTimeout(() => p.kill(), 300000);
      p.stdout.on("data", (c) => (stdout += c));
      p.stderr.on("data", (c) => {
        stderr = (stderr + c).slice(-2000);
      });
      p.on("error", reject);
      p.on("close", (code) => {
        clearTimeout(timeout);
        code === 0
          ? resolve(parse(stdout, { visual: "unverified" }))
          : reject(new Error("文件生成失败：" + stderr));
      });
    });
    signal.throwIfAborted();
    const buffer = readFileSync(path);
    if (buffer.length < 20) err("EXPORT_EMPTY", "导出文件为空");
    if (["docx", "pptx"].includes(input.format)) {
      const zip = new AdmZip(buffer);
      if (
        !zip.getEntry("[Content_Types].xml") ||
        !zip.getEntry(
          input.format === "docx"
            ? "word/document.xml"
            : "ppt/presentation.xml",
        )
      )
        err("EXPORT_INVALID", "Office 文件结构无效");
      quality.structure = "passed";
    }
    if (input.format === "pdf" && buffer.subarray(0, 4).toString() !== "%PDF")
      err("EXPORT_INVALID", "PDF文件结构无效");
    if (input.targetType === "version") canExport(input.targetId, input.mode);
    // A revision can intentionally retain the same title in the same conversation.
    const fileSuffix = input.targetType === "conversation" ? token : input.targetId?.slice(0,8) || token.slice(0,8);
    const name = `EcuStudio_${input.payload.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 65)}_${fileSuffix}.${input.format}`;
    const mime: Record<string, string> = {
      html: "text/html",
      md: "text/markdown",
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      json: "application/json",
      csv: "text/csv",
    };
    beforeStore?.();
    return tx(() => {
      const a = asset(buffer, name, mime[input.format], "artifact"),
        artifactId = id();
      const isChat=input.targetType==="conversation";
      const familyId=input.payload.familyId||artifactId;
      let version=input.payload.version||1;
      if (isChat){
        grantMediaAsset(a.id,input.payload.ownerId);
        if(input.payload.previousId){
          const newest=get("SELECT max(CAST(json_extract(manifest,'$.version') AS INTEGER)) AS n FROM artifacts WHERE target_id=? AND json_extract(manifest,'$.familyId')=?",input.targetId,familyId);
          version=Math.max(version,(newest?.n||0)+1);
        }
      }
      run(
        "INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?)",
        artifactId,
        a.id,
        input.targetId || input.payload.versionId,
        input.mode,
        input.format,
        json(
          input.targetType === "conversation"
            ? {
                title:input.payload.title,version,familyId,previousId:input.payload.previousId,
                ownerId: input.payload.ownerId,
                conversationId: input.payload.conversationId,
                sources: input.payload.sources,
              }
            : input.payload,
        ),
        json(quality),
        jobId,
        now(),
      );
      return {
        ...get("SELECT * FROM artifacts WHERE id=?", artifactId),
        name: a.name,
      };
    });
  } finally {
    rmSync(path, { force: true });
    rmSync(payload, { force: true });
  }
}
