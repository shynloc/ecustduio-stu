import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import {
  BookOpen,
  FileText,
  Search,
  LayoutGrid,
  List,
  PanelLeftClose,
  PanelLeftOpen,
  CheckSquare,
  Square,
  Folder,
  Tags,
  Star,
  Archive,
  Trash2,
  MessageSquare,
  RefreshCw,
  Undo2,
  ArrowLeft,
  ArrowRight,
  Download,
  Plus,
  Check,
  X,
  RotateCcw,
  PenLine,
} from "lucide-react";
import { api, post, patch } from "../api";
import { Answer } from "../Answer";
import { carry } from "../context";
import { EditorIconButton } from "../EditorIconButton";
import { FolderTree } from "./FolderTree";
import { usePreferences } from "./usePreferences";

export function CollectionBrowser({
  kind,
  go,
  onOpen,
  search = "",
  renderActions,
  renderPreview,
  projectId = "",
  projects = [],
}: any) {
  const [preferences, setPreferences] = usePreferences("collection-" + kind, {
    view: "cards",
    sidebar: true,
    sort: "updated",
  });
  const [project, setProject] = useState(projectId);
  const [query, setQuery] = useState(search),
    [folder, setFolder] = useState(""),
    [tags, setTags] = useState<string[]>([]),
    [state, setState] = useState("all"),
    [format, setFormat] = useState(""),
    [since, setSince] = useState(""),
    [offset, setOffset] = useState(0);
  const [result, setResult] = useState<any>({
      items: [],
      total: 0,
      folders: [],
      tags: [],
      counts: {},
    }),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [undo, setUndo] = useState(""),
    [dialog, setDialog] = useState<any>(null),
    [value, setValue] = useState("");
  const filters = useMemo(
    () => ({
      q: query,
      folder,
      tags: tags.join(","),
      state,
      format,
      since,
      sort: preferences.sort,
      project,
    }),
    [query, folder, tags, state, format, since, preferences.sort, project],
  );
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    setLoading(true);
    try {
      const r = await api(
        "/collections/" +
          kind +
          "?" +
          new URLSearchParams({
            ...filters,
            offset: String(offset),
            limit: "24",
          }),
      );
      if (seq !== sequence.current) return;
      setResult(r);
      setError("");
    } catch (e: any) {
      if (seq === sequence.current) setError(e.message);
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }, [kind, filters, offset]);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      if (live) void load();
    }, 180);
    return () => {
      live = false;
      sequence.current++;
      clearTimeout(t);
    };
  }, [load]);
  useEffect(() => {
    setQuery(search);
  }, [search]);
  useEffect(() => {
    setOffset(0);
    setSelected([]);
    setToken("");
  }, [filters]);
  const endpoint = "/collections/" + kind,
    canManage = result.canManage !== false;
  async function run(action: string, extras: any = {}, ids?: string[]) {
    setBusy(true);
    setError("");
    try {
      const r = await post(endpoint + "/batch", {
        action,
        ...extras,
        ...(ids
          ? { ids }
          : token
            ? { selectionToken: token }
            : { ids: selected }),
      });
      setUndo(r.operationId);
      setMessage("已处理 " + r.count + " 项，可撤销");
      setDialog(null);
      setSelected([]);
      setToken("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function openDialog(type: string, extra: any = {}, initial = "") {
    setValue(initial);
    setDialog({ type, ...extra });
  }
  async function submitDialog(e: any) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (dialog.type === "create")
        await post(endpoint + "/folders", {
          name: value,
          parentId: dialog.parentId,
        });
      else if (dialog.type === "renameFolder")
        await patch(endpoint + "/folders/" + dialog.folder.id, { name: value });
      else if (dialog.type === "deleteFolder")
        await api(endpoint + "/folders/" + dialog.folder.id, {
          method: "DELETE",
        });
      else if (dialog.type === "move") {
        await run("move", { folderId: value || null });
        return;
      } else if (["addTags", "removeTags"].includes(dialog.type)) {
        await run(dialog.type, {
          tags: value
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean),
        });
        return;
      } else if (dialog.type === "rename") {
        await run("rename", { name: value }, [dialog.item.id]);
        return;
      } else if (dialog.type === "renameTag") {
        const s = await post(endpoint + "/selection", { tags: dialog.tag });
        const r = await post(endpoint + "/batch", {
          selectionToken: s.token,
          action: "renameTag",
          tags: [dialog.tag],
          name: value,
        });
        setUndo(r.operationId);
        setTags((v) => v.map((t) => (t === dialog.tag ? value : t)));
      }
      setDialog(null);
      await load();
      setMessage("已保存");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function moveFolder(id: string, parentId: string) {
    try {
      await patch(endpoint + "/folders/" + id, { parentId });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function allMatching() {
    try {
      const s = await post(endpoint + "/selection", filters);
      setSelected(s.ids);
      setToken(s.token);
    } catch (e: any) {
      setError(e.message);
    }
  }
  const toggle = (id: string) => {
    setToken("");
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  };
  async function pack() {
    setBusy(true);
    try {
      if (selected.length > 50)
        throw new Error("每次打包最多50件作品，请减少选择");
      const a = await post("/pipeline/bundle", { artifactIds: selected });
      setMessage("打包完成");
      window.open("/api/artifacts/" + a.id + "/download", "_blank");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={
        "collection-workspace " + (!preferences.sidebar ? "sidebar-closed" : "")
      }
      aria-label={kind === "notes" ? "知识库管理" : "成果管理"}
    >
      <div className="collection-toolbar">
        <EditorIconButton
          icon={preferences.sidebar ? PanelLeftClose : PanelLeftOpen}
          label={preferences.sidebar ? "收起分类侧栏" : "展开分类侧栏"}
          onClick={() =>
            setPreferences({ ...preferences, sidebar: !preferences.sidebar })
          }
        />
        <label className="collection-search">
          <Search size={17} />
          <input
            aria-label={kind === "notes" ? "搜索知识库" : "搜索成果"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题、正文、标签…"
          />
        </label>
        <div className="collection-view">
          <EditorIconButton
            icon={LayoutGrid}
            label="卡片视图"
            aria-pressed={preferences.view === "cards"}
            onClick={() => setPreferences({ ...preferences, view: "cards" })}
          />
          <EditorIconButton
            icon={List}
            label="列表视图"
            aria-pressed={preferences.view === "list"}
            onClick={() => setPreferences({ ...preferences, view: "list" })}
          />
          <EditorIconButton icon={RefreshCw} label="刷新内容" onClick={load} />
        </div>
      </div>
      <aside className="collection-sidebar" hidden={!preferences.sidebar}>
        <div className="collection-views">
          {[
            ["all", "全部内容", BookOpen],
            ["recent", "最近七天", RefreshCw],
            ["favorite", "收藏", Star],
            ["archived", "已归档", Archive],
            ["trash", "回收站", Trash2],
          ].map(([v, label, Icon]: any) => (
            <button
              key={v}
              className={state === v && !folder && !tags.length ? "active" : ""}
              onClick={() => {
                setState(v);
                setFolder("");
                setTags([]);
              }}
            >
              <Icon size={16} />
              {label}
              <small>{result.counts[v] || 0}</small>
            </button>
          ))}
        </div>
        {canManage ? (
          <FolderTree
            folders={result.folders}
            selected={folder}
            onSelect={(id: string) => {
              setFolder(id);
              setState("all");
            }}
            onCreate={(parentId: string | null) =>
              openDialog("create", { parentId })
            }
            onRename={(f: any) =>
              openDialog("renameFolder", { folder: f }, f.name)
            }
            onDelete={(f: any) => openDialog("deleteFolder", { folder: f })}
            onMoveFolder={moveFolder}
            onMoveItems={(ids: string[], folderId: string) =>
              run("move", { folderId }, ids)
            }
          />
        ) : null}
        <button
          className="folder-unfiled"
          onClick={() => {
            setFolder("unfiled");
            setState("all");
          }}
        >
          <Folder size={15} />
          未分类 <small>{result.counts.unfiled || 0}</small>
        </button>
        <div className="collection-side-heading">
          <strong>
            <Tags size={15} />
            标签
          </strong>
          <small>仅统计可见内容</small>
        </div>
        <div className="collection-tags">
          {result.tags.map((t: any) => (
            <div key={t.name}>
              <button
                className={tags.includes(t.name) ? "active" : ""}
                onClick={() =>
                  setTags(
                    tags.includes(t.name)
                      ? tags.filter((x) => x !== t.name)
                      : [...tags, t.name],
                  )
                }
              >
                #{t.name}
                <small>{t.count}</small>
              </button>
              {canManage && (
                <EditorIconButton
                  icon={PenLine}
                  label={"重命名或合并标签 " + t.name}
                  onClick={() =>
                    openDialog("renameTag", { tag: t.name }, t.name)
                  }
                />
              )}
            </div>
          ))}
          {!result.tags.length && (
            <small className="muted">选择内容后，可批量添加标签</small>
          )}
        </div>
      </aside>
      <div className="collection-main">
        <div className="collection-filters">
          <strong>
            {result.total} 项{loading ? " · 正在更新…" : ""}
          </strong>
          {(folder || tags.length > 0 || query || since || format) && (
            <button
              className="text-link"
              onClick={() => {
                setFolder("");
                setTags([]);
                setQuery("");
                setSince("");
                setFormat("");
              }}
            >
              清除筛选
            </button>
          )}
          <label>
            排序
            <select
              aria-label="内容排序"
              value={preferences.sort}
              onChange={(e) =>
                setPreferences({ ...preferences, sort: e.target.value })
              }
            >
              <option value="updated">最近更新</option>
              <option value="oldest">最早更新</option>
              <option value="title">名称</option>
            </select>
          </label>
          <label>
            起始日期
            <input
              aria-label="筛选起始日期"
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
            />
          </label>
          {kind === "artifacts" && !projectId && (
            <select
              aria-label="按项目筛选"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">所有项目</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}
          {kind === "artifacts" && (
            <select
              aria-label="筛选成果格式"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="">所有格式</option>
              {[
                "docx",
                "pdf",
                "pptx",
                "html",
                "gif",
                "mp4",
                "mp3",
                "wav",
                "zip",
                "md",
                "txt",
                "png",
                "jpg",
                "csv",
              ].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          )}
        </div>
        {!!tags.length && (
          <p className="collection-selected-tags">
            {tags.map((t) => (
              <button
                key={t}
                onClick={() => setTags(tags.filter((x) => x !== t))}
              >
                #{t} ×
              </button>
            ))}
          </p>
        )}
        {canManage && (
          <div className="collection-selection">
            <button
              className="text-link"
              onClick={() => {
                const ids = result.items.map((r: any) => r.id);
                setToken("");
                setSelected(
                  selected.length &&
                    ids.every((id: string) => selected.includes(id))
                    ? selected.filter((id) => !ids.includes(id))
                    : [...new Set([...selected, ...ids])],
                );
              }}
            >
              <CheckSquare size={16} />
              选择本页
            </button>
            <button
              className="text-link"
              disabled={loading || busy}
              onClick={allMatching}
            >
              选择全部筛选结果
            </button>
            {selected.length > 0 && (
              <button
                className="text-link"
                onClick={() => {
                  setSelected([]);
                  setToken("");
                }}
              >
                清空选择
              </button>
            )}
          </div>
        )}
        {selected.length > 20 && kind === "notes" && (
          <p className="muted">
            对话每次可参考200份资料；整套作品制作每次20份。分类管理不受这个数量限制。
          </p>
        )}
        {selected.length > 0 && (
          <div className="bulk-action-bar" role="toolbar" aria-label="批量操作">
            <strong>已选 {selected.length} 项</strong>
            {kind === "notes" && (
              <>
                <button
                  className="btn"
                  disabled={selected.length > 200 || state === "trash"}
                  onClick={() =>
                    carry(
                      go,
                      "explore",
                      selected.map((id) => ({ kind: "note", id })),
                      "explore",
                    )
                  }
                >
                  <MessageSquare size={15} />
                  带入对话
                </button>
                <button
                  className="btn secondary"
                  disabled={selected.length > 20 || state === "trash"}
                  onClick={() =>
                    carry(
                      go,
                      "deliver",
                      selected.map((id) => ({ kind: "note", id })),
                    )
                  }
                >
                  开始创作
                </button>
              </>
            )}
            {kind === "artifacts" && (
              <button className="btn" disabled={busy} onClick={pack}>
                <Download size={15} />
                打包下载
              </button>
            )}
            <EditorIconButton
              icon={Folder}
              label="移动到文件夹"
              onClick={() => openDialog("move")}
            />
            <EditorIconButton
              icon={Tags}
              label="添加标签"
              onClick={() => openDialog("addTags")}
            />
            <EditorIconButton
              icon={X}
              label="移除标签"
              onClick={() => openDialog("removeTags")}
            />
            <EditorIconButton
              icon={Star}
              label={state === "favorite" ? "取消收藏" : "收藏所选"}
              onClick={() =>
                run(state === "favorite" ? "unfavorite" : "favorite")
              }
            />
            <EditorIconButton
              icon={Archive}
              label={state === "archived" ? "移出归档" : "归档所选"}
              onClick={() =>
                run(state === "archived" ? "unarchive" : "archive")
              }
            />
            {state === "trash" ? (
              <EditorIconButton
                icon={RotateCcw}
                label="恢复所选"
                onClick={() => run("restore")}
              />
            ) : (
              <EditorIconButton
                icon={Trash2}
                label="移到回收站"
                onClick={() => run("trash")}
              />
            )}
          </div>
        )}
        {(message || undo) && (
          <div className="collection-feedback" role="status">
            {message}
            {undo && (
              <button
                className="text-link"
                disabled={busy}
                onClick={async () => {
                  try {
                    await post(endpoint + "/undo/" + undo);
                    setUndo("");
                    setMessage("已撤销");
                    await load();
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                <Undo2 size={15} />
                撤销这次操作
              </button>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="notice warning">
            {error}
          </p>
        )}
        {dialog && (
          <form className="collection-dialog" onSubmit={submitDialog}>
            <strong>
              {
                {
                  create: "新建文件夹",
                  renameFolder: "重命名文件夹",
                  deleteFolder: "删除文件夹",
                  move: "移动到文件夹",
                  addTags: "添加标签",
                  removeTags: "移除标签",
                  rename: "修改名称",
                  renameTag: "重命名或合并标签",
                }[dialog.type] as string
              }
            </strong>
            {dialog.type === "deleteFolder" ? (
              <p>
                删除「{dialog.folder.name}」后，内容移到未分类，子文件夹保留。
              </p>
            ) : dialog.type === "move" ? (
              <select
                aria-label="目标文件夹"
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
            ) : (
              <input
                autoFocus
                aria-label="名称或标签"
                required
                value={value}
                maxLength={dialog.type.includes("Tag") ? 200 : 100}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  dialog.type.includes("Tags")
                    ? "多个标签用逗号分隔"
                    : "填写名称"
                }
              />
            )}
            <div className="button-row">
              <button className="btn" disabled={busy}>
                确定
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setDialog(null)}
              >
                取消
              </button>
            </div>
          </form>
        )}
        <div className={"collection-items " + preferences.view}>
          {result.items.map((item: any) => (
            <article
              key={item.id}
              className={
                "collection-card " +
                (selected.includes(item.id) ? "selected" : "")
              }
              draggable={canManage}
              onDragStart={(e) =>
                e.dataTransfer.setData(
                  "application/ecustudio-items",
                  JSON.stringify(
                    selected.includes(item.id) ? selected : [item.id],
                  ),
                )
              }
            >
              <div className="collection-card-top">
                {canManage && (
                  <input
                    type="checkbox"
                    aria-label={"选择 " + item.title}
                    checked={selected.includes(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                )}
                <small>{item.folderName || "未分类"}</small>
                {item.format && (
                  <span className="format-badge">
                    {item.format.toUpperCase()}
                  </span>
                )}
                {!!item.collection.favorite && <Star size={14} />}
              </div>
              <h2>
                <button onClick={() => onOpen?.(item.id, item)}>
                  {item.title}
                </button>
              </h2>
              {kind === "notes" && (
                <div className="collection-excerpt" inert>
                  <Answer text={item.body || ""} />
                </div>
              )}
              {renderPreview?.(item)}
              <div className="collection-item-tags">
                {item.collection.tags.map((tag: string) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
              <div className="collection-card-meta">
                <time>
                  {new Date(item.updated_at).toLocaleDateString("zh-CN")}
                </time>
                {item.revision && <small>第 {item.revision} 版</small>}
                {item.size && <small>{Math.ceil(item.size / 1024)} KB</small>}
                {item.categories?.state === "needs-review" && (
                  <span>待核对</span>
                )}
              </div>
              <div className="collection-card-actions">
                {renderActions?.(item, canManage)}
                {canManage && (
                  <EditorIconButton
                    icon={PenLine}
                    label={"重命名 " + item.title}
                    onClick={() => openDialog("rename", { item }, item.title)}
                  />
                )}
              </div>
            </article>
          ))}
        </div>
        {!loading && !result.items.length && (
          <div className="collection-empty">
            <BookOpen size={30} />
            <h3>
              {state === "trash" ? "回收站是空的" : "这里还没有符合条件的内容"}
            </h3>
            <p>
              {kind === "notes"
                ? "可以导入资料、保存 AI 回答，或直接写下知识。"
                : "完成制作的作品会自动出现在这里。"}
            </p>
            {canManage && (
              <button
                className="btn secondary"
                onClick={() => go(kind === "notes" ? "input" : "library")}
              >
                {kind === "notes" ? "导入资料" : "开始内容创作"}
              </button>
            )}
          </div>
        )}
        <div className="collection-pagination">
          <button
            className="btn secondary"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - 24))}
          >
            <ArrowLeft size={15} />
            上一页
          </button>
          <span>
            {result.total ? offset + 1 : 0}–
            {Math.min(offset + 24, result.total)} / {result.total}
          </span>
          <button
            className="btn secondary"
            disabled={result.nextOffset === null || loading}
            onClick={() => setOffset(result.nextOffset)}
          >
            下一页
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </section>
  );
}
