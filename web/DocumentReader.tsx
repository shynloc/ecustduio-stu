import React, { useState } from "react";
import { CodeXml, Eye, SquarePen } from "lucide-react";
import { EditorIconButton } from "./EditorIconButton";
import { Answer } from "./Answer";
import { MarkdownSourceEditor } from "./MarkdownSourceEditor";
import { DocumentEditor } from "./DocumentEditor";
export function DocumentReader({
  text,
  onChange,
  label = "正文",
  sources = [],
  maxLength = 500000,
  documentJson,
  markdownWorkspace = false,
}: any) {
  const [mode, setEditing] = useState<boolean>(() => !!onChange && !text);
  const editing = !!onChange && mode;
  const [source, setSource] = useState(false);
  const preserveSource = /<\/?[a-z][^>]*>|^\s*\$\$|^\[\^[^\]]+\]:/im.test(
    text || "",
  );
  return (
    <section className="document-reader" aria-label={label}>
      <div className="document-toolbar">
        <strong>{label}</strong>
        {markdownWorkspace && onChange ? (
          <div
            className="editor-mode-buttons"
            role="group"
            aria-label="笔记编辑模式"
          >
            <EditorIconButton
              label="完成编辑，阅读排版"
              icon={Eye}
              aria-pressed={!editing}
              onClick={() => setEditing(false)}
            />
            <EditorIconButton
              label="编辑正文"
              icon={SquarePen}
              disabled={preserveSource}
              aria-pressed={editing && !source && !preserveSource}
              onClick={() => {
                setSource(false);
                setEditing(true);
              }}
            />
            <EditorIconButton
              label="编辑 Markdown"
              icon={CodeXml}
              aria-pressed={editing && (source || preserveSource)}
              onClick={() => {
                setSource(true);
                setEditing(true);
              }}
            />
          </div>
        ) : (
          onChange && (
            <button
              type="button"
              className="btn secondary"
              aria-pressed={editing}
              onClick={() => {
                setSource(false);
                setEditing(!editing);
              }}
            >
              {editing ? "完成编辑，阅读排版" : "编辑正文"}
            </button>
          )
        )}
      </div>
      {editing ? (
        <>
          {preserveSource ? (
            <p className="notice">
              这段内容含嵌入HTML、公式或脚注，已保留源文编辑以避免转换丢失；阅读仍显示排版效果。
            </p>
          ) : (
            !markdownWorkspace && (
              <button
                type="button"
                className="text-link"
                onClick={() => setSource(!source)}
              >
                {source ? "返回富文本编辑" : "高级：编辑 Markdown 源文"}
              </button>
            )
          )}
          {source || preserveSource ? (
            <div className={markdownWorkspace ? "note-md-split" : undefined}>
              {markdownWorkspace ? (
                <MarkdownSourceEditor
                  label={label + "源文"}
                  text={text}
                  maxLength={maxLength}
                  onChange={(value) => onChange(value, null)}
                />
              ) : (
                <textarea
                  aria-label={label + "源文"}
                  rows={16}
                  value={text}
                  maxLength={maxLength}
                  onChange={(e) => onChange(e.target.value, null)}
                />
              )}
              {markdownWorkspace && (
                <section
                  className="note-md-preview"
                  aria-label="Markdown 实时预览"
                >
                  <small className="muted">实时预览</small>
                  <Answer text={text} sources={sources} noteLinks={markdownWorkspace} />
                </section>
              )}
            </div>
          ) : (
            <DocumentEditor
              iconToolbar={markdownWorkspace}
              key={source ? "source" : "rich"}
              text={text}
              documentJson={documentJson}
              label={label}
              onChange={(v: string, j: any) => {
                if (v.length <= maxLength) onChange(v, j);
              }}
            />
          )}
        </>
      ) : documentJson ? (
        <DocumentEditor
          text={text}
          documentJson={documentJson}
          label={label + "阅读"}
          editable={false}
        />
      ) : (
        <Answer text={text} sources={sources} noteLinks={markdownWorkspace} />
      )}
    </section>
  );
}
