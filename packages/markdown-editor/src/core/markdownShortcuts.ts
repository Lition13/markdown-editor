import { wrapInline, wrapInlineCode, type TextSelection } from "./markdown";
import { shortcutFromEvent } from "./keyboard";

export const editorShortcutPrefix = "Ctrl+Shift+.";
const commandKey = editorShortcutPrefix + " → ";

export const markdownShortcutLabels = {
  bold: commandKey + "B",
  italic: commandKey + "I",
  strike: commandKey + "S",
  inline: commandKey + "`",
  link: commandKey + "K",
  image: commandKey + "P",
  table: "Ctrl+Shift+Enter",
  code: commandKey + "C",
  math: commandKey + "M",
  quote: commandKey + "Q",
  ordered: "Ctrl+Shift+7",
  bullet: "Ctrl+Shift+8",
  task: commandKey + "T",
  indent: commandKey + "[",
  outdent: commandKey + "]",
  undo: "Ctrl+Z",
  redo: "Ctrl+Shift+Z",
  source: "Ctrl+/",
  expand: "Alt+Enter",
  help: commandKey + "/",
} as const;

type MarkdownShortcut = keyof typeof markdownShortcutLabels;
export type ShortcutEvent = Parameters<typeof shortcutFromEvent>[0] & Pick<KeyboardEvent, "code">
  & Partial<Pick<KeyboardEvent, "getModifierState">>;
const shortcuts = new Map<string, MarkdownShortcut>();
for (const action of Object.keys(markdownShortcutLabels) as MarkdownShortcut[]) {
  shortcuts.set(markdownShortcutLabels[action], action);
}
shortcuts.set("Ctrl+B", "bold");
shortcuts.set("Ctrl+I", "italic");

const shiftedKeys: Readonly<Record<string, string>> = {
  Backquote: "`", BracketLeft: "[", BracketRight: "]", Slash: "/", Period: ".", Equal: "=", Minus: "-",
};

function shortcutName(event: ShortcutEvent) {
  if (event.getModifierState?.("AltGraph")) return "";
  const { key, code, ctrlKey, metaKey, altKey, shiftKey } = event;
  const digit = shiftKey ? /^Digit([0-9])$/.exec(code)?.[1] : undefined;
  return shortcutFromEvent({
    key: (shiftKey ? shiftedKeys[code] : undefined) ?? digit ?? key,
    ctrlKey, metaKey, altKey, shiftKey,
  });
}

function editorShortcutName(event: ShortcutEvent, prefixed: boolean) {
  if (!prefixed) return shortcutName(event);
  if (event.ctrlKey || event.metaKey || event.altKey || event.getModifierState?.("AltGraph")) return "";
  return event.key.length === 1 ? commandKey + event.key.toUpperCase() : "";
}

export function isMarkdownShortcutPrefix(event: ShortcutEvent) {
  return shortcutName(event) === editorShortcutPrefix;
}

export function markdownShortcut(event: ShortcutEvent, prefixed = false) {
  const name = editorShortcutName(event, prefixed);
  if (name === "Ctrl+Y" && event.ctrlKey && !event.metaKey) return "redo";
  return shortcuts.get(name);
}

export const markdownHeadingShortcutLabel = (depth: number) => commandKey + depth;

export function markdownHeadingShortcut(event: ShortcutEvent, prefixed: boolean) {
  const name = editorShortcutName(event, prefixed);
  if (!name.startsWith(commandKey)) return undefined;
  const key = name.slice(commandKey.length);
  if (/^[0-6]$/.test(key)) return Number(key);
  if (key === "=") return "raise";
  if (key === "-") return "lower";
  return undefined;
}

const tableMoveKeys = { ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R" } as const;
type TableArrow = keyof typeof tableMoveKeys;
const tableMoves = new Map(Object.entries(tableMoveKeys).map(([direction, key]) => [commandKey + key, direction as TableArrow]));

export function markdownTableMove(event: ShortcutEvent, prefixed: boolean) {
  return tableMoves.get(editorShortcutName(event, prefixed));
}

export const markdownTableMoveLabel = (key: TableArrow) => commandKey + tableMoveKeys[key];

const inlineMarkers = { bold: "**", italic: "*", strike: "~~" } as const;
type InlineFormat = keyof typeof inlineMarkers | "inline";

export function isInlineMarkdownFormat(action: string | undefined): action is InlineFormat {
  return action === "inline" || action === "bold" || action === "italic" || action === "strike";
}

export function formatMarkdownInline(value: string, range: TextSelection, action: InlineFormat) {
  return action === "inline" ? wrapInlineCode(value, range) : wrapInline(value, range, inlineMarkers[action]);
}
