import {renderConversationFiles} from "./conversation-files.js";
import {runWechatDraft,wechatSecrets} from './wechat.js';
import {officialWechat} from './wechat-client.js';
import {archiveSnapshotToKnowledge} from './ingestion-knowledge.js';
import {runVisualWebImport} from './visual-web.js';
import { runVisualAssistant } from './visual-editor.js';
import * as cheerio from "cheerio";
import { createHmac } from "node:crypto";
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
  err,
  settings,
  shanghaiDate,
  requireRow,
  audit,
} from "./db.js";
import { fetchPublic } from "./security.js";
import {
  importMaterial,
  eligible,
  topicView,
  saveVersion,
  addClaim,
  makeTopic,
} from "./domain.js";
import { runAgent, freezeAgentInput } from "./agent.js";
import { exportFile } from "./exports.js";
import { hasSecret, getSecret } from "./secrets.js";
import { createBackup } from "./backup.js";
import { recognizeDocument } from "./ocr.js";
import { runProduction } from "./production.js";
import { runExplore, commitExplore, ensureExploreUser, runConversationExport } from "./explore.js";
import { runMedia } from "./media.js";
import {runPlan,runWorkflow,runImpact,runSourceReview,runVisualVideo} from './workflows.js';
import { runVisualExport } from './visual-export.js';
import { runVisualCreate,runVisualRuntime } from './visual-studio.js';
import { upgradeMaintenance } from "./maintenance.js";

export function jobView(j: any, compact = false) {
  const production = j.type === "production" ? parse(j.input) : null;
  const checkpoint = production ? parse(j.checkpoint) : null;
  let result = parse(j.result, null);
  if (j.type === "ocr" && result)
    result = {
      ...result,
      pages: compact
        ? undefined
        : result.pages?.map((p: any) => ({
            page: p.page,
            method: p.method,
            text: p.text,
            confidence: p.confidence,
          })),
      text: compact ? undefined : result.text,
    };
  return {
    ...j,
    production: production ? {
      projectId:production.projectId, title:production.title, templateName:production.templateName,
      formats:production.formats, deliveryFormats:production.deliveryFormats, deliveryJobId:checkpoint.deliveryJobId,
      masterId:checkpoint.masterId, versionId:checkpoint.versionId,
      completedStages:[checkpoint.research && 'research',checkpoint.masterId && 'master',checkpoint.versionId && 'content',j.state==='succeeded' && 'export'].filter(Boolean),
    } : undefined,
    conversationId: ["explore","conversation-export"].includes(j.type) ? parse(j.input).conversationId : undefined,
    parentProductionId:j.type === "visual-export" ? parse(j.input).parentProductionId : undefined,
    input: undefined,
    input_hash: undefined,
    result,
    error: parse(j.error, null),
    checkpoint: undefined,
  };
}
export function enqueue(type: string, input: any, key: string = id()) {
  const digest = hash({ type, input }),
    previous = get("SELECT * FROM jobs WHERE idempotency_key=?", key);
  if (previous) {
    if (previous.input_hash !== digest)
      err("IDEMPOTENCY_CONFLICT", "相同请求键对应不同内容", 409);
    return jobView(previous);
  }
  const jid = id();
  run(
    "INSERT INTO jobs(id,type,state,stage,input,input_hash,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?)",
    jid,
    type,
    "queued",
    "queued",
    json(input),
    digest,
    key,
    now(),
  );
  event(jid, "state", { state: "queued", message: "任务已排队" });
  return jobView(get("SELECT * FROM jobs WHERE id=?", jid));
}
export function event(jobId: string, type: string, payload: any) {
  const seq =
    (get("SELECT MAX(seq) AS seq FROM events WHERE job_id=?", jobId)?.seq ||
      0) + 1;
  run(
    "INSERT INTO events VALUES(?,?,?,?,?)",
    jobId,
    seq,
    type,
    json(payload),
    now(),
  );
}
export function cancelJob(jid: string) {
  const j = requireRow(get("SELECT * FROM jobs WHERE id=?", jid));
  if (["succeeded", "failed", "canceled"].includes(j.state)) return jobView(j);
  run(
    "UPDATE jobs SET cancel_requested=1,state=CASE WHEN state IN ('queued','awaiting_input','interrupted') THEN 'canceled' ELSE state END WHERE id=?",
    jid,
  );
  audit("job.cancel", jid);
  return jobView(get("SELECT * FROM jobs WHERE id=?", jid));
}
export function retryJob(jid: string) {
  const j = requireRow(get("SELECT * FROM jobs WHERE id=?", jid));
  if (!["failed", "interrupted", "partial"].includes(j.state))
    err("RETRY_NOT_ALLOWED", "当前状态不能重试", 409);
  run(
    "UPDATE jobs SET state='queued',cancel_requested=0,error=NULL,lease_owner=NULL,lease_until=NULL WHERE id=?",
    jid,
  );
  event(jid, "state", { state: "queued", message: "安全重试已排队" });
  return jobView(get("SELECT * FROM jobs WHERE id=?", jid));
}

