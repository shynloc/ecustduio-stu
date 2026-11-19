import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect } from "playwright/test";
import { testBrowser } from "./browser-helper.js";
import { setupBrowser } from "./auth-helper.js";
mkdirSync("test-results", { recursive: true });
const out = resolve("test-results/experience-performance");
mkdirSync(out, { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  resolve("test-results/performance-data-"),
);
process.env.ECUSTUDIO_WEB_DIR = resolve("dist");
const D = await import("../server/db.js"),
  { buildApp } = await import("../server/app.js"),
  app = await buildApp(false),
  url = await app.listen({ host: "127.0.0.1", port: 0 }),
  browser = await testBrowser();
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: out, size: { width: 960, height: 640 } },
  }),
  page = await context.newPage(),
  measurements: any[] = [];
try {
  await context.addInitScript(() => {
    const w = window as any;
    w.renderTimes = [];
    for (const type of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const original = type.prototype.clear;
      type.prototype.clear = function (mask: number) {
        if ((this.canvas as HTMLCanvasElement)?.closest?.(".workspace-scene")) {
          w.renderTimes.push(performance.now());
          if (w.renderTimes.length > 2000) w.renderTimes.shift();
        }
        return original.call(this, mask);
      };
    }
  });
  await setupBrowser(page, url);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await cdp.send("Network.clearBrowserCache");
    const t = Date.now();
    await page.goto(url + "/?measure="+width+"#dashboard", { waitUntil: "commit" });
    await expect(page.getByLabel("首页任务要求")).toBeEditable();
    const inputReadyMs = Date.now() - t;
    assert.ok(inputReadyMs < 12000, "cold input must not wait for heavy scene");
    await expect(page.locator(".workspace-scene")).toBeVisible();
    await page.waitForTimeout(1000);
    const before = await cdp.send("Performance.getMetrics");
    await page.evaluate(() => {
      (window as any).renderTimes = [];
    });
    const start = Date.now();
    await page.waitForTimeout(3500);
    const seconds = (Date.now() - start) / 1000,
      after = await cdp.send("Performance.getMetrics"),
      times: number[] = await page.evaluate(() => (window as any).renderTimes);
    const task = (x: any) =>
      x.metrics.find((m: any) => m.name === "TaskDuration").value;
    measurements.push({
      width,
      inputReadyMs,
      webgl: !!times.length,
      renderFPS: times.length / seconds,
      browserMainThreadPercent: ((task(after) - task(before)) / seconds) * 100,
      resourceBytes: await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .reduce((n: number, r: any) => n + (r.transferSize || 0), 0),
      ),
    });
    await page.getByLabel("首页任务要求").fill("根据资料整理一份教学简报");
    await page.getByRole("button", { name: "选择资料", exact: true }).click();
    await expect(page.getByLabel("搜索上下文资料")).toBeVisible();
    await page.getByRole("button", { name: "使用这些资料" }).click();
    await page.getByRole("button", { name: "暂停动效" }).click();
    await expect(page.locator(".scene-fallback")).toBeVisible();
    await page.getByRole("button", { name: "开启动效" }).click();
  }
  const offline = await context.newPage();
  await offline.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as any).getContext = function (
      type: string,
      ...args: any[]
    ) {
      if (type.includes("webgl")) return null;
      return (original as any).call(this, type, ...args);
    };
  });
  await offline.goto(url + "/#dashboard");
  await expect(offline.locator(".scene-fallback")).toBeVisible();
  await expect(offline.getByLabel("首页任务要求")).toBeEditable();
  await offline
    .locator(".scene-navigation")
    .getByRole("button", { name: "知识库", exact: true })
    .click();
  await expect(offline).toHaveURL(/#notes$/);
  await offline.close();
  writeFileSync(
    out + "/result.json",
    JSON.stringify(
      {
        ok: true,
        environment:
          "headless Chromium/Edge on current host; viewport simulation",
        checks: [
          "cold input readiness",
          "actual WebGL render frequency and main thread time",
          "desktop/mobile interactive recording",
          "animation toggle",
          "no WebGL functional navigation",
        ],
        measurements,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ ok: true, measurements }));
} finally {
  await context.close();
  await browser.close();
  await app.close();
  D.db.close();
}
