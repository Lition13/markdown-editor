export interface CodeFence {
  from: number;
  to: number;
  marker: string;
  indent: string;
  openerEnd: number;
  language: string;
  languageFrom: number;
  languageTo: number;
  bodyFrom: number;
  closerFrom: number | null;
}

export function readCodeFence(value: string, from: number, to: number): CodeFence | null {
  const openingLine = from === 0 ? 0 : value.lastIndexOf("\n", from - 1) + 1;
  const newline = value.indexOf("\n", from);
  const openerEnd = newline < 0 ? value.length : newline;
  const parts = /^( {0,3})(`{3,}|~{3,})([\t ]*)([^\s`~]*)/.exec(value.slice(from, openerEnd));
  if (!parts) return null;
  const [, padding, marker, spacing, language] = parts;
  const languageFrom = from + padding.length + marker.length + spacing.length;
  const bodyFrom = Math.min(openerEnd + 1, value.length);
  const lastLine = value.lastIndexOf("\n", to - 1) + 1;
  const closer = /^(?: {0,3})(`{3,}|~{3,})[\t ]*$/.exec(value.slice(lastLine, to));
  const closed = lastLine > openingLine && closer && closer[1][0] === marker[0] && closer[1].length >= marker.length;
  return {
    from, to, marker, indent: value.slice(openingLine, from) + padding, openerEnd, language,
    languageFrom, languageTo: languageFrom + language.length, bodyFrom,
    closerFrom: closed ? lastLine : null,
  };
}

export function emptyCodeFenceRemoval(value: string, fence: CodeFence): { from: number; to: number } | null {
  const { bodyFrom, closerFrom } = fence;
  if (closerFrom === null || value.slice(bodyFrom, Math.max(bodyFrom, closerFrom - 1)).trim()) return null;
  const from = fence.from === 0 ? 0 : value.lastIndexOf("\n", fence.from - 1) + 1;
  if (value[fence.to] !== "\n") return { from, to: fence.to };

  // Keep a blank line between surrounding blocks if the fence was their separator.
  const previousStart = from > 1 ? value.lastIndexOf("\n", from - 2) + 1 : 0;
  if (from > 0 && value.slice(previousStart, from - 1).trim()) return { from, to: fence.to };
  const next = fence.to + 1;
  const lineEnd = value.indexOf("\n", next);
  const end = lineEnd < 0 ? value.length : lineEnd;
  return { from, to: value.slice(next, end).trim() ? next : Math.min(end + 1, value.length) };
}
