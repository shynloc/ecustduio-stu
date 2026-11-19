import type { HtmlBundle } from "./html-film-snapshot.js";
import { chromium } from "playwright";
import { load } from "cheerio";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { err } from "./db.js";
import { ffmpegPath } from "./visual-runtime.js";
import { paginateText } from "../shared/visual.js";

export type HtmlFilm = {
  assetId: string;
  mode: "original" | "storyboard";
  aspect: "landscape" | "portrait" | "square";
  narrated: boolean;
  bundle?: HtmlBundle;
};
export function htmlSections(html: string) {
  const $ = load(html);
  $("script,style,template,noscript,head,[hidden]").remove();
  const sections: { page: number; title: string; text: string }[] = [];
  let heading = "",
    lines: string[] = [];
  const flush = () => {
    if (!heading && !lines.length) return;
    const text = lines.join("\n").trim() || heading;
    for (const part of paginateText(text, 210))
      sections.push({
        page: sections.length + 1,
        title: heading || "网页内容",
        text: part,
      });
    lines = [];
  };
  function visit(node: any) {
    if (node.type === "text") {
      lines.push(node.data);
      return;
    }
    if (/^h[1-6]$/.test(node.name)) {
      flush();
      heading = $(node).text().trim();
      return;
    }
    for (const child of node.children || []) visit(child);
  }
  const main = $("main,article").first();
  visit((main.length ? main : $("body"))[0]);
  flush();
  if (
    sections.length > 1 &&
    sections[0].title === "网页内容" &&
    sections[0].text.length < 55
  )
    sections.shift();
  sections.forEach((section, i) => (section.page = i + 1));
  return sections;
}
const escape = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
function storyboard(scenes: { title: string; text: string }[]) {
  return (
    '<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;color:#173c36;background:#f7f4eb;font:3.3vmin/1.6 system-ui,sans-serif}article{padding:8vmin;height:100vh;display:flex;flex-direction:column;justify-content:center}article[hidden]{display:none}h1{font-size:6vmin;line-height:1.2;margin:0 0 3vmin}p{white-space:pre-line;margin:0}small{color:#59746e;margin-bottom:3vmin}</style>' +
    scenes
      .map(
        (s, i) =>
          "<article " +
          (i ? "hidden" : "") +
          "><small>" +
          (i + 1) +
          " / " +
          scenes.length +
          "</small><h1>" +
          escape(s.title) +
          "</h1><p>" +
          escape(s.text) +
          "</p></article>",
      )
      .join("")
  );
}

