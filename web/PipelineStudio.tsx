import {ContextPicker} from './conversations/ContextPicker';
import React, { useEffect, useRef, useState } from "react";
import { productionTemplates } from "../shared/production";
import { api, post } from "./api";
import { readContext } from "./context";
import { uid } from "./compat";

const labels: Record<string, string> = {
  pptx: "可编辑 PPT",
  docx: "Word 文档",
  pdf: "PDF",
  md: "Markdown",
  html: "网页",
  json: "JSON",
  gif: "GIF 动图",
  mp4: "带配音视频",
};
const stateNames: Record<string, string> = {
  queued: "已排队",
  running: "制作中",
  succeeded: "已完成",
  failed: "失败",
  interrupted: "已中断",
  partial: "部分完成",
  canceled: "已取消",
  awaiting_input: "等待确认",
};
const retryable = (state: string) =>
  ["failed", "partial", "interrupted"].includes(state);

function DeliveryProgress({
  id,
  go,
}: {
  id: string;
  go: (route: string) => void;
}) {
  const [job, setJob] = useState<any>(null),
    [visual, setVisual] = useState<any>(null),
    [approved, setApproved] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true,
      timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const j = await api("/jobs/" + id);
        if (!live) return;
        setJob(j);
        if (
          j.type === "production" &&
          j.state === "succeeded" &&
          j.result?.visualId &&
          !j.production?.deliveryJobId
        ) {
          const v = await api("/visuals/" + j.result.visualId);
          if (live) setVisual(v);
        }
        if (live && ["queued", "running"].includes(j.state))
          timer = setTimeout(load, 1500);
      } catch (e: any) {
        if (live) setError(e.message);
      }
    }
    load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [id, refresh]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const p = job?.production,
    projectId = p?.projectId || job?.result?.projectId;
  const requested: string[] =
    p?.deliveryFormats ??
    (new URLSearchParams(location.hash.split("?")[1])
      .get("formats")
      ?.split(",") ||
      p?.formats ||
      []);
  const dynamic = requested.filter((f) => f === "gif" || f === "mp4");
  return (
    <section className="panel pipeline-form">
      <h2>制作进度</h2>
      {job && (
        <>
          <strong>
            {p?.title ||
              (job.type === "visual-export" ? "动图与视频导出" : "制作任务")}
          </strong>
          <span>
            {stateNames[job.state] || job.state}
            {requested.length
              ? " · " + requested.map((f) => labels[f] || f).join("、")
              : ""}
          </span>
        </>
      )}
      {p && (
        <ol className="pipeline-stages">
          {Object.entries({
            research: "提取事实",
            master: "整理母稿",
            content: "撰写内容",
            export: "生成文件",
          }).map(([key, label]) => (
            <li
              key={key}
              className={p.completedStages?.includes(key) ? "stage-done" : ""}
            >
              {p.completedStages?.includes(key) ? "✓ " : ""}
              {label}
            </li>
          ))}
        </ol>
      )}
      <p role="status">
        {job?.error?.message ||
          job?.events?.at(-1)?.payload?.message ||
          "正在读取任务…"}
      </p>
      <div className="button-row">
        {retryable(job?.state) && (
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              perform(async () => {
                await post("/jobs/" + id + "/retry");
                setRefresh((i) => i + 1);
              })
            }
          >
            继续未完成部分
          </button>
        )}
        <button className="btn secondary" onClick={() => go("job/" + id)}>
          执行轨迹
        </button>
        {projectId && (
          <button
            className="btn secondary"
            onClick={() => go("project/" + projectId)}
          >
            打开项目
          </button>
        )}
        <button
          className="btn secondary"
          onClick={() =>
            go(
              projectId
                ? "results?project=" + encodeURIComponent(projectId)
                : "results",
            )
          }
        >
          {projectId ? "查看本项目成果" : "查看成果库"}
        </button>
      </div>
      {job?.result?.artifacts?.map((a: any) => (
        <a key={a.id} href={"/api/artifacts/" + a.id + "/download"}>
          {a.name || a.format?.toUpperCase()} · 下载
        </a>
      ))}
      {job?.parentProductionId && (
        <button
          className="text-link"
          onClick={() => go("deliver/" + job.parentProductionId)}
        >
          返回原制作任务
        </button>
      )}
      {p?.deliveryJobId ? (
        <button
          className="btn"
          onClick={() => go("deliver/" + p.deliveryJobId)}
        >
          查看动图 / 视频任务
        </button>
      ) : (
        visual && (
          <>
            <h3>设计预览</h3>
            <iframe
              title="成果设计预览"
              className="pipeline-preview"
              sandbox=""
              src={"/api/visuals/" + visual.id + "/preview"}
            />
            <button
              className="text-link"
              onClick={() => go("visual/" + visual.id)}
            >
              编辑设计
            </button>
            {dynamic.length > 0 && (
              <>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={approved}
                    onChange={(e) => setApproved(e.target.checked)}
                  />
                  已核对文案和画面，生成
                  {dynamic.map((f) => labels[f]).join("、")}
                </label>
                <button
                  className="btn"
                  disabled={!approved || busy || visual.stale}
                  onClick={() =>
                    perform(async () => {
                      const j = await post(
                        "/pipeline/jobs/" + id + "/finish-visual",
                        {
                          copyHash: visual.copyHash,
                          visualHash: visual.visualHash,
                          outputs: dynamic,
                          approveCopy: true,
                          approveVisual: true,
                        },
                      );
                      go("deliver/" + j.id);
                    })
                  }
                >
                  确认并生成
                </button>
              </>
            )}
          </>
        )
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            className="text-link"
            onClick={() => {
              setError("");
              setRefresh((i) => i + 1);
            }}
          >
            重新读取
          </button>
        </p>
      )}
    </section>
  );
}

