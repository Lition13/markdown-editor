import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { documentOutline, fileManager, revealToolbar } from "./workbench";

const zipFile = (entries: Record<string, string>) => ({
  name: "资料.zip",
  mimeType: "application/zip",
  buffer: Buffer.from(zipSync(Object.fromEntries(Object.entries(entries).map(([path, text]) => [path, strToU8(text)])))),
});

test("命令面板精简编辑命令，在全屏里导出、重命名和删除当前文件", async ({ page }) => {
  await page.goto("./");
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  const files = await fileManager(page);
  const value = "# 命令验收\n\n原始正文";
  await files.getByLabel("选择 Markdown 或 ZIP 文件").setInputFiles([
    { name: "原稿.markdown", mimeType: "text/markdown", buffer: Buffer.from(value) },
    { name: "保留.md", mimeType: "text/markdown", buffer: Buffer.from("保留正文") },
  ]);
  await expect(page.getByRole("heading", { name: "命令验收", exact: true })).toBeVisible();
  await page.keyboard.press("Control+Alt+f");
  await expect(files).toBeHidden();
  await editor.press("Control+/");
  const source = page.locator("textarea.notes-editor-textarea");
  await expect(source).toHaveValue(value);
  await source.press("Control+End");
  const palette = page.getByRole("dialog", { name: "命令面板", exact: true });
  const search = palette.getByRole("combobox", { name: "搜索命令", exact: true });
  const selected = palette.getByRole("option", { selected: true });
  const openCommand = async (query: string, label: string) => {
    await page.keyboard.press("Control+Shift+p");
    await expect(search).toBeFocused();
    await search.fill(query);
    await expect(selected).toContainText(label);
  };
  await page.keyboard.press("Control+Shift+p");
  await expect(search).toBeFocused();
  await expect(palette.getByRole("option", { name: /插入表格|切换编辑与源码|切换全屏编辑|撤销|重做|Markdown 语法帮助/ })).toHaveCount(0);
  await search.fill("插入表格");
  await expect(palette.getByRole("status")).toHaveText("没有匹配的命令");
  await search.fill("> Ctrl+Alt+F");
  await expect(selected).toContainText("切换文件管理");
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await expect(source).toBeFocused();
  await expect.poll(() => source.evaluate((field: HTMLTextAreaElement) => field.selectionEnd)).toBe(value.length);

  await source.press("/");
  const slash = page.getByRole("menu", { name: "描述工具", exact: true });
  await expect(slash.getByRole("menuitem", { name: /描述表格/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await source.press("Alt+Enter");
  const fullscreen = page.locator("dialog.markdown-editor-modal");
  await expect(fullscreen).toBeVisible();
  await expect(source).toBeFocused();

  await openCommand("导出", "导出当前文件");
  const [download] = await Promise.all([page.waitForEvent("download"), search.press("Enter")]);
  expect(download.suggestedFilename()).toBe("原稿.md");
  expect(await readFile(await download.path(), "utf8")).toBe(value);
  await expect(files).toBeHidden();
  await expect(fullscreen).toBeVisible();

  await openCommand("重命名", "重命名当前文件");
  await selected.click();
  const rename = page.getByRole("dialog", { name: "重命名当前文件", exact: true });
  const name = rename.getByRole("textbox", { name: "新文件名", exact: true });
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("原稿.markdown");
  await name.fill("保留.md");
  await name.press("Enter");
  await expect(rename.getByRole("alert")).toHaveText("已有同名文件，请换一个名称。");
  await name.fill("改好");
  await name.press("Enter");
  await expect(rename).toBeHidden();
  await expect(fullscreen).toBeVisible();
  await expect(source).toBeFocused();
  await expect(source).toHaveValue(value);
  await expect.poll(() => source.evaluate((field: HTMLTextAreaElement) => field.selectionEnd)).toBe(value.length);

  const remove = page.getByRole("dialog", { name: "删除当前文件", exact: true });
  await openCommand("删除", "删除当前文件");
  await page.keyboard.press("Enter");
  await expect(remove.getByText("删除「改好.md」？", { exact: true })).toBeVisible();
  await expect(remove.getByRole("button", { name: "取消", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(remove).toBeHidden();
  await expect(source).toBeFocused();
  await expect(source).toHaveValue(value);

  await openCommand("删除", "删除当前文件");
  await page.keyboard.press("Enter");
  await remove.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(remove).toBeHidden();
  await expect(fullscreen).toHaveCount(0);
  await page.keyboard.press("Control+p");
  const quickOpen = page.getByRole("dialog", { name: "快速打开文件", exact: true });
  const fileSearch = quickOpen.getByRole("combobox");
  await fileSearch.fill("改好");
  await expect(quickOpen.getByRole("status")).toHaveText("没有匹配的文件");
  await fileSearch.fill("保留");
  await fileSearch.press("Enter");
  await expect(editor).toHaveText("保留正文");
  await page.reload();
  await expect(editor).toHaveText("保留正文");
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
