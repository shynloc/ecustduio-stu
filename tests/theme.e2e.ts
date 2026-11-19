import { chromium, expect } from "playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { setupBrowser, testAccount } from "./auth-helper.js";
const out = "test-results/themes";
mkdirSync(out, { recursive: true });
const dir = mkdtempSync(join(process.cwd(), "test-results/theme-"));
let server: any, browser: any;
async function start() {
  server = spawn(process.execPath, ["dist-server/server/index.js"], {
    env: {
      ...process.env,
      DEEPSEEK_API_KEY: "",
      ECUSTUDIO_DATA_DIR: dir,
      PORT: "37894",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("start timeout")), 15000);
    server.stdout.on("data", (c: any) => {
      if (c.toString().includes("已启动")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("server exited"));
    });
  });
}
try {
  await start();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors: string[] = [];
  page.on("pageerror", (e: any) => errors.push(e.message));
  const url = "http://127.0.0.1:37894";
  await page.goto(url + "/#settings");
  await setupBrowser(page, url);
  await page.goto(url + "/#settings");
  await page.getByRole("region", { name: "界面主题" }).waitFor();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "scholar");
  const theme = page.getByRole("region", { name: "界面主题" }),
    dark = theme.getByRole("button", { name: /曜石/ }),
    light = theme.getByRole("button", { name: /晴空/ });
  await page
    .getByLabel("模型名称", { exact: true })
    .fill("unsaved-model-fixture");
  await dark.click();
  await expect(dark).toHaveAttribute("aria-pressed", "true");
  await expect(theme.getByRole("status")).toContainText("主题已保存");
  await expect(page.getByLabel("模型名称", { exact: true })).toHaveValue(
    "unsaved-model-fixture",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "obsidian");
  await expect(page.getByLabel("模型名称", { exact: true })).toHaveValue(
    "deepseek-flash",
  );
  await page.screenshot({
    path: out + "/settings-desktop.png",
    fullPage: true,
  });
  const session = await fetch(url + "/api/session");
  const anonCookie = session.headers.get("set-cookie")!.split(";")[0],
    anon = (await session.json()) as any;
  const login = await fetch(url + "/api/auth/login", {
    method: "POST",
    headers: {
      cookie: anonCookie,
      "x-csrf-token": anon.csrf,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username: testAccount.username,
      password: testAccount.password,
    }),
  });
  const cookie = login.headers.get("set-cookie")!.split(";")[0],
    { csrf } = (await login.json()) as any;
  async function api(path: string, body?: any) {
    const r = await fetch(url + "/api" + path, {
      method: body ? "POST" : "GET",
      headers: {
        cookie,
        "x-csrf-token": csrf,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const value: any = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(value));
    return value;
  }
  let state = await api("/state");
  assert.equal(state.settings.theme, "obsidian");
  assert.equal(state.settings.autoSend, false);
  assert.equal(state.settings.scheduleEnabled, false);
  const scope = {
    region: "北京",
    district: "全市",
    stage: "中考",
    year: 2027,
    audience: "合成界面测试",
  };
  const job = await api("/imports", {
    text: "【合成主题测试】此资料仅用于验证深色界面的原文、表单和编辑器，不是真实政策。\n需要保留条件与引用，生成内容应审核后再发布。",
    title: "曜石界面测试资料",
    scope,
  });
  let snapshot: any;
  for (let i = 0; i < 20; i++) {
    const j = await api("/jobs/" + job.id);
    if (j.state === "succeeded") {
      snapshot = j.result;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(snapshot);
  const project = await api("/projects", {
    title: "主题编辑器合成验收",
    scope,
    snapshotIds: [snapshot.id],
  });
  await api("/projects/" + project.id + "/master-template", {
    expectedRevision: project.revision,
  });
  for (const route of [
    "dashboard",
    "policies",
    "topics",
    "projects",
    "library",
    "results",
    "tasks",
    "settings",
    "snapshot/" + snapshot.id,
    "project/" + project.id,
  ]) {
    await page.goto(url + "/#" + route);
    await page.reload();
    await page.locator("main h1").waitFor();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      "obsidian",
    );
    await page.evaluate(() =>
      Promise.all(
        document.getAnimations().map((a) => a.finished.catch(() => {})),
      ),
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      route + " desktop overflow",
    );
    const bg = await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.ok(bg === "rgba(0, 0, 0, 0)" || bg === "rgb(9, 13, 19)");
    if (["dashboard", "project/" + project.id].includes(route))
      await page.screenshot({
        path:
          out +
          "/" +
          (route.startsWith("project/") ? "editor" : "dashboard") +
          "-desktop.png",
        fullPage: true,
      });
  }
  await page.goto(url + "/#dashboard");
  await page.getByRole("button", { name: "导入一份资料", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: out + "/modal-desktop.png" });
  await page.keyboard.press("Escape");
  await page.locator(".evidence-node").first().click();
  await expect(page).toHaveURL(/#policies$/);
  await page.goto(url + "/#settings");
  await page.route("**/api/settings/theme", (route) =>
    route.fulfill({
      status: 500,
      json: { error: { message: "合成保存失败" } },
    }),
  );
  await light.click();
  await expect(theme.getByRole("status")).toContainText("主题保存失败");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "obsidian");
  assert.equal(
    await page.evaluate(() => localStorage.getItem("ecustudio:theme")),
    "obsidian",
  );
  await page.unroute("**/api/settings/theme");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "dashboard",
    "policies",
    "settings",
    "project/" + project.id,
  ]) {
    await page.goto(url + "/#" + route);
    await page.reload();
    await page.locator("main h1").waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      route + " mobile overflow",
    );
    await page.screenshot({
      path:
        out +
        "/" +
        (route.startsWith("project/") ? "editor" : route) +
        "-mobile.png",
      fullPage: true,
    });
  }
  await page.goto(url + "/#dashboard");
  await page.getByRole("button", { name: "打开导航" }).click();
  await page
    .locator("nav")
    .getByRole("link", { name: "设置", exact: true })
    .click();
  await theme.waitFor();
  await light.scrollIntoViewIfNeeded();
  await light.click();
  await expect(light).toHaveAttribute("aria-pressed", "true");
  await expect(theme.getByRole("status")).toContainText("主题已保存");
  await dark.click();
  await expect(theme.getByRole("status")).toContainText("主题已保存");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "obsidian");
  server.kill();
  await new Promise<void>((resolve) => server.once("exit", () => resolve()));
  await start();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "obsidian");
  await theme.waitFor();
  await light.click();
  await expect(theme.getByRole("status")).toContainText("主题已保存");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "scholar");
  assert.deepEqual(errors, []);
  writeFileSync(
    out + "/result.json",
    JSON.stringify(
      {
        status: "passed",
        desktop: "1440x1000",
        mobile: "390x844",
        browserErrors: errors,
        checks: [
          "default-scholar",
          "auto-save",
          "only-theme-saved",
          "other-draft-retained",
          "reload",
          "restart",
          "all-pages",
          "editor",
          "modal",
          "evidence-navigation",
          "failure-rollback",
          "local-cache-rollback",
          "mobile-navigation",
          "reduced-motion",
          "restore-default",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "Theme E2E passed: desktop, mobile, persistence, rollback and restore default.",
  );
} finally {
  await browser?.close();
  server?.kill();
}
