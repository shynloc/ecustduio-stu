import { z } from "zod";
import { get, run, parse, json, now, err, id } from "./db.js";
import { MarkdownManager } from "@tiptap/markdown";
import { documentExtensions } from "../shared/document.js";
import { checkMediaAsset } from "./media-access.js";
const markdown = new MarkdownManager({
  extensions: documentExtensions(),
});
export function documentBody(documentJson: any, body: string, user: any) {
  if (!documentJson) return body;
  function check(n: any) {
    if (n.type === "image") {
      const assetId = String(n.attrs.src).split("/").pop()!;
      checkMediaAsset(assetId, user);
      const a = get("SELECT mime FROM assets WHERE id=?", assetId);
      if (
        !a ||
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(a.mime)
      )
        err("INVALID_IMAGE", "图片不存在或不支持此图片格式", 422);
    }
    for (const c of n.content || []) check(c);
  }
  check(documentJson);
  const derived = markdown.serialize(documentJson);
  if (!derived.trim() || derived.length > 100000)
    err("NOTE_LIMIT", "正文为空或超过10万字符，请调整后保存", 422);
  return derived;
}
const allowed = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
  "horizontalRule",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "image",
  "preservedBlock",
  "preservedInline",
]);
export const DocumentJson = z
  .any()
  .optional()
  .superRefine((value, ctx) => {
    if (value == null) return;
    if (JSON.stringify(value).length > 1500000) {
      ctx.addIssue({ code: "custom", message: "文档结构过大" });
      return;
    }
    let count = 0;
    function visit(node: any, depth = 0) {
      if (++count > 30000 || depth > 40 || !node || !allowed.has(node.type))
        throw new Error();
      if (['preservedBlock','preservedInline'].includes(node.type) && (typeof node.attrs?.raw !== 'string' || node.attrs.raw.length > 100000 || !['html','math','footnote'].includes(node.attrs.kind))) throw new Error();
      if (
        node.type === "image" &&
        !/^\/api\/assets\/[a-zA-Z0-9_-]+$/.test(node.attrs?.src || "")
      )
        throw new Error();
      if(node.type==='image' && ((node.attrs.width!=null && (!Number.isInteger(node.attrs.width)||node.attrs.width<80||node.attrs.width>1600)) || (node.attrs.caption!=null && (typeof node.attrs.caption!=='string'||node.attrs.caption.length>500))))throw new Error();
      for (const m of node.marks || []) {
        if (
          !["bold", "italic", "strike", "code", "underline", "link", "highlight"].includes(
            m.type,
          )
        )
          throw new Error();
        if (m.type === "link" && !/^https?:\/\//.test(m.attrs?.href || ""))
          throw new Error();
      }
      for (const child of node.content || []) visit(child, depth + 1);
    }
    try {
      if (value.type !== "doc") throw new Error();
      visit(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "文档包含不支持的结构或不安全链接，请保留源文后调整",
      });
    }
  });
export const Categories = z.object({
  folder: z.string().trim().max(100).default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  purposes: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  state: z
    .enum(["inbox", "organized", "needs-review", "archived"])
    .default("inbox"),
});
export function knowledgeView(n: any) {
  const d = get(
      "SELECT * FROM note_documents WHERE note_id=? AND revision=?",
      n.id,
      n.revision,
    ),
    c = get("SELECT * FROM note_categories WHERE note_id=?", n.id);
  const sourceUpdates = parse(n.sources, [])
    .filter((s: any) => s.snapshotId)
    .map((s: any) =>
      get(
        "SELECT id,title FROM snapshots WHERE previous_id=? ORDER BY fetched_at DESC LIMIT 1",
        s.snapshotId,
      ),
    )
    .filter(Boolean);
  return {
    sourceUpdates,
    documentJson: d ? parse(d.document_json, null) : null,
    categories: c
      ? {
          folder: c.folder,
          tags: parse(c.tags, []),
          purposes: parse(c.purposes, []),
          state: c.state,
        }
      : Categories.parse({}),
  };
}
export function saveDocument(n: any, documentJson: any, categories?: any, skipCollection=false) {
  if (documentJson !== undefined) {
    run(
      "INSERT OR REPLACE INTO note_documents(note_id,revision,document_json) VALUES(?,?,?)",
      n.id,
      n.revision,
      documentJson == null ? null : json(documentJson),
    );
  }
  if (categories) {
    const c = Categories.parse(categories);
    run(
      "INSERT OR REPLACE INTO note_categories VALUES(?,?,?,?,?)",
      n.id,
      c.folder,
      json(c.tags),
      json(c.purposes),
      c.state,
    );
    if(!skipCollection){
      const owner=n.owner_id||get('SELECT owner_id FROM notes WHERE id=?',n.id)?.owner_id;
      if(owner){
        const prior=get("SELECT * FROM collection_items WHERE owner_id=? AND kind='notes' AND entity_id=?",owner,n.id);
        let folder=prior?.folder_id&&get('SELECT * FROM collection_folders WHERE id=?',prior.folder_id);
        if(folder?.name!==c.folder)folder=c.folder?get("SELECT * FROM collection_folders WHERE owner_id=? AND kind='notes' AND parent_id IS NULL AND name=?",owner,c.folder):null;
        if(c.folder&&!folder){folder={id:id()};run("INSERT INTO collection_folders(id,owner_id,kind,name,created_at) VALUES(?,?,'notes',?,?)",folder.id,owner,c.folder,now());}
        run("INSERT INTO collection_items(owner_id,kind,entity_id,folder_id,tags,archived,updated_at) VALUES(?,'notes',?,?,?,?,?) ON CONFLICT(owner_id,kind,entity_id) DO UPDATE SET folder_id=excluded.folder_id,tags=excluded.tags,archived=excluded.archived,revision=collection_items.revision+1,updated_at=excluded.updated_at",owner,n.id,folder?.id||null,json(c.tags),c.state==='archived'?1:0,now());
      }
    }
  }
}
export function preserveNote(n: any) {
  const d = get(
    "SELECT document_json FROM note_documents WHERE note_id=? AND revision=?",
    n.id,
    n.revision,
  );
  run(
    "INSERT OR IGNORE INTO note_history VALUES(?,?,?,?,?,?,?)",
    n.id,
    n.revision,
    n.title,
    n.body,
    n.sources,
    d?.document_json || null,
    now(),
  );
}
