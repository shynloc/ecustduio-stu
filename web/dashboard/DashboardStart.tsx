import React, { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Paperclip,
  Sparkles,
  Play,
  Pause,
  Plus,
  Clock,
  FileText,
  FolderOpen,
} from "lucide-react";
import { api, post } from "../api";
import { useChatMaterials, ChatMaterials } from "../ChatMaterials";
import { ContextPicker } from "../conversations/ContextPicker";
import { usePreferences } from "../collections/usePreferences";
import { TaskProgress } from "../tasks/TaskProgress";
const Scene = lazy(() => import("./WorkspaceScene"));
export function DashboardStart({ data, go }: any) {
  const [prefs, setPrefs] = usePreferences("dashboard", {
      motion: true,
      hideGuide: false,
    }),
    [prompt, setPrompt] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [snapshots, setSnapshots] = useState<string[]>([]),
    [picker, setPicker] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recent, setRecent] = useState<any[]>([]);
  const materials = useChatMaterials();
  useEffect(() => {
    let live = true;
    Promise.all([
      api("/collections/notes?limit=2"),
      api("/collections/conversations?limit=2"),
    ])
      .then(([n, c]) => {
        if (live)
          setRecent(
            [
              ...n.items.map((x: any) => ({
                ...x,
                route: "notes/" + x.id,
                label: "笔记",
              })),
              ...c.items.map((x: any) => ({
                ...x,
                route: "explore/" + x.id,
                label: "对话",
              })),
            ]
              .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
              .slice(0, 3),
          );
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  async function start(e: any) {
    e.preventDefault();
    if (busy || materials.pending) return;
    setBusy(true);
    setError("");
    try {
      const c = await post("/conversations", { title: prompt.slice(0, 60) });
      await post("/conversations/" + c.id + "/messages", {
        prompt,
        mode: "auto",
        noteIds: selected,
        snapshotIds: snapshots,
        attachmentIds: materials.items.flatMap((i) => (i.id ? [i.id] : [])),
        sourceUrls: materials.items.flatMap((i) => (i.url ? [i.url] : [])),
        queueTurn: true,
      });
      window.dispatchEvent(new Event("ecu-conversations-changed"));
      go("explore/" + c.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const steps = [
    {
      done:
        data.capabilities.deepseek === "configured" &&
        data.settings.allowExternalAI,
      label: "连接 AI 助手",
      route: "settings",
    },
    {
      done: data.counts.snapshots > 0,
      label: "导入第一份资料",
      route: "input",
    },
    {
      done: data.counts.artifacts > 0,
      label: "制作第一份作品",
      route: "library",
    },
  ];
  return (
    <>
      <section className="experience-hero">
        <div className="experience-hero-copy">
          <span className="eyebrow">你的想法，从这里成为作品</span>
          <h2>
            今天，我们一起
            <br />
            完成什么？
          </h2>
          <p>放入资料，说出目标。工作台帮你查找、整理，再制作成可用的内容。</p>
          <form className="dashboard-command" onSubmit={start}>
            <textarea
              aria-label="首页任务要求"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例如：把这份课程资料做成 10 页 PPT，再生成一份讲义…"
              maxLength={10000}
              required
            />
            <div className="dashboard-command-tools">
              <ChatMaterials materials={materials} />
              <button
                type="button"
                className="text-link"
                onClick={() => setPicker(true)}
              >
                <BookOpen size={16} />
                选择资料 {selected.length + snapshots.length || ""}
              </button>
              <button
                className="btn"
                disabled={busy || materials.pending || !prompt.trim()}
              >
                {busy ? "正在安排…" : "开始"}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
          {error && <p role="alert">{error}</p>}
          <div className="dashboard-quick-prompts">
            {["整理一份工作简报", "制作教学 PPT", "写一篇公众号文章"].map(
              (t) => (
                <button key={t} onClick={() => setPrompt(t)}>
                  <Sparkles size={13} />
                  {t}
                </button>
              ),
            )}
          </div>
        </div>
        <div className="experience-hero-scene">
          <Suspense fallback={<div className="workspace-scene" />}>
            <Scene theme={data.settings.theme} motion={prefs.motion} go={go} />
          </Suspense>
          <button
            className="scene-motion"
            onClick={() => setPrefs({ ...prefs, motion: !prefs.motion })}
            aria-pressed={prefs.motion}
          >
            {prefs.motion ? <Pause size={13} /> : <Play size={13} />}{" "}
            {prefs.motion ? "暂停动效" : "开启动效"}
          </button>
        </div>
      </section>
      {picker && (
        <ContextPicker
          selected={selected}
          onChange={setSelected}
          snapshots={snapshots}
          onSnapshots={setSnapshots}
          close={() => setPicker(false)}
        />
      )}
      {!prefs.hideGuide && !steps.every((s) => s.done) && (
        <section className="dashboard-onboarding" aria-label="首次使用引导">
          {steps.map((s, i) => (
            <button
              key={s.route}
              onClick={() => go(s.route)}
              className={s.done ? "complete" : ""}
            >
              <span>{s.done ? <Check size={16} /> : i + 1}</span>
              <div>
                <strong>{s.label}</strong>
                <small>{s.done ? "已完成" : "点击继续"}</small>
              </div>
              <ArrowRight size={15} />
            </button>
          ))}
        </section>
      )}
      <div className="dashboard-guide-toggle">
        <button
          className="text-link"
          onClick={() => setPrefs({ ...prefs, hideGuide: !prefs.hideGuide })}
        >
          {prefs.hideGuide ? "显示使用引导" : "收起使用引导"}
        </button>
      </div>
      <section className="dashboard-resume">
        <div className="section-head">
          <h2>继续上次的工作</h2>
          <button className="text-link" onClick={() => go("tasks")}>
            全部任务
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="resume-cards">
          {recent.map((r) => (
            <button key={r.route} onClick={() => go(r.route)}>
              <span>
                {r.label === "笔记" ? (
                  <FileText size={19} />
                ) : (
                  <Clock size={19} />
                )}
                <small>{r.label}</small>
              </span>
              <strong>{r.title}</strong>
              <small>
                继续编辑或提问 <ArrowRight size={12} />
              </small>
            </button>
          ))}
          {data.projects
            .slice(0, Math.max(0, 3 - recent.length))
            .map((p: any) => (
              <button key={p.id} onClick={() => go("project/" + p.id)}>
                <FolderOpen size={19} />
                <strong>{p.title}</strong>
                <small>继续项目</small>
              </button>
            ))}
          {!recent.length && !data.projects.length && (
            <button onClick={() => go("input")}>
              <Plus size={22} />
              <strong>从一份资料开始</strong>
              <small>网址、文件或一段文字都可以</small>
            </button>
          )}
        </div>
      </section>
      {data.jobs
        .filter((j: any) => ["running", "queued"].includes(j.state))
        .slice(0, 2)
        .map((j: any) => (
          <TaskProgress key={j.id} id={j.id} compact />
        ))}
    </>
  );
}
