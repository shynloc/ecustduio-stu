import { extname } from "node:path";
import { all, get, parse, json, run, err, requireRow } from "./db.js";
import { assetBuffer, extract } from "./domain.js";
import {
  checkMediaAsset,
  grantMediaAsset,
  mediaActor,
} from "./media-access.js";
import { recognizeDocument } from "./ocr.js";
import { freezeMedia, runMedia } from "./media.js";
import { readWebSource } from "./ingestion-web.js";

export function freezeAttachments(
  ids: string[],
  conversationId: string,
  user: any,
) {
  return [...new Set(ids)].map((id) => {
    const a = requireRow(
      get("SELECT id,name,mime,hash,size FROM assets WHERE id=?", id),
    );
    const authorized =
      get(
        "SELECT 1 FROM upload_sessions WHERE owner_id=? AND asset_id=?",
        user.id,
        id,
      ) ||
      get(
        "SELECT 1 FROM messages m,json_each(m.context,'$.attachments') a WHERE m.conversation_id=? AND json_extract(a.value,'$.id')=?",
        conversationId,
        id,
      );
    if (!authorized) err("FORBIDDEN", "材料不属于当前账号或对话", 403);
    checkMediaAsset(id, user);
    return a;
  });
}

export async function readChatMaterials(
  input: any,
  jobId: string,
  signal: AbortSignal,
  progress: any,
  transport: typeof fetch,
) {
  const files = input.attachments || [],
    links = input.sourceUrls || [];
  if (!files.length && !links.length) return [];
  const checkpoint = parse(
    requireRow(get("SELECT checkpoint FROM jobs WHERE id=?", jobId)).checkpoint,
  );
  const cache = checkpoint.chatMaterials || {};
  const save = () => {
    signal.throwIfAborted();
    progress("read-material", { message: "正在保存材料读取进度" });
    run(
      "UPDATE jobs SET checkpoint=? WHERE id=?",
      json({ ...checkpoint, chatMaterials: cache }),
      jobId,
    );
  };
  const results: any[] = [];
  for (const item of [
    ...files,
    ...links.map((url: string) => ({ url, name: url })),
  ]) {
    signal.throwIfAborted();
    const key = item.id || item.url;
    const state = cache[key] || {};
    cache[key] = state;
    progress("read-material", { message: "正在读取 " + item.name });
    const actor = mediaActor(input.userId);
    if (item.id) checkMediaAsset(item.id, actor);
    if (!state.source) {
      // Reuse the exact material a previous successful turn read in this conversation.
      const prior = get(
        `SELECT s.value AS body FROM messages m,json_each(m.sources) s
        WHERE m.conversation_id=? AND m.role='assistant' AND json_extract(s.value,'$.kind')='attachment'
        AND (json_extract(s.value,'$.assetId')=? OR json_extract(s.value,'$.inputUrl')=?) ORDER BY m.rowid DESC LIMIT 1`,
        input.conversationId,
        item.id || null,
        item.url || null,
      );
      if (prior) state.source = parse(prior.body);
    }
    if (!state.source) {
      let partial = false;
      let text = "",
        warnings: string[] = [],
        name = item.name,
        method = "文件正文";
      if (item.url) {
        method = "网页正文";
        const web = await readWebSource(item.url, signal);
        const result = await extract(
          web.buffer,
          web.type.includes("pdf") ? "source.pdf" : "source.html",
          web.type,
          web.url,
        );
        if ("needsOcr" in result && result.needsOcr)
          err(
            "SOURCE_PARTIAL",
            "网页 PDF 含扫描区域，请上传原件以核对完整内容",
            422,
          );
        text = result.text;
        name = result.title || item.url;
        warnings = result.warnings || [];
      } else {
        const { a, data } = assetBuffer(item.id),
          ext = extname(a.name).toLowerCase();
        if (a.hash !== item.hash)
          err("ASSET_CHANGED", "原件已变化，请重新添加", 409);
        if (ext === ".wav") {
          const user = requireRow(
            get("SELECT id,role FROM users WHERE id=?", input.userId),
          );
          method = "录音转写";
          const frozen = freezeMedia(
            { action: "asr", assetId: a.id, title: a.name },
            user,
          );
          state.media ??= {};
          const result = await runMedia(
            frozen,
            jobId,
            progress,
            signal,
            transport,
            { checkpoint: state.media, save },
          );
          text = result.text;
          warnings = result.warnings || [];
        } else {
          const result = a.mime.startsWith("image/")
            ? null
            : await extract(data, a.name, a.mime);
          if (!result || ("needsOcr" in result && result.needsOcr)) {
            method = "逐页识别";
            const ocr = await recognizeDocument(a.id, signal, progress);
            grantMediaAsset(ocr.resultAssetId, input.userId);
            const missing = ocr.pages
              .filter((p) => !p.text?.trim())
              .map((p) => p.page);
            partial = missing.length > 0;
            text = ocr.text;
            warnings = ocr.warnings;
          } else {
            text = result.text;
            warnings = result.warnings || [];
          }
        }
      }
      if (!text.trim()) err("EMPTY_MATERIAL", name + " 未读取到正文", 422);
      if (text.length > 40000)
        err(
          "MATERIAL_LIMIT",
          name + " 超过本轮四万字上限，请选取需要的部分",
          422,
        );
      state.source = {
        kind: "attachment",
        title: name,
        excerpt: text,
        warnings,
        method,
        coverage: partial ? "partial" : "complete",
        needsReview: partial || method === "逐页识别" || method === "录音转写",
        assetId: item.id,
        sourceHash: item.hash,
        inputUrl: item.url,
        url: item.url,
      };
      delete state.media;
      save();
    }
    results.push({ ...state.source, id: undefined });
  }
  if (results.reduce((n, s) => n + s.excerpt.length, 0) > 40000)
    err("MATERIAL_LIMIT", "材料总计超过四万字，请减少本轮材料", 422);
  return results;
}

