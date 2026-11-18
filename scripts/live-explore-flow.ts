// Explicit real-provider acceptance. Uses an isolated clone, no sends and no production accounts.
import { DatabaseSync, backup } from "node:sqlite";
import {
  mkdirSync,
  mkdtempSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import { chromium, expect } from "playwright/test";
import assert from "node:assert/strict";
const out = "test-results/explore-live";
mkdirSync(out, { recursive: true });
const resume = process.argv.includes("--resume-last");
const previousDir = resume
  ? readdirSync("test-results")
      .filter((v) => /^explore-live-data-[a-zA-Z0-9_-]+$/.test(v))
      .sort(
        (a, b) =>
          statSync(join("test-results", b)).birthtimeMs -
          statSync(join("test-results", a)).birthtimeMs,
      )[0]
  : null;
const dir = resume
  ? resolve("test-results", previousDir!)
  : mkdtempSync(join(process.cwd(), "test-results/explore-live-data-"));
if (!resume) {
  mkdirSync(join(dir, "assets"));
  const source = new DatabaseSync(resolve("../data/app.sqlite"), {
    readOnly: true,
  });
  await backup(source, join(dir, "app.sqlite"));
  for (const a of source.prepare("SELECT path FROM assets").all() as any[])
    copyFileSync(resolve("../data", a.path), join(dir, a.path));
  source.close();
  copyFileSync(resolve("../data/secrets.dpapi"), join(dir, "secrets.dpapi"));
}
const password = randomBytes(24).toString("base64url");
const clone = new DatabaseSync(join(dir, "app.sqlite"));
if (resume) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  }).toString("hex");
  clone
    .prepare(
      "UPDATE users SET password_hash=?,must_change_password=0,status='active' WHERE username='acceptance-admin'",
    )
    .run(`scrypt$${salt}$${digest}`);
  clone.exec("DELETE FROM auth_sessions");
}
const cfg: any = JSON.parse(
  (clone.prepare("SELECT body FROM settings WHERE id=1").get() as any).body,
);
cfg.autoSend = false;
cfg.scheduleEnabled = false;
clone.prepare("UPDATE settings SET body=? WHERE id=1").run(JSON.stringify(cfg));
clone
  .prepare(
    "UPDATE jobs SET state='canceled' WHERE state IN ('queued','running','interrupted')",
  )
  .run();
clone
  .prepare(
    "UPDATE outbox SET state='unknown' WHERE state IN ('pending','sending')",
  )
  .run();
clone.close();
const base = "http://127.0.0.1:37896";
let browser: any, server: any;
const record: any = resume
  ? JSON.parse(readFileSync(out + "/result.json", "utf8"))
  : {
      startedAt: new Date().toISOString(),
      dataIsolation: true,
      productionAccountsUnchanged: true,
    };
delete record.error;
if (resume) record.resumedAt = new Date().toISOString();
const save = () =>
  writeFileSync(out + "/result.json", JSON.stringify(record, null, 2));
let cookie = "",
  csrf = "";
