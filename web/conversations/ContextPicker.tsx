import React, { useEffect, useState } from "react";
import { Search, BookOpen, Files, X } from "lucide-react";
import { api } from "../api";
import { EditorIconButton } from "../EditorIconButton";
export function ContextPicker({
  selected,
  onChange,
  snapshots,
  onSnapshots,
  close,
}: any) {
  const [q, setQ] = useState(""),
    [kind, setKind] = useState("notes"),
    [items, setItems] = useState<any[]>([]),
    [offset, setOffset] = useState(0),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [folder, setFolder] = useState(""),
    [tag, setTag] = useState(""),
    [facets, setFacets] = useState<any>({ folders: [], tags: [] });
  useEffect(() => setOffset(0), [q, kind, folder, tag]);
  useEffect(() => {
    let live = true;
    const t = setTimeout(
      () =>
        api(
          kind === "notes"
            ? "/collections/notes?" +
                new URLSearchParams({
                  q,
                  folder,
                  tags: tag,
                  offset: String(offset),
                  limit: "40",
                })
            : "/explore/sources?q=" + encodeURIComponent(q),
        )
          .then((r) => {
            if (live) {
              setItems(kind === "notes" ? r.items : r);
              if (kind === "notes") setFacets(r);
              setTotal(kind === "notes" ? r.total : r.length);
            }
          })
          .catch((e) => live && setError(e.message)),
      160,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, kind, offset, folder, tag]);
  const ids = kind === "notes" ? selected : snapshots,
    change = kind === "notes" ? onChange : onSnapshots;
  return (
    <div className="context-dialog-backdrop">
      <section
        className="panel context-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="选择本轮资料"
      >
        <header>
          <div>
            <h3>让 AI 参考这些资料</h3>
            <small>可搜索完整知识库；较长资料会提取相关片段，原文保留。</small>
          </div>
          <EditorIconButton icon={X} label="关闭资料选择" onClick={close} />
        </header>
        <div className="actions">
          <button
            className={"btn " + (kind === "notes" ? "" : "secondary")}
            onClick={() => setKind("notes")}
          >
            <BookOpen size={16} />
            知识库
          </button>
          <button
            className={"btn " + (kind === "snapshots" ? "" : "secondary")}
            onClick={() => setKind("snapshots")}
          >
            <Files size={16} />
            原始资料
          </button>
        </div>
        <label className="collection-search">
          <Search size={16} />
          <input
            autoFocus
            aria-label="搜索上下文资料"
            placeholder="搜索标题或正文…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        {kind === "notes" && (
          <div className="form-grid">
            <select
              aria-label="上下文文件夹"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
            >
              <option value="">所有文件夹</option>
              {facets.folders.map((f: any) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.count})
                </option>
              ))}
            </select>
            <select
              aria-label="上下文标签"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            >
              <option value="">所有标签</option>
              {facets.tags.map((t: any) => (
                <option key={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="context-results">
          {items.map((n) => (
            <label key={n.id}>
              <input
                type="checkbox"
                checked={ids.includes(n.id)}
                disabled={
                  !ids.includes(n.id) &&
                  ids.length >= (kind === "notes" ? 200 : 100)
                }
                onChange={(e) =>
                  change(
                    e.target.checked
                      ? [...ids, n.id]
                      : ids.filter((x: string) => x !== n.id),
                  )
                }
              />
              <span>
                <strong>{n.title}</strong>
                <small>
                  {n.folderName || "未分类"} · {n.bodyLength || 0} 字
                  {n.revision ? " · 第 " + n.revision + " 版" : ""}
                </small>
              </span>
            </label>
          ))}
        </div>
        {error && <p role="alert">{error}</p>}
        <footer>
          <small>
            已选 {selected.length} 篇笔记、{snapshots.length} 份原始资料
          </small>
          <div>
            {kind === "notes" && offset > 0 && (
              <button onClick={() => setOffset(offset - 40)}>上一页</button>
            )}
            {kind === "notes" && offset + 40 < total && (
              <button onClick={() => setOffset(offset + 40)}>下一页</button>
            )}
            <button
              className="btn secondary"
              onClick={() => {
                onChange([]);
                onSnapshots([]);
              }}
            >
              清空选择
            </button>
            <button className="btn" onClick={close}>
              使用这些资料
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
