import {sourceStatus} from './lineage.js';
import { z } from "zod";
import { productionTemplates } from "../shared/production.js";
import { Scope } from "../shared/schema.js";
import {
  get,
  run,
  all,
  tx,
  parse,
  json,
  settings,
  err,
  requireRow,
  hash,
  audit,
} from "./db.js";
import { hasSecret } from "./secrets.js";
import { freezeAgentInput, runAgent } from "./agent.js";
import {
  createProject,
  projectView,
  addClaim,
  makeTopic,
  saveVersion,
  versionView,
} from "./domain.js";
import { freezeExport, exportFile } from "./exports.js";
import { createVisualDraft } from "./visual-studio.js";
import { grantMediaAsset } from "./media-access.js";
const key = z.string().min(1).max(100);
export const ProductionInput = z
  .object({
    template: z.enum([
      "policy",
      "speech",
      "wechat",
      "presentation",
      "storyboard",
    ]),
    projectId: key.optional(),
    expectedRevision: z.number().int().optional(),
    title: z.string().trim().min(1).max(200),
    scope: Scope,
    snapshotIds: z.array(key).max(20).default([]),
    prompt: z.string().max(10000).default(""),
    duration: z.number().int().min(10).max(7200).default(90),
    slideCount: z.number().int().min(3).max(60).default(10),
    lectureMinutes: z.number().int().min(1).max(180).default(20),
    characterId: key.optional(),
    formats: z
      .array(z.enum(["docx", "pdf", "md", "html", "pptx", "json", "csv"]))
      .min(1)
      .max(4),
  })
  .strict();
