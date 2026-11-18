import React, { useEffect, useRef, useState } from "react";
import { upload } from "./api";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";
export function DocumentEditor({
  text,
  documentJson,
  onChange,
  label,
  editable = true,
}: any) {
  const last = useRef(text),
    callback = useRef(onChange);
  callback.current = onChange;
  const imageInput = useRef<HTMLInputElement>(null),
    [issue, setIssue] = useState("");
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          link: { openOnClick: false, protocols: ["https", "http"] },
        }),
        TableKit,
        Image.configure({ allowBase64: false }),
        Markdown,
      ],
      content: documentJson || text,
      contentType: documentJson ? "json" : "markdown",
      editable,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          role: "textbox",
          "aria-label": label,
          "aria-multiline": "true",
        },
        handlePaste: (_view, event) => {
          if (event.clipboardData?.files.length) return true;
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        const value = editor.getMarkdown();
        last.current = value;
        callback.current?.(value, editor.getJSON());
      },
    },
    [],
  );
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);
  useEffect(() => {
    if (editor && text !== last.current) {
      editor.commands.setContent(documentJson || text, {
        contentType: documentJson ? "json" : "markdown",
        emitUpdate: false,
      });
      last.current = text;
    }
  }, [text, documentJson, editor]);
  if (!editor) return <p>正在准备编辑器…</p>;
  return (
    <div className="rich-document">
      {editable && (
        <div className="rich-toolbar" role="toolbar" aria-label="正文格式">
          {[
            ["正文", () => editor.chain().focus().setParagraph().run()],
            [
              "标题",
              () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
            ],
            ["加粗", () => editor.chain().focus().toggleBold().run()],
            ["斜体", () => editor.chain().focus().toggleItalic().run()],
            ["列表", () => editor.chain().focus().toggleBulletList().run()],
            ["编号", () => editor.chain().focus().toggleOrderedList().run()],
            ["引用", () => editor.chain().focus().toggleBlockquote().run()],
            [
              "表格",
              () =>
                editor
                  .chain()
                  .focus()
                  .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                  .run(),
            ],
            ["插入图片", () => imageInput.current?.click()],
            ["撤销", () => editor.chain().focus().undo().run()],
            ["重做", () => editor.chain().focus().redo().run()],
          ].map(([name, fn]: any) => (
            <button type="button" key={name} onClick={fn}>
              {name}
            </button>
          ))}
        </div>
      )}
      {editable && (
        <input
          hidden
          ref={imageInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="插入笔记图片"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              setIssue("");
              const a = await upload(f, "/media/uploads");
              editor
                .chain()
                .focus()
                .setImage({ src: "/api/assets/" + a.id, alt: f.name })
                .run();
            } catch (e: any) {
              setIssue(e.message);
            } finally {
              if (imageInput.current) imageInput.current.value = "";
            }
          }}
        />
      )}{" "}
      {issue && <p role="alert">{issue}</p>}
      <EditorContent editor={editor} />
    </div>
  );
}
