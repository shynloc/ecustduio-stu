import {readContext} from './context';
import React, { useState, useRef, useEffect } from "react";
import {
  BrainCircuit,
  ArrowRight,
  FileText,
  Plus,
  Play,
  CheckCircle2,
} from "lucide-react";
import { productionTemplates } from "../shared/production";
import { post } from "./api";
import { uid } from "./compat";
import {creationDefaults} from '../shared/creation';
export function Production({ data, act, go, templateId }: any) {
  const template =
    productionTemplates.find((t) => t.id === templateId) ||
    productionTemplates[0];
  const [target, setTarget] = useState("new"),
    [title, setTitle] = useState(template.name + " · 新项目"),
    [scope, setScope] = useState<any>({
      domain:'general',
      region: "不限地区",
      district: "",
      stage: "综合",
      year: new Date().getFullYear(),
      audience: "相关读者",
    }),
    [ids, setIds] = useState<string[]>([]),
    [prompt, setPrompt] = useState<string>(template.prompt),
    [duration, setDuration] = useState(90),
    [slides, setSlides] = useState(10),
    [minutes, setMinutes] = useState(20),
    [character, setCharacter] = useState(""),
    [formats, setFormats] = useState<string[]>([
      template.id === "presentation" ? "pptx" : "docx",
    ]),
    [sending, setSending] = useState(false),
    [error, setError] = useState("");
  const requestKey = useRef(uid()),
    project = data.projects.find((p: any) => p.id === target),
    selectedIds = project?.snapshotIds || ids;
  const configured = data.capabilities.deepseek === "configured",
    allowed = data.settings.allowExternalAI;
  useEffect(() => {
    let active=true;readContext().then(c=>{if(!active||!c)return;const sources=c.items.filter((i:any)=>i.ref.kind==='snapshot').map((i:any)=>i.value),project=c.items.find((i:any)=>i.ref.kind==='project');if(project)setTarget(project.value.id);if(sources.length){setIds(sources.map((s:any)=>s.id));const d=creationDefaults(sources,template.name);if(d){setScope(d.scope);setTitle(d.title);}}}).catch(e=>active&&setError(e.message));return()=>{active=false;};
  }, []);
  const chooseSources=(next:string[])=>{setIds(next);const suggestion=creationDefaults(data.snapshots.filter((s:any)=>next.includes(s.id)),template.name);if(suggestion){setTitle(suggestion.title);setScope(suggestion.scope);}};
  const field = (label: string, child: any) => (
    <label className="field">
      <span>{label}</span>
      {React.cloneElement(child, { "aria-label": label })}
    </label>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">FROM MATERIAL TO DELIVERABLE</span>
          <h1>制作{template.name}</h1>
          <p>
            选好资料和要求，工作台 Agent 将依次完成研究、母稿、内容与文件制作。
          </p>
        </div>
        <button className="btn secondary" onClick={() => go("library")}>
          返回内容创作
        </button>
      </div>
      <div className="production-steps">
        {[
          "提取候选事实",
          "生成母稿",
          "制作" + template.name,
          "生成下载文件",
        ].map((s, i) => (
          <div key={s}>
            <span>{i + 1}</span>
            {s}
            {i < 3 && <ArrowRight size={14} />}
          </div>
        ))}
      </div>
      <form
        className="production-layout"
        onSubmit={async (e) => {
          e.preventDefault();
          if (sending) return;
          setSending(true);
          setError("");
          const payload: any = {
            template: template.id,
            title: project?.title || title,
            scope: project?.scope || scope,
            snapshotIds: selectedIds,
            prompt,
            duration,
            slideCount: slides,
            lectureMinutes: minutes,
            formats,
            ...(project
              ? { projectId: project.id, expectedRevision: project.revision }
              : {}),
            ...(character ? { characterId: character } : {}),
          };
          try {
            const job = await act(
              () => post("/production", payload, requestKey.current),
              "制作任务已启动",
            );
            if (job) go("job/" + job.id);
            else requestKey.current = uid();
          } catch (e: any) {
            setError(e.message);
            requestKey.current = uid();
          } finally {
            setSending(false);
          }
        }}
      >
        <section className="panel note-editor">
          <h2>1. 选择项目与资料</h2>
          {field(
            "创作项目",
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="new">新建项目并制作</option>
              {data.projects
                .filter((p: any) => !p.archived)
                .map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </select>,
          )}
          {project ? (
            <div className="notice">
              <FileText size={17} />
              <div>
                使用项目的 {project.snapshotIds.length}{" "}
                份资料。本次会生成新的母稿与内容版本，历史版本保留。
                <p>
                  {project.scope.region} · {project.scope.district} ·{" "}
                  {project.scope.year} · {project.scope.stage}
                </p>
              </div>
            </div>
          ) : (
            <>
              {field(
                "项目名称",
                <input
                  required
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />,
              )}
              <div className="form-grid">
                {field('创作领域',<select value={scope.domain||'policy'} onChange={e=>setScope({...scope,domain:e.target.value})}><option value="teaching">教学内容</option><option value="policy">政策研究</option><option value="general">通用创作</option></select>)}
                {field(
                  "地区",
                  <input
                    required
                    value={scope.region}
                    onChange={(e) =>
                      setScope({ ...scope, region: e.target.value })
                    }
                  />,
                )}
                {field(
                  "区县",
                  <input
                    value={scope.district}
                    onChange={(e) =>
                      setScope({ ...scope, district: e.target.value })
                    }
                  />,
                )}
                {field(
                  "年度",
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    value={scope.year}
                    onChange={(e) =>
                      setScope({ ...scope, year: Number(e.target.value) })
                    }
                  />,
                )}
                {field(
                  "学段",
                  <select
                    value={scope.stage}
                    onChange={(e) =>
                      setScope({ ...scope, stage: e.target.value })
                    }
                  >
                    <option>中考</option>
                    <option>高考</option>
                    <option>综合</option>
                  </select>,
                )}
                {field(
                  "目标受众",
                  <input
                    required
                    value={scope.audience}
                    onChange={(e) =>
                      setScope({ ...scope, audience: e.target.value })
                    }
                  />,
                )}
              </div>
              <fieldset className="production-sources">
                <legend>制作资料（最多20份）</legend>
                {data.snapshots.map((s: any) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
                      checked={ids.includes(s.id)}
                      disabled={!ids.includes(s.id) && ids.length >= 20}
                      onChange={(e) =>
                        chooseSources(
                          e.target.checked
                            ? [...ids, s.id]
                            : ids.filter((v) => v !== s.id),
                        )
                      }
                    />
                    <span>
                      {s.title}
                      <small>
                        {s.publisher} · {s.scope.year} · {s.document_type}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
              {!!ids.length&&<p className="help">已从所选资料带入标题和适用范围；正文将由 Agent 自动提取并制作。下方字段可按实际用途调整。</p>}
            </>
          )}
          {!selectedIds.length && (
            <div className="notice warning">
              <p>
                先导入一份原文或 OCR
                资料，也可以在创作笔记中选择「作为创作素材」。
              </p>
              <button
                type="button"
                className="text-link"
                onClick={() => go("input")}
              >
                前往导入资料 <ArrowRight size={14} />
              </button>
              <button
                type="button"
                className="text-link"
                onClick={() => go("notes")}
              >
                从创作笔记选素材
              </button>
            </div>
          )}
          <h2>2. 确认制作要求</h2>
          {field(
            "制作要求",
            <textarea
              rows={5}
              maxLength={10000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />,
          )}
          <div className="form-grid">
            {["speech", "storyboard"].includes(template.id) &&
              field(
                "目标时长（秒）",
                <input
                  type="number"
                  min={10}
                  max={7200}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />,
              )}
            {template.id === "presentation" && (
              <>
                {field(
                  "PPT页数",
                  <input
                    type="number"
                    min={3}
                    max={60}
                    value={slides}
                    onChange={(e) => setSlides(Number(e.target.value))}
                  />,
                )}
                {field(
                  "讲座时长（分钟）",
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                  />,
                )}
              </>
            )}
            {["speech", "storyboard"].includes(template.id) &&
              field(
                "角色模板",
                <select
                  value={character}
                  onChange={(e) => setCharacter(e.target.value)}
                >
                  <option value="">不使用角色模板</option>
                  {data.characters.map((c: any) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>,
              )}
          </div>
        </section>
        <aside className="panel note-editor production-summary">
          <BrainCircuit size={28} />
          <h2>在工作台内完成制作</h2>
          <p>{template.description}</p>
          <h3>3. 选择成果文件</h3>
          <div className="format-choices">
            {template.formats.map((f) => (
              <label key={f}>
                <input
                  type="checkbox"
                  checked={formats.includes(f)}
                  onChange={(e) =>
                    setFormats(
                      e.target.checked
                        ? [...formats, f]
                        : formats.filter((v) => v !== f),
                    )
                  }
                />
                {f.toUpperCase()}
                {template.id === "presentation" && f === "pdf"
                  ? "（讲义）"
                  : ""}
              </label>
            ))}
          </div>
          <small className="muted">
            {template.id === "storyboard"
              ? "本任务生成文字分镜和画面提示，不生成成片。"
              : "文件生成后可直接下载，并进入创作项目继续编辑。"}
          </small>
          <div className="notice">
            <CheckCircle2 size={17} />
            <span>
              自动提取的事实保持待核实，生成文件为研究草稿，不自动发布。
            </span>
          </div>
          {(!configured || !allowed) && (
            <div className="notice warning">
              <p>
                {!configured
                  ? "请管理员先配置 DeepSeek 凭证。"
                  : "请管理员先开启 DeepSeek 调用授权。"}
              </p>
              <button
                type="button"
                className="text-link"
                onClick={() => go("settings")}
              >
                查看模型设置
              </button>
            </div>
          )}
          <p className="muted">
            最多3个 AI 阶段，每阶段遵循管理员的模型请求与工具预算；整体超时{" "}
            {data.settings.timeoutSeconds}{" "}
            秒。关闭页面后后台继续，任务页可取消或重试。
          </p>
          {error && <p role="alert">{error}</p>}
          <button
            className="btn"
            type="submit"
            disabled={
              sending ||
              !configured ||
              !allowed ||
              !selectedIds.length ||
              !formats.length
            }
          >
            <Play size={16} />
            {sending ? "正在启动…" : "开始制作并生成文件"}
          </button>
        </aside>
      </form>
    </>
  );
}
