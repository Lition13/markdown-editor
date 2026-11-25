import { expect, type Page } from "@playwright/test";

export async function revealToolbar(page: Page) {
  const toolbar = page.locator("#workbench-toolbar");
  if (await toolbar.isHidden()) {
    await page.mouse.move(40, 110);
    await page.getByRole("button", { name: "顶部工具栏" }).hover();
    await expect(toolbar).toBeVisible();
  }
  return toolbar;
}

export async function fileManager(page: Page) {
  const panel = page.locator("#file-manager");
  if (await panel.isHidden()) {
    const toolbar = await revealToolbar(page);
    await toolbar.getByRole("button", { name: "文件管理", exact: true }).click();
    await expect(panel).toBeVisible();
  }
  return panel;
}