function DeliveryForm({ data, go }: any) {
  const [picker,setPicker]=useState(false);
  const [notes, setNotes] = useState<any[]>([]),
    [refs, setRefs] = useState<any[]>([]),
    [query, setQuery] = useState("");
  const [templateId, setTemplate] = useState("presentation"),
    [formats, setFormats] = useState<string[]>([["gif","mp4","html","pptx","docx","pdf"].includes(new URLSearchParams(location.hash.split("?")[1]).get("format")||"")?new URLSearchParams(location.hash.split("?")[1]).get("format")!:"pptx"]),
    [prompt, setPrompt] = useState("");
  const [share, setShare] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const request = useRef({ signature: "", key: "" });
  const template = productionTemplates.find((t) => t.id === templateId)!;
  const options: string[] =
    templateId === "presentation"
      ? [...template.formats, "gif", "mp4"]
      : [...template.formats];
  useEffect(() => {
    let live = true;
    Promise.all([api("/notes"), readContext()])
      .then(([list, ctx]) => {
        if (live) {
          setNotes([...list,...(ctx?.items||[]).filter((i:any)=>i.ref.kind==="note"&&!list.some((n:any)=>n.id===i.ref.id)).map((i:any)=>i.value)]);
          if (ctx) setRefs(ctx.refs);
        }
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);
  function select(kind: string, n: any, checked: boolean) {
    setRefs((rows) =>
      checked
        ? [
            ...rows,
            { kind, id: n.id, ...(n.revision ? { revision: n.revision } : {}) },
          ]
        : rows.filter((r) => r.kind !== kind || r.id !== n.id),
    );
    if (kind === "note") {
      setShare(false);
      setReviewed(false);
    }
  }
  const pickedNotes = notes.filter((n) =>
    refs.some((r) => r.kind === "note" && r.id === n.id),
  );
  const partial = pickedNotes.some((n) =>
    n.sources?.some((s: any) => s.coverage === "partial"),
  );
  const needsReview = pickedNotes.some((n) =>
    n.sources?.some((s: any) => s.needsReview),
  );
  const hasNotes = refs.some((r) => r.kind === "note");
  const available =
    data.settings.allowExternalAI &&
    data.capabilities.deepseek === "configured";
  const stillValid = refs.every((r) =>
    r.kind === "snapshot" || notes.some((n: any) => n.id === r.id),
  );
  async function submit() {
    setBusy(true);
    setError("");
    const body = {
      refs,
      shareNotes: share,
      reviewed,
      template: templateId,
      formats,
      prompt,
      slideCount: 8,
      duration: 45,
    };
    const signature = JSON.stringify(body);
    if (request.current.signature !== signature)
      request.current = { signature, key: uid() };
    try {
      const j = await post("/pipeline/start", body, request.current.key);
      go("deliver/" + j.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel pipeline-form">
      <h2>1. 选择素材</h2>
      <button className="btn secondary" onClick={()=>setPicker(true)}>从知识库或原始资料选择</button>
      <div className="pipeline-selected">{refs.map(r=><span key={r.kind+r.id}>{(r.kind==='note'?notes:data.snapshots).find((n:any)=>n.id===r.id)?.title||'已选资料'}<button aria-label="移除这份素材" onClick={()=>setRefs(rows=>rows.filter(x=>x.id!==r.id||x.kind!==r.kind))}>×</button></span>)}</div>
      {picker&&<ContextPicker selected={refs.filter(r=>r.kind==='note').map(r=>r.id)} snapshots={refs.filter(r=>r.kind==='snapshot').map(r=>r.id)}
        onChange={async(ids:string[])=>{setRefs(rows=>[...rows.filter(r=>r.kind!=='note'),...ids.map(id=>({kind:'note',id}))]);setShare(false);setReviewed(false);try{const loaded=await Promise.all(ids.map(id=>api('/notes/'+id)));setNotes(rows=>[...rows.filter(n=>!ids.includes(n.id)),...loaded]);}catch(e:any){setError(e.message);}}}
        onSnapshots={(ids:string[])=>setRefs(rows=>[...rows.filter(r=>r.kind!=='snapshot'),...ids.map(id=>({kind:'snapshot',id}))])} close={()=>setPicker(false)}/>}
      {refs.length>20&&<p role="alert">整套内容制作每次最多使用20份资料。可以分成多个任务制作，或先在对话中整理成一份知识。</p>}
      <small>已选 {refs.length} / 20 份</small>
      {hasNotes && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={share}
            onChange={(e) => setShare(e.target.checked)}
          />
          将所选笔记版本转为团队可见的创作素材
        </label>
      )}
      {needsReview && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          已对照原件核对笔记中的识别结果
        </label>
      )}
      {partial && (
        <p role="alert">有笔记只完成了部分识别，请先补全原件或移除该笔记。</p>
      )}
      <h2>2. 选择内容与文件</h2>
      <label className="field">
        制作类型
        <select
          value={templateId}
          onChange={(e) => {
            setTemplate(e.target.value);
            setFormats([e.target.value === "presentation" ? "pptx" : "docx"]);
          }}
        >
          {productionTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="wf-options">
        {options.map((f) => {
          const dynamic = f === "gif" || f === "mp4",
            checked = formats.includes(f);
          return (
            <label key={f}>
              <input
                type="checkbox"
                checked={checked}
                disabled={
                  busy ||
                  (!checked &&
                    !dynamic &&
                    formats.filter((k) => k !== "gif" && k !== "mp4").length >=
                      4)
                }
                onChange={(e) =>
                  setFormats(
                    e.target.checked
                      ? [...formats, f]
                      : formats.filter((k) => k !== f),
                  )
                }
              />
              {labels[f]}
            </label>
          );
        })}
      </div>
      <label className="field">
        制作要求（可选）
        <textarea
          aria-label="制作要求"
          rows={3}
          value={prompt}
          maxLength={10000}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={template.prompt}
        />
      </label>
      {formats.some((f) => f === "gif" || f === "mp4") && (
        <p className="help">先生成设计预览，核对后再导出动图或视频。</p>
      )}
      {!available && (
        <p className="notice">
          开始制作需要管理员在设置中连接并启用 DeepSeek。
          {data.user.role === "admin" && (
            <button className="text-link" onClick={() => go("settings")}>
              打开设置
            </button>
          )}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button
        className="btn"
        disabled={
          loading ||
          busy ||
          !available ||
          !refs.length || refs.length>20 ||
          !stillValid ||
          !formats.length ||
          partial ||
          (hasNotes && !share) ||
          (needsReview && !reviewed)
        }
        onClick={submit}
      >
        {busy ? "正在建立任务…" : "开始制作"}
      </button>
    </section>
  );
}
export function PipelineStudio({ data, go, id }: any) {
  return (
    <>
      <div className="page-heading">
        <h1>从素材制作</h1>
      </div>
      {id ? (
        <DeliveryProgress key={id} id={id} go={go} />
      ) : (
        <DeliveryForm data={data} go={go} />
      )}
    </>
  );
}
