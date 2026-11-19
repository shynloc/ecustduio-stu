import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  join(tmpdir(), "ecustudio-web-delivery-"),
);
const { exploreCompletion, webpagePlan, wantsWebpage } =
  await import("../server/webpage-delivery.js");
const config = { maxRequests: 3, maxInputChars: 50000 };
const prompt = "帮我制作一个可下载的互动网页";
const request = {
  model: "deepseek-flash",
  messages: [
    { role: "system", content: "创作助手" },
    { role: "user", content: prompt },
  ],
  stream: true,
  max_tokens: 1024,
};
const first =
  "<!doctype html><html><head><title>演示页</title></head><body><button>点击";
const end =
  "</button><script>document.querySelector('button').onclick=()=>document.body.dataset.clicked='1'</script></body></html>";
function packet(part: string, reason: string | null, done = true) {
  const data = {
    choices: [{ delta: { content: part }, finish_reason: reason }],
    usage: { completion_tokens: 20, prompt_tokens: 10 },
  };
  return new Response(
    "data: " + JSON.stringify(data) + "\n\n" + (done ? "data: [DONE]\n\n" : ""),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
for (const disconnect of [false, true])
  test(
    disconnect
      ? "连接断开后自动接续，不泄露半成品"
      : "达到 token 上限后接续 HTML 并累计用量",
    async () => {
      let n = 0;
      const visible: string[] = [];
      const completion = exploreCompletion(
        { prompt, config },
        () => {},
        () => {},
        new AbortController().signal,
        async (_, opts) => {
          if (++n === 1)
            return packet(first, disconnect ? null : "length", !disconnect);
          assert.match(
            JSON.parse(String(opts?.body)).messages.at(-1).content,
            /点击$/,
          );
          return packet(end, "stop");
        },
      );
      const res = await completion.request(request, (e) => {
        if (e.text) visible.push(e.text);
      });
      assert.deepEqual(visible, []);
      assert.equal(n, 2);
      assert.deepEqual(
        webpagePlan(res.choices[0].message.content, true)?.filePlan,
        { title: "演示页", formats: ["html"] },
      );
      assert.equal(res.choices[0].message.content, first + end);
      if (!disconnect) assert.equal(completion.usage.outputTokens, 40);
    },
  );
test("达到任务预算后不会把不完整网页标为成功", async () => {
  let calls = 0;
  const completion = exploreCompletion(
    { prompt, config: { ...config, maxRequests: 1 } },
    () => {},
    () => {},
    new AbortController().signal,
    async () => {
      calls++;
      return packet(first, "length");
    },
  );
  await assert.rejects(
    completion.request(request, () => {}),
    { code: "WEBPAGE_INCOMPLETE" },
  );
  assert.equal(calls, 1);
});
test("阅读网页、讲解源码和网页转视频保留原流程", () => {
  for (const p of [
    "解释 HTML 代码",
    "网页转视频",
    "帮我总结这个网页的内容",
    "如何制作一个网页",
    "帮我做一份 PPT 和网页",
  ])
    assert.equal(wantsWebpage({ prompt: p }), false, p);
  for (const p of [prompt, "根据上面的内容写个网站", "输出一个 HTML 文件"])
    assert.equal(wantsWebpage({ prompt: p }), true, p);
});
