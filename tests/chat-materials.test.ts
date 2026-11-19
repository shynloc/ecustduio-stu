import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { setupInjected } from "./auth-helper.js";

mkdirSync("test-results", { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  resolve("test-results/chat-materials-"),
);
process.env.DEEPSEEK_API_KEY = "synthetic-no-network";
const D = await import("../server/db.js"),
  { buildApp } = await import("../server/app.js"),
  { Worker } = await import("../server/tasks.js");
const { makeWav } = await import("../server/wav.js");
const app = await buildApp(false),
  auth = await setupInjected(app);
D.run(
  "UPDATE settings SET body=?",
  D.json({
    ...D.settings(),
    allowExternalAI: true,
    exploreEngine: "controlled",
  }),
);
after(async () => {
  await app.close();
  D.db.close();
});
const request = (method: any, url: string, payload?: any) =>
  app.inject({
    method,
    url,
    payload,
    headers: {
      host: "localhost",
      cookie: auth.cookie,
      "x-csrf-token": auth.csrf,
    },
  });
async function upload(bytes: Buffer, name: string) {
  const session = (
    await request("POST", "/api/upload-sessions", {
      name,
      size: bytes.length,
      fingerprint: D.hash(bytes),
    })
  ).json();
  const chunk = await request("PUT", "/api/upload-sessions/" + session.id, {
    offset: 0,
    chunk: bytes.toString("base64"),
    hash: D.hash(bytes),
  });
  assert.equal(chunk.statusCode, 200);
  const r = await request(
    "POST",
    "/api/upload-sessions/" + session.id + "/complete",
  );
  assert.equal(r.statusCode, 200);
  return r.json();
}
test("排队的后续消息引用此前的回答，PDF页码与录音分段保留，重读同一对话材料不重复转写", async () => {
  const pdf = await PDFDocument.create();
  for (const t of [
    "Class period: twenty five minutes",
    "Record the capacity of both bridges twice",
  ])
    pdf.addPage().drawText(t);
  const doc = await upload(Buffer.from(await pdf.save()), "paper-bridge.pdf"),
    audio = await upload(makeWav(Buffer.alloc(32000)), "teacher.wav");
  const cid = (await request("POST", "/api/conversations", {})).json().id;
  let transcriptions = 0,
    turns = 0;
  const worker = new Worker(undefined, undefined, async (url, opts) => {
    if (String(url).endsWith("/asr")) {
      transcriptions++;
      return Response.json({ text: "先讨论三分钟。" });
    }
    const messages = JSON.parse(String(opts?.body)).messages,
      turn = JSON.parse(messages.at(-1).content);
    const refs = turn.retrievedSources;
    assert.ok(
      refs.some(
        (s: any) =>
          s.assetId === doc.id &&
          s.excerpt.includes("[第 2 页]") &&
          s.excerpt.includes("twice"),
      ),
    );
    assert.ok(
      refs.some(
        (s: any) =>
          s.assetId === audio.id &&
          s.excerpt.includes("先讨论三分钟") &&
          s.excerpt.includes("0:00"),
      ),
    );
    if (turns++)
      assert.ok(
        messages.some(
          (m: any) =>
            m.role === "assistant" && m.content.includes("第一轮结果"),
        ),
      );
    else assert.ok(!JSON.stringify(messages).includes("跟进问题"));
    return Response.json({
      choices: [
        {
          message: {
            role: "assistant",
            content: (turns === 1 ? "第一轮结果" : "后续结果") + "[S1][S2]",
          },
        },
      ],
    });
  });
  const path = "/api/conversations/" + cid + "/messages";
  assert.equal(
    (
      await request("POST", path, {
        prompt: "检查材料",
        queueTurn: true,
        mode: "auto",
        attachmentIds: [doc.id, audio.id],
      })
    ).statusCode,
    202,
  );
  assert.equal(
    (
      await request("POST", path, {
        prompt: "跟进问题",
        queueTurn: true,
        mode: "auto",
      })
    ).statusCode,
    202,
  );
  await worker.tick();
  await worker.tick();
  const chat = (await request("GET", "/api/conversations/" + cid)).json();
  assert.deepEqual(
    chat.messages.map((m: any) => m.role),
    ["user", "assistant", "user", "assistant"],
  );
  assert.equal(transcriptions, 1);
  assert.equal(turns, 2);
  const activity = (
    await request("GET", "/api/conversations/" + cid + "/activity")
  ).json();
  assert.equal(activity.length, 2);
  assert.ok(activity.every((j: any) => j.state === "succeeded"));
  assert.equal(
    (
      await request("POST", path, {
        prompt: "只讨论",
        mode: "local",
        sourceUrls: ["https://example.org/"],
      })
    ).statusCode,
    422,
  );
});

test("其他创作者不能把知道编号的原文件带入自己的私有对话", async () => {
  const file = await upload(
    Buffer.from("合成私有课程原文，只用于权限回归。"),
    "private.txt",
  );
  const username = "other-course-creator",
    password = "Synthetic-initial-password!";
  assert.equal(
    (
      await request("POST", "/api/auth/users", {
        username,
        password,
        displayName: "隔离创作者",
        role: "creator",
      })
    ).statusCode,
    200,
  );
  const anon = await app.inject({
    url: "/api/session",
    headers: { host: "localhost" },
  });
  let headers = {
    host: "localhost",
    cookie: String(anon.headers["set-cookie"]).split(";")[0],
    "x-csrf-token": anon.json().csrf,
  };
  for (const [url, payload] of [
    ["/api/auth/login", { username, password }],
    [
      "/api/auth/password",
      { currentPassword: password, newPassword: password + "changed" },
    ],
  ] as const) {
    const r = await app.inject({ method: "POST", url, payload, headers });
    assert.equal(r.statusCode, 200);
    headers = {
      ...headers,
      cookie: r.headers["set-cookie"]
        ? String(r.headers["set-cookie"]).split(";")[0]
        : headers.cookie,
      "x-csrf-token": r.json().csrf || headers["x-csrf-token"],
    };
  }
  const chat = (
    await app.inject({
      method: "POST",
      url: "/api/conversations",
      payload: {},
      headers,
    })
  ).json();
  const illegal = await app.inject({
    method: "POST",
    url: "/api/conversations/" + chat.id + "/messages",
    headers,
    payload: { prompt: "读取文件", attachmentIds: [file.id] },
  });
  assert.equal(illegal.statusCode, 403);
  assert.equal(
    (await app.inject({ url: "/api/assets/" + file.id, headers })).statusCode,
    403,
  );
});

test("直接用上传的 Word 与重排过的 PPTX 创作，原件与来源绑定到当前会话", async () => {
  const { Document, Packer, Paragraph } = await import("docx");
  const { default: PptxGenJS } = await import("pptxgenjs");
  const { default: Zip } = await import("adm-zip");
  const { load } = await import("cheerio");
  const doc = await upload(
    await Packer.toBuffer(
      new Document({
        sections: [{ children: [new Paragraph("每种纸桥各测两次。")] }],
      }),
    ),
    "活动单-第2版.docx",
  );
  const deck = new PptxGenJS();
  for (const title of ["先讨论", "先搭桥"])
    deck.addSlide().addText(title, { x: 1, y: 1, w: 4, h: 1 });
  const zip = new Zip(
    (await deck.write({ outputType: "nodebuffer" })) as Buffer,
  );
  const xml = load(zip.readAsText("ppt/presentation.xml"), { xml: true });
  const first = xml("p\\:sldId").first();
  xml("p\\:sldIdLst").append(first);
  zip.updateFile("ppt/presentation.xml", Buffer.from(xml.xml()));
  const ppt = await upload(zip.toBuffer(), "教师演示.pptx");
  const cid = (await request("POST", "/api/conversations", {})).json().id;
  const worker = new Worker(undefined, undefined, async (_url, opts) => {
    const b = JSON.parse(String(opts?.body));
    const ctx = JSON.parse(b.messages.at(-1).content);
    const file = ctx.pages ? ppt : doc;
    assert.equal(ctx.source.originalSources[0].sourceHash, file.hash);
    if (ctx.pages) {
      assert.match(ctx.pages[0].text, /先搭桥/);
      assert.match(ctx.pages[1].text, /先讨论/);
    } else {
      assert.equal(ctx.source.version, 2);
      assert.match(ctx.source.content, /各测两次/);
    }
    const content = ctx.pages
      ? {
          scenes: [
            { page: 1, title: "搭桥", text: "先搭桥。" },
            { page: 2, title: "讨论", text: "再讨论。" },
          ],
        }
      : {
          title: "陪孩子做纸桥实验",
          body: "# 陪孩子做纸桥实验\n\n请孩子拿出两次实测记录再解释判断。[S1]",
        };
    return Response.json({
      model: "fixture",
      choices: [
        { message: { role: "assistant", content: JSON.stringify(content) } },
      ],
    });
  });
  for (const [file, prompt] of [
    [doc, "用上传的活动单写公众号文章"],
    [ppt, "用上传的教师 PPT 做一分钟配音视频"],
  ] as const) {
    const j = await request("POST", "/api/conversations/" + cid + "/messages", {
      prompt,
      attachmentIds: [file.id],
    });
    assert.equal(j.statusCode, 202);
    await worker.tick();
    const result = D.get(
      "SELECT state,error FROM jobs WHERE id=?",
      j.json().id,
    );
    assert.equal(result.state, "succeeded", result.error);
    const card = D.parse(
      D.get(
        "SELECT context FROM messages WHERE job_id=? AND role='assistant'",
        j.json().id,
      ).context,
    ).adaptation;
    assert.equal(card.sourceAssetId, file.id);
    const original = await request(
      "GET",
      "/api/artifacts/" + card.sourceId + "/download",
    );
    assert.equal(D.hash(original.rawPayload), file.hash);
    if (card.kind === "wechat") {
      const prev = (
        await request("GET", "/api/wechat/previews/" + card.previewId)
      ).json();
      const html = load(prev.previewHtml);
      assert.equal(html("h1").length, 1);
      assert.equal(html("img").length, 1);
      assert.match(html("p").last().text(), /\[S1\]/);
    }
  }
});


test("新增主题不误匹配普通创作指令，明确主题可区分浅深色", async () => {
  const {themeIn}=await import('../server/chat-adaptations.js');
  assert.equal(themeIn('用上传的活动单写公众号文章'),undefined);
  assert.equal(themeIn('将技术文档改成给家长看的公众号文章'),undefined);
  assert.equal(themeIn('用中式古典主题写公众号文章'),'milestone-cnclassic-light');
  assert.equal(themeIn('换成中式古典深色主题'),'milestone-cnclassic-dark');
  assert.equal(themeIn('用公众号文章浅色主题排版'),'milestone-wechat-light');
  assert.equal(themeIn('用公众号文章深色主题排版'),'milestone-wechat-dark');
  assert.equal(themeIn('改用暗夜代码主题'),'milestone-darkcode-dark');
});
