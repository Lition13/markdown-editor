import {
  inspectMarkdown, MarkdownEditor, readMarkdownShortcutOverrides,
  type MarkdownEditorHandle, type MarkdownLocale, type MarkdownMode, type MarkdownOutlineItem, type MarkdownShortcutOverrides, type MarkdownTheme,
} from "@lition13/markdown-editor";
import { CodeXml, FileText, FolderOpen, Github, Keyboard, ListTree, Maximize2, Moon, Palette, PanelBottom, PencilLine, Sun, X } from "lucide-react";
import { StrictMode, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@lition13/markdown-editor/style.css";
import FileManager from "./FileManager";
import LanguageMenu from "./LanguageMenu";
import { defaultWebLocale, formatDocumentCount, useWebLocale, useWebText, WebLocale, webTranslator } from "./locale";
import ShortcutSettings from "./ShortcutSettings";
import SidePanel from "./SidePanel";
import ThemeSettings from "./ThemeSettings";
import { readThemePreference, themeVariables, validateThemeName, type CustomTheme, type ThemePreference } from "./themes";
import { useFileLibrary } from "./useFileLibrary";
import "./site.css";

const themeKey = "lition13-markdown-editor-theme";
const localeKey = "lition13-markdown-editor-locale";
const statusKey = "lition13-markdown-editor-status-bar";
const filesKey = "lition13-markdown-editor-file-panel";
const outlineKey = "lition13-markdown-editor-outline-panel";
const drawerKey = "lition13-markdown-editor-drawer";
const toolbarKey = "lition13-markdown-editor-toolbar";
const shortcutsKey = "lition13-markdown-editor-shortcuts";
const repository = "https://github.com/Lition13/markdown-editor";
const compactQuery = "(max-width: 840px)";

function preference(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function useVisibility(key: string) {
  const [visible, setVisible] = useState(() => preference(key) === "visible");
  useLayoutEffect(() => {
    savePreference(key, visible ? "visible" : "hidden");
  }, [key, visible]);
  return [visible, setVisible] as const;
}

function readTheme(): ThemePreference {
  const fallback = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return readThemePreference(preference(themeKey), fallback);
}

function readShortcuts(): MarkdownShortcutOverrides {
  try { return readMarkdownShortcutOverrides(JSON.parse(preference(shortcutsKey) ?? "null")); } catch { return {}; }
}

function useCompactLayout() {
  const [compact, setCompact] = useState(() => matchMedia(compactQuery).matches);
  useEffect(() => {
    const media = matchMedia(compactQuery);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}

function Toolbar({ children, onLocaleChange }: { children: ReactNode; onLocaleChange: (locale: MarkdownLocale) => void }) {
  const t = useWebText();
  const [hovered, setHovered] = useState(false);
  const [held, setHeld] = useVisibility(toolbarKey);
  const [keyboard, setKeyboard] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const handle = useRef<HTMLButtonElement>(null);
  const visible = hovered || held || keyboard || languageOpen;

  function revealFromPointer(event: PointerEvent<HTMLElement>) {
    if (!hovered && event.pointerType !== "touch") setHovered(true);
  }

  return (
    <header className="app-header" data-visible={visible} data-pinned={held}
      onPointerMove={revealFromPointer}
      onPointerLeave={() => setHovered(false)}
      onPointerDownCapture={() => setKeyboard(false)}
      onFocusCapture={event => {
        if (event.target !== handle.current && event.target.matches(":focus-visible")) setKeyboard(true);
      }}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setKeyboard(false); }}
      onKeyDown={event => {
        if (event.key !== "Escape" || !visible) return;
        setHeld(false);
        setHovered(false);
        setKeyboard(false);
        handle.current?.focus({ preventScroll: true });
      }}>
      <button ref={handle} type="button" className="toolbar-handle" aria-label={t("顶部工具栏")}
        aria-controls="workbench-toolbar" aria-expanded={visible} aria-pressed={held}
        title={held ? t("取消固定顶部工具栏") : t("固定顶部工具栏")} onClick={() => setHeld(value => !value)}>
        <span aria-hidden="true" className="toolbar-grip" />
        <span aria-hidden="true" className="toolbar-handle-label">{t("工具栏")}</span>
      </button>
      <div className="workbench-toolbar" id="workbench-toolbar" aria-label={t("工具栏")} hidden={!visible}>
        {children}
        <LanguageMenu open={languageOpen} onOpenChange={setLanguageOpen} onChange={onLocaleChange} />
        <a className="icon-control github" href={repository} target="_blank" rel="noreferrer" aria-label={t("GitHub 源码")} title={t("GitHub 源码")}>
          <Github size={18} aria-hidden="true" />
        </a>
      </div>
    </header>
  );
}

function Workspace({
  library, theme, customThemeActive, toggleTheme, showThemeSettings, compact, filesOpen, outlineOpen, statusOpen, showFiles,
  toggleFiles, toggleOutline, closeOutline, toggleStatus, shortcuts, showShortcuts, onLocaleChange,
}: {
  library: ReturnType<typeof useFileLibrary>;
  theme: MarkdownTheme;
  customThemeActive: boolean;
  toggleTheme: () => void;
  showThemeSettings: () => void;
  compact: boolean;
  filesOpen: boolean;
  outlineOpen: boolean;
  statusOpen: boolean;
  showFiles: () => void;
  toggleFiles: () => void;
  toggleOutline: () => void;
  closeOutline: () => void;
  toggleStatus: () => void;
  shortcuts: MarkdownShortcutOverrides;
  showShortcuts: () => void;
  onLocaleChange: (locale: MarkdownLocale) => void;
}) {
  const locale = useWebLocale();
  const t = webTranslator(locale);
  const editor = useRef<MarkdownEditorHandle>(null);
  const footer = useRef<HTMLElement>(null);
  const { current, ready, status, change } = library;
  const documentId = current?.id;
  const [view, setView] = useState<{ documentId: string | undefined; mode: MarkdownMode; headingOffset?: number }>({ documentId, mode: "live" });
  if (view.documentId !== documentId) setView({ documentId, mode: "live" });
  const { mode, headingOffset } = view;
  const value = current?.value ?? "";
  const inspect = outlineOpen || statusOpen;
  const information = useMemo(() => inspect ? inspectMarkdown(value, locale) : null, [inspect, value, locale]);
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [documentId]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const bar = statusOpen ? footer.current : null;
    if (!bar) {
      root.style.removeProperty("--status-space");
      return;
    }
    const measure = () => root.style.setProperty("--status-space", bar.offsetHeight + "px");
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--status-space");
    };
  }, [statusOpen]);

  function setMode(mode: MarkdownMode) {
    setView(previous => ({ ...previous, mode }));
  }

  function jump(heading: MarkdownOutlineItem) {
    setView(previous => ({ ...previous, headingOffset: heading.offset }));
    if (compact) {
      closeOutline();
      requestAnimationFrame(() => editor.current?.focusAt(heading.offset));
    } else {
      editor.current?.focusAt(heading.offset);
    }
  }

  const headings = information?.headings ?? [];
  const shallowest = headings.reduce((level, heading) => Math.min(level, heading.depth), 6);
  const activeHeading = headings.find(heading => heading.offset === headingOffset) ?? headings[0];

  return (
    <>
      <Toolbar onLocaleChange={onLocaleChange}>
        <button type="button" className="button panel-toggle" aria-label={t("文件管理")} title={t("文件管理")}
          aria-haspopup={compact ? "dialog" : undefined} aria-controls="file-manager" aria-expanded={filesOpen}
          disabled={!ready} onClick={toggleFiles}>
          <FolderOpen size={16} aria-hidden="true" /><span className="tool-label">{t("文件")}</span>
        </button>
        <span className="document-name" title={current?.name}>{current?.name}</span>
        {current && (
          <>
            <div className="view-options" role="group" aria-label={t("文档视图")}>
              <button type="button" aria-label={t("编辑")} title={t("编辑")} aria-pressed={mode === "live"} onClick={() => setMode("live")}>
                <PencilLine size={16} aria-hidden="true" />
              </button>
              <button type="button" aria-label={t("源码")} title={t("源码")} aria-pressed={mode === "source"} onClick={() => setMode("source")}>
                <CodeXml size={16} aria-hidden="true" />
              </button>
            </div>
            <button type="button" className="icon-control" aria-label={t("全屏编辑")} title={t("全屏编辑")} aria-haspopup="dialog"
              onClick={() => editor.current?.openFullscreen()}>
              <Maximize2 size={17} aria-hidden="true" />
            </button>
          </>
        )}
        <button type="button" className="button icon-control panel-toggle" aria-label={t("文档大纲")} title={t("文档大纲")}
          aria-haspopup={compact ? "dialog" : undefined} aria-controls="document-outline" aria-expanded={outlineOpen}
          onClick={toggleOutline}>
          <ListTree size={16} aria-hidden="true" />
        </button>
        <button type="button" className="button icon-control panel-toggle" aria-label={t("状态栏")}
          title={statusOpen ? t("隐藏状态栏") : t("显示状态栏")} aria-controls="workspace-status" aria-pressed={statusOpen}
          onClick={toggleStatus}>
          <PanelBottom size={16} aria-hidden="true" />
        </button>
        <button type="button" className="icon-control" aria-label={t("快捷键设置")} title={t("快捷键设置")} aria-haspopup="dialog" onClick={showShortcuts}>
          <Keyboard size={18} aria-hidden="true" />
        </button>
        <button type="button" className="icon-control" aria-label={theme === "dark" ? t("切换浅色主题") : t("切换深色主题")}
          title={theme === "dark" ? t("切换浅色主题") : t("切换深色主题")} onClick={toggleTheme}>
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button type="button" className="icon-control theme-control" aria-label={t("自定义主题")} title={t("自定义主题")}
          aria-controls="theme-settings" aria-haspopup="dialog" data-active={customThemeActive} onClick={showThemeSettings}>
          <Palette size={18} aria-hidden="true" />
        </button>
      </Toolbar>
      <main className="workspace" aria-busy={!ready || undefined}>
        {current ? (
          <div className="workspace-body">
            <MarkdownEditor
              key={current.id}
              ref={editor}
              theme={theme}
              locale={locale}
              mode={mode}
              onModeChange={setMode}
              shortcuts={shortcuts}
              value={current.value}
              onChange={value => change(current.id, value)}
            />
          </div>
        ) : ready && (
          <div className="workspace-body workspace-empty">
            <FileText size={30} aria-hidden="true" />
            <h2>{t("暂无 Markdown 文件")}</h2>
            <button type="button" className="button primary" onClick={showFiles}>{t("新建或导入")}</button>
          </div>
        )}
      </main>
      <SidePanel id="document-outline" title={t("文档大纲")} className="document-outline"
        open={outlineOpen} compact={compact} onDismiss={closeOutline}>
        <div className="file-manager-heading">
          <h2 id="document-outline-title"><ListTree size={16} aria-hidden="true" />{t("文档大纲")}</h2>
          <button type="button" className="icon-control" aria-label={t("关闭文档大纲")} onClick={closeOutline}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        {headings.length ? (
          <nav className="outline-links" aria-label={t("章节")}>
            {headings.map(heading => (
              <button key={heading.offset} type="button" title={heading.title}
                style={{ paddingInlineStart: 10 + (heading.depth - shallowest) * 8 }}
                aria-current={heading === activeHeading ? "location" : undefined} onClick={() => jump(heading)}>
                {heading.title}
              </button>
            ))}
          </nav>
        ) : (
          <p className="outline-empty">{t("暂无 Markdown 标题")}</p>
        )}
      </SidePanel>
      <footer ref={footer} id="workspace-status" className="workspace-footer" aria-label={t("状态栏")} hidden={!statusOpen}>
          <span role="status" className="save-status">{t(status)}</span>
          {current && information && (
            <span className="document-statistics" role="group" aria-label={t("文档统计")}
              title={t("按正文统计字词，行数按 Markdown 源码计算")}>
              <span>{formatDocumentCount(information.words, "words", locale)}</span>
              <span>{formatDocumentCount(information.lines, "lines", locale)}</span>
            </span>
          )}
      </footer>
      {!statusOpen && <span role="status" className="visually-hidden">{t(status)}</span>}
    </>
  );
}

