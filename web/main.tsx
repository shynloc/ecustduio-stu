import {ProjectHtmlFilm} from "./ProjectHtmlFilm";
import { workspaceNavigation, WorkspaceLinks, SectionLinks } from "./WorkspaceNavigation";
import { ArtifactLibrary } from "./ArtifactLibrary";
import {UploadLimits} from './UploadLimits';
import {EvidencePanel} from './EvidencePanel';
import {PipelineStudio} from './PipelineStudio';
import './pipeline.css';
import {carry} from './context';
import React, { useEffect, useState, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Radar,
  Lightbulb,
  FolderOpen,
  Library,
  Files,
  Activity,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  RefreshCw,
  ChevronRight,
  Check,
  Clock,
  Link,
  Download,
  FileText,
  ShieldCheck,
  AlertCircle,
  Star,
  X,
  Menu,
  Play,
  Pause,
  Layers,
  BookOpen,
  CheckCircle2,
  Send,
  Leaf,
  SlidersHorizontal,
  ExternalLink,
  ChevronDown,
  Save,
  Trash2,
  Lock,
  Unlock,
  BrainCircuit,
  MessageSquare,
  NotebookPen,
  Users,
} from "lucide-react";
import { api, init, post, put, patch, upload } from "./api";
import { kindNames, DeepSeekSettings } from "../shared/schema";
import "./style.css";
import "./themes.css";
import { applyTheme, type Theme } from "./theme";
import { uid, copyText } from "./compat";
import { productionTemplates } from "../shared/production";
import { Production } from "./Production";
import {InputCenter} from './InputCenter';
import {WechatEditor,WechatConnection} from './WechatEditor';
import { MediaStudio, openSpeech } from "./MediaStudio";
import { UpdatePanel } from "./UpdatePanel";
import {SecretCredentialInput} from './SecretCredentialInput';
import {ProjectVisualLinks,VisualWebImport} from './UnifiedVisualStudio';
import {WorkflowStudio,PolicyImpacts,VisualStudio,WorkflowResult} from './WorkflowStudio';
import {
  AuthScreen,
  ForcedPassword,
  PasswordForm,
  Accounts,
  Explore,
  Notes,
  CreatorSettings,
  SalesPolicies,
  SalesSnapshot,
  SalesResults,
  SalesReport,
  roleNames,
} from "./workspace";

const fmt = (v: any) =>
  v
    ? new Date(v).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      })
    : "尚未运行";
