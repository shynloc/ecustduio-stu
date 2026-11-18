let csrf = "";
import { uid } from "./compat";
async function responseBody(r:Response){
 try{return await r.json();}
 catch{throw Object.assign(new Error('工作台返回了异常页面。请保留当前输入，重新打开工作台；如仍失败，请运行本机检查。'),{code:'API_RESPONSE_INVALID',status:r.status});}
}
export async function init() {
  const r = await fetch("/api/session");
  const b = await responseBody(r);
  if (!r.ok) throw new Error(b.error?.message || "正在重连工作台，请稍候");
  csrf = b.csrf;
  return b;
}
export async function api(path: string, options: RequestInit = {}) {
  const headers: any = { "x-csrf-token": csrf, ...options.headers };
  if (options.body && !(options.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const r = await fetch("/api" + path, { ...options, headers });
  const b = await responseBody(r);
  if (b.csrf) csrf = b.csrf;
  if (!r.ok) {
    if (
      [
        "LOGIN_REQUIRED",
        "SESSION_REQUIRED",
        "PASSWORD_CHANGE_REQUIRED",
      ].includes(b.error?.code)
    )
      window.dispatchEvent(new Event("ecustudio:auth-required"));
    throw Object.assign(new Error(b.error?.message || "请求失败"), {
      code: b.error?.code,
      status: r.status,
    });
  }
  return b;
}
export const post = (path: string, body: any = {}, key = uid()) =>
  api(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "idempotency-key": key },
  });
export const put = (path: string, body: any) =>
  api(path, { method: "PUT", body: JSON.stringify(body) });
export const patch = (path: string, body: any) =>
  api(path, { method: "PATCH", body: JSON.stringify(body) });
export async function upload(file: File, path = "/uploads") {
  if(path==='/media/uploads'){const {resumeUpload}=await import('./resumable');return resumeUpload(file);}
  const f = new FormData();
  f.append("file", file);
  return api(path, { method: "POST", body: f });
}
