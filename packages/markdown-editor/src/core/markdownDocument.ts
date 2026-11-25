import type { Root, RootContent } from "mdast";
import { normalizeMarkdown } from "./markdown";
import { markdownParser } from "./markdownAst";

export interface MarkdownOutlineItem {
  depth: number;
  title: string;
  offset: number;
}

function plainText(node: RootContent): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
    case "inlineMath":
      return node.value;
    case "image":
    case "imageReference":
      return node.alt ?? "";
    case "break":
      return " ";
    default:
      return "children" in node ? node.children.map(plainText).join("") : "";
  }
}

function countWords(value: string) {
  let words = 0;
  const separated = value.replace(/\p{Script=Han}/gu, () => {
    words++;
    return " ";
  });
  for (const _ of separated.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['’\u2010-][\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*/gu)) words++;
  return words;
}

export function inspectMarkdown(value: string) {
  const source = normalizeMarkdown(value);
  const headings: MarkdownOutlineItem[] = [];
  let words = 0;
  let lines = 1;
  for (let index = source.indexOf("\n"); index >= 0; index = source.indexOf("\n", index + 1)) lines++;

  function visit(node: Root | RootContent) {
    if (node.type === "heading" || node.type === "paragraph" || node.type === "tableCell") {
      const text = plainText(node);
      words += countWords(text);
      if (node.type === "heading" && node.position?.start.offset !== undefined) {
        headings.push({
          depth: node.depth,
          title: text.replace(/\s+/g, " ").trim() || "未命名标题",
          offset: node.position.start.offset,
        });
      }
    } else if ("children" in node) {
      for (const child of node.children) visit(child);
    }
  }

  visit(markdownParser.parse(source));
  return { headings, words, lines };
}
