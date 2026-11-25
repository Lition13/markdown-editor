import { Download, FileText, PencilLine, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { markdownName, type FileEntry, type MarkdownFile } from "./files";
import type { useFileLibrary } from "./useFileLibrary";

type FileAction = { type: "new" } | { type: "rename" | "delete"; file: FileEntry };

function exportFile(file: MarkdownFile, panel: HTMLDialogElement) {
  const url = URL.createObjectURL(new Blob([file.value], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  const stem = file.name.replace(/\.(?:md|markdown|txt)$/i, "") || "未命名";
  link.download = stem + ".md";
  panel.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function FileManager({ dialog, library }: {
  dialog: RefObject<HTMLDialogElement | null>;
  library: ReturnType<typeof useFileLibrary>;
}) {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<FileAction | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const previousControl = useRef<HTMLButtonElement | null>(null);
  const { files, current, sessionOnly, unsavedIds } = library;
  const searchTerm = query.normalize("NFC").trim().toLowerCase();
  const matches = files.filter(file => file.name.normalize("NFC").toLowerCase().includes(searchTerm));

  useEffect(() => {
    if (!action) return;
    if (action.type === "delete") cancelButton.current?.focus();
    else {
      nameInput.current?.focus();
      nameInput.current?.select();
    }
  }, [action]);

  function begin(next: FileAction, button: HTMLButtonElement) {
    previousControl.current = button;
    setError("");
    setName(next.type === "rename" ? next.file.name : "未命名.md");
    setAction(next);
  }

  function dismissAction() {
    setAction(null);
    setError("");
    requestAnimationFrame(() => {
      const button = previousControl.current;
      (button?.isConnected ? button : search.current)?.focus();
    });
  }

  async function run(operation: () => Promise<void>, closeAfter = false) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
      if (closeAfter) dialog.current?.close();
      else dismissAction();
    } catch (error) {
      setError(error instanceof Error && !(error instanceof DOMException)
        ? error.message : "无法读取或保存文件，请重试。");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="file-manager"
      id="file-manager"
      aria-labelledby="file-manager-title"
      aria-busy={busy || undefined}
      onClose={() => {
        setAction(null);
        setError("");
        setQuery("");
      }}
      onCancel={event => {
        if (locked.current || action) event.preventDefault();
        if (action && !locked.current) dismissAction();
      }}
      onClick={event => {
        if (event.target !== event.currentTarget || locked.current) return;
        const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
        if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) {
          event.currentTarget.close();
        }
      }}
    >
      <div className="file-manager-heading">
        <h2 id="file-manager-title">文件管理</h2>
        <button className="icon-control" type="button" aria-label="关闭文件管理" disabled={busy} onClick={() => dialog.current?.close()}>
          <X size={19} aria-hidden="true" />
        </button>
      </div>
      <div className="library-controls">
        <div className="library-tools">
          <button type="button" className="button primary" disabled={busy} onClick={event => begin({ type: "new" }, event.currentTarget)}>
            <Plus size={16} aria-hidden="true" />新建
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => {
            setAction(null);
            setError("");
            fileInput.current?.click();
          }}>
            <Upload size={16} aria-hidden="true" />导入
          </button>
          <button type="button" className="button" title="导出当前文件为 .md" disabled={!current || busy}
            onClick={() => { if (current && dialog.current) exportFile(current, dialog.current); }}>
            <Download size={16} aria-hidden="true" />导出
          </button>
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            aria-label="选择 Markdown 文件"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            onChange={event => {
              const selected = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (!selected.length) return;
              void run(async () => {
                const [first, ...rest] = await Promise.all(selected.map(async file => ({
                  name: markdownName(file.name),
                  value: await file.text(),
                })));
                await library.add([first, ...rest]);
              }, true);
            }}
          />
        </div>
        <label className="file-search">
          <Search size={17} aria-hidden="true" />
          <input ref={search} type="search" placeholder="搜索文件名" aria-label="搜索文件名"
            value={query} onChange={event => setQuery(event.currentTarget.value)} />
        </label>
        {action?.type === "delete" ? (
          <div className="file-action">
            <p>删除「{action.file.name}」？</p>
            <div className="file-action-buttons">
              <button type="button" className="button" ref={cancelButton} disabled={busy} onClick={dismissAction}>取消</button>
              <button type="button" className="button danger" disabled={busy}
                onClick={() => { void run(() => library.remove(action.file.id)); }}>确认删除</button>
            </div>
          </div>
        ) : action && (
          <form className="file-action" onSubmit={event => {
            event.preventDefault();
            void run(() => action.type === "new"
              ? library.add([{ name: markdownName(name), value: "" }])
              : library.rename(action.file.id, name), action.type === "new");
          }}>
            <label htmlFor="library-file-name">{action.type === "new" ? "新建文件名" : "新文件名"}</label>
            <input id="library-file-name" type="text" ref={nameInput} value={name} required
              onChange={event => setName(event.currentTarget.value)} />
            <div className="file-action-buttons">
              <button type="button" className="button" disabled={busy} onClick={dismissAction}>取消</button>
              <button type="submit" className="button primary" disabled={busy}>{action.type === "new" ? "创建" : "保存"}</button>
            </div>
          </form>
        )}
        {error && <p className="library-error" role="alert">{error}</p>}
      </div>
      {matches.length ? (
        <ul className="library-files" aria-label="Markdown 文件">
          {matches.map(file => (
            <li key={file.id} className={current?.id === file.id ? "is-current" : undefined}>
              <button type="button" className="file-open" aria-current={current?.id === file.id ? "true" : undefined}
                title={file.name} disabled={busy} onClick={() => { void run(() => library.open(file.id), true); }}>
                <FileText size={18} aria-hidden="true" />
                <span className="file-list-name">{file.name}</span>
                {unsavedIds.includes(file.id) && <span className="file-unsaved">未保存</span>}
              </button>
              <button type="button" className="icon-control file-row-tool" title="重命名" aria-label={"重命名 " + file.name}
                disabled={busy} onClick={event => begin({ type: "rename", file }, event.currentTarget)}>
                <PencilLine size={16} aria-hidden="true" />
              </button>
              <button type="button" className="icon-control file-row-tool remove-file" title="删除" aria-label={"删除 " + file.name}
                disabled={busy} onClick={event => begin({ type: "delete", file }, event.currentTarget)}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="library-empty">
          {searchTerm ? "没有匹配的文件" : "还没有文件。可新建一篇或导入 Markdown 文件。"}
        </p>
      )}
      <div className="library-footer">
        {sessionOnly ? "浏览器存储不可用，关闭页面前可导出文件" : "文件保存在此浏览器"}
      </div>
    </dialog>
  );
}
