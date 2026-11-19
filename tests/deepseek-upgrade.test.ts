import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { setupInjected } from "./auth-helper.js";
mkdirSync("test-results", { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(join(process.cwd(), "test-results/deepseek-upgrade-"));
process.env.DEEPSEEK_API_KEY = "test-only-no-network";
const D = await import("../server/db.js"), P = await import("../server/deepseek.js"),
  E = await import("../server/explore.js"), N = await import("../server/native-explore.js"),
  A = await import("../server/agent.js"), { Settings } = await import("../shared/schema.js"),
  { buildApp } = await import("../server/app.js");
const app = await buildApp(false), session = await setupInjected(app);
const user = D.get("SELECT * FROM users LIMIT 1");
D.run("UPDATE settings SET body=? WHERE id=1", D.json({ ...D.settings(), allowExternalAI: true }));
const api = (method: any, url: string, payload?: any) => app.inject({ method, url, payload,
  headers: { host: "localhost", cookie: session.cookie, "x-csrf-token": session.csrf } });
const signal = () => new AbortController().signal;
const mock = (value: any, status = 200) => (async () => Response.json(value, { status })) as typeof fetch;
const safe = (url: string) => url.startsWith("https://") ? url : null;
after(async () => { await app.close(); D.db.close(); });

test("旧设置保持快速模式，新增思考和输出预算有边界", () => {
  assert.equal(Settings.parse({}).thinkingMode, "disabled");
  assert.equal(Settings.safeParse({ maxTokens: 131072 }).success, true);
  assert.equal(Settings.safeParse({ maxTokens: 393217 }).success, false);
  assert.deepEqual(P.thinkingOptions({ thinkingMode: "high" }), { thinking: { type: "enabled" }, reasoning_effort: "high" });
  assert.deepEqual(P.thinkingOptions({}), { thinking: { type: "disabled" } });
});

test("思考Agent工具调用和JSON修复均保留完整reasoning_content", async () => {
  const input = { kind: "research", snapshotIds: ["s"], snapshots: [{ id: "s", title: "样例", paragraphs: [{ id: "p1", text: "测试来源，仅用于验证协议。" }] }],
    skill: { hash: "test", files: { "SKILL.md": "根据资料提取候选事实。" } }, config: { ...D.settings(), thinkingMode: "high", maxRequests: 4 } };
  let requests = 0;
  const transport = (async (_url, options) => {
    const b = JSON.parse(options!.body as string);
    assert.equal(b.reasoning_effort, "high"); assert.equal(b.response_format.type, "json_object");
    requests++;
    if (requests === 1) return Response.json({ choices: [{ message: { content: null, reasoning_content: "tool-reasoning-fixture",
      tool_calls: [{ id: "t", type: "function", function: { name: "read_source", arguments: '{"id":"s"}' } }] } }] });
    assert.equal(b.messages.find((m: any) => m.tool_calls)?.reasoning_content, "tool-reasoning-fixture");
    if (requests === 2) return Response.json({ choices: [{ message: { content: '{"claims":[]}', reasoning_content: "repair-reasoning-fixture" } }] });
    assert.equal(b.messages.at(-2).reasoning_content, "repair-reasoning-fixture");
    return Response.json({ choices: [{ message: { content: '{"claims":[],"topics":[]}', reasoning_content: "done" } }] });
  }) as typeof fetch;
  const result = await A.runAgent(input, () => {}, signal(), transport);
  assert.equal(requests, 3); assert.equal(result.thinkingMode, "high");
  assert.equal(result.usage.inputTokens, null);
  assert.equal(JSON.stringify(result).includes("reasoning-fixture"), false);
});

test("HTTP200错误、审核拒答和截断不能作为成功回答", async () => {
  for (const [body, code] of [
    [{ error: { message: "provider failed" } }, "MODEL_UNAVAILABLE"],
    [{ choices: [{ finish_reason: "content_filter", message: { content: "must discard" } }] }, "MODEL_REFUSAL"],
    [{ choices: [{ finish_reason: "length", message: { content: "partial" } }] }, "MODEL_TRUNCATED"],
  ] as any[]) await assert.rejects(P.deepseekRequest({}, signal(), mock(body)), (e: any) => e.code === code);
  await assert.rejects(P.deepseekRequest({}, signal(), mock({ error: { message: "Content Exists Risk private input" } }, 400)), /内容审核/);
});

test("缓存、思考、审核及官方工具计费分别记录，缺失值不伪造", () => {
  const usage = P.newUsage();
  P.addUsage(usage, { prompt_tokens: 20, completion_tokens: 30, prompt_cache_hit_tokens: 8, prompt_cache_miss_tokens: 12,
    completion_tokens_details: { reasoning_tokens: 10, safety_tokens: 2 }, server_tool_use: { tool_search: 3, tool_fetch: 1 } });
  assert.equal(usage.cacheHitTokens, 8); assert.equal(usage.reasoningTokens, 10); assert.equal(usage.webSearches, 3);
  P.addUsage(usage, undefined); assert.equal(usage.inputTokens, null); assert.equal(usage.cost, null);
});

test("官方引用按Unicode码点插入，不把回答摘要冒充原文", () => {
  const result = N.nativeAnswer({ content: "甲😀乙。", annotations: [{ type: "url_citation", url_citation: {
    url: "https://example.com/", title: "示例", start_index: 0, end_index: 3,
  } }] }, [], safe);
  assert.equal(result.text, "甲😀乙[S1]。");
  assert.equal(result.sources[0].excerpt.includes("甲"), false);
});

let conversation: any, answer: any;
test("官方探索：按权限检索本地，原样存协议，前端和笔记不泄露协议，自动标题", async () => {
  conversation = (await api("POST", "/api/conversations", {})).json();
  const b = { conversationId: conversation.id, prompt: "总结 https://example.com/", mode: "both", webEngine: "native", thinkingMode: "low", webAction: "read", noteIds: [] };
  const input = E.freezeExplore(b, user);
  // The normal enqueue endpoint gives the conversation a prompt-based fallback title.
  D.run("UPDATE conversations SET title=? WHERE id=?", b.prompt, conversation.id);
  const transport = (async (_url, opt) => {
    const request = JSON.parse(opt!.body as string);
    assert.equal(request.tools.length, 1); assert.equal(request.tools[0].type, "deepseek_read_url");
    assert.equal(request.reasoning_effort, "low"); assert.equal(request.title.enabled, true);
    assert.equal(request.safety_check.level, "high"); assert.equal(request.response_format, undefined);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: "示例网站。", reasoning_content: "private-reasoning-fixture", title: "示例网站说明",
      server_tool_calls: [{ index: 0, reasoning_content: "", calls: [{ id: "server1", type: "deepseek_read_url", kind: "read_link", action: { type: "read_link", url: "https://example.com/" }, status: "completed", page: { url: "https://example.com/", title: "示例" }, signature: "signed-page-fixture" }] }],
      annotations: [{ type: "url_citation", url_citation: { url: "https://example.com/", title: "示例", start_index: 0, end_index: 5 } }],
    } }], usage: { prompt_tokens: 5, completion_tokens: 10, server_tool_use: { tool_fetch: 1 } } });
  }) as typeof fetch;
  const result = await E.runExplore(input, () => {}, signal(), transport);
  answer = E.commitExplore(input, result, "native-test-job");
  assert.equal(answer.engine, "native"); assert.equal(answer._providerMessages, undefined);
  const c = (await api("GET", "/api/conversations/" + conversation.id)).json();
  assert.equal(c.title, "示例网站说明");
  assert.equal(JSON.stringify(c).includes("signed-page-fixture"), false);
  assert.equal(JSON.stringify(c).includes("private-reasoning-fixture"), false);
  const note = (await api("POST", "/api/notes/from-message", { messageId: answer.messageId })).json();
  assert.match(note.body, /\[S1\]/); assert.equal(note.sources[0].url, "https://example.com/");
  assert.equal(JSON.stringify(note).includes("signed-page-fixture"), false);
  const material = await api("POST", `/api/notes/${note.id}/material`, { revision: note.revision, scope: { year: 2026 }, newProjectTitle: "升级测试素材" });
  assert.equal(material.statusCode, 200, material.body);
});

