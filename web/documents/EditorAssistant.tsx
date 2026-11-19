import React, { useState, useEffect, useRef } from "react";
import { Sparkles, X } from "lucide-react";
import { post, api } from "../api";
import { Answer } from "../Answer";
import { TaskProgress, useJob } from "../tasks/TaskProgress";
import { EditorIconButton } from "../EditorIconButton";

export function EditorAssistant({ editor, onClose }: any) {
  const original = useRef({
    from: editor.state.selection.from,
    to: editor.state.selection.to,
    text: editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      "\n",
    ),
  });
  const [intent, setIntent] = useState("改写得更清楚"),
    [jobId, setJobId] = useState(""),
    [conversation, setConversation] = useState(""),
    [answer, setAnswer] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const { job } = useJob(jobId);
  useEffect(() => {
    if (job?.state === "succeeded" && conversation)
      api("/conversations/" + conversation)
        .then((c) =>
          setAnswer(
            c.messages.filter((m: any) => m.role === "assistant").at(-1)
              ?.content || "",
          ),
        )
        .catch((e) => setError(e.message));
  }, [job?.state, conversation]);
  async function generate() {
    setBusy(true);
    setError("");
    try {
      if (!original.current.text.trim())
        throw new Error("请先选中需要修改的文字");
      if (original.current.text.length > 8000)
        throw new Error("这段文字较长，请选择一部分修改，或将整篇带入 AI 对话");
      const c = await post("/conversations", {
        title: "正文修改 · " + original.current.text.slice(0, 35),
      });
      setConversation(c.id);
      const j = await post("/conversations/" + c.id + "/messages", {
        prompt:
          "请" +
          intent +
          "下面的文字。忠实保留事实、数字与引用，不新增未经依据的信息。仅返回修改后的正文，不要前言和解释。\n\n原文：\n" +
          original.current.text,
        mode: "local",
        noteIds: [],
      });
      setJobId(j.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function accept() {
    const o = original.current;
    if (editor.state.doc.textBetween(o.from, o.to, "\n") !== o.text) {
      setError("原段落已经修改。请重新选择文字生成建议，避免覆盖你的新内容。");
      return;
    }
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: o.from, to: o.to },
        editor.markdown.parse(answer).content,
      )
      .run();
    onClose();
  }
  return (
    <section className="editor-assistant">
      <div className="section-head">
        <h3>
          <Sparkles size={17} />
          修改选中的文字
        </h3>
        <EditorIconButton icon={X} label="收起 AI 修改" onClick={onClose} />
      </div>
      <p className="muted">
        先看修改建议，再决定是否替换；可撤销。任务也会保存在 AI 对话中。
      </p>
      <select
        aria-label="修改方式"
        value={intent}
        onChange={(e) => setIntent(e.target.value)}
      >
        {[
          "改写得更清楚",
          "缩短篇幅",
          "扩写解释但不编造事实",
          "纠正错别字和语病",
          "整理为表格",
        ].map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
      <button
        className="btn"
        disabled={busy || ["queued", "running"].includes(job?.state)}
        onClick={generate}
      >
        生成修改建议
      </button>
      {job && <TaskProgress job={job} compact />}
      {error && <p role="alert">{error}</p>}
      {answer && (
        <>
          <div className="editor-comparison">
            <div>
              <small>修改前</small>
              <Answer text={original.current.text} />
            </div>
            <div>
              <small>修改建议</small>
              <Answer text={answer} />
            </div>
          </div>
          <button className="btn" onClick={accept}>
            接受这次修改
          </button>
        </>
      )}
      {conversation && (
        <a href={"#explore/" + conversation}>打开本次修改对话</a>
      )}
    </section>
  );
}
