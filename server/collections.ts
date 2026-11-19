import { z } from "zod";
import {
  all,
  get,
  run,
  tx,
  id,
  now,
  json,
  parse,
  err,
  requireRow,
} from "./db.js";
import { checkMediaAsset } from "./media-access.js";
import { checkJobAccess } from "./auth.js";
import { knowledgeView, preserveNote, saveDocument } from "./knowledge.js";
import { sourceStatus } from "./lineage.js";
import { assetBuffer, extract } from "./domain.js";
import { artifactPage } from "./chat-preview.js";

const Kind = z.enum(["notes", "conversations", "artifacts"]);
type Kind = z.infer<typeof Kind>;
const Tags = z.array(z.string().trim().min(1).max(40)).max(30);
const Query = z.object({
  q: z.string().max(300).default(""),
  folder: z.string().max(100).default(""),
  tags: z.string().max(1500).default(""),
  state: z
    .enum(["all", "recent", "favorite", "archived", "trash", "needs-review"])
    .default("all"),
  format: z.string().max(20).default(""),
  project: z.string().max(100).default(""),
  since: z.string().max(30).default(""),
  sort: z.enum(["updated", "oldest", "title"]).default("updated"),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
function gate(kind: Kind, user: any, write = false) {
  if (user.role === "sales" && (kind !== "artifacts" || write))
    err("FORBIDDEN", "此账号只能查看已开放的成果", 403);
}
function meta(kind: Kind, entity: string, user: any) {
  return (
    get(
      "SELECT * FROM collection_items WHERE owner_id=? AND kind=? AND entity_id=?",
      user.id,
      kind,
      entity,
    ) || {
      owner_id: user.id,
      kind,
      entity_id: entity,
      folder_id: null,
      tags: "[]",
      favorite: 0,
      archived: 0,
      deleted: 0,
      display_name: "",
      revision: 0,
      updated_at: now(),
    }
  );
}
function putMeta(value: any) {
  run(
    "INSERT INTO collection_items(owner_id,kind,entity_id,folder_id,tags,favorite,archived,deleted,display_name,revision,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,kind,entity_id) DO UPDATE SET folder_id=excluded.folder_id,tags=excluded.tags,favorite=excluded.favorite,archived=excluded.archived,deleted=excluded.deleted,display_name=excluded.display_name,revision=excluded.revision,updated_at=excluded.updated_at",
    value.owner_id,
    value.kind,
    value.entity_id,
    value.folder_id,
    value.tags,
    value.favorite,
    value.archived,
    value.deleted,
    value.display_name,
    value.revision,
    value.updated_at,
  );
}
function access(kind: Kind, entity: string, user: any) {
  gate(kind, user);
  if (kind === "notes" || kind === "conversations") {
    const row = requireRow(
      get("SELECT * FROM " + kind + " WHERE id=?", entity),
    );
    // Personal collections never implicitly aggregate another user's private content.
    if (row.owner_id !== user.id) err("FORBIDDEN", "这项内容属于其他账号", 403);
    return row;
  }
  const a = requireRow(
    get(
      "SELECT a.*,s.name,s.size FROM artifacts a JOIN assets s ON s.id=a.asset_id WHERE a.id=?",
      entity,
    ),
  );
  const m = parse(a.manifest);
  if (m.internalChatAudio) err("FORBIDDEN", "这是内部配音片段", 403);
  if (user.role === "sales" && a.mode !== "release")
    err("FORBIDDEN", "业务员只能查看可发布成果", 403);
  if (m.ownerId && m.ownerId !== user.id && user.role !== "admin")
    err("FORBIDDEN", "无权读取其他账号的私有成果", 403);
  checkMediaAsset(a.asset_id, user);
  if (user.role !== "sales" && get("SELECT id FROM jobs WHERE id=?", a.job_id))
    checkJobAccess(a.job_id, user);
  return a;
}
function folderAccess(folderId: string, user: any, kind: Kind) {
  const f = requireRow(
    get("SELECT * FROM collection_folders WHERE id=?", folderId),
  );
  if (f.owner_id !== user.id || f.kind !== kind)
    err("FORBIDDEN", "无法使用这个文件夹", 403);
  return f;
}
function children(folders: any[], parent: string) {
  const ids = new Set([parent]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of folders)
      if (ids.has(f.parent_id) && !ids.has(f.id)) {
        ids.add(f.id);
        changed = true;
      }
  }
  return ids;
}
function rowsFor(kind: Kind, user: any) {
  gate(kind, user);
  const folders = all(
      "SELECT * FROM collection_folders WHERE owner_id=? AND kind=? ORDER BY position,name",
      user.id,
      kind,
    ),
    metadata = new Map(
      all(
        "SELECT * FROM collection_items WHERE owner_id=? AND kind=?",
        user.id,
        kind,
      ).map((m) => [m.entity_id, m]),
    );
  let rows: any[];
  if (kind === "notes")
    rows = all(
      "SELECT n.*,c.folder AS legacyFolder,c.tags AS legacyTags,c.state AS knowledgeState,c.purposes FROM notes n LEFT JOIN note_categories c ON c.note_id=n.id WHERE n.owner_id=?",
      user.id,
    );
  else if (kind === "conversations")
    rows = all(
      "SELECT c.*,(SELECT count(*) FROM messages m WHERE m.conversation_id=c.id) AS messageCount FROM conversations c WHERE owner_id=?",
      user.id,
    );
  else
    rows = all(
      `SELECT a.*,s.name,s.size,p.id AS projectId,p.title AS projectTitle FROM artifacts a JOIN assets s ON s.id=a.asset_id LEFT JOIN versions v ON v.id=a.target_id LEFT JOIN projects p ON p.id=coalesce(v.project_id,json_extract(a.manifest,'$.projectId'),a.target_id) WHERE coalesce(json_extract(a.manifest,'$.internalChatAudio'),0)=0`,
    ).filter((a) => {
      try {
        access(kind, a.id, user);
        return true;
      } catch {
        return false;
      }
    });
  return {
    folders,
    rows: rows.map((r) => {
      const m: any = metadata.get(r.id) || meta(kind, r.id, user);
      return {
        ...r,
        title: m.display_name || r.title || r.name,
        updated_at: r.updated_at || r.created_at,
        collection: { ...m, tags: parse(m.tags, []) },
        folderName:
          folders.find((f) => f.id === m.folder_id)?.name ||
          r.legacyFolder ||
          "",
        categories:
          kind === "notes"
            ? {
                folder: r.legacyFolder || "",
                tags: parse(r.legacyTags, []),
                state: r.knowledgeState || "inbox",
                purposes: parse(r.purposes, []),
              }
            : undefined,
        deleted: kind === "notes" ? r.deleted : m.deleted,
      };
    }),
  };
}
export function collectionQuery(kind: Kind, input: any, user: any) {
  const q = Query.parse(input),
    { rows, folders } = rowsFor(kind, user),
    folderIds = q.folder ? children(folders, q.folder) : null,
    terms = q.q.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean),
    tags = q.tags.split(",").filter(Boolean);
  const matchingMessages =
    kind === "conversations" && terms.length
      ? new Set(
          all(
            "SELECT DISTINCT m.conversation_id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.owner_id=? AND " +
              terms
                .map(() => "lower(m.content) LIKE ? ESCAPE '\\'")
                .join(" AND "),
            user.id,
            ...terms.map((t) => "%" + t.replace(/[\\%_]/g, "\\$&") + "%"),
          ).map((m) => m.conversation_id),
        )
      : new Set();
  const visible = rows
    .filter((r) => {
      const c = r.collection;
      if (q.state === "trash" ? !r.deleted : !!r.deleted) return false;
      if (
        q.state === "archived"
          ? !c.archived
          : q.state !== "trash" && !!c.archived
      )
        return false;
      if (q.state === "favorite" && !c.favorite) return false;
      if (q.state === "needs-review" && r.knowledgeState !== "needs-review")
        return false;
      if (
        q.folder === "unfiled"
          ? !!c.folder_id
          : folderIds && !folderIds.has(c.folder_id)
      )
        return false;
      if (tags.some((t) => !c.tags.includes(t))) return false;
      if (q.format && r.format !== q.format) return false;
      if (q.project && r.projectId !== q.project) return false;
      if (q.since && r.updated_at < q.since) return false;
      if (
        q.state === "recent" &&
        Date.parse(r.updated_at) < Date.now() - 7 * 86400000
      )
        return false;
      return (
        !terms.length ||
        matchingMessages.has(r.id) ||
        terms.every((t) =>
          [r.title, r.body || "", ...c.tags, r.folderName]
            .join(" ")
            .toLocaleLowerCase()
            .includes(t),
        )
      );
    })
    .sort((a, b) =>
      q.sort === "title"
        ? a.title.localeCompare(b.title, "zh-CN")
        : q.sort === "oldest"
          ? a.updated_at.localeCompare(b.updated_at)
          : b.updated_at.localeCompare(a.updated_at),
    );
  const countable = rows.filter((r) => !r.deleted && !r.collection.archived),
    tagCounts = new Map<string, number>();
  for (const r of countable)
    for (const t of new Set<string>(r.collection.tags))
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  const counts = {
    all: countable.length,
    recent: countable.filter(
      (r) => Date.parse(r.updated_at) > Date.now() - 7 * 86400000,
    ).length,
    favorite: countable.filter((r) => r.collection.favorite).length,
    archived: rows.filter((r) => !r.deleted && r.collection.archived).length,
    trash: rows.filter((r) => r.deleted).length,
    unfiled: countable.filter((r) => !r.collection.folder_id).length,
  };
  return {
    visible,
    query: q,
    total: visible.length,
    counts,
    folders: folders.map((f) => ({
      ...f,
      count: countable.filter((r) =>
        children(folders, f.id).has(r.collection.folder_id),
      ).length,
    })),
    tags: [...tagCounts]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  };
}
function publicItem(r: any, kind: Kind) {
  const result = {
    ...r,
    body: r.body?.slice(0, 700),
    bodyLength: r.body?.length || 0,
    sources: kind === "notes" ? parse(r.sources, []) : undefined,
  };
  if (kind === "artifacts") {
    result.manifest = parse(r.manifest);
    result.qualityCheck = parse(r.quality);
    result.sourceStatus = sourceStatus("version", r.target_id);
  }
  return result;
}
export async function registerCollections(app: any) {
  app.get("/api/workspace/preferences/:name", async (req: any) => ({
    value: parse(
      get(
        "SELECT body FROM workspace_preferences WHERE owner_id=? AND name=?",
        req.user.id,
        req.params.name,
      )?.body,
      null,
    ),
  }));
  app.put("/api/workspace/preferences/:name", async (req: any) => {
    const name = z.string().min(1).max(150).parse(req.params.name),
      b = z.object({ value: z.any() }).strict().parse(req.body);
    if (json(b.value).length > 600000)
      err("DRAFT_LIMIT", "草稿过长，请分篇保存", 422);
    run(
      "INSERT INTO workspace_preferences VALUES(?,?,?,?) ON CONFLICT(owner_id,name) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at",
      req.user.id,
      name,
      json(b.value),
      now(),
    );
    return { ok: true };
  });
  app.get("/api/collections/:kind", async (req: any) => {
    const kind = Kind.parse(req.params.kind),
      r = collectionQuery(kind, req.query, req.user);
    return {
      ...r,
      canManage: req.user.role !== "sales",
      visible: undefined,
      items: r.visible
        .slice(r.query.offset, r.query.offset + r.query.limit)
        .map((v) => publicItem(v, kind)),
      nextOffset:
        r.query.offset + r.query.limit < r.total
          ? r.query.offset + r.query.limit
          : null,
    };
  });
  app.get(
    "/api/collections/artifacts/:id/pages/:page",
    async (req: any, reply: any) => {
      const a = access("artifacts", req.params.id, req.user),
        page = await artifactPage(a.id, Number(req.params.page), req.user);
      return reply
        .header("Cache-Control", "private, no-store")
        .header("X-Page-Count", String(page.pageCount))
        .type("image/png")
        .send(page.bytes);
    },
  );
  app.get(
    "/api/collections/artifacts/:id/preview",
    async (req: any, reply: any) => {
      const a = access("artifacts", req.params.id, req.user);
      if (a.format !== "html") err("INVALID_PREVIEW", "请选择网页作品", 422);
      const { data } = assetBuffer(a.asset_id);
      return reply.header("Content-Disposition", "inline").type("text/html; charset=utf-8").send(data);
    },
  );
  app.post("/api/collections/artifacts/:id/note", async (req: any) => {
    gate("artifacts", req.user, true);
    const a = access("artifacts", req.params.id, req.user);
    if (
      [
        "mp3",
        "wav",
        "m4a",
        "mp4",
        "webm",
        "gif",
        "png",
        "jpg",
        "jpeg",
      ].includes(a.format)
    )
      return { requiresRecognition: true, assetId: a.asset_id };
    const prior = get(
      "SELECT * FROM notes WHERE owner_id=? AND deleted=0 AND EXISTS(SELECT 1 FROM json_each(sources) s WHERE json_extract(s.value,'$.artifactId')=?)",
      req.user.id,
      a.id,
    );
    if (prior) return { id: prior.id };
    const original = assetBuffer(a.asset_id),
      parsed: any = await extract(
        original.data,
        original.a.name,
        original.a.mime,
      );
    if (parsed.needsOcr)
      return { requiresRecognition: true, assetId: a.asset_id };
    if (!parsed.text.trim() || parsed.text.length > 100000)
      err("NOTE_LIMIT", "正文为空或过长，请进入识别与转写处理", 422);
    const nid = id();
    run(
      "INSERT INTO notes(id,owner_id,title,body,sources,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      nid,
      req.user.id,
      a.name,
      parsed.text,
      json([
        {
          kind: "artifact",
          artifactId: a.id,
          assetId: a.asset_id,
          title: a.name,
          sourceHash: original.a.hash,
        },
      ]),
      now(),
      now(),
    );
    return { id: nid };
  });
  app.post("/api/collections/:kind/selection", async (req: any) => {
    const kind = Kind.parse(req.params.kind);
    gate(kind, req.user, true);
    const r = collectionQuery(kind, req.body || {}, req.user);
    if (r.total > 5000)
      err("BATCH_LIMIT", "每次最多整理5000项，请缩小筛选范围", 422);
    const token = id(),
      refs = r.visible.map((v) => ({
        id: v.id,
        revision: v.collection.revision,
        contentRevision: v.revision,
      }));
    run(
      "INSERT INTO collection_selections VALUES(?,?,?,?,?)",
      token,
      req.user.id,
      kind,
      json(refs),
      now(),
    );
    return { token, count: refs.length, ids: refs.map((r) => r.id) };
  });
  app.post("/api/collections/:kind/folders", async (req: any) => {
    const kind = Kind.parse(req.params.kind);
    gate(kind, req.user, true);
    const b = z
      .object({
        name: z.string().trim().min(1).max(100),
        parentId: z.string().nullable().default(null),
      })
      .strict()
      .parse(req.body);
    if (b.parentId) folderAccess(b.parentId, req.user, kind);
    if (
      get(
        "SELECT id FROM collection_folders WHERE owner_id=? AND kind=? AND coalesce(parent_id,'')=? AND name=?",
        req.user.id,
        kind,
        b.parentId || "",
        b.name,
      )
    )
      err("FOLDER_EXISTS", "这里已有同名文件夹", 409);
    const fid = id();
    run(
      "INSERT INTO collection_folders(id,owner_id,kind,parent_id,name,created_at) VALUES(?,?,?,?,?,?)",
      fid,
      req.user.id,
      kind,
      b.parentId,
      b.name,
      now(),
    );
    return { id: fid };
  });
  app.patch("/api/collections/:kind/folders/:id", async (req: any) => {
    const kind = Kind.parse(req.params.kind);
    gate(kind, req.user, true);
    const f = folderAccess(req.params.id, req.user, kind),
      b = z
        .object({
          name: z.string().trim().min(1).max(100).optional(),
          parentId: z.string().nullable().optional(),
        })
        .strict()
        .parse(req.body),
      parent = b.parentId === undefined ? f.parent_id : b.parentId;
    if (parent) {
      folderAccess(parent, req.user, kind);
      if (
        children(
          all(
            "SELECT * FROM collection_folders WHERE owner_id=? AND kind=?",
            req.user.id,
            kind,
          ),
          f.id,
        ).has(parent)
      )
        err("FOLDER_CYCLE", "不能移动到自身或子文件夹", 422);
    }
    if (
      get(
        "SELECT id FROM collection_folders WHERE owner_id=? AND kind=? AND coalesce(parent_id,'')=? AND name=? AND id<>?",
        req.user.id,
        kind,
        parent || "",
        b.name || f.name,
        f.id,
      )
    )
      err("FOLDER_EXISTS", "目标位置已有同名文件夹", 409);
    return tx(() => {
      run(
        "UPDATE collection_folders SET name=?,parent_id=? WHERE id=?",
        b.name || f.name,
        parent,
        f.id,
      );
      if (kind === "notes" && b.name)
        run(
          "UPDATE note_categories SET folder=? WHERE note_id IN (SELECT entity_id FROM collection_items WHERE owner_id=? AND kind=? AND folder_id=?)",
          b.name,
          req.user.id,
          kind,
          f.id,
        );
      return { ok: true };
    });
  });
  app.delete("/api/collections/:kind/folders/:id", async (req: any) => {
    const kind = Kind.parse(req.params.kind);
    gate(kind, req.user, true);
    const f = folderAccess(req.params.id, req.user, kind);
    return tx(() => {
      if (kind === "notes")
        run(
          "UPDATE note_categories SET folder=? WHERE note_id IN (SELECT entity_id FROM collection_items WHERE owner_id=? AND kind=? AND folder_id=?)",
          "",
          req.user.id,
          kind,
          f.id,
        );
      run(
        "UPDATE collection_items SET folder_id=NULL,revision=revision+1 WHERE folder_id=?",
        f.id,
      );
      for (const child of all(
        "SELECT * FROM collection_folders WHERE parent_id=?",
        f.id,
      )) {
        let name = child.name,
          index = 1;
        while (
          get(
            "SELECT id FROM collection_folders WHERE owner_id=? AND kind=? AND parent_id IS NULL AND name=? AND id<>?",
            req.user.id,
            kind,
            name,
            child.id,
          )
        )
          name = child.name.slice(0, 85) + " (" + index++ + ")";
        run(
          "UPDATE collection_folders SET parent_id=NULL,name=? WHERE id=?",
          name,
          child.id,
        );
      }
      run("DELETE FROM collection_folders WHERE id=?", f.id);
      return {
        ok: true,
        message: "文件夹已删除，内容移到未分类；子文件夹保留",
      };
    });
  });
  app.post("/api/collections/:kind/batch", async (req: any) => {
    const kind = Kind.parse(req.params.kind);
    gate(kind, req.user, true);
    const b = z
      .object({
        ids: z.array(z.string()).max(5000).optional(),
        selectionToken: z.string().optional(),
        action: z.enum([
          "move",
          "addTags",
          "removeTags",
          "renameTag",
          "favorite",
          "unfavorite",
          "archive",
          "unarchive",
          "trash",
          "restore",
          "rename",
        ]),
        folderId: z.string().nullable().optional(),
        tags: Tags.optional(),
        name: z.string().trim().min(1).max(200).optional(),
      })
      .strict()
      .parse(req.body);
    if (
      b.action === "renameTag" &&
      (!b.name || b.name.length > 40 || b.tags?.length !== 1)
    )
      err("INVALID_TAG", "标签名称需在40字以内", 422);
    let refs: any[] = [];
    if (b.selectionToken) {
      const s = requireRow(
        get("SELECT * FROM collection_selections WHERE id=?", b.selectionToken),
      );
      if (
        s.owner_id !== req.user.id ||
        s.kind !== kind ||
        Date.parse(s.created_at) < Date.now() - 86400000
      )
        err("SELECTION_EXPIRED", "选择已过期，请重新选择", 409);
      refs = parse(s.body, []);
    } else refs = [...new Set(b.ids || [])].map((entity) => ({ id: entity }));
    if (!refs.length) err("EMPTY_SELECTION", "请先选择内容", 422);
    if (b.action === "rename" && (refs.length !== 1 || !b.name))
      err("RENAME_ONE", "请选择一项并填写名称", 422);
    if (b.action === "move" && b.folderId)
      folderAccess(b.folderId, req.user, kind);
    const checked = refs.map((ref) => {
      const row = access(kind, ref.id, req.user),
        m = meta(kind, ref.id, req.user);
      if (
        ref.revision !== undefined &&
        (ref.revision !== m.revision ||
          (ref.contentRevision !== undefined &&
            ref.contentRevision !== row.revision))
      )
        err("VERSION_CONFLICT", "选中的内容已有变化，请重新选择", 409);
      return { row, m };
    });
    return tx(() => {
      const before: any[] = [];
      for (const { row, m } of checked) {
        const n = { ...m, revision: m.revision + 1, updated_at: now() };
        if (b.action === "move") n.folder_id = b.folderId || null;
        if (b.action === "addTags") {
          const tags = [...new Set([...parse(m.tags, []), ...(b.tags || [])])];
          if (tags.length > 30)
            err(
              "TAG_LIMIT",
              "这次操作会让部分内容超过30个标签，请先移除不需要的标签",
              422,
            );
          n.tags = json(tags);
        }
        if (b.action === "removeTags")
          n.tags = json(
            parse(m.tags, []).filter((t: string) => !b.tags?.includes(t)),
          );
        if (b.action === "renameTag")
          n.tags = json([
            ...new Set(
              parse(m.tags, []).map((t: string) =>
                t === b.tags![0] ? b.name : t,
              ),
            ),
          ]);
        if (b.action === "favorite" || b.action === "unfavorite")
          n.favorite = b.action === "favorite" ? 1 : 0;
        if (b.action === "archive" || b.action === "unarchive")
          n.archived = b.action === "archive" ? 1 : 0;
        if (b.action === "trash" || b.action === "restore")
          n.deleted = b.action === "trash" ? 1 : 0;
        if (b.action === "rename" && kind === "artifacts")
          n.display_name = b.name!;
        const old: any = { metadata: m, afterRevision: n.revision };
        if (kind === "notes") {
          const v = knowledgeView(row);
          old.note = {
            categories: v.categories,
            deleted: row.deleted,
            title: row.title,
            afterRevision: row.revision + 1,
          };
          preserveNote(row);
          const categories = {
            ...v.categories,
            folder: n.folder_id
              ? get(
                  "SELECT name FROM collection_folders WHERE id=?",
                  n.folder_id,
                ).name
              : "",
            tags: parse(n.tags, []),
            state: n.archived
              ? "archived"
              : v.categories.state === "archived"
                ? "organized"
                : v.categories.state,
          };
          run(
            "UPDATE notes SET revision=revision+1,updated_at=?,deleted=?,title=? WHERE id=?",
            now(),
            n.deleted,
            b.action === "rename" ? b.name : row.title,
            row.id,
          );
          saveDocument(
            { ...row, revision: row.revision + 1 },
            v.documentJson,
            categories,
            true,
          );
        } else if (kind === "conversations" && b.action === "rename") {
          old.title = row.title;
          run(
            "UPDATE conversations SET title=?,updated_at=? WHERE id=?",
            b.name!.slice(0, 100),
            now(),
            row.id,
          );
        }
        putMeta(n);
        before.push(old);
      }
      const operationId = id();
      run(
        "INSERT INTO collection_operations VALUES(?,?,?, ?,0,?)",
        operationId,
        req.user.id,
        kind,
        json(before),
        now(),
      );
      return { operationId, count: before.length };
    });
  });
  app.post("/api/collections/:kind/undo/:id", async (req: any) => {
    const kind = Kind.parse(req.params.kind);
    gate(kind, req.user, true);
    const op = requireRow(
      get("SELECT * FROM collection_operations WHERE id=?", req.params.id),
    );
    if (op.owner_id !== req.user.id || op.kind !== kind)
      err("FORBIDDEN", "不能撤销其他账号的操作", 403);
    if (op.undone) err("ALREADY_UNDONE", "这次操作已撤销", 409);
    const before = parse(op.body, []);
    for (const item of before) {
      const row = access(kind, item.metadata.entity_id, req.user);
      if (
        meta(kind, row.id, req.user).revision !== item.afterRevision ||
        (item.note && row.revision !== item.note.afterRevision)
      )
        err("VERSION_CONFLICT", "操作后内容又有修改，撤销不会覆盖新内容", 409);
      if (
        item.metadata.folder_id &&
        !get(
          "SELECT 1 FROM collection_folders WHERE id=?",
          item.metadata.folder_id,
        )
      )
        err("FOLDER_REMOVED", "原文件夹已被删除，请手动选择新的位置", 409);
    }
    return tx(() => {
      for (const old of before) {
        const m = {
          ...old.metadata,
          revision: old.afterRevision + 1,
          updated_at: now(),
        };
        if (old.note) {
          const n = access(kind, m.entity_id, req.user),
            v = knowledgeView(n);
          preserveNote(n);
          run(
            "UPDATE notes SET deleted=?,title=?,revision=revision+1,updated_at=? WHERE id=?",
            old.note.deleted,
            old.note.title,
            now(),
            n.id,
          );
          saveDocument(
            { ...n, revision: n.revision + 1 },
            v.documentJson,
            old.note.categories,
            true,
          );
        }
        if (old.title)
          run(
            "UPDATE conversations SET title=? WHERE id=?",
            old.title,
            m.entity_id,
          );
        putMeta(m);
      }
      run("UPDATE collection_operations SET undone=1 WHERE id=?", op.id);
      return { ok: true };
    });
  });
}
