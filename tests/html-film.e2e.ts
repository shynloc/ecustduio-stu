import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { expect } from "playwright/test";
import { setupBrowser } from "./auth-helper.js";
import { testBrowser } from "./browser-helper.js";
const out = resolve("test-results/html-film");
mkdirSync(out, { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  resolve("test-results/html-film-data-"),
);
process.env.ECUSTUDIO_WEB_DIR = resolve("dist");
delete process.env.DEEPSEEK_API_KEY;
const { buildApp } = await import("../server/app.js"),
  D = await import("../server/db.js"),
  { createProject } = await import("../server/domain.js"),
  { ffmpegPath } = await import("../server/visual-runtime.js");
const app = await buildApp(true),
  url = await app.listen({ host: "127.0.0.1", port: 0 }),
  browser = await testBrowser(),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const source = resolve("tests/fixtures/tide-motion.html");
const cards = page.getByRole("region", { name: "HTML 视频", exact: true });
const project = createProject({
  scope: { year: 2026 },
  title: "岸线观察",
  snapshotIds: [],
});
async function render(name: string) {
  const card = cards.first();
  await expect(card.getByRole("button", { name: "生成无声视频" })).toBeEnabled({
    timeout: 30000,
  });
  await card.getByRole("button", { name: "生成无声视频" }).click();
  try {
    await expect(card.getByRole("link", { name: "下载 MP4" })).toBeVisible({
      timeout: 90000,
    });
  } catch (e) {
    console.error(await card.innerText());
    throw e;
  }
  const movie = card.locator("video");
  const d = await movie.evaluate(async (v: HTMLVideoElement) => {
    v.muted = true;
    await v.play();
    v.pause();
    return v.duration;
  });
  assert.ok(Math.abs(d - 2) < 0.08);
  const response = await page.request.get(
    url +
      (await card.getByRole("link", { name: "下载 MP4" }).getAttribute("href")),
  );
  assert.ok(response.ok());
  const file = join(out, name + ".mp4");
  writeFileSync(file, await response.body());
  for (const [i, t] of ["0.20", "1.60"].entries())
    execFileSync(ffmpegPath(), [
      "-v",
      "error",
      "-y",
      "-ss",
      t,
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "scale=640:360",
      join(out, name + "-" + i + ".png"),
    ]);
  return file;
}
function pixels(file: string, t: string) {
  return execFileSync(ffmpegPath(), [
    "-v",
    "error",
    "-ss",
    t,
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    "scale=320:180",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);
}
function centroid(p: Buffer, orange: boolean) {
  let sum = 0,
    n = 0;
  for (let i = 0; i < p.length; i += 3) {
    const [r, g, b] = p.subarray(i, i + 3);
    if (
      orange
        ? r > 225 && g > 110 && g < 165 && b < 100
        : g > 190 && r < 105 && b > 125 && b < 200
    ) {
      sum += (i / 3) % 320;
      n++;
    }
  }
  assert.ok(n >= 4, "missing animated marker");
  return sum / n;
}
try {
  await setupBrowser(page, url);
  await page.goto(url + "/#explore");
  await page.locator("input[type=file][multiple]").setInputFiles(source);
  await page
    .getByRole("textbox", { name: "对话指令" })
    .fill("用上传的 HTML 做一个 2 秒视频，保留原版式和动效。");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  const chat = await render("chat-original");
  await page.goto(url + "/#project/" + project.id);
  await page.getByRole("tab", {name:/作品/}).click();
  await page.getByText("网页、动图与视频制作", {exact:true}).click();
  await page.getByText("HTML 转视频", { exact: true }).click();
  await page.getByLabel("视频源 HTML").setInputFiles(source);
  await page.getByLabel("时长（秒）").fill("2");
  await page.getByRole("button", { name: "准备网页视频" }).click();
  const proj = await render("project-original");
  const results = [];
  for (const f of [chat, proj]) {
    const a = pixels(f, "0.20"),
      b = pixels(f, "1.60");
    const motion = [true, false].map((color) => [
      centroid(a, color),
      centroid(b, color),
    ]);
    for (const [x, y] of motion)
      assert.ok(
        y - x > 50,
        "missing CSS or JS motion " + JSON.stringify(motion),
      );
    results.push(motion);
  }
  for (const t of ["0.20", "1.60"]) {
    const a = pixels(chat, t),
      b = pixels(proj, t);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
    assert.ok(diff / a.length < 2);
  }
  await page.getByLabel("网页来源").selectOption("project");
  await page.getByLabel("项目里的网页").selectOption({label:"tide-motion.html"});
  await page.getByLabel("画面方式").selectOption("storyboard");
  await page.getByRole("button", { name: "准备网页视频" }).click();
  await expect(cards).toHaveCount(2);
  const board = await render("project-storyboard");
  const bg = pixels(board, "0.20");
  assert.ok(bg[0] > 210 && bg[1] > 210);
  await page.reload();
  await page.getByRole("tab", {name:/作品/}).click();
  await page.getByText("网页、动图与视频制作", {exact:true}).click();
  await page.getByText("HTML 转视频", { exact: true }).click();
  await expect(page.getByRole("link", { name: "下载 MP4" })).toHaveCount(2);
  assert.equal(
    D.get("SELECT count(*) n FROM artifacts WHERE format='pptx'").n,
    0,
  );
  const jobs = D.all(
    "SELECT result FROM jobs WHERE type='chat-film' AND state='succeeded'",
  ).map((r) => D.parse(r.result));
  assert.equal(jobs.length, 3);
  assert.ok(jobs.every((r) => r.sourceHash === D.hash(readFileSync(source))));
  writeFileSync(
    join(out, "evidence.json"),
    JSON.stringify(
      {
        sourceHash: jobs[0].sourceHash,
        measurements: results,
        films: jobs.map((r) => ({
          mode: r.mode,
          duration: r.duration,
          width: r.width,
          height: r.height,
          frames: r.frames,
        })),
        pptx: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    "HTML video: two UI entries, original CSS and JS motion, explicit storyboard, three playable MP4s and reload passed.",
  );
} finally {
  await browser.close();
  await app.close();
  D.db.close();
}
