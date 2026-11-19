import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import AdmZip from "adm-zip";
import { expect } from "playwright/test";
import { setupBrowser } from "./auth-helper.js";
import { testBrowser } from "./browser-helper.js";

const out = resolve("test-results/conversation-files");
mkdirSync(out, { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  resolve("test-results/conversation-files-data-"),
);
process.env.ECUSTUDIO_WEB_DIR = resolve("dist");
process.env.DEEPSEEK_API_KEY = "synthetic-injected-transport";
const D = await import("../server/db.js"),
  { buildApp } = await import("../server/app.js"),
  { Worker } = await import("../server/tasks.js");
D.run(
  "UPDATE settings SET body=?",
  D.json({ ...D.settings(), allowExternalAI: true, model: "deepseek-flash", exploreEngine:"controlled" }),
);
const app = await buildApp(false),
  url = await app.listen({ host: "127.0.0.1", port: 0 }),
  browser = await testBrowser();
let requests = 0;
const worker = new Worker(undefined, undefined, async (_url, opts) => {
  requests++;
  const body = JSON.parse(String(opts?.body));
  if (body.tools.some((t: any) => t.type === "deepseek_web_search")) {
    return Response.json({
      model: "native-fixture",
      choices: [
        {
          message: {
            role: "assistant",
            content:
              '## 课堂展示\n叶片结构比较记录。\n:::ecustudio-files {"title":"展示页","formats":["html"]}',
          },
        },
      ],
    });
  }
  assert.ok(body.tools.find((t: any) => t.function?.name === "deliver_files"));
  if (requests === 2)
    assert.ok(JSON.stringify(body.messages).includes("叶脉观察"));
  const title = requests === 1 ? "叶脉观察" : "教师版叶脉观察";
  const content =
    "## " +
    title +
    "\n带领学生记录叶片纹理，再比较两组观察结果。\n\n## 课堂讨论\n比较同一叶片的两次观察记录。";
  const drafts =
    requests === 1
      ? [
          { title, formats: ["pptx"], content },
          {
            title: "叶脉观察活动单",
            formats: ["docx"],
            content:
              "## 学生活动单\n填写假设、记录和观察结论。\n\n## 课堂讨论\n记录小组分歧。",
          },
        ]
      : [{ title, formats: ["md"], content }];
  return Response.json({
    model: "fixture",
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: drafts.map((d, i) => ({
            id: "deliver" + i,
            type: "function",
            function: { name: "deliver_files", arguments: JSON.stringify(d) },
          })),
        },
      },
    ],
  });
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 980 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setupBrowser(page, url);
  await page.goto(url + "/#explore");
  await page.getByText("研究设置", { exact: true }).click();
  await expect(page.getByLabel("检索范围")).toHaveValue("auto");
  await page.getByLabel("本轮联网方式").selectOption("controlled");
  const send = async (prompt: string) => {
    await page.getByLabel("对话指令").fill(prompt);
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await expect
      .poll(
        () =>
          D.get(
            "SELECT count(*) n FROM jobs WHERE type='explore' AND state='queued'",
          ).n,
      )
      .toBe(1);
    await worker.tick();
    const j = D.get(
      "SELECT state,error FROM jobs WHERE type='explore' ORDER BY rowid DESC LIMIT 1",
    );
    assert.equal(j.state, "succeeded", j.error);
  };
  await send("做一份叶脉观察教学 PPT，并给我可下载的 Word 讲义");
  const files = page.getByRole("region", { name: "本条回答的文件" });
  const ppt = files.getByRole("link", { name: /\.pptx/ }),
    word = files.getByRole("link", { name: /\.docx/ });
  await expect(ppt).toBeVisible();
  await expect(word).toBeVisible();
  async function fileBytes(link: any) {
    const r = await page.request.get(url + (await link.getAttribute("href")));
    assert.equal(r.status(), 200);
    return r.body();
  }
  const zip = new AdmZip(await fileBytes(ppt));
  assert.ok(
    zip
      .getEntries()
      .some(
        (e) =>
          /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName) &&
          e.getData().toString().includes("叶脉观察"),
      ),
  );
  assert.ok(
    new AdmZip(await fileBytes(word))
      .getEntry("word/document.xml")!
      .getData()
      .toString()
      .includes("学生活动单"),
  );
  // Replay from the saved model checkpoint as after a worker interruption.
  const originalJob = D.get(
    "SELECT id FROM jobs WHERE type='explore' ORDER BY rowid LIMIT 1",
  ).id;
  D.run("UPDATE jobs SET state='interrupted' WHERE id=?", originalJob);
  assert.ok(
    (await postAs(page, "/api/jobs/" + originalJob + "/retry", {})).ok(),
  );
  await worker.tick();
  assert.equal(
    D.get("SELECT state FROM jobs WHERE id=?", originalJob).state,
    "succeeded",
  );
  assert.equal(requests, 1);
  assert.equal(D.get("SELECT count(*) n FROM artifacts").n, 2);
  assert.equal(
    D.get(
      "SELECT count(*) n FROM messages WHERE role='assistant' AND job_id=?",
      originalJob,
    ).n,
    1,
  );
  const chatUrl = page.url();
  await page.reload();
  await expect(ppt).toBeVisible();
  const originalHref = await ppt.getAttribute("href");
  await send("沿用刚才的材料，另做一份教师版 Markdown");
  await expect(files.getByRole("link", { name: /教师版.*\.md/ })).toBeVisible();
  assert.equal(await ppt.getAttribute("href"), originalHref);
  await page.getByText("研究设置", { exact: true }).click();
  await page.getByLabel("检索范围").selectOption("web");
  await page.getByLabel("本轮联网方式").selectOption("native");
  await send("再把课堂要点整理成一个网页文件");
  const html = files.getByRole("link", { name: /展示页.*\.html/ });
  await expect(html).toBeVisible();
  assert.ok((await fileBytes(html)).toString().includes("叶片结构比较记录"));
  D.run(
    "UPDATE settings SET body=?",
    D.json({ ...D.settings(), allowExternalAI: false }),
  );
  const first = files.first();
  await first.getByText("把这条回答保存为文件").click();
  await first.getByLabel("回答文件格式").selectOption("pdf");
  await first.getByRole("button", { name: "生成文件" }).click();
  await expect
    .poll(
      () =>
        D.get(
          "SELECT count(*) n FROM jobs WHERE type='conversation-export' AND state='queued'",
        ).n,
    )
    .toBe(1);
  await worker.tick();
  const pdf = first.getByRole("link", { name: /\.pdf/ });
  await expect(pdf).toBeVisible();
  assert.equal((await fileBytes(pdf)).subarray(0, 4).toString(), "%PDF");
  assert.equal(requests, 3);
  await first.getByText("把这条回答保存为文件").click();
  await first
    .locator("..")
    .screenshot({ path: out + "/conversation.png", animations: "disabled" });
  await page.goto(url + "/#results");
  await expect(page.getByRole("button", { name: "来源与修改" })).toHaveCount(
    5,
  );
  await page.getByLabel("搜索成果").fill("叶脉");
  await expect(page.getByRole("button", { name: "来源与修改" })).toHaveCount(
    4,
  );
  await page.getByRole("button", { name: "来源与修改" }).first().click();
  await expect.poll(()=>page.url().split("?")[0]).toBe(chatUrl);
  const located=new URLSearchParams(page.url().split("?")[1]).get("file");
  assert.ok(located);await expect(page.locator("#chat-file-"+located)).toBeFocused();
  await expect(ppt).toBeVisible();
  async function postAs(p: any, path: string, data: any) {
    const { csrf } = await (await p.request.get(url + "/api/session")).json();
    return p.request.post(url + path, {
      headers: { "x-csrf-token": csrf },
      data,
    });
  }
  const inline = await page.request.get(
    url +
      (await files
        .getByRole("link", { name: "预览 HTML" })
        .getAttribute("href")),
  );
  assert.match(inline.headers()["content-disposition"], /^inline/);
  assert.match(
    inline.headers()["content-security-policy"],
    /default-src 'none'/,
  );
  assert.match(await inline.text(), /<h2>课堂展示<\/h2>/);
  const username = "other-creator",
    password = "Synthetic-initial-password!";
  assert.ok(
    (
      await postAs(page, "/api/auth/users", {
        username,
        password,
        role: "creator",
        displayName: "隔离创作者",
      })
    ).ok(),
  );
  const other = await browser.newPage();
  assert.ok(
    (await postAs(other, "/api/auth/login", { username, password })).ok(),
  );
  assert.ok(
    (
      await postAs(other, "/api/auth/password", {
        currentPassword: password,
        newPassword: "New-synthetic-password!",
      })
    ).ok(),
  );
  const cid = chatUrl.split("#explore/")[1],
    fileId = originalHref!.split("/")[3];
  const raw = D.get("SELECT asset_id FROM artifacts WHERE id=?", fileId);
  for (const path of [
    originalHref,
    "/api/assets/" + raw.asset_id,
    "/api/conversations/" + cid,
    "/api/conversations/"+cid+"/activity",
    "/api/conversations/"+cid+"/artifacts/"+fileId+"/pages/1",
  ])
    assert.equal((await other.request.get(url + path)).status(), 403);
  const list = await (
    await other.request.get(url + "/api/pipeline/artifacts")
  ).json();
  assert.ok(!list.some((a: any) => a.id === fileId));
  const state = await (await other.request.get(url + "/api/state")).json();
  assert.ok(!state.artifacts.some((a: any) => a.id === fileId));
  assert.ok(!state.jobs.some((j: any) => j.conversationId === cid));
  await other.close();
  assert.deepEqual(errors, []);
  console.log(
    "Chat: controlled and native model fixtures; actual PPTX, DOCX, Markdown, HTML and local PDF. Reload, follow-up, provenance and private access passed.",
  );
} finally {
  await browser.close();
  await app.close();
  D.db.close();
}
