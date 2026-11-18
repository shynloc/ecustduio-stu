import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { setupInjected, loginInjected, testAccount } from "./auth-helper.js";
mkdirSync("test-results", { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  join(process.cwd(), "test-results/accounts-"),
);
const D = await import("../server/db.js"),
  { buildApp } = await import("../server/app.js"),
  E = await import("../server/explore.js"),
  domain = await import("../server/domain.js"),
  tasks = await import("../server/tasks.js");
const app = await buildApp(false),
  host = "localhost";
let admin: any, creator: any, sales: any, other: any;
const users: any = {};
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
      host,
      ...(session
        ? { cookie: session.cookie, "x-csrf-token": session.csrf }
        : {}),
      ...headers,
    },
  });
async function anonymous() {
  const s = await request(null, "GET", "/api/session");
  return {
    cookie: String(s.headers["set-cookie"]).split(";")[0],
    csrf: s.json().csrf,
  };
}
async function login(username: string, password: string) {
  const s = await anonymous(),
    r = await request(s, "POST", "/api/auth/login", { username, password });
  assert.equal(r.statusCode, 200, r.body);
  return {
    cookie: String(r.headers["set-cookie"]).split(";")[0],
    csrf: r.json().csrf,
    user: r.json().user,
  };
}
async function create(role: string, name: string) {
  const r = await request(admin, "POST", "/api/auth/users", {
    username: name,
    displayName: name,
    role,
    password: "Initial-test-password!",
  });
  assert.equal(r.statusCode, 200, r.body);
  users[name] = r.json();
  let s = await login(name, "Initial-test-password!");
  assert.equal(
    (await request(s, "GET", "/api/state")).json().error.code,
    "PASSWORD_CHANGE_REQUIRED",
  );
  const changed = await request(s, "POST", "/api/auth/password", {
    currentPassword: "Initial-test-password!",
    newPassword: "Personal-test-password!",
  });
  assert.equal(changed.statusCode, 200, changed.body);
  return {
    cookie: String(changed.headers["set-cookie"]).split(";")[0],
    csrf: changed.json().csrf,
    user: changed.json().user,
  };
}
after(async () => {
  await app.close();
  D.db.close();
});
test("首次初始化、登录、密码哈希、CSRF和重开会话", async () => {
  assert.equal((await request(null, "GET", "/api/state")).statusCode, 401);
  const anon = await anonymous();
  assert.equal((await request(anon, "GET", "/api/state")).statusCode, 401);
  assert.equal(
    (
      await request(anon, "POST", "/api/auth/setup", testAccount, {
        "x-csrf-token": "",
      })
    ).statusCode,
    403,
  );
  admin = await setupInjected(app);
  admin.user = (await request(admin, "GET", "/api/state")).json().user;
  assert.equal(
    (await request(anon, "POST", "/api/auth/setup", testAccount)).statusCode,
    409,
  );
  const stored = D.get("SELECT * FROM users WHERE id=?", admin.user.id);
  assert.match(stored.password_hash, /^scrypt\$/);
  assert.ok(!stored.password_hash.includes(testAccount.password));
  assert.equal(
    (
      await request(anon, "POST", "/api/auth/login", {
        username: testAccount.username,
        password: "wrong-password",
      })
    ).json().error.code,
    "LOGIN_FAILED",
  );
  D.db.close();
  D.reopenDatabase();
  assert.equal((await request(admin, "GET", "/api/state")).statusCode, 200);
  const persistent = await app.inject({
    url: "/api/session",
    headers: { host, cookie: admin.cookie },
  });
  assert.equal(persistent.json().user.id, admin.user.id);
  assert.equal(persistent.headers["set-cookie"], undefined);
});
test("创建三角色、首次改密、全局接口与只读数据权限", async () => {
  creator = await create("creator", "creator-test");
  sales = await create("sales", "sales-test");
  other = await create("creator", "another-creator");
  for (const [method, path] of [
    ["GET", "/api/auth/users"],
    ["POST", "/api/auth/users"],
    ["PUT", "/api/settings"],
    ["PATCH", "/api/settings/deepseek"],
    ["POST", "/api/secrets"],
    ["POST", "/api/sources"],
    ["POST", "/api/backups"],
    ["POST", "/api/restore/validate"],
    ["POST", "/api/notifications/preview"],
    ["POST", "/api/skills/rescan"],
  ])
    assert.equal(
      (await request(creator, method, path, method === "GET" ? undefined : {}))
        .statusCode,
      403,
      path,
    );
  for (const [method, path] of [
    ["POST", "/api/imports"],
    ["POST", "/api/claims"],
    ["POST", "/api/projects"],
    ["POST", "/api/agent/runs"],
    ["POST", "/api/monitor"],
    ["POST", "/api/notes"],
    ["GET", "/api/conversations"],
    ["GET", "/api/projects/anything"],
    ["POST", "/api/exports"],
    ["GET", "/api/jobs/anything"],
    ["PATCH", "/api/settings/theme"],
  ])
    assert.equal(
      (await request(sales, method, path, method === "GET" ? undefined : {}))
        .statusCode,
      403,
      path,
    );
  const state = (await request(sales, "GET", "/api/state")).json();
  assert.deepEqual(state.projects, []);
  assert.deepEqual(state.jobs, []);
  assert.deepEqual(state.backups, []);
  assert.deepEqual(state.capabilities, {});
  const cfg = D.settings();
  assert.equal(
    (
      await request(creator, "PATCH", "/api/settings/theme", {
        revision: cfg.revision,
        theme: "obsidian",
      })
    ).statusCode,
    200,
  );
});
let note: any, conversation: any, snapshot: any;
const scope = {
  region: "北京",
  district: "全市",
  stage: "中考",
  year: 2027,
  audience: "隔离测试",
};
test("笔记私有隔离、冲突保护、笔记载入素材与不可变版本", async () => {
  const r = await request(creator, "POST", "/api/notes", {
    title: "报名整理笔记",
    body: "隔离测试笔记：中考报名需要核对原始通知和各区实际报名条件。",
  });
  assert.equal(r.statusCode, 200, r.body);
  note = r.json();
  assert.equal(
    (await request(other, "GET", "/api/notes/" + note.id)).statusCode,
    403,
  );
  assert.equal((await request(other, "GET", "/api/notes")).json().length, 0);
  const edited = await request(creator, "PATCH", "/api/notes/" + note.id, {
    title: note.title,
    body: note.body + "本内容只是创作素材，尚未核实。",
    revision: note.revision,
  });
  assert.equal(edited.statusCode, 200);
  note = edited.json();
  assert.equal(
    (
      await request(creator, "PATCH", "/api/notes/" + note.id, {
        title: note.title,
        body: note.body,
        revision: 1,
      })
    ).statusCode,
    409,
  );
  const m = await request(
    creator,
    "POST",
    "/api/notes/" + note.id + "/material",
    { revision: note.revision, scope, newProjectTitle: "笔记素材项目" },
  );
  assert.equal(m.statusCode, 200, m.body);
  snapshot = domain.snapshotView(
    D.get("SELECT * FROM snapshots WHERE id=?", m.json().snapshotId),
  );
  assert.equal(snapshot.document_type, "媒体解读");
  assert.equal(snapshot.published, null);
  assert.match(snapshot.body, /待核实/);
  assert.ok(
    domain
      .projectView(
        D.get("SELECT * FROM projects WHERE id=?", m.json().projectId),
      )
      .snapshotIds.includes(snapshot.id),
  );
  assert.equal(
    (await request(sales, "GET", "/api/snapshots/" + snapshot.id)).statusCode,
    200,
  );
  const original = snapshot.body;
  await request(creator, "PATCH", "/api/notes/" + note.id, {
    title: note.title,
    body: note.body + "后来新增的一条笔记内容。",
    revision: note.revision,
  });
  assert.equal(
    D.get("SELECT body FROM snapshots WHERE id=?", snapshot.id).body,
    original,
  );
  const current = (
    await request(creator, "GET", "/api/notes/" + note.id)
  ).json();
  note = current;
  const again = await request(
    creator,
    "POST",
    "/api/notes/" + note.id + "/material",
    { revision: note.revision, scope },
  );
  assert.equal(again.statusCode, 200);
  assert.notEqual(again.json().snapshotId, snapshot.id);
  assert.equal(
    (
      await request(creator, "POST", "/api/notes/" + note.id + "/material", {
        revision: note.revision,
        scope: { ...scope, year: 2028 },
      })
    ).statusCode,
    409,
  );
});
test("本地检索覆盖政策和本人笔记，排除他人私有笔记", () => {
  const local = E.searchLocal("中考报名条件", creator.user);
  assert.ok(local.some((s) => s.snapshotId));
  assert.ok(local.some((s) => s.noteId === note.id));
  const foreign = E.searchLocal("中考报名条件", other.user);
  assert.ok(!foreign.some((s) => s.noteId === note.id));
});
test("对话归属、冻结笔记版本、排队幂等和跨账号任务隔离", async () => {
  process.env.DEEPSEEK_API_KEY = "isolated-test-only";
  const cfg = D.settings();
  D.run(
    "UPDATE settings SET body=? WHERE id=1",
    D.json({ ...cfg, allowExternalAI: true }),
  );
  conversation = (
    await request(creator, "POST", "/api/conversations", {})
  ).json();
  assert.equal(
    (await request(other, "GET", "/api/conversations/" + conversation.id))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await request(
        other,
        "POST",
        "/api/conversations/" + conversation.id + "/messages",
        { prompt: "搜索报名条件" },
      )
    ).statusCode,
    403,
  );
  const body = {
      prompt: "整理中考报名条件并引用来源",
      mode: "local",
      noteIds: [note.id],
    },
    r = await request(
      creator,
      "POST",
      "/api/conversations/" + conversation.id + "/messages",
      body,
      { "idempotency-key": "same" },
    );
  assert.equal(r.statusCode, 202, r.body);
  const job = D.get("SELECT * FROM jobs WHERE id=?", r.json().id);
  const frozen = D.parse(job.input);
  assert.equal(frozen.notes[0].revision, note.revision);
  assert.equal(
    (
      await request(
        creator,
        "POST",
        "/api/conversations/" + conversation.id + "/messages",
        body,
        { "idempotency-key": "same" },
      )
    ).json().id,
    job.id,
  );
  assert.equal(
    (
      await request(
        creator,
        "POST",
        "/api/conversations/" + conversation.id + "/messages",
        { ...body, prompt: "新问题" },
        { "idempotency-key": "same" },
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await request(
        creator,
        "POST",
        "/api/conversations/" + conversation.id + "/messages",
        body,
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (await request(other, "GET", "/api/jobs/" + job.id)).statusCode,
    403,
  );
  assert.equal(
    (await request(other, "POST", "/api/jobs/" + job.id + "/cancel", {}))
      .statusCode,
    403,
  );
  assert.ok(
    !(await request(other, "GET", "/api/state"))
      .json()
      .jobs.some((j) => j.id === job.id),
  );
  tasks.cancelJob(job.id);
  assert.equal(
    D.get("SELECT state FROM jobs WHERE id=?", job.id).state,
    "canceled",
  );
});
test("实际Agent协议：本地+联网只读工具、来源引用、回答存笔记与幂等", async () => {
  const input = E.freezeExplore(
    {
      conversationId: conversation.id,
      prompt: "中考报名要求",
      mode: "both",
      webEngine: "controlled",
      noteIds: [note.id],
    },
    creator.user,
  );
  const search = async (url: any, opts: any) => {
    assert.match(String(url), /v1\/tools\/search$/);
    assert.equal(JSON.parse(opts.body).need_content, true);
    return Response.json({
      results: [
        {
          title: "官方招生示例",
          url: "https://www.bjeea.cn/example.html",
          content: "测试服务返回的报名说明，用于验证工具协议，不是实际政策。",
        },
        {
          title: "恶意内网",
          url: "http://127.0.0.1/private",
          content: "should reject",
        },
      ],
    });
  };
  let count = 0;
  const model = async (_url: any, opts: any) => {
    const b = JSON.parse(opts.body);
    if (count++ === 0) {
      return Response.json({
        choices: [
          {
            message: {
              role: "assistant",
              tool_calls: [
                {
                  id: "t1",
                  type: "function",
                  function: {
                    name: "search_local",
                    arguments: JSON.stringify({ query: "报名条件" }),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 8, completion_tokens: 3 },
      });
    }
    assert.ok(b.messages.some((m) => m.role === "tool"));
    return Response.json({
      choices: [
        {
          message: {
            content:
              "依据已选笔记整理报名要求，仍需核验[S1]。网络示例仅用于测试[S3]。",
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 6 },
    });
  };
  // Retrieve actual registry IDs so the synthetic model never relies on an invented citation.
  const goodModel = async (url: any, opts: any) => {
    const b = JSON.parse(opts.body);
    if (count === 0) return model(url, opts);
    const seeded = JSON.parse(
      b.messages.find((m) => m.role === "user" && m.content.startsWith("{"))
        .content,
    ).retrievedSources;
    const web = seeded.find((s) => s.kind === "web");
    return Response.json({
      choices: [
        {
          message: {
            content: `依据笔记整理报名要求，仍需核验[S1]。测试网络材料也需核验[${web.id}]。`,
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 6 },
    });
  };
  const result = await E.runExplore(
    input,
    () => {},
    new AbortController().signal,
    goodModel as any,
    search as any,
  );
  assert.ok(result.sources.some((s) => s.kind === "web"));
  assert.ok(!result.sources.some((s) => s.url?.includes("127.0.0.1")));
  assert.ok(result.tools.some((t) => t.name === "search_local"));
  const job = tasks.enqueue("explore", input);
  const committed = E.commitExplore(input, result, job.id);
  const second = E.commitExplore(input, result, job.id);
  assert.equal(second.messageId, committed.messageId);
  const n = await request(creator, "POST", "/api/notes/from-message", {
    messageId: committed.messageId,
  });
  assert.equal(n.statusCode, 200, n.body);
  assert.ok(!n.json().title.includes("\n"));
  assert.ok(n.json().sources.some((s) => s.kind === "web"));
  assert.equal(
    (
      await request(creator, "POST", "/api/notes/from-message", {
        messageId: committed.messageId,
      })
    ).json().id,
    n.json().id,
  );
  assert.equal(
    (
      await request(other, "POST", "/api/notes/from-message", {
        messageId: committed.messageId,
      })
    ).statusCode,
    403,
  );
  D.run("UPDATE jobs SET state='succeeded' WHERE id=?", job.id);
});
test("联网失败明确呈现，范围越权与不存在的来源编号拒绝", async () => {
  const input = E.freezeExplore(
    {
      conversationId: conversation.id,
      prompt: "报名条件",
      mode: "both",
      webEngine: "controlled",
      noteIds: [],
    },
    creator.user,
  );
  const web = async () => new Response("", { status: 503 });
  const answer = async () =>
    Response.json({
      choices: [
        {
          message: {
            content: "本地资料提供了报名线索[S1]，联网暂时不可用，尚需核验。",
          },
        },
      ],
    });
  const result = await E.runExplore(
    input,
    () => {},
    new AbortController().signal,
    answer as any,
    web as any,
  );
  assert.ok(result.warnings.some((w) => w.includes("503")));
  const bad = async () =>
    Response.json({ choices: [{ message: { content: "捏造来源[S999]" } }] });
  await assert.rejects(
    E.runExplore(
      input,
      () => {},
      new AbortController().signal,
      bad as any,
      web as any,
    ),
    /请求上限/,
  );
  const local = { ...input, mode: "local" };
  const forbidden = async () =>
    Response.json({
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: "t",
                type: "function",
                function: {
                  name: "read_web",
                  arguments: JSON.stringify({ url: "http://127.0.0.1/" }),
                },
              },
            ],
          },
        },
      ],
    });
  await assert.rejects(
    E.runExplore(
      local,
      () => {},
      new AbortController().signal,
      forbidden as any,
    ),
    /本次检索/,
  );
});
test("停用和改身份立即撤销旧会话；最后管理员受保护；密码重置首次改密", async () => {
  assert.equal(
    (
      await request(admin, "PATCH", "/api/auth/users/" + admin.user.id, {
        revision: admin.user.revision,
        role: "creator",
      })
    ).json().error.code,
    "LAST_ADMIN",
  );
  const u = D.get("SELECT * FROM users WHERE id=?", sales.user.id);
  const change = await request(admin, "PATCH", "/api/auth/users/" + u.id, {
    revision: u.revision,
    role: "creator",
  });
  assert.equal(change.statusCode, 200);
  assert.equal((await request(sales, "GET", "/api/state")).statusCode, 401);
  sales = await login(u.username, "Personal-test-password!");
  assert.equal(sales.user.role, "creator");
  const disabled = await request(admin, "PATCH", "/api/auth/users/" + u.id, {
    revision: change.json().revision,
    status: "disabled",
  });
  assert.equal(disabled.statusCode, 200);
  assert.equal((await request(sales, "GET", "/api/state")).statusCode, 401);
  const reset = await request(admin, "PATCH", "/api/auth/users/" + u.id, {
    revision: disabled.json().revision,
    status: "active",
    password: "Reset-password-test!",
  });
  assert.equal(reset.statusCode, 200);
  const s = await login(u.username, "Reset-password-test!");
  assert.ok(s.user.mustChangePassword);
  const remove = await request(admin, "DELETE", "/api/auth/users/" + u.id);
  assert.equal(remove.statusCode, 200);
  assert.equal((await request(s, "GET", "/api/state")).statusCode, 401);
});
test("登录失败限流和登出撤销", async () => {
  const s = await anonymous();
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await request(s, "POST", "/api/auth/login", {
          username: "no-user",
          password: "not-a-valid-password",
        })
      ).statusCode,
      401,
    );
  assert.equal(
    (
      await request(s, "POST", "/api/auth/login", {
        username: "no-user",
        password: "not-a-valid-password",
      })
    ).statusCode,
    429,
  );
  const login = await loginInjected(app);
  assert.equal(
    (await request(login, "POST", "/api/auth/logout", {})).statusCode,
    200,
  );
  assert.equal((await request(login, "GET", "/api/state")).statusCode, 401);
});
test("业务员仅可读取政策原件与可发布成果，草稿及其他资产拒绝", async () => {
  const member = await create("sales", "sales-download-test");
  const released = domain.asset(
    Buffer.from("可发布成果访问验收"),
    "release-test.md",
    "text/markdown",
    "artifact",
  );
  const draft = domain.asset(
    Buffer.from("私有创作草稿访问验收"),
    "draft-test.md",
    "text/markdown",
    "artifact",
  );
  const original = domain.asset(
    Buffer.from("政策原文访问验收"),
    "policy-test.txt",
    "text/plain",
  );
  const raw = domain.saveSnapshot({
    title: "原件访问隔离测试",
    text: "此内容仅用于验证政策原件访问控制，不是真实政策文件。",
    assetId: original.id,
    scope,
  });
  const insert = (file: any, mode: string) => {
    const aid = D.id();
    D.run(
      "INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?)",
      aid,
      file.id,
      raw.id,
      mode,
      "md",
      "{}",
      "{}",
      null,
      D.now(),
    );
    return aid;
  };
  const releaseId = insert(released, "release"),
    draftId = insert(draft, "draft");
  assert.equal(
    (await request(member, "GET", "/api/artifacts/" + releaseId + "/download"))
      .statusCode,
    200,
  );
  assert.equal(
    (await request(member, "GET", "/api/artifacts/" + draftId + "/download"))
      .statusCode,
    403,
  );
  assert.equal(
    (await request(member, "GET", "/api/assets/" + draft.id)).statusCode,
    403,
  );
  assert.equal(
    (await request(member, "GET", "/api/assets/" + original.id)).statusCode,
    200,
  );
  const visible = (await request(member, "GET", "/api/state")).json().artifacts;
  assert.ok(visible.some((a: any) => a.id === releaseId));
  assert.ok(!visible.some((a: any) => a.id === draftId));
});
test("已停用或失去权限的账号不能继续生成或提交探索回答", async () => {
  const u = D.get("SELECT * FROM users WHERE id=?", creator.user.id);
  D.run("UPDATE users SET status='disabled' WHERE id=?", u.id);
  assert.throws(() => E.ensureExploreUser(u.id), /失去创作权限/);
  const A = await import("../server/agent.js"),
    input = A.freezeAgentInput({
      kind: "research",
      snapshotIds: [snapshot.id],
      actorId: u.id,
    });
  await assert.rejects(
    A.runAgent(
      input,
      () => {},
      new AbortController().signal,
      async () => {
        throw new Error("must not call");
      },
    ),
    /失去创作权限/,
  );
  D.run("UPDATE users SET status='active' WHERE id=?", u.id);
});
test("事实研究遗漏数组时按预算修正结构，不跳过引用校验", async () => {
  const A = await import("../server/agent.js");
  const frozen = A.freezeAgentInput({
    kind: "research",
    snapshotIds: [snapshot.id],
  });
  let rounds = 0;
  const transport = async (_url: any, opt: any) => {
    const payload = JSON.parse(opt.body);
    rounds++;
    if (rounds === 1)
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ claims: [] }) } }],
      });
    assert.ok(payload.messages.at(-1).content.includes("topics"));
    return Response.json({
      choices: [
        { message: { content: JSON.stringify({ claims: [], topics: [] }) } },
      ],
    });
  };
  const answer = await A.runAgent(
    frozen,
    () => {},
    new AbortController().signal,
    transport as any,
  );
  assert.equal(rounds, 2);
  assert.deepEqual(answer.content, { claims: [], topics: [] });
});
