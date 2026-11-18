import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { setupInjected } from "./auth-helper.js";
mkdirSync("test-results", { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  join(process.cwd(), "test-results/media-"),
);
process.env.DEEPSEEK_API_KEY = "test-only-no-network";
const D = await import("../server/db.js"),
  M = await import("../server/media.js"),
  P = await import("../server/media-provider.js"),
  W = await import("../server/wav.js"),
  A = await import("../server/domain.js"),
  T = await import("../server/tasks.js"),
  G = await import("../server/agent.js"),
  E = await import("../server/explore.js"),
  { buildApp } = await import("../server/app.js");
const app = await buildApp(false),
  admin = await setupInjected(app),
  user = D.get("SELECT * FROM users LIMIT 1");
D.run(
  "UPDATE settings SET body=? WHERE id=1",
  D.json({ ...D.settings(), allowExternalAI: true }),
);
const request = (
  session: any,
  method: any,
  url: string,
  payload?: any,
  headers: any = {},
) =>
  app.inject({
    method,
    url,
    payload,
    headers: {
      host: "localhost",
      cookie: session.cookie,
      "x-csrf-token": session.csrf,
      ...headers,
    },
  });
const signal = () => new AbortController().signal;
const mock = (body: any) => (async () => Response.json(body)) as typeof fetch;
const canvas = createCanvas(20, 20);
canvas.getContext("2d").fillRect(0, 0, 20, 20);
const png = A.asset(
  canvas.toBuffer("image/png"),
  "image.png",
  "image/png",
  "test",
);
const txt = A.asset(
  Buffer.from("Synthetic reading activity: 12 participants."),
  "fixture.txt",
  "text/plain",
  "test",
);
const fixture = (
  action: string,
  assetId?: string,
  extra: any = {},
  actor = user,
) => {
  const input = M.freezeMedia(
    { action, title: "媒体验证", ...(assetId ? { assetId } : {}), ...extra },
    actor,
  );
  const job = T.enqueue("media", input);
  D.run("INSERT INTO media_jobs VALUES(?,?,?)", job.id, actor.id, D.now());
  return { input, job };
};
async function complete(f: any, transport: typeof fetch) {
  const result = await M.runMedia(
    f.input,
    f.job.id,
    () => {},
    signal(),
    transport,
  );
  D.run(
    "UPDATE jobs SET state='succeeded',result=?,finished_at=? WHERE id=?",
    D.json(result),
    D.now(),
    f.job.id,
  );
  return result;
}
async function account(role: string, username: string) {
  const created = await request(admin, "POST", "/api/auth/users", {
    username,
    displayName: username,
    role,
    password: "Media-test-only-2026!",
  });
  assert.equal(created.statusCode, 200, created.body);
  const u = D.get("SELECT * FROM users WHERE username=?", username);
  D.run("UPDATE users SET must_change_password=0 WHERE id=?", u.id);
  u.must_change_password = 0;
  const s = await app.inject({
      url: "/api/session",
      headers: { host: "localhost" },
    }),
    cookie = String(s.headers["set-cookie"]).split(";")[0];
  const r = await request(
    { cookie, csrf: s.json().csrf },
    "POST",
    "/api/auth/login",
    { username, password: "Media-test-only-2026!" },
  );
  assert.equal(r.statusCode, 200, r.body);
  return {
    cookie: String(r.headers["set-cookie"]).split(";")[0],
    csrf: r.json().csrf,
    user: u,
  };
}
after(async () => {
  await app.close();
  D.db.close();
});

test("Files按顺序上传、设置到期、Flash读取file_id并在结束时删除", async () => {
  const f = fixture("document", txt.id),
    calls: string[] = [];
  const result = await complete(f, (async (url, opts) => {
    const path = new URL(String(url)).pathname;
    calls.push(path + ":" + (opts?.method || "POST"));
    if (path === "/files") {
      const form = opts!.body as FormData;
      assert.equal([...form.keys()][0], "purpose");
      assert.equal(form.get("purpose"), "user_data");
      assert.equal(form.get("expires_after[seconds]"), "3600");
      return Response.json({ id: "file-api-test" });
    }
    if (opts?.method === "DELETE") {
      assert.equal(opts.signal?.aborted, false);
      return Response.json({ deleted: true });
    }
    const b = JSON.parse(opts!.body as string);
    assert.equal(b.model, "deepseek-flash");
    assert.equal(b.messages[1].content[0].file_id, "file-api-test");
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: { content: "测试活动共有12人参加。" },
        },
      ],
    });
  }) as typeof fetch);
  assert.match(result.text, /12/);
  assert.equal(calls.length, 3);
  assert.match(calls.at(-1)!, /DELETE/);
  const replay = await M.runMedia(
    f.input,
    f.job.id,
    () => {},
    signal(),
    (async () => {
      throw new Error("must not bill twice");
    }) as typeof fetch,
  );
  assert.equal(replay.text, result.text);
});
test("文件回答失败也清理临时文件；未确认删除显式告警", async () => {
  for (const fail of [true, false]) {
    const f = fixture("document", txt.id);
    let deleted = false;
    const transport = (async (url, opts) => {
      if (opts?.method === "DELETE") {
        deleted = true;
        return Response.json({ deleted: false });
      }
      if (new URL(String(url)).pathname === "/files")
        return Response.json({ id: "file-api-fail" });
      return Response.json(
        fail
          ? { error: { message: "failure" } }
          : { choices: [{ message: { content: "安全的测试结果" } }] },
      );
    }) as typeof fetch;
    if (fail) await assert.rejects(complete(f, transport));
    else
      assert.ok(
        (await complete(f, transport)).warnings.some((w: string) =>
          w.includes("删除未确认"),
        ),
      );
    assert.equal(deleted, true);
  }
});
test("图像理解使用图片内容且拒绝伪装文件", async () => {
  assert.throws(() => M.inspectMedia(Buffer.from("fake"), "fake.png"));
  const f = fixture("vision", png.id);
  await complete(f, (async (_url, opt) => {
    const b = JSON.parse(opt!.body as string);
    assert.match(
      b.messages[1].content[0].image_url.url,
      /^data:image\/png;base64,/,
    );
    assert.equal(b.messages[1].content[0].image_url.detail, "original");
    return Response.json({
      choices: [{ message: { content: "可见一块黑色方形。" } }],
    });
  }) as typeof fetch);
});
let ocr: any;
test("OCR保留坐标原始记录，拒绝截断或缺页", async () => {
  const output = {
    page_count: 1,
    pages: [
      {
        index: 0,
        text: "<｜ref｜>测试活动共有12人参加<｜/ref｜><｜box｜>[[1,2,3,4]]<｜/box｜>",
        finish_reason: "stop",
      },
    ],
  };
  ocr = fixture("ocr", png.id);
  const result = await complete(ocr, mock(output));
  assert.match(result.text, /12/);
  assert.ok(!result.text.includes("box"));
  assert.match(A.assetBuffer(result.rawAssetId).data.toString(), /box/);
  for (const body of [
    { ...output, page_count: 2 },
    { page_count: 1, pages: [{ ...output.pages[0], finish_reason: "length" }] },
  ])
    await assert.rejects(
      complete(fixture("ocr", png.id), mock(body)),
      (e: any) => e.code === "OCR_INCOMPLETE",
    );
  await assert.rejects(
    P.mediaJson(
      "/v1/tools/ocr",
      {},
      signal(),
      mock({ error: { message: "bad" } }),
    ),
  );
});
test("语音按110秒切分、检查WAV完整性，失败重试保留已完成段", async () => {
  const wav = W.makeWav(Buffer.alloc(16000 * 2 * 121));
  assert.equal(W.splitWav(wav).parts.length, 2);
  assert.throws(() => W.readWav(wav.subarray(0, -2)));
  const a = A.asset(wav, "speech.wav", "audio/wav", "test"),
    f = fixture("asr", a.id);
  let calls = 0;
  await assert.rejects(
    complete(f, (async (_url, opt) => {
      calls++;
      assert.deepEqual([...(opt!.body as FormData).keys()], ["file"]);
      if (calls === 2) throw new Error("disconnect");
      return Response.json({ text: "第一段内容", duration_ms: 110000 });
    }) as typeof fetch),
  );
  assert.equal(
    D.parse(
      D.get("SELECT checkpoint FROM jobs WHERE id=?", f.job.id).checkpoint,
    ).segments.length,
    1,
  );
  const result = await complete(f, (async () => {
    calls++;
    return Response.json({ text: "第二段内容", duration_ms: 11000 });
  }) as typeof fetch);
  assert.equal(calls, 3);
  assert.match(result.text, /01:50—02:01/);
  assert.equal(result.segments.length, 2);
});
test("配音按汉字计费限制、拒绝错误音频，完整音频支持范围播放", async () => {
  assert.throws(
    () => fixture("tts", undefined, { text: "汉".repeat(5001) }),
    (e: any) => e.code === "TTS_TEXT_LIMIT",
  );
  const f = fixture("tts", undefined, { text: "测试配音内容", voice: "tide" }),
    wav = W.makeWav(Buffer.alloc(24000 * 2), 24000);
  const result = await complete(f, (async (_url, opt) => {
    const b = JSON.parse(opt!.body as string);
    assert.equal(b.voice_id, "tide");
    assert.equal(b.filter_markdown, true);
    return new Response(wav, { headers: { "content-type": "audio/wav" } });
  }) as typeof fetch);
  assert.equal(result.durationMs, 1000);
  assert.equal(result.aiGenerated, true);
  const r = await request(
    admin,
    "GET",
    `/api/media/${f.job.id}/audio`,
    undefined,
    { range: "bytes=0-43" },
  );
  assert.equal(r.statusCode, 206);
  assert.equal(r.rawPayload.length, 44);
  const broken = fixture("tts", undefined, { text: "截断音频测试" });
  await assert.rejects(
    complete(
      broken,
      (async () =>
        new Response(wav.subarray(0, -10), {
          headers: { "content-type": "audio/wav" },
        })) as typeof fetch,
    ),
  );
});
test("媒体结果进入私有笔记、探索上下文和待核实素材；不同适用范围独立", async () => {
  const body = {
    title: "合成测试资料",
    text: "这场测试活动共有12人参加。仅用于功能测试。",
  };
  const n = (
    await request(admin, "POST", `/api/media/${ocr.job.id}/note`, body)
  ).json();
  assert.ok(n.id);
  const duplicate = (
    await request(admin, "POST", `/api/media/${ocr.job.id}/note`, body)
  ).json();
  assert.equal(n.id, duplicate.id);
  const speech = fixture("tts", undefined, {
    sourceKind: "note",
    sourceId: n.id,
  });
  assert.equal(speech.input.speechText, body.text);
  const c = (await request(admin, "POST", "/api/conversations", {})).json();
  const context = E.freezeExplore(
    {
      conversationId: c.id,
      prompt: "整理这份资料",
      mode: "local",
      noteIds: [n.id],
    },
    user,
  );
  assert.ok(JSON.stringify(context).includes("12人"));
  const r = await request(admin, "POST", `/api/media/${ocr.job.id}/material`, {
    ...body,
    scope: { year: 2026 },
  });
  assert.equal(r.statusCode, 200, r.body);
  const r2 = await request(admin, "POST", `/api/media/${ocr.job.id}/material`, {
    ...body,
    scope: { year: 2027 },
  });
  assert.notEqual(r.json().snapshotId, r2.json().snapshotId);
  const input = G.freezeAgentInput({
    kind: "research",
    snapshotIds: [r.json().snapshotId],
  });
  assert.ok(JSON.stringify(input.snapshots).includes("待核实"));
});
test("管理员/创作者/业务员隔离；私有媒体不可绕过旧素材/OCR接口读取", async () => {
  const owner = await account("creator", "media-owner"),
    other = await account("creator", "media-other"),
    sales = await account("sales", "media-sales");
  const privateAsset = A.asset(
    Buffer.from("private media source unique"),
    "private.txt",
    "text/plain",
    "media-upload",
  );
  D.run("INSERT INTO media_assets VALUES(?,?)", privateAsset.id, owner.user.id);
  const f = fixture("document", privateAsset.id, {}, owner.user);
  for (const path of ["/api/media", "/api/media/" + f.job.id + "/audio"])
    assert.equal((await request(sales, "GET", path)).statusCode, 403);
  for (const path of [
    "/api/assets/" + privateAsset.id,
    "/api/jobs/" + f.job.id,
  ])
    assert.equal((await request(other, "GET", path)).statusCode, 403);
  for (const path of ["/api/ocr", "/api/import-upload", "/api/media"])
    assert.equal(
      (await request(other, "POST", path, { assetId: privateAsset.id }))
        .statusCode,
      403,
    );
  assert.equal(
    (await request(owner, "GET", "/api/assets/" + privateAsset.id)).statusCode,
    200,
  );
  assert.equal(
    (await request(admin, "GET", "/api/assets/" + privateAsset.id)).statusCode,
    200,
  );
  assert.ok(
    !(await request(other, "GET", "/api/media"))
      .json()
      .some((j: any) => j.id === f.job.id),
  );
  assert.ok(
    !(await request(other, "GET", "/api/state"))
      .json()
      .jobs.some((j: any) => j.id === f.job.id),
  );
  const note = (
    await request(owner, "POST", "/api/notes", {
      title: "私有笔记",
      body: "不向其他创作者开放的测试文字",
    })
  ).json();
  assert.throws(
    () =>
      M.freezeMedia(
        {
          action: "tts",
          title: "非法引用",
          sourceKind: "note",
          sourceId: note.id,
        },
        other.user,
      ),
    (e: any) => e.code === "FORBIDDEN",
  );
  D.run("UPDATE users SET status='disabled' WHERE id=?", owner.user.id);
  await assert.rejects(
    M.runMedia(f.input, f.job.id, () => {}, signal(), mock({})),
    (e: any) => e.code === "ACTOR_REVOKED",
  );
});
