import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import { stateSamples } from "../fixtures/state-fixtures.mjs";
import { classSamples } from "../fixtures/class-fixtures.mjs";
import { sequenceSamples } from "../fixtures/sequence-fixtures.mjs";
import { erSamples } from "../fixtures/er-fixtures.mjs";
import { erLayoutIssues } from "../fixtures/er-layout-checks.mjs";
import { fileManager, revealToolbar } from "./workbench";
const notes = (page: Page) =>
  page.getByRole("textbox", { name: "Markdown 正文", exact: true });
const rendered = (page: Page) => page.locator(".notes-live-document");
const toolsMenu = (page: Page) => page.getByRole("menu", { name: "描述工具", exact: true });
const command = async (page: Page, name: string) => {
  await notes(page).press("/");
  const menu = toolsMenu(page);
  await menu.getByRole("textbox", { name: "搜索描述工具", exact: true }).fill(name);
  await menu.getByRole("menuitem", { name, exact: true }).click();
};
const editSource = async (page: Page) => {
  await command(page, "编辑描述源码");
};
const showRenderedDescription = async (page: Page) => {
  await command(page, "实时编辑描述");
  await expect(notes(page)).toBeFocused();
  await notes(page).blur();
};
const ready = async (page: Page) => {
  await page.goto("./");
  await expect(page.locator(".save-status")).toHaveText("示例文档");
  await expect(notes(page)).toBeVisible();
  await expect(page.locator(".notes-format-toolbar")).toHaveCount(0);
  await editSource(page);
};
const saved = async (page: Page) => {
  await expect(page.locator(".save-status")).toHaveText("已保存到此浏览器");
  return page.evaluate(async () => {
    const result = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const db = await result(indexedDB.open("lition13-markdown-editor"));
    try {
      const transaction = db.transaction(["settings", "contents"]);
      const id = await result(transaction.objectStore("settings").get("active-file"));
      return await result<string>(transaction.objectStore("contents").get(id));
    } finally {
      db.close();
    }
  });
};
const setTheme = async (page: Page, theme: string) => {
  await revealToolbar(page);
  const toggle = page.getByRole("button", { name: theme === "dark" ? "切换深色主题" : "切换浅色主题" });
  if (await toggle.isVisible()) await toggle.click();
  await page.mouse.move(25, 110);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
};
const select = async (page: Page, start: number, end: number) => {
  await notes(page).focus();
  await notes(page).evaluate(
    (el: HTMLTextAreaElement, s) => {
      el.setSelectionRange(s.start, s.end);
      el.dispatchEvent(new Event("select", { bubbles: true }));
    },
    { start, end },
  );
};
const caretLine = (page: Page) => notes(page).evaluate(element => {
  const node = element.ownerDocument.getSelection()?.focusNode;
  return (node instanceof Element ? node : node?.parentElement)?.closest(".cm-line")?.textContent;
});
const fixture = [
  "# 项目计划",
  "**重点**、*斜体*、~~旧方案~~ 和 `const x`",
  "- 父项\n  - 子项",
  "> 引用内容",
  "| 名称 | 数量 |\n| :--- | ---: |\n| 测试 | 2 |",
  "- [ ] 外层\n  - [x] 内层\n> - [ ] 引用待办",
  "```javascript\nconst answer = 42\n```",
  "公式 $x^2$\n\n$$\n\\frac{1}{2}\n$$",
  "[章节](#项目计划) 和脚注[^1]\n\n[^1]: 附加说明",
  "<details><summary>更多</summary><kbd>Ctrl</kbd> 安全 HTML</details>",
].join("\n\n");

test("斜杠菜单可在文档开头插入 YAML 模板，已有文件头时跳回编辑", async ({ page }) => {
  await ready(page);
  const body = "# 写作\n\n正文。";
  await notes(page).fill(body);
  await notes(page).press("Control+End");
  await command(page, "YAML 文件头");
  await page.keyboard.insertText("new-skill");
  const expected = "---\nname: new-skill\ndescription: \n---\n\n" + body;
  await expect(notes(page)).toHaveValue(expected);
  await notes(page).press("Control+/");
  await expect(rendered(page).locator(".cm-md-yaml-opener")).toBeVisible();
  await notes(page).press("Control+End");
  await command(page, "YAML 文件头");
  await expect.poll(() => caretLine(page)).toBe("name: new-skill");
  await notes(page).press("Control+/");
  await expect(notes(page)).toHaveValue(expected);
});

test("正文、源码和表格单元格共享成对符号编辑", async ({ page }) => {
  await ready(page);
  const editor = notes(page);
  await editor.fill("正文");
  await command(page, "实时编辑描述");
  await editor.press("End");
  for (const character of ["(", "【", "内容", "】", ")"]) await page.keyboard.insertText(character);
  await expect.poll(() => saved(page)).toBe("正文(【内容】)");
  await page.keyboard.insertText("{");
  await expect.poll(() => saved(page)).toBe("正文(【内容】){}");
  await editor.press("Backspace");
  await expect.poll(() => saved(page)).toBe("正文(【内容】)");
  await editor.press("Control+z");
  await expect.poll(() => saved(page)).toBe("正文(【内容】){}");

  await editSource(page);
  await editor.fill("计划");
  await select(page, 0, 2);
  await page.keyboard.insertText("《");
  await expect(editor).toHaveValue("《计划》");
  expect(await editor.evaluate((field: HTMLTextAreaElement) => [field.selectionStart, field.selectionEnd])).toEqual([1, 3]);
  await editor.press("End");
  await editor.press("Space");
  await editor.press("End");
  await page.keyboard.insertText('don');
  await page.keyboard.insertText("'");
  await page.keyboard.insertText("t");
  await expect(editor).toHaveValue("《计划》 don't");
  await editor.fill("()");
  await select(page, 0, 1);
  await editor.press("Backspace");
  await expect(editor).toHaveValue(")");
  const original = "| 项目 |\n| --- |\n| 内容 |";
  await editor.fill(original);
  await command(page, "实时编辑描述");
  await page.getByRole("table").getByText("内容", { exact: true }).click();
  const cell = page.getByRole("textbox", { name: "编辑表格第 2 行第 1 列", exact: true });
  await cell.selectText();
  await page.keyboard.insertText("“");
  await expect(cell).toHaveValue("“内容”");
  expect(await cell.evaluate((field: HTMLInputElement) => [field.selectionStart, field.selectionEnd])).toEqual([1, 3]);
  await cell.press("End");
  await page.keyboard.insertText("[");
  await cell.press("Backspace");
  await expect(cell).toHaveValue("“内容”");
  await expect.poll(() => saved(page)).toBe(original.replace("内容", "“内容”"));
});

test("中文输入法确认符号后补全，普通中文照常输入", async ({ page }) => {
  await ready(page);
  const editor = notes(page);
  await editor.fill("正文");
  await command(page, "实时编辑描述");
  const session = await page.context().newCDPSession(page);
  const compose = async (text: string) => {
    await session.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length });
    await session.send("Input.insertText", { text });
  };
  try {
    await editor.press("End");
    await compose("（");
    await expect.poll(() => saved(page)).toBe("正文（）");
    await editor.press("Control+z");
    await expect.poll(() => saved(page)).toBe("正文");
    await compose("（");
    await compose("重点");
    await expect.poll(() => saved(page)).toBe("正文（重点）");

    await editSource(page);
    await editor.press("End");
    await compose("《");
    await expect(editor).toHaveValue("正文（重点）《》");
    expect(await editor.evaluate((field: HTMLTextAreaElement) => field.selectionStart)).toBe("正文（重点）《".length);
  } finally { await session.detach(); }
});

test("逐字输入三反引号仍可打开代码语言建议并继续成对编辑", async ({ page }) => {
  await ready(page);
  const editor = notes(page);
  await editor.fill("示例\n\n");
  await command(page, "实时编辑描述");
  await editor.press("Control+End");
  for (let index = 0; index < 3; index++) await page.keyboard.insertText("`");
  await page.keyboard.insertText("js");
  await expect(page.getByRole("listbox", { name: "代码语言建议" })).toBeVisible();
  await editor.press("Enter");
  await page.keyboard.insertText("(");
  await page.keyboard.insertText("x");
  await page.keyboard.insertText(")");
  const expected = "示例\n\n```javascript\n(x)\n```";
  await expect.poll(() => saved(page)).toBe(expected);
});

test("首击在正文准确落下光标，斜杠菜单按选区应用工具", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator(".save-status")).toHaveText("示例文档");
  const files = await fileManager(page);
  await files.getByLabel("选择 Markdown 或 ZIP 文件").setInputFiles({
    name: "首击验收.md", mimeType: "text/markdown", buffer: Buffer.from("这里是一段可点击定位的正文。\n\n下一段"),
  });
  await expect(page.locator(".document-name")).toHaveText("首击验收.md");
  const original = await saved(page);
  const firstParagraph = original.split("\n")[0];
  const line = page.locator(".notes-inline-editor .cm-line").filter({ hasText: firstParagraph });
  await expect(line).toBeVisible();
  await expect(notes(page)).not.toBeFocused();
  await expect(page.locator(".notes-format-toolbar, .notes-editor-status, .notes-append-block")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "编辑描述", exact: true })).toHaveCount(0);
  const offset = 5;
  const point = await line.evaluate((element, index) => {
    const range = document.createRange();
    range.setStart(element.firstChild!, index);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    return { x: rect.left, y: rect.top + rect.height / 2 };
  }, offset);
  await page.mouse.click(point.x, point.y);
  await page.keyboard.insertText("星");
  const typed = original.slice(0, offset) + "星" + original.slice(offset);
  expect(await saved(page)).toBe(typed);
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("/");
  const search = toolsMenu(page).getByRole("textbox", { name: "搜索描述工具" });
  await expect(search).toBeFocused();
  const popup = await toolsMenu(page).boundingBox();
  expect(Math.abs(popup!.x - point.x)).toBeLessThan(100);
  expect(await saved(page)).toBe(typed);
  await search.fill("粗体");
  await search.press("Enter");
  await expect(page.locator(".notes-inline-editor .cm-md-strong").first()).toHaveText("星");
  expect(await saved(page)).toBe(typed.replace("星", "**星**"));
  await page.keyboard.press("Control+z");
  expect(await saved(page)).toBe(typed);
  await page.keyboard.insertText("/");
  await expect(toolsMenu(page)).toBeVisible();
  await search.fill("abc");
  for (let press = 0; press < 4; press++) await page.keyboard.down("Backspace");
  await expect(search).toHaveValue("");
  await expect(toolsMenu(page)).toBeVisible();
  await page.keyboard.up("Backspace");
  await page.keyboard.down("Backspace");
  await expect(toolsMenu(page)).toHaveCount(0);
  await expect(notes(page)).toBeFocused();
  await page.keyboard.down("Backspace");
  await page.keyboard.up("Backspace");
  expect(await saved(page)).toBe(typed);
  await notes(page).press("Control+End");
  await notes(page).press("/");
  await search.fill("代码块");
  await search.press("Enter");
  await page.getByRole("menu", { name: "描述代码块子菜单" }).getByRole("menuitem", { name: "C++", exact: true }).click();
  expect(await saved(page)).toContain("```cpp\n代码\n```");
});

