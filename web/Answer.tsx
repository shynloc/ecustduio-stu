import React from "react";
import { marked } from "marked";
// Render Markdown as React elements. Raw HTML and unregistered links never execute.
export function Answer({ text, sources = [] }: any) {
  const links = new Set(
    sources.filter((s: any) => s.url).map((s: any) => s.url),
  );
  const inline = (tokens: any[]): any =>
    tokens?.map((t: any, i: number) => {
      const child = t.tokens ? inline(t.tokens) : t.text;
      if (t.type === "strong") return <strong key={i}>{child}</strong>;
      if (t.type === "em") return <em key={i}>{child}</em>;
      if (t.type === "codespan") return <code key={i}>{t.text}</code>;
      if (t.type === "br") return <br key={i} />;
      if (t.type === "del") return <del key={i}>{child}</del>;
      if (t.type === "link")
        return links.has(t.href) ? (
          <a key={i} href={t.href} target="_blank" rel="noreferrer">
            {child}
          </a>
        ) : (
          <React.Fragment key={i}>{child}</React.Fragment>
        );
      if (t.type === "image") return /^\/api\/assets\/[a-zA-Z0-9_-]+$/.test(t.href)?<img key={i} src={t.href} alt={t.text} loading="lazy"/>:<span key={i}>{t.text}</span>;
      return <React.Fragment key={i}>{child || t.raw}</React.Fragment>;
    });
  const blocks = (tokens: any[]): any =>
    tokens.map((t: any, i: number) => {
      if (t.type === "heading") {const Tag=('h'+Math.min(6,Math.max(2,t.depth))) as 'h2';return <Tag key={i}>{inline(t.tokens)}</Tag>;}
      if (t.type === "paragraph" || t.type === "text")
        return <p key={i}>{t.tokens ? inline(t.tokens) : t.text}</p>;
      if (t.type === "list") {
        const Tag = t.ordered ? "ol" : "ul";
        return (
          <Tag key={i}>
            {t.items.map((item: any, n: number) => (
              <li key={n}>{blocks(item.tokens)}</li>
            ))}
          </Tag>
        );
      }
      if (t.type === "blockquote")
        return <blockquote key={i}>{blocks(t.tokens)}</blockquote>;
      if (t.type === "code")
        return (
          <pre key={i}>
            <code>{t.text}</code>
          </pre>
        );
      if (t.type === "table")
        return (
          <div key={i} className="table-scroll">
            <table>
              <thead>
                <tr>
                  {t.header.map((c: any, n: number) => (
                    <th key={n}>{inline(c.tokens)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((r: any, n: number) => (
                  <tr key={n}>
                    {r.map((c: any, j: number) => (
                      <td key={j}>{inline(c.tokens)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      if (t.type === "hr") return <hr key={i} />;
      if (t.type === "space") return null;
      return <p key={i}>{t.text || t.raw}</p>;
    });
  return <div className="answer-body">{blocks(marked.lexer(text || ""))}</div>;
}
