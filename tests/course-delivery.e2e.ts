// Exercise the public conversation and download routes with a dropped course file.
// Only the model transport is substituted. Workers, auth, storage and Office exports are real.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { load } from "cheerio";
import { Document, Packer, Paragraph } from "docx";
import { execFileSync } from "node:child_process";

import AdmZip from "adm-zip";
import { expect } from "playwright/test";
import { setupBrowser } from "./auth-helper.js";
import { testBrowser } from "./browser-helper.js";

const material = {
  title: "纸桥承重对比实验（合成课程材料）",
  body: "三年级科学课，共 25 分钟。每组两张同规格 A4 纸、两本同高的书和 12 枚相同的垫片。书间距 12 厘米。分别用一张纸做平桥和折桥，每次在桥中央加一枚垫片；桥面触桌即停止，记录触桌前承住的枚数。每种桥测两次，未触桌则记录“至少 12 枚”。用实测数据比较，不预填结果。时间分配：预测 3 分钟，搭桥 5 分钟，测量 12 分钟，讨论 5 分钟。",
};
const teacher = {
  title: "纸桥实验教师指引",
  formats: ["pptx"],
  content:
    "## 预测与提问 · 3 分钟\n出示同规格的两张 A4 纸。请学生先各自预测：改变纸的形状，桥能承住的枚数会怎样变化？先不公布答案。[S1]\n\n" +
    "## 示范与分工 · 5 分钟\n两本书等高，书间距 12 厘米。示范平桥和折桥各用一张纸。请一人加垫片，一人平视桌面判断，另一人记录。[S1]\n\n" +
    "## 巡视与纠错 · 12 分钟\n提醒每次在中央加一枚，两种桥各测两次。触桌前已承住的枚数才计入；12 枚仍未触桌记“至少 12 枚”。追问：两次测量的条件相同吗？[S1]\n\n" +
    "## 讨论与评价 · 5 分钟\n请两组用自己的数据解释结论。检查能否指出一个保持不变的条件，并说出哪一项观察支持自己的判断。[S1]",
};
const sheetTitle = "纸桥实验学生活动单";
const sharedBody =
  "姓名：____________　小组：________\n\n## 我的预测\n我猜 __________ 桥能承住更多垫片，因为 ____________________。\n\n## 动手测量\n把两本书间的距离调到 12 厘米。把垫片一枚一枚放在桥中央。桥面碰桌时停下，记碰桌前的枚数；放完仍未碰桌，记“至少 12 枚”。[S1]\n\n## 记录我的数据\n| 桥形 | 第一次（枚） | 第二次（枚） |\n| --- | --- | --- |\n| 平桥 |  |  |\n| 折桥 |  |  |\n\n";
