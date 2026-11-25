import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { releaseBackspaceRepeat } from "../core/keyboard";
import { resolveMarkdownShortcuts } from "../core/markdownShortcuts";
import MarkdownNotes from "./MarkdownNotes";
import { defaultEnvironment, MarkdownEnvironment, type MarkdownEditorProps } from "./editorContext";

export default function MarkdownEditor({
  ref,
  value,
  onChange,
  mode,
  onModeChange,
  allowExpand,
  ariaLabel = defaultEnvironment.ariaLabel,
  placeholder = defaultEnvironment.placeholder,
  theme = "light",
  className = "",
  normalizeLink,
  onOpenLink,
  copyText,
  overlayContainer,
  overlayTopInset = 0,
  shortcuts,
}: MarkdownEditorProps) {
  const surface = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const host = surface.current;
    if (!host) return;
    const owner = host.ownerDocument;
    const element = owner.createElement("div");
    element.className = "markdown-surface markdown-overlay";
    (overlayContainer ?? owner.body).append(element);
    setOverlay(element);
    return () => {
      releaseBackspaceRepeat(host);
      element.remove();
    };
  }, [overlayContainer]);

  useLayoutEffect(() => {
    if (overlay) overlay.dataset.theme = theme;
  }, [overlay, theme]);

  const keymap = useMemo(() => shortcuts ? resolveMarkdownShortcuts(shortcuts) : defaultEnvironment.shortcuts, [shortcuts]);
  const environment = useMemo(() => ({
    theme, ariaLabel, placeholder, normalizeLink, onOpenLink, copyText, surface: surface.current, overlay, topInset: overlayTopInset,
    shortcuts: keymap,
  }), [theme, ariaLabel, placeholder, normalizeLink, onOpenLink, copyText, overlay, overlayTopInset, keymap]);

  return (
    <div className={`markdown-surface ${className}`} data-theme={theme} ref={surface}>
      <MarkdownEnvironment.Provider value={environment}>
        <MarkdownNotes editorRef={ref} value={value} onChange={onChange} mode={mode} onModeChange={onModeChange} allowExpand={allowExpand} />
      </MarkdownEnvironment.Provider>
    </div>
  );
}
