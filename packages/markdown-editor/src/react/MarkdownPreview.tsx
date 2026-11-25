import MarkdownContent from "./MarkdownContent";
import { markdownTranslator } from "../core/locale";
import { defaultEnvironment, MarkdownEnvironment, type MarkdownPreviewProps } from "./editorContext";

export default function MarkdownPreview({
  value,
  theme = "light",
  locale = "zh-CN",
  className = "",
  normalizeLink,
  onOpenLink,
  copyText,
}: MarkdownPreviewProps) {
  return (
    <div className={`markdown-surface ${className}`} data-theme={theme} lang={locale}>
      <MarkdownEnvironment.Provider value={{ ...defaultEnvironment, theme, locale, t: markdownTranslator(locale), normalizeLink, onOpenLink, copyText }}>
        <MarkdownContent value={value} />
      </MarkdownEnvironment.Provider>
    </div>
  );
}
