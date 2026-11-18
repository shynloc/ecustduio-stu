import {testBrowser} from './browser-helper.js';
import { chromium, expect } from "playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setupBrowser } from "./auth-helper.js";
import { wechatFixture } from "./wechat-fixture.js";
mkdirSync("test-results", { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  join(process.cwd(), "test-results/wechat-ui-data-"),
);
process.env.ECUSTUDIO_WEB_DIR = process.env.ECUSTUDIO_WEB_DIR || resolve("dist");
const D = await import("../server/db.js"),
  { buildApp } = await import("../server/app.js"),
  fixture = await wechatFixture(),
  app = await buildApp(true, {}, undefined, fixture.client, fixture.secrets),
  url = await app.listen({ host: "127.0.0.1", port: 0 }),
  browser = await testBrowser(),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const out = "test-results/wechat-ui";
mkdirSync(out, { recursive: true });
try {
  await setupBrowser(page, url);
  await page.goto(url + "/#input");
  await page.getByLabel("资料标题（可选）").fill("让观察成为学习的起点");
  await page
    .locator(".tiptap[contenteditable=true]")
    .fill(
      "学生先观察叶片十分钟，记录颜色和形态，再分组讨论十五分钟。用清楚的观察记录，把一次活动变成可以分享的课堂经验。这是流程验收用的合成教学笔记。",
    );
  await page.getByRole("button", { name: "完成编辑，阅读排版" }).click();
  await page.getByRole("button", { name: "保存到知识库", exact: true }).click();
  await expect(
    page.getByText("已保存到私人知识库", { exact: true }),
  ).toBeVisible();
  const n = D.get("SELECT * FROM notes LIMIT 1");
  await page.goto(url + "/#notes/" + n.id);
  await page.getByRole("button", { name: "公众号排版", exact: true }).click();
  await expect(page).toHaveURL(/#wechat\//);
  await page.getByRole("button", { name: "连接公众号", exact: true }).click();
  await page.getByLabel("公众号名称", { exact: true }).fill("课堂教育测试号");
  await page
    .getByLabel("公众号编号", { exact: true })
    .fill("wx0123456789abcdef");
  await page
    .getByLabel("公众号密钥", { exact: true })
    .fill("Synthetic-ui-secret-only");
  await page.getByRole("button", { name: "连接并保存" }).click();
  await expect(
    page.getByText("保存到：课堂教育测试号", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "生成手机排版", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "保存到「课堂教育测试号」草稿箱",
      exact: true,
    }),
  ).toBeEnabled({timeout:30000});
  await expect(
    page
      .frameLocator('iframe[title="公众号手机预览"]')
      .getByRole("heading", { name: n.title }),
  ).toBeVisible();
  // Sandbox preview must actually show authenticated local images.
  await expect
    .poll(() =>
      page
        .frameLocator('iframe[title="公众号手机预览"]')
        .locator("img")
        .first()
        .evaluate((e: HTMLImageElement) => e.naturalWidth),
    )
    .toBeGreaterThan(0);
  for (const theme of ["scholar", "obsidian"])
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        document.documentElement.style.backgroundColor =
          t === "obsidian" ? "#090d13" : "#f6f5f1";
        document.documentElement.style.colorScheme =
          t === "obsidian" ? "dark" : "light";
      }, theme);
      if (width < 700)
        await expect
          .poll(() =>
            page
              .locator(".sidebar")
              .evaluate((e) => e.getBoundingClientRect().right),
          )
          .toBeLessThanOrEqual(1);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${theme}/${width} overflow`,
      );
      await page.locator(".wechat-preview").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: out + `/preview-${theme}-${width}.png`,
        fullPage: true,
      });
    }
  await page
    .getByRole("button", {
      name: "保存到「课堂教育测试号」草稿箱",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "已保存到公众号草稿箱", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  assert.equal(fixture.articles.size, 1);
  await page.reload();
  await expect(page.locator(".wechat-history-row")).toHaveCount(1);
  await page.locator(".wechat-history-row").click();
  await expect(
    page.getByRole("button", { name: "已保存到公众号草稿箱", exact: true }),
  ).toBeDisabled();
  assert.equal(fixture.articles.size, 1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url + "/#settings");
  await expect(page.getByRole("region", { name: "公众号连接" })).toBeVisible();
  await page.getByRole("button", { name: "检查连接", exact: true }).click();
  await expect(
    page.getByText("公众号已连接，可以保存草稿了。", { exact: true }),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  writeFileSync(
    out + "/result.json",
    JSON.stringify(
      {
        ok: true,
        provider: "local HTTP fixture, not a real WeChat account",
        checks: [
          "knowledge note -> WeChat editor",
          "guided admin connection",
          "automatic cover and summary",
          "sandbox authenticated image rendering",
          "two themes desktop/mobile",
          "persistent worker -> remote draft receipt",
          "refresh and saved history, no duplicate",
          "settings connection check",
        ],
        widths: [1440, 390],
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Wechat browser flow passed");
} finally {
  await browser.close();
  await app.close();
  await fixture.close();
  D.db.close();
}
