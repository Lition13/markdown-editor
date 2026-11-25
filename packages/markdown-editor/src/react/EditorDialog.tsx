import { CodeXml, Minimize2, PencilLine } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MarkdownEnvironment, useMarkdownEnvironment, type MarkdownMode } from "./editorContext";

export default function EditorDialog({ mode, onMode, onClose, children }: {
  mode: MarkdownMode;
  onMode: (mode: MarkdownMode) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const environment = useMarkdownEnvironment();
  const { overlay, topInset } = environment;
  const dialog = useRef<HTMLDialogElement>(null);
  const header = useRef<HTMLElement>(null);
  const [menuLayer, setMenuLayer] = useState<HTMLDivElement | null>(null);
  const [headerBottom, setHeaderBottom] = useState(topInset);

  useLayoutEffect(() => {
    const element = dialog.current;
    const bar = header.current;
    if (!element || !bar) return;
    element.showModal();
    const measure = () => setHeaderBottom(bar.getBoundingClientRect().bottom);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      element.close();
    };
  }, [overlay]);
  useLayoutEffect(() => {
    if (header.current) setHeaderBottom(header.current.getBoundingClientRect().bottom);
  }, [topInset]);

  if (!overlay) return null;
  return createPortal(
    <dialog ref={dialog} className="markdown-editor-modal" aria-label="编辑 Markdown"
      style={{ "--markdown-fullscreen-inset": Math.max(0, topInset) + "px" } as CSSProperties}
      onKeyDown={event => {
        if (event.key === "Escape" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
      }}
      onCancel={event => { event.preventDefault(); onClose(); }}>
      <header ref={header} className="markdown-fullscreen-header">
        <h2>编辑 Markdown</h2>
        <div className="markdown-fullscreen-modes" role="group" aria-label="全屏编辑视图">
          <button type="button" aria-pressed={mode === "live"} onClick={() => onMode("live")}>
            <PencilLine size={15} aria-hidden="true" />编辑
          </button>
          <button type="button" aria-pressed={mode === "source"} onClick={() => onMode("source")}>
            <CodeXml size={16} aria-hidden="true" />源码
          </button>
        </div>
        <button type="button" className="markdown-fullscreen-done" onClick={onClose}>
          <Minimize2 size={16} aria-hidden="true" />完成编辑
        </button>
      </header>
      {menuLayer && (
        <MarkdownEnvironment.Provider value={{ ...environment, overlay: menuLayer, topInset: headerBottom }}>
          {children}
        </MarkdownEnvironment.Provider>
      )}
      <div ref={setMenuLayer} />
    </dialog>,
    overlay,
  );
}
