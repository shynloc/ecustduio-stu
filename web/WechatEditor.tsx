import { wechatThemeLabels } from "../shared/wechat-themes";
import React, { useEffect, useRef, useState } from "react";
import { api, post, put, upload } from "./api";
import { MarkdownSourceEditor } from "./MarkdownSourceEditor";
import {
  FilePlus2,
  NotebookPen,
  History,
  PencilLine,
  Smartphone,
  Copy,
  Download,
} from "lucide-react";
import { copyRichHtml, uid } from "./compat";

export function WechatConnection({ onChange }: any) {
  const [info, setInfo] = useState<any>(null),
    [editing, setEditing] = useState(false),
    [name, setName] = useState(""),
    [appId, setAppId] = useState(""),
    [secret, setSecret] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    api("/wechat/connection")
      .then(setInfo)
      .catch((e) => setMessage(e.message));
  }, []);
  async function perform(path: string, body: any = {}) {
    setBusy(true);
    setMessage("");
    try {
      const result = await post("/settings/wechat/" + path, body);
      setInfo(result);
      setSecret("");
      setEditing(false);
      setMessage(
        path === "disconnect"
          ? "已断开连接，本机笔记和草稿记录仍然保留。"
          : "公众号已连接，可以保存草稿了。",
      );
      onChange?.(result);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel settings-card full wechat-connect"
      aria-label="公众号连接"
    >
      <h2>连接公众号</h2>
      <p>
        {info?.connected
          ? `已连接：${info.name}`
          : "管理员连接一次，团队就能把排版好的笔记保存到公众号草稿箱。"}
      </p>
      {info?.connected && !editing ? (
        <div className="button-row">
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => perform("test")}
          >
            检查连接
          </button>
          <button
            className="text-link"
            disabled={busy}
            onClick={() => setEditing(true)}
          >
            更换连接
          </button>
          <button
            className="text-link"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  "断开后将暂停保存公众号草稿，已有笔记和微信草稿会保留。确定断开吗？",
                )
              )
                void perform("disconnect");
            }}
          >
            断开连接
          </button>
        </div>
      ) : (
        <details open={editing || !info?.connected}>
          <summary>填写公众号连接信息</summary>
          <p>
            打开{" "}
            <a
              href="https://developers.weixin.qq.com/"
              target="_blank"
              rel="noreferrer"
            >
              微信开发者平台
            </a>
            ，用公众号管理员身份登录，在公众号的开发信息中复制下面两项。需要有草稿箱和素材管理权限。
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform("connect", { name, appId, secret });
            }}
          >
            <label className="field">
              公众号名称
              <input
                aria-label="公众号名称"
                value={name}
                maxLength={80}
                required
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：学校教育号"
              />
            </label>
            <label className="field">
              公众号编号（AppID）
              <input
                aria-label="公众号编号"
                autoComplete="off"
                value={appId}
                required
                pattern="wx[a-zA-Z0-9]{16}"
                onChange={(e) => setAppId(e.target.value.trim())}
                placeholder="wx 开头的编号"
              />
            </label>
            <label className="field">
              公众号密钥（AppSecret）
              <input
                aria-label="公众号密钥"
                type="password"
                autoComplete="new-password"
                value={secret}
                required
                minLength={16}
                maxLength={128}
                onChange={(e) => setSecret(e.target.value.trim())}
                placeholder="仅加密保存在工作台所在电脑"
              />
            </label>
            <p className="muted">
              这是公众号的连接信息，与 DeepSeek
              密钥不同。保存前会自动检查是否能访问草稿箱。
            </p>
            <button className="btn" disabled={busy}>
              {busy ? "正在连接…" : "连接并保存"}
            </button>
            {editing && (
              <button
                type="button"
                className="text-link"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setSecret("");
                }}
              >
                取消
              </button>
            )}
          </form>
        </details>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </section>
  );
}
const labels: Record<string, string> = {
  queued: "等待保存",
  uploading: "正在上传配图",
  submitting: "正在保存草稿",
  verifying: "等待微信回执",
  unknown: "需要核对保存结果",
  failed: "暂未保存",
  saved: "已保存到公众号草稿箱",
};

type Content = {
  title: string;
  body: string;
  palette: string;
  summary: string;
  coverAssetId: string;
};
const blank: Content = {
  title: "",
  body: "",
  palette: "green",
  summary: "",
  coverAssetId: "",
};
const endpoint = "/wechat/manuscripts";

