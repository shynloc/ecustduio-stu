import assert from "node:assert/strict";
import { expect } from "playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { makeWav } from "../server/wav.js";

const narrations = [
  "今天一起看看，一张纸怎样变成一座小桥。我们用两种桥形来做一次公平的比较。",
  "先猜一猜。用同样的纸搭桥，改变纸的形状，会影响它能承住的垫片数吗？请先记下你的理由。",
  "把两本同高的书分开十二厘米。分别用一张纸做平桥和折桥，每次把一枚垫片放在桥面中央。",
  "每种桥都测两次。桥面接触桌面就停止，记录触桌前的枚数。如果放完十二枚仍未触桌，就写至少十二枚。",
  "请对照记录表，找出支持自己判断的数据。如果两次结果不同，再想一想，哪些条件需要保持相同。",
  "这次活动依据纸桥承重对比实验课程材料。结论来自孩子们自己的观察，留下问题，下次继续验证。",
];
export function derivativeFixture(out: string) {
  let articles = 0,
    scripts = 0;
  const calls: string[] = [];
  const article =
    "## 孩子在比较什么？\n课堂上，孩子用相同规格的纸搭平桥和折桥，把书间距保持在 12 厘米。[S1]\n\n## 回家可以怎么问\n请孩子拿出第 2 版记录单，读出两次数据，再解释这些证据怎样支持自己的判断。没有测过的结果留给实验。[S1]";
  return {
    calls,
    counts: () => ({ articles, scripts }),
    article,
    async respond(url: string, b: any) {
      if (url.endsWith("/tts")) {
        const text = b.text;
        calls.push(text);
        if (process.env.ECUSTUDIO_QA_MAC_SPEECH === "1") {
          const aiff = join(out, "fixture-voice.aiff"),
            wav = join(out, "fixture-voice.wav");
          execFileSync(
            "/usr/bin/say",
            ["-v", "Tingting", "-r", "225", "-o", aiff, "--", text],
            { timeout: 30000 },
          );
          const { ffmpegPath } = await import("../server/visual-runtime.js");
          execFileSync(
            ffmpegPath(),
            [
              "-v",
              "error",
              "-y",
              "-i",
              aiff,
              "-ar",
              "16000",
              "-ac",
              "1",
              "-c:a",
              "pcm_s16le",
              wav,
            ],
            { timeout: 30000 },
          );
          return new Response(readFileSync(wav));
        }
        const pcm = Buffer.alloc(2 * 16000);
        for (let n = 0; n < 16000; n++)
          pcm.writeInt16LE(
            Math.round(3000 * Math.sin(n * (0.08 + calls.length * 0.005))),
            n * 2,
          );
        return new Response(makeWav(pcm));
      }
      if (!b.response_format) return null;
      const ctx = JSON.parse(b.messages.at(-1).content);
      let content;
      if (ctx.pages) {
        scripts++;
        assert.equal(ctx.source.format, "pptx");
        assert.equal(ctx.source.version, 1);
        assert.equal(ctx.targetSeconds, 60);
        assert.equal(ctx.pages.length, 6);
        assert.ok(ctx.pages[2].text.includes("12 厘米"));
        content = {
          scenes: narrations.map((text, i) => ({
            page: i + 1,
            title: [
              "课程介绍",
              "提出预测",
              "示范与分工",
              "巡回指导",
              "讨论与评价",
              "资料来源",
            ][i],
            text,
          })),
        };
      } else {
        articles++;
        assert.equal(ctx.source.version, 2);
        assert.ok(ctx.source.content.includes("用证据解释"));
        content = { title: "一张纸桥上的科学课", body: article };
      }
      return Response.json({
        model: "course-adaptation-fixture",
        choices: [
          { message: { role: "assistant", content: JSON.stringify(content) } },
        ],
      });
    },
  };
}

