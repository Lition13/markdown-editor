import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, Search, X } from "lucide-react";
import { suppressBackspaceRepeat } from "../core/keyboard";
import { useMarkdownEnvironment } from "./editorContext";
export interface ActionItem {
  id: string;
  label?: string;
  icon?: ReactNode;
  shortcut?: string;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  run?: () => void;
  children?: ActionItem[];
  keepOpen?: boolean;
  search?: string;
  keywords?: string;
  content?: ReactNode;
  quick?: { label: string; items: ActionItem[] };
}
export interface MenuPoint {
  x: number;
  y: number;
  aboveY?: number;
}
type MenuSearch = {
  emptyText: string;
  selectFirst?: boolean;
  closeOnEmptyBackspace?: boolean;
  onEmptySlash?: () => void;
};

export function eventPoint(event: React.MouseEvent<HTMLElement>): MenuPoint {
  event.preventDefault();
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  return event.type === "contextmenu"
    ? { x: event.clientX, y: event.clientY }
    : { x: rect.right, y: rect.bottom + 4 };
}
function MenuLevel({
  items,
  point,
  owner,
  onClose,
  onBack,
  label,
  anchor,
  dialog = false,
  autoFocus = false,
  initialFocus,
  className,
  search,
  closeLabel = "关闭编辑工具",
  resolvePoint,
}: {
  items: ActionItem[];
  point: MenuPoint;
  owner: string;
  onClose: () => void;
  onBack?: () => void;
  label: string;
  anchor?: HTMLElement;
  dialog?: boolean;
  autoFocus?: boolean;
  initialFocus?: string;
  className?: string;
  search?: MenuSearch;
  closeLabel?: string;
  resolvePoint?: () => MenuPoint | undefined;
}) {
  const { surface, overlay, topInset } = useMarkdownEnvironment();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(point);
  const [query, setQuery] = useState("");
  const filterItems = (values: ActionItem[]): ActionItem[] =>
    values.flatMap((item) => {
      if (item.search || item.content || item.separator || !query.trim())
        return [item];
      if (
        `${item.label ?? ""} ${item.keywords ?? ""}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase())
      )
        return [item];
      const children = item.children ? filterItems(item.children) : [];
      return children.length ? [{ ...item, children }] : [];
    });
  const visibleItems = filterItems(items);
  const [child, setChild] = useState<{
    item: ActionItem;
    point: MenuPoint;
    focus: boolean;
  } | null>(null);
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const place = () => {
      const current = resolvePoint?.() ?? point;
      const rect = anchor?.getClientRects().length ? anchor.getBoundingClientRect() : null;
      const topLimit = Math.max(8, topInset + 6);
      if (anchor) menu.style.maxHeight = `min(730px, calc(100dvh - ${topLimit + 8}px))`;
      const below = rect ? rect.bottom + 5 : current.y;
      const bottomLimit = window.innerHeight - menu.offsetHeight - 8;
      const above = (rect?.top ?? current.aboveY ?? 0) - menu.offsetHeight - 5;
      const x = Math.max(8, Math.min(rect?.left ?? current.x, window.innerWidth - menu.offsetWidth - 8));
      const y = Math.max(topLimit, Math.min(below > bottomLimit && above >= topLimit ? above : below, bottomLimit));
      setPosition((previous) => previous.x === x && previous.y === y ? previous : { x, y });
    };
    place();
    const owner = menu.ownerDocument;
    const viewport = owner.defaultView;
    const observer = new ResizeObserver(place);
    observer.observe(menu);
    if (anchor || resolvePoint) owner.addEventListener("scroll", place, true);
    viewport?.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      owner.removeEventListener("scroll", place, true);
      viewport?.removeEventListener("resize", place);
    };
  }, [anchor, point.x, point.y, point.aboveY, items.length, query, resolvePoint, topInset]);
  useEffect(() => {
    if (!autoFocus) return;
    const selector = dialog
      ? ".menu-custom-content input:not(:disabled), .menu-custom-content button:not(:disabled)"
      : "input,button:not(:disabled)";
    const target = initialFocus && ref.current?.querySelector<HTMLElement>(initialFocus);
    (target || ref.current?.querySelector<HTMLElement>(selector) || ref.current)?.focus({ preventScroll: true });
  }, [autoFocus, dialog, initialFocus]);
  const openChild = (item: ActionItem, button: HTMLElement, focus = false) => {
    const rect = button.getBoundingClientRect();
    setChild({
      item,
      point: {
        x:
          rect.right + 240 > window.innerWidth
            ? Math.max(8, rect.left - 240)
            : rect.right + 1,
        y: rect.top - 5,
      },
      focus,
    });
  };
  if (!overlay) return null;
  return createPortal(
    <>
      <div
        className={`action-menu${dialog ? " markdown-menu-panel" : ""}${className ? ` ${className}` : ""}`}
        data-context-owner={owner}
        role={dialog ? "dialog" : "menu"}
        aria-label={label}
        ref={ref}
        tabIndex={dialog ? -1 : undefined}
        style={{ left: position.x, top: position.y }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (dialog) {
            if (e.key === "Escape" && !e.defaultPrevented && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }
            return;
          }
          const emptySearch = e.target instanceof HTMLInputElement && !e.target.value && e.target.closest(".menu-search");
          if (emptySearch && search?.onEmptySlash && e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            if (!e.repeat) search.onEmptySlash();
            return;
          }
          if (emptySearch && search?.closeOnEmptyBackspace && e.key === "Backspace" && !e.repeat) {
            e.preventDefault();
            e.stopPropagation();
            suppressBackspaceRepeat(surface, overlay);
            onClose();
            return;
          }
          if (search?.selectFirst && e.key === "Enter" && (e.target as HTMLElement).closest(".menu-search")) {
            e.preventDefault();
            e.stopPropagation();
            ref.current?.querySelector<HTMLButtonElement>(".action-menu-item:not(:disabled)")?.click();
            return;
          }
          if (
            (e.target as HTMLElement).closest("input,textarea,select") &&
            !["Escape", "ArrowDown"].includes(e.key)
          )
            return;
          const buttons = Array.from(
            ref.current?.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ) || [],
          );
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            buttons[
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? buttons.length - 1
                  : (index +
                      (e.key === "ArrowDown" ? 1 : -1) +
                      buttons.length) %
                    buttons.length
            ]?.focus();
          }
          if (e.key === "Escape" || e.key === "ArrowLeft") {
            e.preventDefault();
            e.stopPropagation();
            if (onBack) onBack();
            else onClose();
          }
          if (e.key === "ArrowRight") {
            const item = visibleItems.find(
              (i) =>
                i.id ===
                (document.activeElement as HTMLElement)?.dataset.menuItem,
            );
            if (item?.children) {
              e.preventDefault();
              openChild(item, document.activeElement as HTMLElement, true);
            }
          }
        }}
      >
        {dialog && (
          <div className="markdown-menu-panel-heading">
            <strong>{label}</strong>
            <button type="button" aria-label={closeLabel} onClick={() => onClose()}><X size={15} /></button>
          </div>
        )}
        {query.trim() &&
          !visibleItems.some((i) => !i.search && !i.separator) && (
            <p className="menu-no-results">{search?.emptyText ?? "没有匹配的命令"}</p>
          )}
        {visibleItems.map((item) =>
          item.search ? (
            <label className="menu-search" key={item.id}>
              <Search size={15} />
              <input
                aria-label={item.search}
                placeholder={item.search}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setChild(null);
                }}
              />
            </label>
          ) : item.content ? (
            <div className="menu-custom-content" key={item.id}>
              {item.content}
            </div>
          ) : item.quick ? (
            <section className="menu-quick-section" key={item.id}>
              <h4>{item.quick.label}</h4>
              <div className="menu-quick-row">
                {item.quick.items.map((choice) => (
                  <button
                    type="button"
                    role={
                      choice.checked !== undefined
                        ? "menuitemcheckbox"
                        : "menuitem"
                    }
                    aria-label={choice.label}
                    aria-checked={choice.checked}
                    title={choice.label}
                    key={choice.id}
                    className={choice.checked ? "chosen" : ""}
                    onMouseEnter={() => setChild(null)}
                    onClick={() => {
                      choice.run?.();
                      if (!choice.keepOpen) onClose();
                    }}
                  >
                    {choice.icon}
                  </button>
                ))}
              </div>
            </section>
          ) : item.separator ? (
            <div className="menu-divider" key={item.id} />
          ) : (
            <button
              type="button"
              key={item.id}
              data-menu-item={item.id}
              aria-label={item.label}
              role={
                item.checked !== undefined ? "menuitemcheckbox" : "menuitem"
              }
              aria-checked={item.checked}
              aria-haspopup={item.children ? "menu" : undefined}
              disabled={item.disabled}
              className={`action-menu-item ${item.danger ? "danger" : ""} ${child?.item.id === item.id ? "submenu-open" : ""}`}
              onMouseEnter={(e) => {
                if (item.children) openChild(item, e.currentTarget);
                else setChild(null);
              }}
              onClick={(e) => {
                if (item.children) openChild(item, e.currentTarget, true);
                else {
                  item.run?.();
                  if (!item.keepOpen) onClose();
                }
              }}
            >
              <span className="action-item-icon">
                {item.icon || (item.checked ? <Check size={14} /> : null)}
              </span>
              <span>{item.label}</span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
              {item.checked && item.icon && <Check size={12} />}{" "}
              {item.children && <ChevronRight size={13} />}
            </button>
          ),
        )}
      </div>
      {child && (
        <MenuLevel
          items={
            visibleItems.find((i) => i.id === child.item.id)?.children || []
          }
          key={child.item.id}
          point={child.point}
          owner={owner}
          onClose={onClose}
          onBack={() => {
            ref.current
              ?.querySelector<HTMLButtonElement>(
                `[data-menu-item="${child.item.id}"]`,
              )
              ?.focus();
            setChild(null);
          }}
          label={`${child.item.label}子菜单`}
          autoFocus={child.focus}
        />
      )}
    </>,
    overlay,
  );
}
export default function ActionMenu({
  items,
  point,
  onClose,
  label = "右键菜单",
  anchor,
  dialog = false,
  initialFocus,
  className,
  search,
  closeLabel,
  resolvePoint,
}: {
  items: ActionItem[];
  point: MenuPoint;
  onClose: (restoreFocus?: boolean) => void;
  label?: string;
  anchor?: HTMLElement;
  dialog?: boolean;
  initialFocus?: string;
  className?: string;
  search?: MenuSearch;
  closeLabel?: string;
  resolvePoint?: () => MenuPoint | undefined;
}) {
  const owner = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const outside = (e: Event) => {
      const target = e.target;
      if (target instanceof Element && !anchor?.contains(target) &&
          !target.closest(`[data-context-owner="${owner}"]`)) close.current(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !e.isComposing) {
        e.stopPropagation();
        close.current();
      }
      if (
        e.key === "Tab" && !dialog &&
        !(e.target as HTMLElement).closest(".menu-custom-content")
      )
        close.current();
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("contextmenu", outside);
    if (anchor) document.addEventListener("focusin", outside);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("contextmenu", outside);
      if (anchor) document.removeEventListener("focusin", outside);
      window.removeEventListener("keydown", key);
    };
  }, [anchor, dialog, owner]);
  return (
    <MenuLevel
      items={items}
      point={point}
      owner={owner}
      onClose={onClose}
      label={label}
      anchor={anchor}
      dialog={dialog}
      initialFocus={initialFocus}
      className={className}
      search={search}
      closeLabel={closeLabel}
      resolvePoint={resolvePoint}
      autoFocus
    />
  );
}
