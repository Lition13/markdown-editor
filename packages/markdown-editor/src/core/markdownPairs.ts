import { isInMarkdownLiteralBlock, replaceSelection, type TextSelection } from "./markdown";
import { readYamlFrontmatter } from "./markdownAst";

const pairs = new Map([
  ["(", ")"], ["[", "]"], ["{", "}"], ["<", ">"],
  ['"', '"'], ["'", "'"], ["`", "`"],
  ["（", "）"], ["［", "］"], ["｛", "｝"], ["＜", "＞"],
  ["【", "】"], ["〔", "〕"], ["〖", "〗"], ["〘", "〙"], ["〚", "〛"],
  ["《", "》"], ["〈", "〉"], ["「", "」"], ["『", "』"],
  ["“", "”"], ["‘", "’"], ["＂", "＂"], ["＇", "＇"],
  ["«", "»"], ["‹", "›"], ["〝", "〞"],
]);
const closingSymbols = new Set(pairs.values());
export const isPairedSymbol = (symbol: string) => pairs.has(symbol) || closingSymbols.has(symbol);

type PairChange = TextSelection & { from: number; to: number; insert: string };

function escaped(value: string, position: number) {
  let start = position;
  while (start > 0 && value[start - 1] === "\\") start--;
  return (position - start) % 2 === 1;
}

export function pairedSymbolChange(value: string, range: TextSelection, key: string, code = false): PairChange | undefined {
  const { start, end } = range;
  const yaml = readYamlFrontmatter(value);
  if (yaml && start <= yaml.to) return;
  if (key === "Backspace") {
    const opening = value.charAt(start - 1);
    const closing = pairs.get(opening);
    if (start !== end || !closing || closing !== value[start] || escaped(value, start - 1)) return;
    if (opening === closing && (value[start - 2] === opening || value[start + 1] === closing)) return;
    return { from: start - 1, to: start + 1, insert: "", start: start - 1, end: start - 1 };
  }
  const closing = pairs.get(key);
  if ((!closing && !closingSymbols.has(key)) || escaped(value, start)) return;
  if (start === end && key === value[start] && closingSymbols.has(key)) {
    return { from: start, to: end, insert: "", start: start + 1, end: start + 1 };
  }
  if (!closing) return;
  if (start === end) {
    const previous = value.charAt(start - 1);
    // Preserve contractions, repeated quotes and fences, and angle operators in code.
    if ((key === "'" && /[a-z0-9_]/i.test(previous)) || (key === closing && previous === key)
      || (key === "<" && (code || isInMarkdownLiteralBlock(value, start)))) return;
  }
  return { from: start, to: end, insert: key + value.slice(start, end) + closing, start: start + 1, end: end + 1 };
}

export function pairedSymbolAfterInput(
  before: string,
  value: string,
  cursor: number | undefined,
  { inputType, code = false, previousSelection }: { inputType?: string; code?: boolean; previousSelection?: TextSelection } = {},
) {
  if (before === value || cursor === undefined || !Number.isInteger(cursor) || cursor < 0 || cursor > value.length) return;
  if ((!inputType || inputType === "deleteContentBackward") && before.length === value.length + 1
    && before.slice(0, cursor) === value.slice(0, cursor) && before.slice(cursor + 1) === value.slice(cursor)) {
    if (previousSelection && previousSelection.start !== previousSelection.end) return;
    const range = { start: cursor + 1, end: cursor + 1 };
    const change = pairedSymbolChange(before, range, "Backspace");
    return change ? { range, edit: applyPairChange(before, change) } : undefined;
  }
  if (inputType && inputType !== "insertText" && inputType !== "insertFromComposition") return;
  const key = value.charAt(cursor - 1);
  if (cursor === 0 || !isPairedSymbol(key)) return;
  const start = cursor - 1;
  const end = cursor + before.length - value.length;
  if (end < start || before.slice(0, start) !== value.slice(0, start) || before.slice(end) !== value.slice(cursor)) return;
  const range = { start, end };
  const change = pairedSymbolChange(before, range, key, code);
  return change ? { range, edit: applyPairChange(before, change) } : undefined;
}

function applyPairChange(value: string, { from, to, insert, start, end }: PairChange) {
  return replaceSelection(value, { start: from, end: to }, insert, start - from, end - from);
}
