import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["packages/markdown-editor/src/**/*.test.{ts,tsx}"] },
});