export function nextSchedule(date: Date, cfg: any, previous = false) {
  const day = shanghaiDate(date);
  let candidate = new Date(`${day}T${cfg.scheduleTime}:00+08:00`);
  if (previous ? candidate > date : candidate <= date)
    candidate = new Date(candidate.getTime() + (previous ? -1 : 1) * 86400000);
  while (
    cfg.weekdaysOnly &&
    [0, 6].includes(new Date(candidate.getTime() + 8 * 3600000).getUTCDay())
  )
    candidate = new Date(candidate.getTime() + (previous ? -1 : 1) * 86400000);
  return candidate;
}
export function scheduleTick(date = new Date()) {
  const cfg = settings();
  if (!cfg.scheduleEnabled) return;
  const scheduled = nextSchedule(date, cfg, true);
  if (date.getTime() - scheduled.getTime() > 86400000) return;
  tx(() => {
    if (
      get(
        "SELECT 1 FROM occurrences WHERE scheduled_at=?",
        scheduled.toISOString(),
      )
    )
      return;
    const job = enqueue(
      "monitor",
      {
        config: cfg,
        sources: all("SELECT * FROM sources WHERE enabled=1"),
        windowStart: new Date(
          scheduled.getTime() - cfg.windowHours * 3600000,
        ).toISOString(),
        windowEnd: scheduled.toISOString(),
        scheduledAt: scheduled.toISOString(),
      },
      "schedule:" + scheduled.toISOString(),
    );
    run(
      "INSERT INTO occurrences VALUES(?,?,?)",
      scheduled.toISOString(),
      job.id,
      now(),
    );
  });
}
export async function monitor(
  input: any,
  jobId: string,
  signal: AbortSignal,
  progress: (s: string, p: any) => void,
  sourceFetch: typeof fetchPublic = fetchPublic,
) {
  const old = get("SELECT * FROM reports WHERE job_id=?", jobId);
  if (old) return { reportId: old.id };
  const sources = input.sources || all("SELECT * FROM sources WHERE enabled=1");
  if (!sources.length) err("NO_SOURCES", "请先启用监测来源");
  let success = 0,
    newCount = 0,
    updatedCount = 0,
    candidates = 0;
  const failures: any[] = [];
  const imported: string[] = [];
  for (const source of sources) {
    signal.throwIfAborted();
    progress("collect", { message: "正在采集 " + source.name });
    try {
      const r = await sourceFetch(source.url, signal);
      const raw = new TextDecoder(
        /charset.*gb/i.test(r.type) ? "gb18030" : "utf-8",
      ).decode(r.buffer);
      const $ = cheerio.load(raw);
      const links: any[] = [];
      $("a[href]").each((i, a) => {
        const text = $(a).text().trim(),
          href = $(a).attr("href");
        if (text.length < 8 || !href) return;
        const keywords = String(input.config.keywords || "")
          .split(/[,，]/)
          .map((s: string) => s.trim())
          .filter(Boolean);
        if (keywords.length && !keywords.some((k: string) => text.includes(k)))
          return;
        try {
          const u = new URL(href, r.url);
          if (
            u.hostname !== new URL(r.url).hostname ||
            !u.pathname.endsWith(".html") ||
            /index\.html$/.test(u.pathname)
          )
            return;
          const surrounding = $(a).parent().text();
          const published =
            surrounding.match(/20\d{2}-\d{2}-\d{2}/)?.[0] || null;
          if (!published) return;
          const day = new Date(published + "T23:59:59+08:00").getTime();
          if (
            day < new Date(input.windowStart).getTime() ||
            new Date(published + "T00:00:00+08:00").getTime() >
              new Date(input.windowEnd).getTime()
          )
            return;
          if (!links.some((x) => x.url === u.href))
            links.push({ url: u.href, title: text, published });
        } catch {}
      });
      candidates += links.length;
      if (links.length > 15)
        failures.push({
          source: source.name,
          message: `本轮仅处理前15条候选，另有${links.length - 15}条待后续采集`,
        });
      for (const link of links.slice(0, 15)) {
        signal.throwIfAborted();
        try {
          const prior = get("SELECT id FROM snapshots WHERE url=?", link.url);
          const scope = {
            ...parse(source.scope),
            year: Number(
              link.title.match(/20\d{2}/)?.[0] || parse(source.scope).year,
            ),
          };
          const saved = await importMaterial(
            {
              ...link,
              scope,
              sourceId: source.id,
              publisher: source.name,
              documentType: "待判断",
            },
            signal,
          );
          if (!saved.duplicate) {
            prior ? updatedCount++ : newCount++;
            imported.push(saved.id);
            const recipient=input.actorId||get("SELECT id FROM users WHERE role='admin' AND status='active' ORDER BY created_at LIMIT 1")?.id;
            if(recipient)archiveSnapshotToKnowledge(saved.id,recipient,'自动采集');
          }
        } catch (e) {
          failures.push({ source: link.title, message: (e as Error).message });
        }
      }
      success++;
      run(
        "UPDATE sources SET last_success=?,last_error=NULL WHERE id=?",
        now(),
        source.id,
      );
    } catch (e) {
      failures.push({ source: source.name, message: (e as Error).message });
      run(
        "UPDATE sources SET last_error=? WHERE id=?",
        (e as Error).message,
        source.id,
      );
    }
  }
  signal.throwIfAborted();
  if (success === 0)
    err("ALL_SOURCES_FAILED", "全部来源采集失败；保留上一份日报", 502);
  if (
    imported.length &&
    hasSecret("deepseek") &&
    input.config.allowExternalAI
  ) {
    progress("analyze", { message: "DeepSeek 分析本轮资料，结果保持待核实" });
    try {
      const frozen = freezeAgentInput({
        kind: "research",
        snapshotIds: imported.slice(0, 5),
      });
      const result = await runAgent(
        { ...frozen, config: input.config },
        progress,
        signal,
      );
      tx(() => {
        result.content.claims.forEach((c: any) => addClaim(c));
        result.content.topics.forEach((t: any) => makeTopic(t));
      });
      if (imported.length > 5)
        failures.push({
          source: "AI分析",
          message:
            "本轮分析前5份资料，其余可在资料页手动触发，避免超出调用预算",
        });
    } catch (e) {
      failures.push({ source: "AI分析", message: (e as Error).message });
    }
  }
  const windowDate = shanghaiDate(new Date(input.windowStart)),
    endDate = shanghaiDate(new Date(input.windowEnd));
  const snapshots = all(
    "SELECT * FROM snapshots WHERE published>=? AND published<=?",
    windowDate,
    endDate,
  ).filter(
    (s) =>
      parse(s.scope).region === input.config.region &&
      !get("SELECT 1 FROM snapshots WHERE previous_id=?", s.id) &&
      !get(
        "SELECT 1 FROM claims WHERE snapshot_id=? GROUP BY snapshot_id HAVING count(*)=sum(status='excluded')",
        s.id,
      ),
  );
  const allowed = new Set(
    snapshots.filter((s) => eligible(s.id)).map((s) => s.id),
  );
  const topics = all("SELECT * FROM topics ORDER BY total DESC,created_at DESC")
    .filter(
      (t) => allowed.has(t.snapshot_id) && !t.deferred && t.status !== "已归档",
    )
    .map(topicView);
  const date = shanghaiDate(new Date(input.windowEnd)),
    payload = {
      date,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      actualCompletedAt: now(),
      candidates,
      newCount,
      updatedCount,
      validCount: snapshots.length,
      verifiedCount: allowed.size,
      sourceCount: sources.length,
      successfulSources: success,
      topics: topics.slice(0, 10),
      sources: snapshots.map((s) => ({
        id: s.id,
        title: s.title,
        publisher: s.publisher,
        url: s.url,
        published: s.published,
      })),
      warnings: failures.map((f) => `${f.source}：${f.message}`),
      imported,
      config: input.config,
      message: topics.length
        ? "仅推荐已核实信息"
        : newCount
          ? "已采集新资料，等待事实核验和选题评估"
          : "今日暂无符合条件的新增推荐；未核实资料不进入推荐榜单",
    };
  const rid = id();
  tx(() => {
    run(
      "INSERT INTO reports VALUES(?,?,?,?,?,?,?,?)",
      rid,
      date,
      (get("SELECT MAX(number) n FROM reports WHERE date=?", date)?.n || 0) + 1,
      json(payload),
      hash(payload),
      jobId,
      failures.length ? "partial" : "complete",
      now(),
    );
    audit("report.commit", rid, { jobId });
  });
  if (
    input.config.autoSend &&
    settings().autoSend &&
    hasSecret("dingtalkWebhook")
  ) {
    const messages = previewNotification(rid);
    authorizeNotification(
      messages.map((x) => x.id),
      messages[0]?.target,
      true,
    );
  }
  return {
    reportId: rid,
    coverage: failures.length ? "partial" : "complete",
    newCount,
    updatedCount,
  };
}
export function previewNotification(reportId: string) {
  const r = requireRow(get("SELECT * FROM reports WHERE id=?", reportId)),
    p = parse(r.payload),
    cfg = settings();
  const header = `## EcuStudio｜每日教育情报 ${r.date}\n\n监测：${p.windowStart} — ${p.windowEnd}\n\n有效 ${p.validCount} 条 · 已核实 ${p.verifiedCount} 条 · 推荐 ${p.topics.length} 条\n\n`;
  const sections = p.topics.map(
    (t: any, i: number) =>
      `${i + 1}. **${t.title}**（${t.total}分）\n\n${t.summary}\n\n创作角度：${t.angle}\n\n[原始来源](${p.sources.find((s: any) => s.id === t.snapshot_id)?.url || "https://www.bjeea.cn/"})\n\n`,
  );
  if (!sections.length) sections.push(p.message);
  const parts: string[] = [];
  let current = header;
  const limit = 12000 - 512,
    headerBytes = Buffer.byteLength(header);
  if (headerBytes >= limit)
    err("NOTIFICATION_TOO_LARGE", "通知头部超过分段限制");
  for (const section of sections) {
    for (const line of String(section || "").split(/(?<=\n)/)) {
      if (Buffer.byteLength(line) <= limit - headerBytes) {
        if (Buffer.byteLength(current + line) > limit) {
          parts.push(current);
          current = header;
        }
        current += line;
      } else {
        for (const char of line) {
          if (Buffer.byteLength(current + char) > limit) {
            parts.push(current);
            current = header;
          }
          current += char;
        }
      }
    }
  }
  parts.push(current);
  return parts.map((body, i) => {
    const text = body + `\n\n日报 v${r.number} · ${r.id} · 任务 ${r.job_id}`,
      digest = hash(text);
    const old = get(
      "SELECT * FROM outbox WHERE report_id=? AND target=? AND hash=? AND part=?",
      r.id,
      cfg.targetName,
      digest,
      i + 1,
    );
    if (old) return old;
    const oid = id();
    run(
      "INSERT INTO outbox VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      oid,
      r.id,
      cfg.targetName,
      digest,
      text,
      "draft",
      i + 1,
      parts.length,
      null,
      null,
      now(),
    );
    return get("SELECT * FROM outbox WHERE id=?", oid);
  });
}
export function authorizeNotification(
  ids: string[],
  target: string,
  automatic = false,
) {
  if (
    !target ||
    target !== settings().targetName ||
    !hasSecret("dingtalkWebhook")
  )
    err("NOTIFICATION_NOT_CONFIGURED", "请配置目标群名称与机器人");
  for (const oid of ids) {
    const o = requireRow(get("SELECT * FROM outbox WHERE id=?", oid));
    if (o.target !== target)
      err("TARGET_CHANGED", "目标已变化，请重新预览", 409);
    if (!["draft", "failed"].includes(o.state))
      err("SEND_NOT_ALLOWED", "已发送或结果不明的消息不能重复发送", 409);
  }
  tx(() => {
    for (const oid of ids)
      run("UPDATE outbox SET state='pending',error=NULL WHERE id=?", oid);
    audit("notification.authorize", ids.join(","), { target, automatic });
  });
  return { queued: ids.length };
}
export async function deliverNotification(transport: typeof fetch = fetch) {
  const o = get(
    "SELECT * FROM outbox WHERE state='pending' ORDER BY created_at,part LIMIT 1",
  );
  if (!o) return;
  const webhook = await getSecret("dingtalkWebhook");
  if (!webhook || o.target !== settings().targetName) {
    run(
      "UPDATE outbox SET state='blocked',error='配置或目标变化' WHERE id=?",
      o.id,
    );
    return;
  }
  const u = new URL(webhook);
  if (
    u.protocol !== "https:" ||
    u.hostname !== "oapi.dingtalk.com" ||
    u.pathname !== "/robot/send"
  )
    err("INVALID_WEBHOOK", "仅支持官方钉钉机器人 HTTPS 地址");
  const secret = await getSecret("dingtalkSign");
  if (secret) {
    const timestamp = Date.now().toString();
    u.searchParams.set("timestamp", timestamp);
    u.searchParams.set(
      "sign",
      createHmac("sha256", secret)
        .update(timestamp + "\n" + secret)
        .digest("base64"),
    );
  }
  const claimed = run(
    "UPDATE outbox SET state='sending' WHERE id=? AND state='pending'",
    o.id,
  );
  if (!claimed.changes) return;
  try {
    const res = await transport(u, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: json({
        msgtype: "markdown",
        markdown: { title: "EcuStudio每日教育情报", text: o.body },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      run(
        "UPDATE outbox SET state='unknown',error=? WHERE id=?",
        `HTTP ${res.status}，请核查群消息`,
        o.id,
      );
      return;
    }
    const body: any = await res.json();
    run(
      "UPDATE outbox SET state=?,provider_id=?,error=? WHERE id=?",
      body.errcode === 0 ? "sent" : "failed",
      body.messageId || null,
      body.errcode === 0 ? null : `钉钉错误码 ${body.errcode}`,
      o.id,
    );
  } catch {
    run(
      "UPDATE outbox SET state='unknown',error='发送结果待确认，请核查目标群，勿盲目重发' WHERE id=?",
      o.id,
    );
  }
}

export class Worker {
  constructor(private wechatClient=officialWechat,private wechatSecretOperations=wechatSecrets,private exploreTransport:typeof fetch=fetch) {}
  owner = id();
  busy = false;
  timer: any;
  senderBusy = false;
  controller?: AbortController;
  stopping = false;
  start() {
    run(
      "UPDATE outbox SET state='unknown',error='进程曾中断，请核查发送结果' WHERE state='sending'",
    );
    this.timer = setInterval(() => {
      if (this.stopping || upgradeMaintenance()) return;
      try {
        scheduleTick();
        void this.tick();
        if (!this.senderBusy) {
          this.senderBusy = true;
          void deliverNotification()
            .catch(() => {})
            .finally(() => (this.senderBusy = false));
        }
      } catch {}
    }, 1000);
    return this;
  }
  async tick() {
    if (this.busy || upgradeMaintenance()) return;
    run(
      "UPDATE jobs SET state='interrupted',lease_owner=NULL WHERE state='running' AND lease_until<?",
      now(),
    );
    const j = tx(() => {
      const row = get(
        "SELECT * FROM jobs WHERE state='queued' ORDER BY created_at LIMIT 1",
      );
      if (!row) return null;
      run(
        "UPDATE jobs SET state='running',attempt=attempt+1,fence=fence+1,lease_owner=?,lease_until=?,started_at=? WHERE id=?",
        this.owner,
        new Date(Date.now() + 60000).toISOString(),
        now(),
        row.id,
      );
      return get("SELECT * FROM jobs WHERE id=?", row.id);
    });
    if (!j) return;
    this.busy = true;
    this.controller = new AbortController();
    const signal = AbortSignal.any([
      this.controller.signal,
      AbortSignal.timeout(
        (parse(j.input).config?.timeoutSeconds || 1200) * 1000,
      ),
    ]);
    const heartbeat = setInterval(() => {
      if (
        get("SELECT cancel_requested FROM jobs WHERE id=?", j.id)
          ?.cancel_requested
      )
        this.controller?.abort(new Error("任务已取消"));
      run(
        "UPDATE jobs SET lease_until=? WHERE id=? AND lease_owner=? AND fence=?",
        new Date(Date.now() + 60000).toISOString(),
        j.id,
        this.owner,
        j.fence,
      );
    }, 1000);
    const progress = (stage: string, payload: any) => {
      signal.throwIfAborted();
      if (get("SELECT fence FROM jobs WHERE id=?", j.id)?.fence !== j.fence)
        throw new Error("租约已失效");
      run("UPDATE jobs SET stage=? WHERE id=?", stage, j.id);
      event(j.id, stage, payload);
    };
    try {
      progress("running", { state: "running", message: "开始执行" });
      const input = parse(j.input);
      let result: any;
      if (j.type === "production")
        result = await runProduction(input, j.id, progress, signal);
      else if (j.type === "conversation-export") result=await runConversationExport(input,j.id,progress,signal);
      else if (j.type === "wechat-draft") result = await runWechatDraft(input,j.id,progress,signal,this.wechatClient,this.wechatSecretOperations);
      else if (j.type === "workflow-plan") result = await runPlan(input,progress,signal);
      else if (j.type === "workflow") result = await runWorkflow(input,j.id,progress,signal);
      else if (j.type === "source-review") result = await runSourceReview(input,j.id,progress,signal);
      else if (j.type === "policy-impact") result = await runImpact(input,progress,signal);
      else if (j.type === 'visual-web-import') result = await runVisualWebImport(input,j.id,progress,signal);
      else if (j.type === 'visual-assistant') result = await runVisualAssistant(input,j.id,progress,signal);
      else if (j.type === 'visual-create') result = await runVisualCreate(input,j.id,progress,signal);
      else if (j.type === 'visual-export') result = await runVisualExport(input,j.id,progress,signal);
      else if (j.type === 'visual-runtime') result = await runVisualRuntime(input,progress,signal);
      else if (j.type === "visual-video") result = await runVisualVideo(input,j.id,progress,signal);
      else if (j.type === "media")
        result = await runMedia(input, j.id, progress, signal);
      else if (j.type === "import")
        result = await importMaterial(input, signal);
      else if (j.type === "ocr")
        result = await recognizeDocument(
          input.assetId,
          signal,
          progress,
          input.force,
        );
      else if (j.type === "explore") {
        let response = parse(j.checkpoint).exploreResult;
        if (!response) {
          response = await runExplore(input, progress, signal,this.exploreTransport);
          progress("prepare",{message:"本轮内容已整理"});
          run(
            "UPDATE jobs SET checkpoint=? WHERE id=? AND fence=?",
            json({ exploreResult: response }),
            j.id,j.fence,
          );
        }
        signal.throwIfAborted();
        const artifacts=await renderConversationFiles(input,response,j.id,signal,()=>ensureExploreUser(input.userId),progress);
        signal.throwIfAborted();
        progress("commit",{message:artifacts.length?"文件已生成，正在保存对话":"正在保存回答"});
        result = commitExplore(input, {...response,artifacts}, j.id);
      } else if (j.type === "export")
        result = await exportFile(input, j.id, signal);
      else if (j.type === "backup") result = await createBackup();
      else if (j.type === "monitor")
        result = await monitor(input, j.id, signal, progress);
      else if (j.type === "agent") {
        const existing = get("SELECT * FROM versions WHERE job_id=?", j.id);
        if (existing)
          result = { versionId: existing.id, projectId: existing.project_id };
        else {
          let response = parse(j.checkpoint).agentResult;
          if (!response) {
            response = await runAgent(input, progress, signal);
            run(
              "UPDATE jobs SET checkpoint=? WHERE id=?",
              json({ agentResult: response }),
              j.id,
            );
          }
          signal.throwIfAborted();
          if (input.actorId) {
            const actor = get(
              "SELECT role,status FROM users WHERE id=?",
              input.actorId,
            );
            if (
              !actor ||
              actor.status !== "active" ||
              !["admin", "creator"].includes(actor.role)
            )
              err("ACTOR_REVOKED", "账号已停用或失去创作权限，任务停止", 403);
          }
          progress("validate", { message: "校验引用与结果" });
          if (input.kind === "research") {
            result = tx(() => {
              const c = response.content.claims.map((v: any) => addClaim(v));
              const t = response.content.topics.map((v: any) => makeTopic(v));
              const r = {
                ...response,
                claimIds: c.map((v: any) => v.id),
                topicIds: t.map((v: any) => v.id),
              };
              run(
                "UPDATE jobs SET result=?,state='succeeded' WHERE id=?",
                json(r),
                j.id,
              );
              return r;
            });
          } else if (input.kind === "patch")
            result = {
              ...response,
              baseVersionId: input.baseVersionId,
              projectId: input.projectId,
              blockIds: input.blockIds,
            };
          else {
            const v = saveVersion({
              projectId: input.projectId,
              kind: input.kind,
              body: response.content,
              masterId: input.masterId,
              expectedRevision: input.expectedRevision,
              origin: "deepseek",
              jobId: j.id,
            });
            result = { ...response, versionId: v.id, projectId: v.project_id };
          }
        }
      } else err("UNKNOWN_TASK", "未知任务类型");
      signal.throwIfAborted();
      run(
        "UPDATE jobs SET state=?,stage=?,result=?,finished_at=?,lease_until=NULL WHERE id=? AND fence=?",
        result?.coverage === "partial" ? "partial" : "succeeded",
        "done",
        json(result),
        now(),
        j.id,
        j.fence,
      );
      event(j.id, "state", {
        state: result?.coverage === "partial" ? "partial" : "succeeded",
        message: "任务完成",
      });
    } catch (e: any) {
      const canceled = Boolean(
        get("SELECT cancel_requested FROM jobs WHERE id=?", j.id)
          ?.cancel_requested,
      );
      const state = canceled ? "canceled" : "failed";
      run(
        "UPDATE jobs SET state=?,error=?,finished_at=?,lease_until=NULL WHERE id=? AND fence=?",
        state,
        json({
          code: e.code || "TASK_FAILED",
          message: e.message || "任务失败",
          ...(e.diagnostic?{diagnostic:e.diagnostic}:{}),
        }),
        now(),
        j.id,
        j.fence,
      );
      event(j.id, "state", { state, message: e.message });
    } finally {
      clearInterval(heartbeat);
      this.busy = false;
      this.controller = undefined;
    }
  }
  stop() {
    this.stopping = true;
    clearInterval(this.timer);
    this.controller?.abort(new Error("后台正在关闭"));
  }
}
