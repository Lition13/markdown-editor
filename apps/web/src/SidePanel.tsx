import { useLayoutEffect, useRef, type ReactNode } from "react";

export default function SidePanel({ id, title, className, open, compact, onDismiss, children }: {
  id: string;
  title: string;
  className: string;
  open: boolean;
  compact: boolean;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = id + "-title";
  const classes = "side-panel " + className;

  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [compact, open]);

  if (!compact) {
    return (
      <aside id={id} className={classes} aria-labelledby={titleId} hidden={!open} onKeyDown={event => {
        if (event.defaultPrevented || event.key !== "Escape") return;
        if (event.target instanceof HTMLInputElement && event.target.type === "search" && event.target.value) return;
        event.preventDefault();
        onDismiss();
      }}>
        {children}
      </aside>
    );
  }

  return (
    <dialog ref={dialog} id={id} className={classes} aria-labelledby={titleId} aria-label={title}
      onCancel={event => {
        event.preventDefault();
        onDismiss();
      }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
        if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) onDismiss();
      }}>
      {children}
    </dialog>
  );
}
