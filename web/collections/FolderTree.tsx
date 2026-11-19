import React, { useState } from "react";
import {
  Folder,
  FolderOpen,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  Tag,
} from "lucide-react";
import { EditorIconButton } from "../EditorIconButton";
export function FolderTree({
  folders,
  selected,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onMoveFolder,
  onMoveItems,
}: any) {
  const [closed, setClosed] = useState<string[]>([]);
  function tree(parent: string | null = null, depth = 0): any {
    return folders
      .filter((f: any) => f.parent_id === parent)
      .map((f: any) => {
        const has = folders.some((n: any) => n.parent_id === f.id),
          open = !closed.includes(f.id);
        return (
          <div key={f.id}>
            <div
              className={"folder-row " + (selected === f.id ? "active" : "")}
              style={{ paddingLeft: depth * 12 }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/ecustudio-folder", f.id);
                e.stopPropagation();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("drop-target");
              }}
              onDragLeave={(e) =>
                e.currentTarget.classList.remove("drop-target")
              }
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.classList.remove("drop-target");
                const fid = e.dataTransfer.getData(
                  "application/ecustudio-folder",
                );
                if (fid) onMoveFolder(fid, f.id);
                else {
                  try {
                    const ids = JSON.parse(
                      e.dataTransfer.getData("application/ecustudio-items"),
                    );
                    if (Array.isArray(ids)) onMoveItems(ids, f.id);
                  } catch {}
                }
              }}
            >
              {has ? (
                <EditorIconButton
                  icon={open ? ChevronDown : ChevronRight}
                  label={(open ? "收起" : "展开") + f.name}
                  aria-expanded={open}
                  onClick={() =>
                    setClosed(
                      open
                        ? [...closed, f.id]
                        : closed.filter((x) => x !== f.id),
                    )
                  }
                />
              ) : (
                <Folder size={15} />
              )}
              <button className="folder-label" onClick={() => onSelect(f.id)}>
                <span>{f.name}</span>
                <small>{f.count}</small>
              </button>
              <details className="folder-menu">
                <summary title="管理文件夹" aria-label={"管理文件夹 " + f.name}>
                  ⋯
                </summary>
                <div>
                  <EditorIconButton
                    icon={Plus}
                    label={"在" + f.name + "内新建文件夹"}
                    onClick={() => onCreate(f.id)}
                  />
                  <EditorIconButton
                    icon={Pencil}
                    label={"重命名" + f.name}
                    onClick={() => onRename(f)}
                  />
                  <EditorIconButton
                    icon={Trash2}
                    label={"删除文件夹" + f.name}
                    onClick={() => onDelete(f)}
                  />
                </div>
              </details>
            </div>
            {open && tree(f.id, depth + 1)}
          </div>
        );
      });
  }
  return (
    <div className="folder-tree" aria-label="分类文件夹">
      <div className="collection-side-heading">
        <strong>
          <FolderOpen size={15} />
          文件夹
        </strong>
        <EditorIconButton
          icon={Plus}
          label="新建文件夹"
          onClick={() => onCreate(null)}
        />
      </div>
      {tree()}
      {!folders.length && (
        <small className="muted">添加文件夹，让资料井井有条</small>
      )}
    </div>
  );
}
