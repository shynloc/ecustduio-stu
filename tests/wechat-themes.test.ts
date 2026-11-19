import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as cheerio from "cheerio";
import AdmZip from "adm-zip";
import { setupInjected } from "./auth-helper.js";
import { wechatFixture } from "./wechat-fixture.js";
import { wechatThemeIds, wechatRecipes } from "../shared/wechat-themes.js";
mkdirSync("test-results", { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  join(process.cwd(), "test-results/wechat-themes-"),
);
const D = await import("../server/db.js"),
  { wechatHtml } = await import("../server/wechat-export.js"),
  W = await import("../server/wechat.js"),
  { buildApp } = await import("../server/app.js");
const fixture = await wechatFixture(),
  app = await buildApp(false, {}, undefined, fixture.client, fixture.secrets),
  auth = await setupInjected(app);
const headers = {
  host: "localhost",
  cookie: auth.cookie,
  "x-csrf-token": auth.csrf,
};
const req = (method: any, url: string, payload?: any) =>
  app.inject({ method, url, payload, headers });
const admin = D.get("SELECT * FROM users WHERE role='admin'");
const body =
  '导读段落。\n\n## 课堂观察\n\n学生观察 **叶片**，记录颜色。\n\n> 先观察，再讨论。\n\n- 清单内容\n- [x] 已完成\n\n| 任务 | 分钟 |\n|---|---|\n| 观察 | 10 |\n\n```js\nconst minutes = 10;\n```\n\n---\n\n## 课堂总结\n\n[参考链接](https://example.com)\n\n<script>alert(1)</script><img src="https://tracker.invalid/image" onerror="alert(1)">';
const content = {
  title: "教学测试文章",
  body,
  palette: "acks-gold",
  summary: "内容摘要",
  coverAssetId: "",
  format: { recipe: "tutorial", size: 17, lineHeight: 2, indent: false },
};
let manuscript: any, connection: any;
test("43 款模板与 3 款旧主题：保留内容、任务标记、表格，导出无需外部 CSS", () => {
  assert.equal(wechatThemeIds.length, 46);
  for (const palette of wechatThemeIds) {
    const html = wechatHtml(
        {
          ...content,
          sources: [{ title: "合成测试来源", url: "https://example.com" }],
        },
        palette,
      ),
      $ = cheerio.load(html);
    assert.equal($("script,style,svg,iframe,input").length, 0, palette);
    assert.doesNotMatch(
      html,
      /var\(|onerror|tracker\.invalid|class=|data-profile|javascript:/,
      palette,
    );
    for (const text of [
      "课堂观察",
      "叶片",
      "先观察，再讨论。",
      "清单内容",
      "☑",
      "10",
      "const minutes = 10;",
      "课堂总结",
      "合成测试来源",
    ])
      assert.ok($.text().includes(text), palette + ": " + text);
    assert.equal($("table").length, 1, palette);
    assert.equal($("pre").length, 1, palette);
    assert.match($("section").first().attr("style")!, /font-size:/, palette);
    assert.ok(
      existsSync("public/wechat-themes/" + palette + "-preview.png"),
      palette,
    );
  }
  for (const recipe of Object.keys(wechatRecipes)) {
    const html = wechatHtml(
        {
          ...content,
          format: {
            recipe,
            size: 18,
            lineHeight: 2.2,
            indent: true,
            decorations: false,
          },
        },
        "acks-gold",
      ),
      $ = cheerio.load(html);
    assert.equal($("img").length, 0, recipe);
    assert.match(
      $("section>p")
        .filter((_, el) => $(el).text() === "导读段落。")
        .attr("style")!,
      /font-size:\s*18px/,
    );
    assert.match(
      $("section>p")
        .filter((_, el) => $(el).text() === "导读段落。")
        .attr("style")!,
      /text-indent:\s*2em/,
    );
  }
});
test("试用不保存；应用格式持久化；未连接复制有编号配图包", async () => {
  const aid = D.id(),
    saved = await req("PUT", "/api/wechat/manuscripts/" + aid, {
      revision: 0,
      content,
    });
  assert.equal(saved.statusCode, 200, saved.body);
  manuscript = saved.json();
  const path = "/api/wechat/manuscripts/" + aid;
  const preview = await req("POST", path + "/layout-preview", {
    revision: 1,
    palette: "acks-dark",
    format: { decorations: false },
  });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.deepEqual((await req("GET", path)).json().content, content);
  const copied = await req("POST", path + "/copy", { revision: 1 });
  assert.equal(copied.statusCode, 200, copied.body);
  assert.equal(copied.json().imagesReady, false);
  assert.equal(copied.json().imageCount, 2);
  assert.match(copied.json().html, /请插入配图 01/);
  assert.match(copied.json().html, /请插入配图 02/);
  assert.doesNotMatch(copied.json().html, /<img|data:image|ecustudio-theme:/);
  const zipReply = await req("GET", path + "/images?revision=1"),
    zip = new AdmZip(zipReply.rawPayload),
    files = zip.getEntries();
  assert.equal(files.length, 3);
  assert.ok(
    files
      .find((f) => f.entryName === "02-article-image.png")!
      .getData()
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  );
  assert.equal(
    (
      await req("POST", path + "/layout-preview", {
        revision: 0,
        palette: "acks-gold",
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await req("POST", path + "/layout-preview", {
        revision: 1,
        palette: "acks-gold",
        format: { size: 900 },
      })
    ).statusCode,
    400,
  );
  assert.equal(D.get("SELECT count(*) n FROM wechat_previews").n, 0);
});
test("连接后的复制将 JPEG/PNG 转存微信；缓存不重复传图，不创建草稿", async () => {
  connection = (
    await req("POST", "/api/settings/wechat/connect", {
      name: "合成主题测试",
      appId: "wx0123456789abcdef",
      secret: "Synthetic-theme-secret",
    })
  ).json();
  const path = "/api/wechat/manuscripts/" + manuscript.id;
  const copied = await req("POST", path + "/copy", {
    revision: 1,
    accountId: connection.id,
  });
  assert.equal(copied.statusCode, 200, copied.body);
  assert.equal(copied.json().imagesReady, true);
  const $ = cheerio.load(copied.json().html);
  assert.equal($("img").length, 2);
  $("img").each((_, el) =>
    assert.match($(el).attr("src")!, /^https:\/\/mmbiz\.qpic\.cn\//),
  );
  assert.doesNotMatch(
    copied.json().html,
    /data:image|ecustudio-theme:|\/api\/assets\//,
  );
  assert.ok(fixture.calls.some((x) => x.body.png));
  assert.ok(fixture.calls.some((x) => x.body.jpeg));
  const uploads = () =>
      fixture.calls.filter((x) => x.path.endsWith("uploadimg")).length,
    count = uploads();
  assert.equal(
    (
      await req("POST", path + "/copy", {
        revision: 1,
        accountId: connection.id,
      })
    ).statusCode,
    200,
  );
  assert.equal(uploads(), count);
  assert.equal(fixture.articles.size, 0);
  assert.equal(
    (
      await req("POST", path + "/copy", {
        revision: 1,
        accountId: "wrong-account",
      })
    ).statusCode,
    409,
  );
});
test("同一套主题进入冻结预览和远端草稿，装饰图保留 PNG", async () => {
  const n = (
    await req("POST", "/api/notes", { title: content.title, body })
  ).json();
  const p = await req("POST", "/api/notes/" + n.id + "/wechat-preview", {
    revision: n.revision,
    palette: "acks-gold",
    format: content.format,
  });
  assert.equal(p.statusCode, 200, p.body);
  const preview = p.json();
  assert.match(preview.previewHtml, /data:image\/png;base64,/);
  assert.deepEqual(preview.options.format, content.format);
  const draft = (
    await req("POST", "/api/wechat/drafts", {
      previewId: preview.id,
      accountId: connection.id,
    })
  ).json();
  const row = D.get("SELECT * FROM wechat_drafts WHERE id=?", draft.id);
  await W.runWechatDraft(
    { draftId: draft.id, actorId: admin.id },
    row.job_id,
    () => {},
    new AbortController().signal,
    fixture.client,
    fixture.secrets,
  );
  assert.equal(
    D.get("SELECT state FROM wechat_drafts WHERE id=?", draft.id).state,
    "saved",
  );
  const sent = fixture.calls.find((x) => x.path.endsWith("/draft/add"))!.body
    .articles[0].content;
  assert.match(sent, /mmbiz.qpic.cn/);
  assert.match(sent, /课堂观察/);
  assert.doesNotMatch(sent, /ecustudio-theme:|var\(|<svg/);
  // A user-supplied cover is included once, not duplicated by the export renderer.
  const layout = await W.articleLayout(
    { ...content, coverAssetId: preview.cover.id },
    { ...content, coverAssetId: preview.cover.id },
    admin,
  );
  assert.equal(cheerio.load(layout.html)("img").length, 2);
});
test("图片转存期间文章发生修改，拒绝复制过时版本", async () => {
  const aid = D.id(),
    changed = { ...content, title: "转存中修订测试" };
  await req("PUT", "/api/wechat/manuscripts/" + aid, {
    revision: 0,
    content: changed,
  });
  const original = fixture.client.image.bind(fixture.client);
  fixture.client.image = async (...args: any[]) => {
    const result = await (original as any)(...args);
    D.run("UPDATE wechat_manuscripts SET revision=revision+1 WHERE id=?", aid);
    return result;
  };
  try {
    const result = await req(
      "POST",
      "/api/wechat/manuscripts/" + aid + "/copy",
      { revision: 1, accountId: connection.id },
    );
    assert.equal(result.statusCode, 409, result.body);
    assert.doesNotMatch(result.body, /mmbiz.qpic.cn|Synthetic-theme-secret/);
  } finally {
    fixture.client.image = original;
  }
});
after(async () => {
  await app.close();
  await fixture.close();
  D.db.close();
});
