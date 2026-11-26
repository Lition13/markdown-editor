import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { documentOutline, fileManager, revealToolbar } from "./workbench";

test("用方向键找文件、回车编辑，并恢复本标签页的编辑位置", async ({ page }) => {
  await page.goto("./");
  const files = await fileManager(page);
  const long = "# Story A\n\n" + Array.from({ length: 50 }, (_, index) => "Section " + index).join("\n\n") + "\n\nReturn here.";
  await files.getByLabel("选择 Markdown 文件").setInputFiles([
    { name: "Story A.md", mimeType: "text/markdown", buffer: Buffer.from(long) },
    { name: "Story B.md", mimeType: "text/markdown", buffer: Buffer.from("# Story B\n\nSecond file.") },
  ]);
  await expect(page.getByRole("heading", { name: "Story A", exact: true })).toBeVisible();
  const toolbar = await revealToolbar(page);
  await toolbar.getByRole("button", { name: "源码", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  await expect(editor).toHaveValue(long);
  await editor.press("Control+End");

  const search = files.getByRole("searchbox", { name: "搜索文件名", exact: true });
  await search.fill("Story");
  await expect(files.locator('[data-search-active="true"]')).toHaveText("Story A.md");
  await search.press("ArrowDown");
  await expect(files.locator('[data-search-active="true"]')).toHaveText("Story B.md");
  await search.press("Enter");
  await expect(page.getByRole("heading", { name: "Story B", exact: true })).toBeVisible();
  await expect(editor).toBeFocused();
  await search.fill("Story");
  await search.press("ArrowDown");
  await search.press("ArrowUp");
  await search.press("Enter");
  await expect(editor).toBeFocused();
  await expect.poll(() => page.evaluate(() => getSelection()?.focusNode?.textContent)).toBe("Return here.");
  await expect(editor.getByText("Return here.", { exact: true })).toBeInViewport();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("dialog#file-manager")).toBeAttached();
  await fileManager(page);
  await search.fill("Story B");
  await search.press("Enter");
  await expect(files).toBeHidden();
  await expect(page.getByRole("heading", { name: "Story B", exact: true })).toBeVisible();
  await expect(editor).toBeFocused();
});

test("手动滚动正文和源码时，大纲高亮可见章节", async ({ page }) => {
  await page.goto("./");
  const files = await fileManager(page);
  const content = ["第一章", "第二章", "第三章"].map(title =>
    "# " + title + "\n\n" + Array.from({ length: 45 }, (_, index) => "这是第 " + index + " 段正文。").join("\n\n"),
  ).join("\n\n");
  await files.getByLabel("选择 Markdown 文件").setInputFiles({
    name: "长篇.md", mimeType: "text/markdown", buffer: Buffer.from(content),
  });
  await expect(page.getByRole("heading", { name: "第一章", exact: true })).toBeVisible();
  const outline = await documentOutline(page);
  const section = (name: string) => outline.getByRole("button", { name, exact: true });
  const scrollTo = (fraction: number) => page.evaluate(part => {
    const root = document.scrollingElement!;
    window.scrollTo(0, (root.scrollHeight - root.clientHeight) * part);
  }, fraction);

  await expect(section("第一章")).toHaveAttribute("aria-current", "location");
  await scrollTo(.52);
  await expect(section("第二章")).toHaveAttribute("aria-current", "location");
  const toolbar = await revealToolbar(page);
  await toolbar.getByRole("button", { name: "源码", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Markdown 正文", exact: true })).toHaveValue(content);
  await scrollTo(0);
  await expect(section("第一章")).toHaveAttribute("aria-current", "location");
  await scrollTo(.52);
  await expect(section("第二章")).toHaveAttribute("aria-current", "location");
  await scrollTo(1);
  await expect(section("第三章")).toHaveAttribute("aria-current", "location");
});

test("整库备份保留目录和原文，预览恢复时安全合并", async ({ page }) => {
  const folders = [
    { id: "project", name: "项目", parentId: null },
    { id: "weekly", name: "周会", parentId: "project" },
    { id: "empty", name: "空目录", parentId: "project" },
  ];
  const original = "# 保存时的纪要\n\n项目正文。\n";
  await page.route("**/markdown-editor/seed-backup", route => route.fulfill({ contentType: "text/html", body: "<!doctype html>" }));
  await page.goto("./seed-backup");
  await page.evaluate(({ folders, original }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("lition13-markdown-editor", 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      const entries = db.createObjectStore("files", { keyPath: "id" });
      const contents = db.createObjectStore("contents");
      const directories = db.createObjectStore("folders", { keyPath: "id" });
      for (const folder of folders) directories.add(folder);
      entries.add({ id: "notes", name: "纪要.md", revision: 0, folderId: "weekly" });
      contents.add(original, "notes");
      db.createObjectStore("settings").add("notes", "active-file");
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  }), { folders, original });
  await page.goto("./");
  const files = await fileManager(page);
  await expect(page.getByRole("heading", { name: "保存时的纪要", exact: true })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"), files.getByRole("button", { name: "备份文件库", exact: true }).click(),
  ]);
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(download.suggestedFilename()).toBe("markdown-library-backup.json");
  expect(backup.version).toBe(1);
  expect(backup.folders).toHaveLength(3);
  expect(backup.folders).toEqual(expect.arrayContaining(folders));
  expect(backup.files).toEqual([{ name: "纪要.md", folderId: "weekly", value: original }]);
  const upload = (value: unknown) => files.getByLabel("选择文件库备份", { exact: true }).setInputFiles({
    name: "副本.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)),
  });
  await page.mouse.move(75, 240);
  await files.getByRole("button", { name: "删除文件夹 空目录", exact: true }).click();
  await files.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(files.getByRole("button", { name: "空目录", exact: true })).toHaveCount(0);
  await upload({ ...backup, folders: [{ id: "loop", name: "坏目录", parentId: "loop" }], files: [] });
  await expect(files.getByRole("alert")).toHaveText("无法读取文件库备份。请选择有效的备份文件。");
  const preview = files.getByRole("region", { name: "恢复「副本.json」", exact: true });
  await upload({ ...backup, folders: [folders[2], folders[1], folders[0]] });
  await expect(preview).toContainText("备份中有 1 个文件和 3 个文件夹。");
  await preview.getByText("查看备份内容", { exact: true }).click();
  await expect(preview.getByText("项目/周会/纪要.md", { exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "取消", exact: true }).click();
  await expect(preview).toBeHidden();
  await expect(files.getByRole("button", { name: "纪要 (2).md", exact: true })).toHaveCount(0);

  const toolbar = await revealToolbar(page);
  await toolbar.getByRole("button", { name: "源码", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  const edited = "# 我的新纪要";
  await editor.fill(edited);
  await expect(page.locator(".save-status")).toHaveText("已保存到此浏览器");
  await upload(backup);
  await preview.getByRole("button", { name: "确认恢复", exact: true }).click();
  await expect(files.getByText("备份已恢复。", { exact: true })).toBeVisible();
  await expect(editor).toHaveValue(edited);
  await expect(files.getByRole("button", { name: "项目", exact: true })).toHaveCount(1);
  await expect(files.getByRole("button", { name: "空目录", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "我的新纪要", exact: true })).toBeVisible();
  await files.getByRole("button", { name: "纪要 (2).md", exact: true }).click();
  await expect(page.getByRole("heading", { name: "保存时的纪要", exact: true })).toBeVisible();
});
