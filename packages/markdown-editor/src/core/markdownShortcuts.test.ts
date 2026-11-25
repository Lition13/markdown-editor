import { expect, test } from "vitest";
import { checkMarkdownShortcut, headingForShortcut, readMarkdownShortcutOverrides, resolveMarkdownShortcuts } from "./markdownShortcuts";
import { editorShortcutPrefix, markdownShortcutFromEvent, normalizeMarkdownShortcut } from "./shortcutKeys";

function key(code: string, value: string, modifiers: Partial<KeyboardEvent> = {}) {
  return { code, key: value, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers };
}

test("default editor commands preserve their scopes, aliases and browser-safe replacements", () => {
  const shortcuts = resolveMarkdownShortcuts();
  expect(shortcuts.match("live", key("KeyT", "t", { ctrlKey: true }))).toBeUndefined();
  expect(shortcuts.match("live", key("Enter", "Enter", { ctrlKey: true, shiftKey: true }))).toBe("table");
  expect(shortcuts.match("table", key("Enter", "Enter", { ctrlKey: true, shiftKey: true }))).toBeUndefined();
  expect(shortcuts.match("table", key("Enter", "Enter", { ctrlKey: true }))).toBe("insertRow");
  expect(shortcuts.match("table", key("KeyL", "l"), true)).toBe("columnLeft");
  expect(shortcuts.match("source", key("KeyP", "p"), true)).toBe("image");
  expect(headingForShortcut(shortcuts.match("source", key("Digit4", "4"), true))).toBe(4);
  expect(shortcuts.match("source", key("Digit0", "0"), true)).toBeUndefined();
  expect(shortcuts.match("table", key("KeyY", "y", { ctrlKey: true }))).toBe("redo");
  expect(shortcuts.match("table", key("KeyY", "y", { metaKey: true }))).toBeUndefined();
});

test("recording and manual entry normalize the same key names without taking AltGr text", () => {
  expect(markdownShortcutFromEvent(key("Period", ">", { ctrlKey: true, shiftKey: true }))).toBe(editorShortcutPrefix);
  expect(markdownShortcutFromEvent(key("Period", ">", { metaKey: true, shiftKey: true }))).toBe(editorShortcutPrefix);
  expect(markdownShortcutFromEvent(key("Digit7", "&", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+7");
  expect(normalizeMarkdownShortcut(" Shift + ⌘ + . -> j ")).toBe("Ctrl+Shift+. → J");
  expect(normalizeMarkdownShortcut("ctrl + esc")).toBe("Ctrl+Escape");
  expect(normalizeMarkdownShortcut("ctrl++")).toBe("Ctrl+Plus");
  expect(markdownShortcutFromEvent(key("KeyP", "p", { ctrlKey: true, altKey: true, getModifierState: name => name === "AltGraph" }))).toBe("");
});

test("conflicts distinguish overlapping commands, protected keys and browser warnings", () => {
  expect(checkMarkdownShortcut("table", "ctrl+b", {})).toMatchObject({ kind: "duplicate", message: "与「加粗」的快捷键冲突。" });
  expect(checkMarkdownShortcut("table", "Ctrl+Enter", {})).toBeUndefined();
  expect(checkMarkdownShortcut("table", "Ctrl+T", {})).toMatchObject({ kind: "reserved" });
  expect(checkMarkdownShortcut("table", "Alt+Tab", {})).toMatchObject({ kind: "reserved" });
  expect(checkMarkdownShortcut("table", "Ctrl+V", {})).toMatchObject({ kind: "reserved" });
  expect(checkMarkdownShortcut("table", editorShortcutPrefix, {})).toMatchObject({ kind: "reserved" });
  expect(checkMarkdownShortcut("table", "T", {})).toMatchObject({ kind: "invalid" });
  expect(checkMarkdownShortcut("table", "Ctrl+S", {})).toMatchObject({ kind: "warning" });
  expect(checkMarkdownShortcut("bold", undefined, { bold: null, table: "Ctrl+B" })).toMatchObject({ kind: "duplicate" });
});

test("custom bindings replace their old keys and survive loading alongside other valid changes", () => {
  const overrides = readMarkdownShortcutOverrides({
    bold: null, table: "ctrl+b", link: "Ctrl+Shift+. -> P", image: "Ctrl+Shift+. -> K",
    undo: "Ctrl+Shift+. → Z", rowUp: "Ctrl+T", math: "typo", unknown: "F8",
  });
  expect(overrides).toEqual({ bold: null, table: "Ctrl+B", link: "Ctrl+Shift+. → P", image: "Ctrl+Shift+. → K", undo: "Ctrl+Shift+. → Z" });
  const keymap = resolveMarkdownShortcuts(overrides);
  const ctrlB = key("KeyB", "b", { ctrlKey: true });
  expect(keymap.match("live", ctrlB)).toBe("table");
  expect(keymap.match("table", ctrlB)).toBeUndefined();
  expect(keymap.labels.bold).toBeUndefined();
  expect(keymap.match("table", key("KeyZ", "z"), true)).toBe("undo");
  expect(keymap.match("table", key("KeyZ", "z", { ctrlKey: true }))).toBeUndefined();
  expect(readMarkdownShortcutOverrides({ bold: "Ctrl+Z", undo: "Ctrl+Shift+Enter" })).toEqual({});
});
