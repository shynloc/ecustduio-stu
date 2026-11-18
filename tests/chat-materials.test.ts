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