// Resolve the precise original draft even when a turn produced several different documents.
export function revisionTarget(
  conversationId: string,
  artifactId: string,
  user: any,
) {
  const a = requireRow(
    get(
      "SELECT a.*,s.name FROM artifacts a JOIN assets s ON s.id=a.asset_id WHERE a.id=? AND a.target_id=?",
      artifactId,
      conversationId,
    ),
  );
  const meta = parse(a.manifest);
  if (meta.conversationId !== conversationId)
    err("FORBIDDEN", "附件不属于本对话", 403);
  checkMediaAsset(a.asset_id, user);
  const original = requireRow(
    get(
      `SELECT m.content,m.sources FROM messages m,json_each(m.context,'$.artifacts') f
    WHERE m.conversation_id=? AND m.role='assistant' AND json_extract(f.value,'$.id')=?`,
      conversationId,
      a.id,
    ),
  );
  const [jobId, index] = a.job_id.split(":draft:");
  const job = requireRow(
    get("SELECT input,checkpoint,type FROM jobs WHERE id=?", jobId),
  );
  const answer = parse(job.checkpoint).exploreResult;
  const draft = answer?.fileDrafts?.[Number(index || 0)];
  const text =
    draft?.content ||
    answer?.text ||
    (job.type === "conversation-export" &&
      get(
        "SELECT content FROM messages WHERE id=? AND conversation_id=?",
        parse(job.input).messageId,
        conversationId,
      )?.content);
  if (!text) err("MISSING_ORIGINAL", "这份附件缺少可恢复的原稿", 409);
  return {
    id: a.id,
    title: meta.title || draft?.title || answer?.filePlan?.title || a.name,
    familyId: meta.familyId || a.id,
    format: a.format,
    version: meta.version || 1,
    content: text,
    originalSources: parse(original.sources, []).filter((s: any) =>
      (meta.sources || []).some((ref: any) => ref.id === s.id),
    ),
  };
}

export function inferRevision(
  conversationId: string,
  prompt: string,
  beforeJobId: string | null = null,
) {
  if (
    !/(只改|修改|修订|重写|改一下|改成|改为|(?:给|把).+(?:加上|增加|补充))/.test(
      prompt,
    )
  )
    return;
  const replies = all(
    `SELECT m.context FROM messages m JOIN messages u ON u.job_id=m.job_id AND u.role='user'
      WHERE m.conversation_id=? AND m.role='assistant'
        AND (? IS NULL OR u.rowid < (SELECT rowid FROM messages WHERE job_id=? AND role='user'))
      ORDER BY u.rowid DESC`,
    conversationId,
    beforeJobId,
    beforeJobId,
  );
  const groups = replies
    .map((m) => parse(m.context).artifacts || [])
    .filter((files) => files.length);
  const ordinal = prompt.match(
    /第([一二三四五1-5])(?:份(?:附件|文件)?|个(?:附件|文件)|件(?:成品|附件))/,
  );
  if (ordinal) {
    const index = Number(ordinal[1]) || "一二三四五".indexOf(ordinal[1]) + 1;
    const file = groups[0]?.[index - 1];
    if (file) return file.id;
    err(
      "CHOOSE_ATTACHMENT",
      "上一条交付里没有这个序号，请点相应附件的「修改这份」",
      409,
    );
  }
  const published = new Set(groups.flat().map((f) => f.id));
  const rows = all(
    "SELECT id,format,manifest FROM artifacts WHERE target_id=? ORDER BY rowid DESC",
    conversationId,
  ).filter((a) => published.has(a.id));
  const parents = new Set(
    rows.map((a) => parse(a.manifest).previousId).filter(Boolean),
  );
  const heads = rows.filter(
    (a) =>
      !parents.has(a.id) && parse(a.manifest).conversationId === conversationId,
  );
  const positive = prompt.split(/[，。；;]|不要|不改/)[0];
  let matches = heads.filter(
    (a) =>
      parse(a.manifest).title && positive.includes(parse(a.manifest).title),
  );
  if (!matches.length)
    matches = heads.filter(
      (a) =>
        (/活动单|讲义|word/i.test(positive) && a.format === "docx") ||
        (/幻灯片|课件|ppt/i.test(positive) && a.format === "pptx"),
    );
  if (matches.length > 1)
    err(
      "CHOOSE_ATTACHMENT",
      "有多份符合描述的附件，请点要修改的那一份上的「修改这份」",
      409,
    );
  return matches[0]?.id;
}
