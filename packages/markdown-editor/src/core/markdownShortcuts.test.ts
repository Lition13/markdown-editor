import { expect, test } from "vitest";
import { isMarkdownShortcutPrefix, markdownHeadingShortcut, markdownShortcut, markdownTableMove } from "./markdownShortcuts";

function key(code: string, value: string, modifiers: Partial<KeyboardEvent> = {}) {
  return { code, key: value, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers };
}

test("editor commands avoid browser accelerators and accept the replacement keys", () => {
  expect(markdownShortcut(key("KeyT", "t", { ctrlKey: true }))).toBeUndefined();
  expect(markdownShortcut(key("Enter", "Enter", { ctrlKey: true, shiftKey: true }))).toBe("table");
  for (const letter of ["I", "K", "M", "Q"]) {
    expect(markdownShortcut(key("Key" + letter, letter, { ctrlKey: true, shiftKey: true }))).toBeUndefined();
  }
  expect(isMarkdownShortcutPrefix(key("Period", ">", { ctrlKey: true, shiftKey: true }))).toBe(true);
  expect(isMarkdownShortcutPrefix(key("Period", ">", { metaKey: true, shiftKey: true }))).toBe(true);
  expect(markdownHeadingShortcut(key("Digit4", "4", { ctrlKey: true }), false)).toBeUndefined();
  expect(markdownHeadingShortcut(key("Digit4", "4"), true)).toBe(4);
  expect(markdownTableMove(key("ArrowLeft", "ArrowLeft", { altKey: true }), false)).toBeUndefined();
  expect(markdownTableMove(key("KeyL", "l"), true)).toBe("ArrowLeft");
  expect(markdownShortcut(key("KeyP", "p"), true)).toBe("image");
  expect(markdownShortcut(key("KeyY", "y", { metaKey: true }))).toBeUndefined();
});

test("AltGr text entry is never treated as a formatting shortcut", () => {
  expect(markdownShortcut(key("KeyP", "p", {
    ctrlKey: true, altKey: true, shiftKey: true,
    getModifierState: name => name === "AltGraph",
  }), true)).toBeUndefined();
});
