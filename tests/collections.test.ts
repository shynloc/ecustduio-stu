import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { setupInjected, testAccount } from "./auth-helper.js";
mkdirSync("test-results", { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  join(process.cwd(), "test-results/collections-"),
);
const D = await import("../server/db.js"),
  { buildApp } = await import("../server/app.js"),
  { canAccess } = await import("../server/auth.js");
const app = await buildApp(false),
  auth = await setupInjected(app),
  user = D.get("SELECT * FROM users WHERE username=?", testAccount.username);
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
const send = async (method: any, url: string, payload?: any) => {
  const r = await request(method, url, payload);
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
};
let note: any;
test("分类迁移注册；标签增量不覆盖，文件夹计数和批量撤销保留正文版本", async () => {
  assert.ok(D.get("SELECT 1 FROM migrations WHERE version=10"));
  note = await send("POST", "/api/notes", {
    title: "教学观察",
    body: "课堂观察与实践活动。",
    categories: {
      folder: "教研",
      tags: ["原标签"],
      state: "organized",
      purposes: [],
    },
  });
  let list = await send("GET", "/api/collections/notes");
  assert.equal(list.total, 1);
  assert.equal(list.folders[0].count, 1);
  const op = await send("POST", "/api/collections/notes/batch", {
    ids: [note.id],
    action: "addTags",
    tags: ["新标签"],
  });
  list = await send(
    "GET",
    "/api/collections/notes?tags=" + encodeURIComponent("原标签"),
  );
  assert.deepEqual(list.items[0].collection.tags, ["原标签", "新标签"]);
  assert.equal(list.items[0].body, note.body);
  await send("POST", "/api/collections/notes/undo/" + op.operationId);
  list = await send("GET", "/api/collections/notes");
  assert.deepEqual(list.items[0].collection.tags, ["原标签"]);
  assert.ok(
    (await send("GET", "/api/notes/" + note.id + "/history")).length >= 2,
  );
});
test("文件夹层级禁止循环，删除文件夹不删除内容", async () => {
  const parent = await send("POST", "/api/collections/notes/folders", {
      name: "培训",
    }),
    child = await send("POST", "/api/collections/notes/folders", {
      name: "教师",
      parentId: parent.id,
    });
  assert.equal(
    (
      await request("PATCH", "/api/collections/notes/folders/" + parent.id, {
        parentId: child.id,
      })
    ).statusCode,
    422,
  );
  await send("POST", "/api/collections/notes/batch", {
    ids: [note.id],
    action: "move",
    folderId: child.id,
  });
  let r = await send("GET", "/api/collections/notes?folder=" + parent.id);
  assert.equal(r.total, 1);
  assert.equal(r.folders.find((f: any) => f.id === parent.id).count, 1);
  await send("DELETE", "/api/collections/notes/folders/" + child.id);
  r = await send("GET", "/api/collections/notes?folder=unfiled");
  assert.equal(r.total, 1);
  assert.equal((await send("GET", "/api/notes/" + note.id)).body, note.body);
});
test("筛选跨页选择冻结版本，冲突不能覆盖；回收站可恢复", async () => {
  const selection = await send("POST", "/api/collections/notes/selection", {});
  let n = await send("GET", "/api/notes/" + note.id);
  await send("PATCH", "/api/notes/" + note.id, {
    revision: n.revision,
    title: n.title,
    body: n.body + "新修订",
  });
  assert.equal(
    (
      await request("POST", "/api/collections/notes/batch", {
        selectionToken: selection.token,
        action: "trash",
      })
    ).statusCode,
    409,
  );
  const op = await send("POST", "/api/collections/notes/batch", {
    ids: [note.id],
    action: "trash",
  });
  assert.equal((await send("GET", "/api/collections/notes")).total, 0);
  assert.equal(
    (await send("GET", "/api/collections/notes?state=trash")).total,
    1,
  );
  await send("POST", "/api/collections/notes/undo/" + op.operationId);
  assert.equal((await send("GET", "/api/collections/notes")).total, 1);
});
test("搜索覆盖旧记录，分类和计数只含自己内容；业务员不能批量写入", async () => {
  D.tx(() => {
    for (let i = 0; i < 550; i++)
      D.run(
        "INSERT INTO notes(id,owner_id,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        "large-" + i,
        user.id,
        "资料 " + i,
        i === 0 ? "远处的白桦树" : "合成资料",
        "2020-01-01",
        "2020-01-01",
      );
  });
  const other = D.id();
  D.run(
    "INSERT INTO users(id,username,display_name,role,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
    other,
    "other",
    "其他创作者",
    "creator",
    user.password_hash,
    D.now(),
    D.now(),
  );
  D.run(
    "INSERT INTO notes(id,owner_id,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    "private-other",
    other,
    "其他人的秘密",
    "不可搜索到的白桦树",
    D.now(),
    D.now(),
  );
  const found = await send(
    "GET",
    "/api/collections/notes?q=" + encodeURIComponent("白桦树"),
  );
  assert.equal(found.total, 1);
  assert.equal(found.items[0].id, "large-0");
  assert.equal(found.counts.all, 551);
  assert.equal(
    (
      await request("POST", "/api/collections/notes/batch", {
        ids: ["private-other"],
        action: "trash",
      })
    ).statusCode,
    403,
  );
  assert.equal(
    canAccess("sales", "POST", "/api/collections/artifacts/batch"),
    false,
  );
  assert.equal(canAccess("sales", "GET", "/api/collections/notes"), false);
  assert.equal(canAccess("sales", "GET", "/api/collections/artifacts"), true);
});
test("对话消息全文可检索，归档不删除消息；偏好按账号保存", async () => {
  const c = await send("POST", "/api/conversations", { title: "课堂讨论" });
  D.run(
    "INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)",
    D.id(),
    c.id,
    "user",
    "火山岩样品",
    "[]",
    "{}",
    null,
    D.now(),
  );
  let r = await send(
    "GET",
    "/api/collections/conversations?q=" + encodeURIComponent("火山岩"),
  );
  assert.equal(r.total, 1);
  await send("POST", "/api/collections/conversations/batch", {
    ids: [c.id],
    action: "archive",
  });
  r = await send("GET", "/api/collections/conversations?state=archived");
  assert.equal(r.items[0].messageCount, 1);
  await send("PUT", "/api/workspace/preferences/collection-notes", {
    value: { view: "list", sidebar: false },
  });
  assert.deepEqual(
    (await send("GET", "/api/workspace/preferences/collection-notes")).value,
    { view: "list", sidebar: false },
  );
});
after(async () => {
  await app.close();
  D.db.close();
});