export async function verifyDerivatives({
  page,
  base,
  ask,
  worker,
  D,
  fixture,
  model,
  out,
  hasOffice,
}: any) {
  const url = page.url(),
    cid = url.split("#explore/")[1];
  async function queued(type: string) {
    await expect
      .poll(
        () =>
          D.get(
            "SELECT count(*) n FROM jobs WHERE type=? AND state='queued'",
            type,
          ).n,
      )
      .toBe(1);
    const r = D.get(
      "SELECT id FROM jobs WHERE type=? AND state='queued'",
      type,
    );
    await worker.tick();
    return D.get("SELECT id,state,result,error FROM jobs WHERE id=?", r.id);
  }
  const { csrf } = await (await page.request.get(base + "/api/session")).json();
  const conn = await page.request.post(base + "/api/settings/wechat/connect", {
    headers: { "x-csrf-token": csrf },
    data: {
      name: "纸桥验收测试号",
      appId: "wx0123456789abcdef",
      secret: "Synthetic-course-only-secret",
    },
  });
  assert.ok(conn.ok(), await conn.text());
  await ask("用第 2 版活动单写一篇给家长看的公众号文章，用中式古典主题。");
  const articles = page.getByRole("region", { name: "对话公众号文章" });
  const first = articles.first();
  await expect(first.getByLabel("对话文章主题")).toHaveValue(
    "milestone-cnclassic-light",
  );
  await expect(
    first
      .frameLocator("iframe")
      .getByRole("heading", { name: "孩子在比较什么？" }),
  ).toBeVisible();
  const download = await page.request.get(
    base +
      (await first
        .getByRole("link", { name: "下载排版" })
        .getAttribute("href")),
  );
  assert.ok(download.ok());
  writeFileSync(join(out, "family-article.html"), await download.body());
  await first.screenshot({ path: join(out, "classic-family-article.png") });
  await ask("换成商务报告主题");
  const next = articles.nth(1);
  await expect(next.getByLabel("对话文章主题")).toHaveValue(
    "milestone-business-light",
  );
  await expect(next.frameLocator("iframe").locator("body")).toHaveText(
    await first.frameLocator("iframe").locator("body").textContent(),
  );
  assert.equal(model.counts().articles, 1);
  assert.equal(fixture.articles.size, 0);
  const headers = { "x-csrf-token": csrf };
  function cardPath(mid: string) {
    return (
      base + "/api/conversations/" + cid + "/messages/" + mid + "/adaptation"
    );
  }
  async function getMid(region: any) {
    return (
      await region.locator("xpath=ancestor::article[1]").getAttribute("id")
    ).slice("chat-message-".length);
  }
  const articlePath = cardPath(await getMid(next));
  const cardInfo = D.parse(
    D.get("SELECT context FROM messages WHERE id=?", await getMid(next))
      .context,
  ).adaptation;
  assert.equal(
    (
      await page.request.post(articlePath + "/draft", {
        headers,
        data: {
          previewId: cardInfo.previewId,
          accountId: "wrong-account",
          confirmed: true,
        },
      })
    ).status(),
    409,
  );
  await ask("保存到草稿箱");
  await page.getByRole("button", { name: "核对公众号与草稿" }).click();
  await expect(
    next.getByRole("button", { name: "保存到「纸桥验收测试号」草稿箱" }),
  ).toBeFocused();
  assert.equal(fixture.articles.size, 0);
  fixture.state.dropAdd = true;
  page.once("dialog", (d: any) => d.accept());
  await next
    .getByRole("button", { name: "保存到「纸桥验收测试号」草稿箱" })
    .click();
  const lost = await queued("wechat-draft");
  assert.equal(lost.state, "failed");
  await page.reload();
  await next.getByRole("button", { name: "核对草稿并继续" }).click();
  const reconciled = await queued("wechat-draft");
  assert.equal(reconciled.id, lost.id);
  assert.equal(reconciled.state, "succeeded", reconciled.error);
  await expect(next.getByText(/微信已回读草稿/)).toBeVisible();
  assert.equal(
    fixture.calls.filter((c: any) => c.path.endsWith("/draft/add")).length,
    1,
  );
  assert.equal(fixture.articles.size, 1);
  await next.screenshot({ path: join(out, "family-article.png") });
  await ask("把最初的教师 PPT 做成一分钟配音视频，先让我试听。");
  const videos = page.getByRole("region", { name: "对话配音视频" });
  const script = videos.first();
  await expect(script.getByLabel("旁白页码")).toHaveValue("1");
  assert.equal(model.calls.length, 0);
  await script.getByRole("button", { name: "确认配音用量并试听" }).click();
  const audio1 = await queued("chat-narration");
  assert.equal(audio1.state, "succeeded", audio1.error);
  await expect(script.locator('audio[aria-label="整段试听"]')).toHaveAttribute(
    "src",
    /assets/,
  );
  assert.equal(model.calls.length, 6);
  const take1 = JSON.parse(audio1.result);
  await ask("第三页慢一点");
  const changed = videos.nth(1);
  const auto = await queued("chat-narration");
  assert.equal(auto.state, "succeeded", auto.error);
  await changed.getByLabel("旁白页码").selectOption("3");
  await expect(changed.getByLabel("本页语速")).toHaveValue("0.9");
  const take2 = JSON.parse(auto.result);
  assert.equal(model.calls.length, 6);
  assert.equal(model.counts().scripts, 1);
  assert.ok(
    take2.timeline[2].audioEnd - take2.timeline[2].start >
      take1.timeline[2].audioEnd - take1.timeline[2].start,
  );
  for (const i of [0, 1, 3, 4, 5])
    assert.equal(
      take1.timeline[i].audioAssetId,
      take2.timeline[i].audioAssetId,
    );
  // Read, decode and start the audition using the actual audio element.
  const play = changed.locator('audio[aria-label="整段试听"]');
  await expect(play).toBeVisible();
  const listened = await play.evaluate(async (el: HTMLAudioElement) => {
    el.muted = true;
    await el.play();
    const time = el.duration;
    el.pause();
    return time;
  });
  assert.ok(listened > 0);
  const render = changed.getByRole("button", { name: "确认渲染 MP4 与字幕" });
  await expect(render).toBeDisabled();
  const videoPath = cardPath(await getMid(changed));
  assert.equal(
    (
      await page.request.post(videoPath + "/jobs", {
        headers,
        data: { action: "render", audioJobId: audio1.id, confirmed: true },
      })
    ).status(),
    409,
  );
  assert.ok(
    !(
      await page.request.post(videoPath + "/jobs", {
        headers,
        data: { action: "render", audioJobId: auto.id, confirmed: false },
      })
    ).ok(),
  );
  await changed.getByLabel("已核对本版画面、配音与时长").check();
  await render.click();
  const video = await queued("chat-film");
  if (hasOffice) {
    assert.equal(video.state, "succeeded", video.error);
    await page.reload();
    const film = changed.locator("video");
    await expect(film).toBeVisible();
    const mp4 = changed.getByRole("link", { name: "下载 MP4" }),
      srt = changed.getByRole("link", { name: "下载 SRT" });
    for (const [link, file] of [
      [mp4, "paper-bridge.mp4"],
      [srt, "paper-bridge.srt"],
    ]) {
      const r = await page.request.get(
        base + (await link.getAttribute("href")),
      );
      assert.equal(r.status(), 200);
      writeFileSync(join(out, file), await r.body());
    }
    const result = JSON.parse(video.result);
    assert.equal(result.frames, 6);
    assert.ok(Math.abs(result.duration - take2.duration) < 0.01);
    assert.equal(
      readFileSync(join(out, "paper-bridge.srt"), "utf8").split(" --> ")
        .length - 1,
      6,
    );
    const duration = await film.evaluate(async (el: HTMLVideoElement) => {
      el.muted = true;
      await el.play();
      const d = el.duration;
      el.pause();
      return d;
    });
    assert.ok(Math.abs(duration - take2.duration) < 0.2);
    const slideId = D.parse(
      D.get("SELECT context FROM messages WHERE id=?", await getMid(changed))
        .context,
    ).adaptation.slideId;
    await compareMovie(
      page,
      base + "/api/conversations/" + cid + "/artifacts/" + slideId + "/pages/",
      out,
      take2,
    );
    await changed.screenshot({ path: join(out, "narrated-video.png") });
  } else {
    assert.equal(video.state, "failed");
    await expect(
      changed.getByRole("button", { name: "重试此步骤" }),
    ).toBeVisible();
  }
  // Editing just one page must require one new synthesis and keep earlier receipts and films intact.
  await changed
    .getByLabel("本页讲稿")
    .fill("先把书间距量到十二厘米，再开始测量。");
  await changed.getByRole("button", { name: "保存为新版讲稿" }).click();
  const edited = await queued("explore");
  assert.equal(edited.state, "succeeded", edited.error);
  const third = videos.nth(2);
  await expect(third.getByText(/需合成 1 段/)).toBeVisible();
  await third.getByRole("button", { name: "确认配音用量并试听" }).click();
  const audio3 = await queued("chat-narration");
  assert.equal(audio3.state, "succeeded", audio3.error);
  assert.equal(model.calls.length, 7);
  await third.getByRole("button", { name: "查看上一版讲稿" }).click();
  await expect(changed.locator("xpath=ancestor::article[1]")).toBeFocused();
  assert.equal(model.counts().scripts, 1);
  await expect(page).toHaveURL(url);
  const other = await page.context().browser().newContext();
  try {
    const username = "second-creator",
      password = "Example-course-Test-2026!";
    assert.ok(
      (
        await page.request.post(base + "/api/auth/users", {
          headers,
          data: {
            username,
            displayName: "隔离检查",
            role: "creator",
            password,
          },
        })
      ).ok(),
    );
    let token = (await (await other.request.get(base + "/api/session")).json())
      .csrf;
    const login = await other.request.post(base + "/api/auth/login", {
      headers: { "x-csrf-token": token },
      data: { username, password },
    });
    assert.ok(login.ok());
    token = (await login.json()).csrf;
    const updated = await other.request.post(base + "/api/auth/password", {
      headers: { "x-csrf-token": token },
      data: { currentPassword: password, newPassword: password + "v2" },
    });
    assert.ok(updated.ok());
    token = (await updated.json()).csrf;
    const protectedUrls = [
      videoPath,
      articlePath,
      base + "/api/assets/" + take2.wav.assetId,
      base + "/api/assets/" + take2.timeline[2].audioAssetId,
      base + "/api/jobs/" + auto.id,
    ];
    if (hasOffice)
      for (const f of JSON.parse(video.result).artifacts)
        protectedUrls.push(base + "/api/artifacts/" + f.id + "/download");
    for (const u of protectedUrls)
      assert.ok([403, 404].includes((await other.request.get(u)).status()), u);
    assert.equal(
      (
        await other.request.post(videoPath + "/jobs", {
          headers: { "x-csrf-token": token },
          data: { action: "listen", confirmed: true },
        })
      ).status(),
      403,
    );
  } finally {
    await other.close();
  }

  assert.equal(
    D.get(
      "SELECT count(*) n FROM artifacts WHERE format='mp4' AND target_id=?",
      cid,
    ).n,
    hasOffice ? 1 : 0,
  );
  writeFileSync(
    join(out, "derivatives-evidence.json"),
    JSON.stringify(
      {
        model: "HTTP fixture",
        voice:
          process.env.ECUSTUDIO_QA_MAC_SPEECH === "1"
            ? "macOS Tingting through injected TTS transport"
            : "synthetic PCM",
        wechat: "local HTTP fixture",
        articleGenerations: 1,
        scriptGenerations: 1,
        ttsCalls: 7,
        remoteAdds: 1,
        originalPages: 6,
        seconds: take2.duration,
        rendered: hasOffice,
        unchangedAudioPages: [1, 2, 4, 5, 6],
      },
      null,
      2,
    ),
  );
}

