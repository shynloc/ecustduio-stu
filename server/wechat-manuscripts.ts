import { z } from "zod";
import {
  all,
  err,
  get,
  id,
  json,
  now,
  parse,
  requireRow,
  run,
  tx,
} from "./db.js";
import { owned } from "./explore.js";
import { preserveNote } from "./knowledge.js";
import {
  articleLayout,
  checkPendingWechatDraft,
  connection,
  draftView,
  enqueueWechatDraft,
  prepareWechat,
} from "./wechat.js";
import { wechatThemeIds } from "../shared/wechat-themes.js";
import {wechatFormatSchema} from './wechat-format.js';
import {prepareWechatCopy, articleImageZip} from './wechat-copy.js';
import { checkMediaAsset } from "./media-access.js";

const fields = z
  .object({
    title: z
      .string()
      .refine((s) => Array.from(s).length <= 32, "标题最多 32 字"),
    body: z.string().max(100000),
    palette: z.enum(wechatThemeIds),
    summary: z.string().max(120),
    coverAssetId: z.string().max(100),
    format: wechatFormatSchema.optional(),
  })
  .strict();
const empty = {
  title: "",
  body: "",
  palette: "green",
  summary: "",
  coverAssetId: "",
};
function article(aid: string, uid: string) {
  return requireRow(
    get("SELECT * FROM wechat_manuscripts WHERE id=? AND owner_id=?", aid, uid),
  );
}
function view(row: any) {
  const record =
    row.preview_id &&
    get(
      "SELECT * FROM wechat_drafts WHERE preview_id=? AND owner_id=? ORDER BY created_at DESC LIMIT 1",
      row.preview_id,
      row.owner_id,
    );
  const originPreview = row.origin.startsWith("preview:")
    ? row.origin.slice(8)
    : null;
  const chat =
    originPreview &&
    get(
      "SELECT c.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.owner_id=? AND json_extract(m.context,'$.adaptation.previewId')=? LIMIT 1",
      row.owner_id,
      originPreview,
    );
  const source = chat
    ? { route: "explore/" + chat.id, label: "返回来源对话" }
    : row.origin_note_id
      ? { route: "notes/" + row.origin_note_id, label: "查看来源笔记" }
      : null;
  return {
    source,
    id: row.id,
    revision: row.revision,
    content: parse(row.content),
    draft: record ? draftView(record) : null,
  };
}
function version(row: any, revision: number) {
  if (row.revision !== revision)
    err(
      "VERSION_CONFLICT",
      "这篇文章已在另一页面修改。可以保留此处内容为副本，或重新打开最新稿。",
      409,
    );
}
function create(
  uid: string,
  aid: string,
  content: any,
  sources: any[],
  origin = "",
  originNote: string | null = null,
  preview: string | null = null,
) {
  run(
    "INSERT INTO wechat_manuscripts(id,owner_id,revision,content,sources,origin,origin_note_id,preview_id,updated_at) VALUES(?,?,1,?,?,?,?,?,?)",
    aid,
    uid,
    json(content),
    json(sources),
    origin,
    originNote,
    preview,
    now(),
  );
  return view(article(aid, uid));
}
export function registerManuscripts(app: any, enqueue: any, client:any, secrets:any) {
  const root = "/api/wechat/manuscripts";
  app.get(root, async (req: any) =>
    all(
      "SELECT id,json_extract(content,'$.title') title,updated_at FROM wechat_manuscripts WHERE owner_id=? ORDER BY updated_at DESC,rowid DESC",
      req.user.id,
    ),
  );
  app.get(root + "/:aid", async (req: any) =>
    view(article(req.params.aid, req.user.id)),
  );
  app.post(root + "/from-note", async (req: any) => {
    const { noteId, previewId } = z
      .object({ noteId: z.string(), previewId: z.string().optional() })
      .strict()
      .parse(req.body);
    const n = owned("notes", noteId, req.user);
    const preview = previewId
      ? requireRow(
          get(
            "SELECT * FROM wechat_previews WHERE id=? AND note_id=? AND owner_id=?",
            previewId,
            noteId,
            req.user.id,
          ),
        )
      : null;
    const origin = preview
      ? "preview:" + preview.id
      : "note:" + noteId + ":" + n.revision;
    const old = get(
      "SELECT * FROM wechat_manuscripts WHERE owner_id=? AND origin=?",
      req.user.id,
      origin,
    );
    if (old) return view(old);
    const base =
      preview && preview.revision !== n.revision
        ? requireRow(
            get(
              "SELECT * FROM note_history WHERE note_id=? AND revision=?",
              noteId,
              preview.revision,
            ),
          )
        : n;
    const p = parse(preview?.body, {});
    return create(
      req.user.id,
      id(),
      {
        ...empty,
        title: Array.from(String(p.title || base.title))
          .slice(0, 32)
          .join(""),
        body: base.body,
        palette: p.palette || empty.palette,
        summary: (p.options ? p.options.summary : p.summary) || "",
        coverAssetId: (p.options ? p.options.coverAssetId : p.cover?.id) || "",
        format: p.options?.format || {},
      },
      parse(base.sources, []),
      origin,
      get(
        "SELECT origin_note_id FROM wechat_manuscripts WHERE note_id=?",
        noteId,
      )?.origin_note_id || noteId,
      preview?.id || null,
    );
  });
  app.put(root + "/:aid", async (req: any) => {
    const aid = z.string().min(8).max(100).parse(req.params.aid);
    const { revision, content, copyFrom } = z
      .object({
        revision: z.number().int().nonnegative(),
        content: fields,
        copyFrom: z.string().optional(),
      })
      .strict()
      .parse(req.body);
    if (content.coverAssetId) checkMediaAsset(content.coverAssetId, req.user);
    const row = get("SELECT * FROM wechat_manuscripts WHERE id=?", aid);
    if (!row) {
      if (revision !== 0) err("NOT_FOUND", "稿件不存在", 404);
      return create(
        req.user.id,
        aid,
        content,
        copyFrom ? parse(article(copyFrom, req.user.id).sources, []) : [],
      );
    }
    if (row.owner_id !== req.user.id) err("FORBIDDEN", "无权编辑此稿件", 403);
    if (row.content === json(content)) return view(row);
    version(row, revision);
    run(
      "UPDATE wechat_manuscripts SET content=?,revision=revision+1,preview_id=NULL,updated_at=? WHERE id=?",
      json(content),
      now(),
      aid,
    );
    return view(article(aid, req.user.id));
  });
  app.get(root + "/:aid/layout", async (req: any) => {
    const row = article(req.params.aid, req.user.id);
    version(row, Number(req.query.revision));
    const c = parse(row.content),
      { previewHtml, title } = await articleLayout(
        { ...c, title: c.title || "未命名文章", sources: parse(row.sources) },
        c,
        req.user,
      );
    return { previewHtml, title, revision: row.revision };
  });
  app.post(root + '/:aid/layout-preview',async(req:any)=>{
    const row=article(req.params.aid,req.user.id);
    const b=z.object({revision:z.number().int(),palette:z.enum(wechatThemeIds),format:wechatFormatSchema.optional()}).strict().parse(req.body);
    version(row,b.revision);
    const c={...parse(row.content),palette:b.palette,format:b.format||{}};
    const result=await articleLayout({...c,title:c.title||'未命名文章',sources:parse(row.sources)},c,req.user);
    return {previewHtml:result.previewHtml,revision:row.revision};
  });
  app.post(root+'/:aid/copy',async(req:any)=>{
    const row=article(req.params.aid,req.user.id);
    const b=z.object({revision:z.number().int(),accountId:z.string().optional()}).strict().parse(req.body);
    version(row,b.revision);
    const c=parse(row.content);
    const result=await prepareWechatCopy({...c,title:c.title||'未命名文章',sources:parse(row.sources)},c,req.user,b.accountId,client,secrets);
    version(article(req.params.aid,req.user.id),b.revision);
    return result;
  });
  app.get(root+'/:aid/images',async(req:any,reply:any)=>{
    const row=article(req.params.aid,req.user.id);version(row,Number(req.query.revision));
    const c=parse(row.content),zip=await articleImageZip({...c,title:c.title||'未命名文章',sources:parse(row.sources)},c,req.user);
    return reply.type('application/zip').header('Content-Disposition','attachment; filename="wechat-images.zip"').send(zip);
  });
  app.post(root + "/:aid/draft", async (req: any) => {
    const { revision, accountId } = z
      .object({
        revision: z.number().int(),
        accountId: z.string(),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(req.body);
    const uid = req.user.id,
      aid = req.params.aid,
      row = article(aid, uid);
    version(row, revision);
    const c = parse(row.content);
    if (connection().id !== accountId)
      err(
        "WECHAT_CONNECTION_CHANGED",
        "公众号连接已变化，请核对当前账号。",
        409,
      );
    if (!c.title.trim() || !c.body.trim())
      err("INCOMPLETE", "请填写文章标题和正文。", 422);
    if (row.preview_id) {
      const prior = get(
        "SELECT p.id FROM wechat_previews p JOIN notes n ON n.id=p.note_id WHERE p.id=? AND p.revision=n.revision",
        row.preview_id,
      );
      if (prior)
        return enqueueWechatDraft(
          { previewId: prior.id, accountId },
          req.user,
          enqueue,
        );
    }
    if (row.origin_note_id || row.note_id)
      checkPendingWechatDraft(row.origin_note_id || row.note_id, accountId);
    const n = tx(() => {
      if (!row.note_id) {
        const nid = id();
        run(
          "INSERT INTO notes(id,owner_id,title,body,sources,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
          nid,
          uid,
          c.title,
          c.body,
          row.sources,
          now(),
          now(),
        );
        run("UPDATE wechat_manuscripts SET note_id=? WHERE id=?", nid, aid);
        return { id: nid, revision: 1 };
      }
      const note = owned("notes", row.note_id, req.user);
      if (note.body === c.body && note.title === c.title) return note;
      preserveNote(note);
      run(
        "UPDATE notes SET title=?,body=?,revision=revision+1,updated_at=? WHERE id=?",
        c.title,
        c.body,
        now(),
        note.id,
      );
      return { id: note.id, revision: note.revision + 1 };
    });
    const p = await prepareWechat(
      n.id,
      { ...c, revision: n.revision },
      req.user,
    );
    version(article(aid, uid), revision);
    const draft = enqueueWechatDraft(
      { previewId: p.id, accountId },
      req.user,
      enqueue,
    );
    run("UPDATE wechat_manuscripts SET preview_id=? WHERE id=?", p.id, aid);
    return draft;
  });
}