async function api(path: string, body?: any, method?: string) {
  const r = await fetch(base + "/api" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      cookie,
      "x-csrf-token": csrf,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value: any = await r.json();
  if (!r.ok) throw new Error(path + ": " + JSON.stringify(value));
  return value;
}
async function wait(id: string) {
  for (let n = 0; n < 600; n++) {
    const j = await api("/jobs/" + id);
    if (j.state === "succeeded") return j;
    if (["failed", "interrupted", "canceled"].includes(j.state))
      throw new Error("job failed " + JSON.stringify(j.error));
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("job timeout");
}
try {
  server = spawn(process.execPath, ["dist-server/server/index.js"], {
    env: { ...process.env, ECUSTUDIO_DATA_DIR: dir, PORT: "37896" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((ok, no) => {
    const t = setTimeout(() => no(new Error("startup timeout")), 20000);
    server.stdout.on("data", (b: any) => {
      if (String(b).includes("已启动")) {
        clearTimeout(t);
        ok();
      }
    });
    server.once("exit", () => {
      clearTimeout(t);
      no(new Error("server exited"));
    });
  });
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  const browserErrors: string[] = [];
  page.on("pageerror", (e: any) => browserErrors.push(e.message));
  await page.goto(base);
  if (resume) {
    await page.getByLabel("账号", { exact: true }).fill("acceptance-admin");
    await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
  } else {
    await page
      .getByRole("heading", { name: "创建管理员", exact: true })
      .waitFor();
    await page.getByLabel("显示名称", { exact: true }).fill("探索验收管理员");
    await page.getByLabel("账号", { exact: true }).fill("acceptance-admin");
    await page.getByLabel("密码（至少10位）", { exact: true }).fill(password);
    await page.getByRole("button", { name: "创建并进入工作台" }).click();
  }
  await page
    .getByRole("heading", { name: "今日工作台", exact: true })
    .waitFor();
  const auth = await context.request.get(base + "/api/session");
  const s = await auth.json();
  csrf = s.csrf;
  cookie = (await context.cookies())
    .filter((c: any) => c.name === "ecustudio")
    .map((c: any) => c.name + "=" + c.value)
    .join(";");
  const initial = await api("/state");
  assert.ok(initial.snapshots.length >= 2);
  if (initial.settings.theme !== "scholar") {
    await api(
      "/settings/theme",
      { revision: initial.settings.revision, theme: "scholar" },
      "PATCH",
    );
    await page.reload();
  }
  let note: any, cid: string;
  if (resume) {
    assert.ok(record.speechId, "resume requires completed real AI generation");
    note = await api("/notes/" + record.noteId);
    const previous = await api("/jobs/" + record.firstJob);
    cid = previous.result.conversationId;
    await page.goto(base + "/#explore/" + cid);
    await page.locator(".chat-message.assistant").first().waitFor();
    await page.screenshot({
      path: out + "/explore-desktop.png",
      fullPage: true,
    });
  } else {
    record.originalSnapshots = initial.snapshots.length;
    await page
      .locator("nav")
      .getByRole("link", { name: "AI 探索", exact: true })
      .click();
    const prompt =
      "检索本地资料和联网信息，查找北京教育考试院2027年初中学业水平考试报名安排。列出全市报名信息采集时间与各区自行确定报名时段的区别，不能把全市采集时间直接当作各区具体时段。优先引用bjeea.cn官方来源，450字以内。";
    await page.getByLabel("对话指令").fill(prompt);
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await page.waitForURL(/#explore\/.+/);
    cid = page.url().split("#explore/")[1];
    let convo = await api("/conversations/" + cid);
    const first = await wait(convo.jobs[0].id);
    record.firstJob = first.id;
    record.firstUsage = first.result.usage;
    assert.ok(
      first.result.sources.some((v: any) => v.kind === "web"),
      "actual web sources required",
    );
    assert.ok(
      first.result.sources.some((v: any) => v.kind === "snapshot"),
      "actual local sources required",
    );
    assert.ok(first.result.tools.some((v: any) => v.name === "search_web"));
    record.sourceSummary = first.result.sources.map((v: any) => ({
      id: v.id,
      kind: v.kind,
      title: v.title,
      url: v.url,
      published: v.published,
    }));
    record.firstWarnings = first.result.warnings;
    await page
      .getByRole("button", { name: "添加到创作笔记", exact: true })
      .waitFor({ timeout: 20000 });
    await page.screenshot({
      path: out + "/explore-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "添加到创作笔记", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "已添加到创作笔记" })
      .waitFor();
    const notes = await api("/notes");
    note = notes.find(
      (n: any) => n.origin_message_id === first.result.messageId,
    );
    assert.ok(note);
    record.noteId = note.id;
    writeFileSync(out + "/研究回答.md", first.result.text);
    save();
    console.log("Real local + web answer saved to note.");
    await page.goto(base + "/#notes/" + note.id);
    await expect(page.getByLabel("笔记标题", { exact: true })).toHaveValue(
      note.title,
    );
    await page.screenshot({ path: out + "/notes-desktop.png", fullPage: true });
    await page.getByRole("button", { name: "载入AI对话", exact: true }).click();
    await expect(page.locator(".context-choice input:checked")).toHaveCount(1);
    await page.getByLabel("检索范围", { exact: true }).selectOption("local");
    await page
      .getByLabel("对话指令")
      .fill(
        "只基于选中的创作笔记，整理一份给家长的三点沟通提纲。保留时间口径差异和待核实提示，200字以内。",
      );
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await page.waitForURL(new RegExp("#explore/(?!" + cid + ").+"));
    const secondCid = page.url().split("#explore/")[1];
    convo = await api("/conversations/" + secondCid);
    const second = await wait(convo.jobs[0].id);
    record.secondJob = second.id;
    assert.ok(second.result.sources.some((v: any) => v.noteId === note.id));
    assert.ok(!second.result.tools.some((v: any) => v.name === "search_web"));
    convo = await api("/conversations/" + secondCid);
    assert.equal(
      convo.messages.find((m: any) => m.role === "user").context.notes[0]
        .revision,
      note.revision,
    );
    console.log("Note loaded back into actual AI conversation.");
    await page.goto(base + "/#notes/" + note.id);
    await page
      .getByRole("button", { name: "作为创作素材", exact: true })
      .click();
    await page
      .getByLabel("项目名称", { exact: true })
      .fill("AI探索与笔记真实验收项目");
    await page.getByRole("button", { name: "确认载入素材" }).click();
    await page.waitForURL(/#project\/.+/);
    const pid = page.url().split("#project/")[1],
      project = await api("/projects/" + pid);
    record.projectId = pid;
    record.materialSnapshotId = project.snapshotIds[0];
    assert.equal(project.snapshots[0].document_type, "媒体解读");
    const research = await wait(
      (
        await api("/agent/runs", {
          kind: "research",
          snapshotIds: project.snapshotIds,
          prompt: "提取可在笔记原文中定位的候选事实，所有结论保持待核实。",
        })
      ).id,
    );
    record.researchClaimCount = research.result.claimIds.length;
    assert.ok(research.result.claimIds.length > 0);
    const master = await wait(
      (
        await api("/agent/runs", {
          kind: "master",
          projectId: pid,
          prompt:
            "基于创作笔记素材生成一份供家长沟通的简短母稿，保留范围、条件和待核实事项；500字以内。",
        })
      ).id,
    );
    record.masterId = master.result.versionId;
    const speech = await wait(
      (
        await api("/agent/runs", {
          kind: "speech",
          projectId: pid,
          masterId: master.result.versionId,
          duration: 60,
          prompt:
            "只讲信息采集时段与各区报名时段的区别，面向家长，保留引用和待核实提示。",
        })
      ).id,
    );
    record.speechId = speech.result.versionId;
  }
  const exported = await wait(
    (
      await api("/exports", {
        targetType: "version",
        targetId: record.speechId,
        format: "docx",
        mode: "draft",
      })
    ).id,
  );
  const file = await fetch(
    base + "/api/artifacts/" + exported.result.id + "/download",
    { headers: { cookie } },
  );
  assert.equal(file.status, 200);
  const bytes = Buffer.from(await file.arrayBuffer());
  assert.equal(bytes.subarray(0, 2).toString(), "PK");
  writeFileSync(out + "/笔记创作口播草稿.docx", bytes);
  console.log(
    "Note → material → actual research → master → speech → DOCX passed.",
  );
  // Account management through the actual UI.
  const existingUsers = await api("/auth/users");
  for (const username of ["creator-demo", "sales-demo"]) {
    const u = existingUsers.find((u: any) => u.username === username);
    if (u)
      await api(
        "/auth/users/" + u.id,
        {
          revision: u.revision,
          password,
          role: username === "sales-demo" ? "sales" : "creator",
          status: "active",
        },
        "PATCH",
      );
  }
  await page.goto(base + "/#accounts");
  if (!existingUsers.some((u: any) => u.username === "creator-demo")) {
    await page.getByRole("button", { name: "新建账号", exact: true }).click();
    await page.getByLabel("账号名", { exact: true }).fill("creator-demo");
    await page.getByLabel("显示名称", { exact: true }).fill("验收创作者");
    await page.getByLabel("初始密码（至少10位）").fill(password);
    await page.getByRole("button", { name: "保存账号", exact: true }).click();
    await expect(
      page.locator(".member-row").filter({ hasText: "验收创作者" }),
    ).toHaveCount(1);
  }
  if (!existingUsers.some((u: any) => u.username === "sales-demo")) {
    await page.getByRole("button", { name: "新建账号", exact: true }).click();
    await page.getByLabel("账号名", { exact: true }).fill("sales-demo");
    await page.getByLabel("显示名称", { exact: true }).fill("验收业务员");
    await page.getByLabel("账号身份", { exact: true }).selectOption("sales");
    await page.getByLabel("初始密码（至少10位）").fill(password);
    await page.getByRole("button", { name: "保存账号", exact: true }).click();
    await expect(page.locator(".member-row")).toHaveCount(3);
  }
  await page.screenshot({
    path: out + "/accounts-desktop.png",
    fullPage: true,
  });
  async function roleLogin(name: string) {
    const c = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      p = await c.newPage();
    p.on("pageerror", (e: any) => browserErrors.push(e.message));
    await p.goto(base);
    await p.getByLabel("账号", { exact: true }).fill(name);
    await p.getByLabel("密码", { exact: true }).fill(password);
    await p.getByRole("button", { name: "登录", exact: true }).click();
    await p
      .getByRole("heading", { name: "设置你的密码", exact: true })
      .waitFor();
    const newPassword = randomBytes(24).toString("base64url");
    await p.getByLabel("当前密码", { exact: true }).fill(password);
    await p.getByLabel("新密码（至少10位）", { exact: true }).fill(newPassword);
    await p.getByLabel("再次输入新密码", { exact: true }).fill(newPassword);
    await p.getByRole("button", { name: "保存新密码", exact: true }).click();
    return { context: c, page: p };
  }
  const creator = await roleLogin("creator-demo");
  await creator.page
    .getByRole("heading", { name: "今日工作台", exact: true })
    .waitFor();
  await expect(
    creator.page
      .locator("nav")
      .getByRole("link", { name: "账号管理", exact: true }),
  ).toHaveCount(0);
  assert.equal(
    (await creator.context.request.get(base + "/api/auth/users")).status(),
    403,
  );
  await creator.page
    .locator("nav")
    .getByRole("link", { name: "创作笔记", exact: true })
    .click();
  const priorCreatorNotes = await (
    await creator.context.request.get(base + "/api/notes")
  ).json();
  if (!priorCreatorNotes.length) {
    await creator.page
      .getByLabel("笔记标题", { exact: true })
      .fill("创作者自己的笔记");
    await creator.page
      .getByLabel("笔记内容", { exact: true })
      .fill("只有自己和管理员可访问的创作者验收笔记。");
    await creator.page
      .getByRole("button", { name: "保存笔记", exact: true })
      .click();
    await creator.page
      .getByRole("status")
      .filter({ hasText: "笔记已保存" })
      .waitFor();
  }
  await expect(creator.page.locator(".thread-list button")).toHaveCount(1);
  const sales = await roleLogin("sales-demo");
  await sales.page
    .getByRole("heading", { name: "政策情报", exact: true })
    .waitFor();
  await expect(sales.page.locator("nav a")).toHaveCount(2);
  assert.equal(
    (await sales.context.request.get(base + "/api/notes")).status(),
    403,
  );
  await sales.page.locator(".read-card").first().click();
  await sales.page.locator(".read-paragraph").first().waitFor();
  await sales.page
    .locator("nav")
    .getByRole("link", { name: "成果与日报", exact: true })
    .click();
  await sales.page
    .getByRole("heading", { name: "成果与日报", exact: true })
    .waitFor();
  await sales.page.screenshot({
    path: out + "/sales-desktop.png",
    fullPage: true,
  });
  await page.goto(base + "/#explore/" + cid);
  await page.locator(".chat-message.assistant").first().waitFor();
  const currentState = await api("/state");
  await api(
    "/settings/theme",
    { revision: currentState.settings.revision, theme: "obsidian" },
    "PATCH",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "obsidian");
  await page.screenshot({
    path: out + "/explore-obsidian.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () =>
      document.querySelector(".sidebar")!.getBoundingClientRect().right <= 1,
  );
  await page.screenshot({ path: out + "/explore-mobile.png", fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.goto(base + "/#notes/" + note.id);
  await expect(page.getByLabel("笔记标题", { exact: true })).toHaveValue(
    note.title,
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({ path: out + "/notes-mobile.png", fullPage: true });
  assert.deepEqual(browserErrors, []);
  record.browserErrors = browserErrors;
  record.uiChecks = [
    "admin-setup",
    "actual-chat-submit",
    "answer-to-note",
    "note-to-chat",
    "note-to-project",
    "create-accounts",
    "first-login-password",
    "creator-private-notes",
    "sales-readonly",
    "scholar-desktop",
    "obsidian-desktop",
    "390-mobile",
  ];
  record.status = "passed";
  record.finishedAt = new Date().toISOString();
  save();
  console.log("Real-provider and role UI acceptance passed.");
} catch (e: any) {
  record.status = "failed";
  record.error = e.message;
  save();
  throw e;
} finally {
  await browser?.close();
  server?.kill();
}