async function compareMovie(
  page: any,
  slideUrl: string,
  out: string,
  take: any,
) {
  const { ffmpegPath } = await import("../server/visual-runtime.js");
  const file = join(out, "paper-bridge.mp4");
  const decode = (args: string[], input?: Buffer) =>
    execFileSync(ffmpegPath(), ["-v", "error", ...args], {
      input,
      timeout: 30000,
      maxBuffer: 24 * 1024 * 1024,
    });
  const thumb = [
    "-frames:v",
    "1",
    "-vf",
    "scale=240:135",
    "-pix_fmt",
    "gray",
    "-f",
    "rawvideo",
    "pipe:1",
  ];
  const srt = readFileSync(join(out, "paper-bridge.srt"), "utf8")
    .trim()
    .split(/\r?\n\r?\n/);
  const time = (s: number) =>
    new Date(Math.round(s * 1000))
      .toISOString()
      .slice(11, 23)
      .replace(".", ",");
  const reference: Buffer[] = [],
    actual: Buffer[] = [];
  for (const [i, c] of take.timeline.entries()) {
    const png = await page.request.get(slideUrl + c.page);
    assert.ok(png.ok());
    reference.push(decode(["-i", "pipe:0", ...thumb], await png.body()));
    actual.push(
      decode(["-ss", String((c.start + c.end) / 2), "-i", file, ...thumb]),
    );
    assert.equal(
      srt[i],
      [String(c.page), time(c.start) + " --> " + time(c.audioEnd), c.text].join(
        "\n",
      ),
    );
  }
  for (const [i, frame] of actual.entries()) {
    const distances = reference.map((ref) => {
      assert.equal(ref.length, frame.length);
      let diff = 0;
      for (let k = 0; k < frame.length; k++)
        diff += Math.abs(frame[k] - ref[k]);
      return diff / frame.length;
    });
    assert.equal(
      distances.indexOf(Math.min(...distances)),
      i,
      "every scene must show its own original slide",
    );
    assert.ok(distances[i] < 5);
  }
  const pcm = decode([
    "-i",
    file,
    "-map",
    "0:a:0",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-f",
    "s16le",
    "pipe:1",
  ]);
  assert.ok(Math.abs(pcm.length / 32000 - take.duration) < 0.2);
  for (const c of take.timeline) {
    let power = 0;
    const start = Math.round(c.start * 16000),
      end = Math.round(c.audioEnd * 16000);
    for (let i = start; i < end; i += 4) power += pcm.readInt16LE(i * 2) ** 2;
    assert.ok(
      power / ((end - start) / 4) > 100,
      "every narrated scene must decode audible samples",
    );
  }
}
