export interface TextSelection {
  start: number;
  end: number;
}
export interface MarkdownEdit extends TextSelection {
  value: string;
}
export const normalizeMarkdown = (value: string) =>
  value.replace(/\r\n?/g, "\n");
export function clampSelection(
  value: string,
  range: TextSelection,
): TextSelection {
  const start = Math.max(0, Math.min(range.start, value.length));
  return { start, end: Math.max(start, Math.min(range.end, value.length)) };
}
export function replaceSelection(
  value: string,
  range: TextSelection,
  text: string,
  selectStart = 0,
  selectEnd = text.length,
): MarkdownEdit {
  const { start, end } = clampSelection(value, range);
  return {
    value: value.slice(0, start) + text + value.slice(end),
    start: start + selectStart,
    end: start + selectEnd,
  };
}
export function wrapInline(
  value: string,
  range: TextSelection,
  before: string,
  after = before,
  placeholder = "文字",
): MarkdownEdit {
  const { start, end } = clampSelection(value, range),
    selected = value.slice(start, end);
  const outsideItalic =
    before !== "*" ||
    ((/\*+$/.exec(value.slice(0, start))?.[0].length || 0) % 2 === 1 &&
      (/^\*+/.exec(value.slice(end))?.[0].length || 0) % 2 === 1);
  const insideItalic =
    before !== "*" ||
    ((/^\*+/.exec(selected)?.[0].length || 0) % 2 === 1 &&
      (/\*+$/.exec(selected)?.[0].length || 0) % 2 === 1);
  if (
    outsideItalic &&
    start >= before.length &&
    value.slice(start - before.length, start) === before &&
    value.slice(end, end + after.length) === after
  )
    return {
      value:
        value.slice(0, start - before.length) +
        selected +
        value.slice(end + after.length),
      start: start - before.length,
      end: end - before.length,
    };
  if (
    insideItalic &&
    selected.startsWith(before) &&
    selected.endsWith(after) &&
    selected.length >= before.length + after.length
  )
    return replaceSelection(
      value,
      { start, end },
      selected.slice(before.length, -after.length),
      0,
      selected.length - before.length - after.length,
    );
  const text = selected || placeholder;
  return replaceSelection(
    value,
    { start, end },
    before + text + after,
    before.length,
    before.length + text.length,
  );
}
export function wrapInlineCode(
  value: string,
  range: TextSelection,
): MarkdownEdit {
  const s = clampSelection(value, range),
    selected = value.slice(s.start, s.end);
  const left = /`+$/.exec(value.slice(0, s.start))?.[0],
    right = /^`+/.exec(value.slice(s.end))?.[0];
  if (left && left === right)
    return replaceSelection(
      value,
      { start: s.start - left.length, end: s.end + right.length },
      selected,
    );
  const existing = /^(`+)([\s\S]*?)\1$/.exec(selected);
  if (
    existing &&
    existing[2] &&
    !existing[2].startsWith("`") &&
    !existing[2].endsWith("`")
  ) {
    let code = existing[2];
    if (code.startsWith(" ") && code.endsWith(" ") && code.trim())
      code = code.slice(1, -1);
    return replaceSelection(value, s, code);
  }
  const code = selected || "代码",
    longest = [...code.matchAll(/`+/g)].reduce(
      (n, m) => Math.max(n, m[0].length),
      0,
    ),
    ticks = "`".repeat(longest + 1);
  const pad =
    code.startsWith("`") ||
    code.endsWith("`") ||
    (code.startsWith(" ") && code.endsWith(" ") && !!code.trim())
      ? " "
      : "";
  return replaceSelection(
    value,
    s,
    ticks + pad + code + pad + ticks,
    ticks.length + pad.length,
    ticks.length + pad.length + code.length,
  );
}
export function lineRange(value: string, range: TextSelection) {
  const selected = clampSelection(value, range);
  const start =
    selected.start === 0 ? 0 : value.lastIndexOf("\n", selected.start - 1) + 1;
  const last =
    selected.end > selected.start && value[selected.end - 1] === "\n"
      ? selected.end - 1
      : selected.end;
  const next = value.indexOf("\n", last);
  return { start, end: next < 0 ? value.length : next };
}
export function prefixLines(
  value: string,
  range: TextSelection,
  kind: "bullet" | "ordered" | "task" | "quote" | number,
): MarkdownEdit {
  const block = lineRange(value, range),
    lines = value.slice(block.start, block.end).split("\n");
  const pattern =
    typeof kind === "number"
      ? new RegExp(`^\\s{0,3}#{${kind}}\\s+`)
      : kind === "quote"
        ? /^\s*>\s?/
        : kind === "task"
          ? /^\s*(?:[-+*]|\d+[.)])\s+\[[ xX]\]\s?/
          : kind === "ordered"
            ? /^\s*\d+[.)]\s+/
            : /^\s*[-+*]\s+(?!\[[ xX]\])/;
  const remove = lines.every((line) => pattern.test(line));
  const changed = lines.map((line, i) => {
    const indent = /^[\t ]*/.exec(line)![0];
    if (remove) return line.replace(pattern, indent);
    const clean =
      typeof kind === "number"
        ? line.replace(/^\s{0,3}#{1,6}\s+/, "")
        : kind === "quote"
          ? line
          : line.replace(/^\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/, "");
    const prefix =
      typeof kind === "number"
        ? "#".repeat(kind) + " "
        : kind === "quote"
          ? "> "
          : kind === "ordered"
            ? `${i + 1}. `
            : kind === "task"
              ? "- [ ] "
              : "- ";
    return kind === "quote"
      ? prefix + line
      : indent + prefix + clean.trimStart();
  });
  const replacement = changed.join("\n");
  if (range.start === range.end) {
    const offset = changed[0].length - lines[0].length;
    const caret = Math.max(
      block.start,
      Math.min(block.start + replacement.length, range.start + offset),
    );
    return {
      value: value.slice(0, block.start) + replacement + value.slice(block.end),
      start: caret,
      end: caret,
    };
  }
  return replaceSelection(value, block, replacement);
}
export function indentLines(
  value: string,
  range: TextSelection,
  outdent = false,
): MarkdownEdit {
  const block = lineRange(value, range),
    lines = value.slice(block.start, block.end).split("\n"),
    changed = lines.map((line) =>
      outdent ? line.replace(/^(?:\t| {1,4})/, "") : "    " + line,
    ),
    text = changed.join("\n");
  if (range.start === range.end) {
    const caret = Math.max(
      block.start,
      range.start + changed[0].length - lines[0].length,
    );
    return {
      value: value.slice(0, block.start) + text + value.slice(block.end),
      start: caret,
      end: caret,
    };
  }
  return replaceSelection(value, block, text);
}
export function insertBlock(
  value: string,
  range: TextSelection,
  block: string,
  selectionStart = 0,
  selectionEnd = block.length,
): MarkdownEdit {
  const { start, end } = clampSelection(value, range);
  const before = value.slice(0, start),
    after = value.slice(end);
  const lead =
    !before || before.endsWith("\n\n")
      ? ""
      : before.endsWith("\n")
        ? "\n"
        : "\n\n";
  const tail = !after
    ? "\n"
    : after.startsWith("\n\n")
      ? ""
      : after.startsWith("\n")
        ? "\n"
        : "\n\n";
  return replaceSelection(
    value,
    { start, end },
    lead + block + tail,
    lead.length + selectionStart,
    lead.length + selectionEnd,
  );
}
export function insertCodeBlock(
  value: string,
  range: TextSelection,
  language = "text",
): MarkdownEdit {
  const selected = value.slice(range.start, range.end) || "代码";
  const longest = [...selected.matchAll(/`+/g)].reduce(
    (n, m) => Math.max(n, m[0].length),
    0,
  );
  const fence = "`".repeat(Math.max(3, longest + 1));
  const start = fence.length + language.length + 1;
  return insertBlock(
    value,
    range,
    `${fence}${language}\n${selected}${selected.endsWith("\n") ? "" : "\n"}${fence}`,
    start,
    start + selected.length,
  );
}
export function insertMarkdownRule(value: string, range: TextSelection): MarkdownEdit {
  const rule = "---";
  const nextLine = rule.length + 1;
  return insertBlock(value, range, rule, nextLine, nextLine);
}

export function isInMarkdownAddress(value: string, position: number) {
  return /(?:\b(?:https?|file):|(?:^|\s)[a-z]:)[^\s<>()\[\]"']*$/i.test(value.slice(0, position));
}

export function continueMarkdownLine(
  value: string,
  range: TextSelection,
): MarkdownEdit | null {
  if (range.start !== range.end) return null;
  const lineStart =
    range.start === 0 ? 0 : value.lastIndexOf("\n", range.start - 1) + 1;
  const next = value.indexOf("\n", range.start);
  const lineEnd = next < 0 ? value.length : next;
  const left = value.slice(lineStart, range.start),
    right = value.slice(range.start, lineEnd);
  const list = /^(\s*(?:>\s*)*)([-+*]|\d+[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/.exec(
    left,
  );
  const quote = /^(\s*(?:>\s*)+)(.*)$/.exec(left);
  if (list) {
    if (!list[5].trim() && !right.trim())
      return replaceSelection(
        value,
        { start: lineStart, end: lineEnd },
        "",
        0,
        0,
      );
    const marker = /^\d/.test(list[2])
      ? `${parseInt(list[2], 10) + 1}${list[2].slice(-1)}`
      : list[2];
    const prefix = `\n${list[1]}${marker}${list[3]}${list[4] ? "[ ] " : ""}`;
    return replaceSelection(value, range, prefix, prefix.length, prefix.length);
  }
  if (quote) {
    if (!quote[2].trim() && !right.trim())
      return replaceSelection(
        value,
        { start: lineStart, end: lineEnd },
        "",
        0,
        0,
      );
    const prefix = "\n" + quote[1];
    return replaceSelection(value, range, prefix, prefix.length, prefix.length);
  }
  return null;
}

export function isInMarkdownFence(value: string, position: number) {
  const start = position === 0 ? 0 : value.lastIndexOf("\n", position - 1) + 1;
  let open = "";
  for (const line of value.slice(0, start).split("\n")) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!match) continue;
    const [, marker, info] = match;
    if (open) {
      if (marker[0] === open[0] && marker.length >= open.length && !info.trim()) open = "";
    } else if (marker[0] === "~" || !info.includes("`")) open = marker;
  }
  if (!open) return false;
  const next = value.indexOf("\n", start);
  const end = next < 0 ? value.length : next;
  const closer = /^ {0,3}(`{3,}|~{3,})[\t ]*$/.exec(value.slice(start, end));
  return !(position === end && closer && closer[1][0] === open[0] && closer[1].length >= open.length);
}

function markdownHeading(value: string, range: TextSelection) {
  const block = lineRange(value, range);
  const line = value.slice(block.start, block.end);
  if (line.includes("\n") || isInMarkdownFence(value, block.start)) return null;
  const match = /^( {0,3})(#{1,6})(?=[\t ]|$)/.exec(line);
  if (!match) return null;
  const from = block.start + match[1].length;
  return { block, indent: match[1], marker: match[2], from, to: from + match[2].length };
}

export function changeMarkdownHeading(value: string, range: TextSelection, direction: 1 | -1): MarkdownEdit | null {
  const heading = markdownHeading(value, range);
  if (!heading) return null;
  const { from, to, marker } = heading;
  const level = Math.max(1, Math.min(6, marker.length + direction));
  if (level === marker.length) return { value, ...range };
  const move = (pos: number) => pos >= to ? pos + level - marker.length : Math.min(pos, from + level);
  return {
    value: value.slice(0, from) + "#".repeat(level) + value.slice(to),
    start: move(range.start),
    end: move(range.end),
  };
}

export function continueMarkdownHeading(value: string, range: TextSelection): MarkdownEdit | null {
  if (range.start !== range.end) return null;
  const heading = markdownHeading(value, range);
  if (!heading || range.end !== heading.block.end) return null;
  if (!value.slice(heading.to, heading.block.end).trim()) {
    return replaceSelection(value, heading.block, "");
  }
  const prefix = `\n${heading.indent}${heading.marker} `;
  return replaceSelection(value, range, prefix, prefix.length, prefix.length);
}

export function isMarkdownIndentContext(value: string, range: TextSelection) {
  if (value.slice(range.start, range.end).includes("\n")) return true;
  const start =
    range.start === 0 ? 0 : value.lastIndexOf("\n", range.start - 1) + 1;
  const line = value.slice(start, range.start);
  if (/^\s*(?:[-+*]|\d+[.)]|>)\s/.test(line) || /^(?: {4}|\t)/.test(line))
    return true;
  return (
    value
      .slice(0, range.start)
      .split("\n")
      .filter((line) => /^\s{0,3}(?:`{3,}|~{3,})/.test(line)).length %
      2 ===
    1
  );
}
export function taskMarker(value: string, offset: number | undefined) {
  if (offset === undefined || offset < 0 || offset > value.length) return null;
  const match = /^[\t ]*(?:[-+*]|\d+[.)])[\t ]+(\[[ xX]\])(?:[\t ]+|(?=\n|$))/.exec(
    value.slice(offset),
  );
  if (!match) return null;
  const start = offset + match[0].indexOf(match[1]) + 1;
  const line = value.slice(offset + match[0].length).split("\n")[0];
  return {
    offset,
    start,
    end: start + 1,
    checked: /x/i.test(match[1]),
    label: line.trim().slice(0, 120) || "待办事项",
  };
}
export function toggleMarkdownTask(
  value: string,
  offset: number,
  done: boolean,
) {
  const marker = taskMarker(value, offset);
  return marker
    ? value.slice(0, marker.start) +
        (done ? "x" : " ") +
        value.slice(marker.end)
    : value;
}

export function safeMarkdownUrl(raw: string, kind: "link" | "image" = "link") {
  const value = raw.trim();
  if (kind === "link" && value.startsWith("#")) return value;
  if (
    kind === "image" &&
    /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[A-Za-z\d+/=\r\n]+$/i.test(
      value,
    )
  )
    return value;
  const absolute = value.startsWith("//") ? "https:" + value : value;
  if (typeof URL === "undefined") {
    if (/[\s\u0000-\u001f\u007f\\<>"']/.test(absolute)) return "";
    const web = /^https?:\/\/(?:\[[\da-f:]+\]|[^/:?#@]+)(?::\d{1,5})?(?:[/?#]|$)/i.test(absolute);
    const action = kind === "link" && /^(?:mailto|tel):[^<>]+$/i.test(absolute);
    return web || action ? absolute : "";
  }
  try {
    const url = new URL(absolute);
    if (
      ["https:", "http:"].includes(url.protocol) ||
      (kind === "link" && ["mailto:", "tel:"].includes(url.protocol))
    )
      return url.href;
  } catch {}
  return "";
}
export function markdownLink(label: string, url: string, image = false) {
  const text = label.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  return `${image ? "!" : ""}[${text}](<${url.replace(/[<>\r\n]/g, (c) => encodeURIComponent(c))}>)`;
}
