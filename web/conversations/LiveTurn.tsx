import React from "react";
import { useJob, TaskProgress } from "../tasks/TaskProgress";
import { Answer } from "../Answer";
export function LiveTurn({ id }: any) {
  const { job } = useJob(id);
  if (!job) return null;
  const chunks = (job.events || []).filter((e: any) => e.type === "text.delta"),
    last = chunks.at(-1)?.payload.streamId;
  const text = chunks
    .filter((e: any) => e.payload.streamId === last)
    .map((e: any) => e.payload.text || "")
    .join("")
    .replace(/\x60\x60\x60(?:ecustudio-files|json)[\s\S]*$/, "");
  return (
    <div className="live-turn">
      <TaskProgress job={job} compact />
      {text && job.state !== "succeeded" && (
        <div className="stream-answer">
          <small>
            {["failed", "interrupted", "canceled"].includes(job.state)
              ? "未完成的回答片段"
              : "正在写入回答…"}
          </small>
          <Answer text={text} sources={[]} />
          {["queued", "running"].includes(job.state) && (
            <span className="typing-cursor" />
          )}
        </div>
      )}
    </div>
  );
}
