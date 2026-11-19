import { chromium, expect } from "playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { setupBrowser } from "./auth-helper.js";
const out = "test-results/deepseek-setup";
mkdirSync(out, { recursive: true });
const dataDir = mkdtempSync(join(process.cwd(), "test-results/settings-"));
const server = spawn(process.execPath, ["dist-server/server/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DEEPSEEK_API_KEY: "",
    ECUSTUDIO_DATA_DIR: dataDir,
    PORT: "37893",
  },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let browser: any;
try {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("startup timeout")), 15000);
    server.stdout.on("data", (c) => {
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
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e: any) => errors.push(e.message));
  let configured = false,
    probeMode = "success",
    probes = 0;
  await page.route("**/api/state", async (route: any) => {
    const r = await route.fetch(),
      body = await r.json();
    body.capabilities.deepseek = configured
      ? "configured"
      : "needs_configuration";
    await route.fulfill({ response: r, json: body });
  });
  await page.route("**/api/agent/probe", async (route: any) => {
    probes++;
    const r = await page.request.get("http://127.0.0.1:37893/api/state");
    const state = await r.json();
    assert.equal(
      state.settings.allowExternalAI,
      true,
      "consent must be persisted BEFORE probing",
    );
    assert.equal(
      state.settings.scheduleEnabled,
      false,
      "AI save must not commit monitoring",
    );
    if (probeMode === "failure")
      return route.fulfill({
        status: 502,
        json: { error: { message: "合成连接失败" } },
      });
    return route.fulfill({
      json: { ok: probeMode !== "empty", model: "fixture-only" },
    });
  });
  await setupBrowser(page, "http://127.0.0.1:37893");
  await page.goto("http://127.0.0.1:37893/#settings");
  await page.getByRole("heading", { name: "设置", exact: true }).waitFor();
  const consent = page.getByRole("checkbox", {
    name: "允许 DeepSeek 调用",
    exact: true,
  });
  await expect(
    page.getByRole("button", { name: "测试连接", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("第1步：先填写 API Key 并点击「保存密钥」。", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByText("高级设置：调用预算与超时").click();
  const budget = page.getByLabel("最大输出 token", {exact:true});
  await budget.fill("999999");
  await expect(page.getByRole("button",{name:"保存生成设置"})).toBeDisabled();
  await budget.fill("131072");
  await page.getByRole("button",{name:"保存生成设置"}).click();
  await expect(page.getByRole("button",{name:"保存生成设置"})).toBeDisabled();
  await page.reload();
  await page.getByText("高级设置：调用预算与超时").click();
  await expect(budget).toHaveValue("131072");
  configured = true;
  await page.reload();
  await expect(
    page.getByText("第2步：勾选「允许 DeepSeek 调用」，再保存并测试连接。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(consent).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "测试连接", exact: true }),
  ).toBeDisabled();
  assert.equal(probes, 0);
  await page.screenshot({
    path: out + "/permission-required.png",
    fullPage: true,
  });
  await consent.check();
  await page
    .getByRole("checkbox", { name: "启用每日自动更新", exact: true })
    .check();
  await expect(
    page.getByText(
      "授权或模型设置尚未保存。点击「保存并测试连接」即可生效，无需返回页面顶部。",
      { exact: true },
    ),
  ).toBeVisible();
  await page.route("**/api/settings/deepseek", async (route: any) =>
    route.fulfill({
      status: 409,
      json: { error: { message: "合成保存冲突" } },
    }),
  );
  await page
    .getByRole("button", { name: "保存并测试连接", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("合成保存冲突");
  assert.equal(probes, 0);
  await expect(consent).toBeChecked();
  await page.unroute("**/api/settings/deepseek");
  await page
    .getByRole("button", { name: "保存并测试连接", exact: true })
    .click();
  await expect(
    page.getByText("连接测试成功，可以开始使用 DeepSeek Agent。", {
      exact: true,
    }),
  ).toBeVisible();
  assert.equal(probes, 1);
  await expect(
    page.getByRole("checkbox", { name: "启用每日自动更新", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "测试连接", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(consent).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "启用每日自动更新", exact: true }),
  ).not.toBeChecked();
  await page
    .getByLabel("DeepSeek API Key", { exact: true })
    .fill("synthetic-unsaved-key");
  await expect(
    page.getByRole("button", { name: "测试连接", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("DeepSeek API Key", { exact: true }).fill("");
  probeMode = "failure";
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await expect(
    page.getByText("连接测试失败：合成连接失败", { exact: true }),
  ).toBeVisible();
  probeMode = "empty";
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await expect(
    page.getByText(
      "连接测试失败：DeepSeek 未返回有效测试内容，请检查模型配置后重试。",
      { exact: true },
    ),
  ).toBeVisible();
  await consent.uncheck();
  await expect(
    page.getByRole("button", { name: "保存并测试连接", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "保存 DeepSeek 设置", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "测试连接", exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(consent).not.toBeChecked();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  );
  await page
    .getByRole("group", { name: "DeepSeek 调用授权" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: out + "/permission-mobile.png" });
  assert.deepEqual(errors, []);
  writeFileSync(
    out + "/result.json",
    JSON.stringify(
      {
        status: "passed",
        apiCalls:
          "browser-intercepted test fixtures; no external DeepSeek call",
        checks: [
          "missing-key",
          "consent-off",
          "unsaved-consent",
          "save-before-probe",
          "save-failure-no-probe",
          "no-other-settings-commit",
          "unrelated-draft-preserved",
          "reload-persistence",
          "unsaved-key",
          "probe-failure",
          "empty-probe-rejected",
          "disable-authorization",
          "mobile",
        ],
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "DeepSeek settings E2E PASSED (isolated, no real credentials or model requests)",
  );
} finally {
  await browser?.close();
  server.kill();
}
