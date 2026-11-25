import { MarkdownEditor, type MarkdownTheme } from "@lition13/markdown-editor";
import { Download, FileText, FolderOpen, Github, Moon, Sun } from "lucide-react";
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@lition13/markdown-editor/style.css";
import { readDraft, writeDraft, type Draft } from "./drafts";
import { example } from "./example";
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

function downloadDraft(draft: Draft) {
  const url = URL.createObjectURL(new Blob([draft.value], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  const name = draft.name.replace(/\.(?:md|markdown|txt)$/i, "") || "未命名";
  link.href = url;
  link.download = name + ".md";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function App() {
  const [draft, setDraft] = useState(example);
  const [documentKey, setDocumentKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [opening, setOpening] = useState(false);
  const [theme, setTheme] = useState(readTheme);
  const [status, setStatus] = useState("正在读取草稿");
  const [error, setError] = useState("");
  const filePicker = useRef<HTMLInputElement>(null);
  const latestWrite = useRef(0);

  useEffect(() => {
    let active = true;
    void readDraft().then(existing => {
      if (!active) return;
      if (existing) setDraft(existing);
      setStatus(existing ? "草稿已恢复" : "示例文档");
    }).catch(() => {
      if (active) setStatus("草稿不可用，可下载文件");
    }).finally(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(themeKey, theme); } catch {}
  }, [theme]);

  function updateDraft(next: Draft) {
    setDraft(next);
    setStatus("正在保存草稿");
    const revision = ++latestWrite.current;
    void writeDraft(next).then(() => {
      if (revision === latestWrite.current) setStatus("草稿已保存");
    }).catch(() => {
      if (revision === latestWrite.current) setStatus("草稿保存失败，可下载文件");
    });
  }

  async function openFile(file: File) {
    setOpening(true);
    setError("");
    try {
      const value = await file.text();
      updateDraft({ name: file.name, value });
      setDocumentKey(key => key + 1);
    } catch {
      setError("文件读取失败，请重新选择。");
    } finally {
      setOpening(false);
    }
  }

  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <h1 className="brand">
            <span className="brand-icon"><FileText size={21} strokeWidth={1.8} /></span>
            <span>Markdown 编辑器</span>
          </h1>
          <div className="file-actions">
            <input
              type="file"
              ref={filePicker}
              hidden
              aria-label="选择 Markdown 文件"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void openFile(file);
              }}
            />
            <button type="button" className="button" disabled={!ready || opening} onClick={() => filePicker.current?.click()}>
              <FolderOpen size={17} />
              <span>{opening ? "正在打开" : "打开文件"}</span>
            </button>
            <button type="button" className="button primary" disabled={!ready} onClick={() => downloadDraft(draft)}>
              <Download size={17} />
              <span>下载 .md</span>
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
      <main className="workspace">
        <div className="workspace-header">
          <div className="document-name"><FileText size={17} aria-hidden="true" /><span>{draft.name}</span></div>
        </div>
        {error && <p className="file-error" role="alert">{error}</p>}
        {ready ? (
          <div className="workspace-body">
            <MarkdownEditor
              key={documentKey}
              theme={theme}
              value={draft.value}
              onChange={value => updateDraft({ ...draft, value })}
            />
          </div>
        ) : <div className="workspace-body waiting">正在读取草稿…</div>}
        <footer className="workspace-footer">
          <span role="status" className="save-status">{status}</span>
          <span className="keyboard-hint"><kbd>/</kbd> 打开编辑工具</span>
        </footer>
      </main>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
