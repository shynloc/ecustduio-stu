import {
  createWriteStream,
  openSync,
  readSync,
  closeSync,
  unlinkSync,
  renameSync,
} from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { createHash } from "node:crypto";
import { join, extname } from "node:path";
import { dataDir, id, get, run, now, err } from "./db.js";
export async function receivePdf(file: any) {
  const temp = join(dataDir, "staging", "upload-" + id()),
    digest = createHash("sha256");
  let bytes = 0;
  try {
    await pipeline(
      file.file,
      new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > 200 * 1024 * 1024) {
            callback(
              Object.assign(new Error("PDF超过200MB上限"), { statusCode: 413 }),
            );
            return;
          }
          digest.update(chunk);
          callback(null, chunk);
        },
      }),
      createWriteStream(temp, { flags: "wx" }),
    );
    if (file.file.truncated) err("MEDIA_SIZE", "PDF超过200MB上限", 413);
    const header = Buffer.alloc(1024),
      fd = openSync(temp, "r");
    try {
      readSync(fd, header);
    } finally {
      closeSync(fd);
    }
    if (!header.toString("ascii").includes("%PDF-"))
      err("INVALID_PDF", "文件不是有效PDF", 422);
    const hash = digest.digest("hex"),
      path = `assets/${hash}.pdf`,
      prior = get("SELECT * FROM assets WHERE path=?", path);
    if (prior) return prior;
    renameSync(temp, join(dataDir, path));
    const a = {
      id: id(),
      path,
      name: String(file.filename)
        .replace(/[<>:"/\\|?*]/g, "_")
        .slice(0, 180),
      mime: "application/pdf",
      size: bytes,
      hash,
      kind: "media-upload",
      created_at: now(),
    };
    run(
      "INSERT INTO assets VALUES(?,?,?,?,?,?,?,?)",
      a.id,
      a.path,
      a.name,
      a.mime,
      a.size,
      a.hash,
      a.kind,
      a.created_at,
    );
    return a;
  } finally {
    try {
      unlinkSync(temp);
    } catch {}
  }
}
