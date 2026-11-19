import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { setupInjected, testAccount } from "./auth-helper.js";
import { wechatFixture } from "./wechat-fixture.js";
mkdirSync("test-results", { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  join(process.cwd(), "test-results/wechat-api-"),
);
const D = await import("../server/db.js"),
  A = await import("../server/domain.js"),
  M = await import("../server/media-access.js"),
  W = await import("../server/wechat.js"),
  T = await import("../server/tasks.js"),
  S = await import("../server/secrets.js"),
  { buildApp } = await import("../server/app.js");
const fixture = await wechatFixture(),
  app = await buildApp(false, {}, undefined, fixture.client, fixture.secrets),
  auth = await setupInjected(app),
  headers = {
    host: "localhost",
    cookie: auth.cookie,
    "x-csrf-token": auth.csrf,
  };
const req = (method: any, url: string, payload?: any, h = headers) =>
  app.inject({ method, url, payload, headers: h });
const admin = D.get("SELECT * FROM users WHERE role='admin'");
let connection: any, preview: any, draft: any, note: any;
async function newDraft(title = "公众号流程测试") {
  const n = (
    await req("POST", "/api/notes", {
      title,
      body: "## 课堂观察\n学生观察叶片十分钟，再分组讨论十五分钟。\n\n这是合成测试内容。",
    })
  ).json();
  const p = (
    await req("POST", `/api/notes/${n.id}/wechat-preview`, {
      revision: n.revision,
    })
  ).json();
  assert.ok(p.id, JSON.stringify(p));
  const d = (
    await req("POST", "/api/wechat/drafts", {
      previewId: p.id,
      accountId: connection.id,
    })
  ).json();
  assert.ok(d.id, JSON.stringify(d));
  return { n, p, d };
}
async function execute(d: any) {
  const row = D.get("SELECT * FROM wechat_drafts WHERE id=?", d.id);
  return W.runWechatDraft(
    { draftId: d.id, actorId: row.owner_id },
    row.job_id,
    () => {},
    new AbortController().signal,
    fixture.client,
    fixture.secrets,
  );
}
test("连接失败有白名单引导且不泄露密钥，成功后只返回安全状态", async () => {
  fixture.state.rejectToken = 40164;
  let r = await req("POST", "/api/settings/wechat/connect", {
    name: "测试教育号",
    appId: "wx0123456789abcdef",
    secret: "Synthetic-secret-for-tests",
  });
  assert.equal(r.statusCode, 422);
  assert.match(r.body, /IP 白名单/);
  assert.match(r.body, /203.0.113.9/);
  assert.ok(!r.body.includes("MUST_NOT_LEAK"));
  fixture.state.rejectToken = 0;
  r = await req("POST", "/api/settings/wechat/connect", {
    name: "测试教育号",
    appId: "wx0123456789abcdef",
    secret: "Synthetic-secret-for-tests",
  });
  assert.equal(r.statusCode, 200, r.body);
  connection = r.json();
  assert.equal(connection.connected, true);
  assert.ok(!r.body.includes("secret"));
  assert.ok(!r.body.includes("app_id"));
  fixture.state.expireOnce = true;
  assert.equal(
    (await req("POST", "/api/settings/wechat/test")).statusCode,
    200,
  );
});
test("知识库配图→冻结预览→自动封面→草稿→回读；重复提交不创建第二篇", async () => {
  const canvas = createCanvas(900, 600);
  canvas.getContext("2d").fillRect(0, 0, 900, 600);
  const a = A.asset(canvas.toBuffer("image/png"), "课堂.png", "image/png");
  M.grantMediaAsset(a.id, admin.id);
  note = (
    await req("POST", "/api/notes", {
      title: "叶片观察教学",
      body: `## 观察安排\n观察十分钟，然后讨论十五分钟。\n\n![课堂配图](/api/assets/${a.id})`,
    })
  ).json();
  const r = await req("POST", `/api/notes/${note.id}/wechat-preview`, {
    revision: note.revision,
  });
  assert.equal(r.statusCode, 200, r.body);
  preview = r.json();
  assert.equal(preview.images.length, 2);
  assert.ok(preview.summary);
  assert.ok(preview.cover.id);
  assert.ok(
    A.assetBuffer(preview.assetId)
      .data.toString()
      .includes("data:image/jpeg;base64,"),
  );
  draft = (
    await req("POST", "/api/wechat/drafts", {
      previewId: preview.id,
      accountId: connection.id,
    })
  ).json();
  await execute(draft);
  assert.equal(
    (await req("GET", "/api/wechat/drafts/" + draft.id)).json().state,
    "saved",
  );
  assert.equal(
    (
      await req("POST", "/api/wechat/drafts", {
        previewId: preview.id,
        accountId: connection.id,
      })
    ).json().id,
    draft.id,
  );
  await execute(draft);
  assert.equal(fixture.articles.size, 1);
  const sent = fixture.calls.find((x) => x.path.endsWith("/draft/add"))!.body
    .articles[0];
  assert.ok(sent.content.includes("mmbiz.qpic.cn"));
  assert.ok(!sent.content.includes("/api/assets/"));
  assert.ok(
    fixture.calls
      .filter((x) => x.path.includes("uploadimg"))
      .every((x) => x.body.jpeg),
  );
  assert.equal(
    (
      await req("POST", `/api/notes/${note.id}/wechat-preview`, {
        revision: note.revision,
      })
    ).json().id,
    preview.id,
  );
});
test("断网但微信已保存：重试查找并回读，绝不重复新增", async () => {
  const { d } = await newDraft("收到草稿后断网");
  fixture.state.dropAdd = true;
  await assert.rejects(execute(d));
  assert.equal(
    D.get("SELECT state FROM wechat_drafts WHERE id=?", d.id).state,
    "unknown",
  );
  const count = fixture.articles.size;
  await execute(d);
  assert.equal(fixture.articles.size, count);
  assert.equal(
    D.get("SELECT state FROM wechat_drafts WHERE id=?", d.id).state,
    "saved",
  );
});
test("无回执且未找到：保留待确认；必须明确确认才允许再次创建", async () => {
  const { d } = await newDraft("未收到草稿时断网");
  fixture.state.dropWithoutSave = true;
  await assert.rejects(execute(d));
  const before = fixture.calls.filter((x) =>
    x.path.endsWith("/draft/add"),
  ).length;
  await assert.rejects(execute(d));
  assert.equal(
    fixture.calls.filter((x) => x.path.endsWith("/draft/add")).length,
    before,
  );
  D.run(
    "UPDATE jobs SET state='failed' WHERE id=(SELECT job_id FROM wechat_drafts WHERE id=?)",
    d.id,
  );
  assert.equal(
    (
      await req("POST", "/api/wechat/drafts/" + d.id + "/retry", {
        confirmedAbsent: true,
      })
    ).statusCode,
    200,
  );
  await execute(d);
  assert.equal(
    fixture.calls.filter((x) => x.path.endsWith("/draft/add")).length,
    before + 1,
  );
});
test("有草稿编号后回读失败或内容不符，仅恢复回读，不再上传或新增", async () => {
  const { d } = await newDraft("读取回执失败");
  fixture.state.failGet = true;
  await assert.rejects(execute(d));
  const count = fixture.calls.length;
  assert.equal(
    D.get("SELECT state FROM wechat_drafts WHERE id=?", d.id).state,
    "verifying",
  );
  fixture.state.failGet = false;
  fixture.state.badGet = true;
  await assert.rejects(execute(d));
  fixture.state.badGet = false;
  await execute(d);
  assert.ok(
    fixture.calls.slice(count).every((c) => c.path.endsWith("/draft/get")),
  );
});
test("已知微信拒绝可重试；断开/换号/笔记更新不能悄悄发送", async () => {
  const { d, n } = await newDraft("明确拒绝测试");
  fixture.state.rejectAdd = 45009;
  await assert.rejects(execute(d));
  assert.equal(
    D.get("SELECT state FROM wechat_drafts WHERE id=?", d.id).state,
    "failed",
  );
  fixture.state.rejectAdd = 0;
  await execute(d);
  const next = await newDraft("版本检查");
  await req("PATCH", "/api/notes/" + next.n.id, {
    revision: next.n.revision,
    title: next.n.title,
    body: "新版本正文",
  });
  const before = fixture.calls.length;
  await assert.rejects(execute(next.d));
  assert.equal(fixture.calls.length, before);
  const pending = await newDraft("断开后恢复");
  await req("POST", "/api/settings/wechat/disconnect");
  await assert.rejects(execute(pending.d));
  assert.equal(fixture.calls.length, before);
  const c = (
    await req("POST", "/api/settings/wechat/connect", {
      name: "测试教育号",
      appId: "wx0123456789abcdef",
      secret: "Synthetic-secret-for-tests",
    })
  ).json();
  assert.equal(c.id, connection.id);
  await execute(pending.d);
  assert.equal(
    (
      await req("POST", "/api/wechat/drafts", {
        previewId: preview.id,
        accountId: "other",
      })
    ).statusCode,
    409,
  );
});
test("管理员/创作者/业务员权限，私有笔记、预览、任务、封面、草稿隔离", async () => {
  const manuscriptId=D.id(),content={title:"私有草稿",body:"正文",palette:"green",summary:"",coverAssetId:""};
  assert.equal((await req("PUT","/api/wechat/manuscripts/"+manuscriptId,{revision:0,content})).statusCode,200);
  for (const role of ["creator", "sales"]) {
    const uid = D.id();
    D.run(
      "INSERT INTO users(id,username,display_name,role,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      uid,
      role,
      role,
      role,
      admin.password_hash,
      D.now(),
      D.now(),
    );
    const session = await app.inject({
        url: "/api/session",
        headers: { host: "localhost" },
      }),
      login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: {
          host: "localhost",
          cookie: String(session.headers["set-cookie"]).split(";")[0],
          "x-csrf-token": session.json().csrf,
        },
        payload: { username: role, password: testAccount.password },
      });
    const h = {
      host: "localhost",
      cookie: String(login.headers["set-cookie"]).split(";")[0],
      "x-csrf-token": login.json().csrf,
    };
    const manuscript="/api/wechat/manuscripts/"+manuscriptId;
    assert.ok([403,404].includes((await req("GET",manuscript,undefined,h)).statusCode));
    assert.ok([403,404].includes((await req("GET",manuscript+"/layout?revision=1",undefined,h)).statusCode));
    assert.equal((await req("PUT",manuscript,{revision:1,content:{...content,body:"尝试更改"}},h)).statusCode,403);
    for (const url of [
      "/api/wechat/previews/" + preview.id,
      "/api/wechat/drafts/" + draft.id,
      "/api/jobs/" +
        D.get("SELECT job_id FROM wechat_drafts WHERE id=?", draft.id).job_id,
    ])
      assert.equal((await req("GET", url, undefined, h)).statusCode, 403, url);
    assert.equal(
      (await req("POST", "/api/settings/wechat/disconnect", {}, h)).statusCode,
      403,
    );
    assert.equal(
      (await req("GET", "/api/wechat/drafts", undefined, h)).statusCode,
      role === "sales" ? 403 : 200,
    );
    if (role === "creator") {
      const n = (
        await req(
          "POST",
          "/api/notes",
          { title: "我的文章", body: "我的教学记录。" },
          h,
        )
      ).json();
      assert.equal(
        (
          await req(
            "POST",
            `/api/notes/${n.id}/wechat-preview`,
            { revision: n.revision, coverAssetId: preview.cover.id },
            h,
          )
        ).statusCode,
        403,
      );
      const p = (
        await req(
          "POST",
          `/api/notes/${n.id}/wechat-preview`,
          { revision: n.revision },
          h,
        )
      ).json();
      const d = (
        await req(
          "POST",
          "/api/wechat/drafts",
          { previewId: p.id, accountId: connection.id },
          h,
        )
      ).json();
      await execute(d);
      assert.equal(
        (await req("GET", "/api/wechat/drafts/" + d.id, undefined, h)).json()
          .state,
        "saved",
      );
      const state = (await req("GET", "/api/state", undefined, h)).json();
      assert.ok(
        !state.jobs.some(
          (j: any) =>
            j.id ===
            D.get("SELECT job_id FROM wechat_drafts WHERE id=?", draft.id)
              .job_id,
        ),
      );
    }
  }
});
test("在编辑器继续冻结稿时保留原始版本，共用正在保存的回执", async()=>{
  const {n,p,d}=await newDraft("已有保存记录");
  const article=(await req("POST","/api/wechat/manuscripts/from-note",{noteId:n.id,previewId:p.id})).json();
  assert.equal(article.draft.id,d.id);
  const path="/api/wechat/manuscripts/"+article.id;
  const original=await req("POST",path+"/draft",{revision:1,accountId:connection.id,confirmed:true});
  assert.equal(original.json().id,d.id);
  const modified=(await req("PUT",path,{revision:1,content:{...article.content,body:"编辑器中的新正文"}})).json();
  const result=await req("POST",path+"/draft",{revision:modified.revision,accountId:connection.id,confirmed:true});
  assert.equal(result.statusCode,409);assert.equal(result.json().error.code,"RECONCILE_FIRST");
  assert.equal(D.get("SELECT revision FROM notes WHERE id=?",n.id).revision,n.revision);
});

test("Windows 公众号密钥沿用本机加密，重开存储不会变成明文", {skip:process.platform!=="win32"}, async () => {
  const key = "wechat." + D.id(),
    secret = "Synthetic-encryption-test-only";
  await S.setSecret(key, secret);
  assert.equal(await S.getSecret(key), secret);
  assert.ok(
    !readFileSync(join(D.dataDir, "secrets.dpapi"), "utf8").includes(secret),
  );
});
after(async () => {
  await app.close();
  await fixture.close();
  D.db.close();
});