function DraftRecord({ draft, onChange }: any) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!draft || !["queued", "running"].includes(draft.jobState)) return;
    let active = true;
    const timer = setInterval(
      () =>
        api("/wechat/drafts/" + draft.id)
          .then((r) => {
            if (active) onChange(r);
          })
          .catch((e) => active && setError(e.message)),
      1200,
    );
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [draft?.id, draft?.jobState]);
  if (!draft) return null;
  async function retry(absent = false) {
    if (absent && !confirm("已在该公众号后台核对，确认没有这篇草稿？")) return;
    setBusy(true);
    try {
      onChange(
        await post("/wechat/drafts/" + draft.id + "/retry", {
          confirmedAbsent: absent,
        }),
      );
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="notice" role="status">
      <strong>
        {labels[draft.state] || draft.state} · {draft.accountName}
      </strong>
      {draft.message && <p>{draft.message}</p>}
      {draft.mediaId && <p>草稿回执 {draft.mediaId}</p>}
      {draft.state !== "saved" &&
        !["queued", "running"].includes(draft.jobState) && (
          <div className="button-row">
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => retry()}
            >
              核对并继续保存
            </button>
            {["unknown", "submitting"].includes(draft.state) &&
              !draft.mediaId && (
                <button className="text-link" onClick={() => retry(true)}>
                  确认后台无此草稿后重送
                </button>
              )}
          </div>
        )}
      {error && <p>{error}</p>}
    </div>
  );
}

