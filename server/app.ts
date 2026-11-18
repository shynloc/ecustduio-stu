import {registerWechatDrafts, wechatSecrets} from './wechat.js';
import {officialWechat} from './wechat-client.js';
import {registerPipeline} from './pipeline.js';
import {registerResumableUploads} from './resumable-uploads.js';
import Fastify from "fastify";
import staticPlugin from "@fastify/static";
import multipart from "@fastify/multipart";
import { z, ZodError } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";
import AdmZip from "adm-zip";
import {
  Content,
  ImportInput,
  Kind,
  Scope,
  Settings,
  DeepSeekSettings,
} from "../shared/schema.js";
import {
  all,
  get,
  run,
  tx,
  id,
  now,
  hash,
  json,
  parse,
  settings,
  root,
  dataDir,
  err,
  requireRow,
  audit,
} from "./db.js";
import {
  addClaim,
  verifyClaim,
  topicView,
  makeTopic,
  projectView,
  createProject,
  projectClaims,
  masterFromSources,
  saveVersion,
  versionView,
  confirmVersion,
  snapshotView,
  asset,
  assetBuffer,
  extract,
  correctSnapshot,
} from "./domain.js";
import { existingInside, publicUrl, validateArchive } from "./security.js";
import { hasSecret, setSecret, diagnoseSecretStorage, secretStorageIssue } from "./secrets.js";
import { freezeAgentInput, probeDeepseek, registerSkill } from "./agent.js";
import {
  enqueue,
  jobView,
  Worker,
  retryJob,
  cancelJob,
  nextSchedule,
  previewNotification,
  authorizeNotification,
} from "./tasks.js";
import { freezeExport } from "./exports.js";
import { backupList, validateBackup, restoreBackup } from "./backup.js";
import { ocrCapability } from "./ocr.js";
import { sessionFor, registerAuth, canAccess, checkJobAccess } from "./auth.js";
import { registerExplore } from "./explore.js";
import { registerProduction } from "./production.js";
import { registerMedia } from "./media.js";
import {registerWechat} from './wechat-export.js';
import { checkMediaAsset } from "./media-access.js";
import { guardNetwork, networkInfo } from "./network.js";
import { upgradeMaintenance } from "./maintenance.js";
import { registerUpdates } from "./updates.js";
import { registerWorkflows } from "./workflows.js";
import { appVersion } from "./version.js";

const s = z.string().min(1).max(300),
  optionalString = z.string().max(3000).default("");
