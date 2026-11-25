import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { lineRange } from "../core/markdown";
import { breakMarkdownHeading, markdownHeadingLevel } from "../core/markdownHeading";
import { headingAt, markdownBlockAt } from "./markdownProjection";

function write(view: EditorView, from: number, to: number, insert: string, anchor: number, head = anchor) {
  view.dispatch({ changes: { from, to, insert }, selection: { anchor, head }, scrollIntoView: true, userEvent: "input.structure" });
}

function prefix(depth: number) {
  return depth ? "#".repeat(depth) + " " : "";
}

export function setHeadingLevel(view: EditorView, depth: number) {
  const { state } = view;
  const selection = state.selection.main;
  const block = markdownBlockAt(state, selection.from);
  const heading = headingAt(state, selection.from);
  if (heading && selection.to <= heading.to) {
    if (heading.depth === depth) { view.focus(); return true; }
    const { from, to, insert, start, end } = markdownHeadingLevel(state.doc.toString(), { start: selection.from, end: selection.to }, heading, depth);
    const backwards = selection.head < selection.anchor;
    write(view, from, to, insert, backwards ? end : start, backwards ? start : end);
    view.focus();
    return true;
  }

  if (block && (block.type !== "paragraph" || selection.to > (block.position?.end.offset ?? selection.to))) return false;
  if (!depth) { view.focus(); return true; }
  const source = state.doc.toString();
  const { start, end } = lineRange(source, { start: selection.from, end: selection.to });
  const raw = source.slice(start, end);
  if (raw.includes("\n")) return false;
  const indent = /^ {0,3}/.exec(raw)![0];
  const marker = prefix(depth);
  const textFrom = start + indent.length;
  const move = (position: number) => Math.max(textFrom, position) + marker.length;
  write(view, textFrom, textFrom, marker, move(selection.anchor), move(selection.head));
  view.focus();
  return true;
}

export function handleHeadingKey(event: KeyboardEvent, view: EditorView) {
  const { state } = view;
  const cursor = state.selection.main;
  const heading = headingAt(state, cursor.from);
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key;
  if (!heading || cursor.to > heading.to || mod) return false;
  const sameLevel = event.altKey && event.shiftKey;
  if (key === "Enter" && (sameLevel || (!event.altKey && !event.shiftKey))) {
    const { from, to, insert, start, end } = breakMarkdownHeading(state.doc.toString(), { start: cursor.from, end: cursor.to }, heading, sameLevel);
    write(view, from, to, insert, start, end);
    return true;
  }
  if (event.altKey) return false;
  if (key === "Tab") return setHeadingLevel(view, Math.max(1, Math.min(6, heading.depth + (event.shiftKey ? -1 : 1))));
  if (key === "Backspace" && cursor.empty && cursor.head <= heading.textFrom) return setHeadingLevel(view, 0);
  if (key === "Home" || key === "End") {
    const edge = view.moveToLineBoundary(cursor, key === "End").head;
    const head = Math.max(heading.textFrom, Math.min(heading.textTo, edge));
    view.dispatch({ selection: event.shiftKey ? EditorSelection.range(cursor.anchor, head) : EditorSelection.cursor(head), scrollIntoView: true });
    return true;
  }
  return false;
}

export function applyHeadingShortcut(view: EditorView, action: number | "raise" | "lower") {
  if (typeof action === "number") return setHeadingLevel(view, action);
  const heading = headingAt(view.state, view.state.selection.main.from);
  if (action === "raise") return setHeadingLevel(view, Math.max(1, (heading?.depth ?? 7) - 1));
  return Boolean(heading && setHeadingLevel(view, heading.depth === 6 ? 0 : heading.depth + 1));
}
