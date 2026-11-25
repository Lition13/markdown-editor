import type { Element, Root } from "hast";
import { defaultSchema } from "rehype-sanitize";

export function rehypeNormalizeLinks(normalizeLink?: (href: string) => string | undefined) {
  function visit(parent: Root | Element) {
    for (const child of parent.children) {
      if (child.type !== "element") continue;
      if (child.tagName === "a" && typeof child.properties.href === "string") {
        const href = normalizeLink?.(child.properties.href);
        if (href !== undefined) child.properties.href = href;
      }
      visit(child);
    }
  }
  // Rewrite host links before the sanitizer checks their protocols.
  return visit;
}

export const markdownSchema: typeof defaultSchema = {
  ...defaultSchema,
  clobberPrefix: "",
  tagNames: [
    ...(defaultSchema.tagNames || []),
    "details",
    "summary",
    "mark",
    "kbd",
    "sub",
    "sup",
  ],
  strip: [
    ...(defaultSchema.strip || []),
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "form",
  ],
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code || []).filter(
        (value) => !(Array.isArray(value) && value[0] === "className"),
      ),
      ["className", /^language-[\w+-]+$/, "math-inline", "math-display"],
    ],
  },
  protocols: { ...defaultSchema.protocols, src: ["http", "https", "data"] },
};

export const markdownMath = { throwOnError: false, trust: false, strict: "ignore" as const, maxExpand: 1000 };
