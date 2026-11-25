import type { List, ListItem, Nodes, Root } from "mdast";
import { lineRange, type MarkdownEdit, type TextSelection } from "./markdown";
import { markdownParser } from "./markdownAst";

type ListChange = { from: number; to: number; insert: string };

export function markdownListPrefix(value: string, offset = 0) {
  return /^(?:[-+*]|\d{1,9}[.)])[\t ]+/.exec(value.slice(offset))?.[0];
}

function columns(text: string) {
  let column = 0;
  for (const char of text) column += char === "\t" ? 4 - (column % 4) : 1;
  return column;
}

function mapListPosition(position: number, changes: ListChange[]) {
  let shift = 0;
  for (const { from, to, insert } of changes) {
    if (position < from) break;
    if (position < to) return from + shift + (position === from ? 0 : insert.length);
    shift += insert.length - (to - from);
  }
  return position + shift;
}

function listLine(value: string, position: number) {
  const { start, end } = lineRange(value, { start: position, end: position });
  const match = /^((?:[\t ]*>[\t ]?)*)([\t ]*)([-+*]|\d{1,9}[.)])([\t ]+)(.*)$/.exec(value.slice(start, end));
  if (!match) return;
  const [, quote, indent, marker, gap, body] = match;
  const column = columns(quote + indent);
  const content = columns(quote + indent + marker + gap) - column - marker.length;
  return { start, end, quote, marker, body, from: start + quote.length + indent.length,
    indent: column - columns(quote), contentIndent: marker.length + (content > 4 ? 1 : content) };
}

type ListPosition = { list: List; index: number; parent?: ListPosition };
function listAt(node: Nodes, position: number, parent?: ListPosition): ListPosition | undefined {
  const { start, end } = node.position ?? {};
  if (start && end && (position < start.offset! || position > end.offset!)) return;
  if (node.type === "list") {
    for (const [index, item] of node.children.entries()) {
      const current = { list: node, index, parent };
      if (item.position?.start.offset === position) return current;
      const nested = listAt(item, position, current);
      if (nested) return nested;
    }
  } else if ("children" in node) {
    for (const child of node.children) {
      const nested = listAt(child, position, parent);
      if (nested) return nested;
    }
  }
}

function itemLine(value: string, item: ListItem) {
  const from = item.position?.start.offset;
  if (from === undefined) return;
  const line = listLine(value, from);
  return line?.from === from ? line : undefined;
}

function isQuoteMarkerAt(node: Nodes, offset: number): boolean {
  const child = "children" in node && node.children.find(({ position }) => {
    const start = position?.start.offset;
    const end = position?.end.offset;
    return start !== undefined && end !== undefined && start <= offset && offset < end;
  });
  return child ? isQuoteMarkerAt(child, offset) : node.type === "blockquote";
}

function emptyQuoteMarkerRange(value: string, range: TextSelection, tree?: Root): TextSelection | null {
  const { start, end } = lineRange(value, range);
  const text = value.slice(start, end);
  if (!/^[\t ]*(?:>[\t ]*)+$/.test(text)) return null;
  const marker = start + text.lastIndexOf(">");
  if (range.start <= marker || !isQuoteMarkerAt(tree ?? markdownParser.parse(value), marker)) return null;
  return { start: marker, end };
}

export function emptyMarkdownMarkerRange(value: string, range: TextSelection, tree?: Root): TextSelection | null {
  if (range.start !== range.end) return null;
  const line = listLine(value, range.start);
  if (!line) return emptyQuoteMarkerRange(value, range, tree);
  const emptyCheckbox = /^\[[ xX]\][\t ]*$/.test(line.body);
  if (range.start < line.from || (!emptyCheckbox && line.body.trim())) return null;
  const entry = listAt(tree ?? markdownParser.parse(value), line.from);
  if (!entry) return null;
  // An empty checkbox can be parsed as a paragraph containing only the marker.
  const hasContent = entry.list.children[entry.index].children.some(child =>
    !emptyCheckbox || child.type !== "paragraph" || (child.position?.end.offset ?? Infinity) > line.end,
  );
  if (hasContent) return null;
  return { start: line.start + line.quote.length, end: line.end };
}

