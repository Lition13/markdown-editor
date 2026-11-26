import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { documentOutline, fileManager, revealToolbar } from "./workbench";

const zipFile = (entries: Record<string, string>) => ({
  name: "资料.zip",
  mimeType: "application/zip",
  buffer: Buffer.from(zipSync(Object.fromEntries(Object.entries(entries).map(([path, text]) => [path, strToU8(text)])))),
});

test("命令面板可按名称和快捷键搜索，执行编辑与撤销", async ({ page }) => {
  await page.goto("./");
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  await editor.focus();
  const palette = page.getByRole("dialog", { name: "命令面板", exact: true });
  const search = palette.getByRole("combobox", { name: "搜索命令", exact: true });
  const selected = palette.getByRole("option", { selected: true });
  await page.keyboard.press("Control+Shift+p");
  await expect(search).toBeFocused();
  await search.fill("no-such-command");
  await expect(palette.getByRole("status")).toHaveText("没有匹配的命令");
  await search.fill("切换编辑与源码");
  await expect(selected).toContainText("切换编辑与源码");
  await selected.click();
  await expect(palette).toBeHidden();
  const source = page.locator("textarea.notes-editor-textarea");
  await expect(source).toBeFocused();
  await source.fill("正文");
  await source.press("End");

  await page.keyboard.press("Control+Shift+p");
  await search.fill("> Ctrl+Alt+T");
  await expect(selected).toContainText("插入表格");
  await page.keyboard.press("Enter");
  const table = page.getByRole("dialog", { name: "插入表格", exact: true });
  const rows = table.getByRole("spinbutton", { name: "行数（含表头）" });
  await expect(rows).toBeFocused();
  await rows.fill("2");
  await rows.press("Enter");
  await expect(source).toHaveValue(/正文\n\n\|.*\|/);

  await page.keyboard.press("Control+Shift+p");
  await search.fill("撤销");
  await expect(selected).toContainText("撤销");
  await page.keyboard.press("Enter");
  await expect(source).toHaveValue("正文");
  await expect(source).toBeFocused();
});

test("窄窗命令面板支持方向键、新建和导入，可切换到快速打开", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto("./");
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  await expect(editor).toBeVisible();
  const palette = page.getByRole("dialog", { name: "命令面板", exact: true });
  const search = palette.getByRole("combobox", { name: "搜索命令", exact: true });
  const selected = palette.getByRole("option", { selected: true });
  await page.keyboard.press("Control+Shift+p");
  await expect(search).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(selected).toHaveText("新建文件");
  await page.keyboard.press("ArrowUp");
  await expect(selected).toContainText("快速打开文件");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const files = page.getByRole("dialog", { name: "文件管理", exact: true });
  await expect(palette).toBeHidden();
  await expect(files.getByRole("textbox", { name: "新建文件名", exact: true })).toBeFocused();
  await files.getByRole("button", { name: "取消", exact: true }).click();
  await page.keyboard.press("Control+Alt+f");
  await expect(files).toBeHidden();

  await page.keyboard.press("Control+Shift+p");
  await search.fill("导入 ZIP");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), search.press("Enter")]);
  await chooser.setFiles({ name: "命令导入.md", mimeType: "text/markdown", buffer: Buffer.from("# 命令导入") });
  await expect(files).toBeHidden();
  await expect(page.getByRole("heading", { name: "命令导入", exact: true })).toBeVisible();

  await editor.focus();
  const quickOpen = page.getByRole("dialog", { name: "快速打开文件", exact: true });
  await page.keyboard.press("Control+p");
  await expect(quickOpen).toBeVisible();
  await page.keyboard.press("Control+Shift+p");
  await expect(search).toBeFocused();
  await expect(quickOpen).toBeHidden();
  await page.keyboard.press("Control+p");
  await expect(quickOpen).toBeVisible();
  await expect(palette).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(editor).toBeFocused();
});

test("文件管理快捷键聚焦搜索框，空搜索可用方向键打开文件", async ({ page }) => {
  await page.goto("./");
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  await editor.focus();
  const files = page.locator("#file-manager");
  const search = files.getByRole("searchbox", { name: "搜索文件名", exact: true });
  await page.keyboard.press("Control+Alt+f");
  await expect(search).toBeFocused();
  await page.keyboard.press("Control+Alt+f");
  await expect(files).toBeHidden();
  await expect(editor).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("dialog#file-manager")).toBeAttached();
  await page.keyboard.press("Control+Alt+f");
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
  const rows = files.locator(".file-open");
  const english = files.getByRole("button", { name: "Getting started.md", exact: true });
  await page.keyboard.press("ArrowDown");
  await expect(rows.first()).toHaveAttribute("data-search-active", "true");
  await page.keyboard.press("ArrowDown");
  await expect(rows.last()).toHaveAttribute("data-search-active", "true");
  if (await english.getAttribute("data-search-active") !== "true") await page.keyboard.press("ArrowUp");
  await expect(english).toHaveAttribute("data-search-active", "true");
  await page.keyboard.press("Enter");
  await expect(files).toBeHidden();
  await expect(page.getByRole("heading", { name: "Getting started", exact: true })).toBeVisible();
  await expect(editor).toBeFocused();
});

