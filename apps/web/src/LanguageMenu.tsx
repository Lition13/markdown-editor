import type { MarkdownLocale } from "@lition13/markdown-editor";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { useWebLocale, useWebText } from "./locale";

const languages = [
  { locale: "en", label: "English" },
  { locale: "zh-CN", label: "简体中文" },
] as const;

export default function LanguageMenu({ open, onOpenChange, onChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (locale: MarkdownLocale) => void;
}) {
  const locale = useWebLocale();
  const t = useWebText();
  const label = t("界面语言");
  const menuId = useId();
  const control = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (open) menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function dismissOnOutsidePress(event: PointerEvent) {
      if (event.target instanceof Node && !control.current?.contains(event.target)) onOpenChange(false);
    }
    document.addEventListener("pointerdown", dismissOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", dismissOnOutsidePress, true);
  }, [open, onOpenChange]);

  function closeAndReturnFocus() {
    trigger.current?.focus({ preventScroll: true });
    onOpenChange(false);
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAndReturnFocus();
      return;
    }
    if (open && event.key === "Tab") {
      closeAndReturnFocus();
      return;
    }
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        onOpenChange(true);
      }
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menu.current?.querySelectorAll("button") ?? []);
    const focused = items.findIndex(item => item === event.target);
    const direction = event.key === "ArrowUp" ? -1 : 1;
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : (focused + direction + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div className="language-control" ref={control} onKeyDown={handleKeys}
      onBlur={event => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) onOpenChange(false);
      }}>
      <button ref={trigger} type="button" className="icon-control language-trigger" aria-label={label}
        aria-haspopup="menu" aria-controls={menuId} aria-expanded={open} title={open ? undefined : label}
        onClick={() => onOpenChange(!open)}>
        <Languages size={17} aria-hidden="true" />
        <span className="language-label" lang={locale} aria-hidden="true">{locale === "en" ? "EN" : "中文"}</span>
        <ChevronDown className="language-chevron" size={13} aria-hidden="true" />
      </button>
      <div ref={menu} id={menuId} className="language-menu" role="menu" aria-label={label} hidden={!open}>
        {languages.map(language => (
          <button key={language.locale} type="button" role="menuitemradio" aria-checked={locale === language.locale}
            lang={language.locale} tabIndex={-1} onClick={() => {
              onChange(language.locale);
              closeAndReturnFocus();
            }}>
            {language.label}
            {locale === language.locale && <Check size={16} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  );
}
