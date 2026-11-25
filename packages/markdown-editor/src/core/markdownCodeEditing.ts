import { lineRange, type TextSelection } from "./markdown";
import { markdownParser } from "./markdownAst";
import { codeBodyEnd, findCodeFence, type CodeFence } from "./markdownFence";

export function withinCodeBody(fence: CodeFence, range: TextSelection) {
  return fence.bodyFrom <= range.start && range.end <= codeBodyEnd(fence);
}

export function editableCodeFence(value: string, range: TextSelection) {
  if (!value.includes("\x60\x60\x60") && !value.includes("~~~")) return null;
  const fence = findCodeFence(markdownParser.parse(value), range.start, () => value);
  return fence && fence.closerFrom !== fence.bodyFrom && withinCodeBody(fence, range) ? fence : null;
}

export function codeIndentWidth(value: string, fence: CodeFence) {
  const language = fence.language.toLowerCase();
  const fallback = /^(?:json|yaml|yml)$/.test(language) ? 2 : 4;
  let smallest = Infinity;
  for (const raw of value.slice(fence.bodyFrom, codeBodyEnd(fence)).split("\n")) {
    const line = raw.startsWith(fence.indent) ? raw.slice(fence.indent.length) : raw;
    const indent = /^[ \t]+(?=\S)/.exec(line)?.[0];
    if (!indent) continue;
    if (indent.startsWith("\t")) return "\t";
    smallest = Math.min(smallest, indent.length);
  }
  return smallest <= 4 ? smallest : fallback;
}

const brackets = new Map([["{", "}"], ["[", "]"], ["(", ")"]]);

export function codeLineBreak(value: string, range: TextSelection, fence: CodeFence, soft = false) {
  const { start } = lineRange(value, { start: range.start, end: range.start });
  const before = value.slice(start, range.start);
  const indent = /^[ \t]*/.exec(before)![0];
  const line = before.trim();
  const last = line.at(-1) ?? "";
  const closer = brackets.get(last);
  const colon = last === ":" && /^(?:py|python|ya?ml)$/i.test(fence.language);
  const comment = /^(?:\/\/|\/\*|\*|#)/.test(line);
  const plain = /^(?:txt|text|plaintext)$/i.test(fence.language);
  const newline = "\n" + indent;
  if (soft || comment || plain || (!closer && !colon)) return { insert: newline, caret: newline.length };

  const width = codeIndentWidth(value, fence);
  const next = newline + (width === "\t" ? width : " ".repeat(width));
  const splitPair = closer !== undefined && range.start === range.end && value[range.end] === closer;
  return { insert: next + (splitPair ? newline : ""), caret: next.length };
}

export function codeIndentBackspace(value: string, range: TextSelection, fence: CodeFence) {
  if (range.start !== range.end || !withinCodeBody(fence, range)) return null;
  const { start } = lineRange(value, range);
  const before = value.slice(start, range.start);
  if (!/^[ \t]+$/.test(before)) return null;
  const base = before.startsWith(fence.indent) ? fence.indent.length : 0;
  const indent = before.slice(base);
  if (!indent) return null;
  const width = codeIndentWidth(value, fence);
  const remove = width === "\t" || indent.includes("\t") ? 1 : indent.length % width || width;
  return { start: range.start - Math.min(remove, indent.length), end: range.end };
}
