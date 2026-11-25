import { codeLanguageId, codeLanguages, matchCodeLanguage, suggestCodeLanguages, type CodeLanguage } from "../core/markdownCode";

const languageMarks: Record<string, [string, string]> = {
  bash: ["$", "#27866c"], c: ["C", "#5571ce"], cpp: ["C++", "#5571ce"],
  csharp: ["C#", "#8a5ccb"], css: ["CSS", "#a24cb2"], go: ["Go", "#16849c"],
  java: ["Jv", "#bd543c"], javascript: ["JS", "#bb810e"], json: ["{}", "#a76c20"],
  markdown: ["Md", "#5274bb"], mermaid: ["M", "#b64f78"], plaintext: ["Aa", "#64748b"],
  python: ["Py", "#3477a9"], "python-repl": ["Py", "#3477a9"], ruby: ["Rb", "#b8505d"], rust: ["Rs", "#a65d3c"],
  sql: ["SQL", "#188783"], typescript: ["TS", "#397bd6"], xml: ["<>", "#c06436"],
};

function languageMark(badge: HTMLElement, id: string) {
  const [mark, color] = Object.hasOwn(languageMarks, id) ? languageMarks[id] : [id.slice(0, 2).toUpperCase(), "var(--accent)"];
  badge.textContent = mark;
  badge.style.setProperty("--language-color", color);
}

function badgeFor(id: string) {
  const badge = document.createElement("span");
  badge.className = "notes-code-language-badge";
  badge.setAttribute("aria-hidden", "true");
  languageMark(badge, id);
  return badge;
}

export function codeLanguageOption(language: CodeLanguage, current = false) {
  const option = document.createElement("button");
  option.type = "button";
  option.tabIndex = -1;
  option.className = "notes-code-language-option";
  option.setAttribute("role", "option");
  option.setAttribute("aria-label", language.label);

  const name = document.createElement("span");
  name.className = "notes-code-language-name";
  name.textContent = language.label;
  const detail = document.createElement("span");
  detail.className = "notes-code-language-alias";
  detail.setAttribute("aria-hidden", "true");
  const shortcut = language.aliases[0] || language.id;
  detail.textContent = shortcut.toLowerCase() === language.label.toLowerCase() ? "" : shortcut;
  option.append(badgeFor(language.id), name, detail);
  if (current) {
    option.dataset.current = "true";
    const check = document.createElement("span");
    check.className = "notes-code-language-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓";
    option.append(check);
  }
  return option;
}

let nextMenuId = 0;

