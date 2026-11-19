import React, { useCallback, useEffect, useState } from "react";
import { api, post } from "./api";

type Artifact = {
  id: string;
  name: string;
  format: string;
  mode: string;
  size: number;
  created_at: string;
  projectId?: string;
  projectTitle?: string;
  qualityCheck?: { structure?: string; visual?: string };
  sourceStatus?: unknown[];
  manifest?: { visualId?: string; conversationId?:string;messageId?:string;projectId?:string };
};

export function ArtifactLibrary({ go }: { go: (route: string) => void }) {
  const [files, setFiles] = useState<Artifact[]>([]),
    [selected, setSelected] = useState<string[]>([]);
  const [project, setProject] = useState(()=>new URLSearchParams(location.hash.split("?")[1]).get("project")||""),
    [format, setFormat] = useState(""),
    [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    const rows: Artifact[] = await api("/pipeline/artifacts");
    setFiles(rows);
    setSelected((ids) => ids.filter((id) => rows.some((a) => a.id === id)));
  }, []);
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [load]);
  async function refresh(bundle = false) {
    setBusy(true);
    setError("");
    try {
      if (bundle) {
        await post("/pipeline/bundle", { artifactIds: selected });
        setSelected([]);
        setQuery("");
        setProject("");
        setFormat("");
      }
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const projects = new Map(
    files.filter((a) => a.projectId).map((a) => [a.projectId!, a.projectTitle]),
  );
  const visible = files.filter(
    (a) =>
      (!project || a.projectId === project) &&
      (!format || a.format === format) &&
      (a.name + " " + a.format)
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <h1>成果库</h1>
        <button className="text-link" onClick={() => go("reports")}>
          查看监测日报
        </button>
      </div>
      <section className="panel pipeline-form">
        <div className="form-grid">
          <label className="field">
            查找成果
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="输入文件名称或格式"
            />
          </label>
          <label className="field">
            项目
            <select
              aria-label="按项目筛选"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">全部项目</option>
              {project && !projects.has(project) && <option value={project}>当前项目</option>}
              {Array.from(projects, ([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            格式
            <select
              aria-label="按格式筛选"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="">全部格式</option>
              {[...new Set(files.map((a) => a.format))].sort().map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="button-row">
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => refresh()}
          >
            刷新成果
          </button>
          <button
            className="btn"
            disabled={busy || !selected.length}
            onClick={() => refresh(true)}
          >
            打包所选 {selected.length} 项
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        {!visible.length && !error && (
          <p role="status">
            {busy
              ? "正在读取成果…"
              : files.length
                ? "没有符合筛选条件的成果。"
                : "完成制作的文件会显示在这里。"}
          </p>
        )}
        {!busy && !files.length && !error && (
          <button className="text-link" onClick={() => go("library")}>
            开始内容创作
          </button>
        )}
        <div className="pipeline-artifacts">
          {visible.map((a) => (
            <article key={a.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  disabled={
                    busy || (!selected.includes(a.id) && selected.length >= 50)
                  }
                  onChange={(e) =>
                    setSelected((ids) =>
                      e.target.checked
                        ? [...ids, a.id]
                        : ids.filter((id) => id !== a.id),
                    )
                  }
                />
                {a.name}
              </label>
              <small>
                {[
                  a.projectTitle,
                  a.mode === "release" ? "可发布版本" : "研究草稿",
                  a.qualityCheck?.structure === "passed" ? "结构已检查" : "",
                  a.qualityCheck?.visual === "unverified"
                    ? "视觉未验证"
                    : a.qualityCheck?.visual === "rendered_not_reviewed"
                      ? "已渲染，待人工看版"
                      : "",
                  new Date(a.created_at).toLocaleString("zh-CN"),
                  Math.ceil(a.size / 1024) + " KB",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
              <div>
                <a href={"/api/artifacts/" + a.id + "/download"}>
                  下载 {a.format.toUpperCase()}
                </a>
                {a.manifest?.projectId && a.manifest?.conversationId && <button className="text-link" onClick={()=>go("project/"+a.manifest!.projectId+"?htmlFilm=1")}>打开来源项目</button>}
                {a.manifest?.conversationId && !a.manifest?.projectId && <button className="text-link" onClick={()=>go("explore/"+a.manifest!.conversationId+"?file="+encodeURIComponent(a.id)+(a.manifest!.messageId?"&message="+encodeURIComponent(a.manifest!.messageId):""))}>打开来源对话</button>}
                {a.manifest?.visualId && (
                  <button
                    className="text-link"
                    onClick={() => go("visual/" + a.manifest!.visualId)}
                  >
                    预览与编辑
                  </button>
                )}
                {!!a.sourceStatus?.length && (
                  <span className="notice warning">
                    来源已变化或待复核 · 历史文件保留
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
