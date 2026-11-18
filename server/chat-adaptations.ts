import { z } from "zod";
import { presentationPages } from "./presentation-text.js";
import {
  all,
  get,
  run,
  parse,
  json,
  hash,
  now,
  id,
  tx,
  err,
  requireRow,
  settings,
} from "./db.js";
import { hasSecret } from "./secrets.js";
import { storeWorkflowArtifact } from "./workflows.js";
import { grantMediaAsset } from "./media-access.js";
import { assetBuffer } from "./domain.js";
import {
  freezeAttachments,
  readChatMaterials,
  revisionTarget,
} from "./chat-materials.js";
import { renderConversationFiles } from "./conversation-files.js";
import {
  prepareWechat,
  connection,
  draftView,
  enqueueWechatDraft,
} from "./wechat.js";
import { workflowActor, structuredTask } from "./workflow-agent.js";
import {
  wechatThemeIds,
  wechatThemeLabels,
  type WechatTheme,
} from "../shared/wechat-themes.js";
import { billingCharacters } from "../shared/media.js";
import { retryJob } from "./tasks.js";
import { narKey } from "./visual-audio.js";

export const AdaptKind = z.enum(["wechat", "video"]);
export const AdaptEdit = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("theme"),
      messageId: z.string(),
      palette: z.enum(wechatThemeIds),
    })
    .strict(),
  z
    .object({
      action: z.literal("scene"),
      messageId: z.string(),
      page: z.number().int().positive(),
      speed: z.number().min(0.7).max(1.5),
      text: z.string().trim().min(1).max(1000),
    })
    .strict(),
]);
export type Scene = {
  page: number;
  title: string;
  text: string;
  speed: number;
};
type Base = {
  sourceId: string;
  sourceName: string;
  sourceAssetId?: string;
  sourceVersion: number;
  title: string;
  version: number;
  articleFileId?: string;
  priorMessageId?: string;
};
export type Card = Base &
  (
    | {
        kind: "wechat";
        noteId: string;
        previewId: string;
        palette: WechatTheme;
        article: string;
      }
    | { kind: "video"; slideId: string; seconds: number; scenes: Scene[] }
  );
