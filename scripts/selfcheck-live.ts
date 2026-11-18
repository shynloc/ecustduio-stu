import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { authenticatedSession } from './authenticated-session.js';
const dir = "test-results/selfcheck-live";
mkdirSync(dir, { recursive: true });
const base = "http://127.0.0.1:37891/api";
const s = await authenticatedSession(base),
  cookie = s.headers.get("set-cookie")!.split(";")[0],
  { csrf } = (await s.json()) as any;
async function api(path: string, body?: any) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      cookie,
      "x-csrf-token": csrf,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value: any = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(value.error));
  return value;
}
const log: any = { startedAt: new Date().toISOString() };
function save() {
  writeFileSync(dir + "/result.json", JSON.stringify(log, null, 2));
}
try {
  const state = await api("/state");
  log.probe = await api("/agent/probe", {});
  assert.equal(log.probe.ok, true);
  console.log("Live DeepSeek connection passed.");
  const old = JSON.parse(
      readFileSync("test-results/live-agent/run.json", "utf8"),
    ),
    existing = await api("/projects/" + old.projectId);
  const expected = [
    "master",
    "policy",
    "speech",
    "wechat",
    "presentation",
    "storyboard",
  ];
  log.existingContent = expected.map((kind) => {
    const id = kind === "master" ? old.masterId : old[kind + "Id"],
      v = existing.versions.find((v: any) => v.id === id);
    assert.ok(v);
    if (kind !== "master") assert.equal(v.master_id, old.masterId);
    return { kind, id, blocks: v.body.blocks.length };
  });
  for (const e of old.exports) {
    const r = await fetch(base + "/artifacts/" + e.artifactId + "/download", {
      headers: { cookie },
    });
    assert.equal(r.status, 200);
    assert.ok((await r.arrayBuffer()).byteLength > 20);
  }
  log.existingDownloads = old.exports.length;
  const project = await api("/projects", {
    title: "工作流自检 · 2027报名（独立验收项目）",
    scope: existing.scope,
    snapshotIds: existing.snapshotIds,
  });
  log.projectId = project.id;
  const original = existing.versions.find(
    (v: any) => v.id === old.masterId,
  ).body;
  const master = await api("/versions", {
    projectId: project.id,
    kind: "master",
    body: original,
    expectedRevision: project.revision,
  });
  const selected = master.body.blocks.find((b: any) => !b.locked).id,
    target = "报名事项：先核对时间与地点";
  const job = await api("/agent/runs", {
    kind: "patch",
    projectId: project.id,
    baseVersionId: master.id,
    blockIds: [selected],
    prompt: `只将指定块的title修改为“${target}”。不要修改text、notes或其他字段；只返回这一条title补丁。`,
  });
  log.patchJob = job.id;
  save();
  console.log(JSON.stringify({ patchJob: job.id }));
  let result: any;
  for (let i = 0; i < 660; i++) {
    result = await api("/jobs/" + job.id);
    if (!["queued", "running"].includes(result.state)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.equal(result.state, "succeeded", JSON.stringify(result.error));
  assert.equal(result.result.content.patches.length, 1);
  assert.equal(result.result.content.patches[0].field, "title");
  assert.equal(result.result.content.patches[0].value, target);
  const current = await api("/projects/" + project.id);
  const accepted = await api("/patches/accept", {
    jobId: job.id,
    indices: [0],
    expectedRevision: current.revision,
  });
  const expectedBody = structuredClone(master.body);
  expectedBody.blocks.find((b: any) => b.id === selected).title = target;
  assert.deepEqual(accepted.body, expectedBody);
  log.patchVersion = accepted.id;
  log.unselectedBlocksUnchanged = true;
  log.patchModel = result.result.model;
  log.patchUsage = result.result.usage;
  const backup = await api("/backups", {});
  for (let i = 0; i < 90; i++) {
    const b = await api("/jobs/" + backup.id);
    if (b.state === "succeeded") {
      log.backup = b.result;
      break;
    }
    if (b.state === "failed") throw new Error(JSON.stringify(b.error));
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(log.backup);
  log.status = "passed";
  log.completedAt = new Date().toISOString();
  save();
  console.log(
    "Live selfcheck passed: saved content, downloads, exact AI patch and backup.",
  );
} catch (e: any) {
  log.status = "failed";
  log.error = e.message;
  save();
  console.error(e.message);
  process.exitCode = 1;
}
