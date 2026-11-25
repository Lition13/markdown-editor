import { useRef, useState } from "react";
import { isMarkdownShortcutPrefix, type ShortcutEvent } from "../core/markdownShortcuts";

type KeyEvent = ShortcutEvent & Pick<KeyboardEvent, "repeat" | "preventDefault" | "stopPropagation">;

export function useMarkdownKeySequence() {
  const armed = useRef(false);
  const [waiting, setWaiting] = useState(false);

  function reset() {
    if (!armed.current) return;
    armed.current = false;
    setWaiting(false);
  }

  function read(event: KeyEvent) {
    if (isMarkdownShortcutPrefix(event)) {
      if (!event.repeat) {
        armed.current = true;
        setWaiting(true);
      }
      event.preventDefault();
      event.stopPropagation();
      return null;
    }
    if (!armed.current || ["Control", "Meta", "Shift", "Alt", "AltGraph"].includes(event.key)) return false;
    reset();
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      return null;
    }
    return !event.ctrlKey && !event.metaKey && !event.altKey;
  }

  return { read, reset, waiting, isWaiting: () => armed.current };
}
