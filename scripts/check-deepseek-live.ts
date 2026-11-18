// Explicit opt-in; uses the configured key without printing or copying it.
import { writeFileSync } from "node:fs";
if (process.env.ECUSTUDIO_LIVE_DEEPSEEK_TEST !== "1") throw new Error("Set ECUSTUDIO_LIVE_DEEPSEEK_TEST=1 to run a small paid public-data check");
const { settings, err } = await import("../server/db.js");
const { runAgent } = await import("../server/agent.js");
const { runNativeExplore } = await import("../server/native-explore.js");
const check = () => { if (!settings().allowExternalAI) err("AI_CONSENT_REQUIRED", "当前工作台未授权 DeepSeek 调用"); };
check();
const config = { ...settings(), model: "deepseek-flash", thinkingMode: "low", maxTokens: 4096, maxRequests: 4, maxInputChars: 100000 };
const signal = AbortSignal.timeout(180000);
const deps = { check, local: () => [], safeUrl: (value: string) => { try { const u = new URL(value); return u.protocol === "https:" ? u.href : null; } catch { return null; } } };
const record: any = { version: "0.3.0", startedAt: new Date().toISOString(), data: "Public documentation and synthetic fixture only; no business data changed", checks: [] };
const progress = (_stage: string, value: any) => console.log(value.message);
try {
  const firstInput = { config, prompt: "阅读 https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/ ，用两句话说明带工具调用时 reasoning_content 的回传要求，附来源。", webAction: "read", mode: "web", history: [], notes: [], autoTitle: true, conversationId: "live-public-only" };
  const first = await runNativeExplore(firstInput, progress, signal, fetch, deps);
  if (!first.tools.some((t) => t.status === "completed")) throw new Error("No completed native tool call");
  record.checks.push({ name: "official_read_url", ok: true, titleReturned: !!first.title, sourceCount: first.sources.length, usage: first.usage,
    signedPageReturned: first._providerMessages.some((m) => m.server_tool_calls?.some((step: any) => step.calls?.some((c: any) => !!c.signature))) });
  const second = await runNativeExplore({ ...firstInput, autoTitle: false, webAction: "search",
    prompt: "沿用上一轮文档，再联网查找 site:api-docs.deepseek.com/zh-cn/quick_start/pricing/ 当前支持哪些模型名称。只列模型名称和来源。",
    history: [{ role: "user", content: firstInput.prompt, sources: [], context: { mode: "web" } },
      { role: "assistant", content: first.text, sources: first.sources, context: { mode: "web", engine: "native", providerMessages: first._providerMessages } }],
  }, progress, signal, fetch, deps);
  if (!second.tools.some((t) => t.name === "deepseek_web_search" && t.status === "completed")) throw new Error("No completed search call");
  record.checks.push({ name: "thinking_search_followup", ok: true, sourceCount: second.sources.length, usage: second.usage });
  const research = await runAgent({ kind: "research", snapshotIds: ["fixture"],
    snapshots: [{ id: "fixture", title: "公开测试说明", scope: { year: 2026 }, published: null, paragraphs: [{ id: "p1", text: "EcuStudio 是教育内容研究与创作工作台。生成的政策结论需要用户核验原文。" }] }],
    config, skill: { hash: "public-live-check", files: { "SKILL.md": "请先用 read_source 读取 fixture，仅提取一条候选事实。topics返回空数组。不得编造信息。" } },
  }, progress, signal);
  if (!research.content.claims.length || !research.toolLog.some((t) => t.name === "read_source")) throw new Error("Research tool cycle incomplete");
  record.checks.push({ name: "thinking_tools_json_research", ok: true, requests: research.requests, claims: research.content.claims.length, usage: research.usage });
  record.ok = true;
} catch (e: any) {
  record.ok = false; record.error = { code: e.code || e.name, message: e.message }; process.exitCode = 1;
} finally {
  record.finishedAt = new Date().toISOString();
  writeFileSync("docs/DeepSeek升级验证记录.json", JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record, null, 2));
}
