import { OfficePages } from "./OfficePages";
import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { post } from "./api";

export function ConversationFiles({
  conversationId,
  message,
  reload,
  revise,
  derive,
  allFiles,
}: any) {
  const [format, setFormat] = useState("docx"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const files = message.context.artifacts || [],
    jobs = message.context.fileJobs || [];
  const [preview, setPreview] = useState<any>(null);
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
        <div key={f.id} id={"chat-file-"+f.id} tabIndex={-1} className="button-row">
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
          {["docx", "pptx"].includes(f.format) && (
            <button className="text-link" onClick={() => setPreview(f)}>
              预览 {f.format.toUpperCase()}
            </button>
          )}
          <button
            className="text-link"
            aria-label={"修改这份 " + (f.title || f.name)}
            onClick={() => revise(f)}
          >
            修改这份
          </button>
          <button className="text-link" aria-label={"转公众号文章 "+(f.title||f.name)} onClick={()=>derive(f,"wechat")}>转公众号文章</button>
          <button className="text-link" aria-label={"做配音视频 "+(f.title||f.name)} onClick={()=>derive(f,"video")}>做配音视频</button>
          <small>第 {f.version || 1} 版</small>
          {f.previousId &&
            allFiles.get(f.previousId) &&
            (["docx", "pptx"].includes(f.format) ? (
              <button
                className="text-link"
                onClick={() => setPreview(allFiles.get(f.previousId))}
              >
                查看上一版
              </button>
            ) : (
              <a href={"/api/artifacts/" + f.previousId + "/download"}>
                下载上一版
              </a>
            ))}
          {["html", "pdf", "md"].includes(f.format) && (
            <a
              className="text-link"
              href={"/api/artifacts/" + f.id + "/download?preview=1"}
              target="_blank"
              rel="noreferrer"
            >
              预览 {f.format.toUpperCase()}
            </a>
          )}
        </div>
      ))}
      {preview && (
        <OfficePages
          key={preview.id}
          conversationId={conversationId}
          file={preview}
          onClose={() => setPreview(null)}
        />
      )}
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
