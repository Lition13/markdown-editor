import { X } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMarkdownEnvironment } from "./editorContext";

const focusable = 'button:not(:disabled), input:not(:disabled):not([type="file"]), textarea, select, [tabindex="0"]';

export default function EditorDialog({
  title,
  children,
  onClose,
  initialFocus,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  initialFocus?: string;
}) {
  const { overlay } = useMarkdownEnvironment();
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const owner = element.ownerDocument;
    const previous = owner.activeElement as HTMLElement | null;
    const target = (initialFocus && element.querySelector<HTMLElement>(initialFocus))
      || element.querySelector<HTMLElement>(focusable);
    target?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !element.contains(owner.activeElement)) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        close.current();
      }
      if (event.key === "Tab") {
        const controls = Array.from(element.querySelectorAll<HTMLElement>(focusable))
          .filter(control => control.getClientRects().length > 0);
        const first = controls.at(0);
        const last = controls.at(-1);
        const atEdge = (event.shiftKey ? first : last) === owner.activeElement;
        if (atEdge) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }
    };
    owner.addEventListener("keydown", onKey);
    return () => {
      owner.removeEventListener("keydown", onKey);
      previous?.focus({ preventScroll: true });
    };
  }, [overlay, initialFocus]);

  if (!overlay) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div ref={dialog} className="modal markdown-editor-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" aria-label="关闭弹窗" onClick={onClose}><X size={19} /></button>
        </div>
        {children}
      </div>
    </div>,
    overlay,
  );
}
