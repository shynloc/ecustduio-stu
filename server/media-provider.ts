import { err, json } from "./db.js";
import { getSecret } from "./secrets.js";

export async function mediaRequest(
  path: string,
  options: RequestInit,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
) {
  if (
    !/^\/(?:files(?:\/file-[A-Za-z0-9_-]+)?|v1\/tools\/(?:ocr|asr|tts))$/.test(
      path,
    )
  )
    throw new Error("Unsupported DeepSeek media endpoint");
  const key = transport === fetch ? await getSecret("deepseek") : "test-only";
  if (!key)
    err("CAPABILITY_NOT_CONFIGURED", "请管理员在设置中配置 DeepSeek 凭证", 503);
  const response = await transport("https://api.deepseek.com" + path, {
    ...options,
    signal,
    headers: { ...options.headers, Authorization: `Bearer ${key}` },
    redirect: "error",
  });
  if (!response.ok) {
    let body: any;
    try {
      body = await response.json();
    } catch {}
    const detail = String(body?.error?.message || "");
    if (/password-protected/i.test(detail))
      err("FILE_ENCRYPTED", "文档设有打开密码，请移除密码后重新上传", 422);
    if (/Content Exists Risk/i.test(detail))
      err("MODEL_REFUSAL", "内容未通过 DeepSeek 审核，请调整输入", 422);
    const message =
      (
        {
          401: "DeepSeek 凭据无效，请管理员检查",
          402: "DeepSeek 余额不足，请充值后重试",
          413: "当前分片超过接口限制，工作台将尝试缩小分片",
          429: "DeepSeek 请求频繁，请稍后重试",
          400: "DeepSeek 无法处理此文件或参数，请检查格式、长度或更换文件",
          408: "当前分片上传超时，已完成部分保留，可重试未完成部分",
          504: "DeepSeek 处理超时，工作台将尝试缩小分片",
        } as any
      )[response.status] ||
      `DeepSeek 媒体处理失败（HTTP ${response.status}），请稍后重试`;
    throw Object.assign(new Error(message),{code:'MEDIA_PROVIDER_FAILED',statusCode:502,httpStatus:response.status});
  }
  return response;
}
export async function mediaJson(
  path: string,
  options: RequestInit,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
) {
  const r = await mediaRequest(path, options, signal, transport);
  let data: any;
  try {
    data = await r.json();
  } catch {
    err("MEDIA_INVALID_RESPONSE", "DeepSeek 返回无效的识别结果", 502);
  }
  if (data?.error)throw Object.assign(new Error('DeepSeek 本次处理未完成，工作台将保留已完成部分'),{code:'MEDIA_PROVIDER_FAILED',statusCode:502,httpStatus:/time|timeout/i.test(String(data.error.message))?504:502});
  return data;
}
export function fileForm(
  bytes: Buffer,
  name: string,
  mime: string,
  purpose?: string,
  expires = false,
) {
  const form = new FormData();
  // Files API requires purpose before the file field.
  if (purpose) form.append("purpose", purpose);
  if (expires) {
    form.append("expires_after[anchor]", "created_at");
    form.append("expires_after[seconds]", "3600");
  }
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), name);
  return form;
}
export async function responseBytes(r: Response, max: number) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of r.body as any) {
    size += chunk.length;
    if (size > max)
      err(
        "MEDIA_RESULT_TOO_LARGE",
        "生成文件超过大小限制，请减少输入文字",
        413,
      );
    chunks.push(chunk);
  }
  if (!size) err("MEDIA_EMPTY", "DeepSeek 返回空音频，请重试", 502);
  return Buffer.concat(chunks);
}
export const jsonOptions = (body: any): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: json(body),
});
