import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { releaseBackspaceRepeat } from "../core/keyboard";
import { markdownTranslator } from "../core/locale";
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
  ariaLabel,
  placeholder,
  theme = "light",
  locale = "zh-CN",
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
  const t = markdownTranslator(locale);

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
    if (!overlay) return;
    overlay.dataset.theme = theme;
    overlay.lang = locale;
  }, [overlay, theme, locale]);

  const keymap = useMemo(() => shortcuts ? resolveMarkdownShortcuts(shortcuts) : defaultEnvironment.shortcuts, [shortcuts]);
  const environment = useMemo(() => ({
    theme, locale, t, ariaLabel: ariaLabel ?? t("Markdown 正文"), placeholder: placeholder ?? t("开始输入。输入 / 打开编辑工具"),
    normalizeLink, onOpenLink, copyText, surface: surface.current, overlay, topInset: overlayTopInset,
    shortcuts: keymap,
  }), [theme, locale, t, ariaLabel, placeholder, normalizeLink, onOpenLink, copyText, overlay, overlayTopInset, keymap]);

  return (
    <div className={`markdown-surface ${className}`} data-theme={theme} lang={locale} ref={surface}>
      <MarkdownEnvironment.Provider value={environment}>
        <MarkdownNotes editorRef={ref} value={value} onChange={onChange} mode={mode} onModeChange={onModeChange} allowExpand={allowExpand} />
      </MarkdownEnvironment.Provider>
    </div>
  );
}
