import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { post } from "./api";

export function ConversationFiles({ conversationId, message, reload }: any) {
  const [format, setFormat] = useState("docx"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const files = message.context.artifacts || [],
    jobs = message.context.fileJobs || [];
  const active = jobs.find(
    (j: any) =>
      j.format === format &&
      !["failed", "partial", "interrupted", "canceled"].includes(j.state),
  );
  async function generate(retryId?: string) {
    setBusy(true);
    setError("");
    try {
      if (retryId) await post("/jobs/" + retryId + "/retry");
      else
        await post(
          "/conversations/" +
            conversationId +
            "/messages/" +
            message.id +
            "/files",
          { format },
        );
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="conversation-files" aria-label="本条回答的文件">
      {files.map((f: any) => (
        <div key={f.id} className="button-row">
        <a
          key={f.id}
          className="chat-file"
          href={"/api/artifacts/" + f.id + "/download"}
          download
        >
          <FileText size={19} />
          <span>{f.name}</span>
          <Download size={16} />
        </a>
        {["html","pdf","md"].includes(f.format) && <a className="text-link" href={"/api/artifacts/"+f.id+"/download?preview=1"} target="_blank" rel="noreferrer">预览 {f.format.toUpperCase()}</a>}
        </div>
      ))}
      {jobs
        .filter((j: any) => !files.some((f: any) => f.format === j.format))
        .map((j: any) => (
          <p key={j.id} role="status">
            {j.format.toUpperCase()} ·{" "}
            {j.error?.message ||
              (
                {
                  queued: "等待生成",
                  running: "正在生成",
                  interrupted: "上次生成中断",
                  failed: "生成失败",
                  canceled: "已取消",
                } as any
              )[j.state] ||
              j.state}
            {["failed", "partial", "interrupted"].includes(j.state) && (
              <button
                className="text-link"
                disabled={busy}
                onClick={() => generate(j.id)}
              >
                继续生成
              </button>
            )}
          </p>
        ))}
      <details>
        <summary>把这条回答保存为文件</summary>
        <div className="button-row">
          <select
            aria-label="回答文件格式"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            {Object.entries({
              docx: "Word 文档",
              pptx: "可编辑 PPT",
              pdf: "PDF",
              md: "Markdown",
              html: "网页",
            }).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <button
            className="btn secondary"
            disabled={
              busy || !!active || files.some((f: any) => f.format === format)
            }
            onClick={() => generate()}
          >
            生成文件
          </button>
        </div>
      </details>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
