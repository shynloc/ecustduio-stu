import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync,readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect } from "playwright/test";
import { testBrowser } from "./browser-helper.js";
import { setupBrowser } from "./auth-helper.js";

const out = resolve("test-results/notebook-ui");
mkdirSync(out, { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  resolve("test-results/notebook-data-"),
);
const { buildApp } = await import("../server/app.js");
const { db } = await import("../server/db.js");
const app = await buildApp(false);
const base = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await testBrowser();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 980 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setupBrowser(page, base);
  const { csrf } = await (await page.request.get(base + "/api/session")).json();
  const examples = [
    [
      "显微镜下的叶脉",
      "观察",
      "## 操作顺序\n\n1. 取一枚叶片\n2. 比较叶脉的方向",
    ],
    ["圆的面积从哪里来", "备课", "> 把圆分成许多小扇形，再尝试拼一个长方形。"],
    [
      "春季物候记录",
      "观察",
      "| 日期 | 观察 |\n| --- | --- |\n| 周一 | 花芽膨大 |\n| 周三 | 第一朵开放 |",
    ],
    [
      "问题比答案多一步",
      "备课",
      "让学生先写下**自己的猜想**，再交换观察记录。",
    ],
    [
      "速度与时间",
      "备课",
      "## 两组数据\n\n**保持距离相同**，分别记录步行与小跑用时。\n\n> 最后讨论误差的来源。",
    ],
    ["课后回望", "观察", "- 今天发现了什么？\n- 下次准备怎样验证？"],
  ];
  for (const [title, folder, body] of examples) {
    const r = await page.request.post(base + "/api/notes", {
      headers: { "x-csrf-token": csrf },
      data: {
        title,
        body,
        categories: {
          folder,
          tags: ["课堂"],
          purposes: [],
          state: "organized",
        },
      },
    });
    assert.equal(r.status(), 200);
  }
  await page.goto(base + "/#notes");
  const cards = page.locator(".collection-card");
  await expect(cards).toHaveCount(6);
  await expect(cards.locator("blockquote").first()).toBeVisible();
  const columns = () =>
    cards.evaluateAll(
      (els) =>
        new Set(els.map((e) => Math.round(e.getBoundingClientRect().left)))
          .size,
    );
  assert.ok((await columns()) >= 2);
  await expect(cards.locator("table")).toHaveCount(1);
  await page.screenshot({ path: out + "/cards-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(columns).toBe(1);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((el) => el.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(1);
  await page.screenshot({ path: out + "/cards-mobile.png" });
  await page.locator(".folder-label").filter({hasText:"观察"}).click();
  await expect(cards).toHaveCount(3);
  await page.getByRole("button", { name: "显微镜下的叶脉",exact:true }).click();
  await expect(page.getByRole("heading", { name: "操作顺序" })).toBeVisible();
  await page.getByRole("button", { name: "返回知识库" }).click();
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.getByRole("button", { name: "新建笔记" }).click();
  await page.getByLabel("笔记标题").fill("探究记录");
  const formatting = page.getByRole("toolbar", { name: "正文格式" });
  assert.ok(await formatting.getByRole("button").count() >= 15);
  const controls = page.locator(".editor-icon");
  assert.ok(await controls.evaluateAll(buttons => buttons.every(button =>
    button.textContent.trim() === "" && button.querySelector("svg") &&
    button.getAttribute("title") && button.getAttribute("title") === button.getAttribute("aria-label")
  )));
  await page.setViewportSize({ width: 390, height: 844 });
  const bold = formatting.getByRole("button", { name: "加粗 · Ctrl+B" });
  const bounds = await bold.boundingBox();
  assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44);
  await bold.press("Enter");
  await expect(page.locator(".tiptap[contenteditable=true]")).toBeFocused();
  await page.keyboard.insertText("课堂观察");
  await expect(page.locator(".tiptap strong")).toHaveText("课堂观察");
  await expect(page.getByRole("button", { name: "直接编辑正文" })).toHaveAttribute("aria-pressed", "true");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.locator(".document-reader").screenshot({ path: out + "/editor-icons-mobile.png", animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.locator(".document-reader").screenshot({ path: out + "/editor-icons-desktop.png" });

  await page.getByRole("button", { name: "高级：Markdown 源码" }).click();
  const sourceInput = page.getByRole("textbox", { name: "笔记内容源文" });
  const sourceTools = page.getByRole("toolbar", { name: "Markdown 源文格式" });
  const preview = page.getByLabel("Markdown 实时预览");
  async function selectText(sample: string) {
    await sourceInput.focus();
    await sourceInput.evaluate((el: HTMLTextAreaElement, sample) => {
      const start = el.value.indexOf(sample);
      if (start < 0) throw new Error("找不到待格式化的选段");
      el.setSelectionRange(start, start + sample.length, "backward");
    }, sample);
  }
  const undo = sourceTools.getByRole("button", {name: "撤销", exact: true});
  const redo = sourceTools.getByRole("button", {name: "重做", exact: true});
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  const baseline = await sourceInput.inputValue();
  await sourceInput.focus();
  await sourceInput.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length));
  await page.keyboard.type(" example");
  const typed = baseline + " example";
  await expect(sourceInput).toHaveValue(typed);
  await selectText("example");
  await sourceTools.getByRole("button", {name:"斜体"}).click();
  await expect(preview.locator("em")).toHaveText("example");
  await sourceInput.press("Meta+z");
  await expect(sourceInput).toHaveValue(typed);
  await expect(preview.locator("em")).toHaveCount(0);
  assert.equal(await sourceInput.evaluate((el: HTMLTextAreaElement) =>
    el.value.slice(el.selectionStart, el.selectionEnd)), "example");
  await undo.click();
  await expect(sourceInput).toHaveValue(baseline);
  await expect(preview).not.toContainText("example");
  await expect(undo).toBeDisabled();
  await sourceInput.press("Meta+Shift+z");
  await expect(sourceInput).toHaveValue(typed);
  await expect(preview).toContainText("example");
  await redo.click();
  await expect(preview.locator("em")).toHaveText("example");
  await expect(redo).toBeDisabled();
  await undo.click();
  await page.keyboard.insertText("替换选区");
  await expect(preview).toContainText("替换选区");
  await expect(redo).toBeDisabled();
  await sourceInput.fill("课堂问题\n\n证据来自哪里？\n\n先记录，再解释。\n\n整理资料\n对照原文\n保留笔记");
  await expect(sourceTools.getByRole("button")).toHaveCount(12);
  await selectText("问题");
  await sourceTools.getByRole("button", { name: "二级标题" }).click();
  await expect(preview.getByRole("heading", { level: 2 })).toHaveText("课堂问题");
  await selectText("证据");
  await sourceTools.getByRole("button", { name: "加粗" }).click();
  await expect(preview.locator("strong")).toHaveText("证据");
  await expect(sourceInput).toBeFocused();
  await sourceTools.getByRole("button", { name: "加粗" }).click();
  await expect(preview.locator("strong")).toHaveCount(0);
  await sourceTools.getByRole("button", { name: "加粗" }).click();
  await selectText("先记录");
  const quote = sourceTools.getByRole("button", { name: "引用" });
  await quote.focus();
  await page.keyboard.press("Enter");
  await expect(preview.locator("blockquote")).toHaveText("先记录，再解释。");
  await selectText("整理资料\n对照原文\n");
  await sourceTools.getByRole("button", { name: "无序列表" }).click();
  await expect(preview.locator("ul li")).toHaveCount(2);
  await sourceTools.getByRole("button", { name: "有序列表" }).click();
  await expect(preview.locator("ol li")).toHaveCount(2);
  const firstPart = "## 课堂问题\n\n**证据**来自哪里？\n\n> 先记录，再解释。\n\n1. 整理资料\n2. 对照原文\n保留笔记";
  await expect(sourceInput).toHaveValue(firstPart);
  await sourceInput.fill(firstPart + "\n\n观察方法\n\n教学 [指南]\n\n温度记录\n\nprint(42)\n\n观察图");
  await selectText("观察方法");
  await sourceTools.getByRole("button", { name: "斜体", exact: true }).click();
  await expect(preview.locator("em")).toHaveText("观察方法");
  await selectText("教学 [指南]");
  const insertLink = sourceTools.getByRole("button", { name: "插入链接", exact: true });
  await insertLink.click();
  await page.getByRole("textbox", { name: "链接地址" }).press("Escape");
  await expect(preview.getByRole("link")).toHaveCount(0);
  await insertLink.click();
  const address = page.getByRole("textbox", { name: "链接地址" });
  await address.fill("仅有标题");
  await address.press("Enter");
  await expect(page.getByText("请输入以 https:// 或 http:// 开头的网址。")).toBeVisible();
  const article = "https://example.com/lesson(2)";
  await address.fill(article);
  await address.press("Enter");
  await expect(preview.getByRole("link", { name: "教学 [指南]", exact: true })).toHaveAttribute("href", article);
  await selectText("温度记录");
  await sourceTools.getByRole("button", { name: "插入表格" }).click();
  await expect(preview.getByRole("cell", { name: "温度记录" })).toBeVisible();
  await selectText("print(42)");
  await sourceTools.getByRole("button", { name: "插入代码块" }).click();
  await expect(preview.locator("pre code")).toHaveText("print(42)");
  await selectText("观察图");
  const chooserPromise = page.waitForEvent("filechooser");
  await sourceTools.getByRole("button", { name: "插入图片" }).click();
  const chooser = await chooserPromise;
  const {createCanvas} = await import("@napi-rs/canvas");
  const canvas = createCanvas(60, 40);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#23483d";
  ctx.fillRect(0, 0, 60, 40);
  await chooser.setFiles({ name: "观察.png", mimeType: "image/png", buffer: canvas.toBuffer("image/png") });
  await expect.poll(() => preview.getByRole("img", {name:"观察图"}).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(60);
  const source = await sourceInput.inputValue();
  assert.ok(source.includes("![观察图](/api/assets/"));
  await undo.click();
  await expect(preview.getByRole("img", {name:"观察图"})).toHaveCount(0);
  await sourceInput.press("Meta+Shift+z");
  await expect(sourceInput).toHaveValue(source);
  await expect(preview.getByRole("img", {name:"观察图"})).toBeVisible();
  await page.screenshot({ path: out + "/markdown-editor.png" });
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(page).toHaveURL(/#notes\/[a-f0-9-]+$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "课堂问题" })).toBeVisible();
  await expect(page.getByRole("link", { name: "教学 [指南]", exact: true })).toHaveAttribute("href", article);
  await page.getByRole("button", { name: "高级：Markdown 源码" }).click();
  await expect(page.getByRole("textbox", { name: "笔记内容源文" })).toHaveValue(
    source,
  );
  await page.getByRole("button", { name: "公众号排版", exact: true }).click();
  const theme = page.getByLabel('选择公众号主题',{exact:true});
  async function chooseTheme(id:string){
    const {wechatThemeLabels}=await import('../shared/wechat-themes.js');
    await theme.click();const dialog=page.getByRole('dialog',{name:'文章排版'});
    await dialog.getByRole('button',{name:'查看全部主题（46 款）'}).click();
    await dialog.getByLabel('搜索文章主题').fill(wechatThemeLabels[id]);
    await dialog.getByRole('radio',{name:'预览主题 '+wechatThemeLabels[id],exact:true}).click();
    await dialog.getByRole('button',{name:'应用排版',exact:true}).click();
  }
  await chooseTheme("milestone-darkcode-dark");

  const frame = page.frameLocator(".wechat-preview");
  await expect(frame.getByRole("heading", { name: "课堂问题" })).toBeVisible();
  const dark = await frame
    .locator("section")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await chooseTheme("milestone-cnclassic-light");


  await expect(frame.getByRole("heading", { name: "课堂问题" })).toBeVisible();
  await expect.poll(()=>frame.locator("section").first().evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(dark);
  const light = await frame
    .locator("section")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(dark, light);
  const event=page.waitForEvent("download");
  await page.getByRole("button",{name:"下载 HTML"}).click();
  const file=await (await event).path();assert.ok(file);
  assert.equal(readFileSync(file,"utf8"),await page.locator(".wechat-preview").getAttribute("srcdoc"));
  assert.deepEqual(errors, []);
  console.log(
    "Notebook passed: responsive cards, folder filter, Markdown preview and save, frozen article themes.",
  );
} finally {
  await browser.close();
  await app.close();
  db.close();
}
