import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
mkdirSync("test-results", { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  join(process.cwd(), "test-results/agent-experience-"),
);
const { readCompletionStream } = await import("../server/provider-stream.js"),
  { packContext, conversationMemory } =
    await import("../server/context-budget.js");
const D = await import("../server/db.js"),
  { buildApp } = await import("../server/app.js"),
  { setupInjected, testAccount } = await import("./auth-helper.js");
const app = await buildApp(false),
  auth = await setupInjected(app),
  u = D.get("SELECT * FROM users WHERE username=?", testAccount.username);
after(() => app.close());
function response(events: any[], done = true) {
  const value =
    events.map((e) => "data: " + JSON.stringify(e) + "\r\n\r\n").join("") +
    (done ? "data: [DONE]\r\n\r\n" : "");
  const bytes = new TextEncoder().encode(value);
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += 3)
          c.enqueue(bytes.slice(i, i + 3));
        c.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
test("SSE跨字节中文、工具参数、原生签名、用量重组；不公开思考", async () => {
  const events: any[] = [],
    r = await readCompletionStream(
      response([
        {
          choices: [
            {
              index: 0,
              delta: { content: "你好", reasoning_content: "不可公开" },
            },
          ],
        },
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call-a",
                    function: { name: "search_local", arguments: '{"que' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index: 0, function: { arguments: 'ry":"课堂"}' } },
                ],
                server_tool_calls: [{ signature: "signed", calls: [] }],
                annotations: [{ type: "url_citation" }],
              },
            },
          ],
        },
        {
          model: "deepseek-flash",
          usage: { prompt_tokens: 10, completion_tokens: 5 },
          choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        },
      ]),
      new AbortController().signal,
      (e) => events.push(e),
    );
  assert.equal(r.choices[0].message.content, "你好");
  assert.equal(
    r.choices[0].message.tool_calls[0].function.arguments,
    '{"query":"课堂"}',
  );
  assert.equal(r.choices[0].message.server_tool_calls[0].signature, "signed");
  assert.equal(r.usage.prompt_tokens, 10);
  assert.equal(events.map((e) => e.text || "").join(""), "你好");
  assert.ok(!JSON.stringify(events).includes("不可公开"));
});
test("截断流不能冒充完成；收到的文字只保留为片段", async () => {
  const events: any[] = [];
  await assert.rejects(
    () =>
      readCompletionStream(
        response(
          [{ choices: [{ index: 0, delta: { content: "片段" } }] }],
          false,
        ),
        new AbortController().signal,
        (e) => events.push(e),
      ),
    (e: any) => e.code === "MODEL_STREAM_INTERRUPTED",
  );
  assert.equal(events[0].text, "片段");
});
test("多材料按问题选择片段，保留原长度和来源版本", () => {
  const body = "背景内容。".repeat(5000) + "课堂小组讨论观察记录。".repeat(100);
  const packed = packContext(
    Array.from({ length: 20 }, (_, i) => ({
      id: "n" + i,
      title: "资料" + i,
      body,
      revision: 3,
    })),
    [],
    "课堂小组讨论",
    100000,
  );
  assert.equal(packed.budget.sourceCount, 20);
  assert.equal(packed.budget.excerptCount, 20);
  assert.ok(packed.budget.selectedChars <= 48000);
  assert.ok(
    packed.notes.every(
      (n) =>
        n.body.includes("课堂小组") &&
        n.revision === 3 &&
        n.originalLength === body.length,
    ),
  );
});
test("跨长会话找回较早原句；本地模式不使用联网历史；完整记录不删除", () => {
  D.run(
    "INSERT INTO conversations VALUES(?,?,?,?,?)",
    "memory",
    u.id,
    "历史对话",
    D.now(),
    D.now(),
  );
  for (let i = 0; i < 30; i++)
    D.run(
      "INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)",
      "m" + i,
      "memory",
      i % 2 ? "assistant" : "user",
      i === 1 ? "很早约定：目标读者是新入职教师。" : "近期讨论" + i,
      "[]",
      D.json({ mode: i === 3 ? "web" : "local" }),
      null,
      D.now(),
    );
  const m = conversationMemory("memory", "新入职教师", "local", 100000);
  assert.ok(m.summary.includes("目标读者是新入职教师"));
  assert.ok(!m.summary.includes("[m3]"));
  assert.equal(m.history.length, 8);
  assert.equal(
    D.get("SELECT count(*) n FROM messages WHERE conversation_id=?", "memory")
      .n,
    30,
  );
  assert.ok(
    D.get(
      "SELECT 1 FROM conversation_summaries WHERE conversation_id=?",
      "memory",
    ),
  );
});
