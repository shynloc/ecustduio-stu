import { chromium, expect } from "playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { fixtures } from "./ocr-fixtures.js";
import { setupBrowser } from "./auth-helper.js";
const out = "test-results/ocr-ui";
mkdirSync(out, { recursive: true });
const f = fixtures();
writeFileSync(out + "/source.png", f.png);
writeFileSync(out + "/scan.pdf", f.pdf);
const dir = mkdtempSync(join(process.cwd(), "test-results/ocr-ui-data-"));
const server = spawn(process.execPath, ["dist-server/server/index.js"], {
  env: {
    ...process.env,
    DEEPSEEK_API_KEY: "",
    ECUSTUDIO_DATA_DIR: dir,
    PORT: "37895",
  },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let browser: any;
try {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("startup timeout")), 20000);
    server.stdout.on("data", (c) => {
      if (c.toString().includes("已启动")) {
        clearTimeout(t);
        resolve();
      }
    });
  });
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:37895");
  await setupBrowser(page, "http://127.0.0.1:37895");
  await page.getByRole("button", { name: "导入一份资料", exact: true }).click();
  await page.getByRole("button", { name: "上传文件", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles(out + "/source.png");
  await expect(
    page.getByRole("status").filter({ hasText: /OCR已完成/ }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.getByLabel("提取预览", { exact: true })).toHaveValue(
    /北京教育考试院/,
  );
  await page.screenshot({
    path: out + "/image-preview-desktop.png",
    fullPage: true,
  });
  await page
    .getByLabel("提取预览", { exact: true })
    .fill(
      "[第 1 页]\nOCR校正测试资料，仅用于验证原文识别和事实引用，请勿作为真实政策使用。",
    );
  await page.getByLabel("标题（网址导入可留空自动提取）").fill("OCR界面自检");
  await page.getByRole("button", { name: "导入资料", exact: true }).click();
  await page
    .getByRole("button", { name: "查看资料与证据", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "OCR界面自检", exact: true })
    .waitFor();
  await expect(
    page.getByRole("link", { name: "查看原始文件", exact: true }),
  ).toBeVisible();
  await page.getByLabel("原文段落", { exact: true }).selectOption("p2");
  await page.getByRole("button", { name: "保存事实", exact: true }).click();
  await page.getByRole("button", { name: "加入创作", exact: true }).click();
  await page.getByRole("button", { name: "创建项目", exact: true }).click();
  await page
    .getByRole("button", { name: "从事实建立母稿", exact: true })
    .click();
  await page.getByLabel("内容块1标题", { exact: true }).waitFor();
  await page.screenshot({ path: out + "/master-desktop.png", fullPage: true });
  await page.goto("http://127.0.0.1:37895/#policies");
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  await page.getByRole("button", { name: "上传文件", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles(out + "/scan.pdf");
  await expect(
    page.getByRole("status").filter({ hasText: /OCR已完成，共2页/ }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.getByLabel("提取预览", { exact: true })).toHaveValue(
    /第 2 页/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({ path: out + "/scan-mobile.png", fullPage: true });
  await page.keyboard.press("Escape");
  await page.goto("http://127.0.0.1:37895/#tasks");
  await page.reload();
  await page
    .getByRole("heading", { name: "任务与自动化", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "本机OCR识别", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "校正并导入识别结果", exact: true })
    .click();
  await expect(page.getByLabel("提取预览", { exact: true })).toHaveValue(
    /第 2 页/,
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    out + "/result.json",
    JSON.stringify(
      {
        status: "passed",
        checks: [
          "image-auto-ocr",
          "editable-preview",
          "original-file-link",
          "page-reference",
          "claim",
          "master",
          "scanned-pdf-two-pages",
          "mobile",
          "resume-from-task",
        ],
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log("OCR browser workflow passed.");
} finally {
  await browser?.close();
  server.kill();
}