function App() {
  const [preferredLocale, setPreferredLocale] = useState<MarkdownLocale | null>(() => {
    const saved = preference(localeKey);
    return saved === "en" || saved === "zh-CN" ? saved : null;
  });
  const locale = preferredLocale ?? defaultWebLocale;
  const library = useFileLibrary(preferredLocale);
  const t = webTranslator(locale);
  const [appearance, setAppearance] = useState(readTheme);
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);
  const selectedTheme = appearance.themes.find(theme => theme.id === appearance.customId);
  const customTheme = appearance.active === "custom" ? selectedTheme : undefined;
  const theme = customTheme?.base ?? (appearance.active === "dark" ? "dark" : "light");
  const compact = useCompactLayout();
  const [filesVisible, setFilesVisible] = useVisibility(filesKey);
  const [outlineVisible, setOutlineVisible] = useVisibility(outlineKey);
  const [statusOpen, setStatusOpen] = useVisibility(statusKey);
  const [shortcuts, setShortcuts] = useState(readShortcuts);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shortcutStorageFailed, setShortcutStorageFailed] = useState(false);
  const [drawer, setDrawer] = useState(() => {
    const value = preference(drawerKey);
    return value === "files" || value === "outline" ? value : null;
  });
  const filesOpen = compact ? drawer === "files" : filesVisible;
  const outlineOpen = compact ? drawer === "outline" : outlineVisible;

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.title = t("Markdown 编辑器");
    document.querySelector('meta[name="description"]')?.setAttribute("content",
      t("在浏览器里实时编辑 Markdown，用文件夹整理文档，从大纲跳转到章节，导出 Markdown 文件。"));
  }, [locale, t]);

  function changeLocale(next: MarkdownLocale) {
    setPreferredLocale(next);
    savePreference(localeKey, next);
  }

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.themeChoice = appearance.active;
    if (!customTheme) return;
    const variables = Object.entries(themeVariables(customTheme));
    for (const [name, value] of variables) root.style.setProperty(name, value);
    return () => {
      for (const [name] of variables) root.style.removeProperty(name);
    };
  }, [appearance.active, customTheme, theme]);
  useEffect(() => {
    function syncTheme(event: StorageEvent) {
      if (event.key === themeKey || event.key === null) setAppearance(readTheme());
    }
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);
  useLayoutEffect(() => {
    savePreference(drawerKey, drawer ?? "closed");
  }, [drawer]);

  function showFiles() {
    if (compact) setDrawer("files");
    else setFilesVisible(true);
  }
  function closeFiles() {
    if (compact) setDrawer(null);
    else setFilesVisible(false);
  }
  function closeOutline() {
    if (compact) setDrawer(null);
    else setOutlineVisible(false);
  }

  function toggleTheme() {
    const active = theme === "dark" ? "light" : "dark";
    const next: ThemePreference = { ...readTheme(), active };
    setAppearance(next);
    savePreference(themeKey, next.themes.length ? JSON.stringify(next) : active);
  }

  function saveCustomTheme(theme: CustomTheme, existingId: string) {
    const { themes } = readTheme();
    const nameError = validateThemeName(theme.name, existingId, themes, t);
    if (nameError) return nameError;
    const saved = { ...theme, name: theme.name.trim(), id: existingId || crypto.randomUUID() };
    const at = themes.findIndex(theme => theme.id === saved.id);
    if (at === -1) themes.push(saved);
    else themes[at] = saved;
    const next: ThemePreference = { active: "custom", customId: saved.id, themes };
    if (!savePreference(themeKey, JSON.stringify(next))) return t("当前浏览器无法保存主题设置。");
    setAppearance(next);
  }

  function updateShortcuts(next: MarkdownShortcutOverrides) {
    setShortcuts(next);
    try {
      localStorage.setItem(shortcutsKey, JSON.stringify(next));
      setShortcutStorageFailed(false);
    } catch {
      setShortcutStorageFailed(true);
    }
  }

  return <WebLocale.Provider value={locale}>
    <div className="workbench" data-files={!compact && filesOpen} data-outline={!compact && outlineOpen}>
      <Workspace library={library} theme={theme}
        customThemeActive={!!customTheme} showThemeSettings={() => setThemeSettingsOpen(true)}
        compact={compact} filesOpen={filesOpen} outlineOpen={outlineOpen} statusOpen={statusOpen} showFiles={showFiles}
        shortcuts={shortcuts} showShortcuts={() => setShortcutsOpen(true)}
        toggleTheme={toggleTheme}
        toggleFiles={filesOpen ? closeFiles : showFiles}
        toggleOutline={outlineOpen ? closeOutline : () => { if (compact) setDrawer("outline"); else setOutlineVisible(true); }}
        closeOutline={closeOutline} toggleStatus={() => setStatusOpen(value => !value)} onLocaleChange={changeLocale} />
      <FileManager library={library} open={filesOpen} compact={compact} onClose={closeFiles} />
      {shortcutsOpen && <ShortcutSettings value={shortcuts} onChange={updateShortcuts} onClose={() => setShortcutsOpen(false)}
        storageFailed={shortcutStorageFailed} />}
      {themeSettingsOpen && <ThemeSettings base={theme} themes={appearance.themes} selected={selectedTheme}
        onSave={saveCustomTheme} onClose={() => setThemeSettingsOpen(false)} />}
    </div>
  </WebLocale.Provider>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
