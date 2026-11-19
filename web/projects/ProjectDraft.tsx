import React, { useMemo, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent,
} from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { MarkdownManager } from "@tiptap/markdown";
import { Plus, Lock, BookOpen, Pencil, Check } from "lucide-react";
import { documentExtensions } from "../../shared/document";
import { DocumentEditor } from "../DocumentEditor";
import { EditorIconButton } from "../EditorIconButton";
import { uid } from "../compat";
const manager = new MarkdownManager({ extensions: documentExtensions() });
function SectionView({ node, updateAttributes, selected }: any) {
  const [editing, setEditing] = useState(false),
    [title, setTitle] = useState(node.attrs.title);
  return (
    <NodeViewWrapper
      className={
        "project-document-section " + (node.attrs.locked ? "locked" : "")
      }
      data-project-block={node.attrs.blockId}
    >
      <div className="project-section-heading" contentEditable={false}>
        {editing ? (
          <>
            <input
              aria-label="段落标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
            />
            <EditorIconButton
              icon={Check}
              label="保存段落标题"
              onClick={() => {
                updateAttributes({ title });
                setEditing(false);
              }}
            />
          </>
        ) : (
          <>
            <h2>{node.attrs.title || "正文"}</h2>
            {node.attrs.locked ? (
              <Lock size={14} />
            ) : (
              <EditorIconButton
                icon={Pencil}
                label="修改段落标题"
                onClick={() => setEditing(true)}
              />
            )}
          </>
        )}
      </div>
      <NodeViewContent
        className="project-section-text"
        contentEditable={!node.attrs.locked}
      />
    </NodeViewWrapper>
  );
}
export const ProjectSection = Node.create({
  name: "projectSection",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      blockId: { default: "" },
      title: { default: "" },
      locked: { default: false },
    };
  },
  parseHTML() {
    return [{ tag: "section[data-project-block]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-project-block": HTMLAttributes.blockId,
      }),
      0,
    ];
  },
  renderMarkdown(node, helpers) {
    return (
      "\n## " +
      (node.attrs?.title || "正文") +
      "\n\n" +
      helpers.renderChildren(node.content) +
      "\n"
    );
  },
  addNodeView() {
    return ReactNodeViewRenderer(SectionView);
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("projectLockedSections"),
        filterTransaction(tr, state) {
          if (!tr.docChanged) return true;
          const locked = new Map<string, string>();
          state.doc.descendants((n) => {
            if (n.type.name === "projectSection" && n.attrs.locked) {
              locked.set(n.attrs.blockId, JSON.stringify(n.toJSON()));
              return false;
            }
          });
          for (const [id, before] of locked) {
            let after = "";
            tr.doc.descendants((n) => {
              if (n.type.name === "projectSection" && n.attrs.blockId === id) {
                after = JSON.stringify(n.toJSON());
                return false;
              }
            });
            if (before !== after) return false;
          }
          return true;
        },
      }),
    ];
  },
});
const projectMarkdown = new MarkdownManager({
  extensions: [...documentExtensions(), ProjectSection],
});
export function projectJson(body: any) {
  return {
    type: "doc",
    content: body.blocks.map((b: any) => ({
      type: "projectSection",
      attrs: { blockId: b.id, title: b.title, locked: b.locked },
      content: manager.parse(b.text || "").content?.length
        ? manager.parse(b.text).content
        : [{ type: "paragraph" }],
    })),
  };
}
export function projectBody(body: any, doc: any) {
  const byId = new Map(body.blocks.map((b: any) => [b.id, b])),
    blocks: any[] = [],
    outside: any[] = [];
  for (const node of doc.content || []) {
    if (node.type === "projectSection") {
      const old: any = byId.get(node.attrs.blockId);
      const block = old
        ? { ...old }
        : {
            id: node.attrs.blockId || uid(),
            claimIds: [],
            notes: "",
            locked: false,
          };
      blocks.push({
        ...block,
        title: node.attrs.title || "",
        text: manager.serialize({ type: "doc", content: node.content || [] }),
      });
    } else if (
      node.type !== "paragraph" ||
      node.content?.some((n: any) => n.type !== "text" || n.text?.trim())
    )
      outside.push(node);
  }
  if (outside.length)
    blocks.push({
      id: uid(),
      title: "补充内容",
      text: manager.serialize({ type: "doc", content: outside }),
      claimIds: [],
      notes: "",
      locked: false,
    });
  return {
    ...body,
    blocks: blocks.length
      ? blocks
      : [
          {
            id: uid(),
            title: "正文",
            text: "",
            claimIds: [],
            notes: "",
            locked: false,
          },
        ],
  };
}
export function ProjectDraft({ body, onChange, claims = [] }: any) {
  const json = useMemo(() => projectJson(body), [body]),
    text = projectMarkdown.serialize(json);
  return (
    <div className="continuous-project-document">
      <p className="project-draft-guide">
        像编辑一篇文章一样直接修改。小标题用于组织内容；保存为新版本后，可以选择哪些作品需要重新制作，已有作品会保留。
      </p>
      <DocumentEditor
        text={text}
        documentJson={json}
        extraExtensions={[ProjectSection]}
        label="项目连续正文"
        onChange={(_md: string, doc: any) => onChange(projectBody(body, doc))}
        extraToolbar={(editor: any) => (
          <EditorIconButton
            icon={Plus}
            label="添加新段落"
            onClick={() =>
              editor
                .chain()
                .focus("end")
                .insertContentAt(editor.state.doc.content.size, {
                  type: "projectSection",
                  attrs: { blockId: uid(), title: "新段落", locked: false },
                  content: [{ type: "paragraph" }],
                })
                .run()
            }
          />
        )}
      />
      <details className="project-reference-details">
        <summary>
          <BookOpen size={15} />
          查看引用、备注与锁定状态
        </summary>
        {body.blocks.map((b: any) => (
          <section key={b.id}>
            <strong>
              {b.title || "正文"} {b.locked ? "· 已锁定" : ""}
            </strong>
            <p>
              这段内容引用 {b.claimIds.length}{" "}
              条事实；修改文字不会自动改变引用。
            </p>
            {b.claimIds.map((cid: string) => (
              <p key={cid}>
                {claims.find((c: any) => c.id === cid)?.text || "来源暂不可用"}
              </p>
            ))}
            {b.notes && <p>备注：{b.notes}</p>}
          </section>
        ))}
      </details>
    </div>
  );
}
