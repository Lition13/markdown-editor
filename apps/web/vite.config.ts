import { readFile } from "node:fs/promises";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pagePolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: http: data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

export default defineConfig({
  base: "/markdown-editor/",
  plugins: [
    react(),
    {
      name: "markdown-page-assets",
      apply: "build",
      async generateBundle() {
        const [license, editorNotices] = await Promise.all([
          readFile(new URL("../../LICENSE", import.meta.url), "utf8"),
          readFile(new URL("../../packages/markdown-editor/dist/THIRD_PARTY_NOTICES.md", import.meta.url), "utf8"),
        ]);
        this.emitFile({ type: "asset", fileName: "LICENSE", source: license });
        this.emitFile({ type: "asset", fileName: "EDITOR_NOTICES.md", source: editorNotices });
      },
      transformIndexHtml() {
        return [{
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: pagePolicy },
          injectTo: "head-prepend",
        }];
      },
    },
  ],
  server: { host: "127.0.0.1" },
  build: { assetsInlineLimit: 0, license: { fileName: "SITE_NOTICES.md" } },
});
