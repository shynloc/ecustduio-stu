import { htmlDocument, maxPageChars } from "./webpage-delivery.js";
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
  content: z.string().trim().min(1).max(maxPageChars),
}).refine(d => d.content.length <= 100000 || d.formats.every(f => f === "html"), "文档正文超过十万字上限");
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
  '用户索要文件、演示稿、讲义、网页或要求修改前一版时，直接创作可用成稿并交付，不要指导用户自行制作。可用 deliver_files 时优先调用；否则写出完整正文，末尾独占一行附 :::ecustudio-files {"title":"文件标题","formats":["pptx"]}。支持 docx、pptx、pdf、md、html。每页演示用 ## 标题另起一节。教师材料给出分步教学、时间安排和评价要点；学生材料用学生能执行的指令和可填写的记录表，不代填实验结论。每份使用课程材料的文件各自引用真实编号。revisionTarget 含要修订的原稿；仅修订指定附件，保留受众、题名和原格式，单独交付新版本。无本地工具而需交付不同正文时，每份正文后各写一行对应的 :::ecustudio-files 说明。普通提问直接回答。文件由工作台在本对话生成，引用仍用本轮真实来源编号。';

export function extractFilePlan(text: string) {
  const lines = text.trimEnd().split("\n");
  if (!/^:::ecustudio-files[ \t]+/.test(lines.at(-1) || "")) return { text };
  const drafts: z.infer<typeof FileCall>[] = [];
  let start = 0,
    fence = "";
  for (const [i, line] of lines.entries()) {
    const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (
      delimiter &&
      (!fence || (!delimiter[2].trim() && delimiter[1].startsWith(fence)))
    ) {
      fence = fence ? "" : delimiter[1];
      continue;
    }
    if (fence || !/^:::ecustudio-files[ \t]+/.test(line)) continue;
    const content = lines.slice(start, i).join("\n").trim();
    if (!content) err("EMPTY_DELIVERY", "未收到可生成文件的正文", 422);
    try {
      drafts.push(
        FileCall.parse({
          ...FilePlan.parse(
            JSON.parse(line.slice(":::ecustudio-files ".length)),
          ),
          content,
        }),
      );
    } catch {
      err("INVALID_DELIVERY", "文件交付说明格式错误，请重试本轮", 422);
    }
    start = i + 1;
  }
  if (!drafts.length || start !== lines.length) return { text };
  if (drafts.reduce((n, d) => n + d.formats.length, 0) > 5)
    err("BUDGET_EXCEEDED", "单轮最多交付五个文件");
  if (drafts.length === 1) {
    const { content, ...filePlan } = drafts[0];
    return { text: content, filePlan };
  }
  return {
    text: drafts.map((d) => "# " + d.title + "\n\n" + d.content).join("\n\n"),
    fileDrafts: drafts,
  };
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
    if(input.target)draft.title=input.target.title;
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
  let explicitHeading = false;
  let heading = plan.title,
    lines: string[] = [];
  function flush() {
    const text = lines.join("\n").trim();
    if (text || explicitHeading)
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
    const match = !fence && line.match(/^(#{1,2})\s+(.+)$/);
    if (match) {
      flush();
      heading = match[2];
      explicitHeading = !(
        match[1] === "#" &&
        heading === plan.title &&
        !blocks.length
      );
    } else lines.push(!fence ? line.replace(/^#{3,6}\s+/, "") : line);
  }
  flush();
  if (!blocks.length)
    blocks.push({
      id: "section-1",
      title: plan.title,
      text: draft.content,
      claimIds: [],
    });
  const cited = new Set(
    Array.from(draft.content.matchAll(/\[(S\d+)\]/g), (m) => m[1]),
  );
  const sources = cited.size
    ? response.sources.filter((s: any) => cited.has(s.id))
    : response.sources;
  const payload = {
    schemaVersion: "1.0",
    title: plan.title,
    mode: "draft",
    meta: "AI 研究 · 对话成稿",
    versionId: jobId,
    generatedAt: now(),
    ownerId: conversation.owner_id,
    version:(input.target?.version||0)+1,previousId:input.target?.id,familyId:input.target?.familyId,
    conversationId: input.conversationId,
    chatMarkdown: draft.content,
    ...(plan.formats.includes("html") ? { webpageHtml: htmlDocument(draft.content)?.content } : {}),
    blocks,
    sources: sources.map((s: any) => ({
      id: s.id,
      title:
        "[" +
        s.id +
        "] " +
        s.title +
        (s.kind === "note" && s.revision ? " · 笔记 v" + s.revision : ""),
      ...(s.assetId ? {assetId:s.assetId,sourceHash:s.sourceHash} : {}),
      ...(s.noteId ? { noteId: s.noteId, revision: s.revision } : {}),
      ...(s.snapshotId ? { snapshotId: s.snapshotId } : {}),
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
    files.push({ id: file.id, name: file.name, title:plan.title,format,version:JSON.parse(file.manifest).version||1,previousId:payload.previousId });
  }
  return files;
}
