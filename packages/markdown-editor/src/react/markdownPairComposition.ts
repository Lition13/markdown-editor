import { isPairedSymbol, pairedSymbolAfterInput } from "../core/markdownPairs";

export function completedSymbolPair(before: string, value: string, cursor: number | null, symbol: string) {
  if (cursor === null || value[cursor - 1] !== symbol || !isPairedSymbol(symbol)) return;
  return pairedSymbolAfterInput(before, value, cursor, { inputType: "insertFromComposition" });
}
