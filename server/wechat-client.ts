import { isIP } from "node:net";

// Server-only transport. URLs and verbs cannot be supplied by a browser or article.
export class WechatError extends Error {
  statusCode = 422;
  constructor(
    public code: string,
    message: string,
    public uncertain = false,
    public providerCode = 0,
  ) {
    super(message);
  }
}
function rejected(code: number, detail = "") {
  let message =
    "微信未完成操作（编号 " + code + "），请稍后重试或请管理员检查公众号权限。";
  if ([40013, 40125].includes(code))
    message = "公众号编号或密钥不正确，请管理员重新连接公众号。";
  if (code === 40164) {
    const ip = detail.match(/invalid ip\s+([\da-fA-F.:]+)/i)?.[1];
    message =
      "请管理员在微信开发者平台的「IP 白名单」中加入工作台的公网地址" +
      (ip && isIP(ip) ? "：" + ip : "") +
      "，保存后重新连接。";
  }
  if ([48001, 48002, 50002].includes(code))
    message =
      "此公众号尚未开通所需接口权限。请管理员在微信开发者平台检查「草稿箱、素材管理」权限；仍可下载排版后手动导入。";
  if ([45009, 45064].includes(code))
    message = "微信调用次数暂时用完，请稍后重试。";
  if ([40007, 40009, 40113].includes(code))
    message = "微信未接受配图或封面，请重新生成预览后再保存。";
  if ([40001, 42001].includes(code))
    message = "公众号连接已过期，请管理员重新测试连接。";
  return new WechatError("WECHAT_" + code, message, false, code);
}
export type WechatTransport = (
  url: string,
  init: RequestInit,
) => Promise<Response>;
export class WechatClient {
  private tokens = new Map<string, { value: string; until: number }>();
  private pending = new Map<string, Promise<string>>();
  constructor(
    private transport: WechatTransport = (url, init) => fetch(url, init),
  ) {}
  private async request(
    path: string,
    body: any,
    token: string | undefined,
    signal?: AbortSignal,
    upload = false,
    write = false,
  ) {
    let response: Response;
    try {
      const url = new URL("https://api.weixin.qq.com/cgi-bin/" + path);
      if (token) url.searchParams.set("access_token", token);
      response = await this.transport(url.href, {
        method: "POST",
        redirect: "error",
        headers: upload ? {} : { "content-type": "application/json" },
        body: upload ? body : JSON.stringify(body),
        signal: AbortSignal.any([
          AbortSignal.timeout(45000),
          ...(signal ? [signal] : []),
        ]),
      });
      if (!response.ok) throw new Error("HTTP");
      const text = await response.text();
      if (text.length > 12 * 1024 * 1024) throw new Error("Oversized response");
      const result = JSON.parse(text);
      if (!result || typeof result !== "object")
        throw new Error("Invalid response");
      if (result.errcode)
        throw rejected(Number(result.errcode), String(result.errmsg || ""));
      return result;
    } catch (e) {
      if (e instanceof WechatError) throw e;
      throw new WechatError(
        write ? "WECHAT_RESULT_UNKNOWN" : "WECHAT_UNAVAILABLE",
        write
          ? "保存结果暂时无法确认。请核对草稿箱，工作台不会自动重复创建。"
          : "暂时连接不到微信，请检查网络后重试。",
        write,
      );
    }
  }
  async token(
    account: any,
    secret: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const cached = this.tokens.get(account.id);
    if (cached && cached.until > Date.now()) return cached.value;
    if (this.pending.has(account.id)) return this.pending.get(account.id)!;
    const task = (async () => {
      const r = await this.request(
        "stable_token",
        {
          grant_type: "client_credential",
          appid: account.app_id,
          secret,
          force_refresh: false,
        },
        undefined,
        signal,
      );
      if (typeof r.access_token !== "string" || !Number.isFinite(r.expires_in))
        throw new WechatError(
          "WECHAT_TOKEN_INVALID",
          "微信未返回有效连接，请稍后重试。",
        );
      this.tokens.set(account.id, {
        value: r.access_token,
        until: Date.now() + Math.max(0, r.expires_in - 180) * 1000,
      });
      return r.access_token as string;
    })();
    this.pending.set(account.id, task);
    try {
      return await task;
    } finally {
      this.pending.delete(account.id);
    }
  }
  forget(id: string) {
    this.tokens.delete(id);
  }
  async call(
    account: any,
    secret: string,
    path: string,
    body: any,
    signal?: AbortSignal,
    upload = false,
    write = false,
  ): Promise<any> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.token(account, secret, signal);
      try {
        return await this.request(path, body, token, signal, upload, write);
      } catch (e) {
        if (
          e instanceof WechatError &&
          [40001, 42001].includes(e.providerCode) &&
          attempt === 0
        ) {
          this.forget(account.id);
          continue;
        }
        throw e;
      }
    }
  }
  list(a: any, s: string, offset = 0, signal?: AbortSignal) {
    return this.call(
      a,
      s,
      "draft/batchget",
      { offset, count: 20, no_content: 0 },
      signal,
    );
  }
  get(a: any, s: string, mediaId: string, signal?: AbortSignal) {
    return this.call(a, s, "draft/get", { media_id: mediaId }, signal);
  }
  async add(a: any, s: string, article: any, signal?: AbortSignal) {
    const r = await this.call(
      a,
      s,
      "draft/add",
      { articles: [article] },
      signal,
      false,
      true,
    );
    if (typeof r.media_id !== "string" || !r.media_id)
      throw new WechatError(
        "WECHAT_RESULT_UNKNOWN",
        "微信尚未返回草稿回执，请先核对草稿箱。",
        true,
      );
    return r.media_id as string;
  }
  async image(
    a: any,
    s: string,
    bytes: Buffer,
    cover: boolean,
    signal?: AbortSignal,
  ) {
    const form = new FormData();
    form.set(
      "media",
      new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
      "ecustudio.jpg",
    );
    const r = await this.call(
      a,
      s,
      cover ? "material/add_material?type=image" : "media/uploadimg",
      form,
      signal,
      true,
    );
    if (cover) {
      if (typeof r.media_id === "string" && r.media_id) return r.media_id;
    } else if (typeof r.url === "string") {
      const u = new URL(r.url);
      if (
        ["http:", "https:"].includes(u.protocol) &&
        (u.hostname === "qpic.cn" || u.hostname.endsWith(".qpic.cn")) &&
        !u.username &&
        !u.password
      )
        return u.href;
    }
    throw new WechatError(
      "WECHAT_IMAGE_RESPONSE",
      "微信未返回有效图片，请稍后重试。",
    );
  }
}
export const officialWechat = new WechatClient();
