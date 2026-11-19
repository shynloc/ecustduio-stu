import React, { useState } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { CodeXml, Check, X } from "lucide-react";
import katex from "katex";
import sanitizeHtml from "sanitize-html";
import { marked } from "marked";
import { PreservedBlock, PreservedInline } from "../../shared/document";
import { EditorIconButton } from "../EditorIconButton";
import "katex/dist/katex.min.css";

export function protectedHtml(raw: string, kind: string, inline = false) {
  if (kind === "math")
    return katex.renderToString(raw.trim().replace(/^\$\$?|\$\$?$/g, ""), {
      throwOnError: false,
      trust: false,
      displayMode: !inline,
      strict: "ignore",
      maxExpand: 500,
    });
  if (kind === "footnote")
    return sanitizeHtml(
      marked.parse(raw.replace(/^\[\^([^\]]+)\]:?/, "〔$1〕")) as string,
      { allowedTags: sanitizeHtml.defaults.allowedTags, allowedAttributes: {} },
    );
  return sanitizeHtml(raw, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "u", "mark"]),
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["https", "http"],
    transformTags: {
      img: (_tag, attrs) => ({
        tagName: "img",
        attribs: /^\/api\/assets\/[\w-]+$/.test(attrs.src || "")
          ? attrs
          : { alt: attrs.alt || "原文图片" },
      }),
    },
  });
}
function ContentView({ node, updateAttributes, editor, selected }: any) {
  const [editing, setEditing] = useState(false),
    [raw, setRaw] = useState(node.attrs.raw),
    inline = node.type.name === "preservedInline";
  return (
    <NodeViewWrapper
      as={inline ? "span" : "div"}
      className={"preserved-content " + (selected ? "selected" : "")}
      contentEditable={false}
    >
      <span
        className="preserved-render"
        dangerouslySetInnerHTML={{
          __html: protectedHtml(node.attrs.raw, node.attrs.kind, inline),
        }}
      />
      {editor.isEditable && (
        <EditorIconButton
          icon={CodeXml}
          label="修改这段公式或嵌入内容"
          onClick={() => {
            setRaw(node.attrs.raw);
            setEditing(!editing);
          }}
        />
      )}
      {editing && (
        <span className="preserved-edit">
          <textarea
            aria-label="保真内容源文"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <EditorIconButton
            icon={Check}
            label="应用内容修改"
            onClick={() => {
              updateAttributes({ raw });
              setEditing(false);
            }}
          />
          <EditorIconButton
            icon={X}
            label="取消内容修改"
            onClick={() => setEditing(false)}
          />
        </span>
      )}
    </NodeViewWrapper>
  );
}
export const visualPreservedBlock = PreservedBlock.extend({
  addNodeView: () => ReactNodeViewRenderer(ContentView),
});
export const visualPreservedInline = PreservedInline.extend({
  addNodeView: () => ReactNodeViewRenderer(ContentView),
});
