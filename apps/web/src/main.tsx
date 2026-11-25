import { MarkdownEditor, type MarkdownMode, type MarkdownTheme } from "@lition13/markdown-editor";
import { CodeXml, FileText, FolderOpen, Github, Moon, PencilLine, Sun } from "lucide-react";
import { StrictMode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@lition13/markdown-editor/style.css";
import FileManager from "./FileManager";
import { useFileLibrary } from "./useFileLibrary";
import "./site.css";

const themeKey = "lition13-markdown-editor-theme";
const repository = "https://github.com/Lition13/markdown-editor";

function readTheme(): MarkdownTheme {
  try {
    const preference = localStorage.getItem(themeKey);
    if (preference === "dark" || preference === "light") return preference;
  } catch {
    // The OS preference works with browser storage disabled.
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function Workspace({ library, theme, showFiles }: {
  library: ReturnType<typeof useFileLibrary>;
  theme: MarkdownTheme;
  showFiles: () => void;
}) {
  const [mode, setMode] = useState<MarkdownMode>("live");
  const { current, ready, status, change } = library;
  useLayoutEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <main className="workspace" aria-busy={!ready || undefined}>
      {current && (
        <>
          <div className="workspace-header">
            <div className="document-name">
              <FileText size={17} aria-hidden="true" /><span title={current.name}>{current.name}</span>
            </div>
            <div className="view-options" role="group" aria-label="文档视图">
              <button type="button" aria-pressed={mode === "live"} onClick={() => setMode("live")}><PencilLine size={15} aria-hidden="true" />编辑</button>
              <button type="button" aria-pressed={mode === "source"} onClick={() => setMode("source")}><CodeXml size={16} aria-hidden="true" />源码</button>
            </div>
          </div>
          <div className="workspace-body">
            <MarkdownEditor
              theme={theme}
              mode={mode}
              onModeChange={setMode}
              value={current.value}
              onChange={value => change(current.id, value)}
            />
          </div>
        </>
      )}
      {ready && !current && (
        <div className="workspace-body workspace-empty">
          <FileText size={30} aria-hidden="true" />
          <h2>暂无 Markdown 文件</h2>
          <button type="button" className="button primary" onClick={showFiles}>新建或导入</button>
        </div>
      )}
      <footer className="workspace-footer">
        <span role="status" className="save-status">{status}</span>
        {current && <span className="keyboard-hint"><kbd>/</kbd> 打开编辑工具</span>}
      </footer>
    </main>
  );
}

function App() {
  const library = useFileLibrary();
  const [theme, setTheme] = useState(readTheme);
  const fileManager = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(themeKey, theme); } catch {}
  }, [theme]);

  function showFiles() {
    const dialog = fileManager.current;
    if (dialog && !dialog.open) dialog.showModal();
  }

  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <h1 className="brand">
            <span className="brand-icon"><FileText size={21} strokeWidth={1.8} /></span>
            <span>Markdown 编辑器</span>
          </h1>
          <div className="header-actions">
            <button type="button" className="button" aria-haspopup="dialog" aria-controls="file-manager"
              disabled={!library.ready} onClick={showFiles}>
              <FolderOpen size={17} aria-hidden="true" />文件管理
            </button>
            <button
              type="button"
              className="icon-control"
              aria-label={theme === "dark" ? "切换浅色主题" : "切换深色主题"}
              title={theme === "dark" ? "切换浅色主题" : "切换深色主题"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <a className="icon-control github" href={repository} target="_blank" rel="noreferrer" aria-label="GitHub 源码" title="GitHub 源码">
              <Github size={19} />
            </a>
          </div>
        </div>
      </header>
      <Workspace key={library.current?.id ?? "workspace"} library={library} theme={theme} showFiles={showFiles} />
      <FileManager dialog={fileManager} library={library} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