test("多轮追问保留网页签名，后续不重复生成标题", async () => {
  const input = E.freezeExplore({ conversationId: conversation.id, prompt: "继续总结", mode: "web", webEngine: "native", noteIds: [] }, user);
  const transport = (async (_url, opt) => {
    const b = JSON.parse(opt!.body as string), previous = b.messages.find((m: any) => m.role === "assistant");
    assert.equal(previous.server_tool_calls[0].calls[0].signature, "signed-page-fixture");
    assert.equal(previous.reasoning_content, "private-reasoning-fixture");
    assert.equal(b.title, undefined);
    return Response.json({ choices: [{ message: { content: "继续参考[S1]。" } }] });
  }) as typeof fetch;
  const result = await E.runExplore(input, () => {}, signal(), transport);
  assert.match(result.text, /S1/);
});

test("仅本地模式不发送联网工具及旧网络回复，官方搜索不意外执行", async () => {
  const input = E.freezeExplore({ conversationId: conversation.id, prompt: "只讨论写作结构", mode: "local", webEngine: "native", noteIds: [] }, user);
  const transport = (async (_url, opt) => {
    const b = JSON.parse(opt!.body as string);
    assert.deepEqual(b.tools.map((t:any)=>t.function.name).sort(),["deliver_files","search_local"]);
    assert.equal(JSON.stringify(b.messages).includes("signed-page-fixture"), false);
    assert.equal(b.messages.some((m: any) => m.content === "示例网站。"), false);
    return Response.json({ choices: [{ message: { content: "可以分为引言、论述和结尾。" } }] });
  }) as typeof fetch;
  const result = await E.runExplore(input, () => {}, signal(), transport);
  assert.equal(result.engine, "controlled");
});

