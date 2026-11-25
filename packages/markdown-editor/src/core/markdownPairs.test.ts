import { describe, expect, it } from "vitest";
import { pairedSymbolAfterInput, pairedSymbolChange } from "./markdownPairs";

const at = (position: number) => ({ start: position, end: position });

describe("Markdown paired symbols", () => {
  it.each([
    ["(", ")"], ["[", "]"], ["{", "}"], ["<", ">"],
    ['"', '"'], ["'", "'"], ["`", "`"],
    ["（", "）"], ["［", "］"], ["｛", "｝"], ["＜", "＞"],
    ["【", "】"], ["〔", "〕"], ["〖", "〗"], ["〘", "〙"], ["〚", "〛"],
    ["《", "》"], ["〈", "〉"], ["「", "」"], ["『", "』"],
    ["“", "”"], ["‘", "’"], ["＂", "＂"], ["＇", "＇"],
    ["«", "»"], ["‹", "›"], ["〝", "〞"],
  ])("completes %s%s, skips the closer and deletes the empty pair", (left, right) => {
    expect(pairedSymbolChange("", at(0), left)).toEqual({ from: 0, to: 0, insert: left + right, start: 1, end: 1 });
    expect(pairedSymbolChange(left + right, at(1), right)).toEqual({ from: 1, to: 1, insert: "", start: 2, end: 2 });
    expect(pairedSymbolChange(left + right, at(1), "Backspace")).toEqual({ from: 0, to: 2, insert: "", start: 0, end: 0 });
  });

  it("surrounds a selected range, including native input that replaced it", () => {
    const before = "甲📝乙";
    expect(pairedSymbolAfterInput(before, "甲《乙", 2, { inputType: "insertText" })).toEqual({
      range: { start: 1, end: 3 }, edit: { value: "甲《📝》乙", start: 2, end: 4 },
    });
    expect(pairedSymbolAfterInput(before, "甲《乙", 2)?.edit.value).toBe("甲《📝》乙");
  });

  it("preserves escaped characters, contractions, fences and code angle operators", () => {
    expect(pairedSymbolChange("\\", at(1), "(")).toBeUndefined();
    expect(pairedSymbolChange("\\\\", at(2), "(")?.insert).toBe("()");
    expect(pairedSymbolChange("don", at(3), "'")).toBeUndefined();
    expect(pairedSymbolChange("``", at(2), "`")).toBeUndefined();
    expect(pairedSymbolChange("```", at(2), "Backspace")).toBeUndefined();
    expect(pairedSymbolChange("```js\nn ", at(8), "<")).toBeUndefined();
  });

  it("distinguishes typing from paste, replacement, undo and forward delete", () => {
    expect(pairedSymbolAfterInput("", "(", 1, { inputType: "insertFromPaste" })).toBeUndefined();
    expect(pairedSymbolAfterInput("", "(内容", 3)).toBeUndefined();
    expect(pairedSymbolAfterInput("()()", "())", 2, { inputType: "deleteContentForward" })).toBeUndefined();
    expect(pairedSymbolAfterInput("（", "（）", 2, { inputType: "historyUndo" })).toBeUndefined();
    expect(pairedSymbolAfterInput("甲[]乙", "甲]乙", 1, { inputType: "deleteContentBackward" })?.edit).toEqual({ value: "甲乙", ...at(1) });
    expect(pairedSymbolAfterInput("甲[]乙", "甲]乙", 1, { inputType: "deleteContentBackward", previousSelection: { start: 1, end: 2 } })).toBeUndefined();
    expect(pairedSymbolAfterInput("甲[]乙", "甲[]]乙", 3, { inputType: "insertText" })?.edit).toEqual({ value: "甲[]乙", ...at(3) });
  });
});
