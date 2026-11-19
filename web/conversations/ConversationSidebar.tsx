import React, { useEffect, useState } from "react";
import {
  Search,
  Plus,
  FolderPlus,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  RotateCcw,
  ChevronDown,
  FolderInput,
  Undo2,
  Star,
} from "lucide-react";
import { api, post, patch } from "../api";
import { EditorIconButton } from "../EditorIconButton";
import { FolderTree } from "../collections/FolderTree";
export function ConversationSidebar({
  go,
  currentId = "",
  compact = false,
  refresh = 0,
}: any) {
  const [result, setResult] = useState<any>({
      items: [],
      folders: [],
      total: 0,
    }),
    [q, setQ] = useState(""),
    [folder, setFolder] = useState(""),
    [state, setState] = useState("all"),
    [offset, setOffset] = useState(0),
    [error, setError] = useState(""),
    [dialog, setDialog] = useState<any>(null),
    [value, setValue] = useState(""),
    [undo, setUndo] = useState(""),
    [epoch, setEpoch] = useState(0),
    [busy, setBusy] = useState(false);
  const root = "/collections/conversations";
  const reload = () => {
    setEpoch((n) => n + 1);
    window.dispatchEvent(new Event("ecu-conversations-changed"));
  };
  useEffect(() => {
    const fn = () => setEpoch((n) => n + 1);
    window.addEventListener("ecu-conversations-changed", fn);
    return () => window.removeEventListener("ecu-conversations-changed", fn);
  }, []);
  useEffect(() => {
    setOffset(0);
  }, [q, folder, state]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () =>
        api(
          root +
            "?" +
            new URLSearchParams({
              q,
              folder,
              state,
              offset: String(offset),
              limit: compact ? "8" : "30",
            }),
        )
          .then((r) => {
            if (live) setResult(r);
          })
          .catch((e) => live && setError(e.message)),
      160,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, folder, state, offset, epoch, refresh, currentId]);
  function edit(type: string, item: any = {}, initial = "") {
    setDialog({ type, item });
    setValue(initial);
  }
  async function batch(action: string, ids: string[], extras: any = {}) {
    setBusy(true);
    try {
      const r = await post(root + "/batch", { ids, action, ...extras });
      setUndo(r.operationId);
      setDialog(null);
      reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: any) {
    e.preventDefault();
    setBusy(true);
    try {
      if (dialog.type === "new")
        await post(root + "/folders", {
          name: value,
          parentId: dialog.item.parentId || null,
        });
      if (dialog.type === "folderRename")
        await patch(root + "/folders/" + dialog.item.id, { name: value });
      if (dialog.type === "folderDelete")
        await api(root + "/folders/" + dialog.item.id, { method: "DELETE" });
      if (dialog.type === "rename")
        await batch("rename", [dialog.item.id], { name: value });
      if (dialog.type === "move")
        await batch("move", [dialog.item.id], { folderId: value || null });
      if (dialog.type === "trash") await batch("trash", [dialog.item.id]);
      setDialog(null);
      reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const content = (
    <>
      <div className="conversation-folder-heading">
        <strong>我的对话</strong>
        <EditorIconButton
          icon={Plus}
          label="开始新对话"
          onClick={() => go("explore")}
        />
      </div>
      <label className="conversation-search">
        <Search size={15} />
        <input
          placeholder="搜索所有历史对话"
          aria-label={compact ? "侧栏搜索对话" : "搜索历史对话"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {!compact && (
        <>
          <select
            aria-label="对话范围"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="all">使用中的对话</option>
            <option value="favorite">已置顶</option>
            <option value="archived">已归档</option>
            <option value="trash">回收站</option>
          </select>
          <button
            className={"folder-label " + (!folder ? "active" : "")}
            onClick={() => setFolder("")}
          >
            全部文件夹
          </button>
          <FolderTree
            folders={result.folders}
            selected={folder}
            onSelect={setFolder}
            onCreate={(parentId: any) => edit("new", { parentId })}
            onRename={(f: any) => edit("folderRename", f, f.name)}
            onDelete={(f: any) => edit("folderDelete", f)}
            onMoveFolder={async (id: string, parentId: string) => {
              try {
                await patch(root + "/folders/" + id, { parentId });
                reload();
              } catch (e: any) {
                setError(e.message);
              }
            }}
            onMoveItems={(ids: string[], folderId: string) =>
              batch("move", ids, { folderId })
            }
          />
        </>
      )}
      {compact && result.folders.length > 0 && (
        <select
          aria-label="侧栏对话文件夹"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
        >
          <option value="">全部文件夹</option>
          {result.folders.map((f: any) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.count})
            </option>
          ))}
        </select>
      )}
      <div className="conversation-rows">
        {result.items.map((c: any) => (
          <div
            key={c.id}
            className={currentId === c.id ? "active" : ""}
            draggable
            onDragStart={(e) =>
              e.dataTransfer.setData(
                "application/ecustudio-items",
                JSON.stringify([c.id]),
              )
            }
          >
            <button
              className="conversation-open"
              onClick={() => go("explore/" + c.id)}
            >
              <span>{c.title}</span>
              <small>{c.messageCount || 0} 条消息</small>
            </button>
            {!compact && (
              <details>
                <summary aria-label={"管理对话 " + c.title}>⋯</summary>
                <div className="conversation-row-actions">
                  {state === "trash" ? (
                    <EditorIconButton
                      icon={RotateCcw}
                      label="恢复对话"
                      onClick={() => batch("restore", [c.id])}
                    />
                  ) : (
                    <>
                      <EditorIconButton
                        icon={Star}
                        label={c.collection.favorite ? "取消置顶" : "置顶对话"}
                        onClick={() =>
                          batch(
                            c.collection.favorite ? "unfavorite" : "favorite",
                            [c.id],
                          )
                        }
                      />
                      <EditorIconButton
                        icon={Pencil}
                        label="重命名对话"
                        onClick={() => edit("rename", c, c.title)}
                      />
                      <EditorIconButton
                        icon={FolderInput}
                        label="移动对话"
                        onClick={() =>
                          edit("move", c, c.collection.folder_id || "")
                        }
                      />
                      <EditorIconButton
                        icon={state === "archived" ? ArchiveRestore : Archive}
                        label={
                          state === "archived" ? "恢复到使用中" : "归档对话"
                        }
                        onClick={() =>
                          batch(
                            state === "archived" ? "unarchive" : "archive",
                            [c.id],
                          )
                        }
                      />
                      <EditorIconButton
                        icon={Trash2}
                        label="移到回收站"
                        onClick={() => edit("trash", c)}
                      />
                    </>
                  )}
                </div>
              </details>
            )}
          </div>
        ))}
      </div>
      {!result.items.length && (
        <small className="muted">
          {q ? "没有匹配的历史记录" : "对话会自动保存到这里"}
        </small>
      )}
      {!compact && (
        <div className="conversation-pages">
          {offset > 0 && (
            <button onClick={() => setOffset(Math.max(0, offset - 30))}>
              上一页
            </button>
          )}
          {result.total > offset + 30 && (
            <button onClick={() => setOffset(offset + 30)}>下一页</button>
          )}
        </div>
      )}
      {compact && (
        <a
          href="#explore"
          onClick={(e) => {
            e.preventDefault();
            go("explore");
          }}
        >
          管理全部对话与文件夹
        </a>
      )}
      {undo && (
        <button
          className="text-link"
          onClick={async () => {
            try {
              await post(root + "/undo/" + undo);
              setUndo("");
              reload();
            } catch (e: any) {
              setError(e.message);
            }
          }}
        >
          <Undo2 size={14} />
          撤销上次操作
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {dialog && (
        <div className="modal-backdrop">
          <form className="panel collection-dialog" onSubmit={submit}>
            <h3>
              {
                {
                  new: "新建文件夹",
                  folderRename: "重命名文件夹",
                  folderDelete: "删除文件夹",
                  rename: "重命名对话",
                  move: "移动对话",
                  trash: "移到回收站",
                }[dialog.type]
              }
            </h3>
            {dialog.type === "move" ? (
              <select
                aria-label="目标对话文件夹"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              >
                <option value="">未分类</option>
                {result.folders.map((f: any) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            ) : ["folderDelete", "trash"].includes(dialog.type) ? (
              <p>
                {dialog.type === "folderDelete"
                  ? "只删除文件夹，里面的对话保留在未分类。"
                  : "完整对话会保留在回收站，可随时恢复。"}
              </p>
            ) : (
              <input
                aria-label="名称"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                maxLength={100}
                autoFocus
              />
            )}
            <div className="actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setDialog(null)}
              >
                取消
              </button>
              <button className="btn" disabled={busy}>
                确认
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
  return compact ? (
    <details className="sidebar-conversations" open>
      <summary>
        <ChevronDown size={14} />
        最近对话
      </summary>
      {content}
    </details>
  ) : (
    <aside className="panel thread-panel conversation-sidebar">{content}</aside>
  );
}
