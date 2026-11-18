import {articleProfile, wechatThemeIds, type WechatTheme} from "../shared/wechat-themes.js";
import { z } from "zod";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { imageSize } from "image-size";
import * as cheerio from "cheerio";
import {
  all,
  get,
  run,
  tx,
  id,
  now,
  hash,
  json,
  parse,
  err,
  requireRow,
  audit,
} from "./db.js";
import { owned, noteView } from "./explore.js";
import { asset, assetBuffer } from "./domain.js";
import { checkMediaAsset, grantMediaAsset } from "./media-access.js";
import { getSecret, setSecret } from "./secrets.js";
import { wechatHtml } from "./wechat-export.js";
import { officialWechat, WechatClient, WechatError } from "./wechat-client.js";

export const wechatSecrets = { get: getSecret, set: setSecret };
type Secrets = typeof wechatSecrets;
const secretName = (accountId: string) => "wechat." + accountId;
const cut = (s: string, n: number) => Array.from(s).slice(0, n).join("");
function actor(actorId: string) {
  const u = requireRow(get("SELECT * FROM users WHERE id=?", actorId));
  if (
    u.status !== "active" ||
    u.must_change_password ||
    !["admin", "creator"].includes(u.role)
  )
    err("FORBIDDEN", "账号权限已变更，请重新登录后再操作。", 403);
  return u;
}
function own(
  table: "wechat_previews" | "wechat_drafts",
  key: string,
  user: any,
) {
  const row = requireRow(get(`SELECT * FROM ${table} WHERE id=?`, key));
  if (row.owner_id !== user.id && user.role !== "admin")
    err("FORBIDDEN", "无权查看其他账号的公众号内容。", 403);
  return row;
}
export function connection() {
  const a = get("SELECT * FROM wechat_accounts WHERE enabled=1");
  return a
    ? {
        connected: true,
        id: a.id,
        name: a.display_name,
        verifiedAt: a.verified_at,
      }
    : { connected: false };
}
function previewView(p: any) {
  const body = parse(p.body);
  // An opaque sandbox does not send login cookies for local image requests.
  // Embed the frozen offline copy so preview stays safe and actually shows the images.
  return {
    id: p.id,
    noteId: p.note_id,
    revision: p.revision,
    ...body,
    previewHtml: assetBuffer(body.assetId).data.toString("utf8"),
    createdAt: p.created_at,
  };
}
export function draftView(d: any) {
  const p = get("SELECT body FROM wechat_previews WHERE id=?", d.preview_id),
    a = get(
      "SELECT display_name FROM wechat_accounts WHERE id=?",
      d.account_id,
    ),
    j = get("SELECT state,stage,error FROM jobs WHERE id=?", d.job_id);
  return {
    id: d.id,
    previewId: d.preview_id,
    mediaId: d.remote_media_id || null,
    accountName: a?.display_name,
    title: parse(p?.body).title,
    state: d.state,
    jobState: j?.state,
    stage: j?.stage,
    message: d.error || parse(j?.error)?.message || "",
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}
async function jpeg(assetId: string, user: any) {
  checkMediaAsset(assetId, user);
  const { a, data } = assetBuffer(assetId);
  if (
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(a.mime) ||
    data.length > 20 * 1048576
  )
    err("WECHAT_IMAGE", "配图格式或大小不适合公众号，请换一张图片。", 422);
  const size = imageSize(data);
  if (!size.width || !size.height || size.width * size.height > 40_000_000)
    err("WECHAT_IMAGE", "配图分辨率过大，请换一张较小的图片。", 422);
  const source = await loadImage(data);
  let ratio = Math.min(1, 1600 / source.width, 6000 / source.height);
  for (let attempt = 0; attempt < 5; attempt++) {
    const canvas = createCanvas(
        Math.max(1, Math.round(source.width * ratio)),
        Math.max(1, Math.round(source.height * ratio)),
      ),
      ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const bytes = canvas.toBuffer("image/jpeg", 85);
    if (bytes.length < 950000) {
      const result = asset(bytes, "公众号配图.jpg", "image/jpeg", "wechat");
      grantMediaAsset(result.id, user.id);
      return { id: result.id, hash: result.hash };
    }
    ratio *= 0.7;
  }
  err("WECHAT_IMAGE", "此配图压缩后仍过大，请更换图片。", 422);
}
function autoCover(title: string, palette: WechatTheme, user: any) {
  const canvas = createCanvas(900, 383),
    ctx = canvas.getContext("2d");
  ctx.fillStyle =
    (palette === "milestone-darkcode-dark" ? articleProfile(palette)?.bg : articleProfile(palette)?.heading) ?? (palette === "blue" ? "#193e62" : palette === "ink" ? "#252727" : "#23483d");
  ctx.fillRect(0, 0, 900, 383);
  ctx.fillStyle = "#c7d7b1";
  ctx.fillRect(55, 65, 54, 5);
  ctx.fillStyle = "#ffffff";
  const family = ["Microsoft YaHei", "PingFang SC", "Heiti SC", "Hiragino Sans GB", "Noto Sans CJK SC", "SimSun", "Arial Unicode MS"].find(name => GlobalFonts.has(name));
  const face = family ? JSON.stringify(family) : "sans-serif";
  ctx.font = "bold 44px " + face;
  const chars = Array.from(title);
  for (let i = 0; i < 3; i++)
    ctx.fillText(chars.slice(i * 16, (i + 1) * 16).join(""), 55, 145 + i * 64);
  ctx.font = "18px " + face;
  ctx.fillStyle = "#d2ded6";
  ctx.fillText("EcuStudio · 教创工作台", 55, 347);
  const a = asset(
    canvas.toBuffer("image/jpeg", 90),
    "公众号自动封面.jpg",
    "image/jpeg",
    "wechat",
  );
  grantMediaAsset(a.id, user.id);
  return { id: a.id, hash: a.hash };
}
export async function prepareWechat(noteId: string, b: any, user: any) {
  const note = noteView(owned("notes", noteId, user));
  if (note.revision !== b.revision)
    err("VERSION_CONFLICT", "笔记已更新，请重新载入笔记并预览。", 409);
  const title = b.title || cut(note.title, 32),
    summary =
      b.summary ||
      cut(
        cheerio
          .load(wechatHtml({ ...note, title: "", sources: [] }))
          .text()
          .replace(/\s+/g, " ")
          .trim(),
        120,
      );
  const palette = b.palette || "green",
    cover = b.coverAssetId
      ? await jpeg(b.coverAssetId, user)
      : autoCover(title, palette, user);
  const $ = cheerio.load(
      wechatHtml({ ...note, title, summary: b.summary, coverAssetId: cover.id }, palette),
      null,
      false,
    ),
    images: any[] = [];
  const imageIds = Array.from(
    new Set(
      $("img")
        .toArray()
        .map((img) => ($(img).attr("src") || "").split("/").pop()!),
    ),
  );
  if (imageIds.length > 30)
    err("WECHAT_IMAGE_LIMIT", "这篇笔记配图较多，请拆成两篇后再排版。", 422);
  let total = 0;
  for (const original of imageIds) {
    checkMediaAsset(original, user);
    total += assetBuffer(original).data.length;
    if (total > 20 * 1048576)
      err("WECHAT_IMAGE_LIMIT", "本篇配图超过20MB，请减少配图后预览。", 422);
    const image = original === cover.id ? cover : await jpeg(original, user);
    images.push(image);
    $("img").each((_, el) => {
      if ($(el).attr("src") === "/api/assets/" + original)
        $(el).attr("src", "/api/assets/" + image.id);
    });
  }
  const html = $.html();
  if (Array.from(html).length > 19000 || Buffer.byteLength(html) > 900000)
    err(
      "WECHAT_ARTICLE_LIMIT",
      "这篇文章超过微信长度限制，请拆成两篇笔记后排版。",
      422,
    );
  for (const image of images) {
    const a = assetBuffer(image.id);
    $("img").each((_, el) => {
      if ($(el).attr("src") === "/api/assets/" + image.id)
        $(el).attr(
          "src",
          "data:image/jpeg;base64," + a.data.toString("base64"),
        );
    });
  }
  const offline = asset(
    Buffer.from(
      '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body>' +
        $.html() +
        "</body></html>",
    ),
    title + "-公众号排版.html",
    "text/html",
    "wechat",
  );
  grantMediaAsset(offline.id, user.id);
  const body = {
    title,
    summary,
    html,
    images,
    cover,
    assetId: offline.id,
    name: offline.name,
    imageCount: images.length,
    palette,
    // Keep the user's choices separate from automatically generated values so
    // editing the source can regenerate its title, summary and cover correctly.
    options: {
      title: b.title || "",
      summary: b.summary || "",
      coverAssetId: b.coverAssetId || null,
    },
    warning: note.sources?.some(
      (s: any) => s.needsReview || s.coverage === "partial",
    )
      ? "部分来源尚未核对，请在微信发布前检查事实与配图。"
      : "",
  };
  // A note can be edited while image conversion is awaiting. Do not label an old snapshot current.
  if (owned("notes", noteId, user).revision !== note.revision)
    err("VERSION_CONFLICT", "笔记刚刚发生变化，请重新生成预览。", 409);
  const digest = hash({ noteId, revision: note.revision, body }),
    previous = get(
      "SELECT * FROM wechat_previews WHERE owner_id=? AND content_hash=?",
      user.id,
      digest,
    );
  if (previous) return previewView(previous);
  const pid = id();
  run(
    "INSERT INTO wechat_previews VALUES(?,?,?,?,?,?,?)",
    pid,
    user.id,
    noteId,
    note.revision,
    json(body),
    digest,
    now(),
  );
  audit("wechat.preview", pid, {
    actor: user.id,
    noteId,
    revision: note.revision,
  });
  return previewView(get("SELECT * FROM wechat_previews WHERE id=?", pid));
}

export function enqueueWechatDraft(b:{previewId:string;accountId:string},user:any,enqueue:any){
    const p = own("wechat_previews", b.previewId, user),
      a = get("SELECT * FROM wechat_accounts WHERE enabled=1");
    if (!a || a.id !== b.accountId)
      err(
        "WECHAT_CONNECTION_CHANGED",
        "公众号连接已变化，请刷新页面确认要保存到哪个公众号。",
        409,
      );
    const prior = get(
      "SELECT * FROM wechat_drafts WHERE preview_id=? AND account_id=?",
      p.id,
      a.id,
    );
    if (prior) return draftView(own("wechat_drafts", prior.id, user));
    const other = get(
      `SELECT d.id FROM wechat_drafts d JOIN wechat_previews p ON p.id=d.preview_id JOIN jobs j ON j.id=d.job_id
      WHERE p.note_id=? AND d.account_id=? AND d.preview_id<>? AND (j.state IN ('queued','running') OR d.state IN ('submitting','unknown','verifying')) LIMIT 1`,
      p.note_id,
      b.accountId,
      b.previewId,
    );
    if (other)
      err(
        "RECONCILE_FIRST",
        "同篇文章有另一版正在保存或回执待核对。请先核对那一版的草稿记录。",
        409,
      );
    if (owned("notes", p.note_id, user).revision !== p.revision)
      err("VERSION_CONFLICT", "笔记已更新，请重新预览后保存。", 409);
    const did = id();
    tx(() => {
      run(
        "INSERT INTO wechat_drafts(id,owner_id,preview_id,account_id,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        did,
        user.id,
        p.id,
        a.id,
        now(),
        now(),
      );
      const j = enqueue(
        "wechat-draft",
        { draftId: did, actorId: user.id },
        "wechat:" + did,
      );
      run("UPDATE wechat_drafts SET job_id=? WHERE id=?", j.id, did);
    });
    return draftView(get("SELECT * FROM wechat_drafts WHERE id=?", did));
}

export async function registerWechatDrafts(
  app: any,
  enqueue: any,
  retryJob: any,
  client: WechatClient = officialWechat,
  secrets: Secrets = wechatSecrets,
) {
  app.get("/api/wechat/connection", async () => connection());
  app.post("/api/settings/wechat/connect", async (req: any) => {
    const b = z
      .object({
        name: z.string().trim().min(1).max(80),
        appId: z
          .string()
          .trim()
          .regex(/^wx[a-zA-Z0-9]{16}$/),
        secret: z
          .string()
          .trim()
          .min(16)
          .max(128)
          .regex(/^[a-zA-Z0-9_-]+$/),
      })
      .strict()
      .parse(req.body);
    const probe = { id: id(), app_id: b.appId };
    try {
      await client.list(probe, b.secret);
    } finally {
      client.forget(probe.id);
    }
    const account =
      get(
        "SELECT * FROM wechat_accounts WHERE app_id=? ORDER BY created_at DESC LIMIT 1",
        b.appId,
      ) || probe;
    await secrets.set(secretName(account.id), b.secret);
    client.forget(account.id);
    tx(() => {
      run("UPDATE wechat_accounts SET enabled=0 WHERE enabled=1");
      run(
        "INSERT INTO wechat_accounts VALUES(?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,enabled=1,verified_at=excluded.verified_at",
        account.id,
        b.appId,
        b.name,
        now(),
        now(),
      );
      audit("wechat.connected", account.id, { actor: req.user.id });
    });
    return connection();
  });
  app.post("/api/settings/wechat/test", async () => {
    const a = requireRow(get("SELECT * FROM wechat_accounts WHERE enabled=1"));
    await client.list(a, await secrets.get(secretName(a.id)));
    run("UPDATE wechat_accounts SET verified_at=? WHERE id=?", now(), a.id);
    return connection();
  });
  app.post("/api/settings/wechat/disconnect", async (req: any) => {
    const a = get("SELECT * FROM wechat_accounts WHERE enabled=1");
    if (a) {
      run("UPDATE wechat_accounts SET enabled=0 WHERE id=?", a.id);
      client.forget(a.id);
      audit("wechat.disconnected", a.id, { actor: req.user.id });
    }
    return connection();
  });
  app.post("/api/notes/:id/wechat-preview", async (req: any) =>
    prepareWechat(
      req.params.id,
      z
        .object({
          revision: z.number().int(),
          title: z
            .string()
            .trim()
            .max(64)
            .refine((v) => Array.from(v).length <= 32)
            .optional(),
          summary: z
            .string()
            .trim()
            .max(240)
            .refine((v) => Array.from(v).length <= 120)
            .optional(),
          coverAssetId: z.string().max(100).optional(),
          palette: z.enum(wechatThemeIds).default("green"),
        })
        .strict()
        .parse(req.body),
      req.user,
    ),
  );
  app.get("/api/wechat/previews/:id", async (req: any) =>
    previewView(own("wechat_previews", req.params.id, req.user)),
  );
  app.get("/api/wechat/drafts", async (req: any) =>
    all(
      "SELECT * FROM wechat_drafts WHERE owner_id=? ORDER BY created_at DESC LIMIT 50",
      req.user.id,
    ).map(draftView),
  );
  app.get("/api/wechat/drafts/:id", async (req: any) =>
    draftView(own("wechat_drafts", req.params.id, req.user)),
  );
  app.post("/api/wechat/drafts", async(req:any)=>{
    const b=z.object({previewId:z.string(),accountId:z.string()}).strict().parse(req.body);
    return enqueueWechatDraft(b,req.user,enqueue);
  });
  app.post("/api/wechat/drafts/:id/retry", async (req: any) => {
    const b = z
        .object({ confirmedAbsent: z.boolean().default(false) })
        .strict()
        .parse(req.body || {}),
      d = own("wechat_drafts", req.params.id, req.user),
      j = get("SELECT * FROM jobs WHERE id=?", d.job_id);
    if (["queued", "running"].includes(j.state)) return draftView(d);
    if (d.state === "saved") return draftView(d);
    if (b.confirmedAbsent) {
      if (d.remote_media_id || !["unknown", "submitting"].includes(d.state))
        err("WECHAT_RETRY", "当前草稿无需重新创建，请检查保存记录。", 409);
      const cp = parse(d.checkpoint);
      delete cp.submitting;
      run(
        "UPDATE wechat_drafts SET state='queued',checkpoint=? WHERE id=?",
        json(cp),
        d.id,
      );
      audit("wechat.manual-resend", d.id, {
        actor: req.user.id,
        confirmedAbsent: true,
      });
    }
    if (j.state === "canceled")
      run("UPDATE jobs SET state='failed' WHERE id=?", j.id);
    retryJob(j.id);
    return draftView(get("SELECT * FROM wechat_drafts WHERE id=?", d.id));
  });
}

const articleMatches = (item: any, article: any) =>
  ["title", "digest", "content", "thumb_media_id"].every(
    (k) => item?.[k] === article[k],
  );
export async function runWechatDraft(
  input: any,
  jobId: string,
  progress: (s: string, p: any) => void,
  signal: AbortSignal,
  client = officialWechat,
  secrets: Secrets = wechatSecrets,
) {
  const d = requireRow(
    get("SELECT * FROM wechat_drafts WHERE id=?", input.draftId),
  );
  if (d.state === "saved") return { draftId: d.id };
  const p = requireRow(
      get("SELECT * FROM wechat_previews WHERE id=?", d.preview_id),
    ),
    body = parse(p.body),
    cp = parse(d.checkpoint);
  function guard(checkNote = true) {
    signal.throwIfAborted();
    progress("wechat-working", { message: "正在处理公众号草稿" });
    const user = actor(input.actorId);
    if (d.owner_id !== user.id) err("FORBIDDEN", "任务账号与草稿不一致。", 403);
    const a = get(
      "SELECT * FROM wechat_accounts WHERE id=? AND enabled=1",
      d.account_id,
    );
    if (!a)
      err(
        "WECHAT_DISCONNECTED",
        "公众号已断开或更换，请管理员恢复原公众号连接后核对草稿。",
        409,
      );
    if (checkNote && owned("notes", p.note_id, user).revision !== p.revision)
      err("VERSION_CONFLICT", "笔记已变化，请重新预览后保存。", 409);
    return { user, a };
  }
  function checkpoint(state: string, error: string | null = null) {
    run(
      "UPDATE wechat_drafts SET state=?,checkpoint=?,error=?,updated_at=? WHERE id=?",
      state,
      json(cp),
      error,
      now(),
      d.id,
    );
  }
  try {
    const { a } = guard(!d.remote_media_id && !cp.submitting),
      secret = await secrets.get(secretName(a.id));
    if (!secret) err("WECHAT_SECRET_MISSING", "请管理员重新连接公众号。", 409);
    let mediaId = d.remote_media_id;
    if (cp.submitting && !mediaId) {
      checkpoint("unknown", "上次保存结果待确认，正在核对公众号草稿箱。");
      progress("wechat-reconcile", { message: "正在核对上次保存结果" });
      const matches = new Set<string>();
      for (let offset = 0; offset < 100; offset += 20) {
        guard(false);
        const batch = await client.list(a, secret, offset, signal);
        for (const item of batch.item || []) {
          const articles = item.content?.news_item;
          if (
            articles?.length === 1 &&
            articleMatches(articles[0], cp.article) &&
            typeof item.media_id === "string"
          )
            matches.add(item.media_id);
        }
        if (offset + 20 >= (batch.total_count || 0)) break;
      }
      if (matches.size !== 1)
        throw new WechatError(
          "WECHAT_RESULT_UNKNOWN",
          "尚未找到唯一匹配的草稿。请打开微信公众号后台核对；确认没有这篇草稿后，才能重新保存。",
          true,
        );
      mediaId = [...matches][0];
      run(
        "UPDATE wechat_drafts SET remote_media_id=? WHERE id=?",
        mediaId,
        d.id,
      );
    }
    if (!mediaId) {
      checkpoint("uploading");
      cp.images ||= {};
      for (const image of body.images) {
        const { user } = guard();
        checkMediaAsset(image.id, user);
        const bytes = assetBuffer(image.id);
        if (bytes.a.hash !== image.hash)
          err("ASSET_CORRUPT", "配图已变化，请重新预览。", 409);
        if (!cp.images[image.id]) {
          progress("wechat-images", { message: "正在上传文章配图" });
          cp.images[image.id] = await client.image(
            a,
            secret,
            bytes.data,
            false,
            signal,
          );
          checkpoint("uploading");
        }
      }
      if (!cp.cover) {
        guard();
        progress("wechat-cover", { message: "正在准备公众号封面" });
        const cover = assetBuffer(body.cover.id);
        if (cover.a.hash !== body.cover.hash)
          err("ASSET_CORRUPT", "封面已变化，请重新预览。", 409);
        cp.cover = await client.image(a, secret, cover.data, true, signal);
        checkpoint("uploading");
      }
      const $ = cheerio.load(body.html, null, false);
      $("img").each((_, el) => {
        $(el).attr(
          "src",
          cp.images[($(el).attr("src") || "").split("/").pop()!],
        );
      });
      cp.article = {
        article_type: "news",
        title: body.title,
        digest: body.summary,
        content: $.html(),
        thumb_media_id: cp.cover,
        need_open_comment: 0,
        only_fans_can_comment: 0,
      };
      if (Array.from(cp.article.content).length >= 20000 || Buffer.byteLength(cp.article.content) >= 1000000)
        err('WECHAT_ARTICLE_LIMIT','配图上传后的文章超过微信长度限制，请减少文字或配图后重新预览。',422);
      guard();
      progress("wechat-save", { message: "正在保存到公众号草稿箱" });
      // Commit intent before the external effect. A restarted job reconciles instead of blindly resending.
      cp.submitting = now();
      checkpoint("submitting");
      try {
        mediaId = await client.add(a, secret, cp.article, signal);
      } catch (e) {
        if (e instanceof WechatError && !e.uncertain) {
          delete cp.submitting;
          checkpoint("failed", e.message);
        }
        throw e;
      }
      run(
        "UPDATE wechat_drafts SET remote_media_id=?,state='verifying',updated_at=? WHERE id=?",
        mediaId,
        now(),
        d.id,
      );
    }
    guard(false);
    progress("wechat-verify", { message: "正在确认微信已收到草稿" });
    const receipt = await client.get(a, secret, mediaId, signal);
    if (
      !Array.isArray(receipt.news_item) ||
      receipt.news_item.length !== 1 ||
      !articleMatches(receipt.news_item[0], cp.article)
    )
      throw new WechatError(
        "WECHAT_RECEIPT",
        "微信回执与预览内容不一致，请打开微信后台核对；工作台不会重复创建。",
      );
    checkpoint("saved");
    audit("wechat.draft-saved", d.id, {
      actor: input.actorId,
      accountId: a.id,
      previewId: p.id,
    });
    return { draftId: d.id, saved: true };
  } catch (e: any) {
    const latest = get(
        "SELECT remote_media_id FROM wechat_drafts WHERE id=?",
        d.id,
      ),
      message =
        e instanceof WechatError || e.statusCode
          ? e.message
          : "草稿处理未完成，请重试。";
    checkpoint(
      latest.remote_media_id
        ? "verifying"
        : cp.submitting
          ? "unknown"
          : "failed",
      message,
    );
    throw new WechatError(
      e.code || "WECHAT_FAILED",
      message,
      Boolean(cp.submitting),
    );
  }
}