const versionInput = z.object({
  projectId: s,
  kind: Kind,
  body: Content,
  expectedRevision: z.number().int(),
  baseVersionId: z.string().optional(),
  masterId: z.string().nullable().optional(),
});
export async function buildApp(startWorker = false, updateOverrides = {}, secretOperations={save:setSecret,diagnose:diagnoseSecretStorage}, wechatClient=officialWechat, wechatSecretOperations=wechatSecrets) {
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });
  const eventStreams = new Set<() => void>();
  app.addHook("preClose", async () => {
    for (const close of eventStreams) close();
  });
  let worker: Worker | undefined;
  let restoring = false;
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  });
  app.setErrorHandler((e: any, req, reply) => {
    const status = e instanceof ZodError ? 400 : e.statusCode || 500;
    if(req.method==='GET'&&!req.url.startsWith('/api/')&&String(req.headers.accept||'').includes('text/html')){
      const ref=String(req.id).replace(/[^a-zA-Z0-9_-]/g,'');
      if(status===500)console.error('[server page]',ref,e.code||'',e.message);
      return reply.code(status).type('text/html; charset=utf-8').send(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EcuStudio 页面恢复</title><style>body{font:17px/1.8 system-ui;max-width:660px;margin:12vh auto;padding:28px;background:#f7f4ec;color:#233d34}a{color:#233d34}small{color:#68776e}</style><h1>工作台页面暂时无法打开</h1><p>请重新连接工作台。如果仍然出现此页，请运行安装目录中的启动或修复升级脚本。</p><p><a href="/#settings">重新打开设置</a> · <a href="https://dshdisk.acks.com.cn/ecustudio/${appVersion}/EcuStudio-${appVersion}-Guide.html">查看本机修复说明</a></p><p>保留原安装目录和 data 文件夹，无需重新创建账号或发送 API Key。</p><small>错误编号：${ref} · HTTP ${status}</small></html>`);
    }
    reply.code(status).send({
      error: {
        code:
          e instanceof ZodError
            ? "VALIDATION_ERROR"
            : e.code || "INTERNAL_ERROR",
        message:
          e instanceof ZodError
            ? "输入不符合要求：" +
              e.issues
                .map((x: any) => x.path.join(".") + " " + x.message)
                .join("；")
            : status === 500
              ? "操作失败，请检查任务日志与输入资料"
              : e.message,
      },
    });
    if (status === 500) console.error("[server]", e.code || "", e.message);
  });
  app.addHook("onSend", async (req, reply, payload) => {
    if(req.routeOptions.url==='/api/visuals/:id/preview'){
      reply.header('X-Content-Type-Options','nosniff');
      reply.header('X-Frame-Options','SAMEORIGIN');
      reply.header('Cache-Control','no-store');
      reply.header('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts");
      return payload;
    }
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Frame-Options", "DENY");
    const inlineArticle=req.routeOptions.url==="/api/artifacts/:id/download" &&
      String(reply.getHeader("Content-Disposition")).startsWith("inline;") &&
      String(reply.getHeader("Content-Type")).startsWith("text/html");
    reply.header(
      "Content-Security-Policy",
      inlineArticle ? "sandbox; default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    return payload;
  });
  app.addHook("onRequest", async (req, reply) => {
    guardNetwork(req);
    if (req.url.startsWith("/api/")) {
      const updatePath=req.url.split('?')[0];
      const maintenanceRead=req.method==='GET'&&['/api/session','/api/state','/api/settings/updates'].includes(updatePath);
      if (upgradeMaintenance()&&!maintenanceRead&&!(req.method==='POST'&&updatePath==='/api/settings/updates/recover')) return reply.code(503).header("Retry-After", "5").send({ error: { code: "UPGRADE_IN_PROGRESS", message: "工作台正在升级并校验数据，请稍后刷新。" } });
      reply.header("Cache-Control", "no-store");
      const path = req.routeOptions.url || req.url.split("?")[0];
      if (path === "/api/session" && req.method === "GET") return;
      const session = sessionFor(req);
      if (!session) err("SESSION_REQUIRED", "会话已失效，请重新登录", 401);
      (req as any).auth = session;
      (req as any).user = session.user;
      if (
        !["GET", "HEAD"].includes(req.method) &&
        req.headers["x-csrf-token"] !== session.csrf
      )
        err("CSRF_INVALID", "会话校验失败，请刷新", 403);
      if (restoring) err("MAINTENANCE", "数据恢复中，请稍后刷新", 503);
      if (
        ["/api/auth/setup", "/api/auth/login"].includes(path) &&
        req.method === "POST"
      )
        return;
      if (!session.user) err("LOGIN_REQUIRED", "请先登录工作台", 401);
      if (
        session.user.mustChangePassword &&
        !["/api/auth/password", "/api/auth/logout"].includes(path)
      )
        err("PASSWORD_CHANGE_REQUIRED", "首次登录请修改初始密码", 403);
      if (!canAccess(session.user.role, req.method, path))
        err("FORBIDDEN", "当前账号无权使用此功能", 403);
      if (path.startsWith("/api/jobs/"))
        checkJobAccess(
          (req.params as any).id,
          session.user,
          req.method !== "GET",
        );
      if (session.user.role === "sales" && path === "/api/assets/:id") {
        if (
          !get(
            "SELECT id FROM snapshots WHERE asset_id=?",
            (req.params as any).id,
          ) &&
          !get(
            "SELECT id FROM artifacts WHERE asset_id=? AND mode='release'",
            (req.params as any).id,
          )
        )
          err("FORBIDDEN", "仅可查看政策原件与可发布成果", 403);
      }
      if (
        session.user.role === "sales" &&
        path === "/api/artifacts/:id/download" &&
        !get(
          "SELECT id FROM artifacts WHERE id=? AND mode='release'",
          (req.params as any).id,
        )
      )
        err("FORBIDDEN", "仅可下载可发布成果", 403);
    }
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Frame-Options", "DENY");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
  });
  app.addHook("preHandler", async (req: any) => {
    if (!req.user || !req.body || typeof req.body !== "object") return;
    for (const key of ["assetId", "imageAssetId"])
      if (typeof req.body[key] === "string") checkMediaAsset(req.body[key], req.user);
  });
  await registerAuth(app);
  await registerExplore(app, enqueue);
  await registerPipeline(app, enqueue);
  await registerResumableUploads(app);
  await registerProduction(app, enqueue);
  await registerMedia(app, enqueue);
  await registerWechat(app);
  await registerWechatDrafts(app,enqueue,retryJob,wechatClient,wechatSecretOperations);
  await registerWorkflows(app, enqueue);
  await registerUpdates(app, updateOverrides);
  app.get("/health", async () => ({
    app: "ecustudio",
    version: appVersion,
    instanceId: hash(dataDir).slice(0, 16),
    networkMode: networkInfo().mode,
    status: "ok",
  }));
  app.get("/api/state", async (req: any) => {
    const cfg = settings();
    const result: any = {
      user: req.user,
      network: req.user.role === "admin" ? networkInfo() : undefined,
      product: "EcuStudio教创工作台",
      version: appVersion,
      upgrading: !!upgradeMaintenance(),
      settings: cfg,
      capabilities: {
        deepseek: hasSecret("deepseek") ? "configured" : "needs_configuration",
        dingtalk: hasSecret("dingtalkWebhook")
          ? "configured"
          : "needs_configuration",
        secretStorage:
          process.platform === "win32"
            ? "Windows DPAPI"
            : process.platform === "darwin"
              ? "macOS Keychain"
              : "environment",
        secretStorageIssue: req.user.role==='admin'?secretStorageIssue():undefined,
        ocr: await ocrCapability(),
        executor: "deepseek-controlled",
      },
      counts: {
        snapshots: get("SELECT count(*) n FROM snapshots").n,
        pending: get("SELECT count(*) n FROM claims WHERE status!='verified'")
          .n,
        projects: get("SELECT count(*) n FROM projects WHERE archived=0").n,
        artifacts: get("SELECT count(*) n FROM artifacts").n,
      },
      snapshots: all(
        "SELECT id,title,publisher,published,scope,document_type,fetched_at,previous_id FROM snapshots ORDER BY fetched_at DESC LIMIT 500",
      ).map((v) => ({ ...v, scope: parse(v.scope) })),
      recentNotes: req.user.role === "sales" ? [] : all(
        "SELECT id,title FROM notes WHERE owner_id=? AND deleted=0 ORDER BY updated_at DESC LIMIT 3", req.user.id
      ),
      topics: all(
        "SELECT * FROM topics ORDER BY total DESC,created_at DESC LIMIT 500",
      ).map(topicView),
      projects: all("SELECT * FROM projects ORDER BY created_at DESC").map(
        projectView,
      ),
      jobs: all("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100").map(
        (j) => jobView(j, true),
      ),
      reports: all(
        "SELECT id,date,number,coverage,created_at FROM reports ORDER BY created_at DESC LIMIT 100",
      ),
      artifacts: all(
        "SELECT a.*,s.name,s.size FROM artifacts a JOIN assets s ON s.id=a.asset_id WHERE coalesce(json_extract(a.manifest,'$.internalChatAudio'),0)=0 ORDER BY a.created_at DESC LIMIT 200",
      ).map((v) => ({ ...v, quality: parse(v.quality), manifest: undefined })),
      sources: all("SELECT * FROM sources"),
      skills: all(
        "SELECT id,skill_id,version,hash,origin,created_at FROM skills ORDER BY created_at DESC",
      ),
      characters: all("SELECT * FROM characters").map((v) => ({
        ...v,
        body: parse(v.body),
      })),
      outbox: all("SELECT * FROM outbox ORDER BY created_at DESC LIMIT 100"),
      nextSchedule: cfg.scheduleEnabled
        ? nextSchedule(new Date(), cfg).toISOString()
        : null,
      backups: backupList(),
    };
    if (req.user.role !== "admin") {
      result.backups = [];
      result.outbox = [];
      result.jobs = result.jobs.filter((j: any) => {
        if (j.type === "backup") return false;
        if (["conversation-export","chat-narration","chat-film"].includes(j.type)) return get("SELECT owner_id FROM conversations WHERE id=?",j.conversationId)?.owner_id===req.user.id;
        if (["wechat-draft","workflow-plan","workflow","source-review","policy-impact","visual-video","visual-create","visual-assistant","visual-web-import","visual-export","visual-runtime"].includes(j.type)) return parse(get("SELECT input FROM jobs WHERE id=?",j.id)?.input).actorId === req.user.id;
        if (j.type === "media") return get("SELECT owner_id FROM media_jobs WHERE job_id=?",j.id)?.owner_id === req.user.id;
        if (j.type === "explore")
          return (
            get(
              "SELECT c.owner_id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.job_id=? LIMIT 1",
              j.id,
            )?.owner_id === req.user.id
          );
        return true;
      });
    }
    if (req.user.role === "sales") {
      result.settings = { theme: cfg.theme, revision: cfg.revision };
      result.capabilities = {};
      result.counts = {
        snapshots: result.snapshots.length,
        artifacts: result.artifacts.filter((a: any) => a.mode === "release")
          .length,
      };
      result.artifacts = result.artifacts.filter(
        (a: any) => a.mode === "release",
      );
      result.topics = [];
      result.projects = [];
      result.jobs = [];
      result.sources = [];
      result.skills = [];
      result.characters = [];
      result.nextSchedule = null;
    }
    result.artifacts=result.artifacts.filter((a:any)=>{try{checkMediaAsset(a.asset_id,req.user);return true;}catch{return false;}});
    return result;
  });
  app.get("/api/snapshots/:id", async (req: any) => {
    const v = snapshotView(
      requireRow(get("SELECT * FROM snapshots WHERE id=?", req.params.id)),
    );
    return {
      ...v,
      media: (() => {
        const entry = get("SELECT detail FROM audit WHERE action='snapshot.media' AND entity_id=? ORDER BY created_at DESC LIMIT 1", v.id);
        if (!entry) return null;
        const source = parse(entry.detail);
        return { action: source.action, sourceAssetId: source.sourceAssetId, edited: source.edited };
      })(),
      claims: all("SELECT * FROM claims WHERE snapshot_id=?", v.id),
      previous: v.previous_id
        ? snapshotView(get("SELECT * FROM snapshots WHERE id=?", v.previous_id))
        : null,
      ocr: (() => {
        const entry = get(
          "SELECT detail FROM audit WHERE action='snapshot.ocr' AND entity_id=? ORDER BY created_at DESC LIMIT 1",
          v.id,
        );
        return entry ? parse(entry.detail) : null;
      })(),
    };
  });
  app.post("/api/imports", async (req: any, reply) => {
    const input = ImportInput.parse(req.body);
    const job = enqueue("import", input, req.headers["idempotency-key"]);
    return reply.code(202).send(job);
  });
  app.patch("/api/snapshots/:id", async (req: any) =>
    correctSnapshot(
      req.params.id,
      z
        .object({
          expectedMetadataHash: s,
          title: s,
          publisher: s,
          published: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .nullable(),
          documentType: z.enum([
            "待判断",
            "正式文件",
            "征求意见",
            "媒体解读",
            "历史资料",
          ]),
          scope: Scope,
          reason: z.string().min(5).max(3000),
        })
        .parse(req.body),
    ),
  );
  app.post("/api/uploads", async (req: any) => {
    const file = await req.file();
    if (!file) err("FILE_REQUIRED", "请选择文件");
    const bytes = await file.toBuffer();
    if (
      ![
        ".pdf",
        ".docx",
        ".md",
        ".txt",
        ".html",
        ".htm",
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".zip",
      ].includes(extname(file.filename).toLowerCase())
    )
      err("UNSUPPORTED_FILE", "文件类型暂不支持");
    const extension = extname(file.filename).toLowerCase();
    if (extension === ".zip" || extension === ".docx") validateArchive(bytes);
    const imageType =
      extension === ".png"
        ? "image/png"
        : extension === ".webp"
          ? "image/webp"
          : [".jpg", ".jpeg"].includes(extension)
            ? "image/jpeg"
            : null;
    if (imageType) {
      const valid =
        imageType === "image/png"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : imageType === "image/jpeg"
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : bytes.subarray(0, 4).toString() === "RIFF" &&
              bytes.subarray(8, 12).toString() === "WEBP";
      if (!valid) err("INVALID_IMAGE", "图片格式与文件内容不一致", 422);
    }
    const a = asset(
      bytes,
      file.filename.replace(/[<>:"/\\|?*]/g, "_"),
      imageType || file.mimetype,
    );
    if (
      [".png", ".jpg", ".jpeg", ".webp", ".zip"].includes(
        extname(a.name).toLowerCase(),
      )
    )
      return { ...a, path: undefined, text: null, needsOcr: !!imageType };
    const result = await extract(bytes, a.name, a.mime);
    return { ...a, path: undefined, ...result };
  });
  app.post("/api/import-upload", async (req: any) => {
    const b = z
      .object({
        assetId: s,
        title: s,
        scope: Scope,
        published: z.string().nullable().default(null),
        documentType: z.string().default("待判断"),
        publisher: z.string().default("用户提供"),
        ocrJobId: z.string().optional(),
        text: z.string().max(500000).optional(),
      })
      .parse(req.body);
    const { a, data } = assetBuffer(b.assetId);
    if (b.ocrJobId) {
      const job = requireRow(
        get(
          "SELECT * FROM jobs WHERE id=? AND type='ocr' AND state='succeeded'",
          b.ocrJobId,
        ),
      );
      const result = parse(job.result);
      if (result.sourceAssetId !== a.id)
        err("OCR_SOURCE_MISMATCH", "OCR结果与当前文件不一致", 422);
      return enqueue(
        "import",
        {
          ...b,
          assetId: a.id,
          text: b.text ?? result.text,
          ocrMetadata: {
            jobId: job.id,
            engine: result.engine,
            pageCount: result.pageCount,
            resultAssetId: result.resultAssetId,
            sourceAssetId: a.id,
            edited: b.text !== undefined && b.text !== result.text,
            warnings: result.warnings,
          },
        },
        req.headers["idempotency-key"],
      );
    }
    const extracted = await extract(data, a.name, a.mime);
    if ((extracted as any).needsOcr)
      err("OCR_REQUIRED", "文件含扫描页，请先完成OCR识别", 422);
    return enqueue("import", {
      ...b,
      assetId: a.id,
      text: b.text ?? extracted.text,
    });
  });
  app.post("/api/ocr", async (req: any) => {
    const b = z
      .object({ assetId: s, force: z.boolean().default(false) })
      .parse(req.body);
    assetBuffer(b.assetId);
    const capability = await ocrCapability();
    if (!capability.available) err("OCR_UNAVAILABLE", capability.reason, 503);
    return enqueue("ocr", b, req.headers["idempotency-key"]);
  });
  app.post("/api/claims", async (req: any) =>
    addClaim(
      z
        .object({
          snapshotId: s,
          text: z.string().min(5).max(10000),
          quote: z.string().min(5).max(10000),
          paragraphId: s,
        })
        .parse(req.body),
    ),
  );
  app.post("/api/claims/:id/verify", async (req: any) =>
    verifyClaim(
      req.params.id,
      z
        .object({
          revision: z.number().int(),
          status: z.enum(["pending", "partial", "verified", "excluded"]),
          reason: z.string().min(1).max(3000),
          scopeConfirmed: z.boolean(),
        })
        .parse(req.body),
    ),
  );
  app.post("/api/topics", async (req: any) =>
    makeTopic(
      z
        .object({
          snapshotId: s,
          title: s,
          summary: optionalString,
          angle: optionalString,
          audience: optionalString,
          scores: z.array(z.number()).length(5),
          reasons: z.array(z.string()).length(5),
        })
        .parse(req.body),
    ),
  );
  app.patch("/api/topics/:id", async (req: any) => {
    const b = z
      .object({
        revision: z.number().int(),
        status: z
          .enum(["待评估", "已采纳", "制作中", "待审核", "已完成", "已归档"])
          .optional(),
        favorite: z.boolean().optional(),
        deferred: z.boolean().optional(),
        note: z.string().max(10000).optional(),
      })
      .parse(req.body);
    const t = requireRow(get("SELECT * FROM topics WHERE id=?", req.params.id));
    if (t.revision !== b.revision)
      err("VERSION_CONFLICT", "选题已更新，请刷新", 409);
    run(
      "UPDATE topics SET status=?,favorite=?,deferred=?,note=?,revision=revision+1 WHERE id=?",
      b.status || t.status,
      Number(b.favorite ?? t.favorite),
      Number(b.deferred ?? t.deferred),
      b.note ?? t.note,
      t.id,
    );
    return topicView(get("SELECT * FROM topics WHERE id=?", t.id));
  });
  app.post("/api/projects", async (req: any) => {
    const input = z
      .object({
        title: s,
        scope: Scope,
        snapshotIds: z.array(s).max(20).default([]),
        topicId: z.string().optional(),
      })
      .parse(req.body);
    const key = req.headers["idempotency-key"];
    return tx(() => {
      if (key) {
        const prior = get(
          "SELECT * FROM audit WHERE action='project.request' AND json_extract(detail,'$.key')=?",
          key,
        );
        if (prior) {
          if (parse(prior.detail).hash !== hash(input))
            err("IDEMPOTENCY_CONFLICT", "请求键已用于不同项目", 409);
          return projectView(
            requireRow(
              get("SELECT * FROM projects WHERE id=?", prior.entity_id),
            ),
          );
        }
      }
      const p = createProject(input);
      if (key) audit("project.request", p.id, { key, hash: hash(input) });
      return p;
    });
  });
  app.get("/api/projects/:id", async (req: any) => {
    const p = projectView(
      requireRow(get("SELECT * FROM projects WHERE id=?", req.params.id)),
    );
    return {
      ...p,
      versions: all(
        "SELECT * FROM versions WHERE project_id=? ORDER BY created_at DESC",
        p.id,
      ).map(versionView),
      claims: projectClaims(p.id),
      snapshots: p.snapshotIds.map((sid: string) =>
        snapshotView(
          requireRow(get("SELECT * FROM snapshots WHERE id=?", sid)),
        ),
      ),
      drafts: all("SELECT * FROM drafts WHERE project_id=?", p.id).map((d) => ({
        ...d,
        body: parse(d.body),
      })),
    };
  });
  app.patch("/api/projects/:id/sources", async (req: any) => {
    const b = z
      .object({
        revision: z.number().int(),
        snapshotIds: z.array(s).min(1).max(20),
      })
      .parse(req.body);
    return tx(() => {
      const p = requireRow(
        get("SELECT * FROM projects WHERE id=?", req.params.id),
      );
      if (p.revision !== b.revision)
        err("VERSION_CONFLICT", "项目已更新，请刷新", 409);
      const ids = [...new Set(b.snapshotIds)];
      for (const sid of ids)
        requireRow(get("SELECT id FROM snapshots WHERE id=?", sid));
      const oldClaims = all(
        "SELECT DISTINCT c.snapshot_id FROM claims c JOIN version_claims vc ON vc.claim_id=c.id JOIN versions v ON v.id=vc.version_id WHERE v.project_id=?",
        p.id,
      );
      if (oldClaims.some((c) => !ids.includes(c.snapshot_id)))
        err(
          "SOURCE_IN_USE",
          "已被历史版本引用的资料不能移除；可添加新版并重新核验",
          409,
        );
      run(
        "UPDATE projects SET snapshot_ids=?,revision=revision+1 WHERE id=?",
        json(ids),
        p.id,
      );
      run("UPDATE versions SET stale=1 WHERE project_id=?", p.id);
      audit("project.sources", p.id, { snapshotIds: ids });
      return projectView(get("SELECT * FROM projects WHERE id=?", p.id));
    });
  });
  app.post("/api/projects/:id/master-template", async (req: any) => {
    const b = z.object({ expectedRevision: z.number().int() }).parse(req.body);
    return saveVersion({
      projectId: req.params.id,
      expectedRevision: b.expectedRevision,
      kind: "master",
      body: masterFromSources(req.params.id),
    });
  });
  app.post("/api/versions", async (req: any) =>
    saveVersion(versionInput.parse(req.body)),
  );
  app.post("/api/reviews", async (req: any) => {
    const b = z
      .object({
        versionId: s,
        decision: z.enum(["confirmed", "needs_changes"]),
        reason: optionalString,
      })
      .parse(req.body);
    return confirmVersion(b.versionId, b.decision, b.reason);
  });
  app.put("/api/drafts", async (req: any) => {
    const b = z
      .object({
        projectId: s,
        kind: Kind,
        body: Content,
        revision: z.number().int(),
      })
      .parse(req.body);
    requireRow(get("SELECT id FROM projects WHERE id=?", b.projectId));
    const old = get(
      "SELECT * FROM drafts WHERE project_id=? AND kind=?",
      b.projectId,
      b.kind,
    );
    if ((old?.revision || 0) !== b.revision)
      err("VERSION_CONFLICT", "另一页面已更新工作草稿", 409);
    run(
      "INSERT INTO drafts VALUES(?,?,?,?,?) ON CONFLICT(project_id,kind) DO UPDATE SET body=excluded.body,revision=excluded.revision,updated_at=excluded.updated_at",
      b.projectId,
      b.kind,
      json(b.body),
      b.revision + 1,
      now(),
    );
    return { revision: b.revision + 1 };
  });
  app.post("/api/agent/runs", async (req: any, reply) => {
    if (!hasSecret("deepseek"))
      err(
        "CAPABILITY_NOT_CONFIGURED",
        "请先在设置中配置 DeepSeek API Key",
        503,
      );
    if (!settings().allowExternalAI)
      err(
        "AI_CONSENT_REQUIRED",
        "请在设置中允许将选定资料发送给 DeepSeek",
        403,
      );
    const input = z
      .object({
        projectId: z.string().optional(),
        kind: z.enum([
          "research",
          "master",
          "policy",
          "speech",
          "wechat",
          "presentation",
          "storyboard",
          "patch",
        ]),
        snapshotIds: z.array(s).max(20).optional(),
        masterId: z.string().optional(),
        baseVersionId: z.string().optional(),
        blockIds: z.array(s).optional(),
        prompt: z.string().max(10000).default(""),
        duration: z.number().min(10).max(7200).default(90),
        slideCount: z.number().int().min(3).max(100).default(12),
        lectureMinutes: z.number().min(1).max(600).optional(),
        characterId: z.string().optional(),
        skillId: z.string().optional(),
      })
      .parse(req.body);
    const frozen = freezeAgentInput({
      ...input,
      actorId: req.user.id,
      character: input.characterId
        ? parse(
            requireRow(
              get("SELECT body FROM characters WHERE id=?", input.characterId),
            ).body,
          )
        : null,
    });
    return reply
      .code(202)
      .send(enqueue("agent", frozen, req.headers["idempotency-key"]));
  });
  app.post("/api/agent/probe", async () => {
    if (!settings().allowExternalAI)
      err(
        "AI_CONSENT_REQUIRED",
        "请在「设置 → DeepSeek Agent → 调用授权」勾选「允许 DeepSeek 调用」，再点击「保存并测试连接」。仅保存密钥不会开启调用。",
        403,
      );
    return probeDeepseek(AbortSignal.timeout(60000));
  });
  app.post("/api/patches/accept", async (req: any) => {
    const b = z
      .object({
        jobId: s,
        indices: z.array(z.number().int()).min(1),
        expectedRevision: z.number().int(),
      })
      .parse(req.body);
    const j = requireRow(
        get(
          "SELECT * FROM jobs WHERE id=? AND state='succeeded' AND type='agent'",
          b.jobId,
        ),
      ),
      r = parse(j.result);
    if (!r.baseVersionId) err("INVALID_PATCH", "该任务没有修改候选");
    const v = versionView(
      requireRow(get("SELECT * FROM versions WHERE id=?", r.baseVersionId)),
    );
    const body = structuredClone(v.body);
    for (const i of b.indices) {
      const patch = r.content.patches[i];
      if (!patch || !r.blockIds.includes(patch.blockId))
        err("INVALID_PATCH", "补丁范围无效");
      const block = body.blocks.find((x: any) => x.id === patch.blockId);
      if (!block || block.locked) err("LOCKED_BLOCK", "不能修改锁定内容");
      block[patch.field] = patch.value;
    }
    return saveVersion({
      projectId: v.project_id,
      kind: v.kind,
      masterId: v.master_id,
      body,
      baseVersionId: v.id,
      expectedRevision: b.expectedRevision,
      origin: "accepted-ai-patch",
    });
  });
  app.get("/api/jobs/:id", async (req: any) => {
    const j = jobView(
      requireRow(get("SELECT * FROM jobs WHERE id=?", req.params.id)),
    );
    return {
      ...j,
      events: all("SELECT * FROM events WHERE job_id=? ORDER BY seq", j.id).map(
        (v) => ({ ...v, payload: parse(v.payload) }),
      ),
    };
  });
  app.post("/api/jobs/:id/cancel", async (req: any) =>
    cancelJob(req.params.id),
  );
  app.post("/api/jobs/:id/retry", async (req: any) => retryJob(req.params.id));
  app.get("/api/jobs/:id/events", async (req: any, reply) => {
    requireRow(get("SELECT id FROM jobs WHERE id=?", req.params.id));
    let seq = Number(
      String(req.headers["last-event-id"] || req.query.after || "0")
        .split(":")
        .pop(),
    );
    if (!Number.isFinite(seq)) seq = 0;
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const send = () => {
      const current = sessionFor(req);
      try {
        if (!current?.user || current.user.mustChangePassword)
          throw new Error("revoked");
        checkJobAccess(req.params.id, current.user);
      } catch {
        close();
        return;
      }
      for (const e of all(
        "SELECT * FROM events WHERE job_id=? AND seq>? ORDER BY seq",
        req.params.id,
        seq,
      )) {
        reply.raw.write(
          `id: ${req.params.id}:${e.seq}\ndata: ${json({ type: e.type, ...parse(e.payload) })}\n\n`,
        );
        seq = e.seq;
      }
      reply.raw.write(": keepalive\n\n");
    };
    let timer: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      if (timer) clearInterval(timer);
      eventStreams.delete(close);
      reply.raw.end();
    };
    eventStreams.add(close);
    req.raw.on("close", close);
    send();
    if (!closed) timer = setInterval(send, 1500);
  });
  app.post("/api/monitor", async (req: any) => {
    const cfg = settings(),
      end = new Date();
    const requested = z
      .object({
        windowStart: z.iso.datetime().optional(),
        windowEnd: z.iso.datetime().optional(),
      })
      .parse(req.body || {});
    const windowStart =
      requested.windowStart ||
      new Date(end.getTime() - cfg.windowHours * 3600000).toISOString();
    const windowEnd = requested.windowEnd || end.toISOString();
    const duration = Date.parse(windowEnd) - Date.parse(windowStart);
    if (
      duration <= 0 ||
      duration > 31 * 86400000 ||
      Date.parse(windowEnd) > Date.now() + 60000
    )
      err(
        "INVALID_WINDOW",
        "采集时间跨度须不超过31天，结束时间不能晚于当前时间",
        422,
      );
    return enqueue(
      "monitor",
      {
        config: cfg,
        windowStart,
        windowEnd,
        sources: all("SELECT * FROM sources WHERE enabled=1"),
      },
      req.headers["idempotency-key"],
    );
  });
  app.get("/api/reports/:id", async (req: any) => {
    const r = requireRow(
      get("SELECT * FROM reports WHERE id=?", req.params.id),
    );
    const payload = parse(r.payload);
    if (req.user.role === "sales") delete payload.config;
    return { ...r, payload };
  });
  app.post("/api/exports", async (req: any) => {
    const b = z
      .object({
        targetType: z.enum(["version", "report", "snapshot", "topics"]),
        targetId: z.string().optional(),
        format: z.enum(["md", "html", "pdf", "docx", "pptx", "json", "csv"]),
        mode: z.enum(["draft", "release"]).default("draft"),
        ids: z.array(s).optional(),
      })
      .parse(req.body);
    return enqueue("export", freezeExport(b), req.headers["idempotency-key"]);
  });
  app.get("/api/artifacts/:id/download", async (req: any, reply) => {
    const r = requireRow(
      get("SELECT asset_id,format,manifest FROM artifacts WHERE id=?", req.params.id),
    );
    checkMediaAsset(r.asset_id, req.user);
    const { a, data } = assetBuffer(r.asset_id);
    const inline=req.query?.preview==="1" && parse(r.manifest).conversationId && ["html","md","pdf"].includes(r.format);
    reply
      .header(
        "Content-Disposition",
        `${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      )
      .type(inline && r.format==="md" ? "text/plain; charset=utf-8" : a.mime);
    return reply.send(data);
  });
  app.post("/api/projects/:id/package", async (req: any) => {
    const b = z
      .object({
        artifactIds: z.array(s).min(1).max(50),
        includeSources: z.boolean().default(false),
      })
      .parse(req.body);
    const p = projectView(
        requireRow(get("SELECT * FROM projects WHERE id=?", req.params.id)),
      ),
      zip = new AdmZip(),
      entries: any[] = [];
    let total = 0;
    for (const aid of [...new Set(b.artifactIds)]) {
      const item = requireRow(
        get(
          "SELECT a.* FROM artifacts a JOIN versions v ON v.id=a.target_id WHERE a.id=? AND v.project_id=?",
          aid,
          p.id,
        ),
      );
      const { a, data } = assetBuffer(item.asset_id);
      total += data.length;
      if (total > 100 * 1024 * 1024)
        err("PACKAGE_LIMIT", "交付包超过100MB，请分批选择");
      const path = "files/" + aid.slice(0, 8) + "_" + a.name;
      zip.addFile(path, data);
      entries.push({
        path,
        sha256: a.hash,
        versionId: item.target_id,
        mode: item.mode,
        quality: parse(item.quality),
        contentManifest: parse(item.manifest),
      });
    }
    if (b.includeSources)
      for (const sid of p.snapshotIds) {
        const source = requireRow(
          get("SELECT * FROM snapshots WHERE id=?", sid),
        );
        const path = "sources/" + sid + ".txt",
          bytes = Buffer.from(source.body);
        zip.addFile(path, bytes);
        entries.push({
          path,
          sha256: hash(bytes),
          snapshotId: sid,
          url: source.url,
          published: source.published,
        });
      }
    zip.addFile(
      "manifest.json",
      Buffer.from(
        json({
          schemaVersion: "1.0",
          projectId: p.id,
          title: p.title,
          scope: p.scope,
          createdAt: now(),
          includesSourceText: b.includeSources,
          entries,
        }),
      ),
    );
    const file = asset(
      zip.toBuffer(),
      "EcuStudio_project_" + p.id.slice(0, 8) + ".zip",
      "application/zip",
      "delivery",
    );
    audit("project.package", p.id, {
      artifactIds: b.artifactIds,
      includeSources: b.includeSources,
    });
    return { assetId: file.id, name: file.name };
  });
  app.get("/api/assets/:id", async (req: any, reply) => {
    checkMediaAsset(req.params.id, req.user);
    const { a, data } = assetBuffer(req.params.id);
    if (!["image/png", "image/jpeg", "image/webp", "image/gif", "audio/wav", "audio/mpeg", "audio/ogg", "video/mp4"].includes(a.mime))
      reply.header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      );
    return reply.type(a.mime).send(data);
  });
  app.patch("/api/settings/deepseek", async (req: any) => {
    const b = z
      .object({ revision: z.number().int(), settings: DeepSeekSettings })
      .parse(req.body);
    return tx(() => {
      const current = settings();
      if (current.revision !== b.revision)
        err(
          "VERSION_CONFLICT",
          "设置已变化，请刷新后重试；本次未开启或测试 DeepSeek",
          409,
        );
      const { revision, ...body } = current;
      run(
        "UPDATE settings SET body=?,revision=revision+1 WHERE id=1",
        json({ ...body, ...b.settings }),
      );
      audit("settings.deepseek", "1", {
        allowExternalAI: b.settings.allowExternalAI,
        model: b.settings.model,
      });
      return settings();
    });
  });
  app.patch("/api/settings/theme", async (req: any) => {
    const b = z
      .object({
        revision: z.number().int(),
        theme: z.enum(["scholar", "obsidian"]),
      })
      .strict()
      .parse(req.body);
    return tx(() => {
      const { revision, ...current } = settings();
      if (revision !== b.revision)
        err("VERSION_CONFLICT", "主题设置已更新，请稍后重试", 409);
      run(
        "UPDATE settings SET body=?,revision=revision+1 WHERE id=1",
        json({ ...current, theme: b.theme }),
      );
      audit("settings.theme", "1", { theme: b.theme });
      return settings();
    });
  });
  app.put("/api/settings", async (req: any) => {
    const b = z
      .object({ revision: z.number().int(), settings: Settings })
      .parse(req.body);
    if (settings().revision !== b.revision)
      err("VERSION_CONFLICT", "设置已变化，请刷新", 409);
    if (
      b.settings.autoSend &&
      (!b.settings.targetName || !hasSecret("dingtalkWebhook"))
    )
      err("NOTIFICATION_NOT_CONFIGURED", "启用自动推送前需配置目标与机器人");
    run(
      "UPDATE settings SET body=?,revision=revision+1 WHERE id=1",
      json(b.settings),
    );
    audit("settings.update", "1", {
      scheduleEnabled: b.settings.scheduleEnabled,
      autoSend: b.settings.autoSend,
    });
    return settings();
  });
  app.post("/api/secrets", async (req: any) => {
    const b = z
      .object({
        name: z.enum(["deepseek", "dingtalkWebhook", "dingtalkSign"]),
        value: z.string().max(4000),
      })
      .parse(req.body);
    if (b.name === "dingtalkWebhook" && b.value) {
      const u = new URL(b.value);
      if (
        u.protocol !== "https:" ||
        u.hostname !== "oapi.dingtalk.com" ||
        u.pathname !== "/robot/send"
      )
        err("INVALID_WEBHOOK", "请使用官方钉钉群机器人地址");
    }
    await secretOperations.save(b.name, b.value);
    audit("secret.configured", b.name, { present: Boolean(b.value) });
    return { configured: hasSecret(b.name) };
  });
  app.post('/api/secrets/diagnose',async()=>secretOperations.diagnose());
  app.post("/api/sources", async (req: any) => {
    const b = z
      .object({
        name: s,
        url: z.string().url(),
        grade: z.enum(["A", "B", "C"]).default("A"),
        scope: Scope,
      })
      .parse(req.body);
    await publicUrl(b.url);
    const sid = id();
    run(
      "INSERT INTO sources(id,name,url,grade,scope) VALUES(?,?,?,?,?)",
      sid,
      b.name,
      b.url,
      b.grade,
      json(b.scope),
    );
    return get("SELECT * FROM sources WHERE id=?", sid);
  });
  app.patch("/api/sources/:id", async (req: any) => {
    const b = z.object({ enabled: z.boolean() }).parse(req.body);
    run(
      "UPDATE sources SET enabled=? WHERE id=?",
      Number(b.enabled),
      req.params.id,
    );
    return { ok: true };
  });
  app.post("/api/notifications/preview", async (req: any) =>
    previewNotification(z.object({ reportId: s }).parse(req.body).reportId),
  );
  app.post("/api/notifications/send", async (req: any) => {
    const b = z
      .object({
        ids: z.array(s).min(1).max(20),
        target: s,
        confirmed: z.literal(true),
      })
      .parse(req.body);
    return authorizeNotification(b.ids, b.target);
  });
  app.post("/api/characters", async (req: any) => {
    const b = z
      .object({
        name: s,
        identity: s,
        appearance: s,
        voice: s,
        outfit: optionalString,
        imageAssetId: z.string().optional(),
      })
      .parse(req.body);
    if (b.imageAssetId)
      requireRow(get("SELECT id FROM assets WHERE id=?", b.imageAssetId));
    const cid = id();
    run(
      "INSERT INTO characters VALUES(?,?,?,?,?)",
      cid,
      b.name,
      json(b),
      1,
      now(),
    );
    return { id: cid, ...b };
  });
  app.post("/api/skills/rescan", async () => {
    const skill = registerSkill();
    return { id: skill.id, hash: skill.hash };
  });
  app.post("/api/skills/import", async (req: any) => {
    const b = z.object({ assetId: s }).parse(req.body);
    const { data } = assetBuffer(b.assetId),
      zip = new AdmZip(data),
      files: Record<string, string> = {};
    const entries = zip.getEntries();
    if (
      entries.length > 200 ||
      entries.reduce((n, e) => n + e.header.size, 0) > 5 * 1024 * 1024
    )
      err("ZIP_LIMIT", "Skill包超过限制");
    for (const e of entries) {
      if (e.isDirectory) continue;
      const path = e.entryName.replaceAll("\\", "/");
      if (
        path.startsWith("/") ||
        path.includes("..") ||
        path.includes(":") ||
        ((e.attr >>> 16) & 0xf000) === 0xa000 ||
        !path.endsWith(".md")
      )
        err("UNSAFE_SKILL", "仅接受无脚本、无越界路径的 Markdown 工作流包");
      files[path.replace(/^educontent-studio\//, "")] = e
        .getData()
        .toString("utf8");
    }
    const skill = registerSkill(files, "user-imported");
    return { id: skill.id, hash: skill.hash, validation: "imported_not_run" };
  });
  app.post("/api/backups", async () => enqueue("backup", {}));
  app.get("/api/backups/:name", async (req: any, reply) => {
    if (!/^EcuStudio_backup_[\w-]+\.zip$/.test(req.params.name))
      err("UNSAFE_PATH", "无效文件");
    return reply
      .header(
        "Content-Disposition",
        `attachment; filename="${req.params.name}"`,
      )
      .type("application/zip")
      .send(
        readFileSync(existingInside(join(dataDir, "backups"), req.params.name)),
      );
  });
  app.post("/api/restore/validate", async (req: any) => {
    const file = await req.file({ limits: { fileSize: 250 * 1024 * 1024 } });
    if (!file) err("FILE_REQUIRED", "请选择备份");
    return validateBackup(await file.toBuffer());
  });
  app.post("/api/restore/commit", async (req: any) => {
    const b = z
      .object({ token: s, confirmed: z.literal(true) })
      .parse(req.body);
    if (worker?.busy || worker?.senderBusy)
      err("WORKER_BUSY", "请等待后台任务完成再恢复", 409);
    restoring = true;
    worker?.stop();
    try {
      return await restoreBackup(b.token);
    } finally {
      restoring = false;
      if (startWorker) worker = new Worker(wechatClient,wechatSecretOperations).start();
    }
  });
  app.get("/api/projects/:id/task-package", async (req: any, reply) => {
    const p = projectView(
      requireRow(get("SELECT * FROM projects WHERE id=?", req.params.id)),
    );
    const master = get(
      "SELECT * FROM versions WHERE project_id=? AND kind='master' ORDER BY number DESC LIMIT 1",
      p.id,
    );
    const zip = new AdmZip();
    zip.addFile(
      "task.json",
      Buffer.from(
        json({
          schemaVersion: "1.0",
          project: p,
          master: master ? versionView(master) : null,
          snapshots: p.snapshotIds.map((sid: string) =>
            snapshotView(
              requireRow(get("SELECT * FROM snapshots WHERE id=?", sid)),
            ),
          ),
          claims: projectClaims(p.id),
          instructions:
            "输出 Content JSON，由工作台导入为候选。不要返回执行命令。",
          resultSchema: z.toJSONSchema(Content),
        }),
      ),
    );
    return reply
      .type("application/zip")
      .header(
        "Content-Disposition",
        'attachment; filename="ecustudio-task.zip"',
      )
      .send(zip.toBuffer());
  });
  app.post("/api/external-results", async (req: any) =>
    saveVersion({ ...versionInput.parse(req.body), origin: "external_import" }),
  );
  if (existsSync(process.env.ECUSTUDIO_WEB_DIR||join(root, "dist")))
    await app.register(staticPlugin, { root: process.env.ECUSTUDIO_WEB_DIR||join(root, "dist"), prefix: "/" });
  else
    app.get("/", async (req, reply) =>
      reply
        .type("text/html")
        .send("<h1>EcuStudio</h1><p>前端尚未构建，请运行 npm run build。</p>"),
    );
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith("/api/")
      ? reply.code(404).send({ error: { message: "接口不存在" } })
      : (reply as any).sendFile
        ? (reply as any).sendFile("index.html")
        : reply.code(404).send("Not found"),
  );
  registerSkill();
  if (startWorker) worker = new Worker(wechatClient,wechatSecretOperations).start();
  app.addHook("onClose", async () => worker?.stop());
  return app;
}
