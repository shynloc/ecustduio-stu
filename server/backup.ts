import { DatabaseSync } from "node:sqlite";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  renameSync,
  existsSync,
  copyFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import AdmZip from "adm-zip";
import {
  dataDir,
  db,
  backupDatabase,
  reopenDatabase,
  id,
  hash,
  json,
  parse,
  all,
  now,
  err,
  run,
  settings,
} from "./db.js";
import { existingInside, inside } from "./security.js";
export async function createBackup() {
  const bid = id(),
    dir = join(dataDir, "staging", "backup-" + bid);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "assets"), { recursive: true });
  const database = join(dir, "app.sqlite");
  await backupDatabase(database);
  const snap = new DatabaseSync(database);
  let assets: any[];
  try {
    snap.exec("DELETE FROM auth_sessions; DELETE FROM login_attempts;");
    assets = snap.prepare("SELECT * FROM assets").all();
  } finally {
    snap.close();
  }
  const zip = new AdmZip();
  const entries: any[] = [];
  const add = (path: string, bytes: Buffer) => {
    zip.addFile(path, bytes);
    entries.push({ path, hash: hash(bytes), size: bytes.length });
  };
  add("app.sqlite", readFileSync(database));
  for (const a of assets!) {
    const bytes = readFileSync(existingInside(dataDir, a.path));
    if (hash(bytes) !== a.hash) err("ASSET_CORRUPT", "备份发现损坏文件");
    add(a.path, bytes);
  }
  zip.addFile(
    "manifest.json",
    Buffer.from(
      json({
        schemaVersion: 1,
        createdAt: now(),
        excludes: [
          "secrets.dpapi",
          "secrets.keychain.json",
          "macOS login Keychain",
          "environment credentials",
          "login sessions",
        ],
        includes: ["account password hashes (no plaintext passwords)"],
        entries,
      }),
    ),
  );
  const filename = `EcuStudio_backup_${bid}.zip`;
  zip.writeZip(join(dataDir, "backups", filename));
  return { backupId: filename, assetCount: assets!.length, createdAt: now() };
}
export function backupList() {
  return readdirSync(join(dataDir, "backups"))
    .filter((s) => /^EcuStudio_backup_[\w-]+\.zip$/.test(s))
    .map((name) => ({ name }));
}
const validations = new Map<
  string,
  { dir: string; hash: string; expires: number }
>();
export function validateBackup(buffer: Buffer) {
  if (buffer.length > 250 * 1024 * 1024)
    err("PAYLOAD_TOO_LARGE", "备份过大", 413);
  const zip = new AdmZip(buffer),
    entries = zip.getEntries();
  if (
    entries.length > 5000 ||
    entries.reduce((n, e) => n + e.header.size, 0) > 500 * 1024 * 1024
  )
    err("ZIP_LIMIT", "解压规模超出限制");
  const manifest = JSON.parse(zip.readAsText("manifest.json"));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries))
    err("INVALID_BACKUP", "不支持的备份版本");
  const token = id(),
    dir = join(dataDir, "staging", "restore-" + token);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "assets"), { recursive: true });
  for (const item of manifest.entries) {
    if (
      item.path !== "app.sqlite" &&
      !/^assets\/[a-f0-9]{64}(\.[a-z0-9]+)?$/.test(item.path)
    )
      err("UNSAFE_PATH", "备份含不允许的路径");
    const entry = zip.getEntry(item.path);
    if (!entry || ((entry.attr >>> 16) & 0xf000) === 0xa000)
      err("INVALID_BACKUP", "备份内容缺失或包含链接");
    const bytes = entry.getData();
    if (bytes.length !== item.size || hash(bytes) !== item.hash)
      err("BACKUP_HASH_MISMATCH", "备份文件校验不一致");
    const dest = inside(dir, item.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes);
  }
  const temp = new DatabaseSync(join(dir, "app.sqlite"), { readOnly: true });
  let counts: any;
  try {
    if (
      (temp.prepare("PRAGMA integrity_check").get() as any).integrity_check !==
        "ok" ||
      temp.prepare("PRAGMA foreign_key_check").all().length
    )
      err("BACKUP_DATABASE_INVALID", "备份数据库完整性检查失败");
    if (!temp.prepare("SELECT 1 FROM migrations WHERE version=1").get())
      err("BACKUP_SCHEMA_INVALID", "备份版本不兼容");
    for (const a of temp.prepare("SELECT * FROM assets").all() as any[]) {
      if (
        !existsSync(inside(dir, a.path)) ||
        hash(readFileSync(inside(dir, a.path))) !== a.hash
      )
        err("BACKUP_ASSET_MISSING", "备份缺少引用文件");
    }
    counts = {
      projects: (temp.prepare("SELECT count(*) n FROM projects").get() as any)
        .n,
      versions: (temp.prepare("SELECT count(*) n FROM versions").get() as any)
        .n,
    };
  } finally {
    temp.close();
  }
  validations.set(token, {
    dir,
    hash: hash(buffer),
    expires: Date.now() + 600000,
  });
  return {
    token,
    createdAt: manifest.createdAt,
    ...counts,
    credentialsIncluded: false,
  };
}
export async function restoreBackup(token: string) {
  const v = validations.get(token);
  if (!v || v.expires < Date.now())
    err("RESTORE_EXPIRED", "恢复预览已过期，请重新校验", 409);
  const safety = await createBackup();
  const currentUsers = all("SELECT * FROM users");
  for (const file of readdirSync(join(v.dir, "assets")))
    copyFileSync(join(v.dir, "assets", file), join(dataDir, "assets", file));
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  const current = join(dataDir, "app.sqlite"),
    rollback = join(dataDir, "staging", "before-restore-" + id() + ".sqlite");
  renameSync(current, rollback);
  try {
    copyFileSync(join(v.dir, "app.sqlite"), current);
    reopenDatabase();
    // Restoring content must not introduce active accounts from an older/foreign backup.
    // Keep existing account identities and require a fresh login after restoration.
    run("DELETE FROM auth_sessions");
    run("DELETE FROM login_attempts");
    run(
      "UPDATE users SET username='restored_'||id,status='disabled',password_hash='',must_change_password=1",
    );
    for (const u of currentUsers)
      run(
        "INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,role=excluded.role,status=excluded.status,password_hash=excluded.password_hash,must_change_password=excluded.must_change_password,revision=excluded.revision,updated_at=excluded.updated_at",
        u.id,
        u.username,
        u.display_name,
        u.role,
        u.status,
        u.password_hash,
        u.must_change_password,
        u.revision,
        u.created_at,
        u.updated_at,
      );
    const cfg = settings();
    run(
      "UPDATE settings SET body=?,revision=revision+1 WHERE id=1",
      json({ ...cfg, scheduleEnabled: false, autoSend: false }),
    );
    run(
      "UPDATE outbox SET state='unknown',error='从备份恢复，发送状态需重新核查' WHERE state IN ('sending','pending')",
    );
    run(
      "UPDATE jobs SET state='interrupted',lease_owner=NULL WHERE state IN ('running','queued')",
    );
    validations.delete(token);
    return {
      restored: true,
      safetyBackup: safety.backupId,
      schedulePaused: true,
    };
  } catch (e) {
    try {
      db.close();
    } catch {}
    copyFileSync(rollback, current);
    reopenDatabase();
    throw e;
  }
}
