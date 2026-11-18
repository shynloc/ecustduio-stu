import { ConversationFiles } from "./ConversationFiles";
import {carry,readContext} from './context';
import {EditorIconButton} from './EditorIconButton';
import {ArrowLeft, AudioLines, Newspaper, Files} from 'lucide-react';
import {NoteGallery} from './NoteGallery';
import {KnowledgeBatch} from './KnowledgeBatch';
import {DocumentReader} from './DocumentReader';
import {TagInput} from './TagInput';
import React, { useEffect, useState, useRef } from "react";
import {
  BrainCircuit,
  BookOpen,
  Search,
  Plus,
  Send,
  Save,
  ArrowUpRight,
  Trash2,
  ShieldCheck,
  Leaf,
  ExternalLink,
  LoaderCircle,
  FileText,
  MessageSquare,
  CheckCircle2,
} from "lucide-react";
import { api, post, patch, init } from "./api";
import { applyTheme } from "./theme";
import "./workspace.css";
import { Answer } from "./Answer";
import { openSpeech } from "./MediaStudio";
export const roleNames: any = {
  admin: "管理员",
  creator: "创作者",
  sales: "业务员",
};
const B = ({ children, secondary = false, ...props }: any) => (
  <button className={"btn " + (secondary ? "secondary" : "")} {...props}>
    {children}
  </button>
);
const F = ({ label, children }: any) => {
  const labelId = React.useId();
  return (
    <div className="field">
      <span id={labelId}>{label}</span>
      {React.Children.map(children, (child) =>
        React.isValidElement(child) &&
        (["input", "select", "textarea"].includes(String(child.type))||child.type===TagInput)
          ? React.cloneElement(child as React.ReactElement<any>, {
              "aria-labelledby": labelId,
            })
          : child,
      )}
    </div>
  );
};
const date = (v: any) => new Date(v).toLocaleString("zh-CN", { hour12: false });
const scope = {
  region: "北京",
  district: "全市",
  stage: "中考",
  year: new Date().getFullYear(),
  audience: "北京初三家长",
};
function Header({ title, eyebrow, description, children }: any) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function AuthScreen({ session, onAuth }: any) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const setup = session.setupRequired;
  if (setup && session.canSetup === false)
    return (
      <main className="auth-screen single">
        <section className="auth-card">
          <ShieldCheck size={30} />
          <h1>等待管理员初始化</h1>
          <p>
            请在服务器电脑打开
            http://127.0.0.1:37891，创建管理员并分配账号后，再从这里登录。
          </p>
          <B onClick={() => location.reload()}>刷新登录状态</B>
        </section>
      </main>
    );
  return (
    <main className="auth-screen">
      <section className="auth-story">
        <span className="eyebrow">ECUSTUDIO / YOUR CREATIVE DESK</span>
        <Leaf size={44} />
        <h1>
          每一次创作，
          <br />
          从有据可循开始。
        </h1>
        <p>
          教育情报 · AI 研究 · 创作笔记
          <br />
          把资料连接起来，把想法写成内容。
        </p>
        <div className="auth-rule" />
        <small>书院 · 本地工作空间</small>
      </section>
      <section className="auth-card">
        <span className="eyebrow">
          {setup ? "WELCOME TO YOUR STUDIO" : "WELCOME BACK"}
        </span>
        <h2>{setup ? "创建管理员" : "登录教创工作台"}</h2>
        <p className="muted">
          {setup
            ? "首次使用，请设置你的管理员账号和密码。"
            : "使用管理员分配的账号进入工作空间。"}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              onAuth(
                await post(setup ? "/auth/setup" : "/auth/login", {
                  username,
                  password,
                  ...(setup ? { displayName: name } : {}),
                }),
              );
              setPassword("");
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {setup && (
            <F label="显示名称">
              <input
                autoComplete="name"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </F>
          )}
          <F label="账号">
            <input
              autoComplete="username"
              required
              minLength={3}
              maxLength={40}
              pattern="[a-zA-Z0-9_.\-]+"
              placeholder="字母、数字、点、横线或下划线"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </F>
          <F label={setup ? "密码（至少10位）" : "密码"}>
            <input
              autoComplete={setup ? "new-password" : "current-password"}
              type="password"
              required
              minLength={setup ? 10 : 1}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </F>
          {error && (
            <p role="alert" className="auth-error">
              {error}
            </p>
          )}
          <B disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <ShieldCheck size={17} />
            )}{" "}
            {setup ? "创建并进入工作台" : "登录"}
          </B>
        </form>
        <small className="muted">
          账号密码保存在本机。忘记密码请联系工作台管理员。
        </small>
      </section>
    </main>
  );
}
export function PasswordForm({ onDone, forced = false }: any) {
  const [old, setOld] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        if (next !== confirm) {
          setError("两次输入的新密码不一致");
          return;
        }
        setBusy(true);
        try {
          const r = await post("/auth/password", {
            currentPassword: old,
            newPassword: next,
          });
          setOld("");
          setNext("");
          setConfirm("");
          onDone(r);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="muted">
        {forced
          ? "首次登录，请先更换管理员分配的初始密码。"
          : "修改后其他登录会话将失效。"}
      </p>
      <F label="当前密码">
        <input
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          value={old}
          onChange={(e) => setOld(e.target.value)}
        />
      </F>
      <F label="新密码（至少10位）">
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </F>
      <F label="再次输入新密码">
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </F>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      <B disabled={busy}>保存新密码</B>
    </form>
  );
}
export function ForcedPassword({ onAuth }: any) {
  return (
    <main className="auth-screen single">
      <section className="auth-card">
        <ShieldCheck size={30} />
        <h1>设置你的密码</h1>
        <PasswordForm forced onDone={onAuth} />
        <button
          className="text-link"
          onClick={async () => {
            await post("/auth/logout");
            onAuth(await init());
          }}
        >
          退出登录
        </button>
      </section>
    </main>
  );
}