// Load only the submitted document in a fresh browser. The app session, cookies,
// file system URLs, external resources and workers are unavailable to the page.
export async function renderHtmlFilm({
  html,
  film,
  seconds,
  scenes,
  timeline,
  resources,
  audioPath,
  output,
  signal,
  progress,
  check,
}: {
  html: string;
  film: HtmlFilm;
  seconds: number;
  scenes: { title: string; text: string }[];
  timeline: { start: number }[];
  resources: Map<string, { bytes: Buffer; type: string; finalUrl: string }>;
  audioPath?: string;
  output: string;
  signal: AbortSignal;
  progress: any;
  check: () => void;
}) {
  const width = film.aspect === "landscape" ? 1280 : 720,
    height = film.aspect === "portrait" ? 1280 : 720;
  const fps = 15,
    frames = Math.ceil(seconds * fps);
  const documentUrl = new URL(
    film.bundle?.url || "https://render.invalid/document",
  );
  documentUrl.hash = "";
  const address = documentUrl.href;
  const src = film.mode === "original" ? html : storyboard(scenes);
  const browser = await chromium.launch({
    chromiumSandbox: true,
    args: [
      "--disable-background-networking",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--proxy-server=http://127.0.0.1:9",
      "--proxy-bypass-list=<-loopback>",
    ],
  });
  const timeout = AbortSignal.any([
    signal,
    AbortSignal.timeout(Math.max(90000, seconds * 4000)),
  ]);
  const stop = () => {
    void browser.close().catch(() => {});
  };
  timeout.addEventListener("abort", stop, { once: true });
  let encoder: ReturnType<typeof spawn> | undefined;
  try {
    timeout.throwIfAborted();
    check();
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      acceptDownloads: false,
      serviceWorkers: "block",
      locale: "zh-CN",
      timezoneId: "UTC",
      reducedMotion: "no-preference",
      offline: true,
    });
    let loaded = false,
      missing = false,
      scriptError = false;
    await context.route("**/*", async (route) => {
      if (
        !loaded &&
        route.request().isNavigationRequest() &&
        route.request().url() === address
      ) {
        loaded = true;
        return route.fulfill({
          status: 200,
          contentType: "text/html;charset=utf-8",
          headers: {
            "Content-Security-Policy":
              "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' data: http: https:; style-src 'unsafe-inline' data: http: https:; img-src data: blob: http: https:; font-src data: http: https:; media-src data: blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri https: http:; form-action 'none'",
          },
          body: src,
        });
      }
      const request = route.request(),
        f = resources.get(request.url());
      if (!request.isNavigationRequest() && request.method() === "GET" && f) {
        if (f.finalUrl !== request.url())
          return route.fulfill({
            status: 302,
            headers: { Location: f.finalUrl },
          });
        return route.fulfill({
          status: 200,
          contentType: f.type,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: f.bytes,
        });
      }
      missing = true;
      await route.abort();
    });
    const p = await context.newPage();
    p.setDefaultTimeout(15000);
    p.on("pageerror", () => {
      scriptError = true;
    });
    await p.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => {
        if (
          [
            "img-src",
            "font-src",
            "style-src-elem",
            "script-src-elem",
            "media-src",
            "frame-src",
            "connect-src",
            "worker-src",
          ].includes(e.effectiveDirective)
        )
          document.documentElement.dataset.ecuBlocked = "yes";
      });
    });
    const epoch = new Date("2024-01-01T00:00:00Z");
    await p.clock.install({ time: epoch });
    await p.clock.pauseAt(new Date(epoch.getTime() + 1000));
    await p.goto(address, { waitUntil: "load", timeout: 20000 });
    await p.evaluate(async () => {
      for (const image of document.images) image.loading = "eager";
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((img) => img.decode().catch(() => {})),
      );
    });
    const cdp = await context.newCDPSession(p);
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "image2pipe",
      "-framerate",
      String(fps),
      "-vcodec",
      "mjpeg",
      "-i",
      "pipe:0",
      ...(audioPath ? ["-i", audioPath, "-c:a", "aac"] : []),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-threads",
      "2",
      "-pix_fmt",
      "yuv420p",
      "-t",
      String(seconds),
      "-movflags",
      "+faststart",
      output,
    ];
    encoder = spawn(ffmpegPath(), args, {
      signal: timeout,
      stdio: ["pipe", "ignore", "pipe"],
      windowsHide: true,
    });
    const pipe = encoder.stdin!;
    let stderr = "";
    encoder.stderr!.on("data", (b) => {
      stderr = (stderr + b).slice(-1000);
    });
    pipe.on("error", () => {});
    const done = once(encoder, "close");
    void done.catch(() => {});
    let last = 0;
    for (let i = 0; i < frames; i++) {
      timeout.throwIfAborted();
      if (i % fps === 0) {
        check();
        progress("render", {
          message: "正在渲染网页 " + Math.round((i / frames) * 100) + "%",
        });
      }
      const ms = Math.round((i * 1000) / fps);
      if (ms > last) await p.clock.runFor(ms - last);
      last = ms;
      const index = timeline.reduce(
        (idx, s, j) => (ms / 1000 >= s.start ? j : idx),
        0,
      );
      const blocked = await p.evaluate(
        ({ ms, index, original, seconds }) => {
          if (document.documentElement.dataset.ecuBlocked === "yes")
            return true;
          if (!original) {
            document
              .querySelectorAll<HTMLElement>("article")
              .forEach((el, j) => (el.hidden = j !== index));
            return false;
          }
          const w = window as any;
          const starts: WeakMap<Animation, number> = (w.__ecuCaptureStarts ??=
            new WeakMap());
          for (const a of document.getAnimations()) {
            if (a.playState === "paused" || a.playState === "idle") continue;
            if (!starts.has(a))
              starts.set(a, ms === 0 ? 0 : ms - Number(a.currentTime || 0));
            a.currentTime = (ms - starts.get(a)!) * a.playbackRate;
          }
          for (const svg of document.querySelectorAll("svg")) {
            svg.pauseAnimations();
            svg.setCurrentTime(ms / 1000);
          }
          const max = document.documentElement.scrollHeight - innerHeight;
          if (
            w.__ecuScrollY !== undefined &&
            Math.abs(scrollY - w.__ecuScrollY) > 2
          )
            w.__ecuPageScroll = true;
          if (max > 2 && !w.__ecuPageScroll)
            window.scrollTo({
              top:
                max *
                Math.max(0, Math.min(1, (ms / 1000 / seconds - 0.08) / 0.84)),
              behavior: "instant",
            });
          w.__ecuScrollY = scrollY;
          return false;
        },
        { ms, index, original: film.mode === "original", seconds },
      );
      if (blocked || missing || p.url() !== address)
        err(
          "HTML_RESOURCES",
          "网页依赖未内嵌的资源或联网功能，请将样式、字体、脚本和图片内嵌到 HTML 后重试。",
          422,
        );
      if (scriptError)
        err(
          "HTML_SCRIPT",
          "网页脚本无法在离线渲染环境运行，请检查 HTML 或改用分镜。",
          422,
        );
      const jpg = await p.screenshot({
        type: "jpeg",
        quality: 88,
        timeout: 15000,
      });
      if (pipe.destroyed) throw new Error("视频编码器提前退出：" + stderr);
      await new Promise<void>((resolve, reject) =>
        pipe.write(jpg, (e) => (e ? reject(e) : resolve())),
      );
    }
    pipe.end();
    const [code] = await done;
    if (code !== 0) throw new Error("视频编码失败：" + stderr);
    return { width, height, fps, frames };
  } finally {
    encoder?.kill();
    timeout.removeEventListener("abort", stop);
    await browser.close();
  }
}
