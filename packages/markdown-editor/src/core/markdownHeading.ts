import type { Heading, PhrasingContent } from "mdast";
import { replaceSelection, type TextSelection } from "./markdown";

export function headingRegion(node: Heading, source: string, from: number, to: number) {
  const atx = /^#{1,6}(?:[\t ]+|$)/.exec(source.slice(from, to))?.[0];
  const textFrom = node.children[0]?.position?.start.offset ?? from + (atx?.length ?? 0);
  const textTo = node.children.at(-1)?.position?.end.offset ?? textFrom;
  return { from, to, textFrom, textTo, depth: node.depth, atx, children: node.children };
}

export type HeadingRegion = ReturnType<typeof headingRegion>;
const marker = (depth: number) => depth ? "#".repeat(depth) + " " : "";
const startOfLine = (value: string, from: number) => from ? value.lastIndexOf("\n", from - 1) + 1 : 0;
const nextLineHasText = (value: string, to: number) => {
  const breakAt = value.indexOf("\n", to);
  if (breakAt < 0) return false;
  const end = value.indexOf("\n", breakAt + 1);
  return !!value.slice(breakAt + 1, end < 0 ? value.length : end).trim();
};

export type HeadingChange = { from: number; to: number; insert: string; start: number; end: number };

export function markdownHeadingLevel(value: string, range: TextSelection, heading: HeadingRegion, depth: number): HeadingChange {
  const { from, to, textFrom, textTo } = heading;
  const start = startOfLine(value, from);
  const previous = start ? value.slice(startOfLine(value, start - 1), start - 1) : "";
  const body = value.slice(textFrom, textTo);
  const separatedBefore = !depth && body && previous.trim() ? "\n" : "";
  const separatedAfter = !depth && body && nextLineHasText(value, to) ? "\n" : "";
  const leading = separatedBefore + value.slice(start, from) + marker(depth);
  const insert = leading + (depth ? body.replace(/\n/g, " ") : body) + separatedAfter;
  const move = (position: number) => start + leading.length + Math.max(0, Math.min(position - textFrom, body.length));
  return { from: start, to, insert, start: move(range.start), end: move(range.end) };
}

function splitFormatting(nodes: PhrasingContent[], source: string, from: number, to: number): { close: string; open: string } {
  for (const node of nodes) {
    if (node.type !== "strong" && node.type !== "emphasis" && node.type !== "delete" && node.type !== "link" && node.type !== "linkReference") continue;
    const start = node.position?.start.offset, end = node.position?.end.offset;
    const inside = node.children[0]?.position?.start.offset, beforeClose = node.children.at(-1)?.position?.end.offset;
    if (start === undefined || end === undefined || inside === undefined || beforeClose === undefined || from <= inside || to >= beforeClose) continue;
    const nested = splitFormatting(node.children, source, from, to);
    return { close: nested.close + source.slice(beforeClose, end), open: source.slice(start, inside) + nested.open };
  }
  return { close: "", open: "" };
}

export function breakMarkdownHeading(value: string, range: TextSelection, heading: HeadingRegion, forceSameLevel = false): HeadingChange {
  const { from, to, textFrom, textTo, depth } = heading;
  if (textFrom === textTo) return markdownHeadingLevel(value, range, heading, 0);
  const line = startOfLine(value, from);
  if (!forceSameLevel && range.start === range.end && range.end <= textFrom) {
    return { from: line, to: line, insert: "\n\n", start: line, end: line };
  }
  const before = Math.max(textFrom, Math.min(range.start, textTo));
  const after = Math.max(before, Math.min(range.end, textTo));
  const indent = value.slice(line, from);
  const sameLevel = forceSameLevel || after < textTo;
  const continuation = sameLevel ? indent + marker(depth) : "";
  if (before === textTo) {
    const insert = "\n\n" + continuation;
    const extra = nextLineHasText(value, to) && !sameLevel ? "\n" : "";
    const caret = to + insert.length;
    return { from: to, to, insert: insert + extra, start: caret, end: caret };
  }
  const style = splitFormatting(heading.children, value, before, after);
  const head = indent + marker(depth) + value.slice(textFrom, before).replace(/\n/g, " ") + style.close + "\n\n" + continuation + style.open;
  const caret = line + head.length;
  return { from: line, to, insert: head + value.slice(after, textTo).replace(/\n/g, " "), start: caret, end: caret };
}

export function applyHeadingChange(value: string, { from, to, insert, start, end }: HeadingChange) {
  return replaceSelection(value, { start: from, end: to }, insert, start - from, end - from);
}
