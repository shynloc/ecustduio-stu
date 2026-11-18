import { z } from "zod";
import { get, run, parse, json, now, err } from "./db.js";
import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { checkMediaAsset } from "./media-access.js";
const markdown = new MarkdownManager({
  extensions: [StarterKit, TableKit, Image],
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
      if (
        node.type === "image" &&
        !/^\/api\/assets\/[a-zA-Z0-9_-]+$/.test(node.attrs?.src || "")
      )
        throw new Error();
      for (const m of node.marks || []) {
        if (
          !["bold", "italic", "strike", "code", "underline", "link"].includes(
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
export function saveDocument(n: any, documentJson: any, categories?: any) {
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
