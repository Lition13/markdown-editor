import { lazy, Suspense, type ReactNode } from "react";
import { useMarkdownEnvironment } from "./editorContext";
const Renderer = lazy(() => import("./MarkdownRenderer"));
export type MarkdownCellPosition = { rowOffset: number; column: number };
export interface MarkdownContentProps {
  value: string;
  onChange?: (value: string) => void;
  className?: string;
  renderTableCell?: (position: MarkdownCellPosition, children: ReactNode) => ReactNode;
}
export default function MarkdownContent(props: MarkdownContentProps) {
  const { t } = useMarkdownEnvironment();
  return (
    <Suspense fallback={<div className="markdown-loading">{t("正在载入预览…")}</div>}>
      <Renderer {...props} />
    </Suspense>
  );
}
