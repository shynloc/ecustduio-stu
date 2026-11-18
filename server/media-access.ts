import { get, run, err, requireRow, settings } from "./db.js";
export function mediaActor(id: string) {
  const u = get(
    "SELECT id,role,status,must_change_password FROM users WHERE id=?",
    id,
  );
  if (
    !u ||
    u.status !== "active" ||
    u.must_change_password ||
    !["admin", "creator"].includes(u.role)
  )
    err("ACTOR_REVOKED", "账号已停用或失去创作权限，任务停止", 403);
  if (!settings().allowExternalAI)
    err("AI_CONSENT_REQUIRED", "请管理员在设置中允许 DeepSeek 调用", 403);
  return u;
}
export function grantMediaAsset(assetId: string, ownerId: string) {
  run("INSERT OR IGNORE INTO media_assets VALUES(?,?)", assetId, ownerId);
}
export function checkMediaAsset(assetId: string, user: any) {
  if (user.role === "admin") return;
  if (!get("SELECT 1 FROM media_assets WHERE asset_id=? LIMIT 1", assetId))
    return;
  if (
    get(
      "SELECT 1 FROM media_assets WHERE asset_id=? AND owner_id=?",
      assetId,
      user.id,
    )
  )
    return;
  if (get("SELECT 1 FROM snapshots WHERE asset_id=? LIMIT 1", assetId)) return;
  err("FORBIDDEN", "无权访问其他账号的媒体原文件或音频", 403);
}
export function ownedMedia(jobId: string, user: any) {
  const job = requireRow(
    get(
      "SELECT j.*,m.owner_id FROM jobs j JOIN media_jobs m ON m.job_id=j.id WHERE j.id=?",
      jobId,
    ),
  );
  if (user.role !== "admin" && job.owner_id !== user.id)
    err("FORBIDDEN", "无权访问其他账号的媒体任务", 403);
  return job;
}