test("Ctrl+P 按文件名和路径快速打开文件，取消后还原焦点", async ({ page }) => {
  await page.goto("./");
  const files = await fileManager(page);
  await files.getByLabel("选择 Markdown 或 ZIP 文件").setInputFiles(zipFile({
    "Work/Weekly/Notes.md": "# Weekly notes", "Personal/Notes.md": "# Personal notes",
  }));
  await expect(page.getByRole("heading", { name: "Weekly notes", exact: true })).toBeVisible();
  await page.keyboard.press("Control+Alt+f");
  await expect(files).toBeHidden();
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  await editor.press("Control+/");
  await expect(editor).toHaveValue("# Weekly notes");
  const picker = page.getByRole("dialog", { name: "快速打开文件", exact: true });
  const input = picker.getByRole("combobox", { name: "输入文件名或路径", exact: true });
  await page.keyboard.press("Control+p");
  await expect(input).toBeFocused();
  await input.fill("Work/Weekly nt");
  await expect(picker.getByRole("option", { selected: true })).toHaveText("Notes.mdWork/Weekly");
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(editor).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("dialog#file-manager")).toBeAttached();
  await page.keyboard.press("Control+Alt+f");
  await expect(files.getByRole("searchbox")).toBeFocused();
  await page.keyboard.press("Control+p");
  await expect(input).toBeFocused();
  await input.fill("Notes");
  await expect(picker.getByRole("option")).toHaveCount(2);
  await expect(picker.getByRole("option", { selected: true })).toHaveText("Notes.mdPersonal");
  await page.keyboard.press("ArrowDown");
  await expect(picker.getByRole("option", { selected: true })).toHaveText("Notes.mdWork/Weekly");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await expect(files).toBeHidden();
  await expect(page.getByRole("heading", { name: "Personal notes", exact: true })).toBeVisible();
  await expect(editor).toBeFocused();
});

test("用方向键找文件、回车编辑，并恢复本标签页的编辑位置", async ({ page }) => {
  await page.goto("./");
  const files = await fileManager(page);
  const long = "# Story A\n\n" + Array.from({ length: 50 }, (_, index) => "Section " + index).join("\n\n") + "\n\nReturn here.";
  await files.getByLabel("选择 Markdown 或 ZIP 文件").setInputFiles([
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
  await files.getByLabel("选择 Markdown 或 ZIP 文件").setInputFiles({
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

test("ZIP 在选中目录中合并文件，逐项导出可保留原文和空目录", async ({ page }) => {
  await page.goto("./");
  const files = await fileManager(page);
  const button = (name: string) => files.getByRole("button", { name, exact: true });
  const input = files.getByLabel("选择 Markdown 或 ZIP 文件", { exact: true });
  await expect(button("备份文件库")).toHaveCount(0);
  await expect(button("恢复备份")).toHaveCount(0);
  await button("新建文件夹").click();
  await files.getByRole("textbox", { name: "文件夹名称", exact: true }).fill("目标");
  await button("创建").click();
  await expect(button("目标")).toHaveAttribute("aria-expanded", "true");
  const original = "# 当前的纪要\n\n项目正文。\n";
  const extra = "# 另一份资料\n";
  await input.setInputFiles(zipFile({
    "项目/周会/纪要.md": original, "项目/周会/记录.txt": extra, "项目/空目录/": "", "项目/图片.png": "ignored",
  }));
  const title = page.getByRole("heading", { name: "当前的纪要", exact: true });
  await expect(title).toBeVisible();
  await expect(button("空目录")).toBeVisible();
  await expect(button("图片.png")).toHaveCount(0);
  await expect(button("导出 记录.txt").locator("xpath=following-sibling::button[1]")).toHaveAccessibleName("重命名 记录.txt");
  const [single] = await Promise.all([page.waitForEvent("download"), button("导出 记录.txt").click()]);
  expect(single.suggestedFilename()).toBe("记录.md");
  expect(await readFile(await single.path(), "utf8")).toBe(extra);
  await expect(title).toBeVisible();

  const [folder] = await Promise.all([page.waitForEvent("download"), button("导出文件夹 项目").click()]);
  const bytes = await readFile(await folder.path());
  expect(folder.suggestedFilename()).toBe("项目.zip");
  const entries = unzipSync(bytes);
  expect(Object.keys(entries).sort()).toEqual(["项目/", "项目/周会/", "项目/周会/纪要.md", "项目/周会/记录.txt", "项目/空目录/"].sort());
  expect(strFromU8(entries["项目/周会/纪要.md"])).toBe(original);
  expect(strFromU8(entries["项目/周会/记录.txt"])).toBe(extra);

  await button("目标").click();
  await input.setInputFiles({ name: folder.suggestedFilename(), mimeType: "application/zip", buffer: bytes });
  await expect(button("记录 (2).txt")).toBeVisible();
  await button("纪要 (2).md").click();
  await expect(button("纪要 (2).md")).toHaveAttribute("aria-current", "true");
  await expect(button("项目")).toHaveCount(1);
  await expect(button("空目录")).toHaveCount(1);
  await input.setInputFiles([
    { name: "未导入.md", mimeType: "text/markdown", buffer: Buffer.from("# 未导入") },
    zipFile({ "../意外路径.md": "# 路径无效" }),
  ]);
  await expect(files.getByRole("alert")).toHaveText("ZIP 中的目录结构无效。");
  await expect(button("未导入.md")).toHaveCount(0);
  await page.reload();
  await expect(title).toBeVisible();
  await expect(button("纪要.md")).toBeVisible();
  await expect(button("纪要 (2).md")).toHaveAttribute("aria-current", "true");
});