const sheet = {
  title: sheetTitle,
  formats: ["docx"],
  content:
    sharedBody +
    "## 我的发现\n我观察到：____________________________________________。",
};
const revision = {
  ...sheet,
  content:
    sharedBody +
    "## 用证据解释\n我比较的是 __________ 桥和 __________ 桥。\n\n我记录的两组数据是 __________ 和 __________ 枚。\n\n这些数据支持我的判断，因为 __________________________。",
};
const out = resolve("test-results/course-delivery");
mkdirSync(out, { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  resolve("test-results/course-data-"),
);
process.env.ECUSTUDIO_WEB_DIR = resolve("dist");
process.env.DEEPSEEK_API_KEY = "synthetic-course-fixture";
const D = await import("../server/db.js");
const { buildApp } = await import("../server/app.js"),
  { Worker } = await import("../server/tasks.js");
assert.equal(D.dataDir, process.env.ECUSTUDIO_DATA_DIR);
const { derivativeFixture, verifyDerivatives } =
  await import("./course-derivatives.js");
const { wechatFixture } = await import("./wechat-fixture.js");
D.run(
  "UPDATE settings SET body=?",
  D.json({
    ...D.settings(),
    allowExternalAI: true,
    exploreEngine: "controlled",
  }),
);
const fixture = await wechatFixture(),
  mediaModel = derivativeFixture(out);
const app = await buildApp(
    false,
    {},
    undefined,
    fixture.client,
    fixture.secrets,
  ),
  base = await app.listen({ host: "127.0.0.1", port: 0 }),
  browser = await testBrowser();
let turns = 0,
  attempts = 0;
let release!: () => void;
const hold = new Promise<void>((r) => {
  release = r;
});
const fileName = material.title + ".docx";
const { officeBinary } = await import("../server/chat-preview.js");
let hasOffice = true;
try {
  execFileSync(officeBinary(), ["--version"], {
    stdio: "ignore",
    timeout: 30000,
  });
} catch {
  hasOffice = false;
}
if (process.env.ECUSTUDIO_REQUIRE_OFFICE_PREVIEW === "1")
  assert.ok(hasOffice, "CI requires LibreOffice");

const worker = new Worker(
  fixture.client,
  fixture.secrets,
  async (_url, opts) => {
    const b = JSON.parse(String(opts?.body));
    const derivative = await mediaModel.respond(String(_url), b);
    if (derivative) return derivative;
    assert.ok(b.tools.some((t: any) => t.function?.name === "deliver_files"));
    const turn = JSON.parse(b.messages.at(-1).content);
    assert.ok(
      turn.retrievedSources.some(
        (s: any) =>
          s.id === "S1" &&
          s.title === fileName &&
          s.kind === "attachment" &&
          s.excerpt.trim() === material.body,
      ),
    );
    attempts++;
    if (attempts === 1) {
      await hold;
      return Response.json(
        { error: { message: "fixture unavailable" } },
        { status: 503 },
      );
    }
    turns++;
    if (turns === 2) {
      assert.match(turn.request, /只改学生/);
      assert.equal(turn.revisionTarget.content, sheet.content);
      assert.equal(turn.revisionTarget.format, "docx");
      assert.ok(
        b.messages.some(
          (m: any) =>
            m.role === "assistant" && m.content?.includes(sheet.content),
        ),
      );
    }
    const drafts = turns === 1 ? [teacher, sheet] : [revision];
    return Response.json({
      model: "controlled-course-fixture",
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: drafts.map((d, i) => ({
              id: "lesson" + i,
              type: "function",
              function: { name: "deliver_files", arguments: JSON.stringify(d) },
            })),
          },
        },
      ],
    });
  },
);
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
try {
  const page = await browser.newPage();
  await setupBrowser(page, base);
  await page.goto(base + "/#explore");
  const course = await Packer.toBuffer(
    new Document({ sections: [{ children: [new Paragraph(material.body)] }] }),
  );
  await expect(page.getByRole("button", { name: "添加材料" })).toBeVisible();
  writeFileSync(join(out, "course.docx"), course);
  const visited: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) visited.push(frame.url());
  });
  const transfer = await page.evaluateHandle(
    ({ bytes, name }) => {
      const dt = new DataTransfer();
      dt.items.add(
        new File([new Uint8Array(bytes)], name, {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      );
      return dt;
    },
    { bytes: Array.from(course), name: fileName },
  );
  await page
    .locator(".conversation-panel")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.locator(".chat-source-chip")).toContainText("本轮使用");
  async function ask(request: string) {
    await page.getByLabel("对话指令").fill(request);
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await expect
      .poll(
        () =>
          D.get(
            "SELECT count(*) n FROM jobs WHERE type='explore' AND state='queued'",
          ).n,
      )
      .toBe(1);
    const userTurn = page.locator("article.chat-message.user").last();
    await expect(userTurn.getByLabel("任务进度", {exact:true})).toContainText("任务已排队");
    if (!turns) {
      const attempt = worker.tick();
      await expect(userTurn.getByLabel("任务进度", {exact:true})).toContainText(
        "DeepSeek 正在整理",
        { timeout: 20000 },
      );
      await expect(page.getByLabel("对话指令")).toBeEnabled();
      await page.getByLabel("对话指令").fill("可以在等待时起草下一轮");
      await expect(
        page.getByRole("button", { name: "发送", exact: true }),
      ).toBeEnabled();
      await page.getByLabel("对话指令").fill("");
      release();
      await attempt;
      await expect(
        userTurn.getByRole("button", { name: "重试未完成部分" }),
      ).toBeVisible();
      const originalJob = D.get("SELECT id FROM jobs WHERE type='explore'").id;
      await page.reload();
      await userTurn.getByRole("button", { name: "重试未完成部分" }).click();
      assert.equal(
        D.get("SELECT id FROM jobs WHERE type='explore' AND state='queued'").id,
        originalJob,
      );
    }
    await worker.tick();
    const row = D.get(
      "SELECT state,error FROM jobs WHERE type='explore' ORDER BY rowid DESC LIMIT 1",
    );
    assert.equal(row.state, "succeeded", row.error);
  }
  await ask(
    "只用选中的课程材料，为老师做课堂指导 PPT，为三年级学生做可填写的 Word 活动单。保留流程、记录规则及来源编号。",
  );
  const messages = page.getByRole("region", { name: "本条回答的文件" });
  const links = (i: number) => messages.nth(i).locator("a[download]");
  await expect(links(0)).toHaveCount(2);
  async function download(i: number, ext: string) {
    const link = links(i).filter({ hasText: new RegExp("\\." + ext + "$") });
    const url = await link.getAttribute("href");
    assert.ok(url);
    const result = await page.request.get(base + url);
    assert.ok(result.ok());
    return { url, name: await link.innerText(), bytes: await result.body() };
  }
  const originalUrl = page.url(),
    ppt = await download(0, "pptx"),
    v1 = await download(0, "docx");
  const preview = page.getByRole("region", { name: "附件分页预览" });
  async function checkPreview(
    button: any,
    count: number,
    version: number,
    shot?: string,
  ) {
    await button.click();
    await expect(preview).toContainText("第 " + version + " 版");
    if (hasOffice) {
      await expect(preview.getByRole("img")).toBeVisible({ timeout: 110000 });
      await expect(preview).toContainText("第 1 / " + count + " 页");
      for (let n = 1; n <= count; n++) {
        if (n > 1)
          await preview.getByRole("button", { name: "下一页" }).click();
        const img = preview.getByRole("img", {
          name: new RegExp("第 " + n + " 页$"),
        });
        await expect(img).toBeVisible({ timeout: 30000 });
        await expect
          .poll(() =>
            img.evaluate(
              (el: HTMLImageElement) => el.complete && el.naturalWidth > 500,
            ),
          )
          .toBe(true);
        if (shot && n === Math.min(count, 2))
          await preview.screenshot({ path: join(out, shot) });
      }
    } else
      await expect(preview.getByRole("alert")).toContainText("LibreOffice");
    await preview.getByRole("button", { name: "关闭预览" }).click();
    await expect(page).toHaveURL(originalUrl);
  }
  await checkPreview(
    messages.first().getByRole("button", { name: "预览 PPTX" }),
    6,
    1,
    "slides-inline.png",
  );
  await checkPreview(
    messages.first().getByRole("button", { name: "预览 DOCX" }),
    1,
    1,
  );
  await messages
    .first()
    .getByRole("button", { name: "修改这份 " + sheetTitle, exact: true })
    .click();
  await ask(
    "只改学生活动单，保留原文件名、实验步骤和记录表。最后一题改成分步填写数据并解释。不要重新生成教师 PPT。",
  );
  await expect(links(1)).toHaveCount(1);
  const v2 = await download(1, "docx");
  await checkPreview(
    messages.nth(1).getByRole("button", { name: "预览 DOCX" }),
    1,
    2,
    "worksheet-inline.png",
  );
  await checkPreview(
    messages.nth(1).getByRole("button", { name: "查看上一版" }),
    1,
    1,
  );
  await expect(page).toHaveURL(originalUrl);
  await page.reload();
  await expect(messages).toHaveCount(2);
  assert.ok(
    visited.every((url) => new URL(url).hash.startsWith("#explore")),
    "entire flow must stay in chat",
  );
  if (hasOffice) {
    const cid = new URL(originalUrl).hash.split("/")[1],
      aid = v2.url.split("/")[3];
    const pageImage = await page.request.get(
      base + "/api/conversations/" + cid + "/artifacts/" + aid + "/pages/1",
    );
    assert.ok(pageImage.ok());
    assert.equal(pageImage.headers()["x-source-sha256"], sha(v2.bytes));
    assert.equal((await pageImage.body()).subarray(1, 4).toString(), "PNG");
  }
  const hashes: string[] = [];
  for (const [i, ext, old, file] of [
    [0, "pptx", ppt, "teacher.pptx"],
    [0, "docx", v1, "student-v1.docx"],
    [1, "docx", v2, "student-v2.docx"],
  ] as const) {
    const found = await download(i, ext);
    assert.equal(found.url, old.url);
    assert.equal(sha(found.bytes), sha(old.bytes));
    writeFileSync(join(out, file), found.bytes);
    hashes.push(sha(found.bytes));
  }
  assert.equal(new Set(hashes).size, 3);
  const { inferRevision } = await import("../server/chat-materials.js");
  const cid = new URL(originalUrl).hash.split("/")[1],
    newId = v2.url.split("/")[3];
  assert.equal(inferRevision(cid, "只改活动单"), newId);
  const meta = D.parse(
    D.get("SELECT manifest FROM artifacts WHERE id=?", newId).manifest,
  );
  assert.equal(meta.previousId, v1.url.split("/")[3]);
  assert.equal(meta.version, 2);

  assert.equal(turns, 2);
  writeFileSync(
    join(out, "source.txt"),
    material.title + "\n" + material.body + "\n",
  );
  writeFileSync(
    join(out, "fixture-evidence.json"),
    JSON.stringify(
      {
        mode: "model protocol fixture",
        turns,
        attempts,
        officePagination: hasOffice,
        hashes,
        names: [ppt.name, v1.name, v2.name],
        sameConversation: page.url() === originalUrl,
      },
      null,
      2,
    ),
  );
  const doc = (bytes: Buffer) =>
    new AdmZip(bytes).readAsText("word/document.xml");
  assert.notEqual(
    v1.name,
    v2.name,
    "Two revisions with the same title need distinct download names",
  );
  for (const f of [v1, v2]) {
    const xml = load(doc(f.bytes), { xml: true });
    const table = xml("w\\:tbl");
    assert.equal(table.length, 1);
    const cells = table
      .find("w\\:tr")
      .toArray()
      .map((row) =>
        xml(row)
          .find("w\\:tc")
          .toArray()
          .map((cell) => xml(cell).text()),
      );
    assert.deepEqual(cells, [
      ["桥形", "第一次（枚）", "第二次（枚）"],
      ["平桥", "", ""],
      ["折桥", "", ""],
    ]);
    assert.ok(
      xml("w\\:body")
        .text()
        .includes("[S1] " + fileName),
    );
    assert.ok(xml("w\\:body").text().includes("至少 12 枚"));
  }
  const deck = new AdmZip(ppt.bytes);
  const slides = deck
    .getEntries()
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName));
  assert.equal(slides.length, 6);
  for (const [i, title] of [
    "预测与提问",
    "示范与分工",
    "巡视与纠错",
    "讨论与评价",
  ].entries()) {
    const slide = load(deck.readAsText("ppt/slides/slide" + (i + 2) + ".xml"), {
      xml: true,
    });
    assert.ok(slide("a\\:t").text().includes(title));
    assert.ok(slide("a\\:t").text().includes("[S1]"));
    assert.ok(
      deck
        .readAsText("ppt/notesSlides/notesSlide" + (i + 2) + ".xml")
        .includes(material.title),
    );
  }
  assert.ok(
    deck.readAsText("ppt/slides/slide6.xml").includes("[S1] " + material.title),
  );
  assert.ok(
    !doc(v1.bytes).includes("用证据解释") &&
      !doc(v2.bytes).includes("我的发现"),
  );
  assert.ok(doc(v1.bytes).includes("我的发现"));
  assert.ok(doc(v2.bytes).includes("用证据解释"));
  await verifyDerivatives({
    page,
    base,
    ask,
    worker,
    D,
    fixture,
    model: mediaModel,
    out,
    hasOffice,
  });
  console.log(
    "Course workflow: drag/drop, progress and failed-turn retry, targeted revision, original bytes recovered; Office pages: " +
      (hasOffice ? "rendered" : "runtime unavailable, recovery UI verified") +
      ".",
  );
} finally {
  await browser.close();
  await app.close();
  await fixture.close();
  D.db.close();
}
