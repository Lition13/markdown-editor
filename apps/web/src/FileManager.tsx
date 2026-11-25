import { ChevronRight, Download, FileText, Folder, FolderOpen, FolderPlus, FolderTree, PencilLine, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import SidePanel from "./SidePanel";
import { markdownName, type FileEntry, type FolderEntry, type MarkdownFile } from "./files";
import type { useFileLibrary } from "./useFileLibrary";
import { useLibraryDrag } from "./useLibraryDrag";

type FileAction =
  | { type: "new" }
  | { type: "new-folder" }
  | { type: "rename"; file: FileEntry }
  | { type: "delete"; file: FileEntry }
  | { type: "rename-folder"; folder: FolderEntry }
  | { type: "delete-folder"; folder: FolderEntry };

const expandedFoldersKey = "lition13-markdown-editor-expanded-folders";

function readExpandedFolders() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(expandedFoldersKey) ?? "null");
    if (Array.isArray(value)) return new Set(value.filter((id): id is string => typeof id === "string"));
  } catch {}
  return null;
}

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

function groupByFolder<T>(entries: T[], parentId: (entry: T) => string | null) {
  const groups = new Map<string | null, T[]>();
  for (const entry of entries) {
    const id = parentId(entry);
    const siblings = groups.get(id);
    if (siblings) siblings.push(entry);
    else groups.set(id, [entry]);
  }
  return groups;
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
  const [folderId, setFolderId] = useState<string | null>();
  const [openFolders, setOpenFolders] = useState(readExpandedFolders);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const previousControl = useRef<HTMLButtonElement | null>(null);
  const { files, folders, current, ready, unsavedIds } = library;
  const foldersById = useMemo(() => new Map(folders.map(folder => [folder.id, folder])), [folders]);
  const childFolders = useMemo(() => groupByFolder(folders, folder => folder.parentId), [folders]);
  const childFiles = useMemo(() => groupByFolder(files, file => file.folderId ?? null), [files]);
  const documentFolder = current?.folderId ?? null;
  const documentPath = useMemo(() => folderPath(foldersById, documentFolder), [foldersById, documentFolder]);
  const expanded = useMemo(() => openFolders ?? new Set(documentPath.map(folder => folder.id)), [openFolders, documentPath]);
  const visibleDocumentFolder = documentPath.find(folder => !expanded.has(folder.id))?.id ?? documentFolder;
  const selected = folderId === undefined ? visibleDocumentFolder : folderId;
  const currentFolder = selected && foldersById.has(selected) ? selected : null;
  const placement = folderPath(foldersById, currentFolder).map(part => part.name).join(" / ");
  const searchTerm = query.normalize("NFC").trim().toLowerCase();
  const matches = searchTerm ? files.filter(file => file.name.normalize("NFC").toLowerCase().includes(searchTerm)) : [];
  const movement = useLibraryDrag({
    folders: foldersById,
    open,
    disabled: busy || !ready || Boolean(action),
    onMove: (entry, target) => run(async () => {
      if (entry.kind === "folder") await library.relocateFolder(entry.id, target);
      else await library.move(entry.id, target);
      revealFolder(target);
    }),
    fallbackFocus: () => search.current,
  });
  const picked = movement.selection;
  const destinations = picked ? [
    { id: null, name: "文件库" },
    ...folders.map(folder => ({
      id: folder.id,
      name: folderPath(foldersById, folder.id).map(part => part.name).join(" / "),
    })),
  ].filter(folder => movement.canDrop(picked.entry, folder.id)) : [];

  useEffect(() => {
    if (!ready) return;
    if (openFolders === null) {
      setOpenFolders(previous => previous ?? expanded);
      return;
    }
    try { localStorage.setItem(expandedFoldersKey, JSON.stringify([...openFolders])); } catch {}
  }, [ready, openFolders, expanded]);
  useEffect(() => {
    if (open) return;
    setAction(null);
    setError("");
    setQuery("");
  }, [open]);

  useEffect(() => {
    if (!action) return;
    if (action.type === "delete" || action.type === "delete-folder") cancelButton.current?.focus();
    else {
      nameInput.current?.focus();
      nameInput.current?.select();
    }
  }, [action]);

  function begin(next: FileAction, button: HTMLButtonElement) {
    movement.reset();
    previousControl.current = button;
    setError("");
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

  function selectFolder(next: string | null) {
    movement.reset();
    setFolderId(next);
    setQuery("");
    setAction(null);
    setError("");
  }

  function toggleFolder(id: string) {
    selectFolder(id);
    setOpenFolders(previous => {
      const next = new Set(previous ?? expanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function revealFolder(id: string | null, createdId?: string) {
    const path = folderPath(foldersById, id).map(folder => folder.id);
    if (createdId) path.push(createdId);
    if (path.length) setOpenFolders(previous => new Set([...(previous ?? expanded), ...path]));
  }

  function dismissPanel() {
    if (locked.current) return;
    if (movement.cancel()) return;
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
      } else if (action) dismissAction();
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
  const placementTitle = "存放到 " + (placement || "文件库");

  function renderFile(file: FileEntry) {
    const parentId = file.folderId ?? null;
    const isCurrent = file.id === current?.id;
    return (
      <li key={file.id}>
        <div className={`library-row${isCurrent ? " is-current" : ""}`}>
          <button type="button" className="file-open" aria-current={isCurrent ? "true" : undefined}
            {...movement.rowProps({ kind: "file", id: file.id, name: file.name, parentId })}
            title={file.name} disabled={busy} onClick={() => {
              void run(async () => {
                await library.open(file.id);
                selectFolder(parentId);
                revealFolder(parentId);
              }, true);
            }}>
            {!searchTerm && <span className="folder-chevron" aria-hidden="true" />}
            <span className="file-kind-icon" aria-hidden="true"><FileText size={16} /></span>
            <span className="file-list-name">
              {file.name}
              {searchTerm && parentId && (
                <small>{folderPath(foldersById, parentId).map(folder => folder.name).join(" / ")}</small>
              )}
            </span>
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
        </div>
      </li>
    );
  }

  function renderFolder(folder: FolderEntry, depth: number) {
    const expandedHere = expanded.has(folder.id);
    const branch = "library-folder-" + folder.id;
    const FolderIcon = expandedHere ? FolderOpen : Folder;
    return (
      <li key={folder.id}>
        <div className="library-row folder-row" {...movement.targetProps(folder.id)}>
          <button type="button" className="file-open" title={folder.name} disabled={busy}
            aria-expanded={expandedHere} aria-controls={branch} aria-current={currentFolder === folder.id ? "location" : undefined}
            {...movement.rowProps({ kind: "folder", id: folder.id, name: folder.name, parentId: folder.parentId })}
            onClick={() => toggleFolder(folder.id)}>
            <ChevronRight size={12} className="folder-chevron" aria-hidden="true" />
            <span className="file-kind-icon" aria-hidden="true"><FolderIcon size={16} /></span>
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
        </div>
        <ul id={branch} className="library-branch" data-indent={depth < 6} hidden={!expandedHere}>
          {expandedHere && renderBranch(folder.id, depth + 1)}
        </ul>
      </li>
    );
  }

  function renderBranch(id: string | null, depth: number): ReactNode {
    const directories = childFolders.get(id) ?? [];
    const documents = childFiles.get(id) ?? [];
    if (!directories.length && !documents.length) return <li className="library-branch-empty">空文件夹</li>;
    return <>{directories.map(folder => renderFolder(folder, depth))}{documents.map(renderFile)}</>;
  }

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
          <button type="button" className="button primary" title={placementTitle} disabled={busy || !ready} onClick={event => begin({ type: "new" }, event.currentTarget)}>
            <Plus size={16} aria-hidden="true" />新建
          </button>
          <button type="button" className="button" title={placementTitle} disabled={busy || !ready} onClick={event => begin({ type: "new-folder" }, event.currentTarget)}>
            <FolderPlus size={16} aria-hidden="true" />新建文件夹
          </button>
          <button type="button" className="button" title={placementTitle} disabled={busy || !ready} onClick={() => {
            movement.reset();
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
                selectFolder(currentFolder);
                revealFolder(currentFolder);
              }, true);
            }}
          />
        </div>
        <label className="file-search">
          <Search size={17} aria-hidden="true" />
          <input ref={search} type="search" placeholder="搜索文件名" aria-label="搜索文件名"
            value={query} onChange={event => setQuery(event.currentTarget.value)} />
        </label>
        <div className="library-location">
          <button type="button" className="library-root" disabled={busy || !ready} title="选择文件库根目录"
            aria-current={currentFolder === null ? "location" : undefined} {...movement.targetProps(null)} onClick={() => selectFolder(null)}>
            <FolderTree size={15} aria-hidden="true" />文件库
          </button>
          {placement && <span className="library-placement" title={placementTitle} aria-live="polite">{placementTitle}</span>}
        </div>
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
                    else {
                      const { id, parentId } = action.folder;
                      await library.deleteFolder(id);
                      if (currentFolder === id) setFolderId(parentId);
                      setOpenFolders(previous => {
                        const next = new Set(previous ?? expanded);
                        next.delete(id);
                        return next;
                      });
                    }
                  });
                }}>确认删除</button>
            </div>
          </div>
        ) : action && (
          <form className="file-action" onSubmit={event => {
            event.preventDefault();
            void run(async () => {
              if (action.type === "new") {
                await library.add([{ name: markdownName(name), value: "" }], currentFolder);
                selectFolder(currentFolder);
                revealFolder(currentFolder);
              } else if (action.type === "new-folder") {
                const folder = await library.createFolder(name, currentFolder);
                selectFolder(folder.id);
                revealFolder(currentFolder, folder.id);
              } else if (action.type === "rename-folder") await library.changeFolderName(action.folder.id, name);
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
      {(searchTerm ? matches.length > 0 : childFolders.has(null) || childFiles.has(null)) ? (
        <ul className="library-files" aria-label={searchTerm ? "文件搜索结果" : "文件和文件夹"} data-file-scroll="">
          {searchTerm ? matches.map(renderFile) : renderBranch(null, 0)}
        </ul>
      ) : (
        <p className="library-empty">
          {!ready ? "正在读取文件…" : searchTerm ? "没有匹配的文件" : "还没有文件。可新建一篇或导入 Markdown 文件。"}
        </p>
      )}
      {picked && (
        <section className="library-destinations" ref={movement.destinations} aria-label="放到文件夹">
          <p className="destination-heading" role="status">放到文件夹 <span title={picked.entry.name}>{picked.entry.name}</span></p>
          {destinations.length ? (
            <ul data-file-scroll="">
              {destinations.map(folder => (
                <li key={folder.id ?? "root"}>
                  {picked.method === "keyboard" ? (
                    <button type="button" aria-label={"放到 " + folder.name}
                      onClick={() => movement.choose(folder.id)} title={folder.name}>
                      <Folder size={15} aria-hidden="true" /><span>{folder.name}</span>
                    </button>
                  ) : (
                    <div {...movement.targetProps(folder.id)} aria-label={"放到 " + folder.name} title={folder.name}>
                      <Folder size={15} aria-hidden="true" /><span>{folder.name}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="destination-empty">暂无可放置的文件夹</p>}
        </section>
      )}
    </SidePanel>
  );
}
