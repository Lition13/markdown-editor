import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { chooseInterfaceLanguage, documentOutline, fileManager, revealToolbar } from "./workbench";

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
  const toolbar = await revealToolbar(page);
  await toolbar.getByRole("button", { name: "状态栏", exact: true }).click();
  await expect(page.locator("#workspace-status")).toBeVisible();
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

test("工作台默认隐藏面板，图标按钮可切换视图和状态栏", async ({ page }) => {
  await page.goto("./");
  const toolbar = page.locator("#workbench-toolbar");
  const handle = page.getByRole("button", { name: "顶部工具栏" });
  const footer = page.locator("#workspace-status");
  const status = toolbar.getByRole("button", { name: "状态栏", exact: true });
  await page.mouse.move(550, 180);
  await expect(page.locator("#file-manager")).toBeHidden();
  await expect(page.locator("#document-outline")).toBeHidden();
  await expect(footer).toBeHidden();
  await expect(toolbar).toBeHidden();
  await expect(page.getByRole("heading", { name: "Markdown 编辑器", exact: true })).toHaveCount(0);
  await expect.poll(() => page.getByRole("main").evaluate(main =>
    Math.round(main.getBoundingClientRect().width) === document.documentElement.clientWidth
  )).toBe(true);
  await handle.hover();
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "全屏编辑", exact: true })).toHaveCount(0);
  const filesButton = toolbar.getByRole("button", { name: "文件管理", exact: true });
  const edit = toolbar.getByRole("button", { name: "编辑", exact: true });
  const source = toolbar.getByRole("button", { name: "源码", exact: true });
  const outline = toolbar.getByRole("button", { name: "文档大纲", exact: true });
  for (const button of [filesButton, edit, source, outline, status]) {
    await expect(button).toHaveText("");
    await expect(button.locator("svg")).toBeVisible();
    await expect(button).toHaveAttribute("title", /.+/);
  }
  await expect(edit).toHaveAttribute("aria-pressed", "true");
  await expect(status).toHaveAttribute("aria-pressed", "false");
  await page.mouse.move(550, 180);
  await expect(toolbar).toBeHidden();

  await handle.press("Enter");
  await expect(toolbar).toBeVisible();
  const files = await fileManager(page);
  await expect(files.getByText("文件保存在此浏览器")).toHaveCount(0);
  await status.click();
  await expect(footer).toBeVisible();
  await source.click();
  await expect(source).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("textbox", { name: "Markdown 正文", exact: true }).fill("# 项目\n\n写作 hello world");
  const stats = footer.getByRole("group", { name: "文档统计" });
  await expect(stats.getByText("6 字词", { exact: true })).toBeVisible();
  await expect(stats.getByText("3 行", { exact: true })).toBeVisible();
  await page.reload();
  await expect(stats.getByText("6 字词", { exact: true })).toBeVisible();
  await status.click();
  await expect(footer).toBeHidden();
  await page.reload();
  await expect(footer).toBeHidden();
});