export function Accounts({ data, act }: any) {
  const [users, setUsers] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [error, setError] = useState("");
  const load = () =>
    api("/auth/users")
      .then(setUsers)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <Header
        eyebrow="ACCESS & PEOPLE"
        title="成员与权限"
        description="按工作职责分配身份，权限在页面与接口同时生效。"
      >
        <B onClick={() => setSelected({ role: "creator" })}>
          <Plus size={16} />
          新建账号
        </B>
      </Header>
      <div className="role-summary">
        {[
          ["admin", "全部功能、账号和工作台管理"],
          ["creator", "研究、AI 研究、笔记、创作与导出"],
          ["sales", "只读政策、日报与可发布成果"],
        ].map(([r, t]) => (
          <section className="panel" key={r}>
            <ShieldCheck size={20} />
            <h3>{roleNames[r]}</h3>
            <p>{t}</p>
          </section>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <section className="panel">
        <div className="section-head">
          <h2>工作台成员</h2>
          <small>{users.length} 个账号</small>
        </div>
        <div className="member-list">
          {users.map((u) => (
            <div className="member-row" key={u.id}>
              <span className="avatar">{u.displayName[0]}</span>
              <div>
                <strong>
                  {u.displayName}
                  {u.id === data.user.id ? " · 你" : ""}
                </strong>
                <p className="muted">
                  {u.username} · {roleNames[u.role]} ·{" "}
                  {u.status === "active" ? "正常" : "已停用"}
                  {u.mustChangePassword ? " · 首次需改密" : ""}
                </p>
              </div>
              <B secondary onClick={() => setSelected(u)}>
                管理账号
              </B>
            </div>
          ))}
        </div>
      </section>
      {selected && (
        <section className="panel note-editor">
          <div className="section-head">
            <h2>{selected.id ? "管理 " + selected.displayName : "新建账号"}</h2>
            <button className="text-link" onClick={() => setSelected(null)}>
              关闭
            </button>
          </div>
          <UserForm
            key={selected.id || "new"}
            value={selected}
            act={act}
            done={() => {
              setSelected(null);
              load();
            }}
          />
        </section>
      )}
    </>
  );
}
function UserForm({ value, act, done }: any) {
  const [u, setU] = useState<any>({
    ...value,
    displayName: value.displayName || "",
    username: value.username || "",
    password: "",
  });
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const payload: any = { displayName: u.displayName, role: u.role };
        if (u.id) {
          payload.revision = u.revision;
          payload.status = u.status;
          if (u.password) payload.password = u.password;
        } else {
          payload.username = u.username;
          payload.password = u.password;
        }
        const r = await act(
          () =>
            u.id
              ? patch("/auth/users/" + u.id, payload)
              : post("/auth/users", payload),
          "账号已保存",
        );
        if (r) done();
      }}
    >
      {!u.id && (
        <F label="账号名">
          <input
            required
            minLength={3}
            maxLength={40}
            pattern="[a-zA-Z0-9_.\-]+"
            value={u.username}
            onChange={(e) => setU({ ...u, username: e.target.value })}
          />
        </F>
      )}
      <F label="显示名称">
        <input
          required
          maxLength={80}
          value={u.displayName}
          onChange={(e) => setU({ ...u, displayName: e.target.value })}
        />
      </F>
      <div className="form-grid">
        <F label="账号身份">
          <select
            value={u.role}
            onChange={(e) => setU({ ...u, role: e.target.value })}
          >
            {Object.entries(roleNames).map(([k, v]: any) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </F>
        {u.id && (
          <F label="账号状态">
            <select
              value={u.status}
              onChange={(e) => setU({ ...u, status: e.target.value })}
            >
              <option value="active">正常</option>
              <option value="disabled">停用</option>
            </select>
          </F>
        )}
      </div>
      <F label={u.id ? "重置密码（留空则保留）" : "初始密码（至少10位）"}>
        <input
          type="password"
          autoComplete="new-password"
          required={!u.id}
          minLength={10}
          maxLength={128}
          value={u.password}
          onChange={(e) => setU({ ...u, password: e.target.value })}
        />
      </F>
      <p className="muted">
        新建或重置密码后，账号首次登录须修改密码。身份、状态或密码变更会撤销旧会话。
      </p>
      <div className="button-row">
        <B type="submit">
          <Save size={16} />
          保存账号
        </B>
        {u.id && (
          <B
            type="button"
            secondary
            onClick={async () => {
              if (
                !window.confirm(
                  "删除此账号后将不能登录。其历史资料和创作记录会保留，是否继续？",
                )
              )
                return;
              const r = await act(
                () => api("/auth/users/" + u.id, { method: "DELETE" }),
                "账号已删除",
              );
              if (r) done();
            }}
          >
            <Trash2 size={16} />
            删除账号
          </B>
        )}
      </div>
    </form>
  );
}

export function Sources({ sources, go }: any) {
  return sources?.length ? (
    <div className="research-sources">
      {sources.map((s: any) => (
        <div key={s.id || s.url || s.noteId} className="research-source">
          <span className="source-number">{s.id || "来源"}</span>
          <div>
            <strong>{s.title}</strong>
            <p className="muted">
              {s.kind === "web"
                ? "联网来源"
                : s.kind === "note"
                  ? "创作笔记"
                  : s.kind === "media" ? "文件与语音处理 · 待核实" : "本地资料"}
              {s.published ? " · " + String(s.published).slice(0, 10) : ""}
              {s.retrievedAt ? " · 检索于 " + date(s.retrievedAt) : ""}
            </p>
            {s.excerpt && (
              <details>
                <summary>查看摘录</summary>
                <p className="source-excerpt">{s.excerpt}</p>
              </details>
            )}
            <div className="button-row">
              {s.mediaJobId && <button className="text-link" onClick={() => go("media/" + s.mediaJobId)}>查看处理记录</button>}
              {s.url && (
                <a href={s.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} />
                  查看网页
                </a>
              )}
              {s.snapshotId && (
                <button
                  className="text-link"
                  onClick={() => go("snapshot/" + s.snapshotId)}
                >
                  打开本地资料
                </button>
              )}
              {s.noteId && (
                <button
                  className="text-link"
                  onClick={() => go("notes/" + s.noteId)}
                >
                  打开笔记
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  ) : null;
}
export function Explore({ data, act, go, search }: any) {
  const [threads, setThreads] = useState<any[]>([]),
    [notes, setNotes] = useState<any[]>([]),
    [current, setCurrent] = useState<any>(null),
    [prompt, setPrompt] = useState(""),
    [mode, setMode] = useState("auto"),
    [thinkingMode, setThinkingMode] = useState("default"),
    [webEngine, setWebEngine] = useState("default"),
    [webAction, setWebAction] = useState("search"),
    [selected, setSelected] = useState<string[]>([]),
    [job, setJob] = useState<any>(null),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false),
    [stage, setStage] = useState("");
  const mounted = useRef(true),
    end = useRef<HTMLDivElement>(null);
  const threadId = location.hash.split("?")[0].split("/")[1] || "";
  async function lists() {
    const [c, n] = await Promise.all([api("/conversations"), api("/notes")]);
    setThreads(c);
    setNotes(n);
    return n;
  }
  useEffect(() => {
    mounted.current = true;
    lists()
      .then((n) => {
        readContext().then(c=>{if(c)setSelected(c.items.filter((i:any)=>i.ref.kind==='note').map((i:any)=>i.ref.id));}).catch(e=>setError(e.message));
      })
      .catch((e) => setError(e.message));
    return () => {
      mounted.current = false;
    };
  }, []);
  const routeMatches = (id:string) => location.hash.split("?")[0] === "#explore/"+id;
  async function reloadConversation(id:string, restoreSelection=false) {
    const c=await api("/conversations/"+id);
    if(!routeMatches(id))return;
    setCurrent(c);
    if(restoreSelection){
      const prior=c.messages.filter((m:any)=>m.role==="user").at(-1)?.context;
      setSelected(prior?.notes?.map((n:any)=>n.id)||[]);
      setMode(prior?.mode||"auto");setThinkingMode(prior?.requestedThinkingMode||"default");
      setWebEngine(prior?.webEngine||"default");setWebAction(prior?.webAction||"search");
    }
    setJob(c.jobs.find((j:any)=>["queued","running"].includes(j.state)) || null);
  }
  useEffect(()=>{
    setCurrent(null);setJob(null);setStage("");setError("");
    if(threadId)reloadConversation(threadId,true).catch(e=>routeMatches(threadId)&&setError(e.message));
  },[threadId]);
  const pendingFiles=current?.messages?.some((m:any)=>m.context.fileJobs?.some((j:any)=>["queued","running"].includes(j.state)));
  useEffect(()=>{
    if(!threadId||(!job&&!pendingFiles))return;
    let active=true;
    async function poll(){
      try{
        if(job){
          const j=await api("/jobs/"+job.id);
          if(!active||!routeMatches(threadId))return;
          setStage(j.events?.at(-1)?.payload?.message || "正在处理…");
          if(["queued","running"].includes(j.state)&&!pendingFiles)return;
        }
        if(active)await reloadConversation(threadId);
      }catch(e:any){if(active)setError(e.message);}
    }
    const timer=setInterval(poll,1200);
    return ()=>{active=false;clearInterval(timer);};
  },[threadId,job?.id,pendingFiles]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [current?.messages?.length, job?.state]);
  const working = sending || !!(threadId && current?.id !== threadId) || (job && ["queued", "running"].includes(job.state));
  async function send(e: any) {
    e.preventDefault();
    if (!prompt.trim() || working || (threadId && current?.id !== threadId)) return;
    const origin=location.hash;
    setSending(true);
    setError("");
    try {
      let c = current;
      if (!c) {
        c = await post("/conversations");
        if(location.hash===origin)setCurrent({ ...c, messages: [], jobs: [] });
      }
      const j = await post("/conversations/" + c.id + "/messages", {
        prompt,
        mode,
        thinkingMode,
        webEngine,
        webAction,
        noteIds: selected,
      });
      if(location.hash!==origin)return;
      setPrompt("");
      setJob(j);
      setStage("任务已排队");
      if (threadId !== c.id) go("explore/" + c.id);
      await reloadConversation(c.id);
      await lists();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }
  return (
    <>
      <Header
        eyebrow="ASK · SEARCH · CREATE"
        title="AI 创作对话"
        description="直接提问、写稿，或说出你要的文件。生成的文档和演示会附在回答下方。"
      >
        <B secondary onClick={() => go("media")}>文件 / 图片 / 录音</B>
        <B
          secondary
          onClick={() => {
            go("explore");
            setCurrent(null);
            setSelected([]);
            setJob(null);
            setError("");
          }}
        >
          <Plus size={16} />
          新建对话
        </B>
      </Header>
      <div className="explore-layout">
        <aside className="panel thread-panel">
          <div className="section-head">
            <h3>探索记录</h3>
            <MessageSquare size={17} />
          </div>
          <div className="thread-list">
            {threads
              .filter((c) => c.title.includes(search || ""))
              .map((c) => (
                <button
                  key={c.id}
                  className={threadId === c.id ? "selected" : ""}
                  onClick={() => go("explore/" + c.id)}
                >
                  <strong>{c.title}</strong>
                  <small>{date(c.updated_at)}</small>
                </button>
              ))}
            {!threads.length && (
              <p className="muted">你的研究会话会保存在这里。</p>
            )}
          </div>
          <div className="context-picker">
            <h3>
              <BookOpen size={16} />
              笔记上下文
            </h3>
            <p className="muted">选中的笔记随本轮问题发送，最多8篇。</p>
            {notes.map((n) => (
              <label className="context-choice" key={n.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(n.id)}
                  disabled={
                    working ||
                    (!selected.includes(n.id) && selected.length >= 8)
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, n.id]
                        : selected.filter((id) => id !== n.id),
                    )
                  }
                />
                <span>
                  {n.title}
                  <small>版本 {n.revision}</small>
                </span>
              </label>
            ))}
            {!notes.length && (
              <button className="text-link" onClick={() => go("notes")}>
                先写一篇创作笔记 <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        </aside>
        <section className="panel conversation-panel">
          <div className="conversation-heading">
            <BrainCircuit size={22} />
            <div>
              <strong>{current?.title || "让想法有来处"}</strong>
              <small>DeepSeek · 来源可追溯 · 结果可沉淀</small>
            </div>
          </div>
          <div className="message-list">
            {!current?.messages?.length && (
              <div className="explore-welcome">
                <span className="eyebrow">YOUR RESEARCH COMPANION</span>
                <h2>今天想研究什么，或做一份什么？</h2>
                <p>
                  可以从一个问题开始，也可以直接描述成品、受众和用途。
                </p>
                <div className="prompt-examples">
                  {[
                    "从本地资料整理中考报名时间和注意事项",
                    "联网查找北京教育考试院最新招生通知，并列出官方来源",
                    "根据选中的笔记，做一份给家长分享的可编辑 PPT，再给我一份 Word 讲义",
                  ].map((t) => (
                    <button key={t} onClick={() => setPrompt(t)}>
                      <Search size={15} />
                      {t}
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {current?.messages?.map((m: any) => (
              <article className={"chat-message " + m.role} key={m.id}>
                <div className="message-meta">
                  <span>
                    {m.role === "user"
                      ? data.user.displayName
                      : "DeepSeek Agent"}
                  </span>
                  <small>{date(m.created_at)}</small>
                </div>
                <div className="message-text">
                  {m.role === "assistant" ? (
                    <Answer text={m.content} sources={m.sources} />
                  ) : (
                    m.content
                  )}
                </div>
                {m.role === "user" && m.context.notes?.length > 0 && (
                  <p className="muted">
                    笔记上下文：
                    {m.context.notes
                      .map((n: any) => `${n.title} v${n.revision}`)
                      .join("、")}
                  </p>
                )}
                {m.role === "assistant" && (
                  <>
                    <ConversationFiles conversationId={current.id} message={m} reload={()=>reloadConversation(current.id)}/>
                    <div className="ai-run-summary">
                      <small>{m.context.model || "DeepSeek"} · {{ disabled: "快速回答", low: "轻量思考", high: "深度思考", max: "最强思考" }[m.context.thinkingMode || "disabled"]} · {m.context.engine === "native" ? "官方联网" : "工作台检索"}</small>
                      {m.context.usage && <details>
                        <summary>查看用量与检索步骤</summary>
                        <p>输入 {m.context.usage.inputTokens ?? "未返回"} / 输出 {m.context.usage.outputTokens ?? "未返回"} token</p>
                        <p>缓存命中 {m.context.usage.cacheHitTokens ?? "未返回"} / 思考 {m.context.usage.reasoningTokens ?? "未返回"} / 审核 {m.context.usage.safetyTokens ?? "未返回"} token</p>
                        {m.context.engine === "native" && <p>计费搜索 {m.context.usage.webSearches ?? 0} 次 · 网页抓取 {m.context.usage.webFetches ?? 0} 次</p>}
                        <ul>{m.context.tools?.map((t: any, i: number) => <li key={i}>{({ search_local: "检索本地资料", search_web: "联网检索", read_web: "阅读网页", deepseek_web_search: "官方搜索", deepseek_read_url: "官方阅读链接" } as any)[t.name] || "检索资料"}{t.queries?.length ? "：" + t.queries.join("、") : ""}{t.status === "failed" ? "（未完成）" : ""}</li>)}</ul>
                        <small>用量由接口返回，缺失值显示为未返回；费用以 DeepSeek 账单为准。</small>
                      </details>}
                    </div>
                    {m.context.warnings?.map((w: string) => (
                      <p className="notice warning" key={w}>
                        {w}
                      </p>
                    ))}
                    <Sources sources={m.sources} go={go} />
                    <div className="message-actions">
                      <B secondary onClick={() => openSpeech(go,"message",m.id,"探索回答配音",m.content)}>生成配音</B>
                      <B
                        secondary
                        onClick={async () => {
                          const n = await act(
                            () =>
                              post("/notes/from-message", { messageId: m.id }),
                            "已添加到创作笔记",
                          );
                          if (n) {
                            await lists();
                          }
                        }}
                      >
                        <BookOpen size={15} />
                        添加到创作笔记
                      </B>
                    </div>
                  </>
                )}
              </article>
            ))}
            {working && (
              <div className="explore-progress" role="status">
                <LoaderCircle className="spin" size={17} />
                {stage || "任务已排队"}
              </div>
            )}
            {error && (
              <p className="notice warning" role="alert">
                {error}
              </p>
            )}
            {current?.jobs
              ?.filter((j: any) => ["failed", "interrupted"].includes(j.state))
              .slice(0, 1)
              .map((j: any) => (
                <div className="button-row" key={j.id}>
                  <span className="muted">
                    {j.error?.message || "任务中断"}
                  </span>
                  <B
                    secondary
                    onClick={async () => {
                      const r = await act(
                        () => post("/jobs/" + j.id + "/retry"),
                        "重试已排队",
                      );
                      if (r) setJob(r);
                    }}
                  >
                    重试该轮
                  </B>
                </div>
              ))}
            <div ref={end} />
          </div>
          <form className="explore-composer" onSubmit={send}>
            {(!data.settings.allowExternalAI || data.capabilities.deepseek!=="configured") && <small className="notice">新一轮 AI 创作需要连接并启用 DeepSeek。已有回答可直接导出。
              {data.user.role==="admin" && <button type="button" className="text-link" onClick={()=>go("settings")}>打开设置</button>}
            </small>}
            <details className="composer-settings"><summary>研究设置 {selected.length>0 && <span>已选 {selected.length} 篇笔记</span>}</summary>
            <div className="composer-options">
              <label>
                检索范围{" "}
                <select
                  aria-label="检索范围"
                  value={mode}
                  disabled={working}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="auto">按任务需要</option>
                  <option value="both">本地 + 联网</option>
                  <option value="local">仅本地资料</option>
                  <option value="web">仅联网</option>
                </select>
              </label>
              <label>思考强度{" "}<select aria-label="本轮思考强度" value={thinkingMode} disabled={working} onChange={(e) => setThinkingMode(e.target.value)}>
                <option value="default">跟随工作台</option><option value="disabled">快速回答</option><option value="low">轻量思考</option><option value="high">深度思考</option><option value="max">最强思考</option>
              </select></label>
              {mode !== "local" && <>
                <label>联网方式{" "}<select aria-label="本轮联网方式" value={webEngine} disabled={working} onChange={(e) => { setWebEngine(e.target.value); setWebAction("search"); }}>
                  <option value="default">跟随工作台</option><option value="native">官方搜索（Flash）</option><option value="controlled">工作台检索</option>
                </select></label>
                {data.settings.model === "deepseek-flash" && (webEngine === "native" || (webEngine === "default" && data.settings.exploreEngine === "native")) && <label>联网任务{" "}<select aria-label="联网任务" value={webAction} disabled={working} onChange={(e) => setWebAction(e.target.value)}>
                  <option value="search">搜索与整理</option><option value="read">仅阅读输入的链接</option>
                </select></label>}
              </>}

            </div>
            </details>
            <textarea
              aria-label="对话指令"
              placeholder={webAction === "read" && mode !== "local" ? "粘贴公开网页链接，并说明要总结、对比或提取的内容…" : "提问，或直接说「把刚才的内容做成 PPT」…"}
              rows={3}
              required
              maxLength={10000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="composer-footer">
              <small>
                本地命中的共享资料、本人笔记和所选上下文会发送给
                DeepSeek；联网发送检索词。回答需要核验。
              </small>
              {working ? (
                <B
                  secondary
                  type="button"
                  disabled={!job}
                  onClick={async () => {
                    const r = await act(
                      () => post("/jobs/" + job.id + "/cancel"),
                      "已请求取消",
                    );
                    if (r) setJob(r);
                  }}
                >
                  停止
                </B>
              ) : (
                <B type="submit" disabled={!prompt.trim()}>
                  <Send size={16} />
                  发送
                </B>
              )}
            </div>
          </form>
        </section>
      </div>
    </>
  );
}

export function Notes({ data, act, go, search, busy }: any) {
  const [notes, setNotes] = useState<any[]>([]),
    [current, setCurrent] = useState<any>(null),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [documentJson,setDocumentJson]=useState<any>(null),
    [categories,setCategories]=useState<any>({folder:"",tags:[],purposes:[],state:"inbox"}),
    [folderFilter,setFolderFilter]=useState(""),
    [history,setHistory]=useState<any[]>([]),
    [error, setError] = useState(""),
    [material, setMaterial] = useState(false);
  const item = location.hash.split("?")[0].split("/")[1] || "";
  const nid = item === "new" ? "" : item;
  const wechatPreview = new URLSearchParams(location.hash.split("?")[1] || "").get("wechatPreview");
  const saving=useRef(false),composing=useRef(false);const [compositionTick,setCompositionTick]=useState(0);
  const load = () => api("/notes").then(setNotes);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setError("");
    setMaterial(false);
    let active=true;
    if (nid)
      api("/notes/" + nid)
        .then((n) => {
          if(!active)return;
          setCurrent(n);
          setTitle(n.title);
          setBody(n.body);setDocumentJson(n.documentJson);setCategories(n.categories);
        })
        .catch((e) => active&&setError(e.message));
    else {
      setCurrent(null);
      setTitle("");
      setBody("");setDocumentJson(null);setCategories({folder:"",tags:[],purposes:[],state:"inbox"});
    }
    setHistory([]);return ()=>{active=false;};
  }, [item]);
  const dirty = !!current && (title !== current.title || body !== current.body || JSON.stringify(categories)!==JSON.stringify(current.categories) || JSON.stringify(documentJson)!==JSON.stringify(current.documentJson));
  useEffect(()=>{
    if(!dirty||!current||!title.trim()||!body.trim()||error)return;
    const timeout=setTimeout(async()=>{if(saving.current||composing.current)return;saving.current=true;try{const n=await patch('/notes/'+current.id,{title,body,documentJson,categories,revision:current.revision});if(location.hash.split('?')[0].split('/')[1]===current.id)setCurrent(n);load().catch(()=>{});}catch(e:any){setError(e.message+'。当前编辑仍保留在页面中，请先复制正文再处理版本冲突。');}finally{saving.current=false;}},1600);
    return ()=>clearTimeout(timeout);
  },[title,body,documentJson,categories,current,dirty,error,compositionTick]);
  const unsaved = current ? dirty : item === "new" && !!(title || body);
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(unsaved){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[unsaved]);
  async function save() {
    if(saving.current)return;saving.current=true;
    try{
    const n = await act(
      () =>
        current
          ? patch("/notes/" + current.id, {
              title,
              body, documentJson,categories,
              revision: current.revision,
            })
          : post("/notes", { title, body,documentJson,categories }),
      "笔记已保存",
    );
    if (n) {
      setCurrent(n);
      await load();
      go("notes/" + n.id + (wechatPreview ? "?wechatPreview=" + encodeURIComponent(wechatPreview) : ""));
    }
    return n;
    }finally{saving.current=false;}
  }
  useEffect(() => {
    if (!unsaved) return;
    const guard = (event: Event) => {
      if (!saving.current && !window.confirm("当前修改尚未保存，是否离开？")) event.preventDefault();
    };
    window.addEventListener("ecu-before-navigate", guard);
    return () => window.removeEventListener("ecu-before-navigate", guard);
  }, [unsaved]);
  if(nid&&(!current||current.id!==nid))return <p role="status">{error||'正在读取笔记…'}</p>;
  if (!item) return <>
    <div className="page-heading">
      <h1>笔记本</h1>
      <B onClick={() => go("notes/new")}><Plus size={16}/>新建笔记</B>
    </div>
    {error && <p role="alert">{error}</p>}
    <NoteGallery notes={notes} search={search || ""} folder={folderFilter} onFolder={setFolderFilter}
      onOpen={(id: string) => go("notes/" + id)}/>
    <KnowledgeBatch notes={notes} disabled={false} onChange={load}/>
  </>;
  return (
    <>
      <div className="notebook-detail-nav"><EditorIconButton icon={ArrowLeft} label="返回笔记本" onClick={() => go("notes")}/></div>
        <section className="panel note-editor" onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;setCompositionTick(x=>x+1);}}>
          <div className="section-head">
            <h2>{current ? "编辑笔记" : "写下一个新想法"}</h2>
            <span className="muted">
              {dirty
                ? "编辑后自动保存…"
                : current
                  ? "已保存 · v" + current.revision
                  : "新笔记"}
            </span>
          </div>
          {error && <p role="alert">{error}</p>}
          {!!current?.sourceUpdates?.length&&<div className="notice warning">引用的原资料已有新版本，请重新阅读后再创作。{current.sourceUpdates.map((s:any)=><button key={s.id} className="text-link" onClick={()=>go('snapshot/'+s.id)}>{s.title}</button>)}</div>}

          <F label="笔记标题">
            <input
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="给这个想法起个名字"
            />
          </F>
          <DocumentReader markdownWorkspace key={current?.id||'new'} label="笔记内容" text={body} onChange={(v:string,j:any)=>{setBody(v);setDocumentJson(j??null);}} documentJson={documentJson} maxLength={100000} sources={current?.sources||[]}/>
          <details className="note-classification"><summary>整理笔记 · 文件夹、标签与用途</summary><div className="form-grid"><F label="文件夹"><input value={categories.folder} onChange={e=>setCategories({...categories,folder:e.target.value})}/></F><F label="标签（逗号分隔）"><TagInput value={categories.tags} onChange={(tags:string[])=>setCategories({...categories,tags})}/></F><F label="用途（逗号分隔）"><TagInput value={categories.purposes} onChange={(purposes:string[])=>setCategories({...categories,purposes})}/></F><F label="整理状态"><select value={categories.state} onChange={e=>setCategories({...categories,state:e.target.value})}>{Object.entries({inbox:'收件箱',organized:'已整理','needs-review':'待复核',archived:'已归档'}).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></F></div></details>
          <div className="note-action-icons" role="group" aria-label="笔记操作">
            <EditorIconButton icon={Save} label="保存笔记" className="editor-save"
              disabled={busy || !title.trim() || !body.trim()} onClick={save}/>
            {current && (
              <>
                <EditorIconButton icon={Files} label="用这篇笔记制作 PPT" disabled={dirty}
                  onClick={() => carry(go,'deliver',[{kind:'note',id:current.id,revision:current.revision}])}/>
                <EditorIconButton icon={AudioLines} label="生成配音" disabled={dirty}
                  onClick={() => openSpeech(go,"note",current.id,title,body)}/>
                <EditorIconButton icon={Newspaper} label={wechatPreview ? "返回公众号排版" : "公众号排版"} disabled={dirty}
                  onClick={() => go('wechat/'+current.id+(wechatPreview?'?preview='+encodeURIComponent(wechatPreview):''))}/>
                <EditorIconButton icon={MessageSquare} label="载入AI对话" disabled={dirty}
                  onClick={() => carry(go,'explore',[{kind:'note',id:current.id}], 'explore')}/>
                <EditorIconButton icon={FileText} label="作为创作素材" disabled={dirty}
                  aria-expanded={material} onClick={() => setMaterial(!material)}/>
                <EditorIconButton icon={Trash2} label="删除笔记"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "确定删除这篇笔记？已导入项目的素材快照会保留。",
                      )
                    )
                      return;
                    const r = await act(
                      () => api("/notes/" + current.id, { method: "DELETE" }),
                      "笔记已删除",
                    );
                    if (r) {
                      go("notes");
                      setCurrent(null);
                      setTitle("");
                      setBody("");setDocumentJson(null);setCategories({folder:"",tags:[],purposes:[],state:"inbox"});
                      load();
                    }
                  }}
                />
              </>
            )}
          </div>
          {dirty && (
            <p className="muted">保存当前修改后，可以载入对话或创作。</p>
          )}
          {material && current && (
            <NoteMaterial
              key={current.id + ":" + current.revision}
              note={current}
              data={data}
              act={act}
              go={go}
              busy={busy}
            />
          )}
          <Sources sources={current?.sources} go={go} />
          {current&&<details className="note-history" onToggle={async e=>{if(e.currentTarget.open)setHistory(await api('/notes/'+current.id+'/history'));}}><summary>版本历史 · 可恢复旧正文</summary>{history.map(h=><p key={h.revision}>v{h.revision} · {date(h.created_at)} <button type="button" className="text-link" disabled={dirty||busy} onClick={async()=>{const n=await act(()=>post('/notes/'+current.id+'/restore',{revision:current.revision,restoreRevision:h.revision}),'已恢复为新版本');if(n){setCurrent(n);setTitle(n.title);setBody(n.body);setDocumentJson(n.documentJson);load();}}}>恢复这一版</button></p>)}{!history.length&&<p>首次编辑后会保留上一版。</p>}</details>}
        </section>
    </>
  );
}
function NoteMaterial({ note, data, act, go, busy }: any) {
  const [target, setTarget] = useState("new"),
    [sourceReviewed,setSourceReviewed]=useState(false),
    [title, setTitle] = useState(note.title),
    [value, setValue] = useState(scope);
  const project = data.projects.find((p: any) => p.id === target);
  return (
    <form
      className="note-material"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await act(
          () =>
            post("/notes/" + note.id + "/material", {
              revision: note.revision,
              sourceReviewed,
              scope: project?.scope || value,
              ...(project
                ? { projectId: project.id, projectRevision: project.revision }
                : target === "new"
                  ? { newProjectTitle: title }
                  : {}),
            }),
          "笔记已转为待核实素材",
        );
        if (r)
          go(
            r.projectId ? "project/" + r.projectId : "snapshot/" + r.snapshotId,
          );
      }}
    >
      <h3>载入创作素材</h3>
      {note.sources?.some((s:any)=>s.needsReview)&&<div className="source-comparison"><p className="notice warning">这篇笔记包含尚未核对的识别结果，请先对照原件校正。</p>{note.sources.filter((s:any)=>s.needsReview&&s.assetId).map((s:any)=><a key={s.assetId} href={'/api/assets/'+s.assetId} target="_blank" rel="noreferrer">查看原文件：{s.title}</a>)}<label className="check-source"><input type="checkbox" checked={sourceReviewed} onChange={e=>setSourceReviewed(e.target.checked)}/>我已核对并校正原始资料</label></div>}
      <p className="muted">
        固定当前笔记版本并共享到资料库，不会自动认定为政策事实。
      </p>
      <F label="载入位置">
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="new">新建创作项目</option>
          <option value="library">仅加入资料库</option>
          {data.projects.map((p: any) => (
            <option value={p.id} key={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </F>
      {target === "new" && (
        <F label="项目名称">
          <input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </F>
      )}
      {!project && (
        <div className="form-grid">
          <F label="地区">
            <input
              required
              value={value.region}
              onChange={(e) => setValue({ ...value, region: e.target.value })}
            />
          </F>
          <F label="年度">
            <input
              type="number"
              required
              min={2000}
              max={2100}
              value={value.year}
              onChange={(e) =>
                setValue({ ...value, year: Number(e.target.value) })
              }
            />
          </F>
          <F label="学段">
            <select
              value={value.stage}
              onChange={(e) => setValue({ ...value, stage: e.target.value })}
            >
              <option>中考</option>
              <option>高考</option>
              <option>综合</option>
            </select>
          </F>
          <F label="区县">
            <input
              value={value.district}
              onChange={(e) => setValue({ ...value, district: e.target.value })}
            />
          </F>
          <F label="受众">
            <input
              value={value.audience}
              onChange={(e) => setValue({ ...value, audience: e.target.value })}
            />
          </F>
        </div>
      )}
      {project && (
        <p>
          采用项目范围：{project.scope.region} / {project.scope.stage} /{" "}
          {project.scope.year}
        </p>
      )}
      <B type="submit" disabled={busy}>
        确认载入素材 <ArrowUpRight size={16} />
      </B>
    </form>
  );
}
export function CreatorSettings({ data, act }: any) {
  return (
    <>
      <Header
        title="设置"
        eyebrow="YOUR WORKSPACE"
        description="选择界面主题；模型和工作台管理配置由管理员维护。"
      />
      <section className="panel note-editor">
        <h2>界面主题</h2>
        <div className="theme-options">
          {[
            ["scholar", "书院 · Scholar"],
            ["obsidian", "曜石 · Obsidian"],
          ].map(([theme, label]) => (
            <button
              key={theme}
              className="theme-option"
              aria-pressed={data.settings.theme === theme}
              onClick={async () => {
                const r = await act(
                  () =>
                    patch("/settings/theme", {
                      revision: data.settings.revision,
                      theme,
                    }),
                  "主题已自动保存",
                );
                if (r) applyTheme(theme as any);
              }}
            >
              <strong>{label}</strong>
              <small>选择后自动保存</small>
            </button>
          ))}
        </div>
        <p>
          DeepSeek：
          {data.capabilities.deepseek === "configured"
            ? data.settings.allowExternalAI
              ? "已开启调用"
              : "等待管理员开启调用"
            : "等待管理员配置"}
        </p>
      </section>
    </>
  );
}
export function SalesPolicies({ data, search, go }: any) {
  return (
    <>
      <Header
        title="政策资料"
        eyebrow="POLICY INTELLIGENCE"
        description="查看已收集资料和原始来源，政策内容请以正式文件为准。"
      />
      <section className="panel read-cards">
        {data.snapshots
          .filter((s: any) => (s.title + s.publisher).includes(search || ""))
          .map((s: any) => (
            <button
              className="read-card"
              key={s.id}
              onClick={() => go("snapshot/" + s.id)}
            >
              <span className="eyebrow">
                {s.document_type} · {s.scope.region} · {s.scope.stage}
              </span>
              <h2>{s.title}</h2>
              <p>
                {s.publisher} · {s.published || "发布日期未知"}
              </p>
              <ArrowUpRight size={18} />
            </button>
          ))}
      </section>
    </>
  );
}
export function SalesSnapshot({ id, go }: any) {
  const [s, setS] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/snapshots/" + id)
      .then(setS)
      .catch((e) => setError(e.message));
  }, [id]);
  if (!s) return <p>{error || "正在读取资料…"}</p>;
  return (
    <>
      <Header
        title={s.title}
        eyebrow="SOURCE DOCUMENT"
        description={`${s.publisher} · ${s.published || "发布日期未知"} · ${s.document_type}`}
      />
      <section className="panel note-editor">
        <p className="notice">
          仅供政策查阅，请注意适用地区、年度和条件；笔记及解读不是正式文件。
        </p>
        <div className="button-row">
          {s.url?.startsWith("http") && (
            <a href={s.url} target="_blank" rel="noreferrer">
              查看原始网页 <ExternalLink size={14} />
            </a>
          )}
          {s.asset_id && (
            <a
              href={"/api/assets/" + s.asset_id}
              target="_blank"
              rel="noreferrer"
            >
              查看原始文件
            </a>
          )}
        </div>
        {s.paragraphs.map((p: any) => (
          <div className="read-paragraph" key={p.id}>
            <small>
              {p.id}
              {p.page ? " · 第" + p.page + "页" : ""}
            </small>
            <p>{p.text}</p>
          </div>
        ))}
      </section>
    </>
  );
}
export function SalesResults({ data, go, search }: any) {
  return (
    <>
      <Header
        title="可用成果"
        eyebrow="DELIVERABLES & DAILY"
        description="查看情报日报与已通过发布检查的成果文件。"
      />
      <section className="panel read-cards">
        <h2>可发布成果</h2>
        {!data.artifacts.length && (
          <p className="muted">暂时没有可发布成果。</p>
        )}
        {data.artifacts
          .filter((a: any) => a.name.includes(search || ""))
          .map((a: any) => (
            <a
              key={a.id}
              href={"/api/artifacts/" + a.id + "/download"}
              className="read-card"
            >
              <h3>{a.name}</h3>
              <p>{date(a.created_at)}</p>
            </a>
          ))}
      </section>
      <section className="panel read-cards">
        <h2>成果日报</h2>
        {data.reports.map((r: any) => (
          <button
            key={r.id}
            className="read-card"
            onClick={() => go("report/" + r.id)}
          >
            <h3>
              {r.date} 教育情报 · v{r.number}
            </h3>
            <p>
              {r.coverage === "complete" ? "完整覆盖" : "部分覆盖"} ·{" "}
              {date(r.created_at)}
            </p>
          </button>
        ))}
      </section>
    </>
  );
}
export function SalesReport({ id }: any) {
  const [r, setR] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/reports/" + id)
      .then(setR)
      .catch((e) => setError(e.message));
  }, [id]);
  if (!r) return <p>{error || "正在读取日报…"}</p>;
  const p = r.payload;
  return (
    <>
      <Header
        title={r.date + " 教育情报"}
        eyebrow="DAILY INTELLIGENCE"
        description={"日报版本 " + r.number}
      />
      <section className="panel note-editor">
        <p>{p.message}</p>
        {p.warnings?.map((w: string) => (
          <p className="notice warning" key={w}>
            {w}
          </p>
        ))}
        {p.topics?.map((t: any) => (
          <section key={t.id} className="read-paragraph">
            <h2>{t.title}</h2>
            <p>{t.summary}</p>
            <blockquote>{t.angle}</blockquote>
          </section>
        ))}
        <h3>来源资料</h3>
        {p.sources?.map((s: any) => (
          <p key={s.id}>
            {s.url?.startsWith("http") ? (
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>
            ) : (
              s.title
            )}{" "}
            · {s.publisher}
          </p>
        ))}
      </section>
    </>
  );
}
