import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:4173/markdown-editor/";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    channel: process.env.CI ? undefined : "msedge",
    baseURL,
    storageState: {
      cookies: [],
      origins: [{
        origin: new URL(baseURL).origin,
        localStorage: [{ name: "lition13-markdown-editor-locale", value: "zh-CN" }],
      }],
    },
    viewport: { width: 1440, height: 960 },
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