export function indentListItems(value: string, range: TextSelection, outdent: boolean): MarkdownEdit | null {
  const first = listLine(value, range.start);
  if (!first) return null;
  const current = listAt(markdownParser.parse(value), first.from);
  if (!current) return null;
  const { list, index, parent } = current;
  const destination = outdent ? parent : { list, index: index - 1 };
  if (!destination) return null;
  const anchor = destination.list.children[destination.index];
  if (!anchor) return { value, ...range };
  const anchorLine = itemLine(value, anchor);
  if (!anchorLine) return null;

  const selected = lineRange(value, range);
  const items = list.children.slice(index).filter(item => item.position!.start.offset! <= selected.end);
  const lastPosition = items.at(-1)!.position!.end.offset!;
  if (selected.end > lineRange(value, { start: lastPosition, end: lastPosition }).end) return null;

  const tail = anchor.children.at(-1);
  const children = !outdent && tail?.type === "list" ? tail : undefined;
  const childLine = children && itemLine(value, children.children[0]);
  const quoteDepth = (quote: string) => quote.match(/>/g)?.length ?? 0;
  const depth = quoteDepth(first.quote);
  if (quoteDepth(anchorLine.quote) !== depth) return null;
  const indent = outdent ? anchorLine.indent : childLine?.indent ?? anchorLine.indent + Math.max(4, anchorLine.contentIndent);
  const delimiter = list.ordered ? first.marker.at(-1) : undefined;
  let number = 1;
  if (delimiter) {
    if (outdent && destination.list.ordered && anchorLine.marker.endsWith(delimiter)) {
      number = (destination.list.start ?? 1) + destination.index + 1;
    } else if (children?.ordered && childLine?.marker.endsWith(delimiter)) {
      number = (children.start ?? 1) + children.children.length;
    }
  }

  const changes: ListChange[] = [];
  // An empty child needs a separator to start a list after the parent's text.
  if (!outdent && !children && !first.body.trim()) {
    const previous = first.start - 1;
    const previousLine = value.slice(value.lastIndexOf("\n", previous - 1) + 1, previous);
    if (previousLine.replace(/[>\t ]/g, "")) changes.push({ from: first.start, to: first.start, insert: first.quote.trimEnd() + "\n" });
  }

  const quotePrefix = new RegExp(`^(?:[\\t ]*>[\\t ]?){${depth}}`);
  for (const [offset, item] of items.entries()) {
    const line = itemLine(value, item);
    if (!line) return null;
    const marker = delimiter ? `${number + offset}${delimiter}` : line.marker;
    changes.push({ from: line.start + line.quote.length, to: line.from + line.marker.length, insert: " ".repeat(indent) + marker });

    const end = item.position!.end.offset!;
    const adjustment = indent - line.indent + marker.length - line.marker.length;
    let from = line.end + 1;
    while (adjustment && from < end) {
      const next = value.indexOf("\n", from);
      const to = next === -1 ? value.length : next;
      const text = value.slice(from, to);
      const quote = quotePrefix.exec(text)?.[0];
      if (quote !== undefined && text.slice(quote.length).trim()) {
        const leading = /^[\t ]*/.exec(text.slice(quote.length))![0];
        const width = columns(quote + leading) - columns(quote);
        changes.push({ from: from + quote.length, to: from + quote.length + leading.length,
          insert: " ".repeat(Math.max(0, width + adjustment)) });
      }
      from = to + 1;
    }
  }
  let result = "", copied = 0;
  for (const { from, to, insert } of changes) {
    result += value.slice(copied, from) + insert;
    copied = to;
  }
  return { value: result + value.slice(copied), start: mapListPosition(range.start, changes), end: mapListPosition(range.end, changes) };
}
