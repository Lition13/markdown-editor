import { ChevronRight, Download, FileText, Folder, FolderInput, FolderPlus, PencilLine, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import SidePanel from "./SidePanel";
import { markdownName, type FileEntry, type FolderEntry, type MarkdownFile } from "./files";
import type { useFileLibrary } from "./useFileLibrary";

type FileAction =
  | { type: "new" }
  | { type: "new-folder" }
  | { type: "rename"; file: FileEntry }
  | { type: "delete"; file: FileEntry }
  | { type: "move"; file: FileEntry }
  | { type: "rename-folder"; folder: FolderEntry }
  | { type: "delete-folder"; folder: FolderEntry };

function exportFile(file: MarkdownFile, panel: HTMLElement) {
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

function folderPath(folders: Map<string, FolderEntry>, id: string | null) {
  const path: FolderEntry[] = [];
  let current = id === null ? undefined : folders.get(id);
  while (current) {
    path.unshift(current);
    current = current.parentId === null ? undefined : folders.get(current.parentId);
  }
  return path;
}

export default function FileManager({ library, open, compact, onClose }: {
  library: ReturnType<typeof useFileLibrary>;
  open: boolean;
  compact: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<FileAction | null>(null);
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const folderSelect = useRef<HTMLSelectElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const previousControl = useRef<HTMLButtonElement | null>(null);
  const { files, folders, current, sessionOnly, unsavedIds } = library;
  const foldersById = new Map(folders.map(folder => [folder.id, folder]));
  const currentFolder = folderId && foldersById.has(folderId) ? folderId : null;
  const path = folderPath(foldersById, currentFolder);
  const searchTerm = query.normalize("NFC").trim().toLowerCase();
  const matches = files.filter(file => searchTerm
    ? file.name.normalize("NFC").toLowerCase().includes(searchTerm)
    : (file.folderId ?? null) === currentFolder);
  const childFolders = searchTerm ? [] : folders.filter(folder => folder.parentId === currentFolder);

  useEffect(() => { setFolderId(current?.folderId ?? null); }, [current?.id, current?.folderId]);
  useEffect(() => {
    if (open) return;
    setAction(null);
    setError("");
    setQuery("");
  }, [open]);

  useEffect(() => {
    if (!action) return;
    if (action.type === "delete" || action.type === "delete-folder") cancelButton.current?.focus();
    else if (action.type === "move") folderSelect.current?.focus();
    else {
      nameInput.current?.focus();
      nameInput.current?.select();
    }
  }, [action]);

  function begin(next: FileAction, button: HTMLButtonElement) {
    previousControl.current = button;
    setError("");
    if (next.type === "move") setDestination(next.file.folderId ?? "");
    if (next.type === "rename") setName(next.file.name);
    if (next.type === "rename-folder") setName(next.folder.name);
    if (next.type === "new") setName("未命名.md");
    if (next.type === "new-folder") setName("新建文件夹");
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

  function visitFolder(next: string | null) {
    setFolderId(next);
    setQuery("");
    setAction(null);
    setError("");
  }

  function dismissPanel() {
    if (locked.current) return;
    if (action) dismissAction();
    else onClose();
  }

  async function run(operation: () => Promise<void>, activate = false) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
      if (activate) {
        setAction(null);
        if (compact) onClose();
      } else dismissAction();
    } catch (error) {
      setError(error instanceof Error && !(error instanceof DOMException)
        ? error.message : "无法读取或保存文件，请重试。");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  const deleting = action?.type === "delete" || action?.type === "delete-folder";
  const creating = action?.type === "new" || action?.type === "new-folder";

  return (
    <SidePanel id="file-manager" title="文件管理" className="file-manager" open={open} compact={compact} onDismiss={dismissPanel}>
      <div className="file-manager-heading">
        <h2 id="file-manager-title">文件管理</h2>
        <button className="icon-control" type="button" aria-label="关闭文件管理" disabled={busy} onClick={onClose}>
          <X size={19} aria-hidden="true" />
        </button>
      </div>
      <div className="library-controls" aria-busy={busy || undefined}>
        <div className="library-tools">
          <button type="button" className="button primary" disabled={busy || !library.ready} onClick={event => begin({ type: "new" }, event.currentTarget)}>
            <Plus size={16} aria-hidden="true" />新建
          </button>
          <button type="button" className="button" disabled={busy || !library.ready} onClick={event => begin({ type: "new-folder" }, event.currentTarget)}>
            <FolderPlus size={16} aria-hidden="true" />新建文件夹
          </button>
          <button type="button" className="button" disabled={busy || !library.ready} onClick={() => {
            setAction(null);
            setError("");
            fileInput.current?.click();
          }}>
            <Upload size={16} aria-hidden="true" />导入
          </button>
          <button type="button" className="button" title="导出当前文件为 .md" disabled={!current || busy}
            onClick={event => {
              const panel = event.currentTarget.closest<HTMLElement>(".file-manager");
              if (current && panel) exportFile(current, panel);
            }}>
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
                await library.add([first, ...rest], currentFolder);
              }, true);
            }}
          />
        </div>
        <label className="file-search">
          <Search size={17} aria-hidden="true" />
          <input ref={search} type="search" placeholder="搜索文件名" aria-label="搜索文件名"
            value={query} onChange={event => setQuery(event.currentTarget.value)} />
        </label>
        {!searchTerm && path.length > 0 && (
          <nav className="folder-path" aria-label="文件夹路径">
            <button type="button" disabled={busy} onClick={() => visitFolder(null)}>文件库</button>
            {path.map((folder, index) => (
              <span key={folder.id}>
                <ChevronRight size={12} aria-hidden="true" />
                {index === path.length - 1 ? <span aria-current="location" title={folder.name}>{folder.name}</span>
                  : <button type="button" disabled={busy} title={folder.name} onClick={() => visitFolder(folder.id)}>{folder.name}</button>}
              </span>
            ))}
          </nav>
        )}
        {deleting ? (
          <div className="file-action">
            {action.type === "delete" ? <p>删除「{action.file.name}」？</p>
              : <p>删除「{action.folder.name}」？其中的文件和子文件夹会移到上一级。</p>}
            <div className="file-action-buttons">
              <button type="button" className="button" ref={cancelButton} disabled={busy} onClick={dismissAction}>取消</button>
              <button type="button" className="button danger" disabled={busy}
                onClick={() => {
                  void run(async () => {
                    if (action.type === "delete") await library.remove(action.file.id);
                    else await library.deleteFolder(action.folder.id);
                  });
                }}>确认删除</button>
            </div>
          </div>
        ) : action?.type === "move" ? (
          <form className="file-action" onSubmit={event => {
            event.preventDefault();
            void run(() => library.move(action.file.id, destination || null));
          }}>
            <label htmlFor="library-destination">将「{action.file.name}」移动到</label>
            <select id="library-destination" ref={folderSelect} value={destination}
              onChange={event => setDestination(event.currentTarget.value)}>
              <option value="">文件库</option>
              {folders.map(folder => (
                <option key={folder.id} value={folder.id}>{folderPath(foldersById, folder.id).map(part => part.name).join(" / ")}</option>
              ))}
            </select>
            <div className="file-action-buttons">
              <button type="button" className="button" disabled={busy} onClick={dismissAction}>取消</button>
              <button type="submit" className="button primary" disabled={busy || destination === (action.file.folderId ?? "")}>移动</button>
            </div>
          </form>
        ) : action && (
          <form className="file-action" onSubmit={event => {
            event.preventDefault();
            void run(async () => {
              if (action.type === "new") await library.add([{ name: markdownName(name), value: "" }], currentFolder);
              else if (action.type === "new-folder") visitFolder((await library.createFolder(name, currentFolder)).id);
              else if (action.type === "rename-folder") await library.changeFolderName(action.folder.id, name);
              else if (action.type === "rename") await library.rename(action.file.id, name);
            }, action.type === "new");
          }}>
            <label htmlFor="library-file-name">{
              action.type === "new" ? "新建文件名" : action.type === "new-folder" ? "文件夹名称"
                : action.type === "rename-folder" ? "新文件夹名称" : "新文件名"
            }</label>
            <input id="library-file-name" type="text" ref={nameInput} value={name} required
              onChange={event => setName(event.currentTarget.value)} />
            <div className="file-action-buttons">
              <button type="button" className="button" disabled={busy} onClick={dismissAction}>取消</button>
              <button type="submit" className="button primary" disabled={busy}>{creating ? "创建" : "保存"}</button>
            </div>
          </form>
        )}
        {error && <p className="library-error" role="alert">{error}</p>}
      </div>
      {matches.length || childFolders.length ? (
        <ul className="library-files" aria-label="文件和文件夹">
          {childFolders.map(folder => (
            <li key={folder.id} className="folder-row">
              <button type="button" className="file-open" title={folder.name} disabled={busy}
                onClick={() => visitFolder(folder.id)}>
                <Folder size={18} aria-hidden="true" />
                <span className="file-list-name">{folder.name}</span>
              </button>
              <button type="button" className="icon-control file-row-tool" aria-label={"重命名文件夹 " + folder.name} title="重命名文件夹"
                disabled={busy} onClick={event => begin({ type: "rename-folder", folder }, event.currentTarget)}>
                <PencilLine size={15} aria-hidden="true" />
              </button>
              <button type="button" className="icon-control file-row-tool remove-file" aria-label={"删除文件夹 " + folder.name} title="删除文件夹"
                disabled={busy} onClick={event => begin({ type: "delete-folder", folder }, event.currentTarget)}>
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
          {matches.map(file => (
            <li key={file.id} className={current?.id === file.id ? "is-current" : undefined}>
              <button type="button" className="file-open" aria-current={current?.id === file.id ? "true" : undefined}
                title={file.name} disabled={busy} onClick={() => {
                  void run(async () => {
                    await library.open(file.id);
                    visitFolder(file.folderId ?? null);
                  }, true);
                }}>
                <FileText size={18} aria-hidden="true" />
                <span className="file-list-name">
                  {file.name}
                  {searchTerm && file.folderId && (
                    <small>{folderPath(foldersById, file.folderId).map(folder => folder.name).join(" / ")}</small>
                  )}
                </span>
                {unsavedIds.includes(file.id) && <span className="file-unsaved">未保存</span>}
              </button>
              <button type="button" className="icon-control file-row-tool" title="移动到文件夹" aria-label={"移动 " + file.name}
                disabled={busy} onClick={event => begin({ type: "move", file }, event.currentTarget)}>
                <FolderInput size={15} aria-hidden="true" />
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
          {!library.ready ? "正在读取文件…" : searchTerm ? "没有匹配的文件"
            : currentFolder ? "此文件夹为空" : "还没有文件。可新建一篇或导入 Markdown 文件。"}
        </p>
      )}
      <div className="library-footer">
        {sessionOnly ? "浏览器存储不可用，关闭页面前可导出文件" : "文件保存在此浏览器"}
      </div>
    </SidePanel>
  );
}
