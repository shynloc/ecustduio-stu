import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { setupInjected, loginInjected } from "./auth-helper.js";
mkdirSync("test-results", { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  join(process.cwd(), "test-results/core-"),
);
const D = await import("../server/db.js"),
  domain = await import("../server/domain.js"),
  tasks = await import("../server/tasks.js"),
  agent = await import("../server/agent.js"),
  exp = await import("../server/exports.js"),
  security = await import("../server/security.js"),
  backup = await import("../server/backup.js");
const { buildApp } = await import("../server/app.js");
const app = await buildApp(false);
let { cookie, csrf } = await setupInjected(app, "localhost:4317");
async function call(method: any, url: string, payload?: any, extra: any = {}) {
  return app.inject({
    method,
    url,
    headers: { host: "localhost:4317", cookie, "x-csrf-token": csrf, ...extra },
    payload,
  });
}
test("主题默认晴空（保留 scholar 标识）；切换只更新主题，重开保留，拒绝非法主题与旧版本", async () => {
  const initial = D.settings();
  assert.equal(initial.theme, "scholar");
  const r = await call("PATCH", "/api/settings/theme", {
    revision: initial.revision,
    theme: "obsidian",
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().theme, "obsidian");
  const { theme, revision, ...other } = D.settings(),
    { theme: oldTheme, revision: oldRevision, ...oldOther } = initial;
  assert.deepEqual(other, oldOther);
  assert.equal(
    (
      await call("PATCH", "/api/settings/theme", {
        revision: initial.revision,
        theme: "scholar",
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (await call("PATCH", "/api/settings/theme", { revision, theme: "invalid" }))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await call("PATCH", "/api/settings/theme", {
        revision,
        theme: "scholar",
        autoSend: true,
      })
    ).statusCode,
    400,
  );
  D.db.close();
  D.reopenDatabase();
  assert.equal(D.settings().theme, "obsidian");
  assert.equal(
    (
      await call("PATCH", "/api/settings/theme", {
        revision: D.settings().revision,
        theme: "scholar",
      })
    ).statusCode,
    200,
  );
});
test("DeepSeek局部设置只保存AI配置，拒绝过期与跨模块参数，未授权提示指明操作路径", async () => {
  const { DeepSeekSettings } = await import("../shared/schema.js");
  const before = D.settings();
  const fields = DeepSeekSettings.parse(
    Object.fromEntries(
      Object.keys(DeepSeekSettings.shape).map((k) => [k, before[k]]),
    ),
  );
  const saved = await call("PATCH", "/api/settings/deepseek", {
    revision: before.revision,
    settings: { ...fields, allowExternalAI: true, model: "deepseek-flash" },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().allowExternalAI, true);
  for (const k of ["scheduleEnabled", "autoSend", "keywords", "targetName"])
    assert.equal(D.settings()[k], before[k]);
  assert.equal(
    (
      await call("PATCH", "/api/settings/deepseek", {
        revision: before.revision,
        settings: fields,
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await call("PATCH", "/api/settings/deepseek", {
        revision: D.settings().revision,
        settings: { ...fields, scheduleEnabled: true },
      })
    ).statusCode,
    400,
  );
  const disabled = await call("PATCH", "/api/settings/deepseek", {
    revision: D.settings().revision,
    settings: { ...fields, allowExternalAI: false },
  });
  assert.equal(disabled.statusCode, 200);
  const probe = await call("POST", "/api/agent/probe");
  assert.equal(probe.statusCode, 403);
  assert.match(probe.json().error.message, /调用授权/);
  assert.match(probe.json().error.message, /保存并测试连接/);
});
const scope = {
  region: "北京",
  district: "全市",
  stage: "中考",
  year: 2026,
  audience: "测试受众",
};
const sourceText =
  "【合成测试材料，不是真实政策】\n测试资料要求参加活动前阅读说明，并向所在学校确认适用条件。\n本材料仅用于验证软件，不构成招生建议。";
let snap: any, claim: any, project: any, master: any, content: any;
after(async () => {
  await app.close();
  D.db.close();
});
// Upload helper exercises the same multipart endpoint used by the UI.
async function uploadFixture(
  name: string,
  bytes: Buffer,
  mime = "application/octet-stream",
) {
  const boundary = "ecustudio-fixture-boundary";
  const response = await call(
    "POST",
    "/api/uploads",
    Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    { "content-type": "multipart/form-data; boundary=" + boundary },
  );
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}
test("A01：无凭据进入工作台，跨站写入和缺 CSRF 拒绝", async () => {
  assert.equal((await call("GET", "/api/state")).statusCode, 200);
  assert.equal(
    (await call("POST", "/api/projects", {}, { "x-csrf-token": "" }))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await call("GET", "/api/state", undefined, {
        origin: "https://evil.example",
      })
    ).statusCode,
    403,
  );
});
test("A03/A05：原文快照、重复导入与引用定位", () => {
  snap = domain.saveSnapshot({
    title: "合成回归资料",
    text: sourceText,
    scope,
    published: "2026-11-08",
    documentType: "正式文件",
    publisher: "测试夹具",
  });
  assert.equal(
    domain.saveSnapshot({
      title: "合成回归资料",
      text: sourceText,
      scope,
      published: "2026-11-08",
      documentType: "正式文件",
    }).id,
    snap.id,
  );
  claim = domain.addClaim({
    snapshotId: snap.id,
    paragraphId: "p2",
    quote: snap.paragraphs[1].text,
    text: snap.paragraphs[1].text,
  });
  assert.equal(claim.status, "pending");
  assert.throws(
    () =>
      domain.addClaim({
        snapshotId: snap.id,
        paragraphId: "p2",
        quote: "不存在的原文片段",
        text: "伪造",
      }),
    /引用/,
  );
});
test("A04/A06：待核实不推荐，核验有明确依据和范围", () => {
  assert.equal(domain.eligible(snap.id), false);
  assert.throws(() =>
    domain.verifyClaim(claim.id, {
      revision: 1,
      status: "verified",
      reason: "测试",
      scopeConfirmed: false,
    }),
  );
  claim = domain.verifyClaim(claim.id, {
    revision: 1,
    status: "verified",
    reason: "合成测试：逐字引文与范围核对，仅测试软件",
    scopeConfirmed: true,
  });
  assert.equal(domain.eligible(snap.id), true);
  assert.equal(domain.eligible(snap.id, 2027), false);
});
test("A06：评分范围和依据校验，规则可复算", () => {
  assert.throws(() =>
    domain.makeTopic({
      snapshotId: snap.id,
      scores: [5, 0, 0, 0, 0],
      reasons: ["x", "x", "x", "x", "x"],
    }),
  );
  const t = domain.makeTopic({
    snapshotId: snap.id,
    title: "合成测试选题",
    scores: [4, 4, 4, 4, 4],
    reasons: ["测试", "测试", "测试", "测试", "测试"],
  });
  assert.equal(t.total, 100);
  assert.equal(t.eligible, true);
});
test("A02/A18：母稿内容版本与并发冲突", () => {
  project = domain.createProject({
    title: "合成测试项目",
    scope,
    snapshotIds: [snap.id],
  });
  master = domain.saveVersion({
    projectId: project.id,
    kind: "master",
    expectedRevision: 1,
    body: domain.masterFromSources(project.id),
  });
  assert.throws(
    () =>
      domain.saveVersion({
        projectId: project.id,
        kind: "master",
        expectedRevision: 1,
        body: master.body,
      }),
    /其他页面/,
  );
  content = domain.saveVersion({
    projectId: project.id,
    kind: "presentation",
    masterId: master.id,
    expectedRevision: 2,
    body: { ...master.body, title: "合成测试演示", unverified: [] },
  });
  assert.equal(content.master_id, master.id);
  assert.equal(
    D.all("SELECT * FROM version_claims WHERE version_id=?", content.id).length,
    1,
  );
});
test("B03：服务端审核门禁，草稿可导出、正式版拒绝直到确认", () => {
  assert.throws(() => domain.canExport(content.id, "release"), /确认/);
  domain.confirmVersion(content.id, "confirmed");
  assert.equal(domain.canExport(content.id, "release").id, content.id);
});
test("A09：精确修改未涉及块保持不变，新版本不能继承确认", () => {
  const b = structuredClone(content.body);
  b.blocks[0].title = "仅修改标题";
  const v = domain.saveVersion({
    projectId: project.id,
    kind: "presentation",
    masterId: master.id,
    baseVersionId: content.id,
    expectedRevision: 3,
    body: b,
  });
  assert.equal(v.body.blocks[0].text, content.body.blocks[0].text);
  assert.equal(v.review, "unreviewed");
  assert.throws(() => domain.canExport(v.id, "release"), /确认/);
});
test("A11：幂等创建不重复，不同输入拒绝复用键", () => {
  const a = tasks.enqueue("backup", {}, "test-key"),
    b = tasks.enqueue("backup", {}, "test-key");
  assert.equal(a.id, b.id);
  assert.throws(
    () => tasks.enqueue("backup", { x: 1 }, "test-key"),
    /不同内容/,
  );
  tasks.cancelJob(a.id);
  assert.equal(
    D.get("SELECT state FROM jobs WHERE id=?", a.id).state,
    "canceled",
  );
});
test("A12：北京时间计划与唯一领取，可控时钟", () => {
  const cfg = { ...D.settings(), scheduleEnabled: true };
  D.run("UPDATE settings SET body=? WHERE id=1", D.json(cfg));
  const t = new Date("2026-11-08T01:00:00Z");
  assert.equal(tasks.nextSchedule(t, cfg, true).toISOString(), t.toISOString());
  tasks.scheduleTick(t);
  tasks.scheduleTick(t);
  assert.equal(D.get("SELECT count(*) n FROM occurrences").n, 1);
  assert.equal(
    tasks.nextSchedule(new Date("2026-11-08T00:59:00Z"), cfg).toISOString(),
    t.toISOString(),
  );
  D.run(
    "UPDATE settings SET body=? WHERE id=1",
    D.json({ ...cfg, scheduleEnabled: false }),
  );
});
test("A17：SSRF与路径边界拦截", async () => {
  assert.equal(security.isPublicAddress("127.0.0.1"), false);
  assert.equal(security.isPublicAddress("::ffff:127.0.0.1"), false);
  assert.equal(security.isPublicAddress("169.254.169.254"), false);
  assert.equal(security.isPublicAddress("8.8.8.8"), true);
  await assert.rejects(security.publicUrl("http://localhost/test"));
  assert.throws(() => security.inside(D.dataDir, "../../outside"));
});
test("A17：危险网页脚本移除、未知文件明确拒绝", async () => {
  const x = await domain.extract(
    Buffer.from(
      "<html><head><title>测试</title></head><body><script>alert(1)</script><p>这是用于验证文本提取的正文内容。</p></body></html>",
    ),
    "test.html",
    "text/html",
  );
  assert.ok(!x.text.includes("alert"));
  await assert.rejects(domain.extract(Buffer.from("test"), "bad.exe"));
});
test("Agent：真实工具循环协议，固定替身仅用于接口测试", async () => {
  const input = agent.freezeAgentInput({
    kind: "speech",
    projectId: project.id,
    masterId: master.id,
  });
  let round = 0;
  const transport: any = async (url: any, opt: any) => {
    const payload = JSON.parse(opt.body);
    assert.equal(payload.model, "deepseek-flash");
    round++;
    return new Response(
      JSON.stringify(
        round === 1
          ? {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: "tool-test",
                        type: "function",
                        function: { name: "read_master", arguments: "{}" },
                      },
                    ],
                  },
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 2 },
            }
          : {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      ...master.body,
                      title: "替身口播",
                    }),
                  },
                  finish_reason: "stop",
                },
              ],
              usage: { prompt_tokens: 20, completion_tokens: 10 },
            },
      ),
      { status: 200 },
    );
  };
  const result = await agent.runAgent(
    input,
    () => {},
    new AbortController().signal,
    transport,
  );
  assert.equal(round, 2);
  assert.equal(result.toolLog[0].name, "read_master");
  assert.equal(result.usage.inputTokens, 30);
});
test("Agent：越界工具不执行，预算耗尽，非法引用拒绝", async () => {
  const input = agent.freezeAgentInput({
    kind: "speech",
    projectId: project.id,
    masterId: master.id,
  });
  const malicious: any = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              tool_calls: [
                { id: "x", function: { name: "shell", arguments: "{}" } },
              ],
            },
          },
        ],
      }),
    );
  await assert.rejects(
    agent.runAgent(input, () => {}, new AbortController().signal, malicious),
    /未授权工具/,
  );
  const loop: any = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              tool_calls: [
                { id: "x", function: { name: "read_master", arguments: "{}" } },
              ],
            },
          },
        ],
      }),
    );
  await assert.rejects(
    agent.runAgent(
      { ...input, config: { ...input.config, maxRequests: 1 } },
      () => {},
      new AbortController().signal,
      loop,
    ),
    /上限/,
  );
  const forged: any = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...master.body,
                blocks: [
                  {
                    ...master.body.blocks[0],
                    claimIds: ["other-project-claim"],
                  },
                ],
              }),
            },
          },
        ],
      }),
    );
  await assert.rejects(
    agent.runAgent(input, () => {}, new AbortController().signal, forged),
    /引用/,
  );
});
test("口播超长触发预算内重写，非分镜输出移除镜头字段", async () => {
  const input = agent.freezeAgentInput({
    kind: "speech",
    duration: 90,
    projectId: project.id,
    masterId: master.id,
  });
  let rounds = 0;
  const transport: any = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...master.body,
                blocks: [
                  {
                    ...master.body.blocks[0],
                    text: "测试内容".repeat(++rounds === 1 ? 200 : 20),
                    scene: "不应出现在口播结构的镜头",
                    camera: "镜头",
                    prompt: "图像",
                  },
                ],
              }),
            },
            finish_reason: "stop",
          },
        ],
      }),
    );
  const result = await agent.runAgent(
    input,
    () => {},
    new AbortController().signal,
    transport,
  );
  assert.equal(rounds, 2);
  assert.equal(result.content.blocks[0].scene, undefined);
  rounds = 0;
  await assert.rejects(
    agent.runAgent(
      { ...input, config: { ...input.config, maxRequests: 1 } },
      () => {},
      new AbortController().signal,
      transport,
    ),
    /时长/,
  );
});
test("数字核验排除段落和内容块ID，但保留备注中的政策数字检查", () => {
  const body = structuredClone(content.body);
  for (const b of body.blocks)
    b.notes = `见 p999，内容块 b03，引用 ${claim.id}`;
  assert.ok(
    !domain
      .quality(project.id, body)
      .some((i: any) => i.code === "NUMBER_REVIEW"),
  );
  body.blocks[0].notes += "；截止时间为2099年";
  assert.ok(
    domain
      .quality(project.id, body)
      .some((i: any) => i.message.includes("2099")),
  );
});
test("A10：七种真实文件导出、Office结构、PDF与离线HTML", async () => {
  for (const format of ["md", "html", "json", "csv", "docx", "pptx", "pdf"]) {
    const frozen = exp.freezeExport({
      targetType: "version",
      targetId: content.id,
      format,
      mode: "draft",
    });
    const artifact = await exp.exportFile(
      frozen,
      D.id(),
      new AbortController().signal,
    );
    const { a, data } = domain.assetBuffer(artifact.asset_id);
    assert.ok(data.length > 20);
    if (["docx", "pptx"].includes(format)) {
      const zip = new AdmZip(data);
      assert.ok(zip.getEntry("[Content_Types].xml"));
      if (format === "pptx")
        assert.ok(
          zip
            .getEntries()
            .some((e) => e.entryName.includes("notesSlides/notesSlide")),
        );
    }
    if (format === "pdf") assert.equal(data.subarray(0, 4).toString(), "%PDF");
    if (format === "html") assert.ok(data.toString().includes("合成测试演示"));
  }
});
test("A14：一致性备份恢复预检与破坏检测", async () => {
  const b = await backup.createBackup();
  const buffer = readFileSync(join(D.dataDir, "backups", b.backupId));
  const v = backup.validateBackup(buffer);
  assert.equal(v.projects, 1);
  assert.ok(v.versions >= 3);
  const zip = new AdmZip(buffer);
  zip.updateFile("app.sqlite", Buffer.from("corrupt"));
  assert.throws(() => backup.validateBackup(zip.toBuffer()), /校验/);
});
test("A18：核验撤回使依赖成果过期，旧文件保持不变", () => {
  const a = D.get("SELECT * FROM artifacts LIMIT 1");
  const before = domain.assetBuffer(a.asset_id).a.hash;
  domain.verifyClaim(claim.id, {
    revision: claim.revision,
    status: "pending",
    reason: "合成测试撤回",
    scopeConfirmed: false,
  });
  assert.throws(() => domain.canExport(content.id, "release"), /更新/);
  assert.equal(domain.assetBuffer(a.asset_id).a.hash, before);
});
test("A13：无授权与无配置不外发", () => {
  assert.throws(
    () => tasks.authorizeNotification(["invalid"], "未配置群"),
    /配置/,
  );
  assert.equal(D.get("SELECT count(*) n FROM outbox WHERE state='sent'").n, 0);
});
test("A02：数据库重新打开后保留记录", () => {
  D.db.close();
  D.reopenDatabase();
  assert.ok(D.get("SELECT id FROM projects WHERE id=?", project.id));
  assert.equal(D.get("SELECT count(*) n FROM versions").n, 3);
});
test("A11：过期租约中断、人工重试只产生一份快照、事件可重放", async () => {
  D.run("UPDATE jobs SET state='canceled' WHERE state='queued'");
  const j = tasks.enqueue("import", {
    text: "【中断恢复合成测试】本段仅用于验证任务重试不重复写入，不是真实招生政策。",
    title: "恢复测试",
    scope,
    documentType: "待判断",
  });
  D.run(
    "UPDATE jobs SET state='running',lease_owner='expired-owner',lease_until='2000-01-01T00:00:00Z' WHERE id=?",
    j.id,
  );
  const worker = new tasks.Worker();
  await worker.tick();
  assert.equal(
    D.get("SELECT state FROM jobs WHERE id=?", j.id).state,
    "interrupted",
  );
  tasks.retryJob(j.id);
  await worker.tick();
  const first = D.parse(
    D.get("SELECT result FROM jobs WHERE id=?", j.id).result,
  );
  assert.ok(first.id);
  assert.equal(
    D.get("SELECT state FROM jobs WHERE id=?", j.id).state,
    "succeeded",
  );
  D.run("UPDATE jobs SET state='interrupted' WHERE id=?", j.id);
  tasks.retryJob(j.id);
  await worker.tick();
  assert.equal(
    D.parse(D.get("SELECT result FROM jobs WHERE id=?", j.id).result).id,
    first.id,
  );
  const events = D.all(
    "SELECT seq FROM events WHERE job_id=? ORDER BY seq",
    j.id,
  );
  assert.deepEqual(
    events.map((e) => e.seq),
    events.map((_, i) => i + 1),
  );
});
test("A14：执行恢复、引用资产保留、调度暂停和安全备份", async () => {
  const b = await backup.createBackup(),
    before = D.get("SELECT count(*) n FROM snapshots").n;
  const validation = backup.validateBackup(
    readFileSync(join(D.dataDir, "backups", b.backupId)),
  );
  domain.saveSnapshot({
    title: "恢复后应消失的合成资料",
    text: "【临时合成内容】此记录用于验证备份恢复时数据库确实回到备份点。",
    scope,
  });
  assert.equal(D.get("SELECT count(*) n FROM snapshots").n, before + 1);
  const result = await backup.restoreBackup(validation.token);
  assert.equal((await call("GET", "/api/state")).statusCode, 401);
  ({ cookie, csrf } = await loginInjected(app, "localhost:4317"));
  assert.equal(result.restored, true);
  assert.equal(D.get("SELECT count(*) n FROM snapshots").n, before);
  assert.equal(D.settings().scheduleEnabled, false);
  assert.equal(D.settings().autoSend, false);
  assert.equal(D.get("PRAGMA integrity_check").integrity_check, "ok");
  assert.equal(D.all("PRAGMA foreign_key_check").length, 0);
  for (const a of D.all("SELECT id FROM assets"))
    assert.ok(domain.assetBuffer(a.id).data.length);
});
test("A04/A18：资料元数据校正使事实待核验、旧版本过期且冲突被拒绝", () => {
  const source = domain.snapshotView(
    D.get("SELECT * FROM snapshots WHERE id=?", snap.id),
  );
  const input = {
    expectedMetadataHash: source.metadataHash,
    title: source.title,
    publisher: source.publisher,
    published: source.published,
    documentType: "征求意见",
    scope: { ...scope, year: 2027 },
    reason: "合成测试范围校正",
  };
  const corrected = domain.correctSnapshot(source.id, input);
  assert.equal(corrected.scope.year, 2027);
  assert.equal(
    D.get("SELECT status FROM claims WHERE id=?", claim.id).status,
    "pending",
  );
  assert.equal(domain.eligible(source.id), false);
  assert.equal(
    D.get("SELECT stale FROM versions WHERE id=?", content.id).stale,
    1,
  );
  assert.throws(() => domain.correctSnapshot(source.id, input), /修改/);
});
test("A17：压缩规模限制、错误PDF与伪DOCX拒绝", async () => {
  const zip = new AdmZip();
  zip.addFile("large.txt", Buffer.alloc(10000));
  assert.throws(() => security.validateArchive(zip.toBuffer(), 100), /规模/);
  await assert.rejects(
    domain.extract(Buffer.from("<html>fake</html>"), "fake.pdf"),
    /PDF/,
  );
  await assert.rejects(domain.extract(zip.toBuffer(), "fake.docx"), /DOCX/);
});
test("凭据：Windows DPAPI往返加密，删除配置后不可用", async () => {
  const secrets = await import("../server/secrets.js");
  await secrets.setSecret("dingtalkSign", "synthetic-local-test-value");
  assert.equal(secrets.hasSecret("dingtalkSign"), true);
  assert.equal(
    readFileSync(join(D.dataDir, "secrets.dpapi"), "utf8").includes(
      "synthetic-local-test-value",
    ),
    false,
  );
  assert.equal(
    await secrets.getSecret("dingtalkSign"),
    "synthetic-local-test-value",
  );
  await secrets.setSecret("dingtalkSign", "");
  assert.equal(secrets.hasSecret("dingtalkSign"), false);
});
test("项目创建幂等与锁定内容服务端保护", async () => {
  const input = { title: "幂等合成项目", scope, snapshotIds: [snap.id] },
    headers = { "idempotency-key": "project-idempotency-fixture" };
  const a = await call("POST", "/api/projects", input, headers),
    b = await call("POST", "/api/projects", input, headers);
  assert.equal(a.statusCode, 200);
  assert.equal(a.json().id, b.json().id);
  assert.equal(
    (
      await call(
        "POST",
        "/api/projects",
        { ...input, title: "changed" },
        headers,
      )
    ).statusCode,
    409,
  );
  const body = domain.masterFromSources(a.json().id);
  body.blocks[0].locked = true;
  const v = domain.saveVersion({
    projectId: a.json().id,
    kind: "master",
    body,
    expectedRevision: 1,
  });
  const changed = structuredClone(v.body);
  changed.blocks[0].text = "试图修改锁定内容";
  assert.throws(
    () =>
      domain.saveVersion({
        projectId: a.json().id,
        kind: "master",
        body: changed,
        expectedRevision: 2,
        origin: "deepseek",
      }),
    /锁定/,
  );
});
test("项目交付ZIP清单一致、默认排除原文、不能打包其他项目", async () => {
  const a = D.get("SELECT id FROM artifacts LIMIT 1");
  const response = await call("POST", `/api/projects/${project.id}/package`, {
    artifactIds: [a.id],
    includeSources: false,
  });
  assert.equal(response.statusCode, 200);
  const zip = new AdmZip(domain.assetBuffer(response.json().assetId).data);
  const manifest = JSON.parse(zip.readAsText("manifest.json"));
  assert.equal(manifest.includesSourceText, false);
  assert.equal(manifest.entries.length, 1);
  assert.equal(
    D.hash(zip.readFile(manifest.entries[0].path)),
    manifest.entries[0].sha256,
  );
  const other = D.get("SELECT id FROM projects WHERE id!=?", project.id);
  assert.equal(
    (
      await call("POST", `/api/projects/${other.id}/package`, {
        artifactIds: [a.id],
      })
    ).statusCode,
    404,
  );
});
test("自定义监测范围校验和采集来源冻结", async () => {
  assert.equal(
    (
      await call("POST", "/api/monitor", {
        windowStart: "2020-01-01T00:00:00Z",
        windowEnd: "2026-01-01T00:00:00Z",
      })
    ).statusCode,
    422,
  );
  const r = await call("POST", "/api/monitor", {
    windowStart: new Date(Date.now() - 3600000).toISOString(),
    windowEnd: new Date().toISOString(),
  });
  assert.equal(r.statusCode, 200);
  assert.ok(
    Array.isArray(
      D.parse(D.get("SELECT input FROM jobs WHERE id=?", r.json().id).input)
        .sources,
    ),
  );
});
test("日报空结果、部分覆盖和全部失败的状态严格区分", async () => {
  const source = {
    id: "fixture-source",
    name: "合成监测来源",
    url: "https://example.org/list",
    scope: D.json(scope),
  };
  const input = {
    config: { ...D.settings(), allowExternalAI: false },
    windowStart: new Date(Date.now() - 86400000).toISOString(),
    windowEnd: D.now(),
    sources: [source],
  };
  const fixture: any = async (url: string) => ({
    url,
    type: "text/html",
    buffer: Buffer.from("<html><body>没有本窗口候选的合成页面</body></html>"),
  });
  const first = tasks.enqueue("monitor", input);
  const empty = await tasks.monitor(
    input,
    first.id,
    new AbortController().signal,
    () => {},
    fixture,
  );
  assert.equal(empty.coverage, "complete");
  assert.equal(
    D.parse(
      D.get("SELECT payload FROM reports WHERE id=?", empty.reportId).payload,
    ).topics.length,
    0,
  );
  const partialInput = {
    ...input,
    sources: [
      source,
      { ...source, id: "bad-source", url: "https://example.org/bad" },
    ],
  };
  const partialFetch: any = async (url: string) => {
    if (url.endsWith("/bad")) throw new Error("合成403");
    return fixture(url);
  };
  const second = tasks.enqueue("monitor", partialInput);
  const partial = await tasks.monitor(
    partialInput,
    second.id,
    new AbortController().signal,
    () => {},
    partialFetch,
  );
  assert.equal(partial.coverage, "partial");
  const count = D.get("SELECT count(*) n FROM reports").n,
    third = tasks.enqueue("monitor", input);
  await assert.rejects(
    tasks.monitor(
      input,
      third.id,
      new AbortController().signal,
      () => {},
      async () => {
        throw new Error("合成离线");
      },
    ),
    /全部来源/,
  );
  assert.equal(D.get("SELECT count(*) n FROM reports").n, count);
});
let workflow: any = {};
test("工作流：上传解析文本、HTML、DOCX、PDF并完成文件导入任务", async () => {
  for (const [name, bytes, mime] of [
    [
      "workflow.md",
      Buffer.from(
        "【合成工作流测试】这是用于验证文件上传、提取和资料入库的文本。",
      ),
      "text/markdown",
    ],
    [
      "workflow.html",
      Buffer.from(
        "<html><title>合成上传</title><body><p>这是用于验证网页上传和正文提取的合成工作流内容。</p></body></html>",
      ),
      "text/html",
    ],
    ...["docx", "pdf"].map((ext) => {
      const a = D.get("SELECT * FROM assets WHERE path LIKE ?", `%.${ext}`);
      return [`workflow.${ext}`, domain.assetBuffer(a.id).data, a.mime];
    }),
  ] as any[]) {
    const result = await uploadFixture(name, bytes, mime);
    assert.ok(result.text.length > 10);
    if (name.endsWith(".md")) workflow.assetId = result.id;
  }
  D.run("UPDATE jobs SET state='canceled' WHERE state='queued'");
  const imported = await call("POST", "/api/import-upload", {
    assetId: workflow.assetId,
    title: "文件导入自检",
    scope,
  });
  assert.equal(imported.statusCode, 200);
  await new tasks.Worker().tick();
  const j = D.get("SELECT * FROM jobs WHERE id=?", imported.json().id);
  assert.equal(j.state, "succeeded");
  workflow.snapshotId = D.parse(j.result).id;
});
test("工作流：角色参考图、Skill ZIP导入、重扫和固定版本", async () => {
  const image = await uploadFixture(
    "reference.png",
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4N0AAAAASUVORK5CYII=",
      "base64",
    ),
    "image/png",
  );
  const c = await call("POST", "/api/characters", {
    name: "合成角色",
    identity: "教育讲解员",
    appearance: "简洁职业服装",
    voice: "平稳清晰",
    outfit: "深蓝外套",
    imageAssetId: image.id,
  });
  assert.equal(c.statusCode, 200);
  const zip = new AdmZip();
  zip.addFile(
    "educontent-studio/SKILL.md",
    Buffer.from("# 合成工作流注册测试"),
  );
  zip.addFile(
    "educontent-studio/workflows/research.md",
    Buffer.from("只用于注册自检，不调用模型。"),
  );
  const uploaded = await uploadFixture(
    "workflow.zip",
    zip.toBuffer(),
    "application/zip",
  );
  const skill = await call("POST", "/api/skills/import", {
    assetId: uploaded.id,
  });
  assert.equal(skill.statusCode, 200);
  assert.equal(skill.json().validation, "imported_not_run");
  const originalHash = skill.json().hash;
  assert.equal((await call("POST", "/api/skills/rescan")).statusCode, 200);
  assert.equal(
    D.get("SELECT hash FROM skills WHERE id=?", skill.json().id).hash,
    originalHash,
  );
});
test("工作流：正式审核导出、外部任务包、旧母稿导入标为过期候选", async () => {
  const source = domain.saveSnapshot({
    title: "合成版本自检",
    text: "【合成材料】本内容只用于工作台功能验证，使用者应核对原文及适用条件。",
    scope,
    documentType: "正式文件",
    published: "2026-11-08",
  });
  const c = domain.addClaim({
    snapshotId: source.id,
    text: source.paragraphs[0].text,
    quote: source.paragraphs[0].text,
    paragraphId: source.paragraphs[0].id,
  });
  domain.verifyClaim(c.id, {
    revision: c.revision,
    status: "verified",
    scopeConfirmed: true,
    reason: "合成自检，对照原文和适用范围",
  });
  const p = domain.createProject({
    title: "合成外部结果自检",
    scope,
    snapshotIds: [source.id],
  });
  workflow.projectId = p.id;
  const first = domain.saveVersion({
    projectId: p.id,
    kind: "master",
    body: domain.masterFromSources(p.id),
    expectedRevision: 1,
  });
  const second = domain.saveVersion({
    projectId: p.id,
    kind: "master",
    body: first.body,
    expectedRevision: 2,
  });
  workflow.masterId = second.id;
  const v = await call("POST", "/api/external-results", {
    projectId: p.id,
    kind: "policy",
    body: first.body,
    masterId: first.id,
    expectedRevision: 3,
  });
  assert.equal(v.statusCode, 200);
  assert.equal(v.json().stale, 1);
  assert.throws(() => domain.canExport(v.json().id, "release"), /更新/);
  const fresh = await call("POST", "/api/external-results", {
    projectId: p.id,
    kind: "policy",
    body: first.body,
    masterId: second.id,
    baseVersionId: v.json().id,
    expectedRevision: 4,
  });
  assert.equal(fresh.statusCode, 200);
  assert.equal(fresh.json().stale, 0);
  assert.equal(
    (
      await call("POST", "/api/reviews", {
        versionId: fresh.json().id,
        decision: "confirmed",
        reason: "合成验收",
      })
    ).statusCode,
    200,
  );
  assert.equal(
    domain.canExport(fresh.json().id, "release").review,
    "confirmed",
  );
  const task = await call("GET", `/api/projects/${p.id}/task-package`);
  assert.equal(task.statusCode, 200);
  const taskZip = new AdmZip(task.rawPayload);
  const body = JSON.parse(taskZip.readAsText("task.json"));
  assert.equal(body.master.id, second.id);
  assert.equal(body.project.id, p.id);
});
test("工作流：补丁逐项接受，只改标题，重复接受拒绝", async () => {
  const p = D.get("SELECT * FROM projects WHERE id=?", workflow.projectId),
    v = domain.versionView(
      D.get("SELECT * FROM versions WHERE id=?", workflow.masterId),
    );
  const job = tasks.enqueue("agent", { kind: "patch" }),
    selected = v.body.blocks[0].id;
  D.run(
    "UPDATE jobs SET state='succeeded',result=? WHERE id=?",
    D.json({
      baseVersionId: v.id,
      blockIds: [selected],
      content: {
        patches: [{ blockId: selected, field: "title", value: "合成局部改写" }],
      },
    }),
    job.id,
  );
  const response = await call("POST", "/api/patches/accept", {
    jobId: job.id,
    indices: [0],
    expectedRevision: p.revision,
  });
  assert.equal(response.statusCode, 200);
  const expected = structuredClone(v.body);
  expected.blocks[0].title = "合成局部改写";
  assert.deepEqual(response.json().body, expected);
  assert.equal(
    (
      await call("POST", "/api/patches/accept", {
        jobId: job.id,
        indices: [0],
        expectedRevision: p.revision,
      })
    ).statusCode,
    409,
  );
});
test("工作流：超长中文通知分段、发送成功去重、结果未知禁止盲重试", async () => {
  const secrets = await import("../server/secrets.js");
  const cfg = D.settings();
  D.run(
    "UPDATE settings SET body=? WHERE id=1",
    D.json({ ...cfg, targetName: "合成测试目标" }),
  );
  const report = D.get("SELECT * FROM reports LIMIT 1"),
    payload = D.parse(report.payload);
  payload.topics = [
    {
      id: D.id(),
      title: "合成超长通知",
      summary: "测试中文通知内容😀".repeat(2500),
      total: 80,
      angle: "合成测试",
      snapshot_id: "test",
    },
  ];
  payload.sources = [];
  D.run("UPDATE reports SET payload=? WHERE id=?", D.json(payload), report.id);
  const parts = tasks.previewNotification(report.id);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => Buffer.byteLength(p.body) <= 12000));
  assert.equal(tasks.previewNotification(report.id)[0].id, parts[0].id);
  await secrets.setSecret(
    "dingtalkWebhook",
    "https://oapi.dingtalk.com/robot/send?access_token=synthetic-test-only",
  );
  let sent = 0;
  tasks.authorizeNotification([parts[0].id], "合成测试目标");
  await tasks.deliverNotification((async () => {
    sent++;
    return new Response(JSON.stringify({ errcode: 0 }));
  }) as any);
  assert.equal(
    D.get("SELECT state FROM outbox WHERE id=?", parts[0].id).state,
    "sent",
  );
  assert.throws(
    () => tasks.authorizeNotification([parts[0].id], "合成测试目标"),
    /不能/,
  );
  tasks.authorizeNotification([parts[1].id], "合成测试目标");
  await tasks.deliverNotification((async () => {
    throw new Error("合成超时，无真实请求");
  }) as any);
  assert.equal(
    D.get("SELECT state FROM outbox WHERE id=?", parts[1].id).state,
    "unknown",
  );
  assert.throws(
    () => tasks.authorizeNotification([parts[1].id], "合成测试目标"),
    /不能/,
  );
  assert.equal(sent, 1);
  await secrets.setSecret("dingtalkWebhook", "");
  D.run("UPDATE settings SET body=? WHERE id=1", D.json(cfg));
});
