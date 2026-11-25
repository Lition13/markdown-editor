import { wrapInline, wrapInlineCode, type TextSelection } from "./markdown";
import { shortcutFromEvent } from "./keyboard";

export const markdownShortcutLabels = {
  bold: "Ctrl+B",
  italic: "Ctrl+I",
  strike: "Alt+Shift+5",
  inline: "Ctrl+Shift+`",
  link: "Ctrl+K",
  image: "Ctrl+Shift+I",
  table: "Ctrl+T",
  code: "Ctrl+Shift+K",
  math: "Ctrl+Shift+M",
  quote: "Ctrl+Shift+Q",
  ordered: "Ctrl+Shift+[",
  bullet: "Ctrl+Shift+]",
  task: "Alt+T",
  indent: "Ctrl+[",
  outdent: "Ctrl+]",
  undo: "Ctrl+Z",
  redo: "Ctrl+Y",
  source: "Ctrl+/",
  expand: "Alt+Enter",
  help: "Ctrl+Shift+/",
} as const;

type MarkdownShortcut = keyof typeof markdownShortcutLabels;
type ShortcutEvent = Parameters<typeof shortcutFromEvent>[0] & Pick<KeyboardEvent, "code">;
const shortcuts = new Map<string, MarkdownShortcut>();
for (const action of Object.keys(markdownShortcutLabels) as MarkdownShortcut[]) {
  shortcuts.set(markdownShortcutLabels[action], action);
}
shortcuts.set("Ctrl+`", "inline");
shortcuts.set("Ctrl+Shift+Z", "redo");

const shiftedKeys: Readonly<Record<string, string>> = {
  Backquote: "`", BracketLeft: "[", BracketRight: "]", Digit5: "5", Slash: "/",
};

export function markdownShortcut(event: ShortcutEvent) {
  const { key, code, ctrlKey, metaKey, altKey, shiftKey } = event;
  return shortcuts.get(shortcutFromEvent({
    key: shiftKey ? shiftedKeys[code] ?? key : key,
    ctrlKey, metaKey, altKey, shiftKey,
  }));
}

const inlineMarkers = { bold: "**", italic: "*", strike: "~~" } as const;
type InlineFormat = keyof typeof inlineMarkers | "inline";

export function isInlineMarkdownFormat(action: string | undefined): action is InlineFormat {
  return action === "inline" || action === "bold" || action === "italic" || action === "strike";
}

export function formatMarkdownInline(value: string, range: TextSelection, action: InlineFormat) {
  return action === "inline" ? wrapInlineCode(value, range) : wrapInline(value, range, inlineMarkers[action]);
}
