import { expect, test } from "vitest";
import { checkMarkdownShortcut, headingForShortcut, readMarkdownShortcutOverrides, resolveMarkdownShortcuts } from "./markdownShortcuts";
import { editorShortcutPrefix, markdownShortcutFromEvent, normalizeMarkdownShortcut } from "./shortcutKeys";

function key(code: string, value: string, modifiers: Partial<KeyboardEvent> = {}) {
  return { code, key: value, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers };
}

test("first-version defaults change only the insert-table chord", () => {
  const shortcuts = resolveMarkdownShortcuts();
  expect(shortcuts.labels).toEqual({
    source: "Ctrl+/", expand: "Alt+Enter", undo: "Ctrl+Z", redo: "Ctrl+Y", help: "Ctrl+Shift+/",
    bold: "Ctrl+B", italic: "Ctrl+I", strike: "Alt+Shift+5", inline: "Ctrl+Shift+`", quote: "Ctrl+Shift+Q",
    ordered: "Ctrl+Shift+[", bullet: "Ctrl+Shift+]", task: "Alt+T", indent: "Ctrl+[", outdent: "Ctrl+]",
    table: "Ctrl+Alt+T", link: "Ctrl+K", image: "Ctrl+Shift+I", code: "Ctrl+Shift+K", math: "Ctrl+Shift+M",
    heading1: "Ctrl+1", heading2: "Ctrl+2", heading3: "Ctrl+3", heading4: "Ctrl+4", heading5: "Ctrl+5", heading6: "Ctrl+6",
    paragraph: "Ctrl+0", raiseHeading: "Ctrl+=", lowerHeading: "Ctrl+-", rowUp: "Alt+ArrowUp", rowDown: "Alt+ArrowDown",
    columnLeft: "Alt+ArrowLeft", columnRight: "Alt+ArrowRight", insertRow: "Ctrl+Enter", deleteRow: "Ctrl+Shift+Backspace",
  });
  expect(shortcuts.match("live", key("KeyT", "t", { ctrlKey: true }))).toBeUndefined();
  expect(shortcuts.match("live", key("KeyT", "t", { ctrlKey: true, altKey: true }))).toBe("table");
  expect(shortcuts.match("source", key("KeyT", "t", { ctrlKey: true, altKey: true }))).toBe("table");
  expect(shortcuts.match("live", key("Enter", "Enter", { ctrlKey: true, shiftKey: true }))).toBeUndefined();
  expect(shortcuts.match("table", key("Enter", "Enter", { ctrlKey: true, shiftKey: true }))).toBe("insertRow");
  expect(shortcuts.match("table", key("Enter", "Enter", { ctrlKey: true }))).toBe("insertRow");
  expect(shortcuts.match("table", key("ArrowLeft", "ArrowLeft", { altKey: true }))).toBe("columnLeft");
  expect(shortcuts.match("source", key("KeyI", "I", { ctrlKey: true, shiftKey: true }))).toBe("image");
  const heading = key("Digit4", "4", { ctrlKey: true });
  expect(headingForShortcut(shortcuts.match("live", heading))).toBe(4);
  expect(shortcuts.match("source", heading)).toBeUndefined();
  expect(shortcuts.match("table", key("KeyY", "y", { metaKey: true }))).toBe("redo");
  expect(shortcuts.match("table", key("KeyZ", "Z", { ctrlKey: true, shiftKey: true }))).toBe("redo");
  expect(shortcuts.match("live", key("Backquote", "`", { ctrlKey: true }))).toBe("inline");
  expect(shortcuts.hasSequence("live")).toBe(false);
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
  expect(checkMarkdownShortcut("table", undefined, {})).toMatchObject({ kind: "warning" });
  expect(checkMarkdownShortcut("heading4", undefined, { heading4: "F8" })).toMatchObject({ kind: "warning" });
  expect(checkMarkdownShortcut("table", "Ctrl+4", {})).toMatchObject({ kind: "reserved" });
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
  expect(keymap.hasSequence("table")).toBe(true);
  expect(readMarkdownShortcutOverrides({ bold: "Ctrl+Z", undo: "Ctrl+Alt+T" })).toEqual({});
});
