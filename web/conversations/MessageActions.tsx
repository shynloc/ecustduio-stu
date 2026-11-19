import React, { useState } from "react";
import {
  Copy,
  BookOpen,
  Volume2,
  Presentation,
  FileText,
  Globe,
  Film,
  Image,
  PenLine,
  Mail,
} from "lucide-react";
import { post } from "../api";
import { carry } from "../context";
export function MessageActions({
  message,
  conversationId,
  go,
  onPrompt,
  reload,
}: any) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  async function run(name: string, fn: () => Promise<any>) {
    setBusy(name);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  const save = async () => {
    const n = await post("/notes/from-message", { messageId: message.id });
    setStatus("已保存到知识库");
    return n;
  };
  async function make(format: string) {
    await post(
      "/conversations/" + conversationId + "/messages/" + message.id + "/files",
      { format },
    );
    await reload();
    setStatus("已开始制作，可在这条回答下查看");
  }
  return (
    <>
      <div
        className="message-actions unified-message-actions"
        role="toolbar"
        aria-label="使用这条回答"
      >
        <button
          className="btn secondary"
          disabled={!!busy}
          onClick={() =>
            run("copy", async () => {
              await navigator.clipboard.writeText(message.content);
              setStatus("已复制");
            })
          }
        >
          <Copy size={15} />
          复制
        </button>
        <button
          className="btn secondary"
          disabled={!!busy}
          onClick={() => run("note", save)}
        >
          <BookOpen size={15} />
          存入知识库
        </button>
        <button
          className="btn secondary"
          disabled={!!busy}
          onClick={() =>
            run("write", async () => {
              const n = await save();
              go("notes/" + n.id);
            })
          }
        >
          <PenLine size={15} />
          继续编辑
        </button>
        {(
          [
            ["pptx", "PPT", Presentation],
            ["docx", "Word", FileText],
            ["pdf", "PDF", FileText],
            ["html", "网页", Globe],
          ] as const
        ).map(([format, label, Icon]) => (
          <button
            className="btn secondary"
            key={format}
            disabled={!!busy}
            onClick={() => run(format, () => make(format))}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
        <button
          className="btn secondary"
          disabled={!!busy}
          onClick={() =>
            run("speech", () =>
              carry(
                go,
                "speech",
                [{ kind: "message", id: message.id }],
                "speech",
              ),
            )
          }
        >
          <Volume2 size={15} />
          配音
        </button>
        <button
          className="btn secondary"
          onClick={() =>
            onPrompt(
              "把上面这条回答制作成公众号文章，保留来源并给出合适的小标题。",
            )
          }
        >
          <Mail size={15} />
          公众号
        </button>
        <button
          className="btn secondary"
          onClick={() =>
            onPrompt("把上面这条回答做成 HTML 演示网页，之后制作带配音视频。")
          }
        >
          <Film size={15} />
          视频
        </button>
        <button
          className="btn secondary"
          disabled={!!busy}
          onClick={() =>
            run("gif", async () => {
              const n = await save();
              await carry(
                (route: string) => go(route + "&format=gif"),
                "deliver",
                [{ kind: "note", id: n.id }],
                "production",
              );
            })
          }
        >
          <Image size={15} />
          动图
        </button>
      </div>
      {status && <small role="status">{status}</small>}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