test("自定义主题预览后应用到工作区、代码和全屏，刷新后仍可切换回内置主题", async ({ page }) => {
  await page.goto("./");
  const files = await fileManager(page);
  const source = "# 项目笔记\n\n正文示例。\n\n~~~js\nconst tint = 3;\n~~~\n\n~~~mermaid\nflowchart LR\nA --> B\n~~~";
  await files.getByLabel("选择 Markdown 文件").setInputFiles({
    name: "主题验收.md", mimeType: "text/markdown", buffer: Buffer.from(source),
  });
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  const canvas = page.locator(".workspace");
  const root = page.locator("html");
  const toolbar = await revealToolbar(page);
  const themeButton = toolbar.getByRole("button", { name: "自定义主题", exact: true });
  const settings = page.getByRole("dialog", { name: "自定义主题", exact: true });
  const preview = settings.locator(".theme-preview-window");
  const apply = settings.getByRole("button", { name: "保存并应用", exact: true });
  await themeButton.click();
  await settings.getByLabel("主题名称", { exact: true }).fill("暖纸");
  await settings.getByRole("button", { name: "深色", exact: true }).click();
  await settings.getByRole("textbox", { name: "工作区背景", exact: true }).fill("#F4EFE6");
  await settings.getByRole("textbox", { name: "侧栏背景", exact: true }).fill("#dedace");
  await settings.getByRole("textbox", { name: "文字颜色", exact: true }).fill("#26382f");
  await settings.getByRole("textbox", { name: "代码底色", exact: true }).fill("#172923");
  const accent = settings.getByRole("textbox", { name: "强调色", exact: true });
  await accent.fill("无效颜色");
  await expect(accent).toHaveAttribute("aria-invalid", "true");
  await expect(apply).toBeDisabled();
  await settings.getByLabel("强调色取色", { exact: true }).fill("#28775c");
  await expect(accent).toHaveValue("#28775c");
  await expect(preview).toHaveCSS("background-color", "rgb(244, 239, 230)");
  await expect(preview.locator("pre")).toHaveCSS("background-color", "rgb(23, 41, 35)");
  await expect(canvas).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await apply.click();
  await expect(settings).toBeHidden();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(root).toHaveAttribute("data-theme-choice", "custom");
  await expect(canvas).toHaveCSS("background-color", "rgb(244, 239, 230)");
  await expect(files).toHaveCSS("background-color", "rgb(222, 218, 206)");
  await expect(editor).toHaveCSS("color", "rgb(38, 56, 47)");
  await expect(files.getByRole("button", { name: "新建", exact: true })).toHaveCSS("background-color", "rgb(40, 119, 92)");
  const diagram = page.getByRole("img", { name: "Mermaid 图表", exact: true });
  await expect(diagram).toHaveCSS("background-color", "rgb(34, 46, 68)");
  const code = editor.locator(".markdown-code-block > pre");
  await expect(code).toHaveCSS("background-color", "rgb(23, 41, 35)");
  await code.click();
  await expect(editor.locator(".cm-md-code-line")).toHaveCSS("background-color", "rgb(23, 41, 35)");
  await editor.press("Alt+Enter");
  const fullscreen = page.getByRole("dialog", { name: "编辑 Markdown", exact: true });
  await expect(fullscreen).toHaveCSS("background-color", "rgb(244, 239, 230)");
  await expect(fullscreen.locator(".cm-md-code-line")).toHaveCSS("background-color", "rgb(23, 41, 35)");
  await page.keyboard.press("Escape");
  await expect(fullscreen).toBeHidden();

  await page.reload();
  await expect(root).toHaveAttribute("data-theme-choice", "custom");
  await expect(canvas).toHaveCSS("background-color", "rgb(244, 239, 230)");
  await revealToolbar(page);
  await toolbar.getByRole("button", { name: "切换浅色主题", exact: true }).click();
  await expect(root).toHaveAttribute("data-theme-choice", "light");
  await expect(canvas).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.reload();
  await expect(root).toHaveAttribute("data-theme-choice", "light");
  await revealToolbar(page);
  await themeButton.click();
  await expect(settings.getByLabel("主题名称", { exact: true })).toHaveValue("暖纸");
  await expect(settings.getByRole("textbox", { name: "工作区背景", exact: true })).toHaveValue("#f4efe6");
  await expect(settings.getByRole("textbox", { name: "强调色", exact: true })).toHaveValue("#28775c");
  await apply.click();
  await expect(root).toHaveAttribute("data-theme-choice", "custom");
});

test("窄窗可恢复主题基底颜色并取消预览，旧的深色偏好继续可读", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 620 });
  await page.addInitScript(() => localStorage.setItem("lition13-markdown-editor-theme", "dark"));
  await page.goto("./");
  const root = page.locator("html");
  const toolbar = await revealToolbar(page);
  const themeButton = toolbar.getByRole("button", { name: "自定义主题", exact: true });
  await expect(themeButton).toBeInViewport({ ratio: 1 });
  await expect(root).toHaveAttribute("data-theme-choice", "dark");
  await themeButton.click();
  const settings = page.getByRole("dialog", { name: "自定义主题", exact: true });
  const background = settings.getByRole("textbox", { name: "工作区背景", exact: true });
  await expect(background).toHaveValue("#192133");
  await settings.getByRole("button", { name: "浅色", exact: true }).click();
  await background.fill("#abc");
  await expect(settings.locator(".theme-preview-window")).toHaveCSS("background-color", "rgb(170, 187, 204)");
  await settings.getByRole("button", { name: "恢复基底颜色", exact: true }).click();
  await expect(background).toHaveValue("#ffffff");
  await settings.getByRole("button", { name: "取消", exact: true }).click();
  await expect(settings).toBeHidden();
  await expect(root).toHaveAttribute("data-theme-choice", "dark");
  await expect(page.locator(".workspace")).toHaveCSS("background-color", "rgb(25, 33, 51)");
});

