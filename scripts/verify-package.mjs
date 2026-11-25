import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath;
assert(npmCli, "Run this verifier with npm run verify:package.");

function npm(directory, args, silent = false) {
  return execFileSync(process.execPath, [npmCli, ...args], {
    cwd: directory,
    stdio: silent ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
  });
}

const temp = await realpath(tmpdir());
const prefix = "markdown-editor-consumer-";
const consumer = await mkdtemp(join(temp, prefix));
let server;
let browser;

try {
  const tarball = process.argv[2] ? resolve(process.argv[2]) : join(consumer, JSON.parse(npm(root, [
    "pack", "--workspace", "./packages/markdown-editor", "--pack-destination", consumer, "--json",
  ], true))[0].filename);
  const [workspace, web] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../apps/web/package.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  await cp(new URL("../tests/consumer/", import.meta.url), consumer, { recursive: true });
  await writeFile(join(consumer, "package.json"), JSON.stringify({
    private: true,
    type: "module",
    scripts: { check: "tsc", build: "vite build" },
    dependencies: { react: web.dependencies.react, "react-dom": web.dependencies["react-dom"] },
    devDependencies: {
      "@types/react": workspace.devDependencies["@types/react"],
      "@types/react-dom": workspace.devDependencies["@types/react-dom"],
      typescript: workspace.devDependencies.typescript,
      vite: workspace.devDependencies.vite,
    },
  }));

  npm(consumer, ["install", "--no-audit", "--no-fund", tarball]);
  npm(consumer, ["run", "check"]);
  npm(consumer, ["run", "build", "--", "--logLevel", "warn"]);

  console.log("Checking the independent production build in a browser.");
  server = await preview({ root: consumer, preview: { host: "127.0.0.1", port: 0, strictPort: true }, logLevel: "error" });
  const address = server.httpServer.address();
  assert(address && typeof address === "object");
  browser = await chromium.launch({ channel: process.env.CI ? undefined : "msedge" });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.location().url + " " + message.text());
  });
  page.on("response", response => {
    if (response.status() >= 400) errors.push("HTTP " + response.status() + " " + response.url());
  });
  const font = page.waitForResponse(response => response.request().resourceType() === "font" && response.ok());
  await page.goto("http://127.0.0.1:" + address.port + "/");
  const previewPanel = page.getByRole("region", { name: "只读预览" });
  await expect(previewPanel.locator(".katex").first()).toBeVisible();
  await font;
  await expect(previewPanel.locator(".mermaid-canvas svg")).toBeVisible({ timeout: 30_000 });
  await previewPanel.getByRole("link", { name: "打开记录" }).click();
  await expect(page.getByLabel("宿主链接")).toHaveText("#task=record");
  await previewPanel.getByRole("button", { name: "复制代码" }).first().click();
  await expect(page.getByLabel("宿主剪贴板")).toHaveText("const value = 42;");
  await page.getByRole("textbox", { name: "第一个编辑器" }).press("Control+/");
  await page.getByRole("textbox", { name: "第一个编辑器" }).fill("# 已更新");
  await expect(previewPanel.getByRole("heading", { name: "已更新" })).toBeVisible();
  const second = page.getByRole("textbox", { name: "第二个编辑器" });
  await second.press("Control+/");
  await expect(second).not.toHaveClass(/notes-editor-textarea/);
  await second.press("Control+Shift+F8");
  await expect(second).toHaveClass(/notes-editor-textarea/);
  await second.press("Control+Shift+F8");
  await expect(second).not.toHaveClass(/notes-editor-textarea/);
  await second.press("/");
  await expect(page.locator('.markdown-overlay[data-theme="dark"]').getByRole("menu")).toBeVisible();
  await page.getByRole("button", { name: "修改第二个编辑器主题" }).click();
  await expect(page.locator(".markdown-overlay[data-theme=light]")).toHaveCount(2);
  await page.getByRole("button", { name: "卸载第二个编辑器" }).click();
  await expect(page.locator(".markdown-overlay")).toHaveCount(1);
  assert.deepEqual(errors, []);
  console.log("Verified the installed tarball in an independent React project.");
} finally {
  await browser?.close();
  await server?.close();
  const target = await realpath(consumer);
  assert(dirname(target) === temp && basename(target).startsWith(prefix));
  await rm(target, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
}
