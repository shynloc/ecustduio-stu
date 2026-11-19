import {testBrowser} from './browser-helper.js';
import { expect } from "playwright/test";
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
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
  page = await context.newPage(),
  errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const out = "test-results/wechat-ui";
mkdirSync(out, { recursive: true });
try {
  await setupBrowser(page, url);
  await page.goto(url+"/#wechat");
  await expect(page.getByRole("textbox",{name:"公众号正文",exact:true})).toBeEditable();
  await page.getByLabel("文章标题",{exact:true}).fill("独立文章");
  await page.getByRole("textbox",{name:"公众号正文",exact:true}).fill("从空白页直接写稿。");
  await expect(page.frameLocator(".wechat-preview").getByText("从空白页直接写稿。")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox",{name:"公众号正文",exact:true})).toHaveText("从空白页直接写稿。");
  const otherPage=await page.context().newPage();
  await otherPage.goto(page.url());await expect(otherPage.getByRole("textbox",{name:"公众号正文",exact:true})).toHaveText("从空白页直接写稿。");
  await page.getByRole("textbox",{name:"公众号正文",exact:true}).fill("先保存的版本");
  await expect(page.frameLocator(".wechat-preview").getByText("先保存的版本")).toBeVisible();
  await otherPage.getByRole("textbox",{name:"公众号正文",exact:true}).fill("另一页保留的文字");
  await expect(otherPage.getByRole("button",{name:"另存为副本"})).toBeVisible();
  await otherPage.getByRole("button",{name:"另存为副本"}).click();
  await expect(otherPage.frameLocator(".wechat-preview").getByText("另一页保留的文字")).toBeVisible();
  await otherPage.close();
  await page.reload();await expect(page.getByRole("textbox",{name:"公众号正文",exact:true})).toHaveText("先保存的版本");
  assert.equal(D.get("SELECT count(*) n FROM wechat_previews").n,0);
  await page.goto(url + "/#input");
  await page.getByLabel("资料标题（留空可自动填写）").fill("让观察成为学习的起点");
  await page
    .locator(".tiptap[contenteditable=true]")
    .fill(
      "学生先观察叶片十分钟，记录颜色和形态，再分组讨论十五分钟。用清楚的观察记录，把一次活动变成可以分享的课堂经验。这是流程验收用的合成教学笔记。",
    );
  await page.getByRole("button", { name: "保存到知识库", exact: true }).click();
  await expect(
    page.getByText("已保存到知识库 · 仅自己可见", { exact: true }),
  ).toBeVisible();
  const n = D.get("SELECT * FROM notes LIMIT 1");
  await page.goto(url + "/#notes/" + n.id);
  await page.getByRole("button", { name: "公众号排版", exact: true }).click();
  await expect(page.getByRole("textbox",{name:"公众号正文",exact:true})).toHaveText(n.body);
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
  const preview=page.frameLocator('iframe[title="公众号手机预览"]');
  await expect(preview.getByRole("heading",{name:n.title})).toBeVisible();
  await expect.poll(()=>preview.locator("img").first().evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);
  const changedBody="## 观察记录\n\n学生先比较两种叶片，再用自己的记录解释判断。\n\n文末验证：课后完成观察日记。";
  await page.getByLabel("文章标题",{exact:true}).fill("课堂观察与讨论");
  await page.getByRole("button",{name:"高级：Markdown 源码",exact:true}).click();await page.getByRole("textbox",{name:"公众号正文源文",exact:true}).fill(changedBody);
  await page.getByLabel("公众号主题").selectOption("blue");
  await expect(preview.getByRole("heading",{name:"观察记录",exact:true})).toBeVisible();
  await expect(preview.getByText("文末验证：课后完成观察日记。")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("文章标题",{exact:true})).toHaveValue("课堂观察与讨论");
  await expect(page.getByRole("textbox",{name:"公众号正文",exact:true})).toContainText("文末验证：课后完成观察日记。");await expect(page.getByRole("textbox",{name:"公众号正文",exact:true}).getByRole("heading",{name:"观察记录",exact:true})).toBeVisible();
  await expect(page.getByLabel("公众号主题")).toHaveValue("blue");
  assert.equal(D.get("SELECT body FROM notes WHERE id=?",n.id).body,n.body);
  assert.equal(D.get("SELECT count(*) n FROM wechat_previews").n,0);
  assert.equal(fixture.articles.size,0);
  await page.evaluate(`(() => {
    Object.defineProperty(navigator, "clipboard", {configurable:true,value:{write:async (items) => {
      window.copied = {html:await (await items[0].getType("text/html")).text(),text:await (await items[0].getType("text/plain")).text()};
    }}});
  })()`);
  await page.getByRole("button", {name:"复制图文排版",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).copied?.text||"")).toContain("文末验证：课后完成观察日记。");
  let copied = await page.evaluate(()=>(window as any).copied);
  assert.ok(copied.html.includes("data:image/jpeg;base64,"));
  assert.ok(!copied.html.includes("/api/assets/"));
  assert.ok(copied.text.includes("课堂观察与讨论"));
  await page.evaluate(`(() => {
    Object.defineProperty(navigator, "clipboard", {configurable:true,value:undefined});
    window.copied = null;
    document.execCommand = (() => {
      const data = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent("copy", {clipboardData:data,cancelable:true}));
      window.copied = {html:data.getData("text/html"),text:data.getData("text/plain")};
      return true;
    });
  })()`);
  await page.getByRole("button", {name:"复制图文排版",exact:true}).click();
  copied = await page.evaluate(()=>(window as any).copied);
  assert.ok(copied.text.includes("文末验证：课后完成观察日记。"));
  assert.ok(copied.html.includes("data:image/jpeg;base64,"));
  await page.evaluate(`(() => {
    document.execCommand = () => false;
    Object.defineProperty(navigator, "clipboard", {configurable:true,value:{writeText:async(text) => {window.copied = {text};}}});
  })()`);
  await page.getByRole("button", {name:"复制图文排版",exact:true}).click();
  await expect(page.getByText("已复制完整正文。此浏览器仅支持文字复制，保留完整图文可下载 HTML。",{exact:true})).toBeVisible();
  assert.ok((await page.evaluate(()=>(window as any).copied.text)).includes("文末验证：课后完成观察日记。"));
  await page.reload();
  await expect(page.getByRole("textbox",{name:"公众号正文",exact:true})).toContainText("文末验证：课后完成观察日记。");await expect(page.getByRole("textbox",{name:"公众号正文",exact:true}).getByRole("heading",{name:"观察记录",exact:true})).toBeVisible();
  for (const theme of ["scholar", "obsidian"])
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        document.documentElement.style.backgroundColor =
          t === "obsidian" ? "#090d13" : "#f3f6fc";
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
      if(width<700)await page.getByRole("button",{name:"手机预览",exact:true}).click();
      await page.locator(".wechat-preview").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: out + `/preview-${theme}-${width}.png`,
        fullPage: true,
      });
    }
  page.once("dialog",dialog=>dialog.accept());
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
  await expect(page.getByRole("button", {name:"已保存到公众号草稿箱",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"最近稿件"}).click();
  await expect(page.locator(".wechat-history-row")).toHaveCount(1);
  await page.locator(".wechat-history-row").click();
  await expect(page.frameLocator('iframe[title="已保存的手机排版"]').getByText("文末验证：课后完成观察日记。")).toBeVisible();
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
          "direct authoring, local auto-save and refresh with preserved options",
          "private manuscript edits leave the source note intact",
          "complete article clipboard in rich, LAN fallback and plain text modes",
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
