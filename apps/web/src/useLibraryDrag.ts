import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { containsFolder, type FolderEntry } from "./files";

export interface DraggableEntry {
  kind: "file" | "folder";
  id: string;
  name: string;
  parentId: string | null;
}

interface MoveSelection {
  entry: DraggableEntry;
  method: "pointer" | "keyboard";
  target?: string | null;
}

interface PointerDrag {
  entry: DraggableEntry;
  element: HTMLButtonElement;
  id: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  target?: string | null;
}

export function useLibraryDrag({
  folders, open, disabled, onMove, fallbackFocus,
}: {
  folders: Map<string, FolderEntry>;
  open: boolean;
  disabled: boolean;
  onMove: (entry: DraggableEntry, folderId: string | null) => Promise<void>;
  fallbackFocus: () => HTMLElement | null;
}) {
  const [selection, setSelection] = useState<MoveSelection | null>(null);
  const pointer = useRef<PointerDrag | null>(null);
  const keyboard = useRef<HTMLButtonElement | null>(null);
  const frame = useRef(0);
  const suppressClick = useRef(false);
  const destinations = useRef<HTMLElement>(null);

  function canDrop(entry: DraggableEntry, folderId: string | null) {
    return entry.parentId !== folderId && (folderId === null || folders.has(folderId))
      && (entry.kind === "file" || !containsFolder(folders, entry.id, folderId));
  }

  function reset() {
    cancelAnimationFrame(frame.current);
    const source = pointer.current;
    pointer.current = null;
    if (source?.active) suppressClick.current = true;
    if (source?.element.hasPointerCapture(source.id)) source.element.releasePointerCapture(source.id);
    keyboard.current = null;
    setSelection(null);
  }

  function restoreFocus(source: HTMLButtonElement) {
    requestAnimationFrame(() => (source.isConnected ? source : fallbackFocus())?.focus());
  }

  function cancel() {
    if (!pointer.current?.active && !keyboard.current) return false;
    const source = keyboard.current;
    reset();
    if (source) restoreFocus(source);
    return true;
  }

  useEffect(() => { if (!open) reset(); }, [open]);
  useEffect(() => {
    window.addEventListener("blur", reset);
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener("blur", reset);
    };
  }, []);

  function targetAt(source: PointerDrag) {
    const hit = source.element.ownerDocument.elementFromPoint(source.x, source.y);
    const node = hit?.closest<HTMLElement>("[data-folder-target]");
    const target = node?.dataset.folderTarget;
    if (target === undefined) return undefined;
    const destination = target || null;
    return canDrop(source.entry, destination) ? destination : undefined;
  }

  function followPointer() {
    const source = pointer.current;
    if (!source?.active) return;
    const hit = source.element.ownerDocument.elementFromPoint(source.x, source.y);
    const scroll = hit?.closest<HTMLElement>("[data-file-scroll]");
    if (scroll && scroll.scrollHeight > scroll.clientHeight) {
      const bounds = scroll.getBoundingClientRect();
      const edge = Math.min(34, bounds.height / 4);
      if (source.y < bounds.top + edge) scroll.scrollTop -= 9;
      else if (source.y > bounds.bottom - edge) scroll.scrollTop += 9;
    }
    const target = targetAt(source);
    if (source.target !== target) {
      source.target = target;
      setSelection({ entry: source.entry, method: "pointer", target });
    }
    frame.current = requestAnimationFrame(followPointer);
  }

  function beginPointer(event: PointerEvent<HTMLButtonElement>, entry: DraggableEntry) {
    if (disabled || !event.isPrimary || event.button !== 0) return;
    suppressClick.current = false;
    if (event.pointerType === "touch" && !(event.target instanceof Element && event.target.closest(".file-kind-icon"))) return;
    if (keyboard.current) return;
    const element = event.currentTarget;
    pointer.current = {
      entry, element, id: event.pointerId, active: false,
      x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
    };
    element.setPointerCapture(event.pointerId);
  }

  function movePointer(event: PointerEvent<HTMLButtonElement>) {
    const source = pointer.current;
    if (!source || source.id !== event.pointerId) return;
    source.x = event.clientX;
    source.y = event.clientY;
    if (source.active || Math.hypot(source.x - source.startX, source.y - source.startY) < 6) return;
    source.active = true;
    setSelection({ entry: source.entry, method: "pointer" });
    frame.current = requestAnimationFrame(followPointer);
  }

  function finishPointer(event: PointerEvent<HTMLButtonElement>) {
    const source = pointer.current;
    if (!source || source.id !== event.pointerId) return;
    const target = source.active ? targetAt({ ...source, x: event.clientX, y: event.clientY }) : undefined;
    reset();
    if (target !== undefined) void onMove(source.entry, target);
  }

  function keyboardPick(event: KeyboardEvent<HTMLButtonElement>, entry: DraggableEntry) {
    if (disabled || event.key !== " " || !event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
    if (!canDrop(entry, null) && !Array.from(folders.keys()).some(id => canDrop(entry, id))) return;
    event.preventDefault();
    if (event.repeat || pointer.current?.active) return;
    keyboard.current = event.currentTarget;
    setSelection({ entry, method: "keyboard" });
    requestAnimationFrame(() => destinations.current?.querySelector("button")?.focus());
  }

  function choose(folderId: string | null) {
    const source = keyboard.current;
    if (!selection || !source || !canDrop(selection.entry, folderId)) return;
    reset();
    void onMove(selection.entry, folderId).then(() => restoreFocus(source));
  }

  function rowProps(entry: DraggableEntry) {
    return {
      "aria-keyshortcuts": "Shift+Space",
      "data-dragging": selection?.entry.id === entry.id ? "true" : undefined,
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => beginPointer(event, entry),
      onPointerMove: movePointer,
      onPointerUp: finishPointer,
      onPointerCancel: reset,
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => {
        if (pointer.current?.id === event.pointerId) reset();
      },
      onClickCapture: (event: React.MouseEvent<HTMLButtonElement>) => {
        if (!suppressClick.current || !event.detail) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => keyboardPick(event, entry),
    };
  }

  function targetProps(folderId: string | null) {
    return {
      "data-folder-target": folderId ?? "",
      "data-drop-active": selection?.target === folderId ? "true" : undefined,
    };
  }

  return { selection, destinations, canDrop, cancel, reset, choose, rowProps, targetProps };
}
