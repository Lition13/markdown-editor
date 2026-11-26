import { useState, type KeyboardEvent } from "react";
import { folderPath, type FileEntry, type FolderEntry } from "./files";

const fileOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function useResultNavigation<T extends { id: string }>(
  results: readonly T[],
  options: { selectFirst: boolean; disabled: boolean; elementId: (id: string) => string; onAccept: (result: T) => void },
) {
  const [id, select] = useState<string | null>(null);
  const active = results.find(result => result.id === id) ?? (options.selectFirst ? results[0] : undefined);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (options.disabled || !results.length || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
      || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "Enter" && active) {
      event.preventDefault();
      if (!event.repeat) options.onAccept(active);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const up = event.key === "ArrowUp";
      const index = active ? results.indexOf(active) + (up ? -1 : 1) : up ? results.length - 1 : 0;
      const next = results[Math.max(0, Math.min(results.length - 1, index))];
      select(next.id);
      document.getElementById(options.elementId(next.id))?.scrollIntoView({ block: "nearest" });
    }
  }
  return { active, select, onKeyDown };
}

export function indexFiles(files: FileEntry[], folders: FolderEntry[]) {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  return files.map(file => {
    const path = folderPath(byId, file.folderId ?? null).map(folder => folder.name).join("/");
    return {
      id: file.id,
      name: file.name,
      path,
      searchName: file.name.normalize("NFC").toLowerCase(),
      searchPath: path.normalize("NFC").toLowerCase(),
    };
  }).sort((left, right) => fileOrder.compare(left.name, right.name) || fileOrder.compare(left.path, right.path));
}

export function matchRank(text: string, token: string) {
  if (text === token) return 0;
  if (text.startsWith(token)) return 1;
  if (text.includes(token)) return 2;
  let index = 0;
  for (const character of token) {
    index = text.indexOf(character, index) + 1;
    if (!index) return Infinity;
  }
  return 3;
}

export function searchFiles(files: ReturnType<typeof indexFiles>, query: string) {
  const tokens = query.replaceAll("\\", "/").normalize("NFC").toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return files;
  return files.map(file => ({
    file,
    score: tokens.reduce((score, token) =>
      score + Math.min(matchRank(file.searchName, token), 4 + matchRank(file.searchPath + "/" + file.searchName, token)), 0),
  })).filter(result => Number.isFinite(result.score)).sort((a, b) => a.score - b.score).map(result => result.file);
}
