import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export const markdownParser = unified().use(remarkParse).use(remarkFrontmatter).use(remarkGfm).use(remarkMath).freeze();

export function readYamlFrontmatter(source: string) {
  if (!/^---[ \t]*\n/.test(source)) return;
  const node = markdownParser.parse(source).children[0];
  if (node?.type !== "yaml" || node.position?.end.offset === undefined) return;
  const to = node.position.end.offset;
  return {
    to,
    bodyFrom: source.indexOf("\n") + 1,
    bodyTo: source.lastIndexOf("\n", to - 1),
  };
}
