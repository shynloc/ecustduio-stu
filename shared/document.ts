import { Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";

// Preserve original syntax; HTML rendering happens through a sanitized node view.
export const PreservedBlock = Node.create({
  name: "preservedBlock",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes: () => ({ raw: { default: "" }, kind: { default: "html" } }),
  parseHTML: () => [
    {
      tag: "div[data-preserved-block]",
      getAttrs: (el) => ({
        raw: el.getAttribute("data-raw") || "",
        kind: el.getAttribute("data-kind") || "html",
      }),
    },
  ],
  renderHTML: ({ node }) => [
    "div",
    {
      "data-preserved-block": "",
      "data-raw": node.attrs.raw,
      "data-kind": node.attrs.kind,
    },
    node.attrs.raw,
  ],
  markdownTokenizer: {
    name: "preservedBlock",
    level: "block",
    start: (src) => src.search(/(?:^|\n)(?:\$\$|\[\^[^\]]+\]:|<[a-z!])/i),
    tokenize(src) {
      const math = /^\$\$[\s\S]*?\$\$(?:\n|$)/.exec(src),
        foot = /^\[\^[^\]]+\]:[^\n]*(?:\n[ \t]{2,}[^\n]*)*\n?/.exec(src),
        html =
          /^<([a-z][\w-]*)\b[^>]*>[\s\S]*?<\/\1\s*>[ \t]*(?:\n|$)/i.exec(src) ||
          /^<!--[\s\S]*?-->\n?/.exec(src),
        m = math || foot || html;
      if (m)
        return {
          type: "preservedBlock",
          raw: m[0],
          kind: math ? "math" : foot ? "footnote" : "html",
        };
    },
  },
  parseMarkdown: (token) => ({
    type: "preservedBlock",
    attrs: { raw: token.raw, kind: token.kind },
  }),
  renderMarkdown: (node) => node.attrs?.raw || "",
});
export const PreservedInline = Node.create({
  name: "preservedInline",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({ raw: { default: "" }, kind: { default: "math" } }),
  parseHTML: () => [
    {
      tag: "span[data-preserved-inline]",
      getAttrs: (el) => ({
        raw: el.getAttribute("data-raw") || "",
        kind: el.getAttribute("data-kind") || "math",
      }),
    },
  ],
  renderHTML: ({ node }) => [
    "span",
    {
      "data-preserved-inline": "",
      "data-raw": node.attrs.raw,
      "data-kind": node.attrs.kind,
    },
    node.attrs.raw,
  ],
  markdownTokenizer: {
    name: "preservedInline",
    level: "inline",
    start: (src) => src.search(/\$(?!\$)|\[\^/),
    tokenize(src) {
      const math = /^\$(?!\$)([^\n$]+)\$/.exec(src),
        foot = /^\[\^[^\]]+\]/.exec(src),
        m = math || foot;
      if (m)
        return {
          type: "preservedInline",
          raw: m[0],
          kind: math ? "math" : "footnote",
        };
    },
  },
  parseMarkdown: (token) => ({
    type: "preservedInline",
    attrs: { raw: token.raw, kind: token.kind },
  }),
  renderMarkdown: (node) => node.attrs?.raw || "",
});
export const DocumentHighlight = Highlight.extend({
  markdownTokenizer: {
    name: "highlight",
    level: "inline",
    start: (src) => src.indexOf("=="),
    tokenize(src, _tokens, lexer) {
      const m = /^==([^=\n]+)==/.exec(src);
      if (m)
        return {
          type: "highlight",
          raw: m[0],
          tokens: lexer.inlineTokens(m[1]),
        };
    },
  },
  parseMarkdown: (token, helpers) =>
    helpers.applyMark("highlight", helpers.parseInline(token.tokens || [])),
  renderMarkdown: (node, helpers) => "==" + helpers.renderChildren(node) + "==",
});
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const DocumentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (e) => {
          const w = Number(e.getAttribute("width"));
          return w >= 80 && w <= 1600 ? w : null;
        },
      },
      caption: { default: "" },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const { caption, ...attrs } = HTMLAttributes;
    return [
      "figure",
      { class: "document-image" },
      ["img", attrs],
      ...(caption ? [["figcaption", {}, caption]] : []),
    ];
  },
  renderMarkdown(node) {
    const a = node.attrs || {};
    if (a.caption || a.width)
      return (
        '<figure><img src="' +
        escapeHtml(a.src || "") +
        '" alt="' +
        escapeHtml(a.alt || "") +
        '"' +
        (a.width ? ' width="' + a.width + '"' : "") +
        " />" +
        (a.caption
          ? "<figcaption>" + escapeHtml(a.caption) + "</figcaption>"
          : "") +
        "</figure>\n"
      );
    return (
      "![" + String(a.alt || "").replace(/\]/g, "\\]") + "](" + a.src + ")"
    );
  },
});
export const documentExtensions = () => [
  StarterKit.configure({
    link: { openOnClick: false, protocols: ["https", "http"] },
  }),
  TableKit.configure({ table: { resizable: true } }),
  DocumentImage.configure({ allowBase64: false }),
  DocumentHighlight,
  PreservedBlock,
  PreservedInline,
];