test("课程双附件逐份保留引用，官方标记与本地工具均按受众分稿", async () => {
  const course = (await api("POST", "/api/notes", {title:"纸桥测试资料",body:"两本书间距 12 厘米，分别测量平桥和折桥。"})).json();
  const chat = (await api("POST", "/api/conversations", {})).json();
  const input = E.freezeExplore({conversationId:chat.id,prompt:"老师用的 PPT 和学生用的 Word",mode:"web",webEngine:"native",noteIds:[course.id]},user);
  const first='课堂指导 [S1]。\n:::ecustudio-files {"title":"教师指引","formats":["pptx"]}';
  const native=(text:string)=>E.runExplore(input,()=>{},signal(),mock({choices:[{message:{content:text}}]}));
  const marker='\n:::ecustudio-files {"title":"学生活动单","formats":["docx"]}';
  await assert.rejects(native(first+"\n\n请填写实验记录。"+marker),{code:"REFERENCE_INVALID"});
  const result=await native(first+"\n\n填写实测结果 [S1]。"+marker);
  assert.deepEqual(result.fileDrafts.map((d:any)=>[d.title,d.formats,d.content]),[
    ["教师指引",["pptx"],"课堂指导 [S1]。"],["学生活动单",["docx"],"填写实测结果 [S1]。"]]);
  let round=0;
  const controlled = (async()=>{
    const drafts=[{title:"教师指引",formats:["pptx"],content:"课堂指导 [S1]。"},
      {title:"学生活动单",formats:["docx"],content:round++ ? "填写实测结果 [S1]。" : "填写实验记录。"}];
    return Response.json({choices:[{message:{role:"assistant",content:null,tool_calls:drafts.map((d,i)=>({
      id:"file"+i,type:"function",function:{name:"deliver_files",arguments:JSON.stringify(d)}}))}}]});
  }) as typeof fetch;
  const fixed=await E.runExplore({...input,webEngine:"controlled",mode:"auto"},()=>{},signal(),controlled);
  assert.equal(round,2);assert.ok(fixed.fileDrafts.every((d:any)=>d.content.includes("[S1]")));
});

test("禁用账号或授权后，即使原生请求返回也不能提交", async () => {
  const input = E.freezeExplore({ conversationId: conversation.id, prompt: "写提纲", mode: "web", webEngine: "native", noteIds: [] }, user);
  const transport = (async () => {
    D.run("UPDATE settings SET body=? WHERE id=1", D.json({ ...D.settings(), allowExternalAI: false }));
    return Response.json({ choices: [{ message: { content: "不应提交" } }] });
  }) as typeof fetch;
  await assert.rejects(E.runExplore(input, () => {}, signal(), transport), (e: any) => e.code === "AI_CONSENT_REQUIRED");
  D.run("UPDATE settings SET body=? WHERE id=1", D.json({ ...D.settings(), allowExternalAI: true }));
});
