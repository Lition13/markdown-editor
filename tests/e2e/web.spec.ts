import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("打开 Markdown、编辑、刷新恢复、下载并重新打开", async ({ page }) => {
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
  await page.getByLabel("选择 Markdown 文件").setInputFiles({
    name: "验收.markdown", mimeType: "text/markdown", buffer: Buffer.from(source),
  });
  await expect(page.getByText("验收.markdown")).toBeVisible();
  await sourceMode.click();
  await expect(sourceMode).toHaveAttribute("aria-pressed", "true");
  await expect(editor).toHaveValue(source);
  const edited = source.replace("待验收", "已编辑");
  await editor.fill(edited);
  await expect(status).toHaveText("草稿已保存");

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
  await expect(status).toHaveText("草稿已恢复");
  await expect(liveMode).toHaveAttribute("aria-pressed", "true");
  await editor.press("Control+/");
  await expect(sourceMode).toHaveAttribute("aria-pressed", "true");
  await expect(editor).toHaveValue(edited);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 .md" }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("验收.md");
  const content = await readFile(await file.path(), "utf8");
  expect(content).toBe(edited);
  await page.getByLabel("选择 Markdown 文件").setInputFiles({
    name: file.suggestedFilename(), mimeType: "text/markdown", buffer: Buffer.from(content),
  });
  await expect(page.getByText("验收.md", { exact: true })).toBeVisible();
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
  await page.getByLabel("选择 Markdown 文件").setInputFiles({
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
