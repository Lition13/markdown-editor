import { copyFile, cp, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dist = new URL("dist/", root);
const styles = new URL("src/styles/", root);
const katexCss = new URL(import.meta.resolve("katex/dist/katex.min.css"));
const highlightCss = new URL(import.meta.resolve("highlight.js/styles/github.css"));

const [katex, highlight, surface, menus, markdown] = await Promise.all([
  readFile(katexCss, "utf8"),
  readFile(highlightCss, "utf8"),
  readFile(new URL("surface.css", styles), "utf8"),
  readFile(new URL("menus.css", styles), "utf8"),
  readFile(new URL("markdown.css", styles), "utf8"),
]);
const fonts = katex.replace(/url\((fonts\/[^)]+)\)/g, 'url("./$1?no-inline")');

await Promise.all([
  cp(new URL("fonts/", katexCss), new URL("fonts/", dist), { recursive: true }),
  copyFile(new URL("../../LICENSE", root), new URL("LICENSE", dist)),
  writeFile(new URL("style.css", dist), [
    fonts,
    surface,
    `@scope (.markdown-surface) {\n${highlight}\n${menus}\n${markdown}\n}\n`,
  ].join("\n")),
]);
