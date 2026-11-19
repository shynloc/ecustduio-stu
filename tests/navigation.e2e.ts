import { expect, type Page } from "playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { testBrowser } from "./browser-helper.js";
import { setupBrowser } from "./auth-helper.js";

const out = resolve("test-results/navigation-ui");
mkdirSync(out, { recursive: true });
process.env.ECUSTUDIO_DATA_DIR = mkdtempSync(
  resolve("test-results/navigation-data-"),
);
process.env.ECUSTUDIO_WEB_DIR = resolve("dist");
const { buildApp } = await import("../server/app.js");
const { saveSnapshot, createProject } = await import("../server/domain.js");
const { storeWorkflowArtifact } = await import("../server/workflows.js");
const { db } = await import("../server/db.js");
const app = await buildApp(false);
const url = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await testBrowser();
const nav = (page: Page) =>
  page.getByRole("navigation", { name: "主导航", exact: true });
const entries = [
  "工作台",
  "资料库",
  "知识库",
  "AI 创作对话",
  "内容创作",
  "项目",
  "成果库",
  "任务中心",
  "设置",
];

async function post(page: Page, path: string, body: unknown) {
  const { csrf } = await (await page.request.get(url + "/api/session")).json();
  const r = await page.request.post(url + path, {
    headers: { "x-csrf-token": csrf },
    data: body,
  });
  assert.equal(r.status(), 200, path);
  return r.json();
}
try {
  const scope = { year: 2026 };
  const createSource = (text: string) =>
    saveSnapshot({
      title: "课堂活动安排",
      url: "https://example.org/class-plan",
      scope,
      text,
    });
  const first = createSource(
    "本周课堂活动安排在周二上午，所有小组提前准备观察材料。",
  );
  const project = createProject({
    title: "课堂观察",
    snapshotIds: [first.id],
    scope,
  });
  const latest = createSource(
    "本周课堂活动调整为周三上午，请所有小组重新核对观察材料。",
  );
  const sample = storeWorkflowArtifact(
    Buffer.from("合成验收资料"),
    "课堂观察.txt",
    "txt",
    "sample-navigation",
    project.id,
  );
  const admin = await browser.newPage({
    viewport: { width: 1440, height: 980 },
  });
  const errors: string[] = [];
  admin.on("pageerror", (e) => errors.push(e.message));
  await setupBrowser(admin, url);
  await expect(nav(admin).locator(":scope > a")).toHaveText(entries);
  await admin
    .getByRole("link", { name: "内容创作", exact: true })
    .click();
  await expect(admin).toHaveURL(/#library$/);
  await expect(nav(admin).locator('a[aria-current="page"]')).toHaveText(
    "内容创作",
  );
  await admin.screenshot({
    path: out + "/desktop.png",
    animations: "disabled",
  });
  await admin.getByRole("link", { name: "描述需求", exact: true }).click();
  await expect(admin.getByLabel("任务要求")).toBeVisible();
  await expect(admin.getByLabel("受众", { exact: true })).toBeHidden();
  await admin.getByRole("link", { name: "文字配音", exact: true }).click();
  await expect(
    admin.getByRole("heading", { name: "文字配音", exact: true }),
  ).toBeVisible();
  await expect(admin.getByLabel("媒体文件")).toHaveCount(0);
  await nav(admin).getByRole("link", { name: "资料库", exact: true }).click();
  await admin
    .getByRole("button", { name: "查看更新影响", exact: true })
    .click();
  await expect(admin).toHaveURL(new RegExp("#impacts/" + latest.id));
  await expect(
    admin.getByRole("heading", { name: "可能受影响的内容" }),
  ).toBeVisible();
  await admin.getByRole("button", { name: project.title, exact: true }).click();
  await expect(admin).toHaveURL(new RegExp("#project/" + project.id));
  await expect(nav(admin).locator('a[aria-current="page"]')).toHaveText("项目");
  await nav(admin).getByRole("link", { name: "成果库" }).click();
  await expect(
    admin.getByRole("heading", { name: "成果库", exact: true }),
  ).toBeVisible();
  await admin
    .getByLabel("按项目筛选", { exact: true })
    .selectOption(project.id);
  await admin.getByLabel("筛选成果格式", { exact: true }).selectOption("txt");
  await admin.getByLabel("搜索成果").fill("课堂");
  const file = admin.getByRole("link", { name: "下载", exact:true });
  assert.ok(
    (await admin.request.get(url + (await file.getAttribute("href")))).ok(),
  );
  await admin.getByLabel("选择 "+sample.name).check();
  const popup=admin.waitForEvent("popup");await admin.getByRole("button", { name: "打包下载",exact:true }).click();const zip=await popup;await zip.close();await expect(admin.locator(".collection-feedback")).toContainText("打包完成");
  await nav(admin).getByRole("link", { name: "任务中心" }).click();
  await admin.getByRole("button", { name: "管理计划" }).click();
  await expect(admin.locator("#schedule-settings")).toBeFocused();
  await admin.getByRole("link", { name: "成员与权限", exact: true }).click();
  await expect(
    admin.getByRole("heading", { name: "成员与权限" }),
  ).toBeVisible();
  for (const role of ["creator", "sales"]) {
    const username = "navigation-" + role,
      password = "Initial-test-password!";
    await post(admin, "/api/auth/users", {
      username,
      role,
      displayName: "导航验收" + role,
      password,
    });
    const page = await browser.newPage();
    await post(page, "/api/auth/login", { username, password });
    await post(page, "/api/auth/password", {
      currentPassword: password,
      newPassword: "New-test-password!",
    });
    await page.goto(url + "/#accounts");
    if (role === "creator") {
      await expect(nav(page).locator(":scope > a")).toHaveText(entries);
      await expect(
        page.getByText("当前账号无权管理工作台成员。"),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "成员与权限" })).toHaveCount(
        0,
      );
      assert.equal(
        (await page.request.get(url + "/api/auth/users")).status(),
        403,
      );
    } else {
      await expect(nav(page).locator(":scope > a")).toHaveText([
        "政策资料",
        "可用成果",
      ]);
      await nav(page).getByRole("link", { name: "可用成果" }).click();
      await expect(
        page.getByRole("heading", { name: "可用成果" }),
      ).toBeVisible();
      assert.equal(
        (
          await page.request.get(
            url + "/api/artifacts/" + sample.id + "/download",
          )
        ).status(),
        403,
      );
    }
    await page.close();
  }
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.getByRole("button", { name: "打开导航" }).click();
  await expect(admin.getByRole("button", { name: "收起导航" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect
    .poll(() =>
      nav(admin).evaluate((el) => Math.round(el.getBoundingClientRect().left)),
    )
    .toBeGreaterThanOrEqual(0);
  await admin.screenshot({ path: out + "/mobile.png", animations: "disabled" });
  await nav(admin).getByRole("link", { name: "知识库", exact: true }).click();
  await expect(admin.getByRole("heading", { name: "知识库" })).toBeVisible();
  await expect(admin.getByRole("button", { name: "打开导航" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Navigation passed: creative entry, source versions, project and artifact filters, bundle, settings, three roles, mobile drawer.",
  );
} finally {
  await browser.close();
  await app.close();
  db.close();
}
