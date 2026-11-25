import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { eventModelPlugin } from "./build/mermaid-eventmodel-plugin";

export default defineConfig({
  plugins: [react(), eventModelPlugin()],
  build: {
    target: "es2022",
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      formats: ["es"],
      fileName: () => "index.js",
    },
    license: { fileName: "THIRD_PARTY_NOTICES.md" },
    rollupOptions: { external: /^(?:react|react-dom)(?:\/|$)/ },
  },
});
