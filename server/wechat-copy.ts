import * as cheerio from "cheerio";
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { articleLayout, imageKey } from "./wechat.js";
import { get, err } from "./db.js";

const imageCache = new Map<string, { url: string; until: number }>();
export async function prepareWechatCopy(
  note: any,
  options: any,
  user: any,
  accountId: string | undefined,
  client: any,
  secrets: any,
) {
  const layout = await articleLayout(note, options, user);
  const $ = cheerio.load(layout.html, null, false);
  const images = layout.inlineImages,
    imageCount = $("img").length;
  if (!accountId) {
    $("img").each((i, el) => {
      $(el).replaceWith(
        $("<p>")
          .attr(
            "style",
            "margin:16px 0;padding:16px;border:1px dashed #9aa4b2;color:#586579;font-size:13px;text-align:center;text-indent:0",
          )
          .text(
            "【请插入配图 " +
              String(i + 1).padStart(2, "0") +
              ($(el).attr("alt") ? "：" + $(el).attr("alt") : "") +
              "】",
          ),
      );
    });
    return {
      html: $.html(),
      imageCount,
      imagesReady: false,
      message: images.length
        ? "文字与排版已准备好。请下载配图，按正文中的编号插入；连接公众号后可自动转存图片。"
        : "文字与排版已准备好。",
    };
  }
  function guard() {
    const actor = get(
      "SELECT role,status,must_change_password FROM users WHERE id=?",
      user.id,
    );
    if (
      !actor ||
      actor.status !== "active" ||
      actor.must_change_password ||
      !["admin", "creator"].includes(actor.role)
    )
      err("FORBIDDEN", "账号权限已变化，请重新登录。", 403);
    const a = get("SELECT * FROM wechat_accounts WHERE enabled=1");
    if (!a || a.id !== accountId)
      err(
        "WECHAT_CONNECTION_CHANGED",
        "公众号连接已变化，请刷新后再复制。",
        409,
      );
    return a;
  }
  const account = guard(),
    secret = await secrets.get("wechat." + account.id);
  if (!secret)
    err("WECHAT_NOT_CONNECTED", "公众号凭据不可用，请在设置中重新连接。", 422);
  const destinations = new Map<string, string>();
  const signal = AbortSignal.timeout(90000);
  for (const image of images) {
    guard();
    const key =
      account.id +
      ":" +
      account.verified_at +
      ":" +
      createHash("sha256").update(image.bytes).digest("hex");
    const old = imageCache.get(key);
    let url =
      old && old.until > Date.now()
        ? old.url
        : await client.image(account, secret, image.bytes, false, signal);
    const parsed = new URL(url);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      !(
        parsed.hostname === "qpic.cn" || parsed.hostname.endsWith(".qpic.cn")
      ) ||
      parsed.username ||
      parsed.password
    )
      err("WECHAT_IMAGE_RESPONSE", "微信未返回有效配图地址，请重试。", 502);
    parsed.protocol = "https:";
    url = parsed.href;
    guard();
    if (imageCache.size >= 256)
      imageCache.delete(imageCache.keys().next().value!);
    imageCache.set(key, { url, until: Date.now() + 600000 });
    destinations.set(image.key, url);
  }
  $("img").each((_, el) => {
    $(el).attr("src", destinations.get(imageKey($(el).attr("src")!))!);
  });
  guard();
  return {
    html: $.html(),
    imageCount,
    imagesReady: true,
    message:
      "排版和 " + imageCount + " 张配图已准备好，请粘贴到微信公众号正文。",
  };
}

export async function articleImageZip(note: any, options: any, user: any) {
  const layout = await articleLayout(note, options, user),
    $ = cheerio.load(layout.html, null, false),
    zip = new AdmZip();
  const map = new Map(layout.inlineImages.map((x) => [x.key, x]));
  $("img").each((i, el) => {
    const image = map.get(imageKey($(el).attr("src")!));
    if (image)
      zip.addFile(
        String(i + 1).padStart(2, "0") +
          "-article-image." +
          (image.mime === "image/png" ? "png" : "jpg"),
        image.bytes,
      );
  });
  zip.addFile(
    "使用说明.txt",
    Buffer.from(
      "在公众号后台粘贴正文后，按【请插入配图 01】等编号插入对应图片，再删除编号提示。\n连接公众号后，工作台的“复制到公众号”会自动转存配图。\n",
    ),
  );
  return zip.toBuffer();
}
