import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { fileManager, revealToolbar } from "./workbench";

async function beginLibraryDrag(page: Page, source: Locator) {
  await expect(source).toBeVisible();
  const box = (await source.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y);
}

async function dragInLibrary(page: Page, source: Locator, target: Locator) {
  await beginLibraryDrag(page, source);
  await expect(target).toBeVisible();
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await expect(target).toHaveAttribute("data-drop-active", "true");
  await page.mouse.up();
}

async function createLibraryFolder(files: Locator, name: string) {
  await files.getByRole("button", { name: "新建文件夹", exact: true }).click();
  await files.getByLabel("文件夹名称", { exact: true }).fill(name);
  await files.getByRole("button", { name: "创建", exact: true }).click();
  const folder = files.getByRole("button", { name, exact: true });
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  return folder;
}

test("导入 Markdown、编辑、刷新恢复、导出并重新导入", async ({ page }) => {
  const source = [
    "# 验收文档",
    "",
    "| 项目 | 状态 |",
    "| --- | --- |",
    "| 中文 | 待验收 |",
    "",
    "![像素样例](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=)",
    "",
    "\x60\x60\x60js",
    "const value = 42;",
    "\x60\x60\x60",
  ].join("\n");
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  const status = page.locator(".save-status");
  const modes = page.getByRole("group", { name: "文档视图" });
  const liveMode = modes.getByRole("button", { name: "编辑", exact: true });
  const sourceMode = modes.getByRole("button", { name: "源码", exact: true });
  await page.goto("./");
  await expect(status).toHaveText("示例文档");
  await expect(editor).toBeVisible();
  await revealToolbar(page);
  await expect(liveMode).toHaveAttribute("aria-pressed", "true");
  await expect(sourceMode).toHaveAttribute("aria-pressed", "false");
  let files = await fileManager(page);
  await files.getByLabel("选择 Markdown 文件").setInputFiles({
    name: "验收.markdown", mimeType: "text/markdown", buffer: Buffer.from(source),
  });
  await expect(page.locator(".document-name")).toHaveText("验收.markdown");
  await revealToolbar(page);
  await sourceMode.click();
  await expect(sourceMode).toHaveAttribute("aria-pressed", "true");
  await expect(editor).toHaveValue(source);
  const edited = source.replace("待验收", "已编辑");
  await editor.fill(edited);
  await expect(status).toHaveText("已保存到此浏览器");

  await editor.press("Control+Home");
  await editor.press("ArrowRight");
  await editor.press("ArrowRight");
  await revealToolbar(page);
  await liveMode.click();
  await expect(editor).toBeFocused();
  await expect(page.getByRole("table")).toContainText("已编辑");
  await sourceMode.click();
  await expect.poll(() => editor.evaluate(field => (field as HTMLTextAreaElement).selectionStart)).toBe(2);

  await editor.press("Control+/");
  await revealToolbar(page);
  await expect(liveMode).toHaveAttribute("aria-pressed", "true");
  await editor.press("/");
  const commands = page.getByRole("menu", { name: "描述工具" });
  await commands.getByRole("textbox", { name: "搜索描述工具" }).fill("编辑描述源码");
  await commands.getByRole("menuitem", { name: "编辑描述源码", exact: true }).click();
  await revealToolbar(page);
  await expect(sourceMode).toHaveAttribute("aria-pressed", "true");
  await expect(editor).toHaveValue(edited);

  await page.reload();
  await expect(status).toHaveText("已保存到此浏览器");
  await revealToolbar(page);
  await expect(liveMode).toHaveAttribute("aria-pressed", "true");
  await editor.press("Control+/");
  await expect(sourceMode).toHaveAttribute("aria-pressed", "true");
  await expect(editor).toHaveValue(edited);
  files = await fileManager(page);
  const downloaded = page.waitForEvent("download");
  await files.getByRole("button", { name: "导出", exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("验收.md");
  const content = await readFile(await file.path(), "utf8");
  expect(content).toBe(edited);
  await files.getByLabel("选择 Markdown 文件").setInputFiles({
    name: file.suggestedFilename(), mimeType: "text/markdown", buffer: Buffer.from(content),
  });
  await expect(page.locator(".document-name")).toHaveText("验收.md");
  await revealToolbar(page);
  await expect(liveMode).toHaveAttribute("aria-pressed", "true");
  const document = page.locator(".notes-live-document");
  await expect(document.getByRole("table")).toContainText("已编辑");
  await expect(document.getByRole("img", { name: "像素样例" })).toBeVisible();
});

test("源码占用同一块正文区，长文档随页面滚动", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  const modes = page.getByRole("group", { name: "文档视图" });
  const liveMode = modes.getByRole("button", { name: "编辑", exact: true });
  const sourceMode = modes.getByRole("button", { name: "源码", exact: true });
  await revealToolbar(page);
  await expect(sourceMode).toBeEnabled();
  const files = await fileManager(page);
  await files.getByLabel("选择 Markdown 文件").setInputFiles({
    name: "正文区.md", mimeType: "text/markdown", buffer: Buffer.from("一段简短的正文"),
  });
  await expect(editor).toHaveText("一段简短的正文");
  const editBounds = await editor.boundingBox();
  await revealToolbar(page);
  await sourceMode.click();
  await expect(editor).toHaveValue("一段简短的正文");
  expect(await editor.boundingBox()).toEqual(editBounds);
  await expect(editor).toHaveCSS("border-top-width", "0px");
  await expect(editor).toHaveCSS("resize", "none");

  const lines = Array.from({ length: 35 }, (_, index) => `第 ${index + 1} 行正文`);
  const longSource = [...lines, "a".repeat(180), "最后一行"].join("\n\n\n");
  await editor.fill(longSource);
  await expect.poll(() => editor.evaluate(field => ({
    editorScrolls: field.scrollHeight > field.clientHeight + 1 || field.scrollWidth > field.clientWidth + 1,
    pageScrolls: document.documentElement.scrollHeight > window.innerHeight,
    pageOverflows: document.documentElement.scrollWidth > window.innerWidth,
  }))).toEqual({ editorScrolls: false, pageScrolls: true, pageOverflows: false });

  const target = lines[22];
  const offset = longSource.indexOf(target);
  await editor.evaluate((field, position) => (field as HTMLTextAreaElement).setSelectionRange(position, position), offset);
  await editor.press("Control+/");
  await revealToolbar(page);
  await expect(liveMode).toHaveAttribute("aria-pressed", "true");
  await expect(editor).toBeFocused();
  await expect.poll(() => page.evaluate(() => {
    const focus = window.getSelection();
    const caret = focus?.rangeCount ? focus.getRangeAt(0).getBoundingClientRect() : undefined;
    const toolbar = document.querySelector(".app-header")!.getBoundingClientRect();
    const status = document.querySelector(".workspace-footer")!.getBoundingClientRect();
    return { text: focus?.focusNode?.textContent, visible: !!caret && caret.top >= toolbar.bottom && caret.bottom <= status.top };
  })).toEqual({ text: target, visible: true });
  await expect(sourceMode).toBeInViewport({ ratio: 1 });
  await sourceMode.click();
  await expect(editor).toHaveValue(longSource);
  await expect.poll(() => editor.evaluate(field => {
    const area = field as HTMLTextAreaElement;
    const style = getComputedStyle(area);
    const lineHeight = parseFloat(style.lineHeight);
    const precedingLines = area.value.slice(0, area.selectionEnd).split("\n").length - 1;
    const top = area.getBoundingClientRect().top + parseFloat(style.paddingTop) + precedingLines * lineHeight;
    const toolbar = document.querySelector(".app-header")!.getBoundingClientRect();
    const status = document.querySelector(".workspace-footer")!.getBoundingClientRect();
    return { offset: area.selectionEnd, visible: top >= toolbar.bottom && top + lineHeight <= status.top };
  })).toEqual({ offset, visible: true });
});

test("文件管理支持新建、批量导入、搜索、重命名和删除", async ({ page }) => {
  await page.goto("./");
  let files = await fileManager(page);
  await files.getByRole("button", { name: "新建", exact: true }).click();
  await files.getByLabel("新建文件名", { exact: true }).fill("旅行计划");
  await files.getByRole("button", { name: "创建", exact: true }).click();
  await expect(files).toBeVisible();
  await expect(page.locator(".document-name")).toHaveText("旅行计划.md");
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  await revealToolbar(page);
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await editor.fill("保存在各自文件中的编辑内容");

  files = await fileManager(page);
  const chooseFiles = page.waitForEvent("filechooser");
  await files.getByRole("button", { name: "导入", exact: true }).click();
  await (await chooseFiles).setFiles([
    { name: "读书笔记.md", mimeType: "text/markdown", buffer: Buffer.from("第一份笔记") },
    { name: "读书笔记.md", mimeType: "text/markdown", buffer: Buffer.from("第二份笔记") },
  ]);
  await expect(files).toBeVisible();
  await expect(page.locator(".document-name")).toHaveText("读书笔记.md");
  await expect(editor).toHaveText("第一份笔记");

  files = await fileManager(page);
  await expect(files.getByRole("button", { name: "读书笔记.md", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(files.getByRole("button", { name: "读书笔记 (2).md", exact: true })).toBeVisible();
  await files.getByRole("button", { name: "重命名 旅行计划.md", exact: true }).click();
  const rename = files.getByLabel("新文件名", { exact: true });
  await rename.fill("读书笔记.md");
  await files.getByRole("button", { name: "保存", exact: true }).click();
  await expect(files.getByRole("alert")).toHaveText("已有同名文件，请换一个名称。");
  await rename.fill("出行安排");
  await files.getByRole("button", { name: "保存", exact: true }).click();
  await expect(files.getByRole("button", { name: "出行安排.md", exact: true })).toBeVisible();
  await files.getByRole("searchbox", { name: "搜索文件名" }).fill("出行");
  await expect(files.getByRole("listitem")).toHaveCount(1);
  await files.getByRole("button", { name: "出行安排.md", exact: true }).click();
  await expect(editor).toHaveText("保存在各自文件中的编辑内容");

  await page.reload();
  await expect(page.locator(".document-name")).toHaveText("出行安排.md");
  await expect(editor).toHaveText("保存在各自文件中的编辑内容");
  files = await fileManager(page);
  await files.getByRole("button", { name: "读书笔记 (2).md", exact: true }).click();
  await expect(editor).toHaveText("第二份笔记");

  files = await fileManager(page);
  await files.getByRole("button", { name: "删除 读书笔记.md", exact: true }).click();
  await files.getByRole("button", { name: "取消", exact: true }).click();
  await expect(files.getByRole("button", { name: "读书笔记.md", exact: true })).toBeVisible();
  await files.getByRole("button", { name: "删除 读书笔记.md", exact: true }).click();
  await files.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(files.getByRole("button", { name: "读书笔记.md", exact: true })).toHaveCount(0);
  await expect(files.getByRole("button", { name: "读书笔记 (2).md", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(files.getByRole("searchbox", { name: "搜索文件名" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(files).toBeHidden();
  await expect(editor).toHaveText("第二份笔记");
});

test("旧版草稿完整迁入文件库，删除最后一份后保持空库", async ({ page }) => {
  const legacy = { name: "旧版草稿.markdown", value: "# 旧版草稿\n\n升级前保留的 Markdown 正文。\n" };
  await page.route("**/markdown-editor/seed-v1", route => route.fulfill({ contentType: "text/html", body: "<!doctype html>" }));
  await page.goto("./seed-v1");
  await page.evaluate(draft => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("lition13-markdown-editor", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts").put(draft, "current");
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  }), legacy);

  await page.goto("./");
  await expect(page.locator(".document-name")).toHaveText(legacy.name);
  await revealToolbar(page);
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Markdown 正文", exact: true })).toHaveValue(legacy.value);
  await page.reload();
  const files = await fileManager(page);
  await expect(files.getByRole("listitem")).toHaveCount(1);
  await files.getByRole("button", { name: "删除 " + legacy.name, exact: true }).click();
  await files.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(files.getByRole("button", { name: "导出", exact: true })).toBeDisabled();
  await files.getByRole("button", { name: "关闭文件管理" }).click();
  await expect(page.getByRole("heading", { name: "暂无 Markdown 文件" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "暂无 Markdown 文件" })).toBeVisible();
});

test("两个标签页编辑同一文件时保留已保存内容，并可导出未保存版本", async ({ page, context }) => {
  const second = await context.newPage();
  await page.goto("./");
  await second.goto("./");
  const source = { name: "源码", exact: true };
  const editor = { name: "Markdown 正文", exact: true };
  await revealToolbar(page);
  await page.getByRole("button", source).click();
  await revealToolbar(second);
  await second.getByRole("button", source).click();
  await page.getByRole("textbox", editor).fill("先保存的版本");
  await expect(page.locator(".save-status")).toHaveText("已保存到此浏览器");
  await second.getByRole("textbox", editor).fill("另一页正在编辑的版本");
  await expect(second.locator(".save-status")).toHaveText("文件已在另一个页面中修改。可导出当前内容。");

  const files = await fileManager(second);
  const download = second.waitForEvent("download");
  await files.getByRole("button", { name: "导出", exact: true }).click();
  expect(await readFile(await (await download).path(), "utf8")).toBe("另一页正在编辑的版本");
  await second.reload();
  await expect(second.getByRole("textbox", editor)).toHaveText("先保存的版本");
});

test("工作台铺满窗口，顶栏悬浮，字词和行数实时更新并记住状态栏偏好", async ({ page }) => {
  await page.goto("./");
  const toolbar = page.locator("#workbench-toolbar");
  const handle = page.getByRole("button", { name: "顶部工具栏" });
  const footer = page.locator("#workspace-status");
  await expect(page.getByRole("complementary", { name: "文件管理" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "文件管理" }).getByText("文件保存在此浏览器")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "文档大纲" })).toBeVisible();
  await expect(toolbar).toBeHidden();
  await expect(page.getByRole("heading", { name: "Markdown 编辑器", exact: true })).toHaveCount(0);
  await expect.poll(() => page.locator(".workbench").evaluate(shell => {
    return Math.round(shell.getBoundingClientRect().width) === document.documentElement.clientWidth;
  })).toBe(true);
  await page.mouse.move(550, 180);
  await handle.hover();
  await expect(toolbar).toBeVisible();
  await page.mouse.move(550, 180);
  await expect(toolbar).toBeHidden();

  await revealToolbar(page);
  await toolbar.getByRole("button", { name: "状态栏", exact: true }).click();
  await expect(footer).toBeHidden();
  await toolbar.getByRole("button", { name: "状态栏", exact: true }).hover();
  await expect(toolbar.getByRole("button", { name: "状态栏", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(footer).toBeHidden();
  await handle.press("Enter");
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: "状态栏", exact: true }).click();
  await expect(footer).toBeVisible();
  await toolbar.getByRole("button", { name: "源码", exact: true }).click();
  await page.getByRole("textbox", { name: "Markdown 正文", exact: true }).fill("# 项目\n\n写作 hello world");
  const stats = footer.getByRole("group", { name: "文档统计" });
  await expect(stats.getByText("6 字词", { exact: true })).toBeVisible();
  await expect(stats.getByText("3 行", { exact: true })).toBeVisible();
  await page.reload();
  await expect(stats.getByText("6 字词", { exact: true })).toBeVisible();
});

test("文件栏、大纲和顶栏在刷新与重新打开后恢复显隐", async ({ page, context }) => {
  await page.goto("./");
  const toolbar = page.locator("#workbench-toolbar");
  const handle = page.getByRole("button", { name: "顶部工具栏" });
  const files = page.locator("#file-manager");
  const outline = page.locator("#document-outline");
  await handle.click();
  await files.getByRole("button", { name: "关闭文件管理" }).click();
  await toolbar.getByRole("button", { name: "文档大纲", exact: true }).click();
  await page.mouse.move(600, 200);
  await expect(toolbar).toBeVisible();
  await expect(files).toBeHidden();
  await expect(outline).toBeHidden();

  await page.reload();
  await expect(toolbar).toBeVisible();
  await expect(files).toBeHidden();
  await expect(outline).toBeHidden();
  await toolbar.getByRole("button", { name: "文件管理", exact: true }).click();
  await expect(files).toBeVisible();
  await handle.click();
  await page.mouse.move(600, 200);
  await expect(toolbar).toBeHidden();

  const reopened = await context.newPage();
  await reopened.goto("./");
  await expect(reopened.locator("#workbench-toolbar")).toBeHidden();
  await expect(reopened.locator("#file-manager")).toBeVisible();
  await expect(reopened.locator("#document-outline")).toBeHidden();
});

test("窄窗恢复上次的抽屉，宽屏侧栏使用各自的显隐偏好", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  const files = await fileManager(page);
  const outline = page.locator("#document-outline");
  await expect(files).toHaveAttribute("open", "");
  await page.reload();
  await expect(files).toHaveAttribute("open", "");
  await files.getByRole("button", { name: "关闭文件管理" }).click();
  await expect(files).toBeHidden();

  const toolbar = await revealToolbar(page);
  await toolbar.getByRole("button", { name: "文档大纲", exact: true }).click();
  await expect(outline).toHaveAttribute("open", "");
  await page.reload();
  await expect(outline).toHaveAttribute("open", "");
  await expect(files).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(page.getByRole("complementary", { name: "文件管理" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "文档大纲" })).toBeVisible();
  await outline.getByRole("button", { name: "关闭文档大纲" }).click();
  await expect(outline).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(outline).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(outline).toBeHidden();
  await page.reload();
  await expect(outline).toBeHidden();
  await expect(files).toBeHidden();
});

test("导入 SKILL.md 后高亮并编辑 YAML，刷新和导出保留文件头", async ({ page }) => {
  const source = [
    "---", "name: yaml-check", "description: |", "  首行说明", "  \x60\x60\x60md", "# 文件头注释",
    "metadata:", "  version: '1.0'", "---", "", "# 使用方法", "", "打开文件。",
  ].join("\n");
  await page.goto("./");
  const files = await fileManager(page);
  await files.getByLabel("选择 Markdown 文件").setInputFiles({
    name: "SKILL.md", mimeType: "text/markdown", buffer: Buffer.from("\uFEFF" + source.replace(/\n/g, "\r\n")),
  });
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  const outline = page.getByRole("complementary", { name: "文档大纲" });
  const yamlKey = editor.locator(".hljs-attr", { hasText: "name:" });
  await expect(editor.locator(".cm-md-yaml-opener")).toBeVisible();
  await expect(yamlKey).toHaveCSS("color", "rgb(23, 81, 160)");
  await expect(editor.locator(".hljs-comment", { hasText: "文件头注释" })).toBeVisible();
  await expect(outline.getByRole("navigation", { name: "章节" }).getByRole("button")).toHaveText(["使用方法"]);
  await expect(page.getByRole("group", { name: "文档统计" })).toContainText("8 字词");
  await expect(page.getByRole("group", { name: "文档统计" })).toContainText("13 行");
  const toolbar = await revealToolbar(page);
  await toolbar.getByRole("button", { name: "切换深色主题" }).click();
  await expect(yamlKey).toHaveCSS("color", "rgb(121, 192, 255)");
  await page.mouse.move(520, 410);

  await editor.locator(".cm-line", { hasText: "version:" }).click();
  await editor.press("End");
  await editor.press("Enter");
  await page.keyboard.insertText("author: a");
  await editor.press("/");
  await page.keyboard.insertText("b");
  const author = editor.locator(".cm-line", { hasText: "author:" });
  await expect.poll(() => author.textContent()).toBe("  author: a/b");
  await editor.press("Tab");
  await expect.poll(() => author.textContent()).toBe("    author: a/b");
  await editor.press("Shift+Tab");
  await expect.poll(() => author.textContent()).toBe("  author: a/b");

  const edited = source.replace("  version: '1.0'", "  version: '1.0'\n  author: a/b");
  await editor.press("Control+/");
  await expect(editor).toHaveValue(edited);
  await expect(page.locator(".save-status")).toHaveText("已保存到此浏览器");
  await page.reload();
  await expect(editor.locator(".cm-md-yaml-opener")).toBeVisible();
  await expect(editor.locator(".cm-line", { hasText: "author:" })).toBeVisible();
  const download = page.waitForEvent("download");
  await files.getByRole("button", { name: "导出", exact: true }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe("SKILL.md");
  expect(await readFile(await exported.path(), "utf8")).toBe(edited);
});

test("大纲识别实际标题，从正文和源码跳到长文档中的章节", async ({ page }) => {
  const source = [
    "# 开头", "", "\x60\x60\x60md", "## 代码块里的标题", "\x60\x60\x60", "",
    ...Array.from({ length: 84 }, (_, index) => "第 " + (index + 1) + " 段记录\n"),
    "收尾事项", "----", "", "最后的正文。",
  ].join("\n");
  await page.goto("./");
  const files = await fileManager(page);
  await files.getByLabel("选择 Markdown 文件").setInputFiles({
    name: "长文档.md", mimeType: "text/markdown", buffer: Buffer.from(source),
  });
  const outline = page.getByRole("complementary", { name: "文档大纲" });
  await expect(outline.getByRole("button", { name: "代码块里的标题", exact: true })).toHaveCount(0);
  const ending = outline.getByRole("button", { name: "收尾事项", exact: true });
  await ending.click();
  await expect(ending).toHaveAttribute("aria-current", "location");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  const renderedHeading = page.getByRole("main").getByRole("heading", { name: /收尾事项/ });
  await expect(renderedHeading).toBeInViewport();
  const toolbar = await revealToolbar(page);
  await toolbar.getByRole("button", { name: "源码", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  await expect(editor).toHaveValue(source);
  await outline.getByRole("button", { name: "开头", exact: true }).click();
  await expect.poll(() => editor.evaluate(field => (field as HTMLTextAreaElement).selectionStart)).toBe(0);
  await ending.click();
  await expect.poll(() => editor.evaluate(field => (field as HTMLTextAreaElement).selectionStart)).toBe(source.indexOf("收尾事项"));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(outline).toHaveCount(0);
  await revealToolbar(page);
  await toolbar.getByRole("button", { name: "文档大纲", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "文档大纲" });
  await drawer.getByRole("button", { name: "开头", exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(editor).toBeFocused();
  await expect.poll(() => editor.evaluate(field => (field as HTMLTextAreaElement).selectionStart)).toBe(0);
});

test("目录树沿用旧版文件库，创建子文件夹、移动同名文件和删除后保留原文", async ({ page }) => {
  const legacy = { id: "old-file", name: "记录.md", value: "旧版文件内容" };
  await page.route("**/markdown-editor/seed-v2", route => route.fulfill({ contentType: "text/html", body: "<!doctype html>" }));
  await page.goto("./seed-v2");
  await page.evaluate(file => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("lition13-markdown-editor", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("files", { keyPath: "id" }).add({ id: file.id, name: file.name, revision: 0 });
      db.createObjectStore("contents").add(file.value, file.id);
      db.createObjectStore("settings").add(file.id, "active-file");
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  }), legacy);
  await page.goto("./");
  const files = await fileManager(page);
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  await expect(editor).toHaveText(legacy.value);

  const project = await createLibraryFolder(files, "项目");
  const meeting = await createLibraryFolder(files, "会议");
  const documents = meeting.locator("xpath=../..");
  await expect(project.locator("xpath=../..").getByRole("button", { name: "会议", exact: true })).toBeVisible();
  await files.getByLabel("选择 Markdown 文件").setInputFiles({
    name: "记录.md", mimeType: "text/markdown", buffer: Buffer.from("刚导入的不同正文"),
  });
  await expect(editor).toHaveText("刚导入的不同正文");
  await project.click();
  await expect(meeting).toHaveCount(0);
  await files.getByRole("button", { name: "文件库", exact: true }).click();
  await expect(files.getByRole("button", { name: "移动 记录.md", exact: true })).toHaveCount(0);
  await dragInLibrary(page, files.getByRole("button", { name: "记录.md", exact: true }),
    files.getByRole("region", { name: "放到文件夹" }).getByLabel("放到 项目 / 会议", { exact: true }));
  await expect(project).toHaveAttribute("aria-expanded", "true");
  await expect(meeting).toHaveAttribute("aria-expanded", "true");
  await documents.getByRole("button", { name: "记录 (2).md", exact: true }).click();
  await expect(editor).toHaveText(legacy.value);

  await page.reload();
  await expect(documents.getByRole("button", { name: "记录 (2).md", exact: true })).toBeVisible();
  await expect(editor).toHaveText(legacy.value);
  await files.getByRole("button", { name: "文件库", exact: true }).click();
  await files.getByRole("button", { name: "删除文件夹 项目", exact: true }).click();
  await files.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(files.getByRole("button", { name: "项目", exact: true })).toHaveCount(0);
  await files.getByRole("button", { name: "删除文件夹 会议", exact: true }).click();
  await files.getByRole("button", { name: "确认删除", exact: true }).click();
  await files.getByRole("button", { name: "记录.md", exact: true }).click();
  await expect(editor).toHaveText("刚导入的不同正文");
  await files.getByRole("button", { name: "记录 (2).md", exact: true }).click();
  await expect(editor).toHaveText(legacy.value);
});

test("目录树可拖入折叠文件夹或拖回根目录，原有子目录和文档随行", async ({ page }) => {
  await page.goto("./");
  const files = await fileManager(page);
  const root = files.getByRole("button", { name: "文件库", exact: true });
  const parent = await createLibraryFolder(files, "归档");
  const parentBranch = parent.locator("xpath=../..");
  await parent.click();
  await expect(parent).toHaveAttribute("aria-expanded", "false");
  await root.click();
  const folder = await createLibraryFolder(files, "项目");
  const child = await createLibraryFolder(files, "周会");
  await files.getByLabel("选择 Markdown 文件").setInputFiles({
    name: "纪要.md", mimeType: "text/markdown", buffer: Buffer.from("子目录里的原文"),
  });
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  await expect(editor).toHaveText("子目录里的原文");
  await root.click();

  await beginLibraryDrag(page, folder);
  const targets = files.getByRole("region", { name: "放到文件夹" });
  await expect(targets).toBeVisible();
  await expect(targets.getByLabel("放到 项目 / 周会", { exact: true })).toHaveCount(0);
  await expect(folder.locator("..")).not.toHaveAttribute("data-drop-active", "true");
  const childRow = child.locator("..");
  const childBox = (await childRow.boundingBox())!;
  await page.mouse.move(childBox.x + childBox.width / 2, childBox.y + childBox.height / 2, { steps: 8 });
  await expect(childRow).not.toHaveAttribute("data-drop-active", "true");
  await page.mouse.up();
  await expect(targets).toBeHidden();
  await expect(folder.locator("xpath=../..").getByRole("button", { name: "周会", exact: true })).toBeVisible();

  await dragInLibrary(page, folder, parent.locator(".."));
  await expect(parent).toHaveAttribute("aria-expanded", "true");
  await expect(parentBranch.getByRole("button", { name: "项目", exact: true })).toBeVisible();
  await expect(child).toBeVisible();
  await dragInLibrary(page, folder, root);
  await expect(parentBranch.getByRole("button", { name: "项目", exact: true })).toHaveCount(0);
  await expect(folder).toBeVisible();

  await folder.press("Shift+Space");
  const chooseParent = targets.getByRole("button", { name: "放到 归档", exact: true });
  await expect(chooseParent).toBeFocused();
  await chooseParent.press("Enter");
  await expect(parentBranch.getByRole("button", { name: "项目", exact: true })).toBeVisible();
  await page.reload();
  await expect(parentBranch.getByRole("button", { name: "纪要.md", exact: true })).toBeVisible();
  await expect(editor).toHaveText("子目录里的原文");
});

test("目录树同时展开多个分支，折叠保留当前文档，搜索打开文件后展开其目录", async ({ page }) => {
  await page.goto("./");
  const files = await fileManager(page);
  const root = files.getByRole("button", { name: "文件库", exact: true });
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  const notes = files.getByLabel("选择 Markdown 文件");
  const project = await createLibraryFolder(files, "项目");
  const meeting = await createLibraryFolder(files, "周会");
  await notes.setInputFiles({ name: "纪要.md", mimeType: "text/markdown", buffer: Buffer.from("会议正文") });
  await expect(editor).toHaveText("会议正文");

  await root.click();
  await expect(meeting).toBeVisible();
  const archive = await createLibraryFolder(files, "归档");
  await notes.setInputFiles({ name: "存档.md", mimeType: "text/markdown", buffer: Buffer.from("归档正文") });
  await expect(editor).toHaveText("归档正文");

  const document = files.getByRole("button", { name: "纪要.md", exact: true });
  const archived = files.getByRole("button", { name: "存档.md", exact: true });
  await document.click();
  await expect(editor).toHaveText("会议正文");
  await project.press("Enter");
  await expect(project).toHaveAttribute("aria-expanded", "false");
  await expect(document).toHaveCount(0);
  await expect(archived).toBeVisible();
  await expect(editor).toHaveText("会议正文");

  await page.reload();
  await expect(project).toHaveAttribute("aria-expanded", "false");
  await expect(archive).toHaveAttribute("aria-expanded", "true");
  await expect(archived).toBeVisible();
  await expect(editor).toHaveText("会议正文");

  const search = files.getByRole("searchbox", { name: "搜索文件名" });
  await search.fill("纪要");
  const result = files.getByRole("list", { name: "文件搜索结果" }).getByRole("button", { name: /纪要\.md.*项目 \/ 周会/ });
  await result.click();
  await expect(search).toHaveValue("");
  await expect(project).toHaveAttribute("aria-expanded", "true");
  await expect(meeting).toHaveAttribute("aria-expanded", "true");
  await expect(document).toHaveAttribute("aria-current", "true");
  await expect(archived).toBeVisible();
});

test("Pages 子路径通过站内资源渲染公式和 Mermaid", async ({ page, context }) => {
  const errors: string[] = [];
  const external: string[] = [];
  const origin = "http://127.0.0.1:4173/";
  await context.route("**/*", route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    external.push(url);
    return route.abort();
  });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  const localFont = page.waitForResponse(response =>
    response.url().startsWith(origin + "markdown-editor/") && response.request().resourceType() === "font" && response.ok(),
  );
  await page.goto("./");
  const document = page.locator(".notes-live-document");
  await expect(document.getByRole("table")).toBeVisible();
  await expect(document.locator(".katex").first()).toBeVisible();
  await localFont;
  await expect(document.locator(".mermaid-canvas svg")).toBeVisible({ timeout: 30_000 });
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
