import { useRef, useState } from "react";
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Link2,
  ImagePlus,
  Table,
  SquareCode,
  Check,
  X,
  Heading2,
  List,
  ListOrdered,
  Quote,
} from "lucide-react";
import { useMarkdownHistory } from "./useMarkdownHistory";
import { EditorIconButton } from "./EditorIconButton";

import { upload } from "./api";

const actions = [
  ["bold", "加粗", Bold],
  ["italic", "斜体", Italic],
  ["heading", "二级标题", Heading2],
  ["quote", "引用", Quote],
  ["bullet", "无序列表", List],
  ["ordered", "有序列表", ListOrdered],
  ["link", "插入链接", Link2],
  ["image", "插入图片", ImagePlus],
  ["table", "插入表格", Table],
  ["code", "插入代码块", SquareCode],
] as const;
type Format = (typeof actions)[number][0];

function replaceRange(
  from: number,
  to: number,
  insert: string,
  offset = insert.length,
  length = 0,
) {
  return {
    from,
    to,
    insert,
    selectFrom: from + offset,
    selectTo: from + offset + length,
  };
}

function labelText(value: string) {
  return value.replace(/[\\[\]*_`<>~&]/g, "\\$&").replace(/\r?\n/g, " ");
}

function hasEmphasis(left: string, right: string, mark: string) {
  let stars = 0;
  while (left[left.length - 1 - stars] === "*" && right[stars] === "*") stars++;
  return mark === "*" ? stars % 2 === 1 : stars >= 2;
}

function formatSelection(
  value: string,
  start: number,
  end: number,
  format: Exclude<Format, "link" | "image">,
) {
  const selected = value.slice(start, end);
  if (format === "bold" || format === "italic") {
    const mark = format === "bold" ? "**" : "*";
    const size = mark.length;
    if (hasEmphasis(value.slice(0, start), value.slice(end), mark)) {
      return replaceRange(
        start - size,
        end + size,
        selected,
        0,
        selected.length,
      );
    }
    if (!selected) return replaceRange(start, end, mark + mark, size);
    const insert = selected
      .split("\n")
      .map((line) => {
        const content = line.trim();
        if (!content) return line;
        const offset = line.indexOf(content);
        const unwrap =
          content.length > 2 * size && hasEmphasis(content, content, mark);
        const formatted = unwrap
          ? content.slice(size, -size)
          : mark + content + mark;
        return (
          line.slice(0, offset) +
          formatted +
          line.slice(offset + content.length)
        );
      })
      .join("\n");
    const wrapped =
      !selected.includes("\n") && insert === mark + selected + mark;
    return replaceRange(
      start,
      end,
      insert,
      wrapped ? size : 0,
      wrapped ? selected.length : insert.length,
    );
  }
  if (format === "code" || format === "table") {
    const before = value.slice(0, start),
      after = value.slice(end);
    const prefix =
      before && !before.endsWith("\n\n")
        ? before.endsWith("\n")
          ? "\n"
          : "\n\n"
        : "";
    const suffix =
      after && !after.startsWith("\n\n")
        ? after.startsWith("\n")
          ? "\n"
          : "\n\n"
        : "";
    if (format === "code") {
      let longest = 0;
      for (const run of selected.matchAll(/`+/g))
        longest = Math.max(longest, run[0].length);
      const fence = "`".repeat(Math.max(3, longest + 1)),
        code = selected || "代码";
      const block =
        fence + "\n" + code + (code.endsWith("\n") ? "" : "\n") + fence;
      return replaceRange(
        start,
        end,
        prefix + block + suffix,
        prefix.length + fence.length + 1,
        code.length,
      );
    }
    const rows = (selected || "内容")
      .split("\n")
      .map((line) => "| " + line.replace(/[\\|]/g, "\\$&") + " |  |");
    const block = ["| 列一 | 列二 |", "| --- | --- |", ...rows].join("\n");
    return replaceRange(
      start,
      end,
      prefix + block + suffix,
      prefix.length + 2,
      2,
    );
  }

  const from = value.slice(0, start).lastIndexOf("\n") + 1;
  // A selection ending at the next line's start doesn't include that line.
  const last = end > start ? end - 1 : end;
  const newline = value.indexOf("\n", last);
  const to = newline < 0 ? value.length : newline;
  const lines = value.slice(from, to).split("\n");
  const marker = {
    heading: /^#{1,6}(?:[ \t]+|$)/,
    quote: /^> ?/,
    bullet: /^(?:[-*+]|\d+[.)])[ \t]+/,
    ordered: /^(?:[-*+]|\d+[.)])[ \t]+/,
  }[format];
  const prefix = { heading: "## ", quote: "> ", bullet: "- ", ordered: "" }[
    format
  ];
  let number = 0;
  const transformed = lines.map((line) => {
    if (lines.length > 1 && !line.trim()) return line;
    const indent = line.match(/^[ \t]*/)[0];
    const content = line.slice(indent.length).replace(marker, "");
    return indent + (format === "ordered" ? ++number + ". " : prefix) + content;
  });
  const insert = transformed.join("\n");
  const caret = Math.max(from, start + transformed[0].length - lines[0].length);
  return {
    from,
    to,
    insert,
    selectFrom: start === end ? caret : from,
    selectTo: start === end ? caret : from + insert.length,
  };
}

