import { err } from "./db.js";
export type StreamListener = (event: {
  text?: string;
  usage?: any;
  streamId: string;
}) => void;
// Reassembles the provider protocol on the server. Only visible answer deltas leave this module.
export async function readCompletionStream(
  response: Response,
  signal: AbortSignal,
  listener?: StreamListener,
) {
  const reader = response.body?.getReader();
  if (!reader) err("MODEL_STREAM_EMPTY", "连接未返回内容，请重试", 502);
  const decoder = new TextDecoder(),
    message: any = { role: "assistant", content: "" },
    tools = new Map<number, any>();
  const streamId = crypto.randomUUID();
  let buffer = "",
    done = false,
    finished = false,
    pending = "",
    last = Date.now(),
    size = 0;
  const result: any = { choices: [{ message, finish_reason: null }] };
  const flush = () => {
    if (pending) {
      listener?.({ text: pending, streamId });
      pending = "";
      last = Date.now();
    }
  };
  function accept(raw: string) {
    if (raw === "[DONE]") {
      done = true;
      flush();
      return;
    }
    let packet: any;
    try {
      packet = JSON.parse(raw);
    } catch {
      err(
        "MODEL_STREAM_INVALID",
        "回答传输不完整，请重试；已收到的片段会保留",
        502,
      );
    }
    if (packet.error)
      err(
        "MODEL_STREAM_FAILED",
        "DeepSeek 中断了本次回答，请重试；已收到的片段会保留",
        502,
      );
    if (packet.model) result.model = packet.model;
    if (packet.id) result.id = packet.id;
    if (packet.usage) {
      result.usage = packet.usage;
      listener?.({ usage: packet.usage, streamId });
    }
    const c =
      packet.choices?.find((v: any) => v.index === 0) ?? packet.choices?.[0];
    if (!c) return;
    if (c.finish_reason) {
      result.choices[0].finish_reason = c.finish_reason;
      finished = true;
    }
    const d = c.delta || c.message || {};
    if (typeof d.content === "string") {
      message.content += d.content;
      pending += d.content;
      if (pending.length >= 96 || Date.now() - last >= 180) flush();
    }
    for (const key of ["reasoning_content", "title"])
      if (typeof d[key] === "string")
        message[key] = (message[key] || "") + d[key];
    if (d.refusal) message.refusal = d.refusal;
    for (const call of d.tool_calls || []) {
      const index = call.index ?? 0,
        t = tools.get(index) || {
          id: "",
          type: "function",
          function: { name: "", arguments: "" },
        };
      if (call.id) t.id = call.id;
      if (call.type) t.type = call.type;
      for (const k of ["name", "arguments"])
        if (call.function?.[k]) t.function[k] += call.function[k];
      tools.set(index, t);
    }
    // Native tools are complete signed records, passed back unchanged.
    for (const k of ["server_tool_calls", "annotations"])
      if (Array.isArray(d[k])) message[k] = [...(message[k] || []), ...d[k]];
  }
  try {
    while (!done) {
      signal.throwIfAborted();
      const chunk = await reader!.read().catch(() => {
        signal.throwIfAborted();
        return err("MODEL_STREAM_TRANSPORT", "模型连接中断，未收到完整回答", 502);
      });
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 16 * 1024 * 1024)
        err("MODEL_STREAM_LIMIT", "回答超过工作台接收上限，请缩小任务", 422);
      buffer += decoder.decode(chunk.value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const lines = block
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""));
        if (lines.length) accept(lines.join("\n"));
        if (done) break;
      }
    }
    if (!done || !finished)
      err(
        "MODEL_STREAM_INTERRUPTED",
        "回答连接已中断；已收到的内容只是片段，可重试此轮",
        502,
      );
  } finally {
    flush();
    await reader!.cancel().catch(() => {});
  }
  if (tools.size)
    message.tool_calls = [...tools.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, t]) => t);
  return result;
}