export function createCodeLanguagePicker(
  value: string,
  onPreview: (language: string) => void,
  onFinish: (language: string | null, destination: "code" | "below" | null) => void,
  topInset: () => number,
) {
  const initial = matchCodeLanguage(value);
  const current = initial?.id ?? (value || "plaintext");
  const initialText = initial?.label ?? value;
  const footer = document.createElement("div");
  footer.className = "cm-md-code-settings";
  const control = document.createElement("label");
  control.className = "notes-code-language-control";
  const badge = badgeFor(current);
  const input = document.createElement("input");
  input.value = initialText;
  input.placeholder = "选择语言";
  input.spellcheck = false;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-label", "代码块语言");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  const chevron = document.createElement("span");
  chevron.className = "notes-code-language-chevron";
  chevron.setAttribute("aria-hidden", "true");
  control.append(badge, input, chevron);

  const menu = document.createElement("div");
  menu.id = `code-languages-${++nextMenuId}`;
  menu.className = "notes-code-language-menu";
  menu.setAttribute("popover", "manual");
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", "可选代码语言");
  input.setAttribute("aria-controls", menu.id);
  footer.append(control, menu);

  let listeners: AbortController | null = null;
  let options: CodeLanguage[] = [];
  let active = -1;
  let finished = false;
  let navigating = false;
  let openOnFocus = true;

  const place = () => {
    const anchor = control.getBoundingClientRect();
    const scroller = footer.closest(".markdown-editor-modal .markdown-notes");
    const scrollBounds = scroller?.getBoundingClientRect();
    const top = Math.max(8, topInset() + 5);
    const bottom = window.innerHeight - 8;
    const above = anchor.top - top - 5;
    const below = bottom - anchor.bottom - 5;
    const openAbove = below < 230 && above > below;
    const width = Math.min(236, window.innerWidth - 16);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(8, Math.min(anchor.right - width, window.innerWidth - 8 - width))}px`;
    menu.style.maxHeight = `${Math.max(0, Math.min(252, openAbove ? above : below))}px`;
    menu.style.top = openAbove ? "" : `${anchor.bottom + 5}px`;
    menu.style.bottom = openAbove ? `${window.innerHeight - anchor.top + 5}px` : "";
    menu.style.visibility = anchor.bottom <= Math.max(top, scrollBounds?.top ?? 0)
      || anchor.top >= Math.min(bottom, scrollBounds?.bottom ?? bottom) ? "hidden" : "";
  };

  const close = () => {
    if (!listeners) return;
    listeners.abort();
    listeners = null;
    menu.hidePopover();
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  };
  const finish = (next: string | null, destination: "code" | "below" | null) => {
    if (finished || !footer.isConnected) return;
    finished = true;
    close();
    input.value = next === null ? initialText : matchCodeLanguage(next)?.label ?? next;
    languageMark(badge, matchCodeLanguage(input.value)?.id ?? (input.value || "plaintext"));
    onFinish(next, destination);
  };
  const activate = (index: number) => {
    menu.children[active]?.setAttribute("aria-selected", "false");
    active = index;
    const option = menu.children[index];
    if (option) {
      option.setAttribute("aria-selected", "true");
      input.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  };
  const render = (query: string) => {
    options = suggestCodeLanguages(query, codeLanguages.length);
    menu.replaceChildren(...options.map(language => {
      const option = codeLanguageOption(language, current === language.id);
      option.id = `${menu.id}-${language.id}`;
      option.setAttribute("aria-selected", "false");
      option.addEventListener("click", () => finish(language.id, "code"));
      return option;
    }));
    if (!options.length) {
      const empty = document.createElement("div");
      empty.className = "notes-code-language-empty";
      empty.setAttribute("role", "status");
      empty.textContent = "没有匹配的语言";
      menu.append(empty);
    }
    active = -1;
    navigating = false;
    const selected = query ? 0 : options.findIndex(language => language.id === current);
    activate(options.length ? Math.max(0, selected) : -1);
  };
  const open = (query = "") => {
    if (listeners) return;
    listeners = new AbortController();
    const { signal } = listeners;
    input.setAttribute("aria-expanded", "true");
    menu.showPopover();
    place();
    render(query);
    window.addEventListener("resize", place, { signal });
    document.addEventListener("scroll", place, { capture: true, passive: true, signal });
  };

  menu.addEventListener("mousedown", event => {
    if (event.target instanceof Element && event.target.closest("[role=option]")) event.preventDefault();
  });
  control.addEventListener("mousedown", event => {
    if (event.button === 0 && document.activeElement !== input) onPreview(value);
  });
  input.addEventListener("focus", () => {
    finished = false;
    onPreview(value);
    if (openOnFocus) open();
    input.select();
  });
  input.addEventListener("click", () => open());
  input.addEventListener("input", () => {
    const next = matchCodeLanguage(input.value)?.id;
    if (next || !input.value.trim()) {
      languageMark(badge, next ?? "plaintext");
      onPreview(next ?? "");
    }
    if (listeners) render(input.value);
    else open(input.value);
  });
  input.addEventListener("blur", () => finish(input.value === initialText ? null : codeLanguageId(input.value), null));
  input.addEventListener("keydown", event => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    const { key } = event;
    const arrow = !event.shiftKey && (key === "ArrowDown" || key === "ArrowUp");
    if (!arrow && key !== "Enter" && key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (key === "Escape") {
      finish(null, "code");
    } else if (!listeners) {
      if (key === "Enter") open();
      else finish(null, key === "ArrowDown" ? "below" : "code");
    } else if (key === "Enter") {
      const typed = input.value !== initialText && input.value.trim().length > 0;
      const selected = navigating || typed ? options[active] : undefined;
      const next = selected?.id ?? (input.value === initialText ? null : codeLanguageId(input.value));
      finish(next, "code");
    } else if (options.length) {
      navigating = true;
      const step = key === "ArrowDown" ? 1 : -1;
      activate((active + step + options.length) % options.length);
    }
  });
  const focusForNavigation = () => {
    openOnFocus = false;
    input.focus();
    openOnFocus = true;
  };
  return { footer, dispose: close, focusForNavigation };
}
