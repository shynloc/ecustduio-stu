import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { htmlFilmIntent } from "../shared/html-film.js";
mkdirSync("test-results", { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  resolve("test-results/html-snapshot-"),
);
const { snapshotWebFilm, filmResources } =
  await import("../server/html-film-snapshot.js");
const { renderHtmlFilm } = await import("../server/html-film.js");
const { ffmpegPath } = await import("../server/visual-runtime.js");
const { buildApp } = await import("../server/app.js");
const D = await import("../server/db.js");
const app = await buildApp(false);
const { setupInjected } = await import("./auth-helper.js");
const session = await setupInjected(app);
const user = D.get("SELECT id,role FROM users WHERE role='admin'");
test("默认原样，否定重排保留原样，明确改成分镜才重排", () => {
  assert.equal(htmlFilmIntent("做六秒视频，不要重新编排").mode, "original");
  assert.equal(
    htmlFilmIntent("重新编排成分镜，沿用时长", { seconds: 6 }).seconds,
    6,
  );
  assert.equal(htmlFilmIntent("请把网页做成两秒分镜视频").mode, "storyboard");
});
test("冻结公开网页和相对依赖，离线使用同一原样渲染器；缺资源要报错", async () => {
  const url = "https://site.example/lesson/";
  const html =
    '<meta charset="utf-8"><link rel="stylesheet" href="css/base.css"><strong>网页原文</strong><script src="app.js"></script>';
  const css = '@import "colors.css";';
  const responses = new Map([
    [url, [html, "text/html"]],
    [url + "css/base.css", [css, "text/css"]],
    [url + "css/colors.css", ["body{background:rgb(12,113,91)}", "text/css"]],
    [
      url + "app.js",
      ["document.body.style.borderTop='20px solid orange'", "text/javascript"],
    ],
  ]);
  const signal = AbortSignal.timeout(40000);
  const s = await snapshotWebFilm(
    url,
    user.id,
    signal,
    () => {},
    async (u) => {
      const [text, type] = responses.get(u)!;
      return { url: u, buffer: Buffer.from(text), type };
    },
  );
  assert.equal(s.bundle.resources.length, 3);
  assert.equal(new Set(s.bundle.resources.map((r) => r.id)).size, 3);
  const output = join(process.env.ECUSTUDIO_DATA_DIR!, "web.mp4");
  const params = {
    html,
    film: {
      assetId: s.file.id,
      mode: "original" as const,
      aspect: "square" as const,
      narrated: false,
      bundle: s.bundle,
    },
    seconds: 1,
    scenes: [],
    timeline: [],
    resources: filmResources(s.bundle, user),
    output,
    signal,
    progress: () => {},
    check: () => {},
  };
  await renderHtmlFilm(params);
  const rgb = execFileSync(ffmpegPath(), [
    "-v",
    "error",
    "-i",
    output,
    "-frames:v",
    "1",
    "-vf",
    "crop=2:2:400:400",
    "-pix_fmt",
    "rgb24",
    "-f",
    "rawvideo",
    "-",
  ]);
  assert.ok(Math.abs(rgb[1] - 113) < 6 && Math.abs(rgb[2] - 91) < 6);
  await assert.rejects(renderHtmlFilm({ ...params, resources: new Map() }), {
    code: "HTML_RESOURCES",
  });
});
test("对话已有 HTML 直接取原始字节，配音模式先试听、再按原网页渲染", async () => {
  const { storeWorkflowArtifact } = await import("../server/workflows.js"),
    { Worker } = await import("../server/tasks.js"),
    { grantMediaAsset } = await import("../server/media-access.js"),
    { makeWav } = await import("../server/wav.js");
  const request = (method: any, url: string, payload?: any) =>
    app.inject({
      method,
      url,
      payload,
      headers: {
        host: "localhost",
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
    });
  const cid = (await request("POST", "/api/conversations", {})).json().id;
  const html = Buffer.from(
    '<!doctype html><meta charset="utf-8"><h1>潮汐</h1><p>水位上升。</p>',
  );
  const f = storeWorkflowArtifact(
    html,
    "潮汐.html",
    "html",
    "html-fixture",
    cid,
    { ownerId: user.id, conversationId: cid, title: "潮汐网页", version: 2 },
  );
  grantMediaAsset(f.asset_id, user.id);
  D.run(
    "INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)",
    D.id(),
    cid,
    "assistant",
    "网页",
    "[]",
    D.json({
      artifacts: [{ id: f.id, format: "html", title: "潮汐网页", version: 2 }],
    }),
    null,
    D.now(),
  );
  process.env.DEEPSEEK_API_KEY = "synthetic-html-video-test";
  D.run(
    "UPDATE settings SET body=?",
    D.json({ ...D.settings(), allowExternalAI: true }),
  );
  let calls = 0;
  const worker = new Worker(undefined, undefined, async (url, opts) => {
    calls++;
    if (String(url).endsWith("/tts"))
      return new Response(makeWav(Buffer.alloc(32000, 20)));
    const b = JSON.parse(String(opts?.body)),
      ctx = JSON.parse(b.messages.at(-1).content);
    assert.equal(ctx.source.version, 2);
    return Response.json({
      model: "html-test",
      choices: [
        {
          message: {
            role: "assistant",
            content: JSON.stringify({
              scenes: [{ page: 1, title: "潮汐", text: "水位上升。" }],
            }),
          },
        },
      ],
    });
  });
  const prep = await request(
    "POST",
    "/api/conversations/" + cid + "/messages",
    { prompt: "做 2 秒配音视频", derive: { kind: "video", artifactId: f.id } },
  );
  assert.equal(prep.statusCode, 202);
  await worker.tick();
  const mid = D.get(
    "SELECT id FROM messages WHERE role='assistant' AND job_id=?",
    prep.json().id,
  )?.id;
  assert.ok(mid);
  const base =
    "/api/conversations/" + cid + "/messages/" + mid + "/adaptation/jobs";
  assert.equal(
    (await request("POST", base, { action: "render", confirmed: true }))
      .statusCode,
    409,
  );
  const audio = await request("POST", base, {
    action: "listen",
    confirmed: true,
  });
  assert.equal(audio.statusCode, 202);
  await worker.tick();
  const film = await request("POST", base, {
    action: "render",
    audioJobId: audio.json().id,
    confirmed: true,
  });
  assert.equal(film.statusCode, 202);
  await worker.tick();
  const row = D.get(
    "SELECT state,result,error FROM jobs WHERE id=?",
    film.json().id,
  );
  assert.equal(row.state, "succeeded", row.error);
  const r = D.parse(row.result);
  assert.equal(r.mode, "original");
  assert.equal(r.sourceHash, D.hash(html));
  assert.deepEqual(
    r.artifacts.map((a: any) => a.format),
    ["mp4", "srt"],
  );
  assert.equal(calls, 2);
  const other = (await request("POST", "/api/conversations", {})).json().id;
  assert.equal(
    (
      await request("POST", "/api/conversations/" + other + "/messages", {
        prompt: "做视频",
        derive: { kind: "video", artifactId: f.id },
      })
    ).statusCode,
    404,
  );
});
test.after(async () => {
  await app.close();
  D.db.close();
});
