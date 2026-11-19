import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  LoaderCircle,
  AlertCircle,
  RefreshCw,
  Square,
  Clock,
} from "lucide-react";
import { api, post } from "../api";

export const activeJob = (state: string) =>
  ["queued", "running"].includes(state);
export function useJob(id?: string) {
  const [job, setJob] = useState<any>(null),
    [error, setError] = useState("");
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const refresh = (e: any) => {
      if (e.detail === id) setEpoch((n) => n + 1);
    };
    window.addEventListener("ecu-job-refresh", refresh);
    return () => window.removeEventListener("ecu-job-refresh", refresh);
  }, [id]);
  useEffect(() => {
    setJob(null);
    setError("");
    if (!id) return;
    let live = true,
      stream: EventSource | undefined,
      timer: ReturnType<typeof setInterval>;
    const read = async () => {
      try {
        const j = await api("/jobs/" + id);
        if (!live) return;
        setJob(j);
        setError("");
        if (!activeJob(j.state)) {
          stream?.close();
          clearInterval(timer);
        }
        return j;
      } catch (e: any) {
        if (live) setError(e.message);
      }
    };
    read().then((j) => {
      if (!live || !j || !activeJob(j.state)) return;
      stream = new EventSource(
        "/api/jobs/" +
          encodeURIComponent(id) +
          "/events?after=" +
          (j.events?.at(-1)?.seq || 0),
      );
      stream.onmessage = (e) => {
        if (!live) return;
        try {
          const payload = JSON.parse(e.data),
            seq = Number(e.lastEventId.split(":").at(-1));
          setJob((prior: any) => {
            if (!prior || prior.events?.some((v: any) => v.seq === seq))
              return prior;
            return {
              ...prior,
              state: payload.state || prior.state,
              stage: payload.stage || prior.stage,
              events: [
                ...(prior.events || []),
                {
                  seq,
                  type: payload.type,
                  payload,
                  created_at: new Date().toISOString(),
                },
              ],
            };
          });
          if (payload.state && !activeJob(payload.state)) void read();
        } catch {
          void read();
        }
      };
      timer = setInterval(read, 8000);
    });
    return () => {
      live = false;
      stream?.close();
      clearInterval(timer);
    };
  }, [id, epoch]);
  return { job, error };
}

export function TaskProgress({
  job: provided,
  id,
  onComplete,
  onRetry,
  compact = false,
}: any) {
  const remote = useJob(provided ? undefined : id),
    job = provided || remote.job;
  const [tick, setTick] = useState(Date.now()),
    [issue, setIssue] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!job || !activeJob(job.state)) return;
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [job?.id, job?.state]);
  useEffect(() => {
    if (job?.state === "succeeded") onComplete?.(job);
  }, [job?.id, job?.state]);
  if (!job)
    return (
      <p role="status">
        <LoaderCircle className="spin" size={16} />{" "}
        {remote.error || "正在读取任务进度…"}
      </p>
    );
  const running = activeJob(job.state),
    done = job.state === "succeeded",
    events = (job.events || []).filter(
      (e: any) => e.type !== "text.delta" && e.payload?.message,
    ),
    last = events.at(-1),
    progress = [...(job.events || [])]
      .reverse()
      .find((e: any) => e.payload?.total > 0)?.payload;
  const completed =
      progress?.completed ?? progress?.current ?? progress?.page ?? 0,
    total = progress?.total;
  const elapsed = Math.max(
    0,
    Math.round(
      ((running
        ? tick
        : Date.parse(job.finished_at || job.updated_at || job.created_at)) -
        Date.parse(job.created_at)) /
        1000,
    ),
  );
  async function action(verb: string) {
    setBusy(true);
    try {
      const j = await post("/jobs/" + job.id + "/" + verb);
      onRetry?.(j);
      window.dispatchEvent(
        new CustomEvent("ecu-job-refresh", { detail: job.id }),
      );
    } catch (e: any) {
      setIssue(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={"task-progress " + (compact ? "compact " : "") + job.state}
      aria-label="任务进度"
      aria-live="polite"
    >
      <div className="task-progress-title">
        {running ? (
          <LoaderCircle className="spin" size={22} />
        ) : done ? (
          <CheckCircle2 size={22} />
        ) : (
          <AlertCircle size={22} />
        )}
        <div>
          <strong>
            {done
              ? "已完成"
              : job.state === "queued"
                ? "任务已排队"
                : running
                  ? last?.payload?.message || "正在处理资料"
                  : job.state === "canceled"
                    ? "任务已取消"
                    : "需要处理一下"}
          </strong>
          <small>
            {job.error?.message ||
              (!running && !done
                ? last?.payload?.message
                : "离开页面后仍可在任务中心找到这项工作")}
          </small>
        </div>
      </div>
      {running &&
        (total ? (
          <>
            <progress max={total} value={Math.min(total, completed)} />
            <small>
              已完成 {completed} / {total} {progress.unit || "项"}
            </small>
          </>
        ) : (
          <div className="task-indeterminate" aria-label="正在处理中">
            <span />
          </div>
        ))}
      {!compact && (
        <ol className="task-stages">
          {events
            .filter(
              (e: any, i: number, a: any[]) =>
                i === 0 || e.payload.message !== a[i - 1].payload.message,
            )
            .slice(-5)
            .map((e: any, i: number, a: any[]) => (
              <li
                key={e.seq}
                className={i === a.length - 1 && running ? "current" : ""}
              >
                {i === a.length - 1 && running ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                <span>{e.payload.message}</span>
              </li>
            ))}
        </ol>
      )}
      <div className="task-progress-footer">
        <small>
          <Clock size={13} /> 已用时{" "}
          {elapsed < 60
            ? elapsed + " 秒"
            : Math.floor(elapsed / 60) + " 分 " + (elapsed % 60) + " 秒"}
        </small>
        <div>
          {running && (
            <button
              className="text-link"
              disabled={busy}
              onClick={() => action("cancel")}
            >
              <Square size={14} />
              停止
            </button>
          )}
          {["failed", "interrupted", "partial"].includes(job.state) && (
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => action("retry")}
            >
              <RefreshCw size={14} />
              重试未完成部分
            </button>
          )}
          <a href={"#job/" + job.id}>查看任务详情</a>
        </div>
      </div>
      {(issue || remote.error) && <p role="alert">{issue || remote.error}</p>}
      {job.error?.message?.match(/配置|凭证|允许.*调用/) && (
        <a href="#settings">前往设置，检查连接与调用许可</a>
      )}
    </section>
  );
}
