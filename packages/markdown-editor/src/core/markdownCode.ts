import hljs from "highlight.js/lib/core";
import { common, createLowlight } from "lowlight";
import type { RootContent } from "hast";
import { replaceSelection, type MarkdownEdit } from "./markdown";
import type { CodeFence } from "./markdownFence";
export { readCodeFence, type CodeFence } from "./markdownFence";

export const codeLanguages = [
  ...Object.entries(common).map(([id, grammar]) => {
    const { name, aliases } = grammar(hljs);
    return { id, label: id === "plaintext" ? "纯文本" : name || id, aliases: aliases ?? [] };
  }),
  { id: "mermaid", label: "Mermaid", aliases: [] },
].sort((a, b) => a.label.localeCompare(b.label, "en"));

export type CodeLanguage = typeof codeLanguages[number];
const languageNames = (language: CodeLanguage) => [language.id, language.label, ...language.aliases];

export function matchCodeLanguage(input: string) {
  const query = input.trim().toLowerCase();
  return codeLanguages.find(language => languageNames(language).some(name => name.toLowerCase() === query));
}

export function suggestCodeLanguages(input: string, limit = 8) {
  const query = input.trim().toLowerCase();
  const exact = matchCodeLanguage(query);
  const matches = codeLanguages.filter(language =>
    language !== exact && languageNames(language).some(name => name.toLowerCase().startsWith(query)),
  );
  return (exact ? [exact, ...matches] : matches).slice(0, limit);
}

export function codeLanguageId(input: string) {
  const value = input.trim();
  return matchCodeLanguage(value)?.id ?? (/^[\w+.#-]*$/.test(value) ? value : null);
}

type CodeToken = { from: number; to: number; className: string };
let highlighter: ReturnType<typeof createLowlight> | undefined;
let highlighted: { source: string; language: string; tokens: CodeToken[] } | undefined;

export function highlightCode(source: string, info: string): readonly CodeToken[] {
  const language = matchCodeLanguage(info)?.id;
  if (!source || !language || language === "plaintext" || language === "mermaid") return [];
  if (highlighted?.source === source && highlighted.language === language) return highlighted.tokens;

  const tokens: CodeToken[] = [];
  let offset = 0;
  const visit = (node: RootContent) => {
    if (node.type === "text") offset += node.value.length;
    if (node.type !== "element") return;
    const from = offset;
    node.children.forEach(visit);
    const classes = node.properties.className;
    if (from < offset && Array.isArray(classes) && classes.length) {
      tokens.push({ from, to: offset, className: classes.join(" ") });
    }
  };
  try {
    highlighter ??= createLowlight(common);
    highlighter.highlight(language, source).children.forEach(visit);
  } catch {
    return [];
  }
  highlighted = { source, language, tokens: offset === source.length ? tokens : [] };
  return highlighted.tokens;
}

export function completeCodeFence(value: string, fence: CodeFence, language: string): MarkdownEdit {
  const head = language + value.slice(fence.languageTo, fence.openerEnd) + "\n" + fence.indent;
  return replaceSelection(
    value,
    { start: fence.languageFrom, end: fence.openerEnd },
    head + "\n" + fence.indent + fence.marker,
    head.length,
    head.length,
  );
}
