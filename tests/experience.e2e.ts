import assert from "node:assert/strict";
import { expect } from "playwright/test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { testBrowser } from "./browser-helper.js";
import { setupBrowser } from "./auth-helper.js";
mkdirSync("test-results", { recursive: true });
const out = resolve("test-results/experience-ui");
mkdirSync(out, { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  resolve("test-results/experience-data-"),
);
process.env.ECUSTUDIO_WEB_DIR = resolve("dist");
const D = await import("../server/db.js"),
  domain = await import("../server/domain.js"),
  { buildApp } = await import("../server/app.js");
const app = await buildApp(false),
  url = await app.listen({ host: "127.0.0.1", port: 0 }),
  browser = await testBrowser(),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
try {
  await setupBrowser(page, url);
  const session = await (await page.request.get(url + "/api/session")).json(),
    headers = { "x-csrf-token": session.csrf };
  const body =
    "## 课堂观察\n\n**光合作用**观察活动。\n\n|活动|时间|\n|---|---|\n|观察|12分钟|\n\n$$\nE=mc^2\n$$\n\n[^source]: 合成课堂记录。";
  const created = await page.request.post(url + "/api/notes", {
    headers,
    data: {
      title: "光合作用课堂记录",
      body,
      categories: {
        folder: "教师培训",
        tags: ["生物"],
        purposes: [],
        state: "organized",
      },
    },
  });
  assert.equal(created.status(), 200);
  const note = await created.json();
  const snap = domain.saveSnapshot({
    title: "合成课堂原始资料",
    text: body,
    url: "https://example.com/class",
    publisher: "测试",
    scope: { year: 2026 },
  });
  await page.goto(url + "/#notes/" + note.id);
  await expect(
    page.getByRole("textbox", { name: "笔记内容", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".document-reader .tiptap table")).toBeVisible();
  assert.equal(
    await page
      .locator(".rich-toolbar button")
      .evaluateAll((buttons) =>
        buttons.every(
          (b) => !!b.querySelector("svg") && !!b.getAttribute("aria-label"),
        ),
      ),
    true,
  );
  const editor = page.locator(".tiptap[contenteditable=true]");
  await editor.click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("新修改");
  await expect
    .poll(
      () => D.get("SELECT revision FROM notes WHERE id=?", note.id).revision,
    )
    .toBeGreaterThan(1);
  assert.match(
    D.get("SELECT body FROM notes WHERE id=?", note.id).body,
    /E=mc\^2/,
  );
  await page.goto(url + "/#snapshot/" + snap.id);
  await expect(page.locator(".source-document table")).toBeVisible();
  await expect(
    page
      .locator(".source-document")
      .getByRole("heading", { name: "课堂观察", exact: true }),
  ).toBeVisible();
  assert.ok((await page.locator(".source-anchor").count()) > 0);
  await page.goto(url + "/#notes");
  await expect(
    page.getByRole("heading", { name: "知识库", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".collection-card")).toHaveCount(1);
  await page.getByRole("button", { name: "列表视图", exact: true }).click();
  await expect(page.locator(".collection-items.list")).toBeVisible();
  await page.getByRole("checkbox", { name: "选择 光合作用课堂记录" }).check();
  await page.getByRole("button", { name: "添加标签", exact: true }).click();
  await page.getByLabel("名称或标签").fill("培训");
  await page
    .locator(".collection-dialog")
    .getByRole("button", { name: "确定", exact: true })
    .click();
  await expect(page.locator(".collection-item-tags")).toContainText("#培训");
  await expect(page.locator(".collection-item-tags")).toContainText("#生物");

  await page.goto(url + "/#notes/new");
  await page.getByLabel("笔记标题").fill("刷新恢复草稿");
  await page
    .getByRole("textbox", { name: "笔记内容", exact: true })
    .fill("草稿内容应在刷新后仍然存在。");
  await expect
    .poll(
      () =>
        D.parse(
          D.get(
            "SELECT body FROM workspace_preferences WHERE name='note-new-draft'",
          )?.body,
        )?.body || "",
    )
    .toContain("刷新后");
  await page.reload();
  await expect(page.getByLabel("笔记标题")).toHaveValue("刷新恢复草稿");
  await expect(
    page.getByRole("textbox", { name: "笔记内容", exact: true }),
  ).toContainText("刷新后");
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(page).toHaveURL(/#notes\/[a-f0-9-]+$/);
  await page.goto(url + "/#input");
  await page
    .getByRole("textbox", { name: "资料正文", exact: true })
    .fill("导入页面暂未保存的文字");
  await expect
    .poll(
      () =>
        D.parse(
          D.get(
            "SELECT body FROM workspace_preferences WHERE name='input-draft'",
          )?.body,
        )?.text || "",
    )
    .toContain("暂未保存");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "资料正文", exact: true }),
  ).toContainText("暂未保存");
  for (const theme of ["scholar", "obsidian"])
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      D.run("UPDATE settings SET body=?", D.json({ ...D.settings(), theme }));
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      for (const route of ["notes", "input", "results"]) {
        await page.goto(url + "/#" + route);
        await page.waitForTimeout(350);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          true,
          route + " " + theme + " " + width,
        );
        await page.screenshot({
          path: out + "/" + route + "-" + theme + "-" + width + ".png",
          fullPage: true,
        });
      }
    }
  assert.deepEqual(errors, []);
  writeFileSync(
    out + "/result.json",
    JSON.stringify(
      {
        ok: true,
        checks: [
          "default WYSIWYG",
          "icon toolbar",
          "autosave preservation",
          "source Markdown and anchors",
          "list view",
          "additive tags",
          "new note and input draft recovery",
          "desktop/mobile two themes",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Experience editor and collection browser paths passed");
} finally {
  await browser.close();
  await app.close();
  D.db.close();
}
