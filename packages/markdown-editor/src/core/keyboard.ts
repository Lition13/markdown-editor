const suppressions = new WeakMap<HTMLElement, () => void>();

export function releaseBackspaceRepeat(scope: HTMLElement) {
  suppressions.get(scope)?.();
}

export function suppressBackspaceRepeat(scope: HTMLElement | null, overlay: HTMLElement | null) {
  const owner = scope?.ownerDocument.defaultView;
  if (!scope || !owner) return;
  releaseBackspaceRepeat(scope);
  const released = (event: KeyboardEvent) => { if (event.key === "Backspace") stop(); };
  const repeat = (event: KeyboardEvent) => {
    if (event.key !== "Backspace") return;
    const target = event.target;
    if (!event.repeat || !(target instanceof owner.Node) || !(scope.contains(target) || overlay?.contains(target))) {
      stop();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const stop = () => {
    owner.removeEventListener("keydown", repeat, true);
    owner.removeEventListener("keyup", released, true);
    owner.removeEventListener("blur", stop);
    suppressions.delete(scope);
  };
  suppressions.set(scope, stop);
  owner.addEventListener("keydown", repeat, true);
  owner.addEventListener("keyup", released, true);
  owner.addEventListener("blur", stop, { once: true });
}

export function shortcutFromEvent(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
) {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return "";
  return [
    ...(e.ctrlKey || e.metaKey ? ["Ctrl"] : []),
    ...(e.altKey ? ["Alt"] : []),
    ...(e.shiftKey ? ["Shift"] : []),
    e.key.length === 1 ? e.key.toUpperCase() : e.key,
  ].join("+");
}