export function WechatEditor({ go, id, data, route }: any) {
  const params = new URLSearchParams(route.split("?")[1] || ""),
    user = data.user.id;
  const [content, setContent] = useState<Content>(blank),
    [ready, setReady] = useState(false),
    [dirty, setDirty] = useState(false);
  const [html, setHtml] = useState(""),
    [layoutReady, setLayoutReady] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const [record, setRecord] = useState<any>(null),
    [frozen, setFrozen] = useState<any>(null),
    [account, setAccount] = useState<any>(null),
    [connect, setConnect] = useState(false);
  const [library, setLibrary] = useState<any[]>([]),
    [notes, setNotes] = useState<any[]>([]),
    [drafts, setDrafts] = useState<any[]>([]);
  const [source, setSource] = useState<any>(null);
  const [menu, setMenu] = useState(""),
    [mobile, setMobile] = useState("write"),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false);
  const model = useRef({
    id: "",
    revision: 0,
    current: blank,
    saved: blank,
    writing: null as Promise<void> | null,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    live: true,
    blocked: false,
    generation: 0,
  });
  const m = model.current;
  const localKey = () => "ecu-wechat-pending:" + user + ":" + m.id;
  function remember() {
    try {
      sessionStorage.setItem(
        localKey(),
        JSON.stringify({ revision: m.revision, content: m.current }),
      );
    } catch {
      /* server autosave remains available */
    }
  }
  function changed() {
    return m.current !== m.saved;
  }
  function markRoute(aid: string) {
    window.history.replaceState(
      window.history.state,
      "",
      "#wechat?article=" + encodeURIComponent(aid),
    );
  }
  async function render(value: Content, revision: number) {
    const generation = ++m.generation;
    if (!value.title && !value.body) {
      if (m.live) {
        setHtml("");
        setLayoutReady(false);
      }
      return;
    }
    try {
      const result = await api(
        endpoint + "/" + m.id + "/layout?revision=" + revision,
      );
      if (m.live && generation === m.generation && m.current === value) {
        setHtml(result.previewHtml);
        setLayoutReady(true);
      }
    } catch (e: any) {
      if (m.live && generation === m.generation && m.current === value) {
        setError(e.message);
        setLayoutReady(false);
      }
    }
  }
  function flush(): Promise<void> {
    clearTimeout(m.timer);
    if (m.writing) return m.writing;
    if (m.blocked || !changed()) return Promise.resolve();
    m.writing = (async () => {
      while (changed() && !m.blocked) {
        const value = m.current;
        try {
          const r = await put(endpoint + "/" + m.id, {
            revision: m.revision,
            content: value,
          });
          m.revision = r.revision;
          m.saved = value;
          if (!changed()) {
            try {
              sessionStorage.removeItem(localKey());
            } catch {}
            if (m.live) {
              setDirty(false);
              setStatus("已保存到工作台");
              void render(value, r.revision);
            }
          } else remember();
        } catch (e: any) {
          if (e.code === "VERSION_CONFLICT") m.blocked = true;
          if (m.live) {
            setError(e.message);
            setConflict(m.blocked);
            setStatus("尚未保存");
          }
          break;
        }
      }
    })().finally(() => {
      m.writing = null;
    });
    return m.writing;
  }
  function edit(patch: Partial<Content>) {
    m.current = { ...m.current, ...patch };
    m.generation++;
    setContent(m.current);
    setDirty(true);
    setLayoutReady(false);
    setRecord(null);
    setStatus("正在保存…");
    if (!m.blocked) setError("");
    remember();
    clearTimeout(m.timer);
    m.timer = setTimeout(() => void flush(), 260);
  }
  async function navigate(to: string) {
    await flush();
    if (changed()) {
      setError("此稿还有未保存的修改，请先重试或另存副本。");
      return;
    }
    go(to);
  }
  useEffect(() => {
    m.live = true;
    let active = true;
    async function start() {
      const pid = params.get("preview"),
        did = params.get("draft");
      const [a, recent, history] = await Promise.all([
        api("/wechat/connection"),
        api(endpoint),
        api("/wechat/drafts"),
      ]);
      if (!active) return;
      setAccount(a);
      setLibrary(recent);
      setDrafts(history);
      if (did && pid) {
        const [d, p] = await Promise.all([
          api("/wechat/drafts/" + encodeURIComponent(did)),
          api("/wechat/previews/" + encodeURIComponent(pid)),
        ]);
        if (!active) return;
        if (d.previewId !== p.id || p.noteId !== id)
          throw new Error("保存记录与文章不匹配。");
        setRecord(d);
        setFrozen(p);
        setReady(true);
        return;
      }
      const aid =
        params.get("article") || (!id && !params.has("new") && recent[0]?.id);
      let r;
      if (id)
        r = await post(endpoint + "/from-note", {
          noteId: id,
          previewId: pid || undefined,
        });
      else if (aid) {
        try {
          r = await api(endpoint + "/" + encodeURIComponent(aid));
        } catch (e: any) {
          if (
            e.status !== 404 ||
            !sessionStorage.getItem("ecu-wechat-pending:" + user + ":" + aid)
          )
            throw e;
        }
      }
      if (!active) return;
      m.id = r?.id || aid || uid();
      m.revision = r?.revision || 0;
      m.saved = m.current = r?.content || { ...blank };
      if (r || aid) markRoute(m.id);
      setRecord(r?.draft || null);
      setSource(r?.source || null);
      let pending;
      try {
        pending = JSON.parse(sessionStorage.getItem(localKey()) || "null");
      } catch {}
      setReady(true);
      setContent(m.current);
      setStatus(r ? "已保存到工作台" : "");
      if (
        pending &&
        JSON.stringify(pending.content) !== JSON.stringify(m.saved)
      ) {
        m.blocked = pending.revision !== m.revision;
        setConflict(m.blocked);
        edit(pending.content);
        if (m.blocked)
          setError("已保留本页未保存的文字。另一页面已修改原稿，请另存副本。");
      } else if (r) void render(m.current, m.revision);
    }
    start().catch((e) => {
      if (active) setError(e.message);
    });
    const before = (event: BeforeUnloadEvent) => {
      if (changed()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      active = false;
      m.live = false;
      clearTimeout(m.timer);
      void flush();
      window.removeEventListener("beforeunload", before);
    };
  }, []);
  function update(patch: Partial<Content>) {
    if (!m.revision && !changed()) markRoute(m.id);
    edit(patch);
  }
  async function openMenu(which: string) {
    if (which === menu) {
      setMenu("");
      return;
    }
    try {
      if (which === "notes") setNotes(await api("/notes"));
      if (which === "recent") {
        setLibrary(await api(endpoint));
        setDrafts(await api("/wechat/drafts"));
      }
      setMenu(which);
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function openRecord(d: any) {
    try {
      const p = await api("/wechat/previews/" + d.previewId);
      await navigate(
        "wechat/" + p.noteId + "?preview=" + p.id + "&draft=" + d.id,
      );
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function saveRemote() {
    if (!layoutReady || dirty || !account?.connected || busy || record) return;
    if (!confirm("将当前预览保存到「" + account.name + "」的公众号草稿箱？"))
      return;
    setBusy(true);
    try {
      setRecord(
        await post(endpoint + "/" + m.id + "/draft", {
          revision: m.revision,
          accountId: account.id,
          confirmed: true,
        }),
      );
    } catch (e: any) {
      setError(e.message);
      if (e.code === "WECHAT_CONNECTION_CHANGED")
        setAccount(await api("/wechat/connection"));
    } finally {
      setBusy(false);
    }
  }
  async function saveCopy() {
    try {
      const copy = await put(endpoint + "/" + uid(), {
        revision: 0,
        content: m.current,
        copyFrom: m.id,
      });
      sessionStorage.removeItem(localKey());
      m.saved = m.current;
      go("wechat?article=" + copy.id);
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function copy() {
    try {
      const result = await copyRichHtml(html);
      setStatus(
        result === "rich"
          ? "已复制图文排版"
          : "已复制完整正文。此浏览器仅支持文字复制，保留完整图文可下载 HTML。",
      );
    } catch {
      setError("浏览器未允许复制，可下载 HTML。");
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([html], { type: "text/html;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = (content.title || "公众号文章") + ".html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  return (
    <div className="wechat-studio">
      <header className="page-heading">
        <h1>公众号编辑器</h1>
        <div className="button-row">
          <button
            className="btn secondary"
            disabled={!ready || busy}
            onClick={() => navigate("wechat?new=" + uid())}
          >
            <FilePlus2 />
            新文章
          </button>
          <button
            className="btn secondary"
            disabled={!ready || busy}
            aria-expanded={menu === "notes"}
            onClick={() => openMenu("notes")}
          >
            <NotebookPen />
            从笔记导入
          </button>
          <button
            className="btn secondary"
            disabled={!ready || busy}
            aria-expanded={menu === "recent"}
            onClick={() => openMenu("recent")}
          >
            <History />
            最近稿件
          </button>
        </div>
      </header>
      {error && (
        <div className="notice" role="alert">
          {error}{" "}
          {dirty && !conflict && (
            <button className="text-link" onClick={() => void flush()}>
              重试保存
            </button>
          )}{" "}
          {!dirty && ready && !frozen && !layoutReady && !!content.body && (
            <button
              className="text-link"
              onClick={() => {
                setError("");
                void render(m.current, m.revision);
              }}
            >
              重试预览
            </button>
          )}{" "}
          {conflict && (
            <button className="text-link" onClick={saveCopy}>
              另存为副本
            </button>
          )}
        </div>
      )}
      {menu && (
        <section className="panel manuscript-picker">
          <h2>{menu === "notes" ? "从笔记导入" : "本地稿件"}</h2>
          {menu === "notes" ? (
            notes.length ? (
              notes.map((n) => (
                <button key={n.id} onClick={() => navigate("wechat/" + n.id)}>
                  {n.title}
                </button>
              ))
            ) : (
              <p>还没有笔记，可以直接写新文章。</p>
            )
          ) : (
            <>
              {library.length ? (
                library.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setMenu("");
                      void navigate("wechat?article=" + n.id);
                    }}
                  >
                    {n.title || "未命名文章"}
                  </button>
                ))
              ) : (
                <p>还没有本地稿件。</p>
              )}
              {drafts.length > 0 && (
                <>
                  <h2>公众号保存记录</h2>
                  {drafts.map((d) => (
                    <button
                      className="wechat-history-row"
                      key={d.id}
                      onClick={() => openRecord(d)}
                    >
                      {d.title} · {d.accountName} · {labels[d.state] || d.state}
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </section>
      )}
      {frozen ? (
        <section className="panel">
          <h2>{frozen.title}</h2>
          <DraftRecord draft={record} onChange={setRecord} />
          <button
            className="btn secondary"
            onClick={() =>
              go("wechat/" + frozen.noteId + "?preview=" + frozen.id)
            }
          >
            以此稿继续编辑
          </button>
          <iframe
            className="wechat-preview"
            title="已保存的手机排版"
            sandbox=""
            srcDoc={frozen.previewHtml}
          />
        </section>
      ) : ready ? (
        <>
          <div className="manuscript-controls">
            <label>
              主题{" "}
              <select
                aria-label="公众号主题"
                value={content.palette}
                disabled={busy}
                onChange={(e) => update({ palette: e.target.value })}
              >
                {Object.entries(wechatThemeLabels).map(([k, name]) => (
                  <option key={k} value={k}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {source && (
              <button
                className="text-link"
                onClick={() => navigate(source.route)}
              >
                {source.label}
              </button>
            )}
            <span className="manuscript-save-state" role="status">
              {status}
            </span>
            <button
              className="btn secondary"
              aria-label="复制图文排版"
              disabled={!layoutReady}
              onClick={copy}
            >
              <Copy />
              复制图文
            </button>
            <button
              className="btn secondary"
              aria-label="下载 HTML"
              disabled={!layoutReady}
              onClick={download}
            >
              <Download />
              下载 HTML
            </button>
          </div>
          <div className="manuscript-mobile" aria-label="编辑视图">
            <button
              aria-pressed={mobile === "write"}
              onClick={() => setMobile("write")}
            >
              <PencilLine />
              写稿
            </button>
            <button
              aria-pressed={mobile === "preview"}
              onClick={() => setMobile("preview")}
            >
              <Smartphone />
              手机预览
            </button>
          </div>
          <div className="manuscript-panes" data-mobile={mobile}>
            <section className="panel manuscript-input">
              <label className="field">
                文章标题
                <input
                  aria-label="文章标题"
                  value={content.title}
                  disabled={busy}
                  placeholder="写个标题"
                  onChange={(e) =>
                    update({
                      title: Array.from(e.target.value).slice(0, 32).join(""),
                    })
                  }
                />
              </label>
              <fieldset disabled={busy}>
                <MarkdownSourceEditor
                  text={content.body}
                  label="公众号 Markdown 正文"
                  imageLabel="选择文章图片"
                  placeholder="从这里开始写正文，或粘贴 Markdown…"
                  maxLength={100000}
                  onChange={(body) => update({ body })}
                />
              </fieldset>
              <details className="wechat-options">
                <summary>摘要与封面</summary>
                <label className="field">
                  文章摘要
                  <textarea
                    aria-label="文章摘要"
                    maxLength={120}
                    value={content.summary}
                    placeholder="默认取自正文"
                    disabled={busy}
                    onChange={(e) => update({ summary: e.target.value })}
                  />
                </label>
                <label className="field">
                  替换封面
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setBusy(true);
                      try {
                        const a = await upload(f, "/media/uploads");
                        if (m.live) update({ coverAssetId: a.id });
                      } catch (e: any) {
                        if (m.live) setError(e.message);
                      } finally {
                        if (m.live) setBusy(false);
                      }
                    }}
                  />
                </label>
                {content.coverAssetId && (
                  <button
                    className="text-link"
                    onClick={() => update({ coverAssetId: "" })}
                  >
                    恢复自动封面
                  </button>
                )}
              </details>
            </section>
            <section className="panel manuscript-phone">
              <h2>
                <Smartphone />
                手机预览
              </h2>
              {html ? (
                <iframe
                  title="公众号手机预览"
                  sandbox=""
                  className="wechat-preview"
                  aria-busy={!layoutReady}
                  srcDoc={html}
                />
              ) : (
                <div className="manuscript-empty">
                  写下标题或正文，即可查看排版。
                </div>
              )}
            </section>
          </div>
          <div className="manuscript-output">
            <span>
              {account?.connected
                ? "保存到：" + account.name
                : "尚未连接公众号"}
            </span>
            {data.user.role === "admin" && (
              <button
                className="text-link"
                onClick={() => setConnect(!connect)}
              >
                {account?.connected ? "管理连接" : "连接公众号"}
              </button>
            )}
            <button
              className="btn wechat-save"
              disabled={
                busy ||
                !account?.connected ||
                !layoutReady ||
                !content.body.trim() ||
                !content.title.trim() ||
                !!record
              }
              onClick={saveRemote}
            >
              {record?.state === "saved"
                ? "已保存到公众号草稿箱"
                : account?.connected
                  ? "保存到「" + account.name + "」草稿箱"
                  : "保存到公众号草稿箱"}
            </button>
          </div>
          {record && <DraftRecord draft={record} onChange={setRecord} />}
          {connect && (
            <WechatConnection
              onChange={(c: any) => {
                setAccount(c);
                setConnect(false);
              }}
            />
          )}
        </>
      ) : (
        !error && <p role="status">正在打开编辑器…</p>
      )}
    </div>
  );
}