export function assertProductionActor(uid: string) {
  const actor = get("SELECT role,status FROM users WHERE id=?", uid);
  if (
    !actor ||
    actor.status !== "active" ||
    !["admin", "creator"].includes(actor.role)
  )
    err("ACTOR_REVOKED", "账号已停用或失去创作权限，制作停止", 403);
  if (!settings().allowExternalAI)
    err("AI_CONSENT_REQUIRED", "请管理员在设置中开启 DeepSeek 调用授权", 403);
}
export function freezeProduction(raw: any, user: any) {
  assertProductionActor(user.id);
  if (!hasSecret("deepseek"))
    err("CAPABILITY_NOT_CONFIGURED", "请管理员在设置中配置 DeepSeek 凭证", 503);
  const b = ProductionInput.parse(raw),
    template = productionTemplates.find((t) => t.id === b.template)!;
  if (b.formats.some((f) => !template.formats.includes(f as never)))
    err("INVALID_FORMAT", "此制作模板不支持所选格式", 422);
  for(const sid of b.snapshotIds)if(sourceStatus('snapshot',sid).length)err('SOURCE_STALE','来源或原笔记已更新，请从最新资料重新制作',409);
  const old = b.projectId
    ? requireRow(
        get("SELECT * FROM projects WHERE id=? AND archived=0", b.projectId),
      )
    : null;
  if (old && old.revision !== b.expectedRevision)
    err("VERSION_CONFLICT", "项目已更新，请重新选择后开始制作", 409);
  const snapshotIds = old ? parse(old.snapshot_ids, []) : b.snapshotIds;
  for(const sid of snapshotIds)if(sourceStatus('snapshot',sid).length)err('SOURCE_STALE','项目来源已变化，请先使用最新资料',409);
  if (!snapshotIds.length)
    err("SOURCES_REQUIRED", "先导入资料，再选择资料开始制作", 422);
  const initial = freezeAgentInput({
    kind: "research",
    snapshotIds,
    actorId: user.id,
  });
  const character = b.characterId
    ? parse(
        requireRow(get("SELECT body FROM characters WHERE id=?", b.characterId))
          .body,
      )
    : null;
  const p = old
    ? projectView(old)
    : createProject({ title: b.title, scope: b.scope, snapshotIds });
  return {
    ...b,
    scope: p.scope,
    projectId: p.id,
    projectRevision: p.revision,
    snapshotIds,
    actorId: user.id,
    initial,
    character,
    config: settings(),
    templateName: template.name,
    prompt: template.prompt + "\n用户要求：" + b.prompt + (p.scope.domain==='teaching'?'\n这是教学创作。按所选原文组织教学内容、知识点、练习与讲者备注；地区、年度和考试字段只在原文适用时使用。学科、年级、目标没有原文依据时标为建议或待补充，不编造。':p.scope.domain==='general'?'\n这是通用内容创作，依据材料与实际读者组织内容；不套用北京、中考、家长或政策解读语境。':''),
  };
}
export async function runProduction(
  input: any,
  jobId: string,
  progress: (stage: string, payload: any) => void,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
) {
  let checkpoint = parse(
    get("SELECT checkpoint FROM jobs WHERE id=?", jobId)?.checkpoint,
  );
  const saved = () =>
    run("UPDATE jobs SET checkpoint=? WHERE id=?", json(checkpoint), jobId);
  const check = () => {
    signal.throwIfAborted();
    assertProductionActor(input.actorId);
    const project = requireRow(
      get("SELECT * FROM projects WHERE id=?", input.projectId),
    );
    const ownVersions = all(
      "SELECT id FROM versions WHERE project_id=? AND job_id=?",
      project.id,
      jobId,
    );
    if (project.revision !== input.projectRevision + ownVersions.length)
      err(
        "PROJECT_CHANGED",
        "制作期间项目被其他操作更新，请保留已完成结果并从模板重新开始，避免覆盖修改",
        409,
      );
  };
  const phase = async (name: string, title: string, frozen: any) => {
    check();
    progress(name, { message: title, step: name });
    if (!checkpoint[name]) {
      checkpoint[name] = await runAgent(
        { ...frozen, config: input.config, skill: input.initial.skill },
        (stage, payload) => progress(name, { ...payload, agentStage: stage }),
        signal,
        transport,
      );
      check();
      saved();
    }
    return checkpoint[name];
  };
  check();
  const research = await phase("research", "1/4 正在提取候选事实与选题", {
    ...input.initial,
    prompt:
      "从所选资料提取能被原文准确支持的候选事实和创作选题。没有选题时返回topics空数组。" +
      input.prompt,
  });
  if (!checkpoint.claimIds) {
    check();
    tx(() => {
      checkpoint.claimIds = research.content.claims.map(
        (c: any) => addClaim(c).id,
      );
      checkpoint.topicIds = research.content.topics.map(
        (t: any) => makeTopic(t).id,
      );
      saved();
    });
  }
  const masterExisting = get(
    "SELECT * FROM versions WHERE job_id=? AND kind='master'",
    jobId,
  );
  let master = masterExisting ? versionView(masterExisting) : null;
  if (!master) {
    const response = await phase(
      "master",
      "2/4 正在生成内容母稿",
      freezeAgentInput({
        kind: "master",
        projectId: input.projectId,
        prompt:
          "围绕目标产物形成一份简明母稿，保留原文条件与引用，不能把待核实内容写成已核实政策。目标：" +
          input.templateName +
          "\n" +
          input.prompt,
        actorId: input.actorId,
      }),
    );
    check();
    master = saveVersion({
      projectId: input.projectId,
      kind: "master",
      body: response.content,
      expectedRevision: get(
        "SELECT revision FROM projects WHERE id=?",
        input.projectId,
      ).revision,
      origin: "deepseek-production",
      jobId,
    });
  }
  checkpoint.masterId = master.id;
  saved();
  const targetExisting = get(
    "SELECT * FROM versions WHERE job_id=? AND kind=?",
    jobId,
    input.template,
  );
  let target = targetExisting ? versionView(targetExisting) : null;
  if (!target) {
    const response = await phase(
      "content",
      "3/4 正在制作" + input.templateName,
      freezeAgentInput({
        kind: input.template,
        projectId: input.projectId,
        masterId: master.id,
        prompt: input.prompt,
        duration: input.duration,
        slideCount: input.slideCount,
        lectureMinutes: input.lectureMinutes,
        character: input.character,
        actorId: input.actorId,
      }),
    );
    check();
    target = saveVersion({
      projectId: input.projectId,
      kind: input.template,
      body: response.content,
      masterId: master.id,
      expectedRevision: get(
        "SELECT revision FROM projects WHERE id=?",
        input.projectId,
      ).revision,
      origin: "deepseek-production",
      jobId,
    });
  }
  checkpoint.versionId = target.id;
  saved();
  const artifacts: any[] = [];
  if ((input.deliveryFormats?.some((f:string)=>['gif','mp4'].includes(f)) || input.formats.some((f:string)=>['html','pptx'].includes(f)) || input.template==='presentation'&&input.formats.includes('pdf')) && !checkpoint.visual) {
    check();
    checkpoint.visual=await createVisualDraft({actorId:input.actorId,versionId:target.id,designBrief:input.prompt,duration:Math.min(120,input.duration),config:input.config,workflowJobId:jobId},jobId+':visual',progress,signal,transport);
    saved();
  }
  for (const format of input.formats) {
    check();
    progress("export", {
      message: "4/4 正在制作 " + format.toUpperCase() + " 草稿文件",
      format,
    });
    const frozen=freezeExport({
        targetType: "version",
        targetId: target.id,
        format,
        mode: "draft",
      });
    if(input.template==='presentation'&&checkpoint.visual)frozen.payload.visualMaster=checkpoint.visual.body.master;
    const item = format==='html'&&checkpoint.visual ? checkpoint.visual.artifact : await exportFile(
      frozen,
      jobId,
      signal,
    );
    if(checkpoint.visual && (format==='html'||input.template==='presentation'&&['pptx','pdf'].includes(format))){
      run('UPDATE artifacts SET manifest=? WHERE id=?',json({...parse(item.manifest),visualId:checkpoint.visual.id,ownerId:input.actorId,projectId:input.projectId}),item.id);
      grantMediaAsset(item.asset_id,input.actorId);
    }
    artifacts.push({
      id: item.id,
      name: get("SELECT name FROM assets WHERE id=?", item.asset_id).name,
      format: item.format,
    });
    checkpoint.artifactIds = artifacts.map((a) => a.id);
    saved();
  }
  check();
  const usage = {
    inputTokens: 0 as number | null,
    outputTokens: 0 as number | null,
    cost: null,
  };
  for (const step of ["research", "master", "content"])
    for (const k of ["inputTokens", "outputTokens"]) {
      const value = checkpoint[step]?.usage?.[k];
      if (value === null || value === undefined) usage[k] = null;
      else if (usage[k] !== null) usage[k] += value;
    }
  return {
    executor: "deepseek-production-agent",
    model: input.config.model,
    projectId: input.projectId,
    masterId: master.id,
    versionId: target.id,
    visualId: checkpoint.visual?.id,
    claimIds: checkpoint.claimIds,
    topicIds: checkpoint.topicIds,
    artifacts,
    usage,
    steps: ["research", "master", "content", "export"],
    message: "文件已制作完成，当前为研究草稿；事实核验和发布审核仍需完成。",
  };
}
export async function registerProduction(app: any, enqueue: any) {
  app.get("/api/production/templates", async () => productionTemplates);
  app.post("/api/production", async (req: any, reply: any) => {
    const b = ProductionInput.parse(req.body),
      requestKey =
        "production:" +
        req.user.id +
        ":" +
        (req.headers["idempotency-key"] || crypto.randomUUID());
    const existing = get(
      "SELECT * FROM jobs WHERE idempotency_key=?",
      requestKey,
    );
    if (existing) {
      if (parse(existing.input).requestHash !== hash(b))
        err("IDEMPOTENCY_CONFLICT", "相同请求键已用于其他制作要求", 409);
      return { id: existing.id, state: existing.state };
    }
    const job = tx(() => enqueueProduction(b, req.user, enqueue, requestKey, hash(b)));
    return reply.code(202).send(job);
  });
}

export function enqueueProduction(raw:any, user:any, enqueue:any, key:string, requestHash:string, deliveryFormats?:string[]) {
  const frozen = freezeProduction(raw, user);
  const job = enqueue("production", {...frozen, requestHash, ...(deliveryFormats ? {deliveryFormats} : {})}, key);
  audit("production.start", job.id, {actor:user.id, projectId:frozen.projectId, template:frozen.template});
  return job;
}
