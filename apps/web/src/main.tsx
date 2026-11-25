import { inspectMarkdown, MarkdownEditor, type MarkdownEditorHandle, type MarkdownMode, type MarkdownOutlineItem, type MarkdownTheme } from "@lition13/markdown-editor";
import { CodeXml, FileText, FolderOpen, Github, ListTree, Moon, PanelBottom, PencilLine, Sun, X } from "lucide-react";
import { StrictMode, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@lition13/markdown-editor/style.css";
import FileManager from "./FileManager";
import SidePanel from "./SidePanel";
import { useFileLibrary } from "./useFileLibrary";
import "./site.css";

const themeKey = "lition13-markdown-editor-theme";
const statusKey = "lition13-markdown-editor-status-bar";
const repository = "https://github.com/Lition13/markdown-editor";
const compactQuery = "(max-width: 840px)";

function preference(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readTheme(): MarkdownTheme {
  const theme = preference(themeKey);
  if (theme === "dark" || theme === "light") return theme;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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

function Toolbar({ children }: { children: ReactNode }) {
  const [hovered, setHovered] = useState(false);
  const [held, setHeld] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const handle = useRef<HTMLButtonElement>(null);
  const visible = hovered || held || keyboard;

  function revealFromPointer(event: PointerEvent<HTMLElement>) {
    if (!hovered && event.pointerType !== "touch") setHovered(true);
  }

  return (
    <header className="app-header" data-visible={visible}
      onPointerEnter={revealFromPointer}
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
      <button ref={handle} type="button" className="toolbar-handle" aria-label="顶部工具栏"
        aria-controls="workbench-toolbar" aria-expanded={visible} onClick={() => setHeld(value => !value)}>
        <span aria-hidden="true" className="toolbar-grip" />
        <span aria-hidden="true" className="toolbar-handle-label">工具栏</span>
      </button>
      <div className="workbench-toolbar" id="workbench-toolbar" aria-label="工具栏" hidden={!visible}>
        {children}
      </div>
    </header>
  );
}

function Workspace({
  library, theme, toggleTheme, compact, filesOpen, outlineOpen, statusOpen, showFiles,
  toggleFiles, toggleOutline, closeOutline, toggleStatus,
}: {
  library: ReturnType<typeof useFileLibrary>;
  theme: MarkdownTheme;
  toggleTheme: () => void;
  compact: boolean;
  filesOpen: boolean;
  outlineOpen: boolean;
  statusOpen: boolean;
  showFiles: () => void;
  toggleFiles: () => void;
  toggleOutline: () => void;
  closeOutline: () => void;
  toggleStatus: () => void;
}) {
  const [mode, setMode] = useState<MarkdownMode>("live");
  const [chosenHeading, setChosenHeading] = useState<number>();
  const editor = useRef<MarkdownEditorHandle>(null);
  const footer = useRef<HTMLElement>(null);
  const { current, ready, status, change } = library;
  const value = current?.value ?? "";
  const inspect = outlineOpen || statusOpen;
  const information = useMemo(() => inspect ? inspectMarkdown(value) : null, [inspect, value]);
  useLayoutEffect(() => { window.scrollTo(0, 0); }, []);
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

  function jump(heading: MarkdownOutlineItem) {
    setChosenHeading(heading.offset);
    if (compact) {
      closeOutline();
      requestAnimationFrame(() => editor.current?.focusAt(heading.offset));
    } else {
      editor.current?.focusAt(heading.offset);
    }
  }

  const headings = information?.headings ?? [];
  const shallowest = headings.reduce((level, heading) => Math.min(level, heading.depth), 6);
  const activeHeading = headings.find(heading => heading.offset === chosenHeading) ?? headings[0];

  return (
    <>
      <Toolbar>
        <button type="button" className="button panel-toggle" aria-label="文件管理" title="文件管理"
          aria-haspopup={compact ? "dialog" : undefined} aria-controls="file-manager" aria-expanded={filesOpen}
          disabled={!ready} onClick={toggleFiles}>
          <FolderOpen size={16} aria-hidden="true" /><span className="tool-label">文件</span>
        </button>
        <span className="document-name" title={current?.name}>{current?.name}</span>
        {current && (
          <div className="view-options" role="group" aria-label="文档视图">
            <button type="button" aria-pressed={mode === "live"} onClick={() => setMode("live")}><PencilLine size={15} aria-hidden="true" />编辑</button>
            <button type="button" aria-pressed={mode === "source"} onClick={() => setMode("source")}><CodeXml size={16} aria-hidden="true" />源码</button>
          </div>
        )}
        <button type="button" className="button panel-toggle" aria-label="文档大纲" title="文档大纲"
          aria-haspopup={compact ? "dialog" : undefined} aria-controls="document-outline" aria-expanded={outlineOpen}
          onClick={toggleOutline}>
          <ListTree size={16} aria-hidden="true" /><span className="tool-label">大纲</span>
        </button>
        <button type="button" className="button panel-toggle" aria-label="状态栏"
          title={statusOpen ? "隐藏状态栏" : "显示状态栏"} aria-controls="workspace-status" aria-pressed={statusOpen}
          onClick={toggleStatus}>
          <PanelBottom size={16} aria-hidden="true" /><span className="tool-label">状态栏</span>
        </button>
        <button type="button" className="icon-control" aria-label={theme === "dark" ? "切换浅色主题" : "切换深色主题"}
          title={theme === "dark" ? "切换浅色主题" : "切换深色主题"} onClick={toggleTheme}>
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <a className="icon-control github" href={repository} target="_blank" rel="noreferrer" aria-label="GitHub 源码" title="GitHub 源码">
          <Github size={18} />
        </a>
      </Toolbar>
      <main className="workspace" aria-busy={!ready || undefined}>
        {current ? (
          <div className="workspace-body">
            <MarkdownEditor
              ref={editor}
              theme={theme}
              mode={mode}
              onModeChange={setMode}
              value={current.value}
              onChange={value => change(current.id, value)}
            />
          </div>
        ) : ready && (
          <div className="workspace-body workspace-empty">
            <FileText size={30} aria-hidden="true" />
            <h2>暂无 Markdown 文件</h2>
            <button type="button" className="button primary" onClick={showFiles}>新建或导入</button>
          </div>
        )}
      </main>
      <SidePanel id="document-outline" title="文档大纲" className="document-outline"
        open={outlineOpen} compact={compact} onDismiss={closeOutline}>
        <div className="file-manager-heading">
          <h2 id="document-outline-title"><ListTree size={16} aria-hidden="true" />文档大纲</h2>
          <button type="button" className="icon-control" aria-label="关闭文档大纲" onClick={closeOutline}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        {headings.length ? (
          <nav className="outline-links" aria-label="章节">
            {headings.map(heading => (
              <button key={heading.offset} type="button" title={heading.title}
                style={{ paddingInlineStart: 10 + (heading.depth - shallowest) * 8 }}
                aria-current={heading === activeHeading ? "location" : undefined} onClick={() => jump(heading)}>
                {heading.title}
              </button>
            ))}
          </nav>
        ) : (
          <p className="outline-empty">暂无 Markdown 标题</p>
        )}
      </SidePanel>
      <footer ref={footer} id="workspace-status" className="workspace-footer" aria-label="状态栏" hidden={!statusOpen}>
          <span role="status" className="save-status">{status}</span>
          {current && information && (
            <span className="document-statistics" role="group" aria-label="文档统计"
              title="按正文统计字词，行数按 Markdown 源码计算">
              <span>{information.words.toLocaleString("zh-CN")} 字词</span>
              <span>{information.lines.toLocaleString("zh-CN")} 行</span>
            </span>
          )}
      </footer>
      {!statusOpen && <span role="status" className="visually-hidden">{status}</span>}
    </>
  );
}

function App() {
  const library = useFileLibrary();
  const [theme, setTheme] = useState(readTheme);
  const compact = useCompactLayout();
  const [filesVisible, setFilesVisible] = useState(true);
  const [outlineVisible, setOutlineVisible] = useState(true);
  const [statusOpen, setStatusOpen] = useState(() => preference(statusKey) !== "hidden");
  const [drawer, setDrawer] = useState<"files" | "outline" | null>(null);
  const filesOpen = compact ? drawer === "files" : filesVisible;
  const outlineOpen = compact ? drawer === "outline" : outlineVisible;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(themeKey, theme); } catch {}
  }, [theme]);
  useEffect(() => {
    try { localStorage.setItem(statusKey, statusOpen ? "visible" : "hidden"); } catch {}
  }, [statusOpen]);
  useEffect(() => { if (!compact) setDrawer(null); }, [compact]);

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

  return (
    <div className="workbench" data-files={!compact && filesOpen} data-outline={!compact && outlineOpen}>
      <Workspace key={library.current?.id ?? "workspace"} library={library} theme={theme}
        compact={compact} filesOpen={filesOpen} outlineOpen={outlineOpen} statusOpen={statusOpen} showFiles={showFiles}
        toggleTheme={() => setTheme(value => value === "dark" ? "light" : "dark")}
        toggleFiles={filesOpen ? closeFiles : showFiles}
        toggleOutline={outlineOpen ? closeOutline : () => { if (compact) setDrawer("outline"); else setOutlineVisible(true); }}
        closeOutline={closeOutline} toggleStatus={() => setStatusOpen(value => !value)} />
      <FileManager library={library} open={filesOpen} compact={compact} onClose={closeFiles} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
