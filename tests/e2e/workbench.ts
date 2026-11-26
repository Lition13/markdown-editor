import { expect, type Page } from "@playwright/test";

type Locale = "en" | "zh-CN";

export async function revealToolbar(page: Page, locale: Locale = "zh-CN") {
  const toolbar = page.locator("#workbench-toolbar");
  if (await toolbar.isHidden()) {
    await page.mouse.move(40, 110);
    await page.getByRole("button", { name: locale === "en" ? "Top toolbar" : "顶部工具栏", exact: true }).hover();
    await expect(toolbar).toBeVisible();
  }
  return toolbar;
}

export async function fileManager(page: Page, locale: Locale = "zh-CN") {
  const panel = page.locator("#file-manager");
  if (await panel.isHidden()) {
    const toolbar = await revealToolbar(page, locale);
    await toolbar.getByRole("button", { name: locale === "en" ? "File manager" : "文件管理", exact: true }).click();
    await expect(panel).toBeVisible();
  }
  return panel;
}

export async function documentOutline(page: Page, locale: Locale = "zh-CN") {
  const panel = page.locator("#document-outline");
  if (await panel.isHidden()) {
    const toolbar = await revealToolbar(page, locale);
    await toolbar.getByRole("button", { name: locale === "en" ? "Document outline" : "文档大纲", exact: true }).click();
    await expect(panel).toBeVisible();
  }
  return panel;
}

export async function chooseInterfaceLanguage(page: Page, from: Locale, to: Locale) {
  const toolbar = await revealToolbar(page, from);
  await toolbar.getByRole("button", { name: from === "en" ? "Interface language" : "界面语言", exact: true }).click();
  await toolbar.getByRole("menuitemradio", { name: to === "en" ? "English" : "简体中文", exact: true }).click();
}
