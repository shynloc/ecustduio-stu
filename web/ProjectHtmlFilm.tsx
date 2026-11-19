import { useState, useEffect, useRef } from "react";
import { api, post, upload } from "./api";
import { uid } from "./compat";
import { ChatAdaptation } from "./ChatAdaptation";

export function ProjectHtmlFilm({ projectId }: { projectId: string }) {
  const path = "/projects/" + projectId + "/html-films";
  const [data, setData] = useState<any>(null),
    [file, setFile] = useState<File | null>(null),
    [artifact, setArtifact] = useState(""),
    [url, setUrl] = useState(""),
    [sourceKind, setSourceKind] = useState("file");
  const [mode, setMode] = useState("original"),
    [aspect, setAspect] = useState("landscape"),
    [seconds, setSeconds] = useState(10),
    [narrated, setNarrated] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const key = useRef({ sig: "", id: "" }),
    alive = useRef(true);
  async function refresh() {
    const d = await api(path);
    if (alive.current) setData(d);
  }
  useEffect(() => {
    alive.current = true;
    refresh().catch((e) => alive.current && setError(e.message));
    return () => {
      alive.current = false;
    };
  }, [path]);
  const active = data?.jobs.some((j: any) =>
    ["queued", "running"].includes(j.state),
  );
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(
      () => refresh().catch((e) => setError(e.message)),
      900,
    );
    return () => clearInterval(timer);
  }, [active, path]);
  async function prepare() {
    setBusy(true);
    setError("");
    try {
      const ref = file
        ? { uploadId: (await upload(file, "/media/uploads")).id }
        : url.trim()
          ? { url: url.trim() }
          : { artifactId: artifact };
      const b = { ...ref, options: { mode, aspect, seconds, narrated } },
        sig = JSON.stringify(b);
      if (key.current.sig !== sig) key.current = { sig, id: uid() };
      await post(path, b, key.current.id);
      await refresh();
      key.current = { sig: "", id: "" };
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="panel wf-section"
      open={
        new URLSearchParams(location.hash.split("?")[1]).has("htmlFilm") ||
        undefined
      }
    >
      <summary>HTML 转视频</summary>
      <fieldset disabled={busy} className="wf-fields">
        <label>
          网页来源
          <select
            value={sourceKind}
            onChange={(e) => {
              setSourceKind(e.target.value);
              setFile(null);
              setArtifact("");
              setUrl("");
            }}
          >
            <option value="file">本地 HTML</option>
            <option value="url">公开网页地址</option>
            {data?.files.length > 0 && (
              <option value="project">项目已有 HTML</option>
            )}
          </select>
        </label>
        {sourceKind === "file" && (
          <label>
            HTML 文件
            <input
              type="file"
              aria-label="视频源 HTML"
              accept=".htm,.html"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        )}
        {sourceKind === "url" && (
          <label>
            公开网页地址
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
        )}
        {sourceKind === "project" && (
          <label>
            项目里的网页
            <select
              value={artifact}
              onChange={(e) => setArtifact(e.target.value)}
            >
              <option value="">选择已有 HTML</option>
              {data.files.map((f: any) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          画面方式
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="original">保留原网页</option>
            <option value="storyboard">重新编排分镜</option>
          </select>
        </label>
        <label>
          视频画幅
          <select value={aspect} onChange={(e) => setAspect(e.target.value)}>
            <option value="landscape">横屏 16:9</option>
            <option value="portrait">竖屏 9:16</option>
            <option value="square">方形 1:1</option>
          </select>
        </label>
        <label>
          时长（秒）
          <input
            type="number"
            min={1}
            max={600}
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={narrated}
            onChange={(e) => setNarrated(e.target.checked)}
          />
          生成逐段旁白并试听
        </label>
      </fieldset>
      <p className="muted">
        独立文件请内嵌资源；公开网页会保存静态依赖后离线渲染。长页面随时间滚动。
      </p>
      <button
        className="btn"
        disabled={
          busy ||
          (!file && !artifact && !url.trim()) ||
          seconds < 1 ||
          seconds > 600
        }
        onClick={prepare}
      >
        {busy ? "正在提交…" : "准备网页视频"}
      </button>
      {error && <p role="alert">{error}</p>}
      {data?.jobs
        .filter((j: any) => j.state !== "succeeded")
        .map((j: any) => (
          <div key={j.id} role="status">
            {j.error?.message || j.stage || "正在准备"}{" "}
            {["failed", "interrupted"].includes(j.state) && (
              <button
                onClick={async () => {
                  try {
                    await post("/jobs/" + j.id + "/retry");
                    await refresh();
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                重试准备
              </button>
            )}
          </div>
        ))}
      {data?.messages
        .filter((m: any) => m.context.adaptation?.html)
        .reverse()
        .map((m: any) => (
          <ChatAdaptation
            key={m.id}
            cid={data.cid}
            message={m}
            refresh={refresh}
          />
        ))}
    </details>
  );
}
