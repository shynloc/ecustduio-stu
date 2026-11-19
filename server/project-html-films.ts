import { z } from "zod";
import { get, all, run, tx, id, now, err, parse, requireRow } from "./db.js";
import { queueAdaptation } from "./chat-adaptations.js";
import { HtmlFilmOptions } from "../shared/html-film.js";
import { workflowActor } from "./workflow-agent.js";
function thread(pid: string, uid: string) {
  return get(
    "SELECT conversation_id FROM project_html_film_threads WHERE project_id=? AND owner_id=?",
    pid,
    uid,
  )?.conversation_id;
}
function files(pid: string, uid: string) {
  return all(
    `SELECT a.id,a.asset_id,a.format,a.manifest,s.name FROM artifacts a JOIN assets s ON s.id=a.asset_id
 LEFT JOIN versions v ON v.id=a.target_id WHERE a.format='html' AND (v.project_id=? OR a.target_id=? OR json_extract(a.manifest,'$.projectId')=?)
 AND (json_extract(a.manifest,'$.ownerId') IS NULL OR json_extract(a.manifest,'$.ownerId')=?) ORDER BY a.created_at DESC`,
    pid,
    pid,
    pid,
    uid,
  );
}
export function registerProjectHtmlFilms(app: any, enqueue: any) {
  const path = "/api/projects/:id/html-films";
  app.get(path, async (req: any) => {
    const pid = req.params.id,
      uid = req.user.id;
    requireRow(get("SELECT id FROM projects WHERE id=?", pid));
    workflowActor(uid, false);
    const cid = thread(pid, uid);
    return {
      cid,
      files: files(pid, uid).map((f) => ({ id: f.id, name: f.name })),
      messages: cid
        ? all(
            "SELECT id,role,context,content,job_id FROM messages WHERE conversation_id=? ORDER BY rowid",
            cid,
          ).map((m) => ({ ...m, context: parse(m.context) }))
        : [],
      jobs: cid
        ? all(
            "SELECT j.id,j.state,j.stage,j.error FROM jobs j JOIN messages m ON m.job_id=j.id WHERE m.conversation_id=? AND m.role='user'",
            cid,
          ).map((j) => ({ ...j, error: parse(j.error, null) }))
        : [],
    };
  });
  app.post(path, async (req: any, reply: any) => {
    const b = z
      .object({
        url: z.string().url().max(2500).optional(),
        uploadId: z.string().optional(),
        artifactId: z.string().optional(),
        options: HtmlFilmOptions,
      })
      .strict()
      .refine(
        (v) => [v.url, v.uploadId, v.artifactId].filter(Boolean).length === 1,
      )
      .parse(req.body);
    const pid = req.params.id,
      uid = req.user.id;
    workflowActor(uid, false);
    const project = requireRow(
      get("SELECT title FROM projects WHERE id=?", pid),
    );
    const source = b.artifactId
      ? requireRow(files(pid, uid).find((f) => f.id === b.artifactId))
      : undefined;
    if (
      b.uploadId &&
      !get(
        "SELECT 1 FROM upload_sessions u JOIN assets s ON s.id=u.asset_id WHERE u.owner_id=? AND u.asset_id=? AND (lower(s.name) LIKE '%.html' OR lower(s.name) LIKE '%.htm')",
        uid,
        b.uploadId,
      )
    )
      err("HTML_SOURCE", "请选择本账号上传的 HTML。", 422);
    const cid =
      thread(pid, uid) ||
      tx(() => {
        const cid = id();
        run(
          "INSERT INTO conversations VALUES(?,?,?,?,?)",
          cid,
          uid,
          project.title + " · HTML 视频",
          now(),
          now(),
        );
        run(
          "INSERT INTO project_html_film_threads VALUES(?,?,?)",
          pid,
          uid,
          cid,
        );
        return cid;
      });
    const prompt =
      "用" +
      (b.uploadId ? "上传的" : "项目里的") +
      " HTML " +
      (b.options.mode === "original" ? "保留原网页" : "重新编排分镜") +
      "做 " +
      b.options.seconds +
      " 秒" +
      (b.options.narrated ? "配音" : "无声") +
      "视频";
    const job = queueAdaptation(
      cid,
      {
        prompt,
        projectId: pid,
        projectSource: source,
        htmlSettings: b.options,
        sourceUrls: b.url ? [b.url] : [],
        attachmentIds: b.uploadId ? [b.uploadId] : [],
        queueTurn: true,
      },
      req.user,
      "project-html:" +
        uid +
        ":" +
        pid +
        ":" +
        (req.headers["idempotency-key"] || id()),
      enqueue,
    );
    return reply.code(202).send(job);
  });
}