async function copyRichContent(body: any) {
  const escape = (v: string) =>
    v.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  const text =
    body.title +
    "\n\n" +
    body.blocks.map((b: any) => b.title + "\n" + b.text).join("\n\n");
  const html =
    '<section style="font-family:Microsoft YaHei,sans-serif;font-size:16px;line-height:1.9;color:#242821"><h1>' +
    escape(body.title) +
    "</h1>" +
    body.blocks
      .map(
        (b: any) =>
          '<h2 style="font-size:21px;color:#23483d">' +
          escape(b.title) +
          "</h2><p>" +
          escape(b.text).replaceAll("\n", "<br>") +
          "</p>",
      )
      .join("") +
    "</section>";
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    await copyText(text);
    return;
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    }),
  ]);
}
function useStoredState(key: string, initial: string) {
  const [value, setValue] = useState(() => {
    try {
      return sessionStorage.getItem("ecustudio:" + key) || initial;
    } catch {
      return initial;
    }
  });
  return [
    value,
    (v: string) => {
      setValue(v);
      try {
        sessionStorage.setItem("ecustudio:" + key, v);
      } catch {}
    },
  ] as const;
}
const scopeDefault = {
  region: "北京",
  district: "全市",
  stage: "中考",
  year: new Date().getFullYear(),
  audience: "北京初三家长",
};
const statusNames: any = {
  queued: "排队中",
  running: "运行中",
  awaiting_input: "等待输入",
  succeeded: "已完成",
  partial: "部分完成",
  failed: "失败",
  canceled: "已取消",
  interrupted: "已中断",
  pending: "待核实",
  verified: "已核实",
  excluded: "已排除",
  confirmed: "已确认",
  unreviewed: "未审核",
  needs_changes: "需修改",
  draft: "待确认发送",
  sent: "已发送",
  sending: "发送中",
  unknown: "结果待确认",
  blocked: "未就绪",
};
function Badge({
  state,
  children,
}: {
  state?: string;
  children?: React.ReactNode;
}) {
  return (
    <span className={"badge " + (state || "")}>
      {children || statusNames[state!] || state}
    </span>
  );
}
function Button({
  children,
  onClick,
  secondary = false,
  disabled = false,
  small = false,
  ...rest
}: any) {
  return (
    <button
      type="button"
      className={`${secondary ? "btn secondary" : "btn"} ${small ? "small" : ""}`}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
function Empty({
  icon: Icon = BookOpen,
  title = "这里还没有内容",
  text = "从一份政策原文开始，建立有据可循的内容。",
  action,
}: any) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Field({ label, children, hint }: any) {
  const labelId = React.useId();
  return (
    <div className="field">
      <span id={labelId}>{label}</span>
      {React.Children.map(children, (child) =>
        React.isValidElement(child) &&
        ["input", "select", "textarea"].includes(String(child.type))
          ? React.cloneElement(child as React.ReactElement<any>, {
              "aria-labelledby":
                (child.props as any)["aria-labelledby"] ||
                ((child.props as any)["aria-label"] ? undefined : labelId),
            })
          : child,
      )}
      {hint && <small>{hint}</small>}
    </div>
  );
}
function Modal({ title, children, onClose, wide = false }: any) {
  const dialog = useRef<HTMLDivElement>(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const focusable = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ) || [],
      ).filter((el) => el.getClientRects().length > 0);
    focusable()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      } else if (event.key === "Tab") {
        const elements = focusable(),
          first = elements[0],
          last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        ref={dialog}
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <span className="eyebrow">ECUSTUDIO / 工作空间</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-btn" aria-label="关闭" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
function ScopeFields({ value, onChange }: any) {
  return (
    <div className="form-grid">
      <Field label="地区">
        <input
          value={value.region}
          onChange={(e) => onChange({ ...value, region: e.target.value })}
        />
      </Field>
      <Field label="区县">
        <input
          value={value.district}
          onChange={(e) => onChange({ ...value, district: e.target.value })}
        />
      </Field>
      <Field label="学段">
        <select
          value={value.stage}
          onChange={(e) => onChange({ ...value, stage: e.target.value })}
        >
          {["中考", "高考", "综合"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </Field>
      <Field label="适用年度">
        <input
          type="number"
          min="2000"
          max="2100"
          value={value.year}
          onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}
        />
      </Field>
      <Field label="目标受众">
        <input
          value={value.audience}
          onChange={(e) => onChange({ ...value, audience: e.target.value })}
        />
      </Field>
    </div>
  );
}

function AuthApp() {
  const [session, setSession] = useState<any>(null),
    [error, setError] = useState("");
  const refresh = () =>
    init()
      .then(setSession)
      .catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
    window.addEventListener("ecustudio:auth-required", refresh);
    return () => window.removeEventListener("ecustudio:auth-required", refresh);
  }, []);
  if (!session)
    return (
      <div className="boot">
        <Leaf size={36} />
        <h1>EcuStudio</h1>
        <p>{error || "正在连接工作空间…"}</p>
        {error && <Button onClick={refresh}>重新连接</Button>}
      </div>
    );
  if (!session.user)
    return <AuthScreen session={session} onAuth={setSession} />;
  if (session.user.mustChangePassword)
    return <ForcedPassword onAuth={setSession} />;
  return (
    <App
      key={session.user.id}
      onLogout={async () => {
        await post("/auth/logout");
        setSession(await init());
      }}
    />
  );
}
function App({ onLogout }: any) {
  const [data, setData] = useState<any>(null),
    [route, setRoute] = useState(location.hash.slice(1) || "dashboard"),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<any>(null),
    [search, setSearch] = useState(""),
    [mobileNav, setMobileNav] = useState(false);
  useEffect(()=>{const fn=(e:any)=>setError(e.detail);window.addEventListener('ecu-context-error',fn);return()=>window.removeEventListener('ecu-context-error',fn);},[]);
  const refresh = useCallback(async () => setData(await api("/state")), []);
  useEffect(() => {
    if (data) applyTheme(data.settings.theme || "scholar");
  }, [data?.settings.theme]);
  useEffect(() => {
    init()
      .then(refresh)
      .catch((e) => setError(e.message));
    const handle = () => {
      setRoute(location.hash.slice(1) || "dashboard");
      setMobileNav(false);
      setSearch("");
    };
    window.addEventListener("hashchange", handle);
    const timer = setInterval(() => refresh().catch(() => {}), 6000);
    return () => {
      window.removeEventListener("hashchange", handle);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  async function act(fn: () => Promise<any>, message = "已保存") {
    setBusy(true);
    setError("");
    try {
      const r = await fn();
      await refresh();
      if (message) setToast(message);
      return r;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  const go = (value: string) => {
    if (window.dispatchEvent(new CustomEvent("ecu-before-navigate", {cancelable:true, detail:{to:value}}))) {
      setMobileNav(false);
      location.hash = value;
    }
  };
  const [rawPage, itemId] = route.split("?")[0].split("/");
  const sales = data?.user.role === "sales",
    admin = data?.user.role === "admin";
  const page =
    sales && !["policies", "snapshot", "results", "report"].includes(rawPage)
      ? "policies"
      : rawPage;
  const navigation = workspaceNavigation(page, data?.user.role);
  const common = { data, act, go, setModal, refresh, busy, search };
  if (!data)
    return (
      <div className="boot">
        <Leaf size={36} />
        <h1>EcuStudio</h1>
        <p>{error || "正在连接本地工作空间…"}</p>
        {error && <Button onClick={() => location.reload()}>重新连接</Button>}
      </div>
    );
  return (
    <div className="shell">
      <aside className={"sidebar " + (mobileNav ? "open" : "")}>
        <a className="brand" href="#dashboard">
          <span className="brand-mark">
            <Leaf size={23} />
          </span>
          <div>
            <strong>
              EcuStudio<span>教创工作台</span>
            </strong>
            <small>EDUCATION · EVIDENCE · CREATION</small>
          </div>
        </a>
        <div className="workspace">
          <span className="workspace-icon">京</span>
          <div>
            <strong>北京教育研究室</strong>
            <small>本地工作空间</small>
          </div>
        </div>
        <WorkspaceLinks nav={navigation} go={go}
          activeJobs={data.jobs.filter((j:any)=>["queued","running"].includes(j.state)).length}
          failedJobs={data.jobs.filter((j:any)=>j.state==="failed").length}/>
        {!sales && (
          <div className="sidebar-footer">
            <div className="agent-mini">
              <BrainCircuit size={21} />
              <div>
                <strong>DeepSeek Agent</strong>
                <span>
                  {data.capabilities.deepseek === "configured"
                    ? data.settings.allowExternalAI
                      ? "已开启 · 受控执行"
                      : "待开启调用 · 前往设置"
                    : "等待连接模型"}
                </span>
              </div>
              <i
                className={
                  "status-dot " +
                  (data.capabilities.deepseek === "configured" ? "on" : "")
                }
              />
            </div>
            <a href="#settings">
              本地保存 · 数据由你掌控 <ArrowUpRight size={14} />
            </a>
          </div>
        )}
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label={mobileNav ? "收起导航" : "打开导航"}
              aria-expanded={mobileNav}
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu />
            </button>
            <span>工作空间</span>
            <ChevronRight size={14} />
            <strong>{navigation.label}</strong>
          </div>
          <div className="top-actions">
            {(["policies","explore","topics","projects"].includes(page) || (page==="notes" && !itemId) || (sales && page==="results")) && <div className="global-search">
              <Search size={16} />
              <input
                placeholder="搜索当前列表…"
                aria-label="搜索"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>}
            <span className="local-label">
              <i className="status-dot on" />
              本地运行
            </span>
            <button
              className="session-user"
              title="修改密码"
              onClick={() =>
                setModal({
                  title: "修改密码",
                  content: (
                    <PasswordForm
                      onDone={() => {
                        setModal(null);
                        setToast("密码已修改");
                      }}
                    />
                  ),
                })
              }
            >
              <span className="avatar">
                {data.user.displayName.slice(0, 1)}
              </span>
              <span className="user-label">
                {data.user.displayName} · {roleNames[data.user.role]}
              </span>
            </button>
            <button className="logout-btn" onClick={onLogout}>
              退出登录
            </button>
          </div>
        </header>
        <div className="page-content">
          {error && (
            <div role="alert" className="error-banner">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="关闭错误">
                <X size={16} />
              </button>
            </div>
          )}
          <SectionLinks nav={navigation} page={page} go={go}/>
          {page === "dashboard" && <Dashboard {...common} />}
          {page === 'input'&&<InputCenter {...common}/>}
          {page === 'settings'&&data.user?.role==='admin'&&<UploadLimits/>}
          {page === 'deliver'&&<PipelineStudio key={route} {...common} id={itemId}/>}
          {page === 'wechat'&&<WechatEditor key={route} route={route} {...common} id={itemId}/>}
          {page === "policies" &&
            (sales ? <SalesPolicies {...common} /> : <Policies {...common} />)}
          {page === "snapshot" &&
            (sales ? (
              <SalesSnapshot {...common} id={itemId} />
            ) : (
              <Snapshot {...common} id={itemId} />
            ))}
          {page === "explore" && <Explore key={route} {...common} />}
          {page === "steward" && <WorkflowStudio key={itemId||'new'} {...common} id={itemId}/>}
          {page === "impacts" && <PolicyImpacts {...common} id={itemId}/>}
          {page === "visual" && <VisualStudio key={itemId} {...common} id={itemId}/>}
          {page === "notes" && <Notes {...common} />}
          {(page === "media" || page === "speech") && <MediaStudio key={route} {...common} id={itemId} speech={page==="speech"}/>}
          {page === "topics" && <Topics {...common} />}
          {page === "projects" && <Projects {...common} />}
          {page === "project" && <Project {...common} id={itemId} />}
          {page === "library" && <LibraryPage {...common} />}
          {page === "make" && (
            <Production key={itemId} {...common} templateId={itemId} />
          )}
          {page === "results" &&
            (sales ? <SalesResults {...common} /> : <ArtifactLibrary key={route} {...common} />)}
          {page === "reports" && !sales && <Reports {...common}/>}
          {page === "report" &&
            (sales ? (
              <SalesReport {...common} id={itemId} />
            ) : (
              <Report {...common} id={itemId} />
            ))}
          {page === "tasks" && <Tasks {...common} />}
          {page === "job" && <Job {...common} id={itemId} />}
          {page === "settings" &&
            (admin ? (
              <SettingsPage {...common} section={itemId} />
            ) : (
              <CreatorSettings {...common} />
            ))}
          {page === "accounts" &&
            (admin ? (
              <Accounts {...common} />
            ) : (
              <p className="notice">当前账号无权管理工作台成员。</p>
            ))}
        </div>
        <footer className="app-footer">
          <span>EcuStudio 教创工作台</span>
          <span>每一个结论，都有来处。</span>
          <span>LOCAL FIRST · V{data.version}</span>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {modal && (
        <Modal
          title={modal.title}
          wide={modal.wide}
          onClose={() => setModal(null)}
        >
          {modal.type === "import" ? (
            <ImportForm
              {...common}
              initialOcr={modal.initialOcr}
              close={() => setModal(null)}
            />
          ) : modal.type === "project" ? (
            <NewProject
              {...common}
              topic={modal.topic}
              snapshot={modal.snapshot}
              close={() => setModal(null)}
            />
          ) : modal.type === "character" ? (
            <CharacterForm {...common} close={() => setModal(null)} />
          ) : (
            modal.content
          )}
        </Modal>
      )}
    </div>
  );
}
function Heading({ eyebrow, title, description, actions }: any) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="heading-actions">{actions}</div>
    </div>
  );
}
function Dashboard({ data, act, go, setModal, busy }: any) {
  const running = data.jobs.find((j: any) => j.state === "running"),
    report = data.reports[0],
    top = data.topics
      .filter((t: any) => t.eligible && !t.deferred && t.status !== "已归档")
      .slice(0, 3);
  return (
    <>
      <Heading
        eyebrow={new Date().toLocaleDateString("zh-CN", {
          timeZone: "Asia/Shanghai",
          month: "long",
          day: "numeric",
          weekday: "long",
        })}
        title="工作台"
        description="从教育情报，到有价值的表达。"
        actions={
          <Button
            secondary
            disabled={busy}
            onClick={() => act(() => post("/monitor"), "监测任务已加入队列")}
          >
            <RefreshCw size={16} />
            立即检查政策更新
          </Button>
        }
      />
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">
            <span />
            从事实出发，让创作更从容
          </span>
          <h2>
            让每一份教育内容，
            <br />
            都有据可循<span className="orange">。</span>
          </h2>
          <p>
            发现政策变化，梳理可信证据。
            <br />
            把一个好选题，写成值得分享的内容。
          </p>
          <div className="hero-actions">
            <Button
              onClick={() =>
                go("input")
              }
            >
              <Plus size={17} />
              导入一份资料
            </Button>
            <button className="text-link" onClick={() => go("library")}>
              开始内容创作 <ArrowRight size={17} />
            </button>
          </div>
        </div>
        {data.settings.theme === "obsidian" ? (
          <div className="obsidian-constellation" aria-label="证据链导航">
            <div className="evidence-orbit" />
            <svg
              className="evidence-links"
              viewBox="0 0 360 260"
              aria-hidden="true"
            >
              <path d="M80 55 C150 20 150 90 265 95 M265 95 C250 170 135 120 120 200 M120 200 C200 240 260 210 300 230" />
            </svg>
            {[
              ["01 / SOURCE", "原文快照", "policies", FileText],
              ["02 / EVIDENCE", "事实与核验", "policies", ShieldCheck],
              ["03 / MASTER", "内容母稿", "projects", Layers],
              ["04 / CREATE", "多元表达", "results", Files],
            ].map(([label, title, page, Icon]: any, i) => (
              <button
                key={page + label}
                className={"evidence-node node-" + i}
                onClick={() => go(page)}
              >
                <small>{label}</small>
                <strong>
                  <Icon size={15} />
                  {title}
                  <ArrowUpRight size={13} />
                </strong>
              </button>
            ))}
            <span className="evidence-caption">EVERY CLAIM HAS A SOURCE.</span>
          </div>
        ) : (
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <span className="orbital-note">
              SOURCE
              <br />↓<br />
              INSIGHT
              <br />↓<br />
              STORY
            </span>
            <div className="paper paper-back" />
            <div className="paper paper-front">
              <span className="paper-symbol">
                <Leaf size={32} />
              </span>
              <span className="paper-line long" />
              <span className="paper-line" />
              <span className="paper-line short" />
              <div className="paper-stamp">
                <Check size={14} /> 有据可循
              </div>
            </div>
            <span className="art-caption">RESEARCH INTO POSSIBILITY</span>
          </div>
        )}
      </section>
      <div className="metrics">
        {[
          ["资料快照", data.counts.snapshots, "持续积累的研究资料", Radar],
          [
            "待核验事实",
            data.counts.pending,
            "原文对照，确认依据",
            ShieldCheck,
          ],
          ["创作项目", data.counts.projects, "从选题走向作品", FolderOpen],
          ["已导出成果", data.counts.artifacts, "每一版都有迹可查", Files],
        ].map(([label, value, hint, Icon]: any) => (
          <div className="metric" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={18} />
            </div>
            <strong>{String(value).padStart(2, "0")}</strong>
            <small>{hint}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">DAILY FOCUS</span>
              <h2>
                今日值得关注 <span className="label-outline">TOP 3</span>
              </h2>
            </div>
            <button className="text-link" onClick={() => go("topics")}>
              全部选题 <ArrowUpRight size={16} />
            </button>
          </div>
          {top.length ? (
            top.map((t: any, i: number) => (
              <article
                className="focus-row"
                key={t.id}
                onClick={() => go("snapshot/" + t.snapshot_id)}
              >
                <span className="focus-number">0{i + 1}</span>
                <div>
                  <div className="inline">
                    <Badge state="verified" />
                    <span className="muted">{t.audience}</span>
                  </div>
                  <h3>{t.title}</h3>
                  <p>{t.summary}</p>
                </div>
                <strong className="score">
                  {t.total}
                  <small>系统评分</small>
                </strong>
              </article>
            ))
          ) : (
            <Empty
              title="好内容，从一份可信资料开始"
              text="完成原文核验后，推荐选题会出现在这里。宁缺毋滥，不用未核实消息填充榜单。"
              action={
                <Button secondary small onClick={() => go("policies")}>
                  前往政策情报 <ArrowRight size={14} />
                </Button>
              }
            />
          )}
        </section>
        <aside className="panel daily-status">
          <span className="eyebrow">YOUR DAILY RHYTHM</span>
          <h2>让信息如期而至</h2>
          <div className="schedule-clock">
            {data.settings.scheduleTime}
            <span>北京时间</span>
          </div>
          <div className="status-row">
            <span>每日监测</span>
            <Badge
              state={data.settings.scheduleEnabled ? "verified" : "pending"}
            >
              {data.settings.scheduleEnabled ? "已启用" : "未启用"}
            </Badge>
          </div>
          <div className="status-row">
            <span>监测窗口</span>
            <strong>最近 {data.settings.windowHours} 小时</strong>
          </div>
          <div className="status-row">
            <span>最近日报</span>
            <button className="text-link" onClick={()=>go(report ? "report/"+report.id : "reports")}>{report ? fmt(report.created_at) : "查看监测日报"}</button>
          </div>
          <div className="status-note">
            <Clock size={16} />
            <p>
              {running
                ? "后台正在处理任务，页面关闭后仍可继续。"
                : data.nextSchedule
                  ? "下次计划：" + fmt(data.nextSchedule)
                  : "开启每日计划，自动发现教育信息。电脑与后台需保持运行。"}
            </p>
          </div>
          <Button secondary onClick={() => go("tasks")}>
            查看任务中心 <ArrowRight size={15} />
          </Button>
        </aside>
      </div>
      <div className="section-head lower">
        <div>
          <span className="eyebrow">CONTINUE CREATING</span>
          <h2>最近的创作</h2>
        </div>
        <button className="text-link" onClick={() => go("projects")}>
          查看项目 <ArrowUpRight size={16} />
        </button>
      </div>
      <div className="project-strip">
        {data.projects.slice(0, 3).map((p: any) => (
          <button
            className="project-tile"
            onClick={() => go("project/" + p.id)}
            key={p.id}
          >
            <span className="tile-icon">
              <FileText />
            </span>
            <div>
              <Badge>
                {p.scope.stage} · {p.scope.year}
              </Badge>
              <h3>{p.title}</h3>
              <p>{fmt(p.created_at)}</p>
            </div>
            <ArrowUpRight size={18} />
          </button>
        ))}
        <button
          className="new-project-tile"
          onClick={() => setModal({ type: "project", title: "新建创作项目" })}
        >
          <Plus size={25} />
          <strong>为下一个想法留一个位置</strong>
          <span>新建项目</span>
        </button>
      </div>
      {!!data.recentNotes?.length && <section className="panel pipeline-form lower"><h2>最近编辑的笔记</h2>
        {data.recentNotes.map((n:any)=><button key={n.id} className="text-link" onClick={()=>go("notes/"+n.id)}>{n.title}</button>)}
      </section>}
    </>
  );
}
function ImportForm({ act, close, go, initialOcr }: any) {
  const [tab, setTab] = useState("url"),
    [scope, setScope] = useState(scopeDefault),
    [form, setForm] = useState<any>({
      url: "",
      title: "",
      text: "",
      publisher: "用户提供",
      published: "",
      documentType: "待判断",
    }),
    [file, setFile] = useState<any>(null),
    [loading, setLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState(""),
    [ocrJobId, setOcrJobId] = useState(""),
    [ocrWarnings, setOcrWarnings] = useState<string[]>([]);
  useEffect(() => {
    if (initialOcr) {
      setTab("file");
      setFile({
        id: initialOcr.result.sourceAssetId,
        needsOcr: true,
        ocrReady: true,
      });
      setForm((v: any) => ({
        ...v,
        title: "OCR识别资料",
        text: initialOcr.result.text,
      }));
      setOcrJobId(initialOcr.id);
      setOcrWarnings(initialOcr.result.warnings);
      setOcrStatus(
        `已恢复识别结果，共${initialOcr.result.pageCount}页，请校正后导入。`,
      );
    }
  }, [initialOcr]);
  async function recognize(uploaded: any, force = false) {
    setLoading(true);
    setOcrStatus("OCR任务正在排队…");
    setOcrJobId("");
    try {
      await act(async () => {
        const job = await post("/ocr", { assetId: uploaded.id, force });
        setOcrJobId(job.id);
        for (let i = 0; i < 900; i++) {
          const status = await api("/jobs/" + job.id);
          setOcrStatus(status.events?.at(-1)?.payload?.message || "正在识别…");
          if (status.state === "succeeded") {
            setForm((f: any) => ({ ...f, text: status.result.text }));
            setOcrWarnings(status.result.warnings);
            setFile({ ...uploaded, ocrReady: true });
            setOcrStatus(
              `OCR已完成，共${status.result.pageCount}页。请校正识别内容后导入。`,
            );
            return status;
          }
          if (["failed", "canceled", "interrupted"].includes(status.state))
            throw new Error(status.error?.message || "OCR任务已停止");
          await new Promise((r) => setTimeout(r, 1000));
        }
        throw new Error("OCR等待超时，可在任务页查看或取消任务");
      }, "OCR识别完成");
    } finally {
      setLoading(false);
    }
  }
  const set = (k: string, v: any) => setForm({ ...form, [k]: v });
  return (
    <div className="form">
      <div className="notice"><span>需要 DeepSeek 解析文件、理解图片或转写录音？</span><button className="text-link" onClick={() => { close(); go("media"); }}>打开文件与语音</button></div>
      <div className="segmented">
        {[
          ["url", "公开网址"],
          ["text", "粘贴原文"],
          ["file", "上传文件"],
        ].map(([k, l]) => (
          <button
            className={tab === k ? "selected" : ""}
            onClick={() => setTab(k)}
            key={k}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "url" ? (
        <Field label="资料网址">
          <input
            placeholder="https://…"
            value={form.url}
            onChange={(e) => set("url", e.target.value)}
          />
        </Field>
      ) : tab === "text" ? (
        <Field label="原文内容">
          <textarea
            rows={7}
            placeholder="粘贴政策原文，保留标题、来源与条件…"
            value={form.text}
            onChange={(e) => set("text", e.target.value)}
          />
        </Field>
      ) : (
        <Field
          label="选择图片、PDF、DOCX、Markdown、TXT 或 HTML"
          hint="图片和扫描页自动使用本机 OCR；文本PDF直接提取。OCR按页识别并复用已完成页，不上传到云端。"
        >
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.pdf,.docx,.md,.txt,.html"
            disabled={loading}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                setFile(null);
                setOcrStatus("");
                setOcrJobId("");
                setOcrWarnings([]);
                setForm((v: any) => ({ ...v, text: "" }));
                setLoading(true);
                const r = await act(() => upload(f), "文件已解析");
                setLoading(false);
                if (r) {
                  setOcrWarnings(r.warnings || []);
                  setFile(r);
                  setForm({
                    ...form,
                    title: r.title || f.name,
                    text: r.text || "",
                  });
                  if (r.needsOcr) await recognize(r);
                }
              }
            }}
          />
          {file && (
            <textarea
              rows={5}
              value={form.text}
              onChange={(e) => set("text", e.target.value)}
              aria-label="提取预览"
            />
          )}
          {ocrStatus && <div role="status">{ocrStatus}</div>}
          {ocrWarnings.map((warning, i) => (
            <small key={i}>{warning}</small>
          ))}
          {file?.needsOcr && !file.ocrReady && !loading && (
            <Button secondary onClick={() => recognize(file)}>
              重新识别
            </Button>
          )}
          {file &&
            !loading &&
            (file.needsOcr || /\.pdf$/i.test(file.name || "")) && (
              <Button secondary small onClick={() => recognize(file, true)}>
                使用OCR重新识别全部页面
              </Button>
            )}
        </Field>
      )}
      <Field label="标题（网址导入可留空自动提取）">
        <input
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
        />
      </Field>
      <div className="form-grid">
        <Field label="发布机构">
          <input
            value={form.publisher}
            onChange={(e) => set("publisher", e.target.value)}
          />
        </Field>
        <Field label="发布日期（未知请留空）">
          <input
            type="date"
            value={form.published}
            onChange={(e) => set("published", e.target.value)}
          />
        </Field>
        <Field label="材料性质">
          <select
            value={form.documentType}
            onChange={(e) => set("documentType", e.target.value)}
          >
            {["待判断", "正式文件", "征求意见", "媒体解读", "历史资料"].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
        </Field>
      </div>
      <ScopeFields value={scope} onChange={setScope} />
      <div className="notice">
        <ShieldCheck size={17} />
        来源可信度、事实核验和编辑审核分别记录。导入不等于已核实。
      </div>
      <Button
        disabled={
          loading ||
          (tab === "file" && (!file || (file.needsOcr && !file.ocrReady)))
        }
        onClick={async () => {
          const body = { ...form, scope, published: form.published || null };
          if (tab !== "url") delete body.url;
          else delete body.text;
          const r = await act(
            () =>
              tab === "file"
                ? post("/import-upload", {
                    ...body,
                    assetId: file?.id,
                    title: form.title,
                    text: form.text,
                    ocrJobId: file?.ocrReady ? ocrJobId : undefined,
                  })
                : post("/imports", body),
            "导入任务已提交",
          );
          if (r) {
            close();
            go("job/" + r.id);
          }
        }}
      >
        导入资料 <ArrowRight size={16} />
      </Button>
    </div>
  );
}
function matchesScope(s: any, serialized: string) {
  const f = JSON.parse(serialized);
  return (
    !!s &&
    Object.entries(f).every(
      ([key, value]) =>
        !value ||
        String(key === "publisher" ? s.publisher : s.scope[key]) === value,
    )
  );
}
function SourceFilters({ value, onChange, snapshots }: any) {
  const f = JSON.parse(value);
  return (
    <div className="filter-grid">
      {[
        ["region", "地区"],
        ["district", "区县"],
        ["stage", "学段"],
        ["year", "年度"],
        ["publisher", "来源"],
      ].map(([key, label]) => (
        <Field key={key} label={label + "筛选"}>
          <select
            value={f[key] || ""}
            onChange={(e) =>
              onChange(JSON.stringify({ ...f, [key]: e.target.value }))
            }
          >
            <option value="">全部{label}</option>
            {[
              ...new Set<string>(
                snapshots.map((s: any) =>
                  String(key === "publisher" ? s.publisher : s.scope[key]),
                ),
              ),
            ]
              .sort()
              .map((v) => (
                <option key={v}>{v}</option>
              ))}
          </select>
        </Field>
      ))}
    </div>
  );
}
function Policies({ data, search, go, setModal }: any) {
  const [filter, setFilter] = useStoredState("policies-filter", "全部");
  const [scopeFilter, setScopeFilter] = useStoredState("policy-scope", "{}");
  const items = data.snapshots.filter(
    (s: any) =>
      (filter === "全部" || s.scope.stage === filter) &&
      (s.title + s.publisher).includes(search) &&
      matchesScope(s, scopeFilter),
  );
  return (
    <>
      <Heading
        eyebrow="POLICY INTELLIGENCE"
        title="团队原文"
        description="保留原文，明确范围，让事实经得起追溯。"
        actions={
          <Button
            onClick={() => go("input")}
          >
            <Plus size={16} />
            添加资料
          </Button>
        }
      />
      <div className="panel">
        <div className="toolbar">
          <div className="tabs">
            {["全部", "中考", "高考", "综合"].map((x) => (
              <button
                key={x}
                className={filter === x ? "active" : ""}
                onClick={() => setFilter(x)}
              >
                {x}
              </button>
            ))}
          </div>
          <span className="muted">{items.length} 份资料快照</span>
        </div>
        <SourceFilters
          value={scopeFilter}
          onChange={setScopeFilter}
          snapshots={data.snapshots}
        />
        {items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>政策与资料</th>
                  <th>适用范围</th>
                  <th>材料性质</th>
                  <th>发布日期</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((s: any) => (
                  <tr key={s.id} onClick={() => go("snapshot/" + s.id)}>
                    <td>
                      <strong>{s.title}</strong>
                      <small>
                        {s.publisher}
                        {s.previous_id && <> · <button className="text-link" onClick={event=>{event.stopPropagation();go("impacts/"+s.id);}}>查看更新影响</button></>}
                      </small>
                    </td>
                    <td>
                      {s.scope.region} · {s.scope.stage}
                      <small>
                        {s.scope.year} 年 · {s.scope.district}
                      </small>
                    </td>
                    <td>
                      <Badge>{s.document_type}</Badge>
                    </td>
                    <td>{s.published || "待核实"}</td>
                    <td>
                      <ChevronRight size={18} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="还没有研究资料"
            action={
              <Button
                secondary
                onClick={() =>
                  go("input")
                }
              >
                导入首份资料
              </Button>
            }
          />
        )}
      </div>
    </>
  );
}
function MetadataForm({ snapshot, act, done }: any) {
  const [form, setForm] = useState<any>({
    title: snapshot.title,
    publisher: snapshot.publisher,
    published: snapshot.published || "",
    documentType: snapshot.document_type,
    scope: snapshot.scope,
    reason: "",
  });
  const change = (key: string, value: any) =>
    setForm({ ...form, [key]: value });
  return (
    <div className="form panel">
      <p className="muted">
        原文快照保持不变。校正范围后，已有事实会回到待核验状态，关联成果需要复核。
      </p>
      <Field label="资料标题">
        <input
          value={form.title}
          onChange={(e) => change("title", e.target.value)}
        />
      </Field>
      <Field label="发布机构">
        <input
          value={form.publisher}
          onChange={(e) => change("publisher", e.target.value)}
        />
      </Field>
      <Field label="资料发布日期">
        <input
          type="date"
          value={form.published}
          onChange={(e) => change("published", e.target.value)}
        />
      </Field>
      <Field label="校正材料性质">
        <select
          value={form.documentType}
          onChange={(e) => change("documentType", e.target.value)}
        >
          {["待判断", "正式文件", "征求意见", "媒体解读", "历史资料"].map(
            (v) => (
              <option key={v}>{v}</option>
            ),
          )}
        </select>
      </Field>
      <ScopeFields
        value={form.scope}
        onChange={(v: any) => change("scope", v)}
      />
      <Field label="校正依据">
        <textarea
          value={form.reason}
          onChange={(e) => change("reason", e.target.value)}
          placeholder="说明与原文核对的依据，至少5字"
        />
      </Field>
      <Button
        onClick={() =>
          act(async () => {
            await patch("/snapshots/" + snapshot.id, {
              ...form,
              published: form.published || null,
              expectedMetadataHash: snapshot.metadataHash,
            });
            done();
          }, "资料信息已校正，请重新核验事实")
        }
      >
        保存校正
      </Button>
    </div>
  );
}
function Snapshot({ id, data, act, go, setModal }: any) {
  const [s, setS] = useState<any>(null),
    [editingMeta, setEditingMeta] = useState(false),
    [tab, setTab] = useState("原文"),
    [selected, setSelected] = useState(""),
    [text, setText] = useState(""),
    [quote, setQuote] = useState("");
  const load = () => api("/snapshots/" + id).then(setS);
  useEffect(() => {
    load();
  }, [id, data.counts.pending, data.counts.snapshots]);
  if (!s) return <p>正在读取原文…</p>;
  return (
    <>
      <Heading
        eyebrow="SOURCE & EVIDENCE"
        title={s.title}
        description={`${s.publisher} · ${s.published || "日期待核实"} · ${s.scope.year} 年 ${s.scope.stage}`}
        actions={
          <>
            {s.previous_id && <Button secondary onClick={()=>go("impacts/"+s.id)}>查看版本变化与影响</Button>}
            <Button secondary onClick={async()=>{const n=await act(()=>post('/notes/from-snapshot',{snapshotId:id}),'已保存到知识库');if(n)go('notes/'+n.id);}}>存入知识库</Button>
            <Button onClick={()=>{carry(go,'deliver',[{kind:'snapshot',id}]);}}>自动制作 PPT</Button>
            <Button
              secondary
              onClick={() =>
                setModal({
                  type: "project",
                  title: "从资料建立项目",
                  snapshot: s,
                })
              }
            >
              <FolderOpen size={16} />
              加入创作
            </Button>
            <Button
              onClick={() =>
                act(
                  () =>
                    post("/agent/runs", {
                      kind: "research",
                      snapshotIds: [id],
                    }),
                  "研究任务已提交",
                )
              }
            >
              <BrainCircuit size={16} />
              AI 提取事实与选题
            </Button>
          </>
        }
      />
      {s.figures?.length>0&&<details className="panel source-comparison"><summary>正文配图与图中信息 · {s.figures.length} 张</summary>{s.figures.map((f:any)=><figure key={f.index}>{f.assetId&&<img src={'/api/assets/'+f.assetId} alt={f.alt||'原文配图'}/>}<figcaption>图片 {f.index} · {f.status==='needs-review'?'识别结果待核对':f.status==='failed'?'读取失败':'尚未识别'}</figcaption><p>{f.error||f.text}</p><a href={f.url} target="_blank" rel="noreferrer">原图片</a></figure>)}</details>}
      <div className="detail-grid">
        <section className="panel source-panel">
          <div className="toolbar">
            <EvidencePanel kind="snapshot" id={id}/>
      <div className="tabs">
              {["原文", "版本变化"].map((x) => (
                <button
                  className={tab === x ? "active" : ""}
                  key={x}
                  onClick={() => setTab(x)}
                >
                  {x}
                </button>
              ))}
            </div>
            {s.url.startsWith("http") && (
              <a
                className="text-link"
                href={s.url}
                target="_blank"
                rel="noreferrer"
              >
                原始网页 <ExternalLink size={14} />
              </a>
            )}
          </div>
          <div className="source-meta">
            <Badge>{s.document_type}</Badge>
            <span>
              {s.scope.region} · {s.scope.district}
            </span>
            <span>快照 {s.hash.slice(0, 10)}</span>
            <button
              className="text-link"
              onClick={() => setEditingMeta(!editingMeta)}
            >
              {editingMeta ? "收起校正" : "校正资料信息"}
            </button>
          </div>
          {s.asset_id && (
            <div className="notice">
              <FileText size={16} />
              <a
                href={"/api/assets/" + s.asset_id}
                target="_blank"
                rel="noreferrer"
              >
                查看原始文件
              </a>
              {s.ocr && (
                <span>本机OCR · {s.ocr.pageCount}页 · 识别内容需核对</span>
              )}
              {s.media && <span>DeepSeek文件 / 图像 / 语音处理结果 · 请对照原文件核实</span>}
            </div>
          )}
          {editingMeta && (
            <MetadataForm
              snapshot={s}
              act={act}
              done={() => {
                setEditingMeta(false);
                load();
              }}
            />
          )}
          {tab === "原文" ? (
            <div className="source-text">
              {s.paragraphs.map((p: any) => (
                <p
                  id={p.id}
                  key={p.id}
                  className={selected === p.id ? "highlight" : ""}
                  onClick={() => {
                    setSelected(p.id);
                    setQuote(p.text);
                    setText(p.text);
                  }}
                >
                  <span>
                    {p.id}
                    {p.page ? ` · 第${p.page}页` : ""}
                  </span>
                  {p.text}
                </p>
              ))}
            </div>
          ) : s.previous ? (
            <div className="source-text">
              <h3>上一版 · {fmt(s.previous.fetched_at)}</h3>
              <pre>{s.previous.body}</pre>
              <h3>当前版本 · {fmt(s.fetched_at)}</h3>
              <pre>{s.body}</pre>
            </div>
          ) : (
            <Empty
              title="当前是首个快照"
              text="同一网址内容修订后，会保留旧版并提醒关联成果复核。"
            />
          )}
        </section>
        <aside className="panel evidence-panel">
          <h2>
            <ShieldCheck size={19} />
            事实核验 <span className="count">{s.claims.length}</span>
          </h2>
          <p className="muted">点击左侧段落创建有出处的事实。</p>
          {s.claims.map((c: any) => (
            <div className="claim" key={c.id}>
              <div className="inline">
                <Badge state={c.status} />
                <button
                  className="text-link"
                  onClick={() => {
                    setSelected(c.paragraph_id);
                    document
                      .getElementById(c.paragraph_id)
                      ?.scrollIntoView({ block: "center", behavior: "smooth" });
                  }}
                >
                  定位原文
                </button>
              </div>
              <p>{c.text}</p>
              <blockquote>{c.quote}</blockquote>
              <small>{c.reason}</small>
              <div className="inline">
                <Button
                  small
                  secondary
                  onClick={() =>
                    setModal({
                      title: "记录事实核验",
                      content: (
                        <VerifyForm
                          claim={c}
                          act={act}
                          close={async () => {
                            setModal(null);
                            await load();
                          }}
                        />
                      ),
                    })
                  }
                >
                  核验与标记
                </Button>
              </div>
            </div>
          ))}
          <details open={!s.claims.length}>
            <summary>添加事实</summary>
            <div className="form">
              <Field label="原文段落">
                <select
                  value={selected}
                  onChange={(e) => {
                    const p = s.paragraphs.find(
                      (p: any) => p.id === e.target.value,
                    );
                    setSelected(e.target.value);
                    setQuote(p?.text || "");
                    setText(p?.text || "");
                  }}
                >
                  <option value="">选择段落</option>
                  {s.paragraphs.map((p: any) => (
                    <option value={p.id} key={p.id}>
                      {p.id} · {p.text.slice(0, 25)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="准确引文">
                <textarea
                  rows={3}
                  value={quote}
                  onChange={(e) => setQuote(e.target.value)}
                />
              </Field>
              <Field label="事实表述">
                <textarea
                  rows={3}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </Field>
              <Button
                small
                onClick={async () => {
                  if (
                    await act(
                      () =>
                        post("/claims", {
                          snapshotId: id,
                          paragraphId: selected,
                          quote,
                          text,
                        }),
                      "事实已保存为待核实",
                    )
                  ) {
                    setQuote("");
                    setText("");
                    load();
                  }
                }}
              >
                保存事实
              </Button>
            </div>
          </details>
          <div className="export-inline">
            <Button
              secondary
              small
              onClick={() =>
                act(
                  () =>
                    post("/exports", {
                      targetType: "snapshot",
                      targetId: id,
                      format: "docx",
                    }),
                  "原文导出已排队",
                )
              }
            >
              <Download size={14} />
              导出原文
            </Button>
            <Button
              secondary
              small
              onClick={() =>
                setModal({
                  title: "手动策划选题",
                  content: (
                    <TopicForm
                      snapshot={s}
                      act={act}
                      close={() => setModal(null)}
                    />
                  ),
                })
              }
            >
              <Lightbulb size={14} />
              创建选题
            </Button>
          </div>
        </aside>
      </div>
    </>
  );
}
function VerifyForm({ claim, act, close }: any) {
  const [status, setStatus] = useState(claim.status),
    [reason, setReason] = useState(claim.reason || ""),
    [confirmed, setConfirmed] = useState(false);
  return (
    <div className="form">
      <blockquote>{claim.quote}</blockquote>
      <Field label="核验状态">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {[
            ["pending", "待核实"],
            ["partial", "部分核实"],
            ["verified", "已核实"],
            ["excluded", "已排除"],
          ].map(([v, l]) => (
            <option value={v} key={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="核验依据／原因">
        <textarea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="说明来源、适用范围和关键条件的检查结果…"
        />
      </Field>
      <label className="check">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        我已检查地区、学段、年度、对象和条件，与原文一致。
      </label>
      <Button
        onClick={async () => {
          if (
            await act(
              () =>
                post("/claims/" + claim.id + "/verify", {
                  revision: claim.revision,
                  status,
                  reason,
                  scopeConfirmed: confirmed,
                }),
              "核验已记录",
            )
          )
            close();
        }}
      >
        保存核验记录
      </Button>
    </div>
  );
}
function TopicForm({ snapshot, act, close }: any) {
  const [title, setTitle] = useState(snapshot.title),
    [summary, setSummary] = useState(""),
    [angle, setAngle] = useState(""),
    [scores, setScores] = useState([0, 0, 0, 0, 0]),
    [reasons, setReasons] = useState(["", "", "", "", ""]);
  return (
    <div className="form">
      <Field label="选题标题">
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="事实摘要">
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </Field>
      <Field label="创作角度">
        <input value={angle} onChange={(e) => setAngle(e.target.value)} />
      </Field>
      {[
        "北京升学相关性 · 30",
        "时效性 · 20",
        "实际影响 · 20",
        "内容价值 · 15",
        "完整度 · 15",
      ].map((n, i) => (
        <div className="score-field" key={n}>
          <Field label={n}>
            <select
              value={scores[i]}
              onChange={(e) =>
                setScores(scores.map((v, k) => (k === i ? +e.target.value : v)))
              }
            >
              {[0, 1, 2, 3, 4].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="评分依据">
            <input
              value={reasons[i]}
              onChange={(e) =>
                setReasons(
                  reasons.map((v, k) => (k === i ? e.target.value : v)),
                )
              }
            />
          </Field>
        </div>
      ))}
      <Button
        onClick={async () => {
          if (
            await act(
              () =>
                post("/topics", {
                  snapshotId: snapshot.id,
                  title,
                  summary,
                  angle,
                  audience: snapshot.scope.audience,
                  scores,
                  reasons,
                }),
              "选题已保存",
            )
          )
            close();
        }}
      >
        保存选题
      </Button>
    </div>
  );
}
function Topics({ data, search, act, go, setModal }: any) {
  const [filter, setFilter] = useStoredState("topics-filter", "全部"),
    [sort, setSort] = useStoredState("topics-sort", "score");
  const [scopeFilter, setScopeFilter] = useStoredState("topic-scope", "{}");
  let topics = data.topics.filter(
    (t: any) =>
      (t.title + t.summary + t.angle).includes(search) &&
      matchesScope(
        data.snapshots.find((s: any) => s.id === t.snapshot_id),
        scopeFilter,
      ) &&
      (filter === "全部" ||
        (filter === "已核实" && t.eligible) ||
        (filter === "已收藏" && t.favorite) ||
        t.status === filter),
  );
  if (sort === "new")
    topics = [...topics].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
  return (
    <>
      <Heading
        eyebrow="STORY DISCOVERY"
        title="选题池"
        description="找到值得讲述的问题，给每一个创作决定一个理由。"
      />
      <div className="panel">
        <div className="toolbar">
          <div className="tabs">
            {["全部", "已核实", "已收藏", "制作中", "已归档"].map((x) => (
              <button
                className={filter === x ? "active" : ""}
                onClick={() => setFilter(x)}
                key={x}
              >
                {x}
              </button>
            ))}
          </div>
          <select
            className="compact"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="score">按系统评分</option>
            <option value="new">按创建时间</option>
          </select>
        </div>
        <SourceFilters
          value={scopeFilter}
          onChange={setScopeFilter}
          snapshots={data.snapshots}
        />
        {topics.length ? (
          topics.map((t: any) => (
            <article className="topic-row" key={t.id}>
              <div className="topic-score">
                {t.total}
                <span>/ 100</span>
              </div>
              <div className="topic-body">
                <div className="inline">
                  <Badge state={t.eligible ? "verified" : "pending"}>
                    {t.eligible ? "可进入正式推荐" : "研究选题 · 待核验"}
                  </Badge>
                  <Badge>{t.status}</Badge>
                  {t.deferred > 0 && <Badge>已搁置</Badge>}
                </div>
                <h3>{t.title}</h3>
                <p>{t.summary}</p>
                <div className="angle">
                  <Lightbulb size={15} />
                  {t.angle || "尚未填写创作角度"}
                </div>
                <details>
                  <summary>查看评分依据与备注</summary>
                  {t.reasons.map((v: string, i: number) => (
                    <p key={i}>
                      <strong>
                        {
                          [
                            "相关性",
                            "时效性",
                            "实际影响",
                            "内容价值",
                            "完整度",
                          ][i]
                        }{" "}
                        {t.scores[i]}/4：
                      </strong>
                      {v}
                    </p>
                  ))}
                  <textarea
                    defaultValue={t.note}
                    aria-label="选题备注"
                    placeholder="研究备注…"
                    onBlur={(e) => {
                      if (e.target.value !== t.note)
                        act(() =>
                          patch("/topics/" + t.id, {
                            revision: t.revision,
                            note: e.target.value,
                          }),
                        );
                    }}
                  />
                </details>
              </div>
              <div className="topic-actions">
                <button
                  className={"icon-btn " + (t.favorite ? "favorited" : "")}
                  aria-label="收藏选题"
                  onClick={() =>
                    act(() =>
                      patch("/topics/" + t.id, {
                        revision: t.revision,
                        favorite: !t.favorite,
                      }),
                    )
                  }
                >
                  <Star size={18} fill={t.favorite ? "currentColor" : "none"} />
                </button>
                <Button
                  small
                  onClick={() =>
                    setModal({
                      type: "project",
                      title: "采纳选题并创建项目",
                      topic: t,
                    })
                  }
                >
                  采纳选题 <ArrowRight size={13} />
                </Button>
                <button
                  className="text-link"
                  onClick={() => go("snapshot/" + t.snapshot_id)}
                >
                  查看来源
                </button>
                <select
                  value={t.status}
                  aria-label="选题状态"
                  onChange={(e) =>
                    act(() =>
                      patch("/topics/" + t.id, {
                        revision: t.revision,
                        status: e.target.value,
                      }),
                    )
                  }
                >
                  {[
                    "待评估",
                    "已采纳",
                    "制作中",
                    "待审核",
                    "已完成",
                    "已归档",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <button
                  className="text-link"
                  onClick={() =>
                    act(() =>
                      patch("/topics/" + t.id, {
                        revision: t.revision,
                        deferred: !t.deferred,
                      }),
                    )
                  }
                >
                  {t.deferred ? "取消搁置" : "暂时搁置"}
                </button>
              </div>
            </article>
          ))
        ) : (
          <Empty
            title="选题池等待你的第一个发现"
            text="打开一份资料，手动策划选题或让 DeepSeek 提取事实与创作角度。"
            action={
              <Button secondary onClick={() => go("policies")}>
                查看研究资料
              </Button>
            }
          />
        )}
      </div>
      {topics.length > 0 && (
        <div className="bottom-actions">
          <Button
            secondary
            onClick={() =>
              act(
                () =>
                  post("/exports", {
                    targetType: "topics",
                    ids: topics.map((t: any) => t.id),
                    format: "csv",
                  }),
                "当前筛选已固定并排队导出",
              )
            }
          >
            <Download size={16} />
            导出当前筛选 CSV
          </Button>
        </div>
      )}
    </>
  );
}
function NewProject({ data, act, close, go, topic, snapshot }: any) {
  const requestKey = useRef(uid());
  const [title, setTitle] = useState(topic?.title || snapshot?.title || ""),
    [scope, setScope] = useState(snapshot?.scope || scopeDefault),
    [ids, setIds] = useState<string[]>(
      [snapshot?.id || topic?.snapshot_id].filter(Boolean),
    );
  return (
    <div className="form">
      <Field label="项目名称">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：中考报名政策的家长解读"
        />
      </Field>
      <ScopeFields value={scope} onChange={setScope} />
      <Field label="关联资料">
        <div className="checkbox-list">
          {data.snapshots.length ? (
            data.snapshots.map((s: any) => (
              <label className="check" key={s.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(s.id)}
                  onChange={(e) =>
                    setIds(
                      e.target.checked
                        ? [...ids, s.id]
                        : ids.filter((x) => x !== s.id),
                    )
                  }
                />
                {s.title}
              </label>
            ))
          ) : (
            <p className="muted">还没有资料，可先创建项目，再导入资料。</p>
          )}
        </div>
      </Field>
      <Button
        onClick={async () => {
          const r = await act(
            () =>
              post(
                "/projects",
                {
                  title,
                  scope,
                  snapshotIds: ids,
                  topicId: topic?.id,
                },
                requestKey.current,
              ),
            "创作项目已建立",
          );
          if (r) {
            close();
            go("project/" + r.id);
          }
        }}
      >
        创建项目 <ArrowRight size={15} />
      </Button>
    </div>
  );
}
function Projects({ data, search, go, setModal }: any) {
  const list = data.projects.filter((p: any) => p.title.includes(search));
  return (
    <>
      <Heading
        eyebrow="CONTENT STUDIO"
        title="项目"
        description="一份母稿，多种表达。把资料、想法和成果放在一起。"
        actions={
          <Button
            onClick={() => setModal({ type: "project", title: "新建创作项目" })}
          >
            <Plus size={16} />
            新建项目
          </Button>
        }
      />
      {list.length ? (
        <div className="project-grid">
          {list.map((p: any) => (
            <button
              className="project-card"
              key={p.id}
              onClick={() => go("project/" + p.id)}
            >
              <div className="inline spread">
                <span className="tile-icon">
                  <FolderOpen size={23} />
                </span>
                <ArrowUpRight size={20} />
              </div>
              <Badge>
                {p.scope.stage} · {p.scope.year}
              </Badge>
              <h2>{p.title}</h2>
              <p>{p.scope.audience}</p>
              <div className="card-footer">
                <span>{p.snapshotIds.length} 份资料</span>
                <span>{fmt(p.created_at).split(" ")[0]}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty
            title="为你的下一个选题，建立一个项目"
            action={
              <Button
                onClick={() =>
                  setModal({ type: "project", title: "新建创作项目" })
                }
              >
                创建第一个项目
              </Button>
            }
          />
        </div>
      )}
    </>
  );
}
function PackageForm({ project, data, act }: any) {
  const files = data.artifacts.filter((a: any) =>
    project.versions.some((v: any) => v.id === a.target_id),
  );
  const [ids, setIds] = useState<string[]>([]),
    [sources, setSources] = useState(false),
    [result, setResult] = useState<any>(null);
  return (
    <div className="form">
      <p className="muted">
        选择已导出的文件。清单保留版本、核验状态和文件哈希。
      </p>
      {files.map((a: any) => (
        <label className="check" key={a.id}>
          <input
            type="checkbox"
            checked={ids.includes(a.id)}
            onChange={(e) =>
              setIds(
                e.target.checked
                  ? [...ids, a.id]
                  : ids.filter((id) => id !== a.id),
              )
            }
          />
          {a.name}
        </label>
      ))}
      {!files.length && <p>请先在项目内生成成果文件。</p>}
      <label className="check">
        <input
          type="checkbox"
          checked={sources}
          onChange={(e) => setSources(e.target.checked)}
        />
        同时包含原文文本（请确认有权分享）
      </label>
      <Button
        disabled={!ids.length}
        onClick={() =>
          act(
            async () =>
              setResult(
                await post("/projects/" + project.id + "/package", {
                  artifactIds: ids,
                  includeSources: sources,
                }),
              ),
            "交付包已生成",
          )
        }
      >
        生成项目交付包
      </Button>
      {result && (
        <a className="btn secondary" href={"/api/assets/" + result.assetId}>
          下载 {result.name}
        </a>
      )}
    </div>
  );
}
function Project({ id, data, act, go, setModal }: any) {
  const [p, setP] = useState<any>(null),
    [kind, setKind] = useState("master"),
    [versionId, setVersionId] = useState("");
  const load = () => api("/projects/" + id).then(setP);
  const taskStates = data.jobs.map((j: any) => j.id + j.state).join();
  useEffect(() => {
    load();
  }, [id, taskStates]);
  useEffect(() => setVersionId(""), [kind]);
  if (!p) return <p>正在读取项目…</p>;
  const versions = p.versions.filter((v: any) => v.kind === kind),
    version = versions.find((v: any) => v.id === versionId) || versions[0],
    master = p.versions.find((v: any) => v.kind === "master");
  return (
    <>
      <Heading
        eyebrow="PROJECT WORKSPACE"
        title={p.title}
        description={`${p.scope.region} · ${p.scope.year} 年 ${p.scope.stage} · 面向${p.scope.audience}`}
        actions={
          <>
            <Button onClick={()=>{carry(go,'make/presentation',[{kind:'project',id:p.id}]);}}>从项目资料自动制作 PPT</Button>
            <Button
              secondary
              onClick={() =>
                setModal({
                  title: "项目交付包",
                  content: <PackageForm project={p} data={data} act={act} />,
                })
              }
            >
              交付打包
            </Button>
            <a
              className="btn secondary"
              href={"/api/projects/" + id + "/task-package"}
            >
              <Download size={15} />
              导出任务包
            </a>
            <Button
              onClick={() =>
                setModal({
                  title: "DeepSeek 创作任务",
                  content: (
                    <GenerateForm
                      project={p}
                      kind={kind}
                      master={master}
                      data={data}
                      act={act}
                      close={() => setModal(null)}
                      go={go}
                    />
                  ),
                })
              }
            >
              <BrainCircuit size={17} />
              AI 生成{kindNames[kind]}
            </Button>
          </>
        }
      />
      <ProjectVisualLinks projectId={id} go={go} refresh={taskStates}/>
      <ProjectHtmlFilm key={id} projectId={id}/>
      <VisualWebImport scope={p.scope} go={go}/>
      <div className="tabs project-tabs">
        {Object.entries(kindNames).map(([k, label]) => (
          <button
            className={kind === k ? "active" : ""}
            key={k}
            onClick={() => setKind(k)}
          >
            {label}
            <small>
              {p.versions.filter((v: any) => v.kind === k).length || ""}
            </small>
          </button>
        ))}
      </div>
      <div className="editor-layout">
        <aside className="panel context-pane">
          <div className="section-head">
            <h3>资料与事实</h3>
            <BookOpen size={17} />
          </div>
          {p.snapshots.map((s: any) => (
            <button
              className="source-link"
              key={s.id}
              onClick={() => go("snapshot/" + s.id)}
            >
              <FileText size={17} />
              <span>
                {s.title}
                <small>{s.publisher}</small>
              </span>
            </button>
          ))}
          <details>
            <summary>补充项目资料</summary>
            {data.snapshots
              .filter((s: any) => !p.snapshotIds.includes(s.id))
              .map((s: any) => (
                <button
                  key={s.id}
                  className="source-link"
                  onClick={() =>
                    act(async () => {
                      await patch("/projects/" + p.id + "/sources", {
                        revision: p.revision,
                        snapshotIds: [...p.snapshotIds, s.id],
                      });
                      await load();
                    }, "资料已加入，已有成果需复核")
                  }
                >
                  {s.title}
                  <Plus size={14} />
                </button>
              ))}
            {data.snapshots.every((s: any) => p.snapshotIds.includes(s.id)) && (
              <small className="muted">
                全部资料已加入，可先去政策情报导入新版。
              </small>
            )}
          </details>
          <h4>
            可引用事实 <span className="count">{p.claims.length}</span>
          </h4>
          {p.claims.map((c: any) => (
            <div className="mini-claim" key={c.id}>
              <Badge state={c.status} />
              <p>{c.text}</p>
              <code title={c.id}>{c.id.slice(0, 8)}</code>
            </div>
          ))}
          {!p.claims.length && (
            <p className="muted">
              先在资料页提取并核验事实。AI 候选不能代替原文核验。
            </p>
          )}
          <button
            className="text-link"
            onClick={() =>
              setModal({
                title: "导入外部创作结果",
                wide: true,
                content: (
                  <ExternalResult
                    project={p}
                    kind={kind}
                    master={master}
                    act={act}
                    close={() => {
                      setModal(null);
                      load();
                    }}
                  />
                ),
              })
            }
          >
            导入外部结果 <ArrowUpRight size={15} />
          </button>
        </aside>
        <section className="editor-main">
          <div className="version-bar">
            <span>
              <Layers size={16} /> {kindNames[kind]}
            </span>
            <select
              value={version?.id || ""}
              onChange={(e) => setVersionId(e.target.value)}
              aria-label="内容版本"
            >
              <option value="" disabled>
                尚无版本
              </option>
              {versions.map((v: any) => (
                <option value={v.id} key={v.id}>
                  v{v.number} · {fmt(v.created_at)} ·{" "}
                  {v.origin === "deepseek"
                    ? "AI 候选"
                    : v.origin === "external_import"
                      ? "外部导入"
                      : "人工编辑"}
                </option>
              ))}
            </select>
            {version && (
              <Badge state={version.stale ? "partial" : version.review}>
                {version.stale ? "依据已更新，待复核" : null}
              </Badge>
            )}
          </div>
          {!version && kind === "master" ? (
            <div className="panel">
              <Empty
                title="先整理一份内容母稿"
                text="从已关联的事实建立母稿，或让 DeepSeek 梳理研究结构。所有后续成果都会绑定母稿版本。"
                action={
                  <Button
                    onClick={async () => {
                      if (
                        await act(
                          () =>
                            post("/projects/" + id + "/master-template", {
                              expectedRevision: p.revision,
                            }),
                          "母稿已建立",
                        )
                      )
                        load();
                    }}
                  >
                    从事实建立母稿 <ArrowRight size={14} />
                  </Button>
                }
              />
            </div>
          ) : !version && !master ? (
            <div className="panel">
              <Empty
                title="请先建立内容母稿"
                action={
                  <Button secondary onClick={() => setKind("master")}>
                    前往母稿
                  </Button>
                }
              />
            </div>
          ) : (
            <Editor
              key={version?.id || kind}
              project={p}
              kind={kind}
              version={version}
              master={master}
              act={act}
              reload={load}
              setModal={setModal}
              go={go}
            />
          )}
        </section>
      </div>
    </>
  );
}
function GenerateForm({ project, kind, master, data, act, close, go }: any) {
  const [prompt, setPrompt] = useState(""),
    [duration, setDuration] = useState(90),
    [slides, setSlides] = useState(12),
    [lecture, setLecture] = useState(30),
    [characterId, setCharacter] = useState(""),
    [skillId, setSkill] = useState(data.skills[0]?.id || "");
  return (
    <div className="form">
      <div className="notice">
        <BrainCircuit size={18} />
        将使用 DeepSeek 读取本项目 {project.snapshotIds.length}{" "}
        份资料与事实，结果保存为未审核候选。
      </div>
      <Field label="创作要求">
        <textarea
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="受众、角度、风格、必须保留的内容…"
        />
      </Field>
      {["speech", "storyboard"].includes(kind) && (
        <Field label="目标时长（秒，估算）">
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(+e.target.value)}
          />
        </Field>
      )}
      {kind === "presentation" && (
        <div className="form-grid">
          <Field label="目标页数">
            <input
              type="number"
              value={slides}
              onChange={(e) => setSlides(+e.target.value)}
            />
          </Field>
          <Field label="讲座分钟数">
            <input
              type="number"
              value={lecture}
              onChange={(e) => setLecture(+e.target.value)}
            />
          </Field>
        </div>
      )}
      {kind === "storyboard" && (
        <Field label="角色模板">
          <select
            value={characterId}
            onChange={(e) => setCharacter(e.target.value)}
          >
            <option value="">通用角色</option>
            {data.characters.map((c: any) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="工作流版本">
        <select value={skillId} onChange={(e) => setSkill(e.target.value)}>
          {data.skills.map((s: any) => (
            <option value={s.id} key={s.id}>
              {s.skill_id} · {s.hash.slice(0, 10)} · {s.origin}
            </option>
          ))}
        </select>
      </Field>
      <Button
        onClick={async () => {
          const r = await act(
            () =>
              post("/agent/runs", {
                projectId: project.id,
                kind,
                masterId: kind === "master" ? undefined : master?.id,
                prompt,
                duration,
                slideCount: slides,
                lectureMinutes: lecture,
                characterId: characterId || undefined,
                skillId,
              }),
            "创作任务已提交",
          );
          if (r) {
            close();
            go("job/" + r.id);
          }
        }}
      >
        <Play size={16} />
        开始生成候选
      </Button>
    </div>
  );
}
function Editor({
  project,
  kind,
  version,
  master,
  act,
  reload,
  setModal,
  go,
}: any) {
  const initial = version?.body || {
    schemaVersion: "1.0",
    title: project.title,
    summary: "",
    blocks: [
      {
        id: uid(),
        title: "内容",
        text: "",
        claimIds: [],
        notes: "",
        locked: false,
      },
    ],
    unverified: [],
  };
  const draft = project.drafts.find((d: any) => d.kind === kind);
  const [body, setBody] = useState<any>(structuredClone(initial)),
    [view, setView] = useState("编辑"),
    [saveState, setSaveState] = useState(""),
    [dirty, setDirty] = useState(false),
    [format, setFormat] = useState(kind === "presentation" ? "pptx" : "docx"),
    [mode, setMode] = useState("draft");
  const draftRevision = useRef(draft?.revision || 0),
    saving = useRef(false),
    liveBody = useRef(body);
  liveBody.current = body;
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(async () => {
      if (saving.current) return;
      saving.current = true;
      setSaveState("保存中…");
      try {
        const r = await put("/drafts", {
          projectId: project.id,
          kind,
          body: liveBody.current,
          revision: draftRevision.current,
        });
        draftRevision.current = r.revision;
        setSaveState("工作草稿已自动保存");
      } catch (e: any) {
        setSaveState(e.message);
      } finally {
        saving.current = false;
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [body, dirty]);
  const change = (v: any) => {
    setDirty(true);
    setBody(v);
  };
  const block = (i: number, k: string, value: any) =>
    change({
      ...body,
      blocks: body.blocks.map((b: any, n: number) =>
        n === i ? { ...b, [k]: value } : b,
      ),
    });
  async function commit() {
    const r = await act(
      () =>
        post("/versions", {
          projectId: project.id,
          kind,
          body,
          masterId: kind === "master" ? undefined : master?.id,
          baseVersionId: version?.id,
          expectedRevision: project.revision,
        }),
      "新版本已保存，需重新审核",
    );
    if (r) {
      setDirty(false);
      reload();
    }
  }
  return (
    <div className="panel editor-panel">
      <div className="toolbar">
        <div className="tabs">
          {["编辑", "预览", "版本对比"].map((x) => (
            <button
              className={view === x ? "active" : ""}
              key={x}
              onClick={() => setView(x)}
            >
              {x}
            </button>
          ))}
        </div>
        {kind === "wechat" && (
          <button
            className="text-link"
            onClick={() =>
              act(
                () => copyRichContent(body),
                "已复制排版内容，请在公众号编辑器粘贴后检查样式",
              )
            }
          >
            复制排版内容
          </button>
        )}
        <small className="muted">{saveState || "修改后自动保存工作草稿"}</small>
        {version && <Button secondary small disabled={dirty} onClick={async()=>{const j=await act(()=>post('/source-review',{versionId:version.id}));if(j)go('job/'+j.id);}}>来源预审{dirty?'（请先保存版本）':''}</Button>}
      </div>
      {draft && JSON.stringify(draft.body) !== JSON.stringify(initial) && (
        <div className="draft-note">
          有已保存的工作草稿 · {fmt(draft.updated_at)}{" "}
          <button className="text-link" onClick={() => change(draft.body)}>
            恢复草稿
          </button>
        </div>
      )}
      {view === "编辑" ? (
        <div className="editor-fields">
          <Field label="内容标题">
            <input
              className="title-input"
              value={body.title}
              onChange={(e) => change({ ...body, title: e.target.value })}
            />
          </Field>
          <Field label="摘要">
            <textarea
              rows={2}
              value={body.summary}
              onChange={(e) => change({ ...body, summary: e.target.value })}
            />
          </Field>
          {body.blocks.map((b: any, i: number) => (
            <article className="block-editor" key={b.id}>
              <div className="block-head">
                <span>
                  {kind === "presentation"
                    ? "幻灯片"
                    : kind === "storyboard"
                      ? "镜头"
                      : "内容块"}{" "}
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <button
                    aria-label="上移"
                    className="icon-btn"
                    disabled={i === 0}
                    onClick={() => {
                      const a = [...body.blocks];
                      [a[i - 1], a[i]] = [a[i], a[i - 1]];
                      change({ ...body, blocks: a });
                    }}
                  >
                    ↑
                  </button>
                  <button
                    aria-label="下移"
                    className="icon-btn"
                    disabled={i === body.blocks.length - 1}
                    onClick={() => {
                      const a = [...body.blocks];
                      [a[i + 1], a[i]] = [a[i], a[i + 1]];
                      change({ ...body, blocks: a });
                    }}
                  >
                    ↓
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={b.locked ? "解锁" : "锁定"}
                    onClick={() => block(i, "locked", !b.locked)}
                  >
                    {b.locked ? <Lock size={14} /> : <Unlock size={14} />}
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="移除内容块"
                    disabled={b.locked || body.blocks.length === 1}
                    onClick={() =>
                      change({
                        ...body,
                        blocks: body.blocks.filter(
                          (x: any, n: number) => n !== i,
                        ),
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <input
                aria-label={`内容块${i + 1}标题`}
                value={b.title}
                readOnly={b.locked}
                placeholder="段落／页面标题"
                onChange={(e) => block(i, "title", e.target.value)}
              />
              <textarea
                aria-label={`内容块${i + 1}正文`}
                rows={5}
                value={b.text}
                readOnly={b.locked}
                placeholder="写下清晰、准确、有出处的内容…"
                onChange={(e) => block(i, "text", e.target.value)}
              />
              <Field
                label={
                  kind === "presentation" ? "讲者备注" : "讲述、停顿或画面提示"
                }
              >
                <textarea
                  rows={2}
                  value={b.notes}
                  readOnly={b.locked}
                  onChange={(e) => block(i, "notes", e.target.value)}
                />
              </Field>
              {kind === "storyboard" && (
                <>
                  <div className="form-grid">
                    <Field label="时长（秒）">
                      <input
                        type="number"
                        value={b.duration || 0}
                        readOnly={b.locked}
                        onChange={(e) => block(i, "duration", +e.target.value)}
                      />
                    </Field>
                    <Field label="场景 / 动作 / 光线">
                      <input
                        value={b.scene || ""}
                        readOnly={b.locked}
                        onChange={(e) => block(i, "scene", e.target.value)}
                      />
                    </Field>
                    <Field label="景别 / 机位 / 运镜">
                      <input
                        value={b.camera || ""}
                        readOnly={b.locked}
                        onChange={(e) => block(i, "camera", e.target.value)}
                      />
                    </Field>
                  </div>
                  <Field label="视频提示词">
                    <textarea
                      value={b.prompt || ""}
                      readOnly={b.locked}
                      onChange={(e) => block(i, "prompt", e.target.value)}
                    />
                  </Field>
                </>
              )}
              <details>
                <summary>事实引用 · {b.claimIds.length} 条</summary>
                {project.claims.map((c: any) => (
                  <label className="check" key={c.id}>
                    <input
                      type="checkbox"
                      disabled={b.locked}
                      checked={b.claimIds.includes(c.id)}
                      onChange={(e) =>
                        block(
                          i,
                          "claimIds",
                          e.target.checked
                            ? [...b.claimIds, c.id]
                            : b.claimIds.filter((x: string) => x !== c.id),
                        )
                      }
                    />
                    {c.text.slice(0, 100)} <Badge state={c.status} />
                  </label>
                ))}
              </details>
              {version && !b.locked && (
                <button
                  className="text-link"
                  onClick={() =>
                    setModal({
                      title: "只修改这个内容块",
                      content: (
                        <PatchForm
                          project={project}
                          version={version}
                          blockId={b.id}
                          act={act}
                          close={() => setModal(null)}
                          go={go}
                        />
                      ),
                    })
                  }
                >
                  <BrainCircuit size={14} />
                  AI 定向修改
                </button>
              )}
            </article>
          ))}
          <Button
            secondary
            onClick={() =>
              change({
                ...body,
                blocks: [
                  ...body.blocks,
                  {
                    id: uid(),
                    title: "",
                    text: "",
                    notes: "",
                    claimIds: [],
                    locked: false,
                  },
                ],
              })
            }
          >
            <Plus size={16} />
            添加内容块
          </Button>
          <Field label="待核实事项（每行一项）">
            <textarea
              rows={3}
              value={body.unverified.join("\n")}
              onChange={(e) =>
                change({
                  ...body,
                  unverified: e.target.value.split("\n").filter(Boolean),
                })
              }
            />
          </Field>
        </div>
      ) : view === "预览" ? (
        <div
          className={
            "content-preview " + (kind === "wechat" ? "phone-preview" : "")
          }
        >
          <span className="eyebrow">
            {kindNames[kind]} ·{" "}
            {version?.review === "confirmed" ? "已确认版本" : "研究草稿"}
          </span>
          <h1>{body.title}</h1>
          <p className="preview-summary">{body.summary}</p>
          {body.blocks.map((b: any) => (
            <section
              key={b.id}
              className={kind === "presentation" ? "slide-preview" : ""}
            >
              <h2>{b.title}</h2>
              <p>{b.text}</p>
              {b.notes && <aside>{b.notes}</aside>}
              {b.scene && (
                <p>
                  场景：{b.scene}
                  <br />
                  镜头：{b.camera}
                  <br />
                  提示词：{b.prompt}
                </p>
              )}
              <small>
                引用：
                {b.claimIds
                  .map((cid: string) =>
                    project.claims
                      .find((c: any) => c.id === cid)
                      ?.text.slice(0, 30),
                  )
                  .join("；") || "未引用政策事实"}
              </small>
            </section>
          ))}
          {kind === "speech" && (
            <Badge>
              约{" "}
              {Math.ceil(
                (body.blocks.map((b: any) => b.text).join("").length / 240) *
                  60,
              )}{" "}
              秒 · 按240字/分钟估算
            </Badge>
          )}
          {kind === "storyboard" && (
            <Badge>
              镜头总时长{" "}
              {body.blocks.reduce(
                (n: number, b: any) => n + (b.duration || 0),
                0,
              )}{" "}
              秒 · 旁白约{" "}
              {Math.ceil(
                body.blocks
                  .map((b: any) => b.text)
                  .join("")
                  .replace(/\s/g, "").length / 4,
              )}{" "}
              秒（按240字/分钟估算，未实测）
            </Badge>
          )}
        </div>
      ) : (
        <div className="diff-view">
          <h3>当前内容与上一版本</h3>
          {(() => {
            const prior = project.versions.find(
              (v: any) => v.id === version?.parent_id,
            );
            return prior ? (
              <>
                <div>
                  <strong>上一版 v{prior.number}</strong>
                  <pre>{JSON.stringify(prior.body, null, 2)}</pre>
                </div>
                <div>
                  <strong>当前编辑</strong>
                  <pre>{JSON.stringify(body, null, 2)}</pre>
                </div>
              </>
            ) : (
              <p className="muted">还没有上一版本。</p>
            );
          })()}
        </div>
      )}
      <div className="editor-actions">
        <Button onClick={commit}>
          <Save size={15} />
          保存新版本
        </Button>
        {version && (
          <Button
            secondary
            disabled={dirty}
            onClick={async () => {
              if (
                await act(
                  () =>
                    post("/reviews", {
                      versionId: version.id,
                      decision: "confirmed",
                    }),
                  "当前版本已确认",
                )
              )
                reload();
            }}
          >
            <ShieldCheck size={15} />
            确认当前版本
          </Button>
        )}
        {version && (
          <button
            className="text-link"
            onClick={async () => {
              if (
                await act(
                  () =>
                    post("/reviews", {
                      versionId: version.id,
                      decision: "needs_changes",
                      reason: "编辑要求修改",
                    }),
                  "已标记需修改",
                )
              )
                reload();
            }}
          >
            标记需修改
          </button>
        )}
      </div>
      {version && (
        <div className="export-toolbar">
          <span>
            <Download size={16} />
            版本导出
          </span>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            {["md", "html", "pdf", "docx", "pptx", "json", "csv"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="draft">研究草稿</option>
            <option value="release">可发布版本</option>
          </select>
          <Button
            secondary
            small
            disabled={dirty}
            onClick={() =>
              act(
                () =>
                  post("/exports", {
                    targetType: "version",
                    targetId: version.id,
                    format,
                    mode,
                  }),
                "导出已排队，请在成果中心下载",
              )
            }
          >
            生成文件
          </Button>
          <Button secondary small disabled={dirty || version.stale} onClick={async()=>{const j=await act(()=>post('/visuals/from-version',{versionId:version.id}));if(j)go('job/'+j.id);}}>
            制作网页 / PPT / 动图 / 视频
          </Button>
          <Button secondary small disabled={dirty} title={dirty ? "请先保存版本" : "使用当前已保存版本生成音频"}
            onClick={() => openSpeech(go, "version", version.id, body.title, body.blocks.map((b: any) => b.text).join("\n\n"))}>
            生成配音
          </Button>
        </div>
      )}
    </div>
  );
}
function PatchForm({ project, version, blockId, act, close, go }: any) {
  const [prompt, setPrompt] = useState("");
  return (
    <div className="form">
      <div className="notice">
        只允许修改当前块的标题、正文或备注。其他内容与引用保持不变；结果先展示差异。
      </div>
      <Field label="修改要求">
        <textarea
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="例如：只将标题改得更适合家长理解，正文不动。"
        />
      </Field>
      <Button
        onClick={async () => {
          const r = await act(
            () =>
              post("/agent/runs", {
                projectId: project.id,
                kind: "patch",
                baseVersionId: version.id,
                blockIds: [blockId],
                prompt,
                masterId: version.master_id || undefined,
              }),
            "修改任务已提交",
          );
          if (r) {
            close();
            go("job/" + r.id);
          }
        }}
      >
        生成候选修改
      </Button>
    </div>
  );
}
function ExternalResult({ project, kind, master, act, close }: any) {
  const [text, setText] = useState("");
  return (
    <div className="form">
      <p className="muted">
        粘贴任务包约定的 Content
        JSON。结果会标为“外部执行／人工导入”，不会继承审核状态。
      </p>
      <textarea
        rows={15}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        onClick={async () => {
          if (
            await act(
              () =>
                post("/external-results", {
                  projectId: project.id,
                  kind,
                  masterId: kind === "master" ? undefined : master?.id,
                  expectedRevision: project.revision,
                  body: JSON.parse(text),
                }),
              "外部候选已导入",
            )
          )
            close();
        }}
      >
        校验并导入
      </Button>
    </div>
  );
}
function CharacterForm({ act, close }: any) {
  const [form, setForm] = useState<any>({
    name: "",
    identity: "",
    appearance: "",
    voice: "",
    outfit: "",
  });
  return (
    <div className="form">
      {[
        ["name", "角色名称"],
        ["identity", "身份与性格"],
        ["appearance", "稳定外貌特征"],
        ["voice", "声音与语言习惯"],
        ["outfit", "默认服饰造型（可变化）"],
      ].map(([k, l]) => (
        <Field key={k} label={l}>
          <input
            value={form[k]}
            onChange={(e) => setForm({ ...form, [k]: e.target.value })}
          />
        </Field>
      ))}
      <Field label="参考图片（可选）">
        <input
          type="file"
          accept=".png,.jpg,.jpeg,.webp"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              const r = await act(() => upload(f), "参考图片已保存");
              if (r) setForm({ ...form, imageAssetId: r.id });
            }
          }}
        />
      </Field>
      {form.imageAssetId && (
        <img
          className="character-ref"
          src={"/api/assets/" + form.imageAssetId}
        />
      )}
      <div className="notice">
        参考图作为独立资产保存。使用外部视频平台时，仍需自行上传；文字提示不会自动传递图片。
      </div>
      <Button
        onClick={async () => {
          if (await act(() => post("/characters", form), "角色已保存")) close();
        }}
      >
        保存角色模板
      </Button>
    </div>
  );
}
function LibraryPage({ data, act, setModal, go }: any) {
  return (
    <>
      <Heading title="内容创作" description="选择模板制作，或直接在对话里告诉 AI 要交付什么。"
        actions={<Button onClick={()=>go("explore")}><MessageSquare size={16}/>在对话中制作</Button>}/>
      <div className="template-grid">
        {productionTemplates.map((template) => (
          <div className="panel template-card" key={template.id}>
            <h3>{template.id === "wechat" ? "写公众号文章" : template.name}</h3>
            <p>{template.description}</p>
            <Button onClick={() => go("make/" + template.id)}>
              <Play size={15} />
              开始制作
            </Button>
            <button
              className="text-link"
              onClick={() =>
                act(
                  () => copyText(template.prompt),
                  "已复制；也可点「开始制作」直接执行",
                )
              }
            >
              复制要求（可选） <ArrowUpRight size={15} />
            </button>
          </div>
        ))}
      </div>
      <details className="panel lower material-tools"><summary>视频与分镜的人物素材</summary>
      <Button secondary onClick={()=>setModal({type:"character",title:"新建人物素材"})}>新建人物素材</Button>
      {data.characters.length ? (
        <div className="project-grid">
          {data.characters.map((c: any) => (
            <div className="panel character-card" key={c.id}>
              {c.body.imageAssetId && (
                <img src={"/api/assets/" + c.body.imageAssetId} />
              )}
              <h3>{c.name}</h3>
              <p>{c.body.identity}</p>
              <p>外貌：{c.body.appearance}</p>
              <p>声音：{c.body.voice}</p>
              <small>默认造型：{c.body.outfit || "未指定"}</small>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty
            title="还没有角色模板"
            text="固定角色的身份、外貌和声音，减少不同内容之间的设定漂移。"
          />
        </div>
      )}
      </details>
    </>
  );
}
function Reports({ data, act, go }: any) {
  return (
    <>
      <Heading title="监测日报" description="查看每次政策监测生成的日报和来源覆盖情况。"
        actions={<Button secondary onClick={() => act(() => post("/monitor"), "监测已启动")}>立即检查政策更新</Button>}/>
      <div className="report-grid">
        {data.reports.map((r: any) => (
          <button
            className="report-card panel"
            key={r.id}
            onClick={() => go("report/" + r.id)}
          >
            <span className="eyebrow">DAILY INTELLIGENCE / V{r.number}</span>
            <h2>{r.date}</h2>
            <p>教育情报与推荐选题</p>
            <div className="inline spread">
              <Badge state={r.coverage === "partial" ? "partial" : "verified"}>
                {r.coverage === "partial" ? "来源覆盖不完整" : "采集完成"}
              </Badge>
              <ArrowUpRight size={18} />
            </div>
          </button>
        ))}
        {!data.reports.length && (
          <div className="panel">
            <Empty
              title="还没有历史日报"
              text="每次监测完成后会保存不可变版本，同一天多次更新也不会覆盖旧版。"
            />
          </div>
        )}
      </div>
    </>
  );
}
function Report({ id, act, setModal, data }: any) {
  const [r, setR] = useState<any>(null),
    [format, setFormat] = useState("pdf");
  useEffect(() => {
    api("/reports/" + id).then(setR);
  }, [id]);
  if (!r) return <p>正在读取日报…</p>;
  const p = r.payload;
  return (
    <>
      <Heading
        eyebrow="DAILY INTELLIGENCE"
        title={`${r.date} 教育情报`}
        description={`版本 ${r.number} · 完成于 ${fmt(r.created_at)} · ${p.windowStart} — ${p.windowEnd}`}
        actions={
          <>
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              {["pdf", "docx", "html", "md", "json", "csv"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <Button
              secondary
              onClick={() =>
                act(
                  () =>
                    post("/exports", {
                      targetType: "report",
                      targetId: id,
                      format,
                    }),
                  "日报导出已排队",
                )
              }
            >
              <Download size={16} />
              导出日报
            </Button>
            {data.user.role === "admin" && (
              <Button
                onClick={async () => {
                  const msgs = await act(
                    () => post("/notifications/preview", { reportId: id }),
                    "",
                  );
                  if (msgs)
                    setModal({
                      title: "钉钉消息预览",
                      wide: true,
                      content: (
                        <NotificationPreview
                          messages={msgs}
                          act={act}
                          close={() => setModal(null)}
                        />
                      ),
                    });
                }}
              >
                <Send size={15} />
                钉钉预览
              </Button>
            )}
          </>
        }
      />
      <div className="metrics">
        {[
          ["有效情报", p.validCount],
          ["本轮新增", p.newCount],
          ["已核实", p.verifiedCount],
          ["来源覆盖", `${p.successfulSources}/${p.sourceCount}`],
        ].map(([k, v]: any) => (
          <div className="metric" key={k}>
            <span>{k}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      {p.warnings.length > 0 && (
        <div className="notice warning">
          <AlertCircle size={18} />
          <div>
            <strong>本次来源覆盖不完整</strong>
            {p.warnings.map((s: string) => (
              <p key={s}>{s}</p>
            ))}
          </div>
        </div>
      )}
      <div className="panel report-body">
        <span className="eyebrow">EDITORIAL SELECTION</span>
        <h2>值得关注的选题</h2>
        {p.topics.length ? (
          p.topics.map((t: any, i: number) => (
            <section key={t.id}>
              <Badge>
                0{i + 1} · {t.total}分
              </Badge>
              <h2>{t.title}</h2>
              <p>{t.summary}</p>
              <blockquote>{t.angle}</blockquote>
            </section>
          ))
        ) : (
          <Empty
            title={p.message}
            text="资料需要完成核验与选题评估后才会进入正式推荐。"
          />
        )}
        <h3>本次来源</h3>
        {p.sources.map((s: any) => (
          <p key={s.id}>
            <a
              href={s.url.startsWith("http") ? s.url : undefined}
              target="_blank"
              rel="noreferrer"
            >
              {s.title}
            </a>{" "}
            · {s.publisher} · {s.published}
          </p>
        ))}
      </div>
    </>
  );
}
function NotificationPreview({ messages, act, close }: any) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="form">
      <div className="notice">
        发送目标：<strong>{messages[0]?.target || "尚未配置目标群"}</strong>
        。消息直接来自指定日报版本。
      </div>
      {messages.map((m: any) => (
        <section key={m.id}>
          <Badge state={m.state} />
          <pre className="message-preview">{m.body}</pre>
        </section>
      ))}
      <label className="check">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        我确认以上目标与内容，发送到该钉钉群。
      </label>
      <Button
        disabled={!confirmed || !messages[0]?.target}
        onClick={async () => {
          if (
            await act(
              () =>
                post("/notifications/send", {
                  ids: messages.map((m: any) => m.id),
                  target: messages[0].target,
                  confirmed: true,
                }),
              "发送已进入独立队列",
            )
          )
            close();
        }}
      >
        <Send size={16} />
        确认发送
      </Button>
    </div>
  );
}
function Tasks({ data, act, go }: any) {
  const [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  return (
    <>
      <Heading
        eyebrow="RUNS & AUTOMATION"
        title="任务中心"
        description="真实过程、明确状态。关闭页面不会中断后台任务。"
        actions={
          <Button
            secondary
            onClick={() => act(() => post("/monitor"), "监测任务已排队")}
          >
            <Play size={15} />
            立即检查政策更新
          </Button>
        }
      />
      <div className="schedule-banner">
        <div>
          <Clock size={25} />
          <div>
            <h3>每天 {data.settings.scheduleTime} · Asia/Shanghai</h3>
            <p>
              {data.settings.scheduleEnabled
                ? "下次计划：" + fmt(data.nextSchedule)
                : "计划已暂停"}{" "}
              · 电脑与后台必须保持运行
            </p>
          </div>
        </div>
        {data.user.role === "admin" && <Button secondary small onClick={() => go("settings/schedule")}>管理计划</Button>}
      </div>
      <div className="panel">
        <div className="section-head">
          <h2>任务记录</h2>
          <span className="muted">每条记录均来自实际执行</span>
        </div>
        <details style={{ padding: "0 20px 18px" }}>
          <summary>自定义监测时间范围</summary>
          <div className="form-row">
            <Field label="监测开始时间">
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="监测结束时间">
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
            <Button
              disabled={!start || !end}
              onClick={() =>
                act(async () => {
                  const j = await post("/monitor", {
                    windowStart: new Date(start).toISOString(),
                    windowEnd: new Date(end).toISOString(),
                  });
                  go("job/" + j.id);
                  return j;
                }, "指定范围的监测已排队")
              }
            >
              运行此范围
            </Button>
          </div>
          <small className="muted">
            使用本机时间选择，最长跨度31天；日报会保留所选范围。
          </small>
        </details>
        {data.jobs.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>任务</th>
                  <th>状态</th>
                  <th>当前阶段</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((j: any) => (
                  <tr key={j.id}>
                    <td>
                      <button
                        className="text-link"
                        onClick={() => go("job/" + j.id)}
                      >
                        {(
                          {
                            import: "资料导入",
                            ocr: "本机OCR识别",
                            media: "文件与语音处理",
                            explore: "AI 研究与创作",
                            "conversation-export":"对话文件生成","chat-narration":"逐页配音试听","chat-film":"对话视频渲染",
                            production: "Agent制作任务",
                            monitor: "每日监测",
                            agent: "DeepSeek Agent",
                            export: "成果导出",
                            backup: "数据备份",
                          } as any
                        )[j.type] || j.type}
                      </button>
                      {j.production && <button className="text-link" onClick={()=>go("deliver/"+j.id)}>继续查看 · {j.production.title||j.production.templateName}</button>}
                      {j.htmlProjectId && <button className="text-link" onClick={()=>go("project/"+j.htmlProjectId+"?htmlFilm=1")}>返回创作项目</button>}
                      {j.conversationId && !j.htmlProjectId && <button className="text-link" onClick={()=>go("explore/"+j.conversationId)}>返回原对话</button>}
                      <small>
                        {j.id.slice(0, 12)} · 尝试 {j.attempt}
                      </small>
                    </td>
                    <td>
                      <Badge state={j.state} />
                    </td>
                    <td>{j.stage}</td>
                    <td>{fmt(j.created_at)}</td>
                    <td>
                      {["failed", "partial", "interrupted"].includes(
                        j.state,
                      ) ? (
                        <button
                          className="text-link"
                          onClick={() =>
                            act(
                              () => post("/jobs/" + j.id + "/retry"),
                              "已加入重试队列",
                            )
                          }
                        >
                          安全重试
                        </button>
                      ) : ["queued", "running"].includes(j.state) ? (
                        <button
                          className="text-link"
                          onClick={() =>
                            act(
                              () => post("/jobs/" + j.id + "/cancel"),
                              "已请求取消",
                            )
                          }
                        >
                          取消
                        </button>
                      ) : (
                        <button
                          className="text-link"
                          onClick={() => go("job/" + j.id)}
                        >
                          查看结果
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="暂无任务记录" />
        )}
      </div>
      <div className="section-head lower">
        <h2>消息发送记录</h2>
      </div>
      <div className="panel">
        {data.outbox.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>目标</th>
                  <th>状态</th>
                  <th>分段</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {data.outbox.map((o: any) => (
                  <tr key={o.id}>
                    <td>{o.target || "未配置"}</td>
                    <td>
                      <Badge state={o.state} />
                    </td>
                    <td>
                      {o.part}/{o.parts}
                    </td>
                    <td>{o.error || "日报快照消息"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={Send}
            title="尚无外发消息"
            text="先在日报页预览内容，并明确确认目标与发送行为。"
          />
        )}
      </div>
    </>
  );
}
function Job({ id, data, act, go, setModal }: any) {
  const [job, setJob] = useState<any>(null),
    [selected, setSelected] = useState<number[]>([]);
  useEffect(() => {
    let live = true;
    const load = () =>
      api("/jobs/" + id).then((r) => {
        if (live) setJob(r);
      });
    load();
    const t = setInterval(load, 1500);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [id]);
  if (!job) return <p>读取任务…</p>;
  const result = job.result;
  return (
    <>
      <Heading
        eyebrow="AGENT RUN DETAIL"
        title={
          job.type === "production"
            ? "工作台 Agent 制作"
            : job.type === "agent"
              ? "DeepSeek Agent 运行"
              : "任务详情"
        }
        description={`${job.id} · ${fmt(job.created_at)}`}
        actions={<Badge state={job.state} />}
      />
      <div className="detail-grid">
        <section className="panel task-timeline">
          <h2>执行轨迹</h2>
          {job.events.map((e: any) => (
            <div className="timeline-row" key={e.seq}>
              <span className="timeline-node" />
              <div>
                <div className="inline spread">
                  <strong>{e.payload.message || e.type}</strong>
                  <small>{fmt(e.created_at)}</small>
                </div>
                <p>{e.payload.name || e.payload.state || e.type}</p>
              </div>
            </div>
          ))}
          {job.error && (
            <div className="error-banner">
              <AlertCircle size={18} />
              {job.error.message}
            </div>
          )}
          {["failed", "partial", "interrupted"].includes(job.state) && (
            <Button
              secondary
              onClick={() =>
                act(() => post("/jobs/" + id + "/retry"), "已排队重试")
              }
            >
              从安全位置重试
            </Button>
          )}
        </section>
        <aside className="panel run-result">
          <h2>结果与依据</h2>
          {job.htmlProjectId && <Button secondary onClick={()=>go("project/"+job.htmlProjectId+"?htmlFilm=1")}>返回创作项目</Button>}
          {job.conversationId && !job.htmlProjectId && <Button secondary onClick={()=>go("explore/"+job.conversationId)}>返回原对话与文件</Button>}
          {job.production && (
            <div className="notice">
              <p>
                研究 → 母稿 → 内容 →
                文件。已完成的版本会保留，可从安全位置重试。
              </p>
              <Button
                secondary
                onClick={() => go("project/" + job.production.projectId)}
              >
                打开制作项目
              </Button>
              <Button secondary onClick={()=>go("deliver/"+id)}>查看制作进度与交付</Button>
            </div>
          )}
          {result ? (
            <>
              <div className="info-pairs">
                <span>执行器</span>
                <strong>{result.executor || "本地任务"}</strong>
                <span>模型</span>
                <strong>{result.model || "不涉及"}</strong>
                <span>输入 / 输出 token</span>
                <strong>
                  {result.usage
                    ? `${result.usage.inputTokens ?? "未知"} / ${result.usage.outputTokens ?? "未知"}`
                    : "不涉及"}
                </strong>
                <span>费用</span>
                <strong>{result.usage ? "接口未提供费用" : "不涉及"}</strong>
              </div>
              {result.versionId && (
                <Button
                  onClick={() =>
                    go(
                      result.projectId
                        ? "project/" + result.projectId
                        : "projects",
                    )
                  }
                >
                  查看创作项目 <ArrowRight size={15} />
                </Button>
              )}
              {result.artifacts?.map((file: any) => (
                <a
                  className="btn secondary"
                  key={file.id}
                  href={"/api/artifacts/" + file.id + "/download"}
                >
                  <Download size={15} />
                  下载 {file.name || file.format.toUpperCase()}
                </a>
              ))}
              {result.message && <p className="notice">{result.message}</p>}
              <WorkflowResult result={result} jobId={id} go={go}/>
              {result.claimIds && (
                <p>
                  新增 {result.claimIds.length} 条待核实事实、
                  {result.topicIds.length} 个选题。
                </p>
              )}
              {result.reportId && (
                <Button onClick={() => go("report/" + result.reportId)}>
                  查看日报
                </Button>
              )}
              {result.asset_id && (
                <a
                  className="btn"
                  href={"/api/artifacts/" + result.id + "/download"}
                >
                  <Download size={15} />
                  下载成果
                </a>
              )}
              {result.backupId && (
                <a className="btn" href={"/api/backups/" + result.backupId}>
                  下载备份
                </a>
              )}
              {job.type === "import" && result.id && (
                <Button onClick={() => go("snapshot/" + result.id)}>
                  查看资料与证据
                </Button>
              )}
              {job.type === "media" && <Button onClick={() => go("media/" + job.id)}>打开处理结果 / 音频</Button>}
              {job.type === "ocr" && result.sourceAssetId && (
                <div className="form">
                  <p>
                    本机OCR已完成，共{result.pageCount}
                    页。请对照原文件校正日期和数字。
                  </p>
                  <Button
                    onClick={() =>
                      setModal({
                        type: "import",
                        title: "校正并导入OCR结果",
                        initialOcr: job,
                      })
                    }
                  >
                    校正并导入识别结果
                  </Button>
                  <a
                    href={"/api/assets/" + result.sourceAssetId}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看原始文件
                  </a>
                  <a href={"/api/assets/" + result.resultAssetId}>
                    下载OCR原始识别记录
                  </a>
                  <pre>{result.text}</pre>
                </div>
              )}
              {result.content?.patches && (
                <div>
                  <h3>候选补丁</h3>
                  {result.content.patches.map((p: any, i: number) => (
                    <label className="patch-candidate" key={i}>
                      <input
                        type="checkbox"
                        checked={selected.includes(i)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, i]
                              : selected.filter((x) => x !== i),
                          )
                        }
                      />
                      <div>
                        <small>
                          {p.blockId.slice(0, 8)} · {p.field}
                        </small>
                        <p>{p.value}</p>
                      </div>
                    </label>
                  ))}
                  <Button
                    disabled={!selected.length}
                    onClick={async () => {
                      const project = await api(
                        "/projects/" + result.projectId,
                      );
                      if (
                        await act(
                          () =>
                            post("/patches/accept", {
                              jobId: id,
                              indices: selected,
                              expectedRevision: project.revision,
                            }),
                          "所选补丁已保存为新版本",
                        )
                      )
                        go("project/" + result.projectId);
                    }}
                  >
                    接受所选修改
                  </Button>
                </div>
              )}
            </>
          ) : (
            <Empty
              icon={Activity}
              title="等待任务结果"
              text="任务阶段由后端实时记录，不显示估算百分比。"
            />
          )}
        </aside>
      </div>
    </>
  );
}
function SettingsPage({ data, act, setModal, section }: any) {
  const [themeSaving, setThemeSaving] = useState(false),
    [themePreview, setThemePreview] = useState<Theme | null>(null),
    [themeError, setThemeError] = useState("");
  useEffect(() => { if (section === "schedule") document.getElementById("schedule-settings")?.focus(); }, [section]);
  async function switchTheme(theme: Theme) {
    if (themeSaving || theme === data.settings.theme) return;
    const previous = data.settings.theme as Theme;
    setThemeSaving(true);
    setThemePreview(theme);
    setThemeError("");
    applyTheme(theme);
    try {
      const result = await act(
        () =>
          patch("/settings/theme", { revision: data.settings.revision, theme }),
        "主题已自动保存",
      );
      if (!result) {
        applyTheme(previous);
        setThemeError("主题保存失败，已恢复原主题。请检查连接后重新选择。");
      }
    } finally {
      setThemeSaving(false);
      setThemePreview(null);
    }
  }
  const [cfg, setCfg] = useState<any>(data.settings),
    [key, setKey] = useState(""),
    [webhook, setWebhook] = useState(""),
    [sign, setSign] = useState(""),
    [source, setSource] = useState({ name: "", url: "" }),
    [aiBusy, setAiBusy] = useState(false),
    [connection, setConnection] = useState<{
      state: string;
      message: string;
    } | null>(null);
  const baseline = useRef(data.settings);
  useEffect(() => {
    const before = baseline.current;
    baseline.current = data.settings;
    setCfg((previous: any) =>
      Object.fromEntries(
        Object.entries(data.settings).map(([k, v]) => [
          k,
          previous[k] === before[k] ? v : previous[k],
        ]),
      ),
    );
  }, [data.settings.revision]);
  const edit = (k: string, v: any) => {
    setCfg({ ...cfg, [k]: v });
    setConnection(null);
  };
  const aiFields = Object.keys(DeepSeekSettings.shape);
  const aiDirty = aiFields.some((k) => cfg[k] !== data.settings[k]);
  const credentialSaved = data.capabilities.deepseek === "configured";
  const testHint = !credentialSaved
    ? "第1步：先填写 API Key 并点击「保存密钥」。"
    : key.trim()
      ? "新密钥尚未保存，请先点击「保存密钥」，避免测试旧凭据。"
      : !cfg.allowExternalAI
        ? "第2步：勾选「允许 DeepSeek 调用」，再保存并测试连接。"
        : aiDirty
          ? "授权或模型设置尚未保存。点击「保存并测试连接」即可生效，无需返回页面顶部。"
          : "已满足测试条件。点击「测试连接」验证已保存的凭据和模型。";
  async function saveAI(test = false) {
    if (aiBusy) return;
    setAiBusy(true);
    setConnection(null);
    try {
      await act(
        async () => {
          if (aiDirty)
            await patch("/settings/deepseek", {
              revision: data.settings.revision,
              settings: Object.fromEntries(aiFields.map((k) => [k, cfg[k]])),
            });
          if (test) {
            setConnection({
              state: "testing",
              message: "正在测试连接…只发送一条简短测试消息，不发送研究资料。",
            });
            try {
              const result = await post("/agent/probe");
              if (!result.ok)
                throw new Error(
                  "DeepSeek 未返回有效测试内容，请检查模型配置后重试。",
                );
              setConnection({
                state: "success",
                message: "连接测试成功，可以开始使用 DeepSeek Agent。",
              });
              return result;
            } catch (e: any) {
              setConnection({
                state: "error",
                message: "连接测试失败：" + e.message,
              });
              throw e;
            }
          }
          return { saved: true };
        },
        test ? "DeepSeek 连接测试成功" : "DeepSeek 设置已保存；其他设置未提交",
      );
    } finally {
      setAiBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="WORKSPACE SETTINGS"
        title="设置"
        description="连接所需能力，清楚掌握资料流向和任务边界。"
        actions={
          <Button
            disabled={aiBusy || themeSaving}
            onClick={() =>
              act(
                () =>
                  put("/settings", {
                    revision: data.settings.revision,
                    settings: cfg,
                  }),
                "设置已保存；新任务使用新配置",
              )
            }
          >
            <Save size={16} />
            保存设置
          </Button>
        }
      />
      <div className="settings-grid">
        <UpdatePanel />
        <WechatConnection />
        <section className="panel settings-card full" aria-label="OCR识别能力">
          <div className="section-head">
            <h2>
              <FileText size={21} />
              图片与扫描件识别
            </h2>
            <Badge
              state={data.capabilities.ocr?.available ? "verified" : "pending"}
            >
              {data.capabilities.ocr?.available
                ? "本机OCR可用"
                : "本机OCR不可用"}
            </Badge>
          </div>
          <p>
            {data.capabilities.ocr?.available
              ? `${data.capabilities.ocr.engine === "apple-vision" ? "Apple Vision" : "Windows本地识别"} · 语言：${data.capabilities.ocr.languages.join("、")}。支持PNG、JPEG、WebP和扫描PDF；逐页识别并保留已完成页面，最多2000页。`
              : data.capabilities.ocr?.reason ||
                "请检查服务器的OCR能力和识别语言。"}
          </p>
          <p>
            上传图片或扫描PDF后自动识别，可在预览中校正，再导入资料。OCR不使用DeepSeek额度；识别文字进入AI流程时仍遵循调用授权。
          </p>
        </section>
        <section className="panel settings-card full" aria-label="界面主题">
          <div className="section-head">
            <h2>
              <Leaf size={21} />
              界面主题
            </h2>
            <span className="muted">选择即自动保存</span>
          </div>
          <div className="theme-options" role="group" aria-label="选择界面主题">
            {(
              [
                [
                  "scholar",
                  "书院 · Scholar",
                  "暖白纸面 · 墨绿导航 · 日常研究",
                  "默认",
                ],
                [
                  "obsidian",
                  "曜石 · Obsidian",
                  "深海黑 · 冰青证据链 · 琥珀重点",
                  "",
                ],
              ] as const
            ).map(([id, title, description, label]) => (
              <button
                key={id}
                className={"theme-option " + id}
                aria-pressed={(themePreview || data.settings.theme) === id}
                disabled={themeSaving}
                onClick={() => switchTheme(id)}
              >
                <span className="theme-swatch" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <strong>
                  {title}
                  {label && <span className="theme-default">默认</span>}
                </strong>
                <small>{description}</small>
                <span className="theme-selected">
                  {(themePreview || data.settings.theme) === id
                    ? "✓ 已选择"
                    : "选择此主题"}
                </span>
              </button>
            ))}
          </div>
          <div role="status" className="theme-save-status">
            {themeSaving
              ? "正在保存主题…"
              : themeError ||
                "主题已保存，刷新或重新启动后继续使用。书院为初始默认主题。"}
          </div>
          <p>此处只保存界面主题。导出文件继续使用原有版式。</p>
        </section>
        <section className="panel settings-card">
          <div className="section-head">
            <h2>
              <BrainCircuit size={21} />
              DeepSeek Agent
            </h2>
            <Badge
              state={
                data.capabilities.deepseek === "configured"
                  ? "verified"
                  : "pending"
              }
            >
              {data.capabilities.deepseek === "configured"
                ? "凭据已配置"
                : "待配置"}
            </Badge>
          </div>
          <p>
            通过官方 DeepSeek API 运行工作台内的有限工具循环。凭据使用服务器的{" "}
            {data.capabilities.secretStorage} 保存，前端不会读取明文。
          </p>
          {data.capabilities.secretStorageIssue&&<p role="alert" className="error-banner">{data.capabilities.secretStorageIssue.message}</p>}
          <SecretCredentialInput value={key} onChange={setKey} disabled={aiBusy} storage={data.capabilities.secretStorage} act={act} onBusyChange={setAiBusy}/>
          <Field label="模型名称">
            <input
              list="models"
              disabled={aiBusy}
              value={cfg.model}
              onChange={(e) => edit("model", e.target.value)}
            />
            <datalist id="models">
              <option value="deepseek-flash" />
              <option value="deepseek-v4-pro" />
            </datalist>
            <small className="help">Flash 适合日常创作与官方联网探索；Pro 适合复杂分析，联网时使用工作台检索。</small>
          </Field>
          <div className="form-grid">
            <Field label="默认思考强度">
              <select aria-label="默认思考强度" disabled={aiBusy} value={cfg.thinkingMode || "disabled"} onChange={(e) => edit("thinkingMode", e.target.value)}>
                <option value="disabled">快速 · 关闭思考</option>
                <option value="low">轻量思考</option>
                <option value="high">深度思考</option>
                <option value="max">最强思考</option>
              </select>
            </Field>
            <Field label="默认联网方式">
              <select aria-label="默认联网方式" disabled={aiBusy} value={cfg.exploreEngine || "native"} onChange={(e) => edit("exploreEngine", e.target.value)}>
                <option value="native">官方搜索与链接阅读（Flash）</option>
                <option value="controlled">工作台检索 · 限定调用次数</option>
              </select>
            </Field>
          </div>
          <p className="help">思考设置用于事实提取、母稿、内容制作与探索。AI 研究可为单轮覆盖强度；思考 token 计入输出预算，复杂任务可提高预算。连接测试始终使用快速模式。</p>
          <label className="check">
            <input type="checkbox" disabled={aiBusy} checked={cfg.exploreSafetyCheck !== false} onChange={(e) => edit("exploreSafetyCheck", e.target.checked)} />
            官方探索启用 DeepSeek 内容审核
          </label>
          <small className="help">官方搜索的内部步骤由 DeepSeek 控制，按实际 token 和工具次数计费；需要严格限制检索次数时选择工作台检索。<a href="https://api-docs.deepseek.com/zh-cn/quick_start/pricing/" target="_blank" rel="noreferrer">查看官方价格</a></small>
          <div
            className="deepseek-authorization"
            role="group"
            aria-label="DeepSeek 调用授权"
          >
            <div className="inline spread">
              <strong>调用授权</strong>
              <Badge
                state={
                  aiDirty
                    ? "pending"
                    : data.settings.allowExternalAI
                      ? "verified"
                      : "pending"
                }
              >
                {aiDirty
                  ? "更改未保存"
                  : data.settings.allowExternalAI
                    ? "已开启"
                    : "待开启"}
              </Badge>
            </div>
            <p>
              保存密钥后，还需开启调用授权。测试连接只发送简短测试消息；运行 AI
              任务时才发送任务选定或检索命中的资料、事实、母稿和笔记。
            </p>
            <label className="check">
              <input
                type="checkbox"
                disabled={aiBusy}
                checked={cfg.allowExternalAI}
                onChange={(e) => edit("allowExternalAI", e.target.checked)}
              />
              允许 DeepSeek 调用
            </label>
            <p className="deepseek-next-step" id="deepseek-test-hint">
              {!cfg.allowExternalAI && data.settings.allowExternalAI
                ? "关闭授权尚未保存，请点击「保存 DeepSeek 设置」使其生效。"
                : testHint}
            </p>
            <Button
              secondary
              small
              disabled={!aiDirty || aiBusy}
              onClick={() => saveAI()}
            >
              保存 DeepSeek 设置
            </Button>
            <Button
              disabled={
                aiBusy ||
                !credentialSaved ||
                !cfg.allowExternalAI ||
                !!key.trim()
              }
              aria-describedby="deepseek-test-hint"
              onClick={() => saveAI(true)}
            >
              {aiBusy ? "正在处理…" : aiDirty ? "保存并测试连接" : "测试连接"}
            </Button>
            {connection && (
              <div
                role="status"
                className={"deepseek-connection " + connection.state}
              >
                {connection.message}
              </div>
            )}
            <small className="help">
              测试会发起一次很短的真实 API 请求，可能产生少量费用。此处仅保存
              DeepSeek 设置，不会开启每日监测或钉钉推送。
            </small>
          </div>
          <details>
            <summary>高级设置：调用预算与超时</summary>
            <div className="form-grid">
              <Field label="最多模型请求">
                <input
                  disabled={aiBusy}
                  type="number"
                  min="1"
                  max="20"
                  value={cfg.maxRequests}
                  onChange={(e) => edit("maxRequests", +e.target.value)}
                />
              </Field>
              <Field label="最多工具调用">
                <input
                  disabled={aiBusy}
                  type="number"
                  min="1"
                  max="50"
                  value={cfg.maxTools}
                  onChange={(e) => edit("maxTools", +e.target.value)}
                />
              </Field>
              <Field label="任务超时（秒）">
                <input
                  disabled={aiBusy}
                  type="number"
                  value={cfg.timeoutSeconds}
                  onChange={(e) => edit("timeoutSeconds", +e.target.value)}
                />
              </Field>
              <Field label="最大输出 token">
                <input
                  disabled={aiBusy}
                  type="number"
                  min="1024"
                  max="65536"
                  value={cfg.maxTokens}
                  onChange={(e) => edit("maxTokens", +e.target.value)}
                />
              </Field>
            </div>
          </details>
        </section>
        <section id="schedule-settings" tabIndex={-1} className="panel settings-card">
          <h2>
            <Clock size={21} />
            每日监测计划
          </h2>
          <label className="check">
            <input
              type="checkbox"
              checked={cfg.scheduleEnabled}
              onChange={(e) => edit("scheduleEnabled", e.target.checked)}
            />
            启用每日自动更新
          </label>
          <div className="form-grid">
            <Field label="启动时间 · Asia/Shanghai">
              <input
                type="time"
                value={cfg.scheduleTime}
                onChange={(e) => edit("scheduleTime", e.target.value)}
              />
            </Field>
            <Field label="监测时间窗口">
              <select
                value={cfg.windowHours}
                onChange={(e) => edit("windowHours", +e.target.value)}
              >
                {[24, 48, 72, 168, 720].map((h) => (
                  <option value={h} key={h}>
                    {h === 168
                      ? "最近7天"
                      : h === 720
                        ? "最近30天"
                        : `最近${h}小时`}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={cfg.weekdaysOnly}
              onChange={(e) => edit("weekdaysOnly", e.target.checked)}
            />
            仅工作日执行
          </label>
          <Field label="关注地区">
            <input
              value={cfg.region}
              onChange={(e) => edit("region", e.target.value)}
            />
          </Field>
          <Field label="监测关键词（逗号分隔）">
            <input
              value={cfg.keywords}
              onChange={(e) => edit("keywords", e.target.value)}
            />
          </Field>
          <div className="notice">
            <Clock size={18} />
            计划时间是任务启动时间。电脑关机、休眠或后台退出时不会运行；恢复后只补最近24小时内错过的最近一次任务。
          </div>
          <h3>监测来源</h3>
          {data.sources.map((s: any) => (
            <div className="source-setting" key={s.id}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!s.enabled}
                  onChange={(e) =>
                    act(() =>
                      patch("/sources/" + s.id, { enabled: e.target.checked }),
                    )
                  }
                />
                <span>
                  {s.name}
                  <small>
                    {s.last_error || "最近成功：" + fmt(s.last_success)}
                  </small>
                </span>
              </label>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                aria-label="查看来源"
              >
                <ExternalLink size={15} />
              </a>
            </div>
          ))}
          <details>
            <summary>添加公开来源</summary>
            <div className="form">
              <input
                placeholder="来源名称"
                value={source.name}
                onChange={(e) => setSource({ ...source, name: e.target.value })}
              />
              <input
                placeholder="官方列表页 HTTPS 地址"
                value={source.url}
                onChange={(e) => setSource({ ...source, url: e.target.value })}
              />
              <Button
                small
                secondary
                onClick={async () => {
                  if (
                    await act(
                      () =>
                        post("/sources", { ...source, scope: scopeDefault }),
                      "来源已添加",
                    )
                  )
                    setSource({ name: "", url: "" });
                }}
              >
                添加来源
              </Button>
            </div>
          </details>
        </section>
        <section className="panel settings-card">
          <h2>
            <Send size={21} />
            钉钉通知
          </h2>
          <p>消息直接来自日报版本。默认不发送；先预览、确认目标，再发送。</p>
          <Field label="目标群名称">
            <input
              value={cfg.targetName}
              onChange={(e) => edit("targetName", e.target.value)}
            />
          </Field>
          <Field label="群机器人 Webhook">
            <div className="input-action">
              <input
                type="password"
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                placeholder="https://oapi.dingtalk.com/robot/send?..."
              />
              <Button
                small
                secondary
                disabled={!webhook}
                onClick={async () => {
                  if (
                    await act(
                      () =>
                        post("/secrets", {
                          name: "dingtalkWebhook",
                          value: webhook,
                        }),
                      "机器人地址已加密保存",
                    )
                  )
                    setWebhook("");
                }}
              >
                保存
              </Button>
            </div>
          </Field>
          <Field label="加签密钥（如机器人启用加签）">
            <div className="input-action">
              <input
                type="password"
                value={sign}
                onChange={(e) => setSign(e.target.value)}
              />
              <Button
                small
                secondary
                disabled={!sign}
                onClick={async () => {
                  if (
                    await act(() =>
                      post("/secrets", { name: "dingtalkSign", value: sign }),
                    )
                  )
                    setSign("");
                }}
              >
                保存
              </Button>
            </div>
          </Field>
          <label className="check">
            <input
              type="checkbox"
              checked={cfg.autoSend}
              onChange={(e) => edit("autoSend", e.target.checked)}
            />
            明确启用：每次日报提交后自动发送到上述目标群。
          </label>
          <small className="help">
            超时但结果不明的消息不会自动重发。请在任务页核查状态。
          </small>
        </section>
        <section className="panel settings-card">
          <h2>
            <Layers size={21} />
            Skill 与版本
          </h2>
          <p>
            项目内构建的 EduContent Studio
            方法包，由受控执行器加载；注册成功与真实运行验证分开。
          </p>
          {data.skills.map((s: any) => (
            <div className="skill-row" key={s.id}>
              <strong>
                {s.skill_id} · {s.version}
              </strong>
              <code>{s.hash.slice(0, 20)}</code>
              <small>
                {s.origin} · {fmt(s.created_at)}
              </small>
            </div>
          ))}
          <div className="inline">
            <Button
              secondary
              small
              onClick={() =>
                act(() => post("/skills/rescan"), "已重新扫描工作流包")
              }
            >
              重新扫描
            </Button>
            <label className="btn secondary small file-label">
              导入 Skill ZIP
              <input
                type="file"
                accept=".zip"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    const a = await act(() => upload(f), "");
                    if (a)
                      act(
                        () => post("/skills/import", { assetId: a.id }),
                        "已导入；尚未执行验证",
                      );
                  }
                }}
              />
            </label>
          </div>
          <small className="help">
            只导入 Markdown
            工作流，不运行包中的安装脚本。每个任务固定使用启动时的内容哈希。
          </small>
        </section>
        <section className="panel settings-card full">
          <div className="section-head">
            <div>
              <h2>
                <ShieldCheck size={21} />
                数据与备份
              </h2>
              <p>
                数据库与资产保存在本机。备份排除密钥，恢复前进行哈希与数据库完整性校验。
              </p>
            </div>
            <Button
              secondary
              onClick={() => act(() => post("/backups"), "备份已排队")}
            >
              <Download size={16} />
              创建备份
            </Button>
          </div>
          <div className="backup-list">
            {data.backups.map((b: any) => (
              <a
                className="text-link"
                key={b.name}
                href={"/api/backups/" + b.name}
              >
                <Download size={14} />
                {b.name}
              </a>
            ))}
          </div>
          <label className="btn secondary file-label">
            选择备份并预检
            <input
              type="file"
              accept=".zip"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const v = await act(
                  () => upload(f, "/restore/validate"),
                  "备份预检通过",
                );
                if (v)
                  setModal({
                    title: "确认恢复数据",
                    content: (
                      <RestoreConfirm
                        preview={v}
                        act={act}
                        close={() => setModal(null)}
                      />
                    ),
                  });
              }}
            />
          </label>
        </section>
      </div>
    </>
  );
}
function RestoreConfirm({ preview, act, close }: any) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="form">
      <p>
        备份时间：{fmt(preview.createdAt)}。包含 {preview.projects} 个项目、
        {preview.versions} 个内容版本。
      </p>
      <div className="notice warning">
        恢复将替换当前数据库，当前数据会先另做一份安全备份。恢复后定时计划与自动推送暂停，避免重复执行。
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        我确认恢复该备份。
      </label>
      <Button
        disabled={!confirmed}
        onClick={async () => {
          if (
            await act(
              () =>
                post("/restore/commit", {
                  token: preview.token,
                  confirmed: true,
                }),
              "数据已恢复，计划已暂停",
            )
          )
            close();
        }}
      >
        执行恢复
      </Button>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<AuthApp />);
