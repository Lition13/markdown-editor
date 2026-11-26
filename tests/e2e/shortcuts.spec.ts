import { expect, test, type Locator, type Page } from "@playwright/test";
import { revealToolbar } from "./workbench";

const notes = (page: Page) => page.getByRole("textbox", { name: "Markdown 正文", exact: true });
const tableDialog = (page: Page) => page.getByRole("dialog", { name: "插入表格", exact: true });

async function openSettings(page: Page) {
  const toolbar = await revealToolbar(page);
  await toolbar.getByRole("button", { name: "快捷键设置", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "快捷键设置", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function closeSettings(dialog: Locator) {
  await dialog.getByRole("button", { name: "关闭快捷键设置", exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function editShortcut(dialog: Locator, label: string) {
  await dialog.getByRole("searchbox", { name: "搜索快捷键" }).fill(label);
  await dialog.getByRole("button", { name: `修改 ${label}`, exact: true }).click();
  return dialog.getByRole("form", { name: `设置 ${label}`, exact: true });
}

test("快捷键设置检查冲突，录制后应用到正文和源码，刷新保留并能恢复默认", async ({ page }) => {
  await page.goto("./");
  await expect(notes(page)).toBeVisible();
  let dialog = await openSettings(page);
  await dialog.getByRole("searchbox", { name: "搜索快捷键" }).fill("Ctrl+Alt+T");
  await expect(dialog.getByRole("button", { name: "修改 插入表格", exact: true })).toContainText("Ctrl+Alt+T");
  const form = await editShortcut(dialog, "插入表格");
  const input = form.getByRole("textbox", { name: "快捷键组合", exact: true });
  const save = form.getByRole("button", { name: "保存", exact: true });

  await input.fill("ctrl + b");
  await expect(form.getByRole("alert")).toHaveText("与「加粗」的快捷键冲突。");
  await expect(save).toBeDisabled();
  await input.fill("Ctrl+T");
  await expect(form.getByRole("alert")).toContainText("浏览器保留此快捷键，用于新建标签页");
  await expect(save).toBeDisabled();
  await input.fill("Alt+Tab");
  await expect(form.getByRole("alert")).toContainText("系统保留此快捷键");
  await expect(save).toBeDisabled();
  await input.fill("Ctrl+S");
  await expect(form.getByRole("status")).toContainText("可能与浏览器的「保存网页」冲突");
  await expect(save).toBeEnabled();

  await form.getByRole("button", { name: "录制", exact: true }).click();
  await page.keyboard.press("Control+Shift+F8");
  await expect(input).toHaveValue("Ctrl+Shift+F8");
  await save.click();
  await expect(dialog.getByRole("button", { name: "修改 插入表格", exact: true })).toContainText("Ctrl+Shift+F8");
  await closeSettings(dialog);

  await notes(page).press("Control+Home");
  await notes(page).press("Control+Alt+t");
  await expect(tableDialog(page)).toHaveCount(0);
  await notes(page).press("Control+Shift+F8");
  await expect(tableDialog(page)).toBeVisible();
  await tableDialog(page).getByRole("button", { name: "关闭插入面板", exact: true }).click();

  await notes(page).press("/");
  const menu = page.getByRole("menu", { name: "描述工具", exact: true });
  await menu.getByRole("textbox", { name: "搜索描述工具" }).fill("表格");
  await expect(menu.getByText("Ctrl+Shift+F8", { exact: true })).toBeVisible();

  await page.reload();
  const toolbar = await revealToolbar(page);
  await toolbar.getByRole("button", { name: "源码", exact: true }).click();
  await notes(page).press("Control+Shift+F8");
  await expect(tableDialog(page)).toBeVisible();
  await tableDialog(page).getByRole("button", { name: "关闭插入面板", exact: true }).click();

  dialog = await openSettings(page);
  const restored = await editShortcut(dialog, "插入表格");
  await restored.getByRole("button", { name: "恢复默认", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "修改 插入表格", exact: true })).toContainText("Ctrl+Alt+T");
  await closeSettings(dialog);
  await notes(page).press("Control+Alt+t");
  await expect(tableDialog(page)).toBeVisible();
});

test("快捷键设置支持录制双段键，表格与正文可共用不同作用域的组合，停用后可批量恢复", async ({ page }) => {
  await page.goto("./");
  await expect(notes(page)).toBeVisible();
  const toolbar = await revealToolbar(page);
  await toolbar.getByRole("button", { name: "源码", exact: true }).click();
  await notes(page).fill("正文\n\n| 项目 | 状态 |\n| --- | --- |\n| 复查 | 完成 |");
  await expect(page.locator(".save-status")).toHaveText("已保存到此浏览器");
  await revealToolbar(page);
  await toolbar.getByRole("button", { name: "编辑", exact: true }).click();

  let dialog = await openSettings(page);
  const undo = await editShortcut(dialog, "撤销");
  await undo.getByRole("button", { name: "录制", exact: true }).click();
  await page.keyboard.press("Control+Shift+Period");
  await expect(undo.getByRole("button", { name: "按下第二个键", exact: true })).toBeFocused();
  await page.keyboard.press("KeyZ");
  await expect(undo.getByRole("textbox", { name: "快捷键组合", exact: true })).toHaveValue("Ctrl+Shift+. → Z");
  await undo.getByRole("button", { name: "保存", exact: true }).click();

  const insert = await editShortcut(dialog, "插入表格");
  await insert.getByRole("textbox", { name: "快捷键组合", exact: true }).fill("Ctrl+Enter");
  await expect(insert.getByRole("alert")).toHaveCount(0);
  await insert.getByRole("button", { name: "保存", exact: true }).click();

  const help = await editShortcut(dialog, "Markdown 语法帮助");
  await help.getByRole("button", { name: "停用", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "修改 Markdown 语法帮助", exact: true })).toContainText("已停用");
  await closeSettings(dialog);

  await notes(page).press("Control+/");
  const original = await notes(page).inputValue();
  await notes(page).press("Control+End");
  await page.keyboard.type("abc");
  await notes(page).press("Control+z");
  await expect(notes(page)).toHaveValue(original + "abc");
  await notes(page).press("Control+Shift+Period");
  await page.keyboard.press("KeyZ");
  await expect(notes(page)).toHaveValue(original);
  await notes(page).press("Control+/");

  const table = page.locator(".notes-live-document").getByRole("table");
  const cell = table.getByRole("textbox", { name: "编辑表格第 2 行第 1 列", exact: true });
  await table.getByText("复查", { exact: true }).click();
  await cell.selectText();
  await cell.press("Control+b");
  await expect(cell).toHaveValue("**复查**");
  await cell.press("Control+Shift+Period");
  await page.keyboard.press("KeyZ");
  await expect(table.locator("strong")).toHaveCount(0);
  await expect(table.getByText("复查", { exact: true })).toBeVisible();

  await table.getByText("复查", { exact: true }).click();
  await cell.press("Control+Enter");
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(tableDialog(page)).toHaveCount(0);
  await notes(page).press("Control+Home");
  await notes(page).press("Control+Enter");
  await expect(tableDialog(page)).toBeVisible();
  await tableDialog(page).getByRole("button", { name: "关闭插入面板", exact: true }).click();
  await notes(page).press("Control+Shift+Slash");
  await expect(page.getByRole("dialog", { name: "Markdown 语法帮助", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");

  dialog = await openSettings(page);
  const reset = dialog.getByRole("button", { name: "恢复全部默认", exact: true });
  await reset.click();
  await expect(reset).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "修改 撤销", exact: true })).toContainText("Ctrl+Z");
  await expect(dialog.getByRole("button", { name: "修改 插入表格", exact: true })).toContainText("Ctrl+Alt+T");
  await expect(dialog.getByRole("button", { name: "修改 Markdown 语法帮助", exact: true })).toContainText("Ctrl+Shift+/");
});

test("大纲快捷键可在顶栏收起时切换，检测冲突并记住修改", async ({ page }) => {
  await page.goto("./");
  await expect(notes(page)).toBeVisible();
  const outline = page.locator("#document-outline");
  await expect(outline).toBeHidden();
  await expect(page.locator("#workbench-toolbar")).toBeHidden();
  await page.keyboard.press("Control+Alt+o");
  await expect(outline).toBeVisible();
  await notes(page).press("Control+Alt+o");
  await expect(outline).toBeHidden();
  await expect(notes(page)).toBeFocused();

  const settings = await openSettings(page);
  const table = await editShortcut(settings, "插入表格");
  await table.getByRole("textbox", { name: "快捷键组合", exact: true }).fill("Ctrl+Alt+O");
  await expect(table.getByRole("alert")).toHaveText("与「切换文档大纲」的快捷键冲突。");
  const form = await editShortcut(settings, "切换文档大纲");
  const input = form.getByRole("textbox", { name: "快捷键组合", exact: true });
  const save = form.getByRole("button", { name: "保存", exact: true });
  await expect(input).toHaveValue("Ctrl+Alt+O");
  await input.fill("Ctrl+Shift+Z");
  await expect(form.getByRole("alert")).toHaveText("与「重做」的快捷键冲突。");
  await expect(save).toBeDisabled();
  await input.fill("Ctrl+T");
  await expect(form.getByRole("alert")).toContainText("浏览器保留此快捷键，用于新建标签页");
  const record = form.getByRole("button", { name: "录制", exact: true });
  await record.click();
  await page.keyboard.press("Control+Alt+o");
  await expect(input).toHaveValue("Ctrl+Alt+O");
  await expect(outline).toBeHidden();
  await record.click();
  await page.keyboard.press("Control+Shift+F9");
  await expect(input).toHaveValue("Ctrl+Shift+F9");
  await save.click();
  await closeSettings(settings);
  await notes(page).press("Control+Alt+o");
  await expect(outline).toBeHidden();
  await notes(page).press("Control+Shift+F9");
  await expect(outline).toBeVisible();
  await expect(notes(page)).toBeFocused();

  await page.reload();
  await expect(outline).toBeVisible();
  await page.keyboard.press("Control+Shift+F9");
  await expect(outline).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("dialog#document-outline")).toBeAttached();
  await page.keyboard.press("Control+Shift+F9");
  await expect(outline).toHaveAttribute("open", "");
  await page.keyboard.press("Control+Shift+F9");
  await expect(outline).toBeHidden();
});

test("升级后保留占用大纲默认键的旧快捷键", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lition13-markdown-editor-shortcuts", JSON.stringify({ link: "Ctrl+Alt+O" })));
  await page.goto("./");
  await notes(page).press("Control+Alt+o");
  const link = page.getByRole("dialog", { name: "插入描述链接", exact: true });
  await expect(link).toBeVisible();
  await expect(page.locator("#document-outline")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(link).toBeHidden();
  const settings = await openSettings(page);
  const form = await editShortcut(settings, "切换文档大纲");
  await expect(settings.getByRole("button", { name: "修改 切换文档大纲", exact: true })).toContainText("已停用");
  await form.getByRole("button", { name: "恢复默认", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText("与「插入链接」的快捷键冲突。");
});
