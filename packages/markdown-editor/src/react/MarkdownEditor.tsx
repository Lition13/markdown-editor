import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { releaseBackspaceRepeat } from "../core/keyboard";
import MarkdownNotes from "./MarkdownNotes";
import { defaultEnvironment, MarkdownEnvironment, type MarkdownEditorProps } from "./editorContext";

export default function MarkdownEditor({
  value,
  onChange,
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

  const environment = useMemo(() => ({
    theme, ariaLabel, placeholder, normalizeLink, onOpenLink, copyText, surface: surface.current, overlay, topInset: overlayTopInset,
  }), [theme, ariaLabel, placeholder, normalizeLink, onOpenLink, copyText, overlay, overlayTopInset]);

  return (
    <div className={`markdown-surface ${className}`} data-theme={theme} ref={surface}>
      <MarkdownEnvironment.Provider value={environment}>
        <MarkdownNotes value={value} onChange={onChange} allowExpand={allowExpand} />
      </MarkdownEnvironment.Provider>
    </div>
  );
}
