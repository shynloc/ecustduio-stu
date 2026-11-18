import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { setupBrowser } from "./auth-helper.js";
mkdirSync("test-results/screens", { recursive: true });
const dataDir = mkdtempSync(join(process.cwd(), "test-results/e2e-"));
const server = spawn(process.execPath, ["dist-server/server/index.js"], {
  cwd: process.cwd(),
  env: { ...process.env, ECUSTUDIO_DATA_DIR: dataDir, PORT: "37892" },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise<void>((resolve, reject) => {
  const timer = setTimeout(
    () => reject(new Error("Server startup timeout")),
    15000,
  );
  server.stdout.on("data", (c) => {
    if (c.toString().includes("已启动")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.stderr.on("data", (c) => console.error(c.toString()));
  server.on("exit", (c) => {
    if (c) reject(new Error("Server exit " + c));
  });
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch {
  browser = await chromium.launch({ channel: "msedge", headless: true });
}
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:37892");
  await setupBrowser(page, "http://127.0.0.1:37892");
  await page
    .getByRole("heading", { name: "今日工作台", exact: true })
    .waitFor();
  await page.screenshot({
    path: "test-results/screens/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "导入一份资料", exact: true }).click();
  await page.getByRole("button", { name: "粘贴原文", exact: true }).click();
  await page
    .getByLabel("原文内容", { exact: true })
    .fill(
      "【合成界面测试，不是真实政策】\n这份资料用于验证工作台的导入、核验和编辑功能，请勿作为教育政策使用。",
    );
  await page
    .getByLabel("标题（网址导入可留空自动提取）")
    .fill("界面自动化测试材料");
  await page.getByLabel("材料性质", { exact: true }).selectOption("正式文件");
  await page.getByLabel("发布日期（未知请留空）").fill("2026-11-08");
  await page.getByRole("button", { name: "导入资料", exact: true }).click();
  await page
    .getByRole("button", { name: "查看资料与证据", exact: true })
    .waitFor({ timeout: 15000 });
  await page
    .getByRole("button", { name: "查看资料与证据", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "界面自动化测试材料", exact: true })
    .waitFor();
  await page.getByLabel("原文段落", { exact: true }).selectOption("p2");
  await page.getByRole("button", { name: "保存事实", exact: true }).click();
  await page.getByRole("button", { name: "核验与标记", exact: true }).waitFor();
  await page.getByRole("button", { name: "核验与标记", exact: true }).click();
  await page.getByLabel("核验状态", { exact: true }).selectOption("verified");
  await page
    .getByLabel("核验依据／原因")
    .fill("仅合成回归测试，已核对原文范围。");
  await page
    .getByLabel("我已检查地区、学段、年度、对象和条件，与原文一致。")
    .check();
  await page.getByRole("button", { name: "保存核验记录", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.screenshot({
    path: "test-results/screens/source-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "加入创作", exact: true }).click();
  await page.getByRole("button", { name: "创建项目", exact: true }).click();
  await page
    .getByRole("button", { name: "从事实建立母稿", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "从事实建立母稿", exact: true })
    .click();
  await page.getByLabel("内容块1标题", { exact: true }).waitFor();
  await page
    .getByLabel("内容块1标题", { exact: true })
    .fill("界面编辑后的事实标题");
  await page
    .getByText("工作草稿已自动保存", { exact: true })
    .waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await page.getByRole("button", { name: "确认当前版本", exact: true }).click();
  await page.getByText("当前版本已确认", { exact: true }).waitFor();
  const projectUrl = page.url();
  await page.screenshot({
    path: "test-results/screens/project-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "生成文件", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("link", { name: "成果与日报", exact: true })
    .click();
  await page
    .getByRole("link", { name: "下载", exact: true })
    .first()
    .waitFor({ timeout: 30000 });
  await page.goto(projectUrl);
  await page.getByRole("button", { name: "交付打包", exact: true }).click();
  await page.getByRole("dialog").getByRole("checkbox").first().check();
  await page
    .getByRole("button", { name: "生成项目交付包", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: /下载 EcuStudio_project_/ })
    .waitFor();
  await page.keyboard.press("Escape");
  await page
    .locator("nav")
    .getByRole("link", { name: "政策情报", exact: true })
    .click();
  await page.getByRole("button", { name: "高考", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("link", { name: "选题策划", exact: true })
    .click();
  await page
    .locator("nav")
    .getByRole("link", { name: "政策情报", exact: true })
    .click();
  assert.ok(
    (
      await page
        .getByRole("button", { name: "高考", exact: true })
        .getAttribute("class")
    )?.includes("active"),
  );
  await page.getByRole("button", { name: "全部", exact: true }).click();
  for (const name of ["选题策划", "素材与知识", "任务与自动化", "设置"]) {
    await page.locator("nav").getByRole("link", { name, exact: true }).click();
    await page.getByRole("heading", { name, exact: true }).waitFor();
  }
  await page.screenshot({
    path: "test-results/screens/settings-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:37892/#dashboard");
  await page
    .getByRole("heading", { name: "今日工作台", exact: true })
    .waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "mobile horizontal overflow",
  );
  await page.screenshot({
    path: "test-results/screens/dashboard-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "打开导航" }).click();
  await page
    .locator("nav")
    .getByRole("link", { name: "政策情报", exact: true })
    .click();
  await page.getByRole("heading", { name: "政策情报", exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector(".sidebar")!.getBoundingClientRect().right <= 1,
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: "test-results/screens/policies-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  writeFileSync(
    "test-results/e2e-result.json",
    JSON.stringify(
      {
        status: "passed",
        desktop: "1440x1000",
        mobile: "390x844",
        browserErrors: errors,
        flows: [
          "import",
          "claim",
          "verify",
          "project",
          "master",
          "autosave",
          "version",
          "review",
          "docx-export",
          "project-zip",
          "filter-restoration",
          "navigation",
          "mobile",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "E2E PASSED: import → evidence → project → autosave → version review → DOCX; desktop and mobile",
  );
} finally {
  await browser.close();
  server.kill();
}