export function cardMessage(
  cid: string,
  mid: string,
  user: any,
  write = false,
) {
  const c = requireRow(
    get("SELECT owner_id FROM conversations WHERE id=?", cid),
  );
  if (c.owner_id !== user.id && (write || user.role !== "admin"))
    err("FORBIDDEN", "此操作属于对话所有者", 403);
  const m = requireRow(
    get(
      "SELECT * FROM messages WHERE conversation_id=? AND id=? AND role='assistant'",
      cid,
      mid,
    ),
  );
  const ctx = parse(m.context),
    card = ctx.adaptation as Card;
  if (!card) err("NO_ADAPTATION", "请选择文章或视频讲稿", 422);
  return { m, ctx, card };
}
function themeIn(text: string) {
  const matches = wechatThemeIds
    .map((key) => ({ key, label: wechatThemeLabels[key].split(" · ")[0] }))
    .filter(
      (t) =>
        text.includes(t.label) &&
        (t.key !== "milestone-wechat-light" ||
          /公众号文章(?:主题|风格|排版)/.test(text)),
    );
  return matches.sort(
    (a, b) => text.lastIndexOf(b.label) - text.lastIndexOf(a.label),
  )[0]?.key;
}
function numbered(s: string) {
  if (/^\d+$/.test(s)) return Number(s);
  const digits = "零一二三四五六七八九";
  const parts = s.split("十");
  return parts.length === 2
    ? (parts[0] ? digits.indexOf(parts[0]) : 1) * 10 +
        (parts[1] ? digits.indexOf(parts[1]) : 0)
    : digits.indexOf(s);
}
function inferEdit(cid: string, prompt: string) {
  const theme = themeIn(prompt),
    changeTheme =
      (theme || /换个主题|换一种主题/.test(prompt)) &&
      /^(?:请|帮我|把(?:这篇)?文章)?(?:换|改用|切换|改成|改为)/.test(prompt) &&
      !/重写|改写|写一篇/.test(prompt);
  const speed = prompt.match(
    /第\s*([\d一二三四五六七八九十]+)\s*页.{0,10}(慢|快)一?点/,
  );
  const replacement = prompt.match(
    /第\s*([\d一二三四五六七八九十]+)\s*页(?:的)?(?:旁白|讲稿)(?:改成|改为|换成)[：: ]*[“「]?(.+?)[”」]?$/s,
  );
  if (!changeTheme && !speed && !replacement) return;
  const kind = changeTheme ? "wechat" : "video";
  const m = get(
    "SELECT id,context FROM messages WHERE conversation_id=? AND role='assistant' AND json_extract(context,'$.adaptation.kind')=? ORDER BY rowid DESC LIMIT 1",
    cid,
    kind,
  );
  if (!m) return;
  if (changeTheme)
    return {
      action: "theme" as const,
      messageId: m.id,
      palette:
        theme ||
        (parse(m.context).adaptation.palette === "ink" ? "green" : "ink"),
    };
  const page = numbered((replacement || speed)![1]),
    s = parse(m.context).adaptation.scenes.find((s: Scene) => s.page === page);
  if (!s) err("PAGE_NOT_FOUND", "讲稿里没有这个页码", 422);
  if (replacement)
    return AdaptEdit.parse({
      action: "scene",
      messageId: m.id,
      page,
      text: replacement[2].trim(),
      speed: s.speed,
    });
  return {
    action: "scene" as const,
    messageId: m.id,
    page,
    text: s.text,
    speed: Math.max(
      0.7,
      Math.min(
        1.5,
        Math.round(10 * s.speed + (speed![2] === "慢" ? -1 : 1)) / 10,
      ),
    ),
  };
}
function sourceFor(cid: string, kind: string, prompt: string) {
  const files = all(
    "SELECT context FROM messages WHERE conversation_id=? AND role='assistant' ORDER BY rowid",
    cid,
  )
    .flatMap((m) => parse(m.context).artifacts || [])
    .filter((f) => ["pptx", "docx", "md", "html", "pdf"].includes(f.format));
  if (!files.length) return;
  let list = files;
  const named = list.filter((f) => f.title && prompt.includes(f.title));
  if (named.length) list = named;
  else if (
    /PPT|幻灯|课件/i.test(prompt) ||
    (kind === "video" && !/母稿|活动单|讲义/.test(prompt))
  )
    list = list.filter((f) => f.format === "pptx");
  else if (/活动单|讲义|Word/i.test(prompt))
    list = list.filter((f) => f.format === "docx");
  const ref = prompt.match(/第\s*([\d一二三四五六七八九十]+)\s*版/);
  if (ref || /最初|原版|初版/.test(prompt))
    list = list.filter(
      (f) => (f.version || 1) === (ref ? numbered(ref[1]) : 1),
    );
  else {
    const prior = new Set(list.map((f) => f.previousId));
    list = list.filter((f) => !prior.has(f.id));
  }
  if (list.length !== 1)
    err(
      "CHOOSE_ATTACHMENT",
      "请在对应版本的附件旁点「转公众号文章」或「做配音视频」，再发送要求。",
      409,
    );
  return list[0].id;
}
export function queueAdaptation(
  cid: string,
  b: any,
  user: any,
  key: string,
  enqueue: any,
) {
  if ([b.derive, b.adaptEdit, b.reviseId].filter(Boolean).length > 1)
    err("MULTIPLE_TARGETS", "每次请选择一个附件操作", 422);
  const signature = hash(b);
  const prior = get(
    "SELECT id,state,input FROM jobs WHERE idempotency_key=?",
    key,
  );
  if (prior && parse(prior.input).chatAdaptation) {
    if (
      parse(prior.input).signature !== signature ||
      parse(prior.input).conversationId !== cid
    )
      err("IDEMPOTENCY_CONFLICT", "提交内容已变化", 409);
    return { id: prior.id, state: prior.state };
  }
  const c = requireRow(get("SELECT * FROM conversations WHERE id=?", cid));
  if (c.owner_id !== user.id && user.role !== "admin")
    err("FORBIDDEN", "对话属于其他账号", 403);
  const edit =
    b.adaptEdit || (!b.derive && !b.reviseId && inferEdit(cid, b.prompt));
  const kind =
    b.derive?.kind ||
    (!b.reviseId &&
      !/^(?:请问|如何|怎么|为什么)/.test(b.prompt) &&
      /用|根据|把|改写|做成|转成|写成|制作|改成/.test(b.prompt) &&
      (/配音视频|讲解视频|解说视频/.test(b.prompt)
        ? "video"
        : /公众号/.test(b.prompt)
          ? "wechat"
          : null));
  const request = b.prompt.trim().replace(/[。！!]+$/, "");
  const action =
    /^(?:请|帮我)?(?:把(?:这篇)?文章)?(?:保存|存)(?:到|入)(?:公众号|微信)?草稿箱$/.test(
      request,
    )
      ? "draft"
      : /^(?:确认|开始)?渲染(?:视频|成片|MP4)?$/i.test(request)
        ? "render"
        : /^(?:我想|请|开始|先让我)?试听(?:配音|旁白)?$/.test(request)
          ? "listen"
          : undefined;
  const target =
    action &&
    !b.derive &&
    !b.reviseId &&
    !edit &&
    get(
      "SELECT id FROM messages WHERE conversation_id=? AND role='assistant' AND json_extract(context,'$.adaptation.kind')=? ORDER BY rowid DESC LIMIT 1",
      cid,
      action === "draft" ? "wechat" : "video",
    );
  if (!edit && !kind && !target) return null;
  let op;
  if (target) {
    cardMessage(cid, target.id, user, true);
    op = { confirmation: { messageId: target.id, action } };
  } else if (edit) {
    const { card } = cardMessage(cid, edit.messageId, user, true);
    if (
      edit.action === "scene" &&
      (card.kind !== "video" || !card.scenes.some((s) => s.page === edit.page))
    )
      err("WRONG_CARD", "请从对应页的讲稿修改", 422);
    if (edit.action === "theme" && card.kind !== "wechat")
      err("WRONG_CARD", "请选择公众号文章", 422);
    op = { edit, card };
  } else {
    const files = freezeAttachments(b.attachmentIds || [], cid, user);
    const candidates = files.filter((f) =>
      kind === "video"
        ? /\.pptx$/i.test(f.name)
        : /\.(pptx|docx)$/i.test(f.name),
    );
    const mentionsUpload = /上传|拖入|刚添加/.test(b.prompt);
    const incoming = candidates.some(
      (f) =>
        !get(
          "SELECT 1 FROM messages m,json_each(m.context,'$.attachments') a WHERE m.conversation_id=? AND json_extract(a.value,'$.id')=? LIMIT 1",
          cid,
          f.id,
        ),
    );
    const useUpload =
      !b.derive &&
      candidates.length > 0 &&
      (mentionsUpload ||
        incoming ||
        !get(
          "SELECT 1 FROM messages WHERE conversation_id=? AND json_array_length(context,'$.artifacts')>0 LIMIT 1",
          cid,
        ));
    if (!b.derive && mentionsUpload && files.length && !candidates.length)
      return null;
    const sourceId =
      b.derive?.artifactId || (!useUpload && sourceFor(cid, kind, b.prompt));
    if (!sourceId && !useUpload) return null;
    if (c.owner_id !== user.id)
      err("FORBIDDEN", "请在自己的对话制作衍生内容", 403);
    const source = sourceId ? revisionTarget(cid, sourceId, user) : undefined;
    if (useUpload && candidates.length !== 1)
      err(
        "CHOOSE_ATTACHMENT",
        "请添加一份用来改写的 Word 或演示原件；配音视频请选择一份 PPTX。",
        422,
      );
    const upload = useUpload ? candidates[0] : undefined;
    const duration =
      b.prompt.match(/(\d+)\s*秒/) || b.prompt.match(/(\d+|一|两|二)\s*分钟/);
    const seconds = duration
      ? Number(duration[1].replace("一", "1").replace(/[两二]/, "2")) *
        (duration[0].includes("分钟") ? 60 : 1)
      : 60;
    if (kind === "video" && (seconds < 10 || seconds > 600))
      err("DURATION_LIMIT", "请选择 10 秒至 10 分钟的目标时长", 422);
    op = {
      kind,
      source,
      upload,
      seconds,
      palette: themeIn(b.prompt) || "green",
    };
  }
  if (prior) err("IDEMPOTENCY_CONFLICT", "提交已用于另一项任务", 409);
  workflowActor(user.id, !edit && !target);
  if (!edit && !target && !hasSecret("deepseek"))
    err("CAPABILITY_NOT_CONFIGURED", "请在设置中连接 DeepSeek 后创作", 503);
  return tx(() => {
    const j = enqueue(
      "explore",
      {
        ...b,
        userId: user.id,
        conversationId: cid,
        signature,
        config: settings(),
        chatAdaptation: op,
      },
      key,
    );
    run(
      "INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)",
      id(),
      cid,
      "user",
      b.prompt,
      "[]",
      json({
        targetTitle: op.source?.title || op.upload?.name || op.card?.sourceName,
        attachments: op.upload ? [op.upload] : undefined,
        adaptation: true,
      }),
      j.id,
      now(),
    );
    const displayTitle = op.source?.title || op.upload?.name;
    run(
      "UPDATE conversations SET title=CASE WHEN title='新的探索' THEN coalesce(?,title) ELSE title END,updated_at=? WHERE id=?",
      displayTitle?.slice(0, 60) || null,
      now(),
      cid,
    );
    return j;
  });
}

