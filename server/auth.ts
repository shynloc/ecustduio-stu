import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { loopbackClient } from "./network.js";
import {
  all,
  get,
  run,
  tx,
  id,
  now,
  hash,
  err,
  requireRow,
  audit,
  parse,
} from "./db.js";

const password = z.string().min(10, "密码至少10位").max(128);
const username = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[a-zA-Z0-9_.-]+$/, "账号仅支持字母、数字、点、横线和下划线")
  .transform((v) => v.toLowerCase());
const roles = z.enum(["admin", "creator", "sales"]);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
async function key(value: string, salt: string) {
  return await new Promise<Buffer>((resolve, reject) =>
    scrypt(value, salt, 64, options, (e, v) => (e ? reject(e) : resolve(v))),
  );
}
export async function passwordHash(value: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await key(value, salt)).toString("hex")}`;
}
async function verify(value: string, stored: string) {
  const [, salt, digest] = stored.split("$");
  const candidate = await key(value, salt || "invalid-account-timing-salt");
  const expected =
    digest && /^[a-f0-9]{128}$/.test(digest)
      ? Buffer.from(digest, "hex")
      : Buffer.alloc(64);
  return timingSafeEqual(candidate, expected);
}
export function userView(u: any) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    role: u.role,
    status: u.status,
    mustChangePassword: !!u.must_change_password,
    revision: u.revision,
    createdAt: u.created_at,
  };
}
export function setupRequired() {
  return !get("SELECT id FROM users LIMIT 1");
}
export function sessionFor(req: any) {
  const token = req.headers.cookie?.match(/(?:^|;\s*)ecustudio=([^;]+)/)?.[1];
  const session = token
    ? get(
        "SELECT * FROM auth_sessions WHERE token_hash=? AND expires_at>?",
        hash(token),
        Date.now(),
      )
    : null;
  if (!session) return null;
  const user = session.user_id
    ? get("SELECT * FROM users WHERE id=? AND status='active'", session.user_id)
    : null;
  if (session.user_id && !user) return null;
  return { ...session, user: user ? userView(user) : null };
}
export function issueSession(reply: any, userId: string | null = null) {
  const token = randomBytes(32).toString("hex"),
    csrf = randomBytes(24).toString("hex"),
    ttl = userId ? 86400 : 900;
  run("DELETE FROM auth_sessions WHERE expires_at<=?", Date.now());
  run(
    "INSERT INTO auth_sessions VALUES(?,?,?,?)",
    hash(token),
    userId,
    csrf,
    Date.now() + ttl * 1000,
  );
  reply
    .header("Cache-Control", "no-store")
    .header(
      "Set-Cookie",
      `ecustudio=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ttl}`,
    );
  return {
    csrf,
    user: userId
      ? userView(get("SELECT * FROM users WHERE id=?", userId))
      : null,
    setupRequired: setupRequired(),
  };
}
function revoke(userId: string) {
  run("DELETE FROM auth_sessions WHERE user_id=?", userId);
}
function requireAdmin(actorId: string) {
  const actor = get(
    "SELECT role,status,must_change_password FROM users WHERE id=?",
    actorId,
  );
  if (
    !actor ||
    actor.role !== "admin" ||
    actor.status !== "active" ||
    actor.must_change_password
  )
    err("FORBIDDEN", "管理员权限已变更，请重新登录", 403);
}
function throttle(name: string, ip: string) {
  run("DELETE FROM login_attempts WHERE created_at<?", Date.now() - 15 * 60000);
  if (
    get(
      "SELECT count(*) n FROM login_attempts WHERE ip=? AND username=?",
      ip,
      name,
    ).n >= 10 ||
    get("SELECT count(*) n FROM login_attempts WHERE ip=?", ip).n >= 100
  )
    err("LOGIN_RATE_LIMIT", "尝试次数过多，请15分钟后重试", 429);
}
export function canAccess(role: string, method: string, path: string) {
  if (/^\/api\/auth\/(logout|password)$/.test(path)) return true;
  if (role === "admin") return true;
  if (role === "sales")
    return (
      method === "GET" &&
      (/^\/api\/state$/.test(path) ||
        /^\/api\/(snapshots|reports)\/[^/]+$/.test(path) ||
        /^\/api\/artifacts\/[^/]+\/download$/.test(path) ||
        /^\/api\/assets\/[^/]+$/.test(path))
    );
  if (role !== "creator") return false;
  if (
    /^\/api\/(auth\/users|backups|restore|secrets|sources|notifications)(\/|$)/.test(
      path,
    )
  )
    return false;
  if (/^\/api\/settings(?:\/|$)/.test(path))
    return path === "/api/settings/theme" && method === "PATCH";
  if (/^\/api\/skills(?:\/|$)/.test(path)) return false;
  return true;
}
export function checkJobAccess(jobId: string, user: any, mutation = false) {
  const job = requireRow(get("SELECT * FROM jobs WHERE id=?", jobId));
  if (user.role === "admin") return job;
  if (["wechat-draft","workflow-plan","workflow","source-review","policy-impact","visual-video","visual-create","visual-assistant","visual-web-import","visual-export","visual-runtime"].includes(job.type) && parse(job.input).actorId !== user.id)
    err("FORBIDDEN", "无权访问此制作任务", 403);
  if (job.type === "media" && get("SELECT owner_id FROM media_jobs WHERE job_id=?", job.id)?.owner_id !== user.id)
    err("FORBIDDEN", "无权访问此媒体任务", 403);
  if(["conversation-export","chat-narration","chat-film"].includes(job.type) && get("SELECT owner_id FROM conversations WHERE id=?",parse(job.input).conversationId)?.owner_id!==user.id)
    err("FORBIDDEN","无权访问其他账号的对话文件任务",403);
  if (job.type === "explore") {
    const owner = get(
      "SELECT c.owner_id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.job_id=? LIMIT 1",
      job.id,
    )?.owner_id;
    if (owner !== user.id) err("FORBIDDEN", "无权访问此对话任务", 403);
  }
  if (user.role !== "creator" || ["backup"].includes(job.type))
    err("FORBIDDEN", "无权访问管理任务", 403);
  return job;
}
export async function registerAuth(app: any) {
  app.get("/api/session", async (req: any, reply: any) => {
    const current = sessionFor(req);
    return current
      ? {
          csrf: current.csrf,
          user: current.user,
          setupRequired: setupRequired(),
          canSetup: loopbackClient(req.ip),
        }
      : { ...issueSession(reply), canSetup: loopbackClient(req.ip) };
  });
  app.post("/api/auth/setup", async (req: any, reply: any) => {
    if (!loopbackClient(req.ip))
      err("SETUP_LOCAL_ONLY", "首次管理员必须在服务器本机打开工作台创建", 403);
    if (!setupRequired()) err("SETUP_COMPLETE", "管理员已创建，请登录", 409);
    const b = z
      .object({
        username,
        password,
        displayName: z.string().trim().min(1).max(80),
      })
      .parse(req.body);
    const digest = await passwordHash(b.password);
    const uid = tx(() => {
      if (!setupRequired()) err("SETUP_COMPLETE", "管理员已创建，请登录", 409);
      const uid = id();
      run(
        "INSERT INTO users(id,username,display_name,role,password_hash,created_at,updated_at) VALUES(?,?,?,'admin',?,?,?)",
        uid,
        b.username,
        b.displayName,
        digest,
        now(),
        now(),
      );
      audit("account.setup", uid, { username: b.username });
      return uid;
    });
    run("DELETE FROM auth_sessions WHERE token_hash=?", req.auth.token_hash);
    return issueSession(reply, uid);
  });
  app.post("/api/auth/login", async (req: any, reply: any) => {
    const b = z
      .object({ username, password: z.string().min(1).max(128) })
      .parse(req.body);
    throttle(b.username, req.ip);
    const u = get("SELECT * FROM users WHERE username=?", b.username);
    if (
      !(await verify(b.password, u?.password_hash || "")) ||
      !u ||
      u.status !== "active"
    ) {
      run(
        "INSERT INTO login_attempts VALUES(?,?,?,?)",
        id(),
        b.username,
        req.ip,
        Date.now(),
      );
      err("LOGIN_FAILED", "账号或密码不正确，或账号已停用", 401);
    }
    // Re-read after hashing: an administrator may have disabled/reset the account meanwhile.
    const current = get("SELECT * FROM users WHERE id=?", u.id);
    if (
      current.status !== "active" ||
      current.password_hash !== u.password_hash
    )
      err("LOGIN_FAILED", "账号状态已变化，请重试", 401);
    run(
      "DELETE FROM login_attempts WHERE username=? AND ip=?",
      b.username,
      req.ip,
    );
    run("DELETE FROM auth_sessions WHERE token_hash=?", req.auth.token_hash);
    audit("account.login", u.id);
    return issueSession(reply, u.id);
  });
  app.post("/api/auth/logout", async (req: any, reply: any) => {
    run("DELETE FROM auth_sessions WHERE token_hash=?", req.auth.token_hash);
    reply.header(
      "Set-Cookie",
      "ecustudio=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    );
    return { ok: true };
  });
  app.post("/api/auth/password", async (req: any, reply: any) => {
    const b = z
      .object({
        currentPassword: z.string().min(1).max(128),
        newPassword: password,
      })
      .parse(req.body);
    const u = requireRow(get("SELECT * FROM users WHERE id=?", req.user.id));
    throttle(u.username, req.ip);
    if (!(await verify(b.currentPassword, u.password_hash))) {
      run(
        "INSERT INTO login_attempts VALUES(?,?,?,?)",
        id(),
        u.username,
        req.ip,
        Date.now(),
      );
      err("PASSWORD_MISMATCH", "当前密码不正确", 400);
    }
    if (b.currentPassword === b.newPassword)
      err("PASSWORD_UNCHANGED", "新密码应与初始密码不同");
    const digest = await passwordHash(b.newPassword);
    tx(() => {
      if (get("SELECT status FROM users WHERE id=?", u.id)?.status !== "active")
        err("FORBIDDEN", "账号已停用", 403);
      if (
        get("SELECT password_hash FROM users WHERE id=?", u.id)
          .password_hash !== u.password_hash
      )
        err("VERSION_CONFLICT", "密码已变更，请重新登录", 409);
      run(
        "UPDATE users SET password_hash=?,must_change_password=0,revision=revision+1,updated_at=? WHERE id=?",
        digest,
        now(),
        u.id,
      );
      revoke(u.id);
      audit("account.password", u.id);
    });
    return issueSession(reply, u.id);
  });
  app.get("/api/auth/users", async () =>
    all("SELECT * FROM users WHERE status!='deleted' ORDER BY created_at").map(
      userView,
    ),
  );
  app.post("/api/auth/users", async (req: any) => {
    const b = z
      .object({
        username,
        password,
        displayName: z.string().trim().min(1).max(80),
        role: roles,
      })
      .parse(req.body);
    const digest = await passwordHash(b.password);
    return tx(() => {
      requireAdmin(req.user.id);
      if (get("SELECT id FROM users WHERE username=?", b.username))
        err("ACCOUNT_EXISTS", "该账号名已被使用", 409);
      const uid = id();
      run(
        "INSERT INTO users(id,username,display_name,role,password_hash,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)",
        uid,
        b.username,
        b.displayName,
        b.role,
        digest,
        now(),
        now(),
      );
      audit("account.create", uid, { actor: req.user.id, role: b.role });
      return userView(get("SELECT * FROM users WHERE id=?", uid));
    });
  });
  app.patch("/api/auth/users/:id", async (req: any) => {
    const b = z
      .object({
        revision: z.number().int(),
        role: roles.optional(),
        status: z.enum(["active", "disabled"]).optional(),
        displayName: z.string().trim().min(1).max(80).optional(),
        password: password.optional(),
      })
      .strict()
      .parse(req.body);
    const digest = b.password ? await passwordHash(b.password) : null;
    return tx(() => {
      requireAdmin(req.user.id);
      const u = requireRow(
        get(
          "SELECT * FROM users WHERE id=? AND status!='deleted'",
          req.params.id,
        ),
      );
      if (u.revision !== b.revision)
        err("VERSION_CONFLICT", "账号已更新，请刷新", 409);
      const role = b.role || u.role,
        status = b.status || u.status;
      protectAdmin(u, role, status, req.user.id);
      run(
        "UPDATE users SET role=?,status=?,display_name=?,password_hash=?,must_change_password=?,revision=revision+1,updated_at=? WHERE id=?",
        role,
        status,
        b.displayName || u.display_name,
        digest || u.password_hash,
        digest ? 1 : u.must_change_password,
        now(),
        u.id,
      );
      revoke(u.id);
      audit("account.update", u.id, {
        actor: req.user.id,
        role,
        status,
        passwordReset: !!digest,
      });
      return userView(get("SELECT * FROM users WHERE id=?", u.id));
    });
  });
  app.delete("/api/auth/users/:id", async (req: any) =>
    tx(() => {
      requireAdmin(req.user.id);
      const u = requireRow(
        get(
          "SELECT * FROM users WHERE id=? AND status!='deleted'",
          req.params.id,
        ),
      );
      protectAdmin(u, u.role, "deleted", req.user.id);
      run(
        "UPDATE users SET status='deleted',password_hash='',revision=revision+1,updated_at=? WHERE id=?",
        now(),
        u.id,
      );
      revoke(u.id);
      audit("account.delete", u.id, { actor: req.user.id });
      return { ok: true };
    }),
  );
}
function protectAdmin(u: any, role: string, status: string, actor: string) {
  if (u.id === actor && status !== "active")
    err("SELF_DISABLE", "不能停用或删除当前登录账号", 409);
  if (
    u.role === "admin" &&
    u.status === "active" &&
    (role !== "admin" || status !== "active") &&
    get("SELECT count(*) n FROM users WHERE role='admin' AND status='active'")
      .n <= 1
  )
    err("LAST_ADMIN", "必须保留至少一个有效管理员", 409);
}
