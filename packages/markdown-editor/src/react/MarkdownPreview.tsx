import MarkdownContent from "./MarkdownContent";
import { defaultEnvironment, MarkdownEnvironment, type MarkdownPreviewProps } from "./editorContext";

export default function MarkdownPreview({
  value,
  theme = "light",
  className = "",
  normalizeLink,
  onOpenLink,
  copyText,
}: MarkdownPreviewProps) {
  return (
    <div className={`markdown-surface ${className}`} data-theme={theme}>
      <MarkdownEnvironment.Provider value={{ ...defaultEnvironment, theme, normalizeLink, onOpenLink, copyText }}>
        <MarkdownContent value={value} />
      </MarkdownEnvironment.Provider>
    </div>
  );
}
