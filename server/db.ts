import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Settings } from "../shared/schema.js";
export const root = resolve(process.cwd());
export const dataDir = resolve(
  process.env.ECUSTUDIO_DATA_DIR || join(root, "../data"),
);
mkdirSync(dataDir, { recursive: true });
for (const sub of ["assets", "staging", "backups", "logs", "skill-snapshots"])
  mkdirSync(join(dataDir, sub), { recursive: true });
export let db = new DatabaseSync(join(dataDir, "app.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
);
db.exec(
  "CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)",
);
if (!db.prepare("SELECT 1 FROM migrations WHERE version=1").get()) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(readFileSync(join(root, "migrations/001_initial.sql"), "utf8"));
    db.prepare("INSERT INTO migrations VALUES(1,?)").run(
      new Date().toISOString(),
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export const now = () => new Date().toISOString();
export function migrateExtensions() {
 const files=['002_accounts_explore.sql','003_media.sql','004_workflows.sql','005_knowledge.sql','006_pipeline.sql','007_wechat.sql','008_wechat_manuscripts.sql','009_project_html_films.sql','010_workspace_experience.sql'];
 for(const [i,file] of files.entries()){const version=i+2;if(db.prepare('SELECT 1 FROM migrations WHERE version=?').get(version))continue;db.exec('BEGIN IMMEDIATE');try{db.exec(readFileSync(join(root,'migrations',file),'utf8'));db.prepare('INSERT INTO migrations VALUES(?,?)').run(version,new Date().toISOString());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
}
migrateExtensions();
export const id = () => randomUUID();
export const hash = (v: unknown) =>
  createHash("sha256")
    .update(
      typeof v === "string" || Buffer.isBuffer(v)
        ? (v as any)
        : JSON.stringify(v),
    )
    .digest("hex");
export const json = (v: unknown) => JSON.stringify(v);
export const parse = (v: any, fallback: any = {}) => {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
};
export function get(sql: string, ...args: any[]): any {
  return db.prepare(sql).get(...args);
}
export function all(sql: string, ...args: any[]): any[] {
  return db.prepare(sql).all(...args);
}
export function run(sql: string, ...args: any[]) {
  return db.prepare(sql).run(...args);
}
export function tx<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const v = fn();
    db.exec("COMMIT");
    return v;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function audit(action: string, entity: string, detail: any = {}) {
  run(
    "INSERT INTO audit VALUES(?,?,?,?,?)",
    id(),
    action,
    entity,
    json(detail),
    now(),
  );
}
export function settings() {
  return {
    ...Settings.parse(parse(get("SELECT body FROM settings WHERE id=1")?.body)),
    revision: get("SELECT revision FROM settings WHERE id=1")?.revision || 1,
  };
}
if (!get("SELECT id FROM settings WHERE id=1"))
  run("INSERT INTO settings(id,body) VALUES(1,?)", json(Settings.parse({})));
export const shanghaiDate = (date: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export function err(code: string, message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { code, statusCode });
}
export function requireRow(row: any) {
  if (!row) err("NOT_FOUND", "记录不存在", 404);
  return row;
}
export async function backupDatabase(dest: string) {
  await backup(db, dest);
}
export function reopenDatabase() {
  db = new DatabaseSync(join(dataDir, "app.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
  );
  migrateExtensions();
}
