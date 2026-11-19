import assert from "node:assert/strict";
import { expect } from "playwright/test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { testBrowser } from "./browser-helper.js";
import { setupBrowser, testAccount } from "./auth-helper.js";
mkdirSync("test-results", { recursive: true });
const out = resolve("test-results/experience-workspace");
mkdirSync(out, { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  resolve("test-results/workspace-data-"),
);
process.env.ECUSTUDIO_WEB_DIR = resolve("dist");
process.env.DEEPSEEK_API_KEY = "synthetic-injected-transport";
const D = await import("../server/db.js"),
  domain = await import("../server/domain.js"),
  { buildApp } = await import("../server/app.js"),
  { Worker } = await import("../server/tasks.js");
D.run(
  "UPDATE settings SET body=?",
  D.json({
    ...D.settings(),
    allowExternalAI: true,
    exploreEngine: "controlled",
  }),
);
const app = await buildApp(false),
  url = await app.listen({ host: "127.0.0.1", port: 0 }),
  browser = await testBrowser(),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
let calls = 0;
const worker = new Worker(undefined, undefined, async (_url, options) => {
  calls++;
  const b = JSON.parse(String(options?.body));
  assert.equal(b.stream, true);
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(c) {
        for (const content of [
          "## 教研观察\n\n",
          "已按所选资料整理，",
          "保留课堂记录。[S1]",
        ]) {
          c.enqueue(
            encoder.encode(
              "data: " +
                JSON.stringify({
                  choices: [
                    {
                      index: 0,
                      delta: { content, reasoning_content: "内部思考不要显示" },
                    },
                  ],
                }) +
                "\n\n",
            ),
          );
          await new Promise((r) => setTimeout(r, 450));
        }
        c.enqueue(
          encoder.encode(
            "data: " +
              JSON.stringify({
                model: "deepseek-fixture",
                usage: { prompt_tokens: 76, completion_tokens: 12 },
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
              }) +
              "\n\ndata: [DONE]\n\n",
          ),
        );
        c.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
});
try {
  await setupBrowser(page, url);
  const session = await (await page.request.get(url + "/api/session")).json(),
    headers = { "x-csrf-token": session.csrf },
    u = D.get("SELECT * FROM users WHERE username=?", testAccount.username);
  const note = await (
    await page.request.post(url + "/api/notes", {
      headers,
      data: {
        title: "较早的教师观察笔记",
        body: "教研小组开展课堂观察，记录学生讨论、教师反馈与下一轮改进。",
        categories: {
          folder: "教研",
          tags: ["课堂"],
          state: "organized",
          purposes: [],
        },
      },
    })
  ).json();
  for (let i = 0; i < 225; i++)
    D.run(
      "INSERT INTO conversations VALUES(?,?,?,?,?)",
      "old" + i,
      u.id,
      i === 0 ? "最早的教研讨论" : "历史对话 " + i,
      D.now(),
      D.now(),
    );
  const snapshot = domain.saveSnapshot({
    title: "课堂原件",
    text: "课堂观察先记录学生表现，再核对教学目标。教学中的反馈应与原始记录一一对应，不能猜测。",
    scope: { year: 2026 },
  });
  const project = domain.createProject({
    title: "课堂展示项目",
    scope: { year: 2026 },
    snapshotIds: [snapshot.id],
  });
  const body = {
    schemaVersion: "1.0",
    title: project.title,
    summary: "给新教师的分享",
    unverified: [],
    blocks: [
      {
        id: "intro",
        title: "观察要点",
        text: "**观察记录**应与课堂实际对应。",
        claimIds: [],
        notes: "保留课堂实例",
        locked: false,
      },
      {
        id: "locked",
        title: "固定说明",
        text: "此段不可改动。",
        claimIds: [],
        notes: "",
        locked: true,
      },
    ],
  };
  domain.saveVersion({
    projectId: project.id,
    kind: "master",
    body,
    expectedRevision: project.revision,
  });
  await page.goto(url + "/#dashboard");
  await expect(page.getByLabel("首页任务要求")).toBeVisible();
  await expect(page.locator(".workspace-scene")).toBeVisible();
  await page.waitForTimeout(700);
  const sceneCanvas = await page.locator(".workspace-scene canvas").count();
  await page.goto(url + "/#explore");
  await page.getByLabel("搜索历史对话", { exact: true }).fill("最早");
  await expect(
    page.locator(".conversation-sidebar .conversation-open"),
  ).toHaveCount(1);
  await page.locator(".conversation-sidebar .conversation-open").click();
  await expect(page).toHaveURL(/#explore\/old0/);
  await page.getByRole("button", { name: "添加知识库或原始资料" }).click();
  await page.getByLabel("搜索上下文资料").fill("教师观察");
  await expect(page.locator(".context-results label")).toHaveCount(1);
  await page.locator(".context-results input").check();
  await page.getByRole("button", { name: "使用这些资料" }).click();
  await expect(page.locator(".context-summary")).toContainText("1 篇");
  await page.getByLabel("对话指令").fill("根据所选资料整理课堂观察");
  await page.waitForTimeout(850);
  await page.reload();
  await expect(page.getByLabel("对话指令")).toHaveValue(
    "根据所选资料整理课堂观察",
  );
  await expect(page.locator(".context-summary")).toContainText("1 篇");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(
      () =>
        D.get(
          "SELECT count(*) n FROM jobs WHERE type='explore' AND state='queued'",
        ).n,
    )
    .toBe(1);
  const running = worker.tick();
  await expect(page.locator(".stream-answer")).toContainText("教研观察");
  assert.equal(
    await page.getByText("内部思考不要显示", { exact: false }).count(),
    0,
  );
  await running;
  await expect(
    page.locator(".chat-message.assistant .answer-body"),
  ).toContainText("保留课堂记录");
  assert.equal(calls, 1);
  await expect(page.locator(".actual-token-usage")).toContainText("76");
  await expect(page.locator(".unified-message-actions button")).toHaveCount(11);
  await page.goto(url + "/#project/" + project.id);
  await expect(page.getByRole("tab", { name: /写稿/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByLabel("项目连续正文", { exact: true })).toBeVisible();
  assert.equal(await page.locator(".project-document-section").count(), 2);
  await page.locator(".project-section-text").first().click();
  await page.keyboard.press("Home");
  await page.keyboard.type("补充观察：");
  await expect
    .poll(
      () =>
        D.get("SELECT count(*) n FROM drafts WHERE project_id=?", project.id).n,
    )
    .toBe(1);
  const draft = D.parse(
    D.get("SELECT body FROM drafts WHERE project_id=?", project.id).body,
  );
  assert.deepEqual(
    draft.blocks.map((b: any) => b.id),
    ["intro", "locked"],
  );
  assert.equal(draft.blocks[1].text, "此段不可改动。");
  assert.equal(draft.blocks[0].notes, "保留课堂实例");
  await page.getByRole("tab", { name: /资料/ }).click();
  await expect(
    page.getByText(
      "这里保存项目的原始依据。增加或替换资料后，基础稿和已有作品会提示需要复核。",
    ),
  ).toBeVisible();
  await expect(
    page.getByLabel("项目连续正文", { exact: true }),
  ).not.toBeVisible();
  for (const theme of ["scholar", "obsidian"])
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      D.run("UPDATE settings SET body=?", D.json({ ...D.settings(), theme }));
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      for (const route of [
        "dashboard",
        "explore/old0",
        "library",
        "html-video",
        "project/" + project.id,
        "reports",
        "impacts",
        "media",
      ]) {
        await page.goto(url + "/#" + route);
        await page.waitForTimeout(route === "dashboard" ? 550 : 250);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          true,
          route + " " + theme + " " + width,
        );
        await page.screenshot({
          path:
            out +
            "/" +
            route.replace("/", "-") +
            "-" +
            theme +
            "-" +
            width +
            ".png",
          fullPage: true,
        });
      }
    }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url + "/#dashboard");
  await expect(page.locator(".scene-fallback")).toBeVisible();
  assert.equal(await page.locator(".workspace-scene canvas").count(), 0);
  assert.deepEqual(errors, []);
  writeFileSync(
    out + "/result.json",
    JSON.stringify(
      {
        ok: true,
        sceneCanvas,
        model: "injected SSE fixture",
        providerCalls: calls,
        checks: [
          "persisted old conversation search",
          "context selection",
          "draft restore",
          "streamed answer and usage",
          "three project tabs",
          "continuous document preserves IDs, locked section and notes",
          "desktop/mobile two themes",
          "reduced motion",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Experience workspace paths passed");
} finally {
  await browser.close();
  await app.close();
  D.db.close();
}
