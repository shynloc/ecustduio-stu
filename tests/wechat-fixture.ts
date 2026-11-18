import { createServer } from "node:http";
import { WechatClient } from "../server/wechat-client.js";
export async function wechatFixture() {
  const articles = new Map<string, any>(),
    calls: { path: string; body: any }[] = [];
  const state = {
    dropAdd: false,
    rejectAdd: 0,
    failGet: false,
    badGet: false,
    rejectToken: 0,
    expireOnce: false,
    dropWithoutSave: false,
  };
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks),
      url = new URL(req.url!, "http://fixture");
    const multipart = String(req.headers["content-type"]).startsWith(
      "multipart/",
    );
    const body = multipart
      ? {
          bytes: raw.length,
          jpeg: raw.includes(Buffer.from([0xff, 0xd8, 0xff])),
        }
      : JSON.parse(raw.toString() || "{}");
    calls.push({ path: url.pathname, body });
    const send = (b: any) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(b));
    };
    if (url.pathname.endsWith("/stable_token"))
      return send(
        state.rejectToken
          ? {
              errcode: state.rejectToken,
              errmsg: "invalid ip 203.0.113.9, secret MUST_NOT_LEAK",
            }
          : { access_token: "synthetic-fixture-token", expires_in: 7200 },
      );
    if (url.searchParams.get("access_token") !== "synthetic-fixture-token")
      return send({ errcode: 40001 });
    if (state.expireOnce) {
      state.expireOnce = false;
      return send({ errcode: 42001 });
    }
    if (url.pathname.endsWith("/media/uploadimg"))
      return send({
        url: "http://mmbiz.qpic.cn/test/image-" + calls.length + ".jpg",
      });
    if (url.pathname.endsWith("/material/add_material"))
      return send({ media_id: "cover-" + calls.length });
    if (url.pathname.endsWith("/draft/add")) {
      if (state.rejectAdd) return send({ errcode: state.rejectAdd });
      if (state.dropWithoutSave) {
        state.dropWithoutSave = false;
        req.socket.destroy();
        return;
      }
      const mediaId = "draft-" + articles.size;
      articles.set(mediaId, structuredClone(body.articles));
      if (state.dropAdd) {
        state.dropAdd = false;
        req.socket.destroy();
        return;
      }
      return send({ media_id: mediaId });
    }
    if (url.pathname.endsWith("/draft/get")) {
      if (state.failGet) {
        res.statusCode = 503;
        res.end();
        return;
      }
      return send({
        news_item: state.badGet
          ? [{ title: "different article" }]
          : articles.get(body.media_id),
      });
    }
    if (url.pathname.endsWith("/draft/batchget"))
      return send({
        total_count: articles.size,
        item: Array.from(articles)
          .slice(body.offset, body.offset + body.count)
          .map(([media_id, news_item]) => ({
            media_id,
            content: { news_item },
            update_time: Math.floor(Date.now() / 1000),
          })),
      });
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;
  const client = new WechatClient((url, init) => {
    const u = new URL(url);
    if (u.origin !== "https://api.weixin.qq.com")
      throw new Error("Unexpected origin");
    return fetch(`http://127.0.0.1:${port}` + u.pathname + u.search, init);
  });
  const memory = new Map<string, string>(),
    secrets = {
      get: async (k: string) => memory.get(k) || "",
      set: async (k: string, v: string) => {
        memory.set(k, v);
      },
    };
  return {
    client,
    secrets,
    state,
    calls,
    articles,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