test("用主题源码新建并复制具名主题，多个主题刷新后仍能切换", async ({ page, context }) => {
  await page.addInitScript(() => {
    let copied = "";
    Object.defineProperty(navigator, "clipboard", {
      value: {
        async writeText(text: string) { copied = text; },
        async readText() { return copied; },
      },
    });
  });
  await page.goto("./");
  const themeButton = (await revealToolbar(page)).getByRole("button", { name: "自定义主题", exact: true });
  const settings = page.getByRole("dialog", { name: "自定义主题", exact: true });
  const profiles = settings.getByRole("combobox", { name: "编辑主题", exact: true });
  const name = settings.getByLabel("主题名称", { exact: true });
  const source = settings.getByRole("textbox", { name: "JSON 源码", exact: true });
  const apply = settings.getByRole("button", { name: "保存并应用", exact: true });
  const canvas = page.locator(".workspace");
  await themeButton.click();
  await name.fill("书页");
  await settings.getByLabel("工作区背景", { exact: true }).fill("#faf2e8");
  await apply.click();
  await expect(canvas).toHaveCSS("background-color", "rgb(250, 242, 232)");

  const otherTab = await context.newPage();
  await otherTab.goto("./");
  await expect(otherTab.locator(".workspace")).toHaveCSS("background-color", "rgb(250, 242, 232)");
  await page.bringToFront();
  await revealToolbar(page);
  await themeButton.click();
  await profiles.selectOption({ label: "新建主题" });
  await settings.getByRole("button", { name: "主题源码", exact: true }).click();
  await source.fill("{");
  await expect(source).toHaveAttribute("aria-invalid", "true");
  await expect(apply).toBeDisabled();
  await source.fill(JSON.stringify({ name: "深海", base: "dark", colors: { background: "#243448", accent: "#9bd" } }));
  await expect(settings.locator(".theme-preview-window")).toHaveCSS("background-color", "rgb(36, 52, 72)");
  await expect(canvas).toHaveCSS("background-color", "rgb(250, 242, 232)");
  await settings.getByRole("button", { name: "配色", exact: true }).click();
  await expect(name).toHaveValue("深海");
  await expect(settings.getByLabel("强调色", { exact: true })).toHaveValue("#99bbdd");
  await apply.click();
  await expect(canvas).toHaveCSS("background-color", "rgb(36, 52, 72)");
  await expect(otherTab.locator(".workspace")).toHaveCSS("background-color", "rgb(36, 52, 72)");
  await otherTab.close();

  await page.reload();
  await expect(canvas).toHaveCSS("background-color", "rgb(36, 52, 72)");
  await revealToolbar(page);
  await themeButton.click();
  await expect(profiles.locator("option:checked")).toHaveText("深海");
  await settings.getByRole("button", { name: "主题源码", exact: true }).click();
  await settings.getByRole("button", { name: "复制源码", exact: true }).click();
  await expect(settings.getByText("已复制源码", { exact: true })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(JSON.parse(copied)).toMatchObject({ name: "深海", base: "dark", colors: { accent: "#99bbdd" } });
  await profiles.selectOption({ label: "新建主题" });
  await source.fill(copied);
  await expect(settings.getByText("已有同名主题，请换个名字。", { exact: true })).toBeVisible();
  await expect(apply).toBeDisabled();
  await profiles.selectOption({ label: "书页" });
  await apply.click();
  await expect(canvas).toHaveCSS("background-color", "rgb(250, 242, 232)");
  await page.reload();
  await expect(canvas).toHaveCSS("background-color", "rgb(250, 242, 232)");
  await revealToolbar(page);
  await themeButton.click();
  await expect(profiles.getByRole("option", { name: "深海", exact: true })).toHaveCount(1);
});

test.describe("未保存语言偏好", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("在线版默认英文，语言菜单支持键盘操作并记住选择", async ({ page }) => {
    await page.goto("./");
    const root = page.locator("html");
    await expect(root).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle("Markdown Editor");
    await expect(page.getByRole("heading", { name: "Getting started", exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("lition13-markdown-editor-locale"))).toBeNull();

    const toolbar = await revealToolbar(page, "en");
    await expect(toolbar.getByRole("button", { name: "File manager", exact: true })).toBeVisible();
    const trigger = toolbar.getByRole("button", { name: "Interface language", exact: true });
    const menu = toolbar.getByRole("menu", { name: "Interface language", exact: true });
    const english = menu.getByRole("menuitemradio", { name: "English", exact: true });
    const chinese = menu.getByRole("menuitemradio", { name: "简体中文", exact: true });
    await trigger.press("ArrowDown");
    await expect(english).toHaveAttribute("aria-checked", "true");
    await expect(english).toBeFocused();
    await page.keyboard.press("End");
    await expect(chinese).toBeFocused();
    await page.keyboard.press("Home");
    await expect(english).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.press("Enter");
    await page.keyboard.press("Tab");
    await expect(menu).toBeHidden();
    await expect(toolbar.getByRole("link", { name: "Source on GitHub", exact: true })).toBeFocused();

    await trigger.click();
    await page.mouse.move(700, 190);
    await expect(menu).toBeVisible();
    await page.mouse.down();
    await page.mouse.up();
    await expect(menu).toBeHidden();
    await revealToolbar(page, "en");
    await trigger.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await expect(chinese).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(root).toHaveAttribute("lang", "zh-CN");
    await expect(toolbar.getByRole("button", { name: "界面语言", exact: true })).toBeFocused();
    await page.reload();
    await expect(root).toHaveAttribute("lang", "zh-CN");
    await expect(page).toHaveTitle("Markdown 编辑器");
    await expect(page.getByRole("heading", { name: "开始写作", exact: true })).toBeVisible();
  });
});

test("在线版切换中英文后保留文档、撤销历史和浏览器偏好", async ({ page }) => {
  await page.goto("./");
  const root = page.locator("html");
  await expect(root).toHaveAttribute("lang", "zh-CN");
  const files = await fileManager(page);
  await expect(page.getByRole("heading", { name: "开始写作", exact: true })).toBeVisible();
  await documentOutline(page);
  const toolbar = await revealToolbar(page);
  await toolbar.getByRole("button", { name: "状态栏", exact: true }).click();
  const editSource = toolbar.getByRole("button", { name: "源码", exact: true });
  await editSource.click();
  const original = "# 保留标题\n\n中文和 English 正文。";
  await files.getByLabel("选择 Markdown 文件").setInputFiles({
    name: "验收笔记.md", mimeType: "text/markdown", buffer: Buffer.from(original),
  });
  await expect(page.getByRole("heading", { name: "保留标题", exact: true })).toBeVisible();
  await expect(editSource).toHaveAttribute("aria-pressed", "false");
  await editSource.click();
  const draft = original + "\n\n临时输入";
  await page.getByRole("textbox", { name: "Markdown 正文", exact: true }).fill(draft);
  await chooseInterfaceLanguage(page, "zh-CN", "en");
  await expect(root).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle("Markdown Editor");
  await expect(files.getByRole("heading", { name: "File manager", exact: true })).toBeVisible();
  await expect(files.getByRole("button", { name: "验收笔记.md", exact: true })).toBeVisible();
  await expect(files.getByRole("button", { name: "Getting started.md", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Document outline", exact: true })).toBeVisible();
  await expect(page.locator("#document-outline").getByRole("button", { name: "保留标题", exact: true })).toBeVisible();
  const source = page.getByRole("textbox", { name: "Markdown document", exact: true });
  await expect(source).toHaveValue(draft);
  await source.press("Control+z");
  await expect(source).toHaveValue(original);
  await expect(page.getByRole("group", { name: "Document statistics", exact: true })).toContainText("3 lines");
  await expect(page.locator(".save-status")).toHaveText("Saved in this browser");

  await files.getByRole("button", { name: "New folder", exact: true }).click();
  await files.getByLabel("Folder name", { exact: true }).fill("/");
  await files.getByRole("button", { name: "Create", exact: true }).click();
  await expect(files.getByRole("alert")).toHaveText("Enter a valid folder name without slashes.");
  await files.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(root).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "保留标题", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 620 });
  await expect(root).toHaveAttribute("data-theme", "dark");
  await revealToolbar(page, "en");
  const language = toolbar.getByRole("button", { name: "Interface language", exact: true });
  await expect(language).toBeInViewport({ ratio: 1 });
  await language.click();
  const menu = toolbar.getByRole("menu", { name: "Interface language", exact: true });
  await expect(menu).toBeInViewport({ ratio: 1 });
  await expect(menu.getByRole("menuitemradio", { name: "English", exact: true })).toHaveAttribute("aria-checked", "true");
  await menu.getByRole("menuitemradio", { name: "简体中文", exact: true }).click();
  await expect(root).toHaveAttribute("lang", "zh-CN");
  await expect(page).toHaveTitle("Markdown 编辑器");
});

test("完整的入门示例按语言切换并保留编辑和删除操作", async ({ page }) => {
  await page.goto("./");
  const files = await fileManager(page);
  const toolbar = await revealToolbar(page);
  const chineseSample = page.getByRole("heading", { name: "开始写作", exact: true });
  const englishSample = page.getByRole("heading", { name: "Getting started", exact: true });
  const chooseEnglish = () => chooseInterfaceLanguage(page, "zh-CN", "en");
  const chooseChinese = () => chooseInterfaceLanguage(page, "en", "zh-CN");

  await expect(chineseSample).toBeVisible();
  await expect(files.getByRole("button", { name: "入门示例.md", exact: true })).toHaveAttribute("aria-current", "true");
  await chooseEnglish();
  await expect(englishSample).toBeVisible();
  await expect(page.locator(".save-status")).toHaveText("Example document");
  await expect(files.getByRole("button", { name: "入门示例.md", exact: true })).toBeVisible();
  await expect(files.getByRole("button", { name: "Getting started.md", exact: true })).toHaveAttribute("aria-current", "true");
  const download = page.waitForEvent("download");
  await files.getByRole("button", { name: "Export", exact: true }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe("Getting started.md");
  const markdown = await readFile(await exported.path(), "utf8");
  expect(markdown).toMatch(/^# Getting started\n/);
  expect(markdown).toMatch(/```yaml\n---\nname: markdown-quickstart\ndescription: .+\n---\n```/);
  expect(markdown).toContain("| Insert a table | Ctrl+Alt+T |");
  expect(markdown).toContain("## Lists and checkboxes");
  expect(markdown).toContain("| :--- | :---: | ---: |");
  expect(markdown).toContain("```javascript");
  expect(markdown).toContain("A[Import Markdown] --> B[Edit the document]");
  expect(markdown).toContain("![Sketch of the workspace](workspace.png)");
  expect(markdown).toContain("[^storage]:");
  expect(markdown).not.toMatch(/\p{Script=Han}/u);

  await chooseChinese();
  await expect(chineseSample).toBeVisible();
  const outline = await documentOutline(page);
  await expect(outline.getByRole("button", { name: "图片和脚注", exact: true })).toBeVisible();
  await chooseEnglish();
  await expect(englishSample).toBeVisible();
  await page.getByRole("button", { name: "Top toolbar", exact: true }).hover();
  await toolbar.getByRole("button", { name: "Source", exact: true }).click();
  const edited = "# My edited example\n\nKeep this text across language changes.";
  await page.getByRole("textbox", { name: "Markdown document", exact: true }).fill(edited);
  await expect(page.locator(".save-status")).toHaveText("Saved in this browser");
  await chooseChinese();
  await expect(page.getByRole("textbox", { name: "Markdown 正文", exact: true })).toHaveValue(edited);
  await chooseEnglish();
  await page.reload();
  await expect(page.getByRole("heading", { name: "My edited example", exact: true })).toBeVisible();

  await files.getByRole("button", { name: "Delete Getting started.md", exact: true }).click();
  await files.getByRole("button", { name: "Confirm deletion", exact: true }).click();
  await expect(chineseSample).toBeVisible();
  await page.reload();
  await expect(chineseSample).toBeVisible();
  await expect(files.getByRole("button", { name: "Getting started.md", exact: true })).toHaveCount(0);
});

test("旧默认示例升级后打开英文版，保留中文示例和同名个人文件", async ({ page }) => {
  const previousExample = [
    "# 开始写作", "", "点击正文任意位置开始编辑。输入 `/` 可以搜索格式、插入表格或切换到源码。", "",
    "- [ ] 试试勾选待办", "- [ ] 导入自己的 Markdown 文件", "", "| 操作 | 快捷键 |", "| :--- | :--- |",
    "| 切换正文和源码 | Ctrl+/ |", "| 插入表格 | Ctrl+Alt+T |", "| 全屏编辑 | Alt+Enter |", "",
    "## 公式与图表", "", "$$", "\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}", "$$", "",
    "```mermaid", "flowchart LR", "  A[导入 Markdown] --> B[编辑正文]", "  B --> C[导出文件]", "```", "",
  ].join("\n");
  const personal = "# Personal document\n\nThis file already existed.";
  await page.route("**/markdown-editor/seed-starter", route => route.fulfill({ contentType: "text/html", body: "<!doctype html>" }));
  await page.goto("./seed-starter");
  await page.evaluate(() => localStorage.removeItem("lition13-markdown-editor-locale"));
  await page.evaluate(({ previousExample, personal }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("lition13-markdown-editor", 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      const files = db.createObjectStore("files", { keyPath: "id" });
      files.add({ id: "example", name: "入门示例.md", revision: 0 });
      files.add({ id: "personal", name: "Getting started.md", revision: 1 });
      const contents = db.createObjectStore("contents");
      contents.add(previousExample, "example");
      contents.add(personal, "personal");
      db.createObjectStore("folders", { keyPath: "id" });
      db.createObjectStore("settings").add("example", "active-file");
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  }), { previousExample, personal });

  await page.goto("./");
  const files = await fileManager(page, "en");
  await expect(page.getByRole("heading", { name: "Getting started", exact: true })).toBeVisible();
  await expect(files.getByRole("button", { name: "Getting started (2).md", exact: true })).toHaveAttribute("aria-current", "true");
  await files.getByRole("button", { name: "入门示例.md", exact: true }).click();
  await expect(page.getByRole("heading", { name: "开始写作", exact: true })).toBeVisible();
  const outline = await documentOutline(page, "en");
  await expect(outline.getByRole("button", { name: "代码和 YAML", exact: true })).toBeVisible();
  await files.getByRole("button", { name: "Getting started.md", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Personal document", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Personal document", exact: true })).toBeVisible();
  await expect(files.getByRole("button", { name: "Getting started (2).md", exact: true })).toHaveCount(1);
});

test("英文覆盖快捷键、主题、斜杠菜单和全屏内的编辑工具", async ({ page }) => {
  await page.goto("./");
  const files = await fileManager(page);
  const document = "# 流程\n\n~~~mermaid\neventmodeling\ntf 01 evt Shop.Saved\n~~~\n\n~~~text\nplain example\n~~~\n\n结尾";
  await files.getByLabel("选择 Markdown 文件").setInputFiles({
    name: "tools.md", mimeType: "text/markdown", buffer: Buffer.from(document),
  });
  const toolbar = await revealToolbar(page);
  await chooseInterfaceLanguage(page, "zh-CN", "en");
  const top = page.getByRole("button", { name: "Top toolbar", exact: true });
  await top.hover();
  await toolbar.getByRole("button", { name: "Keyboard shortcuts", exact: true }).click();
  const shortcuts = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
  await shortcuts.getByRole("searchbox", { name: "Search shortcuts", exact: true }).fill("Insert table");
  await shortcuts.getByRole("button", { name: "Change Insert table", exact: true }).click();
  await shortcuts.getByRole("textbox", { name: "Key combination", exact: true }).fill("Ctrl+T");
  await expect(shortcuts.getByText("The browser reserves this shortcut for opening a new tab.")).toBeVisible();
  await shortcuts.getByRole("button", { name: "Close keyboard shortcuts", exact: true }).click();

  await top.hover();
  await toolbar.getByRole("button", { name: "Custom themes", exact: true }).click();
  const themes = page.getByRole("dialog", { name: "Custom themes", exact: true });
  await expect(themes.getByLabel("Theme name", { exact: true })).toHaveValue("My theme");
  await themes.getByRole("button", { name: "Theme source", exact: true }).click();
  await themes.getByLabel("JSON source", { exact: true }).fill("{");
  await expect(themes.getByText("Enter valid JSON.", { exact: true })).toBeVisible();
  await themes.getByRole("button", { name: "Cancel", exact: true }).click();

  const chart = page.getByRole("img", { name: "Mermaid diagram", exact: true });
  await expect(chart).toContainText("Event model");
  await expect(chart).toContainText("Shop.Saved");
  await page.getByRole("main").getByRole("textbox", { name: "Markdown document", exact: true }).press("Alt+Enter");
  const fullscreen = page.getByRole("dialog", { name: "Edit Markdown", exact: true });
  const editor = fullscreen.getByRole("textbox", { name: "Markdown document", exact: true });
  await fullscreen.getByText("plain example", { exact: true }).click();
  const code = fullscreen.getByRole("combobox", { name: "Code block language", exact: true });
  await expect(code).toHaveValue("Plain text");
  await expect(fullscreen.locator(".cm-md-code-settings").getByRole("button", { name: "Copy code", exact: true })).toBeVisible();
  await editor.press("Control+End");
  await editor.press("/");
  const tools = fullscreen.getByRole("menu", { name: "Editing tools", exact: true });
  await tools.getByRole("textbox", { name: "Search editing tools", exact: true }).fill("Insert table");
  await tools.getByRole("menuitem", { name: "Insert table", exact: true }).click();
  const insert = fullscreen.getByRole("dialog", { name: "Insert table", exact: true });
  await expect(insert.getByRole("spinbutton", { name: "Rows (including header)", exact: true })).toBeFocused();
  await expect(insert.getByRole("spinbutton", { name: "Columns", exact: true })).toBeVisible();
  await insert.getByRole("button", { name: "Close insert panel", exact: true }).click();
  await fullscreen.getByRole("button", { name: "Done", exact: true }).click();
  await expect(fullscreen).toBeHidden();
});

test("文件栏、大纲和顶栏在刷新与重新打开后恢复显隐", async ({ page, context }) => {
  await page.goto("./");
  const toolbar = page.locator("#workbench-toolbar");
  const handle = page.getByRole("button", { name: "顶部工具栏" });
  const files = page.locator("#file-manager");
  const outline = page.locator("#document-outline");
  await handle.click();
  await fileManager(page);
  await documentOutline(page);
  await page.reload();
  await expect(toolbar).toBeVisible();
  await expect(files).toBeVisible();
  await expect(outline).toBeVisible();

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
  await reopened.mouse.move(600, 200);
  await expect(reopened.getByRole("button", { name: "顶部工具栏", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(reopened.locator("#workbench-toolbar")).toBeHidden();
  await expect(reopened.locator("#file-manager")).toBeVisible();
  await expect(reopened.locator("#document-outline")).toBeHidden();
});

test("窄窗恢复上次的抽屉，宽屏侧栏使用各自的显隐偏好", async ({ page }) => {
  await page.goto("./");
  await fileManager(page);
  const outline = await documentOutline(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#file-manager")).toBeHidden();
  await expect(outline).toBeHidden();
  const files = await fileManager(page);
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
  const outline = await documentOutline(page);
  const toolbar = await revealToolbar(page);
  await toolbar.getByRole("button", { name: "状态栏", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown 正文", exact: true });
  const yamlKey = editor.locator(".hljs-attr", { hasText: "name:" });
  await expect(editor.locator(".cm-md-yaml-opener")).toBeVisible();
  await expect(yamlKey).toHaveCSS("color", "rgb(23, 81, 160)");
  await expect(editor.locator(".hljs-comment", { hasText: "文件头注释" })).toBeVisible();
  await expect(outline.getByRole("navigation", { name: "章节" }).getByRole("button")).toHaveText(["使用方法"]);
  await expect(page.getByRole("group", { name: "文档统计" })).toContainText("8 字词");
  await expect(page.getByRole("group", { name: "文档统计" })).toContainText("13 行");
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
  await documentOutline(page);
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

test.describe("GitHub Pages", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

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
    await expect(document.getByRole("table").filter({ hasText: "Insert a table" })).toBeVisible();
    const outline = await documentOutline(page, "en");
    await outline.getByRole("button", { name: "Math and diagrams", exact: true }).click();
    await expect(document.locator(".katex").first()).toBeVisible();
    await localFont;
    await expect(document.locator(".mermaid-canvas svg")).toBeVisible({ timeout: 30_000 });
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
});
