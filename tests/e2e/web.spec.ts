import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function fileManager(page: Page) {
  await page.getByRole("button", { name: "文件管理", exact: true }).click();
  return page.getByRole("dialog", { name: "文件管理", exact: true });
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
  await expect(liveMode).toHaveAttribute("aria-pressed", "true");
  await expect(sourceMode).toHaveAttribute("aria-pressed", "false");
  let files = await fileManager(page);
  await files.getByLabel("选择 Markdown 文件").setInputFiles({
    name: "验收.markdown", mimeType: "text/markdown", buffer: Buffer.from(source),
  });
  await expect(page.locator(".document-name")).toHaveText("验收.markdown");
  await sourceMode.click();
  await expect(sourceMode).toHaveAttribute("aria-pressed", "true");
  await expect(editor).toHaveValue(source);
  const edited = source.replace("待验收", "已编辑");
  await editor.fill(edited);
  await expect(status).toHaveText("已保存到此浏览器");

  await editor.press("Control+Home");
  await editor.press("ArrowRight");
  await editor.press("ArrowRight");
  await liveMode.click();
  await expect(editor).toBeFocused();
  await expect(page.getByRole("table")).toContainText("已编辑");
  await sourceMode.click();
  await expect.poll(() => editor.evaluate(field => (field as HTMLTextAreaElement).selectionStart)).toBe(2);

  await editor.press("Control+/");
  await expect(liveMode).toHaveAttribute("aria-pressed", "true");
  await editor.press("/");
  const commands = page.getByRole("menu", { name: "描述工具" });
  await commands.getByRole("textbox", { name: "搜索描述工具" }).fill("编辑描述源码");
  await commands.getByRole("menuitem", { name: "编辑描述源码", exact: true }).click();
  await expect(sourceMode).toHaveAttribute("aria-pressed", "true");
  await expect(editor).toHaveValue(edited);

  await page.reload();
  await expect(status).toHaveText("已保存到此浏览器");
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
  await expect(sourceMode).toBeEnabled();
  const files = await fileManager(page);
  await files.getByLabel("选择 Markdown 文件").setInputFiles({
    name: "正文区.md", mimeType: "text/markdown", buffer: Buffer.from("一段简短的正文"),
  });
  await expect(editor).toHaveText("一段简短的正文");
  const editBounds = await editor.boundingBox();
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
  await expect(liveMode).toHaveAttribute("aria-pressed", "true");
  await expect(editor).toBeFocused();
  await expect.poll(() => page.evaluate(() => {
    const focus = window.getSelection();
    const caret = focus?.rangeCount ? focus.getRangeAt(0).getBoundingClientRect() : undefined;
    const header = document.querySelector(".workspace-header")!.getBoundingClientRect();
    return { text: focus?.focusNode?.textContent, visible: !!caret && caret.top >= header.bottom && caret.bottom <= innerHeight };
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
    const header = document.querySelector(".workspace-header")!.getBoundingClientRect();
    return { offset: area.selectionEnd, visible: top >= header.bottom && top + lineHeight <= innerHeight };
  })).toEqual({ offset, visible: true });
});

test("文件管理支持新建、批量导入、搜索、重命名和删除", async ({ page }) => {
  await page.goto("./");
  let files = await fileManager(page);
  await files.getByRole("button", { name: "新建", exact: true }).click();
  await files.getByLabel("新建文件名", { exact: true }).fill("旅行计划");
  await files.getByRole("button", { name: "创建", exact: true }).click();
  await expect(files).toBeHidden();
  await expect(page.locator(".document-name")).toHaveText("旅行计划.md");
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await editor.fill("保存在各自文件中的编辑内容");

  files = await fileManager(page);
  const chooseFiles = page.waitForEvent("filechooser");
  await files.getByRole("button", { name: "导入", exact: true }).click();
  await (await chooseFiles).setFiles([
    { name: "读书笔记.md", mimeType: "text/markdown", buffer: Buffer.from("第一份笔记") },
    { name: "读书笔记.md", mimeType: "text/markdown", buffer: Buffer.from("第二份笔记") },
  ]);
  await expect(files).toBeHidden();
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
  await page.getByRole("button", source).click();
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
