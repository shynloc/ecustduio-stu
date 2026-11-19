import React, { useMemo } from "react";
import { marked } from "marked";
import { Answer } from "../Answer";

// Render complete Markdown blocks, keeping every original paragraph anchor.
// Tables and lists may span several source paragraphs and must not be split.
export function SourceDocument({ snapshot, selected, onSelect }: any) {
  const groups = useMemo(() => {
    let offset = 0;
    const body = snapshot.body || "",
      paragraphs = snapshot.paragraphs || [];
    const positions = paragraphs.map((p: any) => {
      let start = body.indexOf(p.text, offset);
      if (start < 0) start = offset;
      offset = start + p.text.length;
      return { ...p, start, end: offset };
    });
    offset = 0;
    return marked.lexer(body).map((token: any) => {
      const start = offset;
      offset += token.raw.length;
      return {
        raw: token.raw,
        paragraphs: positions.filter(
          (p: any) => p.start >= start && p.start < offset,
        ),
      };
    });
  }, [snapshot.id, snapshot.body]);
  return (
    <div className="source-document">
      {groups.map((g: any, i: number) => (
        <section
          key={i}
          className={
            g.paragraphs.some((p: any) => p.id === selected)
              ? "source-block selected"
              : "source-block"
          }
        >
          {g.paragraphs.map((p: any) => (
            <span key={p.id} id={p.id} className="source-anchor" />
          ))}
          <Answer text={g.raw} noteLinks sources={[{ url: snapshot.url }]} />
          {!!g.paragraphs.length && (
            <div className="source-block-links">
              {g.paragraphs.map((p: any, n: number) => (
                <button
                  type="button"
                  key={p.id}
                  className="text-link"
                  onClick={() => onSelect(p)}
                  aria-label={"引用原始资料段落 " + p.id}
                >
                  {p.page ? "第 " + p.page + " 页" : "来源段落"}
                  {g.paragraphs.length > 1 ? " · " + (n + 1) : ""}
                </button>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