type Props = {
  text: string;
  label: string;
  maxLength: number;
  imageLabel?:string;
  placeholder?:string;
  onChange: (text: string) => void;
};

export function MarkdownSourceEditor({
  text,
  label,
  maxLength,
  imageLabel="选择笔记图片",
  placeholder,
  onChange,
}: Props) {
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const history = useMarkdownHistory(input, text, onChange);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState<{
    start: number;
    end: number;
    text: string;
  } | null>(null);
  const [address, setAddress] = useState("");
  const [uploading, setUploading] = useState(false);

  function commit(
    el: HTMLTextAreaElement,
    edit: ReturnType<typeof replaceRange>,
  ) {
    if (
      el.value.length - (edit.to - edit.from) + edit.insert.length >
      maxLength
    ) {
      setMessage("添加格式后会超出正文长度限制。");
      return;
    }
    setMessage("");
    el.focus({ preventScroll: true });
    history.toolbarEdit(el, edit);
  }
  function apply(format: Format) {
    const el = input.current;
    if (!el || composing.current) return;
    const start = el.selectionStart,
      end = el.selectionEnd;
    setMessage("");
    if (format === "link") {
      setAddress("");
      setLink({ start, end, text: el.value.slice(start, end) });
    } else if (format === "image") {
      fileInput.current?.click();
    } else {
      commit(el, formatSelection(el.value, start, end, format));
    }
  }

  function insertLink() {
    const el = input.current;
    if (!el || !link) return;
    let url: URL;
    try {
      url = new URL(address.trim());
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      setMessage("请输入以 https:// 或 http:// 开头的网址。");
      return;
    }
    const caption = labelText(link.text || url.href);
    const target = url.href.replace(/[()]/g, "\\$&");
    setLink(null);
    commit(
      el,
      replaceRange(
        link.start,
        link.end,
        "[" + caption + "](" + target + ")",
        1,
        caption.length,
      ),
    );
  }

  async function insertImage(file?: File) {
    const el = input.current;
    if (!file || !el) return;
    const original = el.value,
      start = el.selectionStart,
      end = el.selectionEnd;
    const alt = labelText(original.slice(start, end) || file.name);
    setUploading(true);
    try {
      const asset = await upload(file, "/media/uploads");
      if (input.current !== el) return;
      // If typing continued during the upload, keep those edits and insert at the current caret.
      const from = original === el.value ? start : el.selectionEnd;
      const to = original === el.value ? end : from;
      commit(
        el,
        replaceRange(from, to, "![" + alt + "](/api/assets/" + asset.id + ")"),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "图片上传失败，请重试。",
      );
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="note-md-input">
      <div
        className="rich-toolbar"
        role="toolbar"
        aria-label="Markdown 源文格式"
        onKeyDown={history.shortcut}
      >
        {actions.map(([format, name, icon]) => (
          <EditorIconButton
            key={format}
            label={name}
            icon={icon}
            disabled={!!link || uploading}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => apply(format)}
          />
        ))}
        <EditorIconButton
          icon={Undo2}
          label="撤销"
          title="撤销 (⌘Z)"
          aria-keyshortcuts="Meta+Z Control+Z"
          disabled={!!link || !history.available.undo}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => history.move("undo")}
        />
        <EditorIconButton
          icon={Redo2}
          label="重做"
          title="重做 (⌘⇧Z)"
          aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z"
          disabled={!!link || !history.available.redo}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => history.move("redo")}
        />
      </div>
      {link && (
        <form
          className="note-md-link"
          onSubmit={(event) => {
            event.preventDefault();
            insertLink();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setLink(null);
              setMessage("");
              input.current?.focus();
            }
          }}
        >
          <input
            autoFocus
            aria-label="链接地址"
            placeholder="https://"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
          <EditorIconButton type="submit" icon={Check} label="确认插入链接" />
          <EditorIconButton
            icon={X}
            label="取消插入链接"
            onClick={() => {
              setLink(null);
              setMessage("");
              input.current?.focus();
            }}
          />
        </form>
      )}
      <input
        ref={fileInput}
        hidden
        type="file"
        aria-label={imageLabel}
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void insertImage(file);
        }}
      />
      {uploading && <small role="status">正在上传图片…</small>}
      <textarea
        ref={input}
        aria-label={label}
        placeholder={placeholder}
        rows={16}
        value={text}
        maxLength={maxLength}
        onKeyDown={history.shortcut}
        onCompositionStart={(event) => {
          history.startComposition(event.currentTarget);
          composing.current = true;
        }}
        onCompositionEnd={(event) => {
          history.endComposition(event.currentTarget);
          composing.current = false;
        }}
        onChange={(event) => {
          setMessage("");
          setLink(null);
          history.inputChanged(
            event.currentTarget,
            (event.nativeEvent as InputEvent).inputType,
          );
        }}
      />
      {message && <small role="status">{message}</small>}
    </div>
  );
}
