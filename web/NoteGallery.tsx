import React from "react";
import { BookOpen, Folder, ArrowUpRight } from "lucide-react";
import { Answer } from "./Answer";

export function NoteGallery({ notes, search, folder, onFolder, onOpen }: any) {
  const folders = [
    ...new Set<string>(
      notes.map((n: any) => n.categories?.folder).filter(Boolean),
    ),
  ].sort();
  const query = search.trim().toLocaleLowerCase();
  const visible = notes.filter(
    (n: any) =>
      (!folder || n.categories?.folder === folder) &&
      [n.title, n.body, ...(n.categories?.tags || [])]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query),
  );
  return (
    <section aria-label="我的笔记">
      <div className="notebook-tools">
        <span>
          我的笔记 <strong>{visible.length}</strong> 篇
        </span>
        <label>
          <Folder size={15} aria-hidden="true" /> 文件夹
          <select
            aria-label="筛选文件夹"
            value={folder}
            onChange={(e) => onFolder(e.target.value)}
          >
            <option value="">全部笔记</option>
            {folders.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>
      {visible.length ? (
        <div className="note-waterfall">
          {visible.map((note: any) => (
            <article className="note-card" key={note.id}>
              <div className="note-card-folder">
                <BookOpen size={14} />
                {note.categories?.folder || "未分类"}
              </div>
              <h2>
                <a
                  href={"#notes/" + note.id}
                  onClick={(e) => {
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                      e.preventDefault();
                      onOpen(note.id);
                    }
                  }}
                >
                  {note.title}
                </a>
              </h2>
              <div className="note-card-excerpt" inert>
                <Answer text={note.body.slice(0, 500)} />
              </div>
              {!!note.categories?.tags?.length && (
                <div className="note-card-tags">
                  {note.categories.tags.slice(0, 3).map((tag: string) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              )}
              <footer>
                <time dateTime={note.updated_at}>
                  {new Date(note.updated_at).toLocaleDateString("zh-CN")}
                </time>
                <span>v{note.revision}</span>
                <ArrowUpRight size={15} aria-hidden="true" />
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel notebook-empty">
          <BookOpen size={26} />
          <p>
            {notes.length
              ? "没有符合筛选条件的笔记。"
              : "还没有笔记。点击「新建笔记」写下第一篇。"}
          </p>
        </div>
      )}
    </section>
  );
}