function slideText(artifactId: string) {
  const a = requireRow(
    get("SELECT asset_id FROM artifacts WHERE id=?", artifactId),
  );
  return presentationPages(assetBuffer(a.asset_id).data);
}
function checkpoint(jobId: string, patch: any) {
  run(
    "UPDATE jobs SET checkpoint=? WHERE id=?",
    json({
      ...parse(get("SELECT checkpoint FROM jobs WHERE id=?", jobId).checkpoint),
      ...patch,
    }),
    jobId,
  );
}
export async function runAdaptation(
  input: any,
  jobId: string,
  progress: any,
  signal: AbortSignal,
  transport: typeof fetch,
  enqueue: any,
) {
  const op = input.chatAdaptation,
    user = workflowActor(input.userId, !op.edit && !op.confirmation);
  if (op.confirmation) {
    const { card } = cardMessage(
      input.conversationId,
      op.confirmation.messageId,
      user,
      true,
    );
    const label =
      op.confirmation.action === "draft"
        ? "核对公众号与草稿"
        : op.confirmation.action === "listen"
          ? "核对配音用量并试听"
          : "核对试听并渲染";
    signal.throwIfAborted();
    return tx(() => {
      const old = get(
        "SELECT id FROM messages WHERE job_id=? AND role='assistant'",
        jobId,
      );
      const mid = old?.id || id();
      if (!old)
        run(
          "INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)",
          mid,
          input.conversationId,
          "assistant",
          "请在《" + card.title + "》第 " + card.version + " 版确认。",
          "[]",
          json({
            confirmation: { ...op.confirmation, label },
            model: "本地处理",
          }),
          jobId,
          now(),
        );
      return { messageId: mid, conversationId: input.conversationId };
    });
  }
  const cp = parse(
    requireRow(get("SELECT checkpoint FROM jobs WHERE id=?", jobId)).checkpoint,
  );
  const base = op.card;
  let card: Card,
    text: string,
    sources = op.source?.originalSources || [],
    usage,
    model;
  if (op.edit) {
    sources = parse(
      cardMessage(input.conversationId, op.edit.messageId, user, true).m
        .sources,
      [],
    );
    card = {
      ...base,
      version: base.version + 1,
      priorMessageId: op.edit.messageId,
    };
    if (card.kind === "wechat") {
      const p = await prepareWechat(
        card.noteId,
        { revision: 1, palette: op.edit.palette },
        user,
      );
      card = { ...card, previewId: p.id, palette: p.palette };
      text =
        "已使用" + wechatThemeLabels[p.palette as WechatTheme] + "重新排版。";
    } else {
      card = {
        ...card,
        scenes: card.scenes.map((s) =>
          s.page === op.edit.page
            ? { ...s, text: op.edit.text, speed: op.edit.speed }
            : s,
        ),
      };
      text = "已调整第 " + op.edit.page + " 页讲稿与语速。";
    }
  } else {
    let source = op.source;
    if (op.upload) {
      const [f] = freezeAttachments([op.upload.id], input.conversationId, user);
      if (f.hash !== op.upload.hash)
        err("ASSET_CHANGED", "原件已变化，请重新选择", 409);
      const [ref] = await readChatMaterials(
        { ...input, attachments: [f], sourceUrls: [] },
        jobId,
        signal,
        progress,
        transport,
      );
      sources = [{ ...ref, id: "S1" }];
      const format = f.name.toLowerCase().endsWith(".pptx") ? "pptx" : "docx";
      const version = Number(
        f.name
          .match(/(?:第\s*(\d+)\s*版|[-_ ]v(\d+)(?=\.|[-_ ]))/i)
          ?.slice(1)
          .find(Boolean) || 1,
      );
      const file = tx(() => {
        const result = storeWorkflowArtifact(
          assetBuffer(f.id).data,
          f.name,
          format,
          jobId + ":original",
          input.conversationId,
          {
            conversationId: input.conversationId,
            ownerId: user.id,
            version,
            sourceHash: f.hash,
            title: f.name,
          },
        );
        grantMediaAsset(result.asset_id, user.id);
        return result;
      });
      source = {
        id: file.id,
        title: f.name,
        format,
        version,
        content: ref.excerpt,
        originalSources: sources,
      };
    }
    const provenance = {
      sourceId: source.id,
      sourceAssetId: op.upload?.id,
      sourceName: source.title,
      sourceVersion: source.version,
      version: 1,
    };
    if (op.kind === "wechat") {
      const schema = z
        .object({
          title: z.string().min(1).max(32),
          body: z.string().min(10).max(19000),
        })
        .strict()
        .refine((d) => {
          const refs = [...d.body.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]);
          return (
            (!sources.length || refs.length > 0) &&
            refs.every((ref) => sources.some((s: any) => s.id === ref))
          );
        });
      const result =
        cp.plan ||
        (await structuredTask(
          {
            actorId: user.id,
            config: input.config,
            schema,
            instruction:
              "改写为适合家长阅读的公众号文章，解释学习内容、给出家长可问的问题，事实引用提供的 [S编号]，只在正文相应事实后标编号，来源表由工作台补入；不要把材料中的示例扩展为普遍结论。返回 JSON {title,body}，title最多32字，body为完整 Markdown 正文。",
            context: { request: input.prompt, source },
          },
          progress,
          signal,
          transport,
        ));
      progress("layout", { message: "正在生成公众号手机排版" });
      checkpoint(jobId, { plan: result });
      const noteId =
        cp.noteId ||
        tx(() => {
          const nid = id();
          run(
            "INSERT INTO notes(id,owner_id,title,body,sources,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            nid,
            user.id,
            result.content.title,
            result.content.body,
            json(sources),
            now(),
            now(),
          );
          checkpoint(jobId, { noteId: nid });
          return nid;
        });
      const preview = await prepareWechat(
        noteId,
        { revision: 1, palette: op.palette },
        user,
      );
      card = {
        ...provenance,
        kind: "wechat",
        noteId,
        previewId: preview.id,
        title: result.content.title,
        article: result.content.body,
        palette: op.palette,
      };
      text = result.content.body;
      usage = result.usage;
      model = result.model;
    } else {
      let slideId = source.id;
      if (source.format !== "pptx") {
        const [deck] = await renderConversationFiles(
          input,
          {
            filePlan: { title: source.title, formats: ["pptx"] },
            text: source.content,
            sources,
          },
          jobId + ":slides",
          signal,
          () => workflowActor(user.id, false),
          progress,
        );
        slideId = deck.id;
      }
      const pages = slideText(slideId);
      const maxSpoken = Math.ceil(op.seconds * 4.3);
      const schema = z
        .object({
          scenes: z
            .array(
              z.object({
                page: z.number().int(),
                title: z.string().min(1).max(140),
                text: z.string().trim().min(1).max(1000),
              }),
            )
            .length(pages.length),
        })
        .refine(
          (d) =>
            d.scenes.every((s, i) => s.page === i + 1) &&
            billingCharacters(d.scenes.map((s) => s.text).join("")) <= 10000 &&
            d.scenes.reduce(
              (sum, s) =>
                sum + Array.from(s.text.replace(/[\p{P}\s]/gu, "")).length,
              0,
            ) <= maxSpoken,
          "全片旁白过长，请压缩各页，总字数最多 " + maxSpoken + " 字",
        );
      const result =
        cp.plan ||
        (await structuredTask(
          {
            actorId: user.id,
            config: input.config,
            schema,
            instruction:
              "根据原演示每页的实际内容写可直接朗读的中文讲稿。全片总字数约 " +
              Math.floor(op.seconds * 2.8) +
              " 字，所有页合计不得超过 " +
              maxSpoken +
              " 字。每页一到两句，不朗读元数据。用中文读法写数字、单位和多音词。不要朗读来源编号。返回 JSON {scenes:[{page,title,text}]}，包括封面与来源页，并按原页码顺序逐页对应。页数只表示画面数量，教学环节按原文计算。",
            context: {
              request: input.prompt,
              targetSeconds: op.seconds,
              pages,
              source,
            },
          },
          progress,
          signal,
          transport,
        ));
      progress("prepare", { message: "正在保存逐页讲稿" });
      checkpoint(jobId, { plan: result });
      card = {
        ...provenance,
        kind: "video",
        title: source.title + " · 配音视频",
        slideId,
        seconds: op.seconds,
        scenes: result.content.scenes.map((s: any) => ({ ...s, speed: 1 })),
      };
      text = "逐页旁白已准备好，可以核对文字并试听。";
      usage = result.usage;
      model = result.model;
    }
  }
  signal.throwIfAborted();
  workflowActor(user.id, false);
  progress("commit", { message: "正在将成品放回对话" });
  return tx(() => {
    const old = get(
      "SELECT id FROM messages WHERE job_id=? AND role='assistant'",
      jobId,
    );
    if (old) return { messageId: old.id, conversationId: input.conversationId };
    const mid = id();
    if (card.kind === "wechat") {
      const previewBody = parse(
        requireRow(
          get("SELECT body FROM wechat_previews WHERE id=?", card.previewId),
        ).body,
      );
      const offline = assetBuffer(previewBody.assetId);
      const file = storeWorkflowArtifact(
        offline.data,
        offline.a.name,
        "html",
        jobId,
        input.conversationId,
        {
          ownerId: user.id,
          conversationId: input.conversationId,
          messageId: mid,
          sourceArtifactId: card.sourceId,
          sourceVersion: card.sourceVersion,
          title: card.title,
          version: card.version,
          previousId: base?.articleFileId,
          sources: sources.map((s: any) => ({ id: s.id, title: s.title })),
        },
      );
      grantMediaAsset(file.asset_id, user.id);
      card.articleFileId = file.id;
      text = card.article;
    } else
      text = card.scenes
        .map((s) => "第 " + s.page + " 页 · " + s.title + "\n" + s.text)
        .join("\n\n");
    run(
      "INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)",
      mid,
      input.conversationId,
      "assistant",
      text,
      json(sources),
      json({
        adaptation: card,
        ...(card.kind === "wechat"
          ? {
              artifacts: [
                {
                  id: card.articleFileId,
                  name: card.title + ".html",
                  format: "html",
                  title: card.title,
                  version: card.version,
                  previousId: base?.articleFileId,
                },
              ],
            }
          : {}),
        model: model || "本地处理",
        usage,
        mode: input.mode,
      }),
      jobId,
      now(),
    );
    if (
      card.kind === "video" &&
      op.edit?.action === "scene" &&
      audioEstimate(card, user.id).segments === 0 &&
      get(
        "SELECT 1 FROM jobs WHERE type='chat-narration' AND state='succeeded' AND json_extract(input,'$.messageId')=?",
        op.edit.messageId,
      )
    ) {
      const j = enqueue(
        "chat-narration",
        {
          actorId: user.id,
          conversationId: input.conversationId,
          messageId: mid,
        },
        "chat-narration:" + mid,
      );
      run(
        "UPDATE messages SET context=json_set(context,'$.mediaJobs',json(?)) WHERE id=?",
        json([{ id: j.id, action: "listen" }]),
        mid,
      );
    }
    run(
      "UPDATE conversations SET updated_at=? WHERE id=?",
      now(),
      input.conversationId,
    );
    return {
      messageId: mid,
      conversationId: input.conversationId,
      sourceId: card.sourceId,
    };
  });
}

