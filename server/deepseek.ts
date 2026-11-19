import { err, json } from "./db.js";
import { getSecret } from "./secrets.js";
import {validateToolMode,invalidRequest} from './model-request.js';
import {readCompletionStream,StreamListener} from './provider-stream.js';

export function thinkingOptions(config: any) {
  const mode = config.thinkingMode || "disabled";
  return mode === "disabled"
    ? { thinking: { type: "disabled" } }
    : { thinking: { type: "enabled" }, reasoning_effort: mode };
}

// Preserve protocol state, including empty reasoning strings and signed server tools.
// This is for server-side replay only; do not expose it as the answer or a note.
export function assistantMessage(message: any) {
  const result: any = { role: "assistant", content: message.content ?? null };
  for (const field of ["reasoning_content", "tool_calls", "server_tool_calls", "annotations"])
    if (message[field] !== undefined) result[field] = message[field];
  return result;
}

export function newUsage() {
  return {
    inputTokens: 0 as number | null, outputTokens: 0 as number | null,
    cacheHitTokens: 0 as number | null, cacheMissTokens: 0 as number | null,
    reasoningTokens: 0 as number | null, safetyTokens: 0 as number | null,
    webSearches: 0, webFetches: 0, imageSearches: 0, cost: null,
  };
}
export function addUsage(total: ReturnType<typeof newUsage>, value: any) {
  const fields = {
    inputTokens: value?.prompt_tokens,
    outputTokens: value?.completion_tokens,
    cacheHitTokens: value?.prompt_cache_hit_tokens ?? value?.prompt_tokens_details?.cached_tokens,
    cacheMissTokens: value?.prompt_cache_miss_tokens,
    reasoningTokens: value?.completion_tokens_details?.reasoning_tokens ?? value?.completion_tokens_details?.thinking_tokens,
    safetyTokens: value?.completion_tokens_details?.safety_tokens,
  };
  for (const [key, n] of Object.entries(fields)) {
    // Missing counters mean unknown, never a fabricated zero.
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) total[key] = null;
    else if (total[key] !== null) total[key] += n;
  }
  total.webSearches += value?.server_tool_use?.tool_search || 0;
  total.webFetches += value?.server_tool_use?.tool_fetch || 0;
  total.imageSearches += value?.server_tool_use?.tool_image_search || 0;
}

export async function deepseekRequest(body: any, signal: AbortSignal, transport: typeof fetch = fetch, onStream?:StreamListener, allowPartial = false) {
  validateToolMode(body);
  const key = transport === fetch ? await getSecret("deepseek") : undefined;
  if (!key && transport === fetch)
    err("CAPABILITY_NOT_CONFIGURED", "请在设置中配置 DeepSeek API Key", 503);
  let res:Response;try{res = await transport("https://api.deepseek.com/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key || "test-only"}` },
    body: json(body), signal,
  });}catch(e:any){signal.throwIfAborted();err('MODEL_NETWORK_UNAVAILABLE','无法连接 DeepSeek，请检查本机网络后重试；已完成的步骤会保留',502);}
  let result: any;
  if(res.ok && res.headers.get('content-type')?.includes('text/event-stream')) result=await readCompletionStream(res,signal,onStream);
  else try { result = await res.json(); } catch {
    err("MODEL_UNAVAILABLE", `DeepSeek 未返回有效响应（HTTP ${res.status}），请稍后重试`, 502);
  }
  if (!res.ok || result?.error) {
    const detail = String(result?.error?.message || "");
    if (/Content Exists Risk/i.test(detail)) err("MODEL_REFUSAL", "DeepSeek 未通过内容审核，请调整问题或资料后重试", 422);
    if (res.status === 401) err("MODEL_AUTH_FAILED", "DeepSeek 密钥无效，请由管理员检查凭据", 502);
    if (res.status === 402) err("MODEL_BALANCE_REQUIRED", "DeepSeek 余额不足，请充值后重试", 502);
    if (res.status === 429) err("MODEL_RATE_LIMIT", "DeepSeek 请求过于频繁，请稍后重试", 502);
    if (res.status === 400) {
      const issue=invalidRequest(result?.error);
      const requestId=String(res.headers.get('x-request-id')||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100);
      throw Object.assign(new Error(issue.message),{code:issue.code,statusCode:422,diagnostic:{httpStatus:400,requestId,model:/^deepseek-(flash|v4-pro|chat|reasoner)$/.test(body.model)?body.model:'custom',thinking:body.thinking?.type}});
    }
    err("MODEL_UNAVAILABLE", `DeepSeek 生成失败（HTTP ${res.status}），未保存不完整回答，请稍后重试`, 502);
  }
  const choice = result?.choices?.[0];
  if (choice?.finish_reason === "content_filter" || choice?.message?.refusal)
    err("MODEL_REFUSAL", "DeepSeek 未通过内容审核，请调整问题或资料后重试", 422);
  if (!allowPartial && choice?.finish_reason === "length")
    err("MODEL_TRUNCATED", "输出或思考达到 token 上限，请减少篇幅、降低思考强度或提高输出预算后重试", 422);
  return result;
}
