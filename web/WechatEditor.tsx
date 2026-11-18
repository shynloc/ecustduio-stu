import React, { useEffect, useRef, useState } from "react";
import { api, post, upload } from "./api";
import { copyRichHtml } from "./compat";

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
export function WechatEditor({ go, id, data }: any) {
  const [notes, setNotes] = useState<any[]>([]),
    [selected, setSelected] = useState(id || ""),
    [palette, setPalette] = useState("green"),
    [title, setTitle] = useState(""),
    [summary, setSummary] = useState(""),
    [cover, setCover] = useState<any>(null),
    [preview, setPreview] = useState<any>(null),
    [draft, setDraft] = useState<any>(null),
    [history, setHistory] = useState<any[]>([]),
    [connection, setConnection] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [connectOpen, setConnectOpen] = useState(false);
  const generation = useRef(0),
    restored = useRef(""),
    note = notes.find((n) => n.id === selected);
  const params = new URLSearchParams(location.hash.split("?")[1] || ""),
    previewId = params.get("preview") || "",
    draftId = params.get("draft") || "",
    routeKey = [id || "", previewId, draftId].join(":");
  function remember(p: any, d: any = null) {
    const noteId = p?.noteId || selected || id || "",
      query = new URLSearchParams();
    if (p) query.set("preview", p.id);
    if (d) query.set("draft", d.id);
    restored.current = [noteId, p?.id || "", d?.id || ""].join(":");
    historyReplace("wechat" + (noteId ? "/" + noteId : "") + (query.size ? "?" + query : ""));
  }
  function historyReplace(route: string) {
    window.history.replaceState(window.history.state, "", "#" + route);
  }
  function invalidate() {
    generation.current++;
    setPreview(null);
    setDraft(null);
    setMessage("");
    remember(null);
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      api("/notes"),
      api("/wechat/connection"),
      api("/wechat/drafts"),
    ])
      .then(([n, c, h]) => {
        if (active) {
          setNotes(n);
          setConnection(c);
          setHistory(h);
        }
      })
      .catch((e) => active && setMessage(e.message));
    return () => {
      active = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    if (restored.current === routeKey) return;
    restored.current = routeKey;
    const seq = ++generation.current;
    setSelected(id || "");
    setPreview(null);
    setDraft(null);
    setMessage("");
    setTitle("");
    setSummary("");
    setCover(null);
    setPalette("green");
    if (!previewId) { setBusy(false); return; }
    setBusy(true);
    (async () => {
      try {
        const p = await api("/wechat/previews/" + encodeURIComponent(previewId));
        if (p.noteId !== id) throw new Error("这份预览不属于当前笔记，请重新选择笔记。");
        const fresh = await api("/notes/" + p.noteId);
        const d = draftId ? await api("/wechat/drafts/" + encodeURIComponent(draftId)) : null;
        if (d && d.previewId !== p.id) throw new Error("保存记录与预览不对应，请从最近的保存记录重新打开。");
        if (seq !== generation.current) return;
        setNotes(ns => ns.some(n => n.id === fresh.id) ? ns.map(n => n.id === fresh.id ? fresh : n) : [...ns, fresh]);
        setTitle(p.options?.title ?? p.title);
        setSummary(p.options?.summary ?? p.summary);
        setPalette(p.palette);
        setCover(p.options ? (p.options.coverAssetId ? {id:p.options.coverAssetId} : null) : p.cover);
        // Saved records remain readable snapshots. An unsent stale preview must
        // be regenerated from the changed note before the save button reappears.
        if (fresh.revision === p.revision || d) {
          setPreview(p);
          setDraft(d);
          setMessage(d ? "已恢复保存记录。" : "已恢复上次预览，可以继续检查和保存。");
        } else {
          setMessage("笔记正文已更新，排版设置已保留。请重新生成手机排版后保存。");
        }
      } catch (e: any) {
        if (seq === generation.current) setMessage(e.message);
      } finally {
        if (seq === generation.current) setBusy(false);
      }
    })();
  }, [routeKey]);
  useEffect(() => {
    if (!draft || !["queued", "running"].includes(draft.jobState)) return;
    let stopped = false;
    const timer = setInterval(() => {
      api("/wechat/drafts/" + draft.id)
        .then((d) => {
          if (!stopped) {
            setDraft(d);
            setHistory((h) => [d, ...h.filter((x) => x.id !== d.id)]);
          }
        })
        .catch((e) => {
          if (!stopped) setMessage(e.message);
        });
    }, 1500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [draft?.id, draft?.jobState]);
  async function prepare() {
    const seq = ++generation.current;
    setBusy(true);
    setMessage("");
    setDraft(null);
    try {
      const fresh = await api("/notes/" + selected);
      if (seq !== generation.current) return;
      setNotes((ns) => ns.map((n) => (n.id === fresh.id ? fresh : n)));
      const p = await post("/notes/" + selected + "/wechat-preview", {
        revision: fresh.revision,
        palette,
        title: title || undefined,
        summary: summary || undefined,
        coverAssetId: cover?.id,
      });
      if (seq === generation.current) {
        setPreview(p);
        remember(p);
        setMessage("预览已准备好。检查文章和封面后即可保存。");
      }
    } catch (e: any) {
      if (seq === generation.current) setMessage(e.message);
    } finally {
      if (seq === generation.current) setBusy(false);
    }
  }
  async function save() {
    if (!preview || !connection?.connected) return;
    const seq = generation.current;
    setBusy(true);
    setMessage("");
    try {
      const d = await post("/wechat/drafts", {
        previewId: preview.id,
        accountId: connection.id,
      });
      if (seq !== generation.current) return;
      setDraft(d);
      remember(preview, d);
      setHistory((h) => [d, ...h.filter((x) => x.id !== d.id)]);
    } catch (e: any) {
      if (seq !== generation.current) return;
      setMessage(e.message);
      if (e.code === "WECHAT_CONNECTION_CHANGED") {
        try {
          const c = await api("/wechat/connection");
          if (seq === generation.current) setConnection(c);
        } catch { /* Keep the original actionable error. */ }
      }
    } finally {
      if (seq === generation.current) setBusy(false);
    }
  }
  async function resume(d: any, confirmedAbsent = false) {
    const seq = generation.current;
    setBusy(true);
    try {
      const next = await post("/wechat/drafts/" + d.id + "/retry", { confirmedAbsent });
      if (seq !== generation.current) return;
      setDraft(next);
      setMessage("已开始核对与恢复。");
    } catch (e: any) {
      if (seq === generation.current) setMessage(e.message);
    } finally {
      if (seq === generation.current) setBusy(false);
    }
  }
  async function openRecord(d: any) {
    const seq = generation.current;
    setBusy(true);
    try {
      const p = await api("/wechat/previews/" + d.previewId);
      if (seq !== generation.current) return;
      go("wechat/" + p.noteId + "?preview=" + p.id + "&draft=" + d.id);
    } catch (e: any) { if (seq === generation.current) setMessage(e.message); }
    finally { if (seq === generation.current) setBusy(false); }
  }
  const working = busy || ["queued", "running"].includes(draft?.jobState);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">OUTPUT · WECHAT</span>
          <h1>公众号排版</h1>
          <p>选一篇笔记 → 看预览 → 保存到公众号草稿箱。</p>
        </div>
      </div>
      <div className="wechat-account-bar">
        <span>
          {connection?.connected
            ? `保存到：${connection.name}`
            : "尚未连接公众号；可以先排版、预览。"}
        </span>
        {data?.user?.role === "admin" ? (
          <button
            className="text-link"
            onClick={() => setConnectOpen(!connectOpen)}
          >
            {connection?.connected ? "管理连接" : "连接公众号"}
          </button>
        ) : (
          !connection?.connected && <span>请管理员在设置中连接公众号。</span>
        )}
      </div>
      {connectOpen && (
        <WechatConnection
          onChange={(c: any) => {
            setConnection(c);
            setConnectOpen(false);
          }}
        />
      )}
      <div className="production-layout wechat-layout">
        <section className="panel note-editor wechat-setup">
          <h2>1. 选择笔记</h2>
          <label className="field">
            知识库中的笔记
            <select
              aria-label="排版笔记"
              disabled={working}
              value={selected}
              onChange={(e) => {
                go("wechat" + (e.target.value ? "/" + e.target.value : ""));
              }}
            >
              <option value="">请选择一篇笔记</option>
              {notes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
          </label>
          {!notes.length && (
            <p>
              先把资料保存到知识库，或撰写一篇笔记。
              <button className="text-link" onClick={() => go("notes")}>
                打开知识库
              </button>
            </p>
          )}
          <p className="muted">
            封面和摘要会自动准备。正文和配图沿用笔记内容。
          </p>
          <details className="wechat-options">
            <summary>调整标题、封面和样式</summary>
            <fieldset disabled={working}>
              <label className="field">
                文章标题
                <input
                  aria-label="文章标题"
                  value={title}
                  placeholder={
                    note?.title
                      ? Array.from(note.title as string)
                          .slice(0, 32)
                          .join("")
                      : "自动使用笔记标题，最多32字"
                  }
                  onChange={(e) => {
                    setTitle(Array.from(e.target.value).slice(0, 32).join(""));
                    invalidate();
                  }}
                />
              </label>
              <label className="field">
                文章摘要
                <textarea
                  aria-label="文章摘要"
                  value={summary}
                  placeholder="默认自动摘取正文，可在这里修改"
                  onChange={(e) => {
                    setSummary(
                      Array.from(e.target.value).slice(0, 120).join(""),
                    );
                    invalidate();
                  }}
                />
              </label>
              <label className="field">
                排版风格
                <select
                  aria-label="排版风格"
                  value={palette}
                  onChange={(e) => {
                    setPalette(e.target.value);
                    invalidate();
                  }}
                >
                  <option value="green">书院绿</option>
                  <option value="blue">教育蓝</option>
                  <option value="ink">简洁黑白</option>
                </select>
              </label>
              <label className="field">
                替换封面（可选）
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    invalidate();
                    const seq = generation.current;
                    setBusy(true);
                    try {
                      const uploaded = await upload(f, "/media/uploads");
                      if (seq === generation.current) setCover(uploaded);
                    } catch (e: any) {
                      if (seq === generation.current) setMessage(e.message);
                    } finally {
                      if (seq === generation.current) setBusy(false);
                    }
                  }}
                />
              </label>
              {cover && (
                <button
                  className="text-link"
                  onClick={() => {
                    setCover(null);
                    invalidate();
                  }}
                >
                  恢复自动封面
                </button>
              )}
            </fieldset>
          </details>
          <div className="button-row">
            <button
              className="btn"
              disabled={!note || working}
              onClick={prepare}
            >
              {busy ? "正在准备…" : preview ? "重新生成预览" : "生成手机排版"}
            </button>
            {note && (
              <button
                className="btn secondary"
                disabled={working}
                onClick={() => go("notes/" + note.id + (preview ? "?wechatPreview=" + preview.id : ""))}
              >
                编辑正文与配图
              </button>
            )}
          </div>
          {message && <p role="status">{message}</p>}
        </section>
        <section className="panel wechat-phone">
          <h2>2. 手机预览</h2>
          {preview ? (
            <iframe
              className="wechat-preview"
              title="公众号手机预览"
              sandbox=""
              srcDoc={preview.previewHtml}
            />
          ) : (
            <div className="wechat-empty">
              选择笔记后点击「生成手机排版」，在这里检查最终图文。
            </div>
          )}
        </section>
        {preview && (
          <section className="panel note-editor wechat-save-panel">
            <h2>3. 保存草稿</h2>
            <p>文章：{preview.title}</p>
            <p className="muted">{preview.summary}</p>
            {preview.warning && <p className="notice">{preview.warning}</p>}
            <button
              className="btn wechat-save"
              disabled={working || !connection?.connected || Boolean(draft)}
              onClick={save}
            >
              {draft?.state === "saved"
                ? "已保存到公众号草稿箱"
                : working
                  ? "正在保存，请稍候…"
                  : `保存到${connection?.name ? "「" + connection.name + "」" : ""}草稿箱`}
            </button>
            <p className="muted">
              这里只保存草稿。发布文章仍需在微信公众号后台确认。
            </p>
            {draft && (
              <div className="notice" role="status">
                <strong>{labels[draft.state] || "正在处理"}</strong>
                {draft.message && <p>{draft.message}</p>}
                {!working && draft.state !== "saved" && (
                  <div className="button-row">
                    <button
                      className="btn secondary"
                      onClick={() => resume(draft)}
                    >
                      {["unknown", "submitting", "verifying"].includes(
                        draft.state,
                      )
                        ? "核对保存结果"
                        : "重试保存"}
                    </button>
                    {["unknown", "submitting"].includes(draft.state) && (
                      <button
                        className="text-link"
                        onClick={() => {
                          if (
                            confirm(
                              "请先打开微信公众号草稿箱检查。这篇文章确实不存在吗？只有确认不存在，才应重新保存，以免出现重复草稿。",
                            )
                          )
                            void resume(draft, true);
                        }}
                      >
                        我已确认草稿箱没有这篇，重新保存
                      </button>
                    )}
                  </div>
                )}
                <a
                  href="https://mp.weixin.qq.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  打开微信公众号后台
                </a>
              </div>
            )}
            <details className="wechat-options">
              <summary>下载或复制排版</summary>
              <div className="button-row">
                <a
                  className="btn secondary"
                  href={"/api/assets/" + preview.assetId}
                  download={preview.name}
                >
                  下载 HTML
                </a>
                <button
                  className="btn secondary"
                  onClick={async () => {
                    try {
                      const result = await copyRichHtml(preview.previewHtml);
                      if (result === "rich") {
                        setMessage(
                          "已复制排版。手动粘贴时请检查配图；直接保存草稿会自动上传配图。",
                        );
                      } else {
                        setMessage("已复制完整正文。此浏览器仅支持文字复制，保留完整图文可下载 HTML。");
                      }
                    } catch {
                      setMessage("浏览器未允许复制，请下载 HTML。");
                    }
                  }}
                >
                  复制图文排版
                </button>
              </div>
            </details>
          </section>
        )}
      </div>
      {history.length > 0 && (
        <section className="panel wechat-history">
          <h2>最近的保存记录</h2>
          <p className="muted">
            关闭页面不会丢失进度。点击记录可以继续查看或恢复保存。
          </p>
          {history.map((d) => (
            <button
              className="wechat-history-row"
              key={d.id}
              disabled={working}
              onClick={() => openRecord(d)}
            >
              <span>
                <strong>{d.title}</strong>
                <small>
                  {d.accountName} · {new Date(d.createdAt).toLocaleString()}
                </small>
              </span>
              <span>{labels[d.state] || "正在处理"}</span>
            </button>
          ))}
        </section>
      )}
    </>
  );
}
