import { z } from "zod";
import { exportFile } from "./exports.js";
import { err, get, now, requireRow } from "./db.js";

export const chatFileFormat = z.enum(["docx", "pptx", "pdf", "md", "html"]);
const chatFormats = z
  .array(chatFileFormat)
  .min(1)
  .max(5)
  .refine((values) => new Set(values).size === values.length, "文件格式重复");
const FilePlan = z
  .object({ title: z.string().trim().min(1).max(120), formats: chatFormats })
  .strict();
export const FileCall = FilePlan.extend({
  content: z.string().trim().min(1).max(100000),
});
export const fileTool = {
  type: "function",
  function: {
    name: "deliver_files",
    description:
      "用本轮创作的完整正文生成当前对话的可下载文件。同一份内容可交付多种格式，PPT 用二级标题划分页。如果用户要不同用途的独立文件，最后一轮可为每份成稿分别调用本工具。",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        formats: {
          type: "array",
          items: {
            type: "string",
            enum: ["docx", "pptx", "pdf", "md", "html"],
          },
        },
        content: {
          type: "string",
          description: "完整成稿，保留真实来源编号，按章节或幻灯片组织。",
        },
      },
      required: ["title", "formats", "content"],
      additionalProperties: false,
    },
  },
};
export const fileInstructions =
  '用户索要文件、演示稿、讲义、网页或要求修改前一版时，直接创作可用成稿并交付，不要指导用户自行制作。可用 deliver_files 时优先调用；否则写出完整正文，末尾独占一行附 :::ecustudio-files {"title":"文件标题","formats":["pptx"]}。支持 docx、pptx、pdf、md、html。每页演示用 ## 标题另起一节。普通提问直接回答。文件由工作台在本对话生成，引用仍用本轮真实来源编号。';

export function extractFilePlan(text: string) {
  const marker = text.match(/(?:^|\n):::ecustudio-files[ \t]+([^\n]+)\s*$/);
  if (!marker) return { text };
  let plan: z.infer<typeof FilePlan>;
  try {
    plan = FilePlan.parse(JSON.parse(marker[1]));
  } catch {
    return err("INVALID_DELIVERY", "文件交付说明格式错误，请重试本轮", 422);
  }
  const content = text.slice(0, marker.index).trim();
  if (!content) return err("EMPTY_DELIVERY", "未收到可生成文件的正文", 422);
  return { text: content, filePlan: plan };
}

// Render on the server. The model supplies text and a format, never a path, asset ID, or renderer.
export async function renderConversationFiles(
  input: any,
  response: any,
  jobId: string,
  signal: AbortSignal,
  check: () => void,
  progress: any,
) {
  const drafts =
    response.fileDrafts ||
    (response.filePlan
      ? [{ ...response.filePlan, content: response.text }]
      : []);
  const files = [];
  for (const [index, value] of drafts.entries()) {
    const draft = FileCall.parse(value);
    const fileJob = index ? jobId + ":draft:" + index : jobId;
    files.push(
      ...(await renderDraft(
        input,
        response,
        draft,
        fileJob,
        signal,
        check,
        progress,
      )),
    );
  }
  return files;
}

async function renderDraft(
  input: any,
  response: any,
  draft: z.infer<typeof FileCall>,
  jobId: string,
  signal: AbortSignal,
  check: () => void,
  progress: any,
) {
  const plan = draft;
  const conversation = requireRow(
    get("SELECT owner_id FROM conversations WHERE id=?", input.conversationId),
  );
  const blocks: {
    id: string;
    title: string;
    text: string;
    claimIds: string[];
  }[] = [];
  let heading = plan.title,
    lines: string[] = [];
  function flush() {
    const text = lines.join("\n").trim();
    if (text)
      blocks.push({
        id: "section-" + (blocks.length + 1),
        title: heading,
        text,
        claimIds: [],
      });
    lines = [];
  }
  let fence = "";
  for (const line of draft.content.split("\n")) {
    const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (delimiter) {
      if (!fence) fence = delimiter[1];
      else if (
        delimiter[1][0] === fence[0] &&
        delimiter[1].length >= fence.length
      )
        fence = "";
    }
    const match = !fence && line.match(/^#{1,3}\s+(.+)$/);
    if (match) {
      if (heading !== plan.title && !lines.length) lines.push(heading);
      flush();
      heading = match[1];
    } else lines.push(line);
  }
  flush();
  if (!blocks.length)
    blocks.push({
      id: "section-1",
      title: plan.title,
      text: draft.content,
      claimIds: [],
    });
  const payload = {
    schemaVersion: "1.0",
    title: plan.title,
    mode: "draft",
    meta: "AI 研究 · 对话成稿",
    versionId: jobId,
    generatedAt: now(),
    ownerId: conversation.owner_id,
    conversationId: input.conversationId,
    chatMarkdown: draft.content,
    blocks,
    sources: response.sources.map((s: any) => ({
      id: s.id,
      title: "[" + s.id + "] " + s.title,
      url: s.url,
      publisher: s.provider || s.kind,
      published: s.published,
    })),
    unverified: response.warnings || [],
  };
  const files = [];
  for (const format of plan.formats) {
    signal.throwIfAborted();
    check();
    progress("render", {
      message: "正在生成 " + format.toUpperCase() + " 文件",
    });
    const file = await exportFile(
      {
        targetType: "conversation",
        targetId: input.conversationId,
        mode: "draft",
        format,
        payload,
      },
      jobId,
      signal,
      () => {
        check();
        progress("render", {
          message: "正在保存 " + format.toUpperCase() + " 文件",
        });
      },
    );
    files.push({ id: file.id, name: file.name, format });
  }
  return files;
}