test("围栏联想代码语言，回车继续输入，语言仅在编辑时可调整", async ({ page }) => {
  await ready(page);
  await notes(page).fill("");
  await command(page, "实时编辑描述");
  const suggestions = page.getByRole("listbox", { name: "代码语言建议" });
  const language = page.getByRole("combobox", { name: "代码块语言" });
  const code = page.locator(".notes-inline-editor .cm-md-code-line");
  await page.keyboard.insertText("```");
  await expect(suggestions).toHaveCount(0);
  await page.keyboard.insertText("c");
  await expect(suggestions.getByRole("option", { name: "C", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(suggestions.getByRole("option", { name: "C#", exact: true })).toBeVisible();
  await expect(suggestions.getByRole("option", { name: "C++", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(suggestions.getByRole("option", { name: "C", exact: true })).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(suggestions).toHaveCount(0);
  await expect(notes(page)).toBeFocused();
  await expect(language).toHaveValue("C");
  await expect(code).toHaveCount(1);
  await expect(notes(page)).not.toContainText("```");
  await page.keyboard.insertText("int main() {}");
  await expect(code.locator(".hljs-type")).toHaveText("int");
  await page.keyboard.press("Enter");
  await page.keyboard.press("/");
  await page.keyboard.insertText("/ 注释");
  await expect(code.locator(".hljs-comment")).toHaveText("// 注释");
  await expect(toolsMenu(page)).toHaveCount(0);
  const lastLine = (await code.last().boundingBox())!;
  const languageBox = (await page.locator(".notes-code-language-control").boundingBox())!;
  expect(languageBox.y - (lastLine.y + lastLine.height)).toBeGreaterThanOrEqual(0);
  expect(languageBox.y - (lastLine.y + lastLine.height)).toBeLessThanOrEqual(8);
  expect(Math.abs(languageBox.x + languageBox.width - lastLine.x - lastLine.width)).toBeLessThan(2);
  await language.fill("纯文本");
  await expect(language).toBeFocused();
  await expect(code.locator(".hljs-type, .hljs-comment")).toHaveCount(0);
  expect(await saved(page)).toBe("```c\nint main() {}\n// 注释\n```");
  await language.press("Escape");
  await expect(language).toHaveValue("C");
  await expect(code.locator(".hljs-type")).toHaveText("int");
  await expect(code.locator(".hljs-comment")).toHaveText("// 注释");
  await language.fill("C++");
  await language.press("Enter");
  await expect(notes(page)).toBeFocused();
  await expect(language).toHaveValue("C++");
  const expected = "```cpp\nint main() {}\n// 注释\n```";
  expect(await saved(page)).toBe(expected);
  await page.getByRole("button", { name: "顶部工具栏", exact: true }).focus();
  await expect(language).toHaveCount(0);
  const rendered = page.locator(".notes-live-document pre code");
  await expect(rendered).toHaveClass(/language-cpp/);
  await rendered.scrollIntoViewIfNeeded();
  const readingBox = (await page.locator(".cm-md-rendered-code .markdown-code-block").boundingBox())!;
  await rendered.click();
  await expect(language).toHaveValue("C++");
  await expect(code).toHaveText(["int main() {}", "// 注释"]);
  const editingTop = (await code.first().boundingBox())!;
  const editingBottom = (await code.last().boundingBox())!;
  expect(Math.abs(editingTop.y - readingBox.y)).toBeLessThan(2);
  expect(Math.abs(editingBottom.y + editingBottom.height - readingBox.y - readingBox.height)).toBeLessThan(2);
  await language.fill("Python");
  await language.press("Escape");
  await expect(language).toHaveValue("C++");
  expect(await saved(page)).toBe(expected);
  await notes(page).press("Control+End");
  await expect(language).toHaveCount(0);
  await notes(page).press("/");
  await expect(toolsMenu(page)).toBeVisible();
});

test("代码块智能换行与缩进，编辑时可复制并继续正文", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await ready(page);
  const editor = notes(page);
  const original = "~~~javascript\nfunction run() {\n  if (ready) {}\n}\n~~~\n\n下方正文";
  const insidePair = original.indexOf("{}") + 1;
  const split = original.replace("  if (ready) {}", "  if (ready) {\n    \n  }");
  await editor.fill(original);
  await select(page, insidePair, insidePair);
  await editor.press("Enter");
  await expect(editor).toHaveValue(split);
  await editor.press("Control+z");
  await expect(editor).toHaveValue(original);
  await select(page, insidePair, insidePair);
  await editor.press("Control+/");
  await expect(editor).toBeFocused();
  await editor.press("Enter");
  await expect.poll(() => caretLine(page)).toBe("    ");
  await editor.press("Backspace");
  await expect.poll(() => caretLine(page)).toBe("  ");
  await editor.press("Tab");
  await page.keyboard.insertText("return 3;");
  const edited = split.replace("    \n", "    return 3;\n");
  await expect.poll(() => saved(page)).toBe(edited);
  const copy = rendered(page).getByRole("button", { name: "复制代码", exact: true });
  await copy.click();
  await expect(copy).toHaveText("已复制");
  await expect(editor).toBeFocused();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard.replace(/\r\n/g, "\n")).toBe(edited.slice(edited.indexOf("\n") + 1, edited.lastIndexOf("\n~~~")));

  await editor.press("Control+/");
  const lastCodePosition = edited.lastIndexOf("}\n~~~") + 1;
  await select(page, lastCodePosition - 1, lastCodePosition + 1);
  await editor.press("Tab");
  await expect(editor).toHaveValue(edited.slice(0, lastCodePosition - 1) + "  " + edited.slice(lastCodePosition - 1));
  await editor.press("Shift+Tab");
  await expect(editor).toHaveValue(edited);
  await select(page, lastCodePosition, lastCodePosition);
  await editor.press("Control+/");
  await editor.press("Delete");
  await expect.poll(() => saved(page)).toBe(edited);
  await editor.press("ArrowDown");
  const language = page.getByRole("combobox", { name: "代码块语言" });
  const below = rendered(page).getByRole("button", { name: "继续正文", exact: true });
  await expect(language).toBeFocused();
  await language.press("Shift+Tab");
  await expect(below).toBeFocused();
  await below.press("Shift+Tab");
  await expect(copy).toBeFocused();
  await copy.press("Enter");
  await expect(copy).toHaveText("已复制");
  await copy.press("Tab");
  await expect(below).toBeFocused();
  await below.press("Enter");
  await expect(editor).toBeFocused();
  await expect.poll(() => caretLine(page)).toBe("下方正文");
  await expect.poll(() => saved(page)).toBe(edited);
});

test("代码语言下拉可按别名筛选、用键盘或点击选择，并在窄窗口内展开", async ({ page }) => {
  await ready(page);
  const original = "```javascript\nconst total = 42;\n```";
  await notes(page).fill(original);
  await command(page, "实时编辑描述");
  await command(page, "全屏编辑描述");
  await page.setViewportSize({ width: 760, height: 580 });
  await page.locator(".notes-live-document pre").click();

  const language = page.getByRole("combobox", { name: "代码块语言" });
  const menu = page.getByRole("listbox", { name: "可选代码语言" });
  const keyword = page.locator(".cm-md-code-line .hljs-keyword");
  await language.click();
  await expect(language).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByRole("option", { name: "JavaScript", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(await menu.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  const bounds = (await menu.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(8);
  expect(bounds.y).toBeGreaterThanOrEqual(8);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(752);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(572);

  await language.fill("c");
  await language.press("ArrowDown");
  await expect(menu.getByRole("option", { name: "C#", exact: true })).toHaveAttribute("aria-selected", "true");
  await language.press("Enter");
  await expect(notes(page)).toBeFocused();
  await expect(language).toHaveValue("C#");
  await expect(menu).toHaveCount(0);
  await expect(keyword).toHaveText("const");
  expect(await saved(page)).toBe(original.replace("javascript", "csharp"));

  await language.fill("py");
  const python = menu.getByRole("option", { name: "Python", exact: true });
  await expect(menu.getByRole("option").first()).toHaveAccessibleName("Python");
  await expect(menu.getByRole("option", { name: "JavaScript", exact: true })).toHaveCount(0);
  await expect(python.locator(".notes-code-language-badge")).toHaveText("Py");
  await expect(keyword).toHaveCount(0);
  await python.click();
  await expect(notes(page)).toBeFocused();
  await expect(language).toHaveValue("Python");
  await expect(menu).toHaveCount(0);
  expect(await saved(page)).toBe(original.replace("javascript", "python"));

  await language.fill("xyzzy");
  await expect(menu.getByRole("status")).toHaveText("没有匹配的语言");
  await language.press("Escape");
  await expect(language).toHaveValue("Python");
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "编辑 Markdown" })).toBeVisible();
});

test("方向键从上下进入代码块，末行向下先到语言框", async ({ page }) => {
  await ready(page);
  const original = "上方内容\n```javascript\nconst first = 1;\nreturn first;\n```\n下方内容";
  await notes(page).fill(original);
  await command(page, "实时编辑描述");
  const language = page.getByRole("combobox", { name: "代码块语言" });
  const choices = page.getByRole("listbox", { name: "可选代码语言" });
  const code = page.locator(".cm-md-code-line");
  const currentLine = () => caretLine(page);

  await notes(page).press("Control+Home");
  await page.keyboard.press("ArrowDown");
  await expect(code).toHaveText(["const first = 1;", "return first;"]);
  await expect.poll(currentLine).toBe("const first = 1;");
  await page.keyboard.press("ArrowDown");
  await expect(notes(page)).toBeFocused();
  await expect.poll(currentLine).toBe("return first;");
  await page.keyboard.press("ArrowDown");
  await expect(language).toBeFocused();
  await expect(choices).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(choices).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(notes(page)).toBeFocused();
  await expect.poll(currentLine).toBe("return first;");

  await page.keyboard.press("ArrowDown");
  await expect(language).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(notes(page)).toBeFocused();
  await expect.poll(currentLine).toBe("return first;");
  await page.keyboard.press("ArrowDown");
  await expect(language).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(code).toHaveCount(0);
  await expect.poll(currentLine).toBe("下方内容");
  await page.keyboard.press("ArrowUp");
  await expect(notes(page)).toBeFocused();
  await expect.poll(currentLine).toBe("return first;");
  await expect(code.last().locator(".hljs-keyword")).toHaveText("return");
  expect(await saved(page)).toBe(original);
});

test("窄窗自动换行的代码先按可见行移动光标", async ({ page }) => {
  await ready(page);
  await page.setViewportSize({ width: 430, height: 620 });
  const longLine = `const text = "${"hello world ".repeat(10)}";`;
  await notes(page).fill(["上方", "~~~js", longLine, "~~~", "下方"].join("\n"));
  await command(page, "实时编辑描述");
  await notes(page).press("Control+Home");
  await page.keyboard.press("ArrowDown");
  const code = page.locator(".cm-md-code-line");
  await expect(code).toHaveText(longLine);
  const visualLines = await code.evaluate(element => {
    const style = getComputedStyle(element);
    const textHeight = element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    return Math.round(textHeight / parseFloat(style.lineHeight));
  });
  expect(visualLines).toBeGreaterThan(2);
  for (let row = 1; row < visualLines; row++) {
    await page.keyboard.press("ArrowDown");
    await expect(notes(page)).toBeFocused();
  }
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("combobox", { name: "代码块语言" })).toBeFocused();
});

test("标题 Alt+Shift+回车续写同级，Tab 降级且 Shift+Tab 升回上一层", async ({ page }) => {
  await ready(page);
  await notes(page).fill("# 周会");
  await command(page, "实时编辑描述");
  await notes(page).press("End");
  await page.keyboard.press("Alt+Shift+Enter");
  expect(await saved(page)).toBe("# 周会\n\n# ");
  await page.keyboard.press("Tab");
  await page.keyboard.insertText("议题");
  expect(await saved(page)).toBe("# 周会\n\n## 议题");
  await expect(page.locator(".cm-md-heading-2")).toContainText("议题");
  await page.keyboard.press("Shift+Tab");
  expect(await saved(page)).toBe("# 周会\n\n# 议题");
  await page.keyboard.insertText("汇总");
  expect(await saved(page)).toBe("# 周会\n\n# 议题汇总");
});

test("标题输入、快捷键和开头退格保持文字和光标", async ({ page }) => {
  await ready(page);
  await notes(page).fill("");
  await command(page, "实时编辑描述");
  const live = page.locator(".notes-live-document");
  await page.keyboard.insertText("##");
  await expect(live.locator(".cm-md-syntax")).toHaveText("##");
  await page.keyboard.insertText(" 调度计划");
  await expect(live.getByRole("heading", { level: 2, name: "调度计划" })).toBeVisible();
  await page.keyboard.press("Control+=");
  await expect(live.getByRole("heading", { level: 1, name: "调度计划" })).toBeVisible();
  await page.keyboard.press("Control+-");
  await page.keyboard.press("Control+4");
  await page.keyboard.press("Control+4");
  await expect(live.getByRole("heading", { level: 4, name: "调度计划" })).toBeVisible();
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText("本周");
  expect(await saved(page)).toBe("本周调度计划");
  await page.keyboard.press("Control+2");
  await command(page, "普通段落");
  expect(await saved(page)).toBe("本周调度计划");
});

test("标题中间回车保留同级和行内格式，末尾回车进入正文", async ({ page }) => {
  await ready(page);
  await notes(page).fill("二级 **项目**\n------\n后文");
  await select(page, 6, 6);
  await command(page, "实时编辑描述");
  await page.keyboard.press("Enter");
  const live = page.locator(".notes-live-document");
  await expect(live.getByRole("heading", { level: 2 })).toHaveCount(2);
  expect(await saved(page)).toBe("## 二级 **项**\n\n## **目**\n后文");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("普通说明");
  expect(await saved(page)).toBe("## 二级 **项**\n\n## **目**\n\n普通说明\n\n后文");
});

test("回车拆分段落，Shift+回车换行，源码切换保留光标", async ({ page }) => {
  await ready(page);
  await notes(page).fill("前段后段");
  await select(page, 2, 2);
  await command(page, "实时编辑描述");
  await page.keyboard.press("Enter");
  expect(await saved(page)).toBe("前段\n\n后段");
  await page.keyboard.press("Backspace");
  expect(await saved(page)).toBe("前段后段");
  await page.keyboard.press("Shift+Enter");
  expect(await saved(page)).toBe("前段\n后段");
  await page.keyboard.press("Control+/");
  await expect(notes(page)).toHaveValue("前段\n后段");
  expect(await notes(page).evaluate((field: HTMLTextAreaElement) => field.selectionStart)).toBe(3);
  await page.keyboard.press("Control+/");
  await page.keyboard.insertText("新");
  expect(await saved(page)).toBe("前段\n新后段");
});

test("方向键从正文进入表格首格或末格，同列换行并回到正文", async ({ page }, testInfo) => {
  await ready(page);
  const table = "| 事项 | 状态 |\n| --- | --- |\n| 设计 | 进行中 |\n| 发布 |";
  const original = ["表格上方", table, "表格下方"].join("\n\n");
  await notes(page).fill(original);
  await command(page, "实时编辑描述");
  const cell = (row: number, column: number) => page.getByRole("textbox", { name: `编辑表格第 ${row} 行第 ${column} 列`, exact: true });

  await notes(page).press("Control+Home");
  await page.keyboard.press("ArrowDown");
  await expect(cell(1, 1)).toBeFocused();
  expect(await cell(1, 1).evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(0);
  await page.keyboard.press("ArrowDown");
  await expect(cell(2, 1)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(cell(3, 1)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => caretLine(page)).toBe("表格下方");

  await page.keyboard.press("ArrowUp");
  await expect(cell(3, 2)).toBeFocused();
  await expect(cell(3, 2)).toHaveValue("");
  await page.keyboard.press("ArrowUp");
  await expect(cell(2, 2)).toHaveValue("进行中");
  await page.screenshot({ path: testInfo.outputPath("table-arrow-light.png"), animations: "disabled" });
  await page.keyboard.press("ArrowUp");
  await expect(cell(1, 2)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => caretLine(page)).toBe("表格上方");
  expect(await saved(page)).toBe(original);
});

test("退格从表格下方进入末格，长按保留内容", async ({ page }) => {
  await ready(page);
  const table = "| 项目 | 状态 |\n| --- | --- |\n| 发布 | 完成 |";
  const original = table + "\n\n表格下方";
  const start = table.length + 2;
  await notes(page).fill(original);
  await select(page, start, start);
  await command(page, "实时编辑描述");

  const lastCell = page.getByRole("textbox", { name: "编辑表格第 2 行第 2 列", exact: true });
  try {
    await page.keyboard.down("Backspace");
    await expect(lastCell).toBeFocused();
    expect(await lastCell.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(2);
    await page.keyboard.down("Backspace");
    await page.keyboard.down("Backspace");
    await expect(lastCell).toHaveValue("完成");
    expect(await saved(page)).toBe(original);
  } finally {
    await page.keyboard.up("Backspace");
  }
  await page.keyboard.press("Backspace");
  await expect(lastCell).toHaveValue("完");
  await expect.poll(() => saved(page)).toBe(original.replace("完成", "完"));
});

test("空首格再次按退格删除整张表格，长按保护正文并可撤销", async ({ page }) => {
  await ready(page);
  const markdown = "| X | 状态 |\n| :--- | ---: |\n| 另一行 |   |";
  const original = ["表格上方", markdown, "表格下方"].join("\n\n");
  const emptyHeader = original.replace("| X |", "|  |");
  await notes(page).fill(original);
  await command(page, "实时编辑描述");

  const table = rendered(page).getByRole("table");
  const first = table.getByRole("textbox", { name: "编辑表格第 1 行第 1 列", exact: true });
  const last = table.getByRole("textbox", { name: "编辑表格第 2 行第 2 列", exact: true });
  await table.getByText("X", { exact: true }).click();
  await first.press("Home");
  await first.press("Backspace");
  await expect(first).toHaveValue("X");
  await first.press("End");
  try {
    await page.keyboard.down("Backspace");
    await expect(first).toHaveValue("");
    await page.keyboard.down("Backspace");
    await expect(table).toBeVisible();
  } finally {
    await page.keyboard.up("Backspace");
  }

  await first.press("ArrowDown");
  await page.keyboard.press("Tab");
  await expect(last).toHaveValue("");
  await last.press("Backspace");
  await expect(table).toBeVisible();

  await notes(page).press("Control+Home");
  await page.keyboard.press("ArrowDown");
  await expect(first).toBeFocused();
  try {
    await page.keyboard.down("Backspace");
    await expect(table).toHaveCount(0);
    await expect(notes(page)).toBeFocused();
    await page.keyboard.down("Backspace");
    await expect.poll(() => saved(page)).toBe("表格上方\n\n\n\n表格下方");
  } finally {
    await page.keyboard.up("Backspace");
  }
  await page.keyboard.press("Control+z");
  await expect(table).toBeVisible();
  await expect.poll(() => saved(page)).toBe(emptyHeader);

  await table.getByRole("columnheader").first().locator(".notes-table-cell").press("Backspace");
  await expect(table).toHaveCount(0);
});

test("从下方退格进入多行标题、代码和公式的最后一行", async ({ page }) => {
  await ready(page);
  const examples = [
    { block: "项目计划\n第二行\n--------", last: "第二行" },
    { block: "## 收尾标题 ##", last: "收尾标题", blank: true },
    { block: "```js\nconst first = 1;\nconst last = 2;\n```", last: "const last = 2;" },
    { block: "$$\nx^2 + 1\n$$", last: "x^2 + 1" },
    { block: "> 项目说明\n> 最后一行", last: "最后一行" },
    { block: "- 前一项\n- 最后一项", last: "最后一项" },
  ];
  for (const { block, last, blank } of examples) {
    const original = block + "\n\n" + (blank ? "" : "下一段");
    await notes(page).fill(original);
    await select(page, block.length + 2, block.length + 2);
    await command(page, "实时编辑描述");
    await page.keyboard.press("Backspace");
    await expect.poll(() => caretLine(page)).toContain(last);
    expect(await saved(page)).toBe(original);
    const position = block.lastIndexOf(last) + last.length;
    await page.keyboard.press("Control+/");
    expect(await notes(page).evaluate((field: HTMLTextAreaElement) => [field.selectionStart, field.selectionEnd])).toEqual([position, position]);
  }
});

test("在空代码块内按退格整块移除，跨入时长按保留并可一次撤销", async ({ page }) => {
  await ready(page);
  const language = page.getByRole("combobox", { name: "代码块语言" });
  for (const block of ["```js\n\n```", "```js\n```", "  ~~~~js\n \t\n  ~~~~"]) {
    const original = `上方正文\n\n${block}\n\n下方正文`;
    const after = original.indexOf("下方正文");
    await notes(page).fill(original);
    await select(page, after, after);
    await command(page, "实时编辑描述");

    try {
      await page.keyboard.down("Backspace");
      await expect(language).toBeVisible();
      await page.keyboard.down("Backspace");
      expect(await saved(page)).toBe(original);
    } finally {
      await page.keyboard.up("Backspace");
    }

    await page.keyboard.press("Backspace");
    await expect.poll(() => saved(page)).toBe("上方正文\n\n下方正文");
    await expect(language).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect.poll(() => saved(page)).toBe(original);
    await expect(language).toBeVisible();
    await page.keyboard.press("Control+/");
  }
});

test("退格清空代码后等下一次按键再移除围栏", async ({ page }) => {
  await ready(page);
  const original = "```js\nx\n```";
  const body = original.indexOf("x");
  await notes(page).fill(original);
  await select(page, body, body);
  await notes(page).press("Control+/");
  await expect(notes(page)).toBeFocused();
  await page.keyboard.press("Backspace");
  expect(await saved(page)).toBe(original);
  await page.keyboard.press("ArrowRight");

  try {
    await page.keyboard.down("Backspace");
    await expect.poll(() => saved(page)).toBe("```js\n\n```");
    await page.keyboard.down("Backspace");
    await expect(page.getByRole("combobox", { name: "代码块语言" })).toBeVisible();
  } finally {
    await page.keyboard.up("Backspace");
  }
  await page.keyboard.press("Backspace");
  await expect.poll(() => saved(page)).toBe("");
  await page.keyboard.press("Control+z");
  await expect.poll(() => saved(page)).toBe("```js\n\n```");
});

test("表格左右键逐字移动并在单元格首尾换格", async ({ page }, testInfo) => {
  await ready(page);
  await page.setViewportSize({ width: 900, height: 620 });
  const original = "前文\n\n| 甲乙 | 状态 |\n| --- | --- |\n| 待办 |\n\n后文";
  await notes(page).fill(original);
  await command(page, "实时编辑描述");
  const table = page.locator(".notes-live-document").getByRole("table");
  const cell = (row: number, column: number) => table.getByRole("textbox", { name: `编辑表格第 ${row} 行第 ${column} 列`, exact: true });
  const at = async (row: number, column: number, start: number, end = start) => {
    const input = cell(row, column);
    await expect(input).toBeFocused();
    expect(await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([start, end]);
  };
  const keyboard = page.keyboard;

  await table.getByRole("columnheader", { name: "甲乙", exact: true }).click();
  await keyboard.press("Home");
  await keyboard.press("ArrowLeft");
  await at(1, 1, 0);
  await keyboard.press("ArrowRight");
  await at(1, 1, 1);
  await keyboard.press("Shift+ArrowRight");
  await at(1, 1, 1, 2);
  await keyboard.press("ArrowRight");
  await at(1, 1, 2);
  await keyboard.press("ArrowRight");
  await at(1, 2, 0);
  await keyboard.press("ArrowLeft");
  await at(1, 1, 2);
  await keyboard.press("ArrowLeft");
  await at(1, 1, 1);

  await keyboard.press("End");
  await keyboard.press("ArrowRight");
  await keyboard.press("End");
  await keyboard.press("ArrowRight");
  await at(2, 1, 0);
  await keyboard.press("ArrowLeft");
  await at(1, 2, 2);
  await keyboard.press("ArrowRight");
  await keyboard.press("End");
  await keyboard.press("ArrowRight");
  await at(2, 2, 0);
  await keyboard.press("ArrowRight");
  await at(2, 2, 0);
  await keyboard.press("ArrowLeft");
  await at(2, 1, 2);
  await page.screenshot({ path: testInfo.outputPath("table-horizontal-narrow.png"), animations: "disabled" });
  expect(await saved(page)).toBe(original);
});

test("方向键跨过标题、表格、图表、公式和分隔线的编辑边界", async ({ page }, testInfo) => {
  await ready(page);
  await page.setViewportSize({ width: 900, height: 620 });
  await setTheme(page, "dark");
  const original = [
    "计划说明\n---",
    "| 事项 | 状态 |\n| --- | --- |\n| 设计 | 完成 |",
    "~~~mermaid\nflowchart LR\n  A --> B\n~~~",
    "$$\nx^2\n$$",
    "---",
    "# 后续安排",
  ].join("\n\n");
  await notes(page).fill(original);
  await command(page, "实时编辑描述");
  const cell = (row: number, column: number) => page.getByRole("textbox", { name: `编辑表格第 ${row} 行第 ${column} 列`, exact: true });
  const step = async (direction: "ArrowDown" | "ArrowUp", line: string) => {
    await page.keyboard.press(direction);
    await expect.poll(() => caretLine(page)).toBe(line);
  };

  await notes(page).press("Control+Home");
  await page.keyboard.press("ArrowDown");
  await expect(cell(1, 1)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(cell(2, 1)).toBeFocused();
  await step("ArrowDown", "flowchart LR");
  await step("ArrowDown", "  A --> B");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("combobox", { name: "代码块语言" })).toBeFocused();
  await step("ArrowDown", "x^2");
  await page.screenshot({ path: testInfo.outputPath("block-arrow-narrow-dark.png"), animations: "disabled" });
  await step("ArrowDown", "---");
  await step("ArrowDown", "后续安排");
  await step("ArrowUp", "---");
  await step("ArrowUp", "x^2");
  await step("ArrowUp", "  A --> B");
  await step("ArrowUp", "flowchart LR");
  await page.keyboard.press("ArrowUp");
  await expect(cell(2, 2)).toBeFocused();
  expect(await saved(page)).toBe(original);
});

test("文档边缘的表格用方向键进出，继续输入才添加段落", async ({ page }) => {
  await ready(page);
  const original = "| 标题 | 值 |\n| --- | --- |\n| 条目 | 1 |";
  await notes(page).fill(original);
  await command(page, "实时编辑描述");
  await notes(page).press("Control+Home");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("textbox", { name: "编辑表格第 1 行第 1 列", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(notes(page)).toBeFocused();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("textbox", { name: "编辑表格第 2 行第 2 列", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(notes(page)).toBeFocused();
  expect(await saved(page)).toBe(original);
  await page.keyboard.insertText("继续正文");
  expect(await saved(page)).toBe(original + "\n\n继续正文");
});

test("窄窗先走完正文的可见行，再进入独立图片", async ({ page }) => {
  await ready(page);
  await page.setViewportSize({ width: 430, height: 620 });
  const paragraph = "长段落需要按实际显示的行移动光标。".repeat(5);
  const picture = "![示意](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6g5sAAAAASUVORK5CYII=)";
  const original = [paragraph, picture, "后文"].join("\n\n");
  await notes(page).fill(original);
  await command(page, "实时编辑描述");
  const textLine = page.locator(".cm-line").filter({ hasText: paragraph });
  const visibleLines = await textLine.evaluate(element => Math.round(element.clientHeight / parseFloat(getComputedStyle(element).lineHeight)));
  expect(visibleLines).toBeGreaterThan(2);
  await notes(page).press("Control+Home");
  for (let row = 1; row < visibleLines; row++) {
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => caretLine(page)).toBe(paragraph);
  }
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => caretLine(page)).toBe(picture);
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => caretLine(page)).toBe(paragraph);
  expect(await saved(page)).toBe(original);
});

test("表格保持布局，Tab 换格并续行，保留对齐、格式和转义", async ({ page }) => {
  await ready(page);
  const original = "前文\n\n| 地点 | 状态 |\n| :--- | ---: |\n| **杭州** | A\\|B |\n| 仅一格 |";
  await notes(page).fill(original);
  await notes(page).press("Control+Home");
  await command(page, "实时编辑描述");
  const table = page.locator(".notes-live-document").getByRole("table");
  const cell = (row: number, column: number) => page.getByRole("textbox", { name: `编辑表格第 ${row} 行第 ${column} 列`, exact: true });
  await expect(table).toBeVisible();
  const previous = (await page.locator(".cm-line").filter({ hasText: /^前文$/ }).boundingBox())!;
  expect((await table.boundingBox())!.y - previous.y - previous.height).toBeLessThan(18);
  await table.getByText("杭州", { exact: true }).click();
  await expect(cell(2, 1)).toBeFocused();
  await cell(2, 1).fill("**苏州**");
  await cell(2, 1).press("Tab");
  await expect(cell(2, 2)).toHaveValue("A\\|B");
  await cell(2, 2).fill("C|D");
  await cell(2, 2).press("End");
  await page.keyboard.insertText("!");
  await cell(2, 2).press("Tab");
  await expect(cell(3, 1)).toBeFocused();
  await cell(3, 1).press("Tab");
  await expect(cell(3, 2)).toBeFocused();
  await cell(3, 2).fill("补齐");
  await cell(3, 2).press("Tab");
  await expect(cell(4, 1)).toBeFocused();
  await cell(4, 1).fill("新增");
  await cell(4, 1).press("Escape");
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(table.locator("strong")).toHaveText("苏州");
  await expect(table.getByText("C|D!", { exact: true })).toHaveCSS("text-align", "right");
  expect(await saved(page)).toBe("前文\n\n| 地点 | 状态 |\n| :--- | ---: |\n| **苏州** | C\\|D! |\n| 仅一格 | 补齐 |\n| 新增  |   |");
  await page.keyboard.insertText("后文");
  expect(await saved(page)).toMatch(/\| 新增  \|   \|\n\n后文$/);
});

test("Ctrl+Alt+T 和键入表头可创建指定尺寸的表格并聚焦单元格", async ({ page }) => {
  await ready(page);
  await notes(page).fill("");
  await command(page, "实时编辑描述");
  await page.keyboard.press("Control+Alt+t");
  const picker = page.getByRole("dialog", { name: "插入表格", exact: true });
  const rows = picker.getByRole("spinbutton", { name: "行数（含表头）" });
  const columns = picker.getByRole("spinbutton", { name: "列数" });
  await expect(rows).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(columns).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(rows).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(columns).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(rows).toBeFocused();
  await picker.getByRole("button", { name: "选择 2 行 3 列", exact: true }).click();
  await expect(rows).toHaveValue("2");
  await expect(columns).toHaveValue("3");
  await columns.press("Enter");
  const table = page.locator(".notes-live-document").getByRole("table");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table.getByRole("columnheader")).toHaveCount(3);
  const first = table.getByRole("textbox", { name: "编辑表格第 1 行第 1 列", exact: true });
  await expect(first).toBeFocused();
  await first.fill("阶段");
  await first.press("Escape");
  await expect(table.getByRole("columnheader").first()).toHaveText("阶段");
  await command(page, "编辑描述源码");

  const header = "| A\\|B | 备注 |";
  await notes(page).fill(`序言\n${header}\n后续`);
  await select(page, 3 + header.length, 3 + header.length);
  await command(page, "实时编辑描述");
  await page.keyboard.press("Enter");
  await expect(table.getByRole("textbox", { name: "编辑表格第 2 行第 1 列", exact: true })).toBeFocused();
  expect(await saved(page)).toBe(`序言\n\n${header}\n| --- | --- |\n|   |   |\n\n后续`);
});

test("源码模式的插表面板可从行数框按回车提交有效尺寸", async ({ page }) => {
  await ready(page);
  await notes(page).fill("");
  await command(page, "描述表格");
  const picker = page.getByRole("dialog", { name: "插入表格", exact: true });
  const rows = picker.getByRole("spinbutton", { name: "行数（含表头）" });
  await expect(rows).toBeFocused();
  await rows.fill("0");
  await page.keyboard.press("Enter");
  await expect(picker).toBeVisible();
  await expect(notes(page)).toHaveValue("");
  await rows.fill("2");
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await expect(notes(page)).toHaveValue("|  |  |\n| --- | --- |\n|  |  |\n");
});

test("表格行列菜单和快捷键可调整结构与对齐，缩小后可撤销", async ({ page }) => {
  await ready(page);
  await page.setViewportSize({ width: 900, height: 620 });
  await notes(page).fill("| 阶段 | 次数 |\n| :--- | ---: |\n| **原型** | 1\\|2 |\n| 发布 | 3 |");
  await command(page, "实时编辑描述");
  const table = page.locator(".notes-live-document").getByRole("table");
  const tool = page.getByRole("toolbar", { name: "表格工具" });
  const cell = (row: number, column: number) => table.getByRole("textbox", { name: `编辑表格第 ${row} 行第 ${column} 列`, exact: true });
  await table.getByText("1|2", { exact: true }).click();
  await expect(cell(2, 2)).toBeFocused();
  await tool.getByRole("button", { name: "居中对齐", exact: true }).click();
  await expect(table.getByRole("columnheader").last()).toHaveCSS("text-align", "center");
  await cell(2, 2).press("Alt+ArrowDown");
  await expect(cell(3, 2)).toHaveValue("1\\|2");
  await cell(3, 2).press("Alt+ArrowLeft");
  await expect(cell(3, 1)).toHaveValue("1\\|2");
  await tool.getByRole("button", { name: "表格行列操作", exact: true }).click();
  await page.getByRole("menu", { name: "表格行列操作", exact: true }).getByRole("menuitem", { name: "右侧插入列", exact: true }).click();
  await expect(cell(3, 2)).toHaveValue("");
  await cell(3, 2).fill("补充");
  const enlarged = await saved(page);
  expect(enlarged).toContain("| 次数 |  | 阶段 |\n| :---: | --- | :--- |");
  expect(enlarged).toContain("| 1\\|2 | 补充 | **原型** |");
  await tool.getByRole("button", { name: "调整表格大小", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "调整表格大小", exact: true });
  await dialog.getByRole("spinbutton", { name: "行数（含表头）" }).fill("2");
  await expect(dialog.getByRole("status")).toContainText("将移除 3 个有内容的单元格");
  await dialog.getByRole("button", { name: "应用尺寸", exact: true }).click();
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(cell(2, 2)).toBeFocused();
  await cell(2, 2).press("Control+z");
  await expect(table.getByRole("row")).toHaveCount(3);
  expect(await saved(page)).toBe(enlarged);
});

test("文末代码块可按方向键退出并继续写正文", async ({ page }) => {
  await ready(page);
  const original = "```js\n    const first = 1;\n```";
  await notes(page).fill(original);
  await command(page, "实时编辑描述");
  await page.locator(".notes-live-document pre").click();
  await notes(page).press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("return first;");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("combobox", { name: "代码块语言" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(notes(page)).toBeFocused();
  expect(await saved(page)).toBe("```js\n    const first = 1;\n    return first;\n```");
  await page.keyboard.insertText("继续说明");
  expect(await saved(page)).toBe("```js\n    const first = 1;\n    return first;\n```\n\n继续说明");
});

test("描述正文只显示一次，光标局部揭示 Markdown 并直接编辑", async ({ page }) => {
  await ready(page);
  const original = [
    "## 会议纪要",
    "今天 **交付** 后 *复盘*，见[手册][guide]。",
    "- [ ] 核对安排",
    "预计 $x^2$ 小时。",
    "| 事项 | 状态 |\n| --- | --- |\n| 计划 | 完成 |",
    "[guide]: https://example.com/",
  ].join("\n\n");
  await notes(page).fill(original);
  await notes(page).press("Control+Home");
  await command(page, "实时编辑描述");
  const live = page.locator(".notes-live-document");
  const paragraph = live.locator(".cm-line").filter({ hasText: "今天" });
  const bold = paragraph.locator(".cm-md-strong");
  const italic = paragraph.locator(".cm-md-emphasis");
  await expect(notes(page)).toBeFocused();
  await expect(live.locator("textarea, .markdown-editable-block")).toHaveCount(0);
  await expect(paragraph).toHaveCount(1);
  await expect(paragraph).toHaveText("今天 交付 后 复盘，见手册。");
  await expect(bold).toHaveCSS("font-weight", "700");
  await expect(italic).toHaveCSS("font-style", "italic");
  await expect(live.getByRole("link", { name: "手册", exact: true })).toHaveAttribute("href", "https://example.com/");
  await bold.click();
  await expect(paragraph.locator(".cm-md-syntax")).toHaveText(["**", "**"]);
  await page.keyboard.insertText("新");
  await expect(bold).toContainText("新");
  const revised = (await bold.textContent())!;
  await page.keyboard.press("Control+z");
  await expect(bold).toHaveText("交付");
  await page.keyboard.press("Control+y");
  await expect(bold).toHaveText(revised);
  await italic.click();
  await expect(paragraph.locator(".cm-md-syntax")).toHaveText(["*", "*"]);
  await expect(paragraph).not.toContainText("**");
  await live.getByRole("checkbox", { name: "Markdown 待办：核对安排", exact: true }).check();
  await live.locator(".cm-md-formula").click();
  await expect(live.locator(".katex")).toHaveCount(0);
  await expect(live.locator(".cm-line").filter({ hasText: "预计" })).toHaveText("预计 $x^2$ 小时。");
  await live.getByRole("table").getByText("计划", { exact: true }).click();
  const cell = live.getByRole("textbox", { name: "编辑表格第 2 行第 1 列", exact: true });
  await expect(cell).toBeFocused();
  await cell.fill("新计划");
  await expect(live.getByRole("table")).toBeVisible();
  await cell.press("Escape");
  await expect(live.getByRole("table").getByText("新计划", { exact: true })).toBeVisible();
  await expect(live.locator(".katex")).toHaveCount(1);
  await notes(page).press("Control+End");
  await page.keyboard.press("Enter");
  await expect(notes(page)).toBeFocused();
  await page.keyboard.insertText("下一步：**对齐排期**");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("记录完成");
  await expect(live.locator(".cm-md-strong").last()).toHaveText("对齐排期");
  await command(page, "全屏编辑描述");
  await page.setViewportSize({ width: 760, height: 580 });
  await expect(notes(page)).toBeFocused();
  await notes(page).press("/");
  const fullScreenSearch = toolsMenu(page).getByRole("textbox", { name: "搜索描述工具" });
  await expect(fullScreenSearch).toBeFocused();
  await page.setViewportSize({ width: 720, height: 560 });
  await expect(fullScreenSearch).toBeFocused();
  await fullScreenSearch.press("Escape");
  await expect(page.getByRole("dialog", { name: "编辑 Markdown", exact: true })).toBeVisible();
  await page.keyboard.insertText("并保存");
  await expect(live.locator(".cm-line").last()).toHaveText("记录完成并保存");
  await page.getByRole("button", { name: "完成编辑", exact: true }).click();
  await command(page, "编辑描述源码");
  const updated = original.replace("交付", revised).replace("- [ ]", "- [x]").replace("| 计划 |", "| 新计划 |") + "\n\n下一步：**对齐排期**\n\n记录完成并保存";
  await expect(notes(page)).toHaveValue(updated);
  expect(await saved(page)).toBe(updated);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.reload();
  await expect(page.locator(".notes-inline-editor .cm-md-strong").last()).toHaveText("对齐排期");
});

test("实时渲染完整 Markdown，准确勾选嵌套与引用待办并保存", async ({
  page,
}) => {
  await ready(page);
  await notes(page).fill(fixture);
  await showRenderedDescription(page);
  const view = rendered(page);
  await expect(
    view.getByRole("heading", { name: "项目计划", exact: true }),
  ).toBeVisible();
  await expect(view.locator(".cm-md-strong")).toHaveText("重点");
  await expect(view.locator(".cm-line").filter({ hasText: /^\s*•\s*子项$/ })).toBeVisible();
  await expect(view.getByRole("table")).toContainText("测试");
  await expect(view.locator("td").last()).toHaveCSS("text-align", "right");
  await expect(view.locator(".hljs-keyword")).toHaveText("const");
  await expect(view.locator(".katex-display")).toHaveCount(1);
  await expect(view.locator(".cm-md-definition").filter({ hasText: "注释" })).toBeVisible();
  await view.locator("summary").click();
  await expect(view.locator("kbd")).toBeVisible();
  await view
    .getByRole("checkbox", { name: "Markdown 待办：引用待办", exact: true })
    .check();
  await view
    .getByRole("checkbox", { name: "Markdown 待办：内层", exact: true })
    .uncheck();
  expect(await saved(page)).toBe(
    fixture
      .replace("> - [ ] 引用待办", "> - [x] 引用待办")
      .replace("  - [x] 内层", "  - [ ] 内层"),
  );
  const hash = await page.evaluate(() => location.hash);
  await view.getByRole("link", { name: "章节", exact: true }).click({ modifiers: ["Control"] });
  expect(await page.evaluate(() => location.hash)).toBe(hash);
  await page.reload();
  await editSource(page);
  await expect(notes(page)).toHaveValue(
    fixture
      .replace("> - [ ] 引用待办", "> - [x] 引用待办")
      .replace("  - [x] 内层", "  - [ ] 内层"),
  );
});

test("选区工具栏、快捷键、撤销重做、列表续写与缩进", async ({ page }) => {
  await ready(page);
  await notes(page).fill("重点内容");
  await select(page, 0, 2);
  await command(page, "描述加粗");
  await expect(notes(page)).toHaveValue("**重点**内容");
  await notes(page).press("Control+i");
  await expect(notes(page)).toHaveValue("***重点***内容");
  await notes(page).press("Control+z");
  await expect(notes(page)).toHaveValue("**重点**内容");
  await notes(page).press("Control+y");
  await expect(notes(page)).toHaveValue("***重点***内容");
  await notes(page).press("Control+k");
  await page
    .getByRole("textbox", { name: "Markdown 地址", exact: true })
    .fill("https://example.com/");
  await page.getByRole("button", { name: "插入", exact: true }).click();
  await expect(notes(page)).toHaveValue(
    "***[重点](<https://example.com/>)***内容",
  );
  await notes(page).fill("- [x] 第一项");
  await notes(page).press("End");
  await notes(page).press("Enter");
  await expect(notes(page)).toHaveValue("- [x] 第一项\n- [ ] ");
  await notes(page).press("Tab");
  await notes(page).pressSequentially("子项");
  await expect(notes(page)).toHaveValue("- [x] 第一项\n    - [ ] 子项");
  await notes(page).press("Shift+Tab");
  await expect(notes(page)).toHaveValue("- [x] 第一项\n- [ ] 子项");
  await notes(page).press("Enter");
  await notes(page).press("Enter");
  await expect(notes(page)).toHaveValue("- [x] 第一项\n- [ ] 子项\n");
});

test("有序列表输入空格后进入编辑，退格一次清除空项", async ({ page }) => {
  await ready(page);
  await notes(page).fill("");
  await command(page, "实时编辑描述");
  const marker = page.locator(".cm-md-list-marker");
  await page.keyboard.type("1.");
  expect(await saved(page)).toBe("1.");
  await expect(marker).toHaveCount(0);
  await page.keyboard.press("Backspace");
  await expect.poll(() => saved(page)).toBe("1");
  await page.keyboard.type(".");
  await page.keyboard.press("Space");
  await expect(marker).toHaveText("1.");
  await page.keyboard.press("Backspace");
  await expect.poll(() => saved(page)).toBe("");
  await page.keyboard.press("Control+z");
  await expect.poll(() => saved(page)).toBe("1. ");
  await expect(marker).toHaveText("1.");
  await page.keyboard.press("Control+/");
  await expect(notes(page)).toHaveValue("1. ");
  await page.keyboard.press("Backspace");
  await expect(notes(page)).toHaveValue("");
});

test("Tab 新建子列表从一开始，续项和退回父级各自编号", async ({ page }) => {
  await ready(page);
  await notes(page).fill("1. 父项");
  await select(page, 5, 5);
  await command(page, "实时编辑描述");
  const markers = page.locator(".cm-md-list-marker");
  await page.keyboard.press("Enter");
  await expect(markers).toHaveText(["1.", "2."]);
  await page.keyboard.press("Tab");
  await expect(markers).toHaveText(["1.", "1."]);
  await page.keyboard.type("子项");
  await page.keyboard.press("Enter");
  await expect(markers).toHaveText(["1.", "1.", "2."]);
  expect(await saved(page)).toBe("1. 父项\n\n    1. 子项\n    2. ");
  await page.keyboard.press("Shift+Tab");
  await expect(markers).toHaveText(["1.", "1.", "2."]);
  expect(await saved(page)).toBe("1. 父项\n\n    1. 子项\n2. ");
  await page.keyboard.press("Backspace");
  await expect.poll(() => saved(page)).toBe("1. 父项\n\n    1. 子项\n");
});

test("无序列表输入空格后显示项目符号，空项可以退格和撤销", async ({ page }) => {
  await ready(page);
  const marker = page.locator(".cm-md-list-marker");
  for (const symbol of ["-", "+", "*"]) {
    await notes(page).fill("");
    await command(page, "实时编辑描述");
    await page.keyboard.type(symbol);
    await expect(marker).toHaveCount(0);
    await expect.poll(() => saved(page)).toBe(symbol);
    await page.keyboard.press("Space");
    await expect(marker).toHaveText("•");
    await page.keyboard.press("Backspace");
    await expect.poll(() => saved(page)).toBe("");
    await page.keyboard.press("Control+z");
    await expect(marker).toHaveText("•");
    await page.keyboard.press("Control+/");
    await expect(notes(page)).toHaveValue(`${symbol} `);
    await page.keyboard.press("Backspace");
    await expect(notes(page)).toHaveValue("");
  }
});

test("无序子列表可以在空项缩进、续写和退回父级", async ({ page }) => {
  await ready(page);
  const parent = "- 父项";
  const markers = page.locator(".cm-md-list-marker");
  await notes(page).fill(parent);
  await select(page, parent.length, parent.length);
  await command(page, "实时编辑描述");
  await page.keyboard.press("Enter");
  await expect(markers).toHaveCount(2);
  await page.keyboard.press("Tab");
  await expect(markers).toHaveCount(2);
  await expect.poll(() => saved(page)).toBe(`${parent}\n\n    - `);
  await page.keyboard.type("子项");
  await page.keyboard.press("Enter");
  const nested = `${parent}\n\n    - 子项\n`;
  await expect.poll(() => saved(page)).toBe(`${nested}    - `);
  await page.keyboard.press("Shift+Tab");
  await expect(markers).toHaveCount(3);
  await expect.poll(() => saved(page)).toBe(`${nested}- `);
  await page.keyboard.press("Backspace");
  await expect(markers).toHaveCount(2);
  await expect.poll(() => saved(page)).toBe(nested);
});

test("描述待办从工具菜单插入后立即显示，快捷键与撤销可用", async ({ page }) => {
  await ready(page);
  await notes(page).fill("");
  await command(page, "实时编辑描述");
  await notes(page).press("/");
  const search = toolsMenu(page).getByRole("textbox", { name: "搜索描述工具" });
  await search.fill("待办");
  await search.press("Enter");
  const checkbox = page.getByRole("checkbox", { name: "Markdown 待办：待办事项", exact: true });
  await expect(checkbox).toBeVisible();
  await expect.poll(() => saved(page)).toBe("- [ ] ");
  await expect(notes(page)).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect(checkbox).toHaveCount(0);
  await page.keyboard.press("Alt+KeyT");
  await expect(checkbox).toBeVisible();
  await page.keyboard.insertText("复查安排");
  const entry = page.getByRole("checkbox", { name: "Markdown 待办：复查安排", exact: true });
  await entry.check();
  await expect.poll(() => saved(page)).toBe("- [x] 复查安排");
  await page.locator(".cm-line").filter({ hasText: "复查安排" }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(checkbox).toBeVisible();
  await expect.poll(() => saved(page)).toBe("- [x] 复查安排\n- [ ] ");
});

test("空待办退格移除整个标记并可撤销", async ({ page }) => {
  await ready(page);
  await notes(page).fill("");
  await command(page, "实时编辑描述");
  await command(page, "描述待办列表");
  const checkbox = page.getByRole("checkbox", { name: "Markdown 待办：待办事项", exact: true });
  await expect(checkbox).toBeVisible();
  await expect(notes(page)).toBeFocused();
  await page.keyboard.press("Backspace");
  await expect.poll(() => saved(page)).toBe("");
  await expect(checkbox).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(checkbox).toBeVisible();
  await expect.poll(() => saved(page)).toBe("- [ ] ");
  await page.keyboard.press("Control+/");
  await notes(page).press("Backspace");
  await expect(notes(page)).toHaveValue("");
});

test("空引用退格退出当前层并保留上文，可以撤销", async ({ page }) => {
  await ready(page);
  await notes(page).fill("");
  await command(page, "实时编辑描述");
  await command(page, "描述引用");
  await expect(rendered(page).locator(".cm-md-quote-line")).toHaveCount(1);
  await expect(notes(page)).toBeFocused();
  await page.keyboard.press("Backspace");
  await expect.poll(() => saved(page)).toBe("");
  await page.keyboard.press("Control+z");
  await expect.poll(() => saved(page)).toBe("> ");

  await page.keyboard.press("Control+/");
  const nested = "> 上文\n> > ";
  await notes(page).fill(nested);
  await notes(page).press("Control+/");
  await expect(notes(page)).toBeFocused();
  await page.keyboard.press("Backspace");
  await expect.poll(() => saved(page)).toBe("> 上文\n> ");
  await page.keyboard.press("Control+z");
  await expect.poll(() => saved(page)).toBe(nested);
});

test("描述分隔线插入后立即渲染，光标在下一行", async ({ page }) => {
  await ready(page);
  await notes(page).fill("前文后文");
  await select(page, 2, 2);
  await command(page, "实时编辑描述");
  await command(page, "描述分隔线");
  const rule = rendered(page).locator("hr");
  await expect(rule).toBeVisible();
  await expect(notes(page)).toBeFocused();
  await expect.poll(() => saved(page)).toBe("前文\n\n---\n\n后文");
  await page.keyboard.insertText("续写");
  await expect.poll(() => saved(page)).toBe("前文\n\n---\n续写\n后文");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect(rule).toHaveCount(0);
  await expect.poll(() => saved(page)).toBe("前文后文");
});

test("描述编辑快捷键应用常用格式并在工具菜单标注", async ({ page }) => {
  await ready(page);
  const input = notes(page);
  const value = "正文";
  for (const [shortcut, expected] of [
    ["Control+Shift+KeyQ", "> 正文"],
    ["Control+Shift+BracketLeft", "1. 正文"],
    ["Control+Shift+BracketRight", "- 正文"],
    ["Alt+KeyT", "- [ ] 正文"],
    ["Alt+Shift+Digit5", "~~正文~~"],
    ["Control+Shift+Backquote", "`正文`"],
  ]) {
    await input.fill(value);
    await select(page, 0, value.length);
    await input.press(shortcut);
    await expect(input).toHaveValue(expected);
  }

  await input.fill("- 父项\n- 子项");
  await select(page, 5, 5);
  await input.press("Control+BracketLeft");
  await expect(input).toHaveValue("- 父项\n    - 子项");
  await input.press("Control+BracketRight");
  await expect(input).toHaveValue("- 父项\n- 子项");

  await input.fill("x^2");
  await select(page, 0, 3);
  await input.press("Control+Shift+KeyM");
  await expect(input).toHaveValue("$$\nx^2\n$$\n");
  await input.press("Control+z");
  await expect(input).toHaveValue("x^2");
  await input.press("Control+Shift+z");
  await expect(input).toHaveValue("$$\nx^2\n$$\n");

  await input.press("Control+Shift+KeyI");
  await expect(page.getByRole("dialog", { name: "插入描述图片" })).toBeVisible();
  await page.getByRole("button", { name: "关闭插入面板" }).click();
  await input.press("/");
  const menu = toolsMenu(page);
  for (const [query, label] of [
    ["代码块", "Ctrl+Shift+K"],
    ["待办", "Alt+T"],
    ["全屏", "Alt+Enter"],
    ["语法帮助", "Ctrl+Shift+/"],
  ]) {
    await menu.getByRole("textbox", { name: "搜索描述工具" }).fill(query);
    await expect(menu.getByText(label, { exact: true })).toBeVisible();
  }
});

test("实时正文和表格单元格使用适用的快捷键并能撤销", async ({ page }) => {
  await ready(page);
  const code = "const value = 3;";
  const table = "| 项目 | 状态 |\n| --- | --- |\n| 复查 | 完成 |";
  const original = code + "\n\n" + table;
  await notes(page).fill(original);
  await select(page, 0, code.length);
  await command(page, "实时编辑描述");
  await page.keyboard.press("Control+Shift+KeyK");
  await expect(page.locator(".cm-md-code-line")).toHaveText(code);
  const withFence = "```text\n" + code + "\n```\n\n" + table;
  await expect.poll(() => saved(page)).toBe(withFence);
  await page.keyboard.press("Control+b");
  await page.keyboard.press("Control+Shift+KeyK");
  expect(await saved(page)).toBe(withFence);
  await page.keyboard.press("Control+z");
  await expect.poll(() => saved(page)).toBe(original);

  await page.getByRole("table").getByText("复查", { exact: true }).click();
  const cell = page.getByRole("textbox", { name: "编辑表格第 2 行第 1 列", exact: true });
  await cell.selectText();
  await cell.press("Control+b");
  await expect(cell).toHaveValue("**复查**");
  await expect.poll(() => saved(page)).toBe(original.replace("复查", "**复查**"));
  await cell.press("Control+z");
  await expect.poll(() => saved(page)).toBe(original);
});

test("描述快捷键只在编辑焦点内生效", async ({ page }) => {
  await ready(page);
  const original = "保留原文";
  await notes(page).fill(original);
  await page.getByRole("button", { name: "顶部工具栏", exact: true }).focus();
  await page.keyboard.press("Control+Shift+KeyQ");
  await page.keyboard.press("Alt+Shift+Digit5");
  await page.keyboard.press("Alt+KeyT");
  await page.keyboard.press("Alt+Enter");
  await page.keyboard.press("Control+Shift+Slash");
  await expect(page.getByRole("dialog", { name: "编辑 Markdown", exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Markdown 语法帮助", exact: true })).toHaveCount(0);
  expect(await saved(page)).toBe(original);

  await showRenderedDescription(page);
  await page.keyboard.press("Control+Shift+KeyK");
  await expect(rendered(page)).toBeVisible();
  expect(await saved(page)).toBe(original);
});

test("描述工具精简入口，连续斜杠输入一个字面斜杠", async ({ page }) => {
  await ready(page);
  await notes(page).fill("前后");
  await select(page, 1, 1);
  await page.keyboard.press("/");
  const menu = toolsMenu(page);
  await expect(menu).toBeVisible();
  for (const name of ["预览描述", "分栏编辑描述", "文末续写", "插入 /"]) {
    await expect(menu.getByRole("menuitem", { name, exact: true })).toHaveCount(0);
  }
  await page.keyboard.press("/");
  await expect(menu).toHaveCount(0);
  await expect(notes(page)).toHaveValue("前/后");
  await page.keyboard.press("Control+z");
  await expect(notes(page)).toHaveValue("前后");
  await command(page, "实时编辑描述");
  await expect(notes(page)).toBeFocused();
  await page.keyboard.type("//");
  await expect(menu).toHaveCount(0);
  await expect.poll(() => saved(page)).toBe("前/后");
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" https://example.com/a");
  await expect(menu).toHaveCount(0);
  await expect.poll(() => saved(page)).toBe("前/后 https://example.com/a");
  await page.keyboard.press("Control+/");
  await notes(page).fill("```js\n\n```");
  await select(page, 6, 6);
  await page.keyboard.type("// 注释");
  await expect(menu).toHaveCount(0);
  await expect(notes(page)).toHaveValue("```js\n// 注释\n```");
});

test("全屏和语法帮助快捷键保留选区，小窗口自动保存", async ({ page }) => {
  await ready(page);
  const original = "## 实时描述\n\n正文";
  await notes(page).fill(original);
  await select(page, original.length - 1, original.length - 1);
  await notes(page).press("Control+Shift+Slash");
  const help = page.getByRole("dialog", { name: "Markdown 语法帮助", exact: true });
  await expect(help).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(notes(page)).toBeFocused();
  await page.keyboard.press("Alt+Enter");
  const dialog = page.getByRole("dialog", {
    name: "编辑 Markdown",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await page.keyboard.insertText("在此");
  await expect(notes(page)).toHaveValue("## 实时描述\n\n正在此文");
  await command(page, "实时编辑描述");
  await expect(rendered(page).getByRole("heading", { name: "实时描述", exact: true })).toBeVisible();
  await page.keyboard.press("Control+Shift+Slash");
  await expect(help).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 760, height: 580 });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: 760, height: 580 });
  await notes(page).press("Control+Home");
  await page.keyboard.press("Alt+Enter");
  await expect(dialog).toHaveCount(0);
  await expect(notes(page)).toBeFocused();
  await expect.poll(() => saved(page)).toBe("## 实时描述\n\n正在此文");
});

test("用 Alt+Enter 进入全屏，长文档切换视图并返回时延续选区、滚动与撤销", async ({ page }) => {
  await ready(page);
  const editor = notes(page);
  const token = "CURRENT-SELECTION";
  const long = Array.from({ length: 180 }, (_, index) => index === 110 ? token : "同一份文档的段落 " + index).join("\n\n");
  const start = long.indexOf(token);
  await editor.fill(long);
  await select(page, start, start + token.length);
  await editor.evaluate((field: HTMLTextAreaElement) => {
    const view = field.ownerDocument.defaultView!;
    const lines = field.value.slice(0, field.selectionStart).split("\n").length - 1;
    view.scrollTo(0, field.getBoundingClientRect().top + view.scrollY
      + lines * parseFloat(view.getComputedStyle(field).lineHeight) - view.innerHeight / 2);
  });
  const before = await page.evaluate(() => scrollY);
  expect(before).toBeGreaterThan(1000);
  await editor.press("Alt+Enter");

  const dialog = page.getByRole("dialog", { name: "编辑 Markdown", exact: true });
  const modes = dialog.getByRole("group", { name: "全屏编辑视图" });
  const scroll = dialog.locator(".notes-editor-body");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.matches(":modal"))).toBe(true);
  await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBeGreaterThan(1000);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
  await expect(editor).toBeFocused();
  const fullScroll = await scroll.evaluate(element => element.scrollTop);
  await page.mouse.move(40, 180);
  await page.mouse.wheel(0, 280);
  await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBeGreaterThan(fullScroll);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
  await modes.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(editor).toBeFocused();
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe(token);
  await expect(editor.getByText(token, { exact: true })).toBeInViewport();
  await modes.getByRole("button", { name: "源码", exact: true }).click();
  await expect.poll(() => editor.evaluate((field: HTMLTextAreaElement) => [field.selectionStart, field.selectionEnd]))
    .toEqual([start, start + token.length]);
  await page.keyboard.insertText("在全屏内更新");
  await dialog.getByRole("button", { name: "完成编辑", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue(long.replace(token, "在全屏内更新"));
  await expect.poll(() => page.evaluate(y => Math.abs(scrollY - y), before)).toBeLessThan(100);
  await editor.press("Control+z");
  await expect(editor).toHaveValue(long);
});

test("本地图片可插入、粘贴及持久化，非法图片和执行内容不生效", async ({
  page,
}) => {
  await ready(page);
  await notes(page).fill("图片记录\n\n");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6g5sAAAAASUVORK5CYII=",
    "base64",
  );
  await notes(page).press("Control+End");
  await page
    .getByLabel("插入本地 Markdown 图片", { exact: true })
    .setInputFiles({
      name: "验收图片.png",
      mimeType: "image/png",
      buffer: png,
    });
  await expect(notes(page)).toHaveValue(
    /!\[验收图片.png\]\(<data:image\/png;base64,/,
  );
  await notes(page).evaluate((el: HTMLTextAreaElement, b64) => {
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    const dt = new DataTransfer();
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    dt.items.add(new File([bytes], "粘贴.png", { type: "image/png" }));
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, png.toString("base64"));
  await expect(notes(page)).toHaveValue(/粘贴.png/);
  await saved(page);
  await showRenderedDescription(page);
  await expect(
    rendered(page).getByRole("img", { name: "验收图片.png", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      rendered(page)
        .getByRole("img", { name: "验收图片.png", exact: true })
        .evaluate((el: HTMLImageElement) => el.naturalWidth),
    )
    .toBe(1);
  await editSource(page);
  await notes(page).fill(
    '<script>window.__mdXss=1</script>\n\n<img src="javascript:alert(1)" onerror="window.__mdXss=2">\n\n[执行](javascript:alert%281%29)\n\n<iframe src="https://example.com"></iframe>',
  );
  await showRenderedDescription(page);
  await expect(rendered(page).locator("a,script,iframe")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__mdXss)).toBeUndefined();
});

test("Mermaid 图表、错误回退和代码复制，深浅色及全屏布局", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await notes(page).fill(
    fixture + "\n\n```mermaid\nflowchart LR\n A[开始] --> B[完成]\n```",
  );
  await command(page, "全屏编辑描述");
  await showRenderedDescription(page);
  await expect(rendered(page).locator(".mermaid-canvas svg")).toHaveCount(1, {
    timeout: 30000,
  });
  await expect(rendered(page).locator(".mermaid-canvas")).toContainText("开始");
  const codeBlock = rendered(page).locator(".cm-md-rendered-code").first();
  await codeBlock.hover();
  await codeBlock.getByRole("button", { name: "复制代码", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "const answer = 42",
  );
  await fs.mkdir("artifacts", { recursive: true });
  await page
    .getByRole("dialog", { name: "编辑 Markdown", exact: true })
    .screenshot({ path: "artifacts/markdown-light.png" });
  await page.getByRole("button", { name: "完成编辑", exact: true }).click();
  await setTheme(page, "dark");
  await command(page, "全屏编辑描述");
  await expect(rendered(page).locator(".mermaid-canvas svg")).toHaveCount(1);
  await page
    .getByRole("dialog", { name: "编辑 Markdown", exact: true })
    .screenshot({ path: "artifacts/markdown-dark.png" });
  await editSource(page);
  await notes(page).fill("```mermaid\nthis is invalid >>>\n```");
  await showRenderedDescription(page);
  await expect(rendered(page).getByRole("status")).toContainText(
    "图表暂时无法预览",
  );
  await expect(rendered(page).locator("pre code")).toContainText(
    "this is invalid",
  );
  expect(errors).toEqual([]);
});

test("块图的菱形连线在深浅色及重复渲染后可用，错误不影响后续图表", async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const block = [
    "block-beta", "columns 3", 'A["准备数据"] B[("本地存储")] C{"检查内容"}',
    'A -- "保存" --> B', 'B --> C', 'C -- "重新检查" --> A',
  ].join("\n");
  await ready(page);
  const show = async (code: string) => {
    await notes(page).fill(code);
    await showRenderedDescription(page);
  };
  const canvases = rendered(page).locator(".mermaid-canvas");
  for (const theme of ["light", "dark"]) {
    await setTheme(page, theme);
    const description = `\`\`\`mermaid\n%% 连续预览\n${block}\n\`\`\`\n\n\`\`\`mermaid\nflowchart TB\nS[开始] --> E[完成]\n\`\`\``;
    await show(description);
    await expect(canvases.locator("svg")).toHaveCount(2, { timeout: 30000 });
    await expect(canvases.first()).toContainText("检查内容");
    await expect(canvases.first().locator("path.flowchart-link")).toHaveCount(3);
    await expect(canvases.last()).toContainText("完成");
    expect(await saved(page)).toBe(description);
    await editSource(page);
    await show('```mermaid\nblock-beta\nA["未闭合\n```');
    await expect(rendered(page).getByRole("status")).toContainText("图表暂时无法预览");
    await editSource(page);
  }
  await show(`\`\`\`mermaid\n${block.replace("block-beta", "block")}\n\`\`\``);
  await expect(canvases.locator("svg")).toHaveCount(1, { timeout: 30000 });
  await expect(canvases).toContainText("重新检查");
  expect(errors).toEqual([]);
});

test("C4 图的深色默认配色与显式边界颜色可读，切换主题保留源码", async ({ page }) => {
  test.setTimeout(60000);
  const description = ['```mermaid', 'C4Context', 'title C4 配色验收',
    'System_Boundary(defaults, "默认边界") {', 'System(a, "任务界面")', '}',
    'System_Boundary(custom, "自定义边界") {', 'System(b, "工作区")', '}',
    'Rel(a, b, "默认关系")', 'Rel(b, a, "自定义关系")',
    'UpdateElementStyle(custom, $fontColor="#58bced", $borderColor="#ab67c7")',
    'UpdateRelStyle(b, a, $textColor="#eab767", $lineColor="#de7faa")', '```'].join("\n");
  await ready(page);
  await notes(page).fill(description);
  await showRenderedDescription(page);
  const drawing = rendered(page).locator(".mermaid-canvas svg");
  for (const theme of ["light", "dark", "light"]) {
    await setTheme(page, theme);
    await expect(drawing).toBeVisible({ timeout: 30000 });
    const label = (name: string) => drawing.locator("text").filter({ hasText: new RegExp("^" + name + "$") }).first();
    await expect(label("默认边界")).toHaveCSS("fill", theme === "dark" ? "rgb(238, 242, 252)" : "rgb(68, 68, 68)");
    await expect(label("默认关系")).toHaveCSS("fill", theme === "dark" ? "rgb(238, 242, 252)" : "rgb(68, 68, 68)");
    await expect(label("自定义边界")).toHaveCSS("fill", "rgb(88, 188, 237)");
    await expect(label("自定义关系")).toHaveCSS("fill", "rgb(234, 183, 103)");
    expect(await saved(page)).toBe(description);
  }
});

test("目录树的文字、连线和说明随主题切换保持可读，保留字面文件名", async ({ page }) => {
  test.setTimeout(60000);
  const description = ['```mermaid', 'treeView-beta', '工作区/ :::highlight icon(folder) ## 本地资料',
    '  src/', '    tasks.ts ## 共用任务规则', '  "<draft>.md" icon(none) ## 文件名按原文显示', '```'].join("\n");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await notes(page).fill(description);
  await showRenderedDescription(page);
  const drawing = rendered(page).locator(".mermaid-canvas > svg");
  for (const theme of ["light", "dark", "light"]) {
    await setTheme(page, theme);
    await expect(drawing).toBeVisible({ timeout: 30000 });
    await expect(drawing).toContainText("<draft>.md");
    await expect(drawing.locator("text.treeView-node-label").first()).toHaveCSS("fill", theme === "dark" ? "rgb(238, 242, 252)" : "rgb(0, 0, 0)");
    await expect(drawing.locator("line.treeView-node-line").first()).toHaveCSS("stroke", theme === "dark" ? "rgb(154, 169, 198)" : "rgb(0, 0, 0)");
    await expect(drawing.locator("text.treeView-node-description").first()).toHaveCSS("fill", theme === "dark" ? "rgb(99, 219, 196)" : "rgb(106, 153, 85)");
    expect(await saved(page)).toBe(description);
  }
  expect(errors).toEqual([]);
});

test("韦恩图说明和分类图超出中心区域的事项均完整保留，继续禁止外部对象", async ({ page }) => {
  test.setTimeout(60000);
  const description = ['```mermaid', 'venn-beta', 'set A[任务]: 12', '  text work[准备交付材料]', 'set B[习惯]: 10',
    'union A,B[共同目标]: 4', '  text shared[每天推进一件重要的事]', '  text safety[<img src=x onerror=window.__diagramProbe++>]', 'style shared color:#b64976', '```', '',
    '```mermaid', 'cynefin-beta', 'confusion', '"梳理需求范围"', '"确认验收条件"', '"核对数据来源"', '"补充使用场景"', '"确定下一步行动"', '```'].join("\n");
  await ready(page); await page.evaluate(() => { (window as any).__diagramProbe = 0; }); await notes(page).fill(description);
  await showRenderedDescription(page);
  const drawings = rendered(page).locator(".mermaid-canvas > svg");
  for (const theme of ["light", "dark", "light"]) {
    await setTheme(page, theme);
    await expect(drawings).toHaveCount(2, { timeout: 30000 });
    await expect(drawings.first()).toContainText("准备交付材料");
    await expect(drawings.first()).toContainText("<img src=x");
    await expect(drawings.first().locator("text").filter({ hasText: /^每天推进一件重要的事$/ })).toHaveCSS("fill", "rgb(182, 73, 118)");
    await expect(drawings.last()).toContainText("补充使用场景");
    await expect(drawings.last()).toContainText("确定下一步行动");
    await expect(drawings.locator("foreignObject")).toHaveCount(0);
    await expect(drawings.locator("image,script,[onerror]")).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__diagramProbe)).toBe(0);
    expect(await saved(page)).toBe(description);
  }
});

test("用例图文字不会继承形状描边，深色注释可读并保留自定义颜色", async ({ page }) => {
  test.setTimeout(60000);
  const description = ['```mermaid', 'usecase-beta', 'actor a(实心参与者) @{type: awesome}',
    'B(保存任务) <<业务>>', 'a --> B', 'note for B "确认保存后可以撤销"',
    'style B fill:#e5efff,color:#123456,stroke:#4268cc', '```'].join("\n");
  await ready(page); await notes(page).fill(description);
  await showRenderedDescription(page);
  const drawing = rendered(page).locator(".mermaid-canvas > svg");
  for (const theme of ["light", "dark", "light"]) {
    await setTheme(page, theme);
    await expect(drawing).toContainText("确认保存后可以撤销", { timeout: 30000 });
    await expect(drawing.locator("text").filter({ hasText: /^实心参与者$/ }).first()).toHaveCSS("stroke", "none");
    await expect(drawing.locator("tspan").filter({ hasText: /^保存任务$/ }).first()).toHaveCSS("fill", "rgb(18, 52, 86)");
    if (theme === "dark") await expect(drawing.locator("text").filter({ hasText: /^确认保存后可以撤销$/ }).first()).toHaveCSS("fill", "rgb(238, 242, 252)");
    expect(await saved(page)).toBe(description);
  }
});

test("Wardley 地图保留没有注释框的正文、长标签与深色可读性", async ({ page }) => {
  test.setTimeout(60000);
  const long = "完整标签" + "W".repeat(400);
  const description = ['```mermaid', 'wardley-beta', 'title 地图验收', 'anchor User [0.9,0.5]',
    `component "${long}" [0.5,0.6] label [10000,-10000]`, `User +> "${long}"`,
    'annotation 7,[0.7,0.2] "没有注释框也能阅读"', '```'].join("\n");
  await ready(page); await notes(page).fill(description);
  await showRenderedDescription(page);
  const drawing = rendered(page).locator(".mermaid-canvas > svg");
  for (const theme of ["light", "dark", "light"]) {
    await setTheme(page, theme);
    await expect(drawing).toContainText("没有注释框也能阅读", { timeout: 30000 });
    await expect(drawing).toContainText(long);
    if (theme === "dark") {
      await expect(drawing.locator(".wardley-axes line").first()).toHaveCSS("stroke", "rgb(154, 169, 198)");
      await expect(drawing.locator(".wardley-node--anchor text")).toHaveCSS("fill", "rgb(238, 242, 252)");
    }
    expect(await drawing.evaluate((svg) => { const frame = svg.getBoundingClientRect(); return [...svg.querySelectorAll("text")].filter((node) => { const box = node.getBoundingClientRect(); return box.left < frame.left - 1 || box.top < frame.top - 1 || box.right > frame.right + 1 || box.bottom > frame.bottom + 1; }).map((node) => node.textContent); })).toEqual([]);
    expect(await saved(page)).toBe(description);
  }
});

test("语法轨道图保留标题、有限重复和字面标签，并在切换主题后继续安全渲染", async ({ page }) => {
  test.setTimeout(60000);
  const description = ['```mermaid', 'railroad-abnf-beta', 'title "有限重复语法"', 'bounded = 2*4DIGIT;', 'exact = 3DIGIT;', '```',
    '```mermaid', 'railroad-beta', 'title "<title> & 原文"', '__proto__ = terminal("<script>alert(1)</script> &amp;");', '```'].join("\n");
  await ready(page); await notes(page).fill(description);
  await showRenderedDescription(page);
  const drawings = rendered(page).locator(".mermaid-canvas > svg");
  for (const theme of ["light", "dark", "light"]) {
    await setTheme(page, theme);
    await expect(drawings).toHaveCount(2, { timeout: 30000 });
    await expect(drawings.nth(0)).toContainText("有限重复语法");
    await expect(drawings.nth(0).locator(".railroad-title")).toHaveText("有限重复语法");
    await expect(drawings.nth(0)).toContainText("2–4 次");
    await expect(drawings.nth(0)).toContainText("3 次");
    await expect(drawings.nth(1)).toContainText("<title> & 原文");
    await expect(drawings.nth(1)).toContainText("<script>alert(1)</script> &amp;");
    await expect(drawings.locator("script,foreignObject,image,a,[onload],[onclick],[onerror]")).toHaveCount(0);
    expect(await saved(page)).toBe(description);
  }
});

test("事件模型显示卡片数据、合并同一泳道并保留前向来源，Info 不需要横滚", async ({ page }) => {
  test.setTimeout(60000);
  const description = ['```mermaid', 'eventmodeling', 'tf 01 ui Shop.CartUI', 'tf 02 cmd Shop.Add {count:30}',
    'tf 03 cmd Shop.Save [[Data]]', 'tf 04 evt Shop.Saved', 'data Data {', "  html: '<script>alert(1)</script>'", "  last: 'finalZ9'", '}', '```',
    '```mermaid', 'eventmodeling', 'tf 01 rmo Projection ->> 02', 'rf 02 evt Changed', '```', '```mermaid', 'info', '```'].join("\n");
  await ready(page); await notes(page).fill(description);
  await showRenderedDescription(page);
  const drawings = rendered(page).locator(".mermaid-canvas > svg");
  for (const theme of ["light", "dark", "light"]) {
    await setTheme(page, theme);
    await expect(drawings).toHaveCount(3, { timeout: 30000 });
    await expect(drawings.nth(0).locator(".em-swimlane")).toHaveCount(3);
    await expect(drawings.nth(0).locator('[data-frame-id="02"]')).toContainText("count:30");
    await expect(drawings.nth(0).locator('[data-frame-id="03"]')).toContainText("<script>alert(1)</script>");
    await expect(drawings.nth(0).locator('[data-frame-id="03"]')).toContainText("finalZ9");
    await expect(drawings.nth(1).locator(".em-relation")).toHaveCount(1);
    await expect(drawings.nth(1)).toContainText("02 → 01");
    await expect(drawings.nth(2)).toHaveAttribute("viewBox", "0 0 240 104");
    await expect(drawings.locator("foreignObject,script,image,a,[onload],[onclick],[onerror]")).toHaveCount(0);
    expect(await saved(page)).toBe(description);
  }
});

test("智能体流程显示模型、连接器和折叠内部约定，并保留字面说明", async ({ page }) => {
  test.setTimeout(90000);
  await ready(page);
  const description = ['```mermaid', 'agentflow-beta LR', 'connector api["资料查询"]',
    'api@{endpoint: "https://example.test/query", protocol: "http"}',
    'flow owner["研究代理"]', 'a["收到主题"]@{shape: input}', 'b["执行查询"]@{shape: tool, params: "主题 :: String", returns: "研究报告", connectorRef: "api.search"}',
    'a --> b', 'end', 'owner@{instruction: "完整工作约定' + 'W'.repeat(240) + '", model: "local-model"}',
    'api --> b', '```', '```mermaid', 'agentflow-beta TB',
    'flow hidden["折叠流程"]', 'h["隐藏内部步骤"]@{shape: task, description: "内部约定仍可阅读"}', 'end', 'hidden@{view: collapsed}',
    'input[开始] --> h', '```', '```mermaid', 'agentflow-beta TB',
    'a[原文]@{description: "<script>literal</script> & 原始说明"}', '```'].join('\n');
  await notes(page).fill(description);
  await showRenderedDescription(page);
  const drawings = rendered(page).locator(".mermaid-canvas > svg");
  for (const theme of ["light", "dark"]) {
    await setTheme(page, theme);
    await expect(drawings).toHaveCount(3, { timeout: 60000 });
    const first = drawings.first().locator(".diagram-notes");
    for (const label of ["主题 :: String", "研究报告", "api.search", "https://example.test/query", "local-model", "完整工作约定" + "W".repeat(240)]) await expect(first).toContainText(label);
    await expect(drawings.nth(1).locator(".diagram-notes")).toContainText("内部约定仍可阅读");
    await expect(drawings.nth(2)).toContainText("<script>literal</script> & 原始说明");
    await expect(drawings.locator("foreignObject,script,image,a,[onload],[onclick],[onerror]")).toHaveCount(0);
    const outside = await first.locator("text").evaluateAll((labels) => labels.filter((node) => {
      const a = node.getBoundingClientRect(), b = node.ownerSVGElement!.getBoundingClientRect();
      return a.left < b.left - 1 || a.right > b.right + 1 || a.top < b.top - 1 || a.bottom > b.bottom + 1;
    }).map((node) => node.textContent));
    expect(outside).toEqual([]);
    expect(await saved(page)).toBe(description);
  }
});

test("状态图保留后续说明、左右与复合状态注释及并行区域", async ({ page }) => {
  test.setTimeout(90000);
  await ready(page);
  const description = [stateSamples.lifecycle, stateSamples.regions, stateSamples.groupNote, stateSamples.controls].map((source) => "```mermaid\n" + source + "\n```").join("\n\n");
  await notes(page).fill(description); await showRenderedDescription(page);
  const drawings = rendered(page).locator(".mermaid-canvas > svg");
  for (const theme of ["light", "dark"]) {
    await setTheme(page, theme);
    await expect(drawings).toHaveCount(4, { timeout: 60000 });
    for (const value of ["待审核", "核对全部材料", "记录审核结果", "审核通过"]) await expect(drawings.nth(0)).toContainText(value);
    for (const value of ["下载资料", "准备清单"]) await expect(drawings.nth(1)).toContainText(value);
    for (const value of ["复合状态说明", "单项说明"]) await expect(drawings.nth(2)).toContainText(value);
    await expect(drawings.locator("foreignObject,script,image,a,[onload],[onclick],[onerror]")).toHaveCount(0);
    expect(await saved(page)).toBe(description);
  }
});

test("类图保留泛型与注释，支持重名命名空间及提前定义的样式", async ({ page }) => {
  test.setTimeout(90000);
  await ready(page);
  const description = [classSamples.table, classSamples.generics, classSamples.collisions, classSamples.styleFirst].map((source) => "```mermaid\n" + source + "\n```").join("\n\n");
  await notes(page).fill(description); await showRenderedDescription(page);
  const drawings = rendered(page).locator(".mermaid-canvas > svg");
  for (const theme of ["light", "dark"]) {
    await setTheme(page, theme);
    await expect(drawings).toHaveCount(4, { timeout: 60000 });
    for (const value of ["任务记录", "String title", "完整保留类说明", "第二行补充"]) await expect(drawings.nth(0)).toContainText(value);
    await expect(drawings.nth(1)).toContainText("List<T>");
    for (const value of ["不会覆盖同名类", "Readable"]) await expect(drawings.nth(2)).toContainText(value);
    await expect(drawings.nth(3).locator('g.node[id*="classId-Task-"] .outer-path path').first()).toHaveCSS("fill", "rgb(255, 228, 209)");
    await expect(drawings.locator("foreignObject,script,image,a,[onload],[onclick],[onerror]")).toHaveCount(0);
    expect(await saved(page)).toBe(description);
  }
});

test("时序图保留分组、创建与销毁参与者和分支说明", async ({ page }) => {
  test.setTimeout(90000);
  // Keep the complete multi-diagram fixture in the live editor viewport.
  await page.setViewportSize({ width: 1440, height: 4800 });
  await ready(page);
  const description = [sequenceSamples.boxes, sequenceSamples.lifecycle, sequenceSamples.blocks, sequenceSamples.numbering, sequenceSamples.denseBoxes, sequenceSamples.literal].map((source) => "```mermaid\n" + source + "\n```").join("\n\n");
  await notes(page).fill(description); await showRenderedDescription(page);
  const drawings = rendered(page).locator(".mermaid-canvas > svg");
  for (const theme of ["light", "dark"]) {
    await setTheme(page, theme);
    await expect(drawings).toHaveCount(6, { timeout: 60000 });
    for (const value of ["工作区", "外部入口", "完整保留分组说明"]) await expect(drawings.nth(0)).toContainText(value);
    for (const value of ["新建对象", "新参与者", "销毁草稿", "已离开"]) await expect(drawings.nth(1)).toContainText(value);
    for (const value of ["每次编辑", "校验通过", "有新附件", "数据待修正"]) await expect(drawings.nth(2)).toContainText(value);
    for (const value of ["1.25", "1.5", "10", "12"]) await expect(drawings.nth(3)).toContainText(value);
    await expect(drawings.nth(4).locator(".diagram-notes")).toContainText("尚未分配参与者的空组");
    for (const value of ["数量", "false", "javascript:alert(1)"]) await expect(drawings.nth(5).locator(".diagram-notes")).toContainText(value);
    await expect(drawings.locator("foreignObject,script,image,a,[onload],[onclick],[onerror]")).toHaveCount(0);
    expect(await saved(page)).toBe(description);
  }
});

test("实体关系图保留字段说明、主外键与同名分组里的实体", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 4800 });
  await ready(page);
  const description = [erSamples.table, erSamples.keys, erSamples.collision, erSamples.generatedCollision, erSamples.nestedCollision, erSamples.groupCreatedLater, erSamples.literal].map((source) => "```mermaid\n" + source + "\n```").join("\n\n");
  await notes(page).fill(description); await showRenderedDescription(page);
  const drawings = rendered(page).locator(".mermaid-canvas > svg");
  for (const theme of ["light", "dark"]) {
    await setTheme(page, theme);
    await expect(drawings).toHaveCount(7, { timeout: 60000 });
    for (const value of ["完整字段说明", "任务唯一编号", "所属清单"]) await expect(drawings.nth(0)).toContainText(value);
    for (const value of ["PK", "FK", "UK", "三个键同时保留"]) await expect(drawings.nth(1)).toContainText(value);
    await expect(drawings.nth(2)).toContainText("不会丢失的同名实体字段");
    for (const value of ["实体来源", "分组来源"]) await expect(drawings.nth(3)).toContainText(value);
    for (const value of ["外层模型", "内层模型", "嵌套中保留全部字段"]) await expect(drawings.nth(4)).toContainText(value);
    for (const value of ["先声明的实体", "后声明的同名分组", "原先的实体归属"]) await expect(drawings.nth(5)).toContainText(value);
    for (const value of ["Store<T>", "<script>literal</script>", "♥"]) await expect(drawings.nth(6)).toContainText(value);
    for (const [index, name] of [[2, "collision"], [3, "generatedCollision"], [4, "nestedCollision"], [5, "groupCreatedLater"]] as const) expect(await drawings.nth(index).evaluate(erLayoutIssues, name)).toEqual([]);
    await expect(drawings.locator("foreignObject,script,image,a,[onload],[onclick],[onerror]")).toHaveCount(0);
    expect(await saved(page)).toBe(description);
  }
});