export function audioEstimate(
  card: Extract<Card, { kind: "video" }>,
  uid: string,
) {
  const unique = [...new Set(card.scenes.map((s) => s.text.trim()))];
  const missing = unique.filter(
    (text) =>
      !get(
        "SELECT 1 FROM artifacts WHERE job_id=? AND format='wav'",
        narKey(uid, text, "stella"),
      ),
  );
  return {
    characters: missing.reduce((n, s) => n + billingCharacters(s), 0),
    segments: missing.length,
  };
}

export function registerChatAdaptations(app: any, enqueue: any) {
  const route = "/api/conversations/:id/messages/:mid/adaptation";
  app.get(route, async (req: any) => {
    const { ctx, card } = cardMessage(req.params.id, req.params.mid, req.user);
    const jobs = (ctx.mediaJobs || []).map((ref: any) => {
      const row = requireRow(
        get("SELECT state,stage,result,error FROM jobs WHERE id=?", ref.id),
      );
      return {
        ...ref,
        state: row.state,
        stage: row.stage,
        error: parse(row.error, null),
        result: parse(row.result, null),
      };
    });
    const drafts =
      card.kind === "wechat"
        ? all(
            "SELECT * FROM wechat_drafts WHERE preview_id=? AND owner_id=? ORDER BY created_at DESC",
            card.previewId,
            req.user.id,
          ).map(draftView)
        : [];
    return {
      jobs,
      drafts,
      connection: card.kind === "wechat" ? connection() : undefined,
      estimate:
        card.kind === "video" ? audioEstimate(card, req.user.id) : undefined,
    };
  });
  app.post(route + "/draft", async (req: any) => {
    const { card } = cardMessage(req.params.id, req.params.mid, req.user, true);
    const b = z
      .object({
        previewId: z.string(),
        accountId: z.string(),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(req.body);
    if (card.kind !== "wechat" || b.previewId !== card.previewId)
      err("VERSION_CONFLICT", "请重新核对本次文章预览", 409);
    return enqueueWechatDraft(b, req.user, enqueue);
  });
  app.post(route + "/jobs", async (req: any, reply: any) => {
    const b = z
      .object({
        action: z.enum(["listen", "render"]),
        confirmed: z.literal(true),
        audioJobId: z.string().optional(),
      })
      .strict()
      .parse(req.body);
    const { card, ctx } = cardMessage(
      req.params.id,
      req.params.mid,
      req.user,
      true,
    );
    if (card.kind !== "video") err("WRONG_CARD", "请选择视频讲稿", 422);
    const type = b.action === "listen" ? "chat-narration" : "chat-film";
    const key = type + ":" + req.params.mid;
    const old = get("SELECT id,state FROM jobs WHERE idempotency_key=?", key);
    if (old && old.state !== "canceled") return old;
    if (type === "chat-film") {
      const approved = get(
        "SELECT id,state,input FROM jobs WHERE id=? AND type='chat-narration'",
        b.audioJobId || "",
      );
      if (
        !approved ||
        approved.state !== "succeeded" ||
        parse(approved.input).messageId !== req.params.mid
      )
        err("AUDIO_REQUIRED", "请先试听并核对此版配音", 409);
    }
    workflowActor(
      req.user.id,
      type === "chat-narration" &&
        audioEstimate(card as Extract<Card, { kind: "video" }>, req.user.id)
          .characters > 0,
    );
    if (old)
      return tx(() => {
        run(
          "UPDATE jobs SET state='failed' WHERE id=? AND state='canceled'",
          old.id,
        );
        return retryJob(old.id);
      });
    const j = tx(() => {
      const job = enqueue(
        type,
        {
          actorId: req.user.id,
          conversationId: req.params.id,
          messageId: req.params.mid,
          audioJobId: b.audioJobId,
        },
        key,
      );
      ctx.mediaJobs = [
        ...(ctx.mediaJobs || []),
        { id: job.id, action: b.action },
      ];
      run(
        "UPDATE messages SET context=? WHERE id=?",
        json(ctx),
        req.params.mid,
      );
      return job;
    });
    return reply.code(202).send(j);
  });
}
