import { useRef, useState } from "react";
import { editorShortcutPrefix, isModifierKey, markdownShortcutFromEvent, type ShortcutEvent } from "../core/shortcutKeys";

type KeyEvent = ShortcutEvent & Pick<KeyboardEvent, "repeat" | "preventDefault" | "stopPropagation">;

export function useMarkdownKeySequence(enabled: boolean) {
  const armed = useRef(false);
  const [waiting, setWaiting] = useState(false);

  function reset() {
    if (!armed.current) return;
    armed.current = false;
    setWaiting(false);
  }

  function read(event: KeyEvent) {
    if (!enabled) {
      reset();
      return false;
    }
    if (markdownShortcutFromEvent(event) === editorShortcutPrefix) {
      if (!event.repeat) {
        armed.current = true;
        setWaiting(true);
      }
      event.preventDefault();
      event.stopPropagation();
      return null;
    }
    if (!armed.current || isModifierKey(event.key)) return false;
    reset();
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      return null;
    }
    return !event.ctrlKey && !event.metaKey && !event.altKey;
  }

  return { read, reset, waiting: enabled && waiting, isWaiting: () => enabled && armed.current };
}
