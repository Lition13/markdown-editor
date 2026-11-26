import { Archive, ChevronRight, Download, FileText, Folder, FolderOpen, FolderPlus, FolderTree, PencilLine, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import SidePanel from "./SidePanel";
import { FileLibraryError, markdownName, parseLibraryBackup, type FileEntry, type FolderEntry, type LibraryBackup, type MarkdownFile } from "./files";
import { useWebText, type WebMessage } from "./locale";
import type { useFileLibrary } from "./useFileLibrary";
import { useLibraryDrag } from "./useLibraryDrag";

type FileAction =
  | { type: "new" }
  | { type: "new-folder" }
  | { type: "rename"; file: FileEntry }
  | { type: "delete"; file: FileEntry }
  | { type: "rename-folder"; folder: FolderEntry }
  | { type: "delete-folder"; folder: FolderEntry }
  | { type: "restore"; backup: LibraryBackup; name: string };

const expandedFoldersKey = "lition13-markdown-editor-expanded-folders";

function readExpandedFolders() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(expandedFoldersKey) ?? "null");
    if (Array.isArray(value)) return new Set(value.filter((id): id is string => typeof id === "string"));
  } catch {}
  return null;
}

function downloadFile(panel: HTMLElement, name: string, contents: Blob) {
  const url = URL.createObjectURL(contents);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  panel.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportFile(file: MarkdownFile, panel: HTMLElement, fallbackName: string) {
  const stem = file.name.replace(/\.(?:md|markdown|txt)$/i, "") || fallbackName;
  downloadFile(panel, stem + ".md", new Blob([file.value], { type: "text/markdown;charset=utf-8" }));
}

const searchResultId = (id: string) => "file-search-result-" + id;

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

export default function FileManager({ library, open, compact, onClose, onOpenFile }: {
  library: ReturnType<typeof useFileLibrary>;
  open: boolean;
  compact: boolean;
  onClose: () => void;
  onOpenFile: (id: string, keyboard: boolean) => Promise<void>;
}) {
  const t = useWebText();
  const [query, setQuery] = useState("");
  const [resultId, setResultId] = useState<string | null>(null);
  const [action, setAction] = useState<FileAction | null>(null);
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState<string | null>();
  const [openFolders, setOpenFolders] = useState(readExpandedFolders);
  const [error, setError] = useState<WebMessage | "">("");
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const restoreButton = useRef<HTMLButtonElement>(null);
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
  const activeMatch = matches.find(file => file.id === resultId) ?? matches[0];
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
    { id: null, name: t("文件库") },
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
    setRestored(false);
    setQuery("");
    setResultId(null);
  }, [open]);

  useEffect(() => {
    if (!action) return;
    if (action.type === "delete" || action.type === "delete-folder" || action.type === "restore") cancelButton.current?.focus();
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
    if (next.type === "new") setName(t("未命名.md"));
    if (next.type === "new-folder") setName(t("新建文件夹"));
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
    setResultId(null);
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
    setRestored(false);
    try {
      await operation();
      if (activate) {
        setAction(null);
        if (compact) onClose();
      } else if (action) dismissAction();
    } catch (error) {
      setError(error instanceof FileLibraryError ? error.label : "无法读取或保存文件，请重试。");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function openResult(file: FileEntry, keyboard = false) {
    const parent = file.folderId ?? null;
    void run(async () => {
      await onOpenFile(file.id, keyboard);
      selectFolder(parent);
      revealFolder(parent);
    }, true);
  }

  function searchKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (!activeMatch || busy || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
      || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (!event.repeat) openResult(activeMatch, true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const at = matches.indexOf(activeMatch) + (event.key === "ArrowDown" ? 1 : -1);
      const next = matches[Math.max(0, Math.min(matches.length - 1, at))];
      setResultId(next.id);
      document.getElementById(searchResultId(next.id))?.scrollIntoView({ block: "nearest" });
    }
  }

  const deleting = action?.type === "delete" || action?.type === "delete-folder";
  const creating = action?.type === "new" || action?.type === "new-folder";
  const restoring = action?.type === "restore";
  const backupFolders = new Map((restoring ? action.backup.folders : []).map(folder => [folder.id, folder]));
  const placementTitle = t("存放到 {name}", { name: placement || t("文件库") });

  function renderFile(file: FileEntry) {
    const parentId = file.folderId ?? null;
    const isCurrent = file.id === current?.id;
    return (
      <li key={file.id}>
        <div className={`library-row${isCurrent ? " is-current" : ""}`}>
          <button type="button" className="file-open" aria-current={isCurrent ? "true" : undefined}
            id={searchTerm ? searchResultId(file.id) : undefined} data-search-active={activeMatch?.id === file.id || undefined}
            {...movement.rowProps({ kind: "file", id: file.id, name: file.name, parentId })}
            title={file.name} disabled={busy} onClick={() => openResult(file)}>
            {!searchTerm && <span className="folder-chevron" aria-hidden="true" />}
            <span className="file-kind-icon" aria-hidden="true"><FileText size={16} /></span>
            <span className="file-list-name">
              {file.name}
              {searchTerm && parentId && (
                <small>{folderPath(foldersById, parentId).map(folder => folder.name).join(" / ")}</small>
              )}
            </span>
            {unsavedIds.includes(file.id) && <span className="file-unsaved">{t("未保存")}</span>}
          </button>
          <button type="button" className="icon-control file-row-tool" title={t("重命名")} aria-label={t("重命名 {name}", { name: file.name })}
            disabled={busy} onClick={event => begin({ type: "rename", file }, event.currentTarget)}>
            <PencilLine size={16} aria-hidden="true" />
          </button>
          <button type="button" className="icon-control file-row-tool remove-file" title={t("删除")} aria-label={t("删除 {name}", { name: file.name })}
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
          <button type="button" className="icon-control file-row-tool" aria-label={t("重命名文件夹 {name}", { name: folder.name })} title={t("重命名文件夹")}
            disabled={busy} onClick={event => begin({ type: "rename-folder", folder }, event.currentTarget)}>
            <PencilLine size={15} aria-hidden="true" />
          </button>
          <button type="button" className="icon-control file-row-tool remove-file" aria-label={t("删除文件夹 {name}", { name: folder.name })} title={t("删除文件夹")}
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
    if (!directories.length && !documents.length) return <li className="library-branch-empty">{t("空文件夹")}</li>;
    return <>{directories.map(folder => renderFolder(folder, depth))}{documents.map(renderFile)}</>;
  }

  return (
    <SidePanel id="file-manager" title={t("文件管理")} className="file-manager" open={open} compact={compact} onDismiss={dismissPanel}>
      <div className="file-manager-heading">
        <h2 id="file-manager-title">{t("文件管理")}</h2>
        <button className="icon-control" type="button" aria-label={t("关闭文件管理")} disabled={busy} onClick={onClose}>
          <X size={19} aria-hidden="true" />
        </button>
      </div>
      <div className="library-controls" aria-busy={busy || undefined}>
        <div className="library-tools">
          <button type="button" className="button primary" title={placementTitle} disabled={busy || !ready} onClick={event => begin({ type: "new" }, event.currentTarget)}>
            <Plus size={16} aria-hidden="true" />{t("新建")}
          </button>
          <button type="button" className="button" title={placementTitle} disabled={busy || !ready} onClick={event => begin({ type: "new-folder" }, event.currentTarget)}>
            <FolderPlus size={16} aria-hidden="true" />{t("新建文件夹")}
          </button>
          <button type="button" className="button" title={placementTitle} disabled={busy || !ready} onClick={() => {
            movement.reset();
            setAction(null);
            setError("");
            fileInput.current?.click();
          }}>
            <Upload size={16} aria-hidden="true" />{t("导入")}
          </button>
          <button type="button" className="button" title={t("导出当前文件为 .md")} disabled={!current || busy}
            onClick={event => {
              const panel = event.currentTarget.closest<HTMLElement>(".file-manager");
              if (current && panel) exportFile(current, panel, t("未命名"));
            }}>
            <Download size={16} aria-hidden="true" />{t("导出")}
          </button>
          <button type="button" className="button" title={t("备份文件库")} aria-label={t("备份文件库")} disabled={busy || !ready}
            onClick={event => {
              const panel = event.currentTarget.closest<HTMLElement>(".file-manager");
              if (!panel) return;
              void run(async () => {
                const backup = await library.backUp();
                downloadFile(panel, "markdown-library-backup.json", new Blob([JSON.stringify(backup)], { type: "application/json" }));
              });
            }}>
            <Archive size={16} aria-hidden="true" />{t("备份")}
          </button>
          <button type="button" className="button" ref={restoreButton} title={t("恢复备份")} aria-label={t("恢复备份")} disabled={busy || !ready}
            onClick={() => {
              movement.reset();
              setAction(null);
              setError("");
              setRestored(false);
              backupInput.current?.click();
            }}>
            <Upload size={16} aria-hidden="true" />{t("恢复")}
          </button>
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            aria-label={t("选择 Markdown 文件")}
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
          <input ref={backupInput} type="file" hidden accept=".json,application/json" aria-label={t("选择文件库备份")}
            onChange={event => {
              const selected = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!selected) return;
              void run(async () => {
                const backup = parseLibraryBackup(await selected.text());
                previousControl.current = restoreButton.current;
                setAction({ type: "restore", backup, name: selected.name });
              });
            }} />
        </div>
        <label className="file-search">
          <Search size={17} aria-hidden="true" />
          <input ref={search} type="search" placeholder={t("搜索文件名")} aria-label={t("搜索文件名")}
            aria-controls={activeMatch ? "file-search-results" : undefined}
            aria-activedescendant={activeMatch ? searchResultId(activeMatch.id) : undefined}
            value={query} onKeyDown={searchKeys} onChange={event => {
              setQuery(event.currentTarget.value);
              setResultId(null);
            }} />
        </label>
        <div className="library-location">
          <button type="button" className="library-root" disabled={busy || !ready} title={t("选择文件库根目录")}
            aria-current={currentFolder === null ? "location" : undefined} {...movement.targetProps(null)} onClick={() => selectFolder(null)}>
            <FolderTree size={15} aria-hidden="true" />{t("文件库")}
          </button>
          {placement && <span className="library-placement" title={placementTitle} aria-live="polite">{placementTitle}</span>}
        </div>
        {restoring ? (
          <section className="file-action backup-preview" aria-label={t("恢复「{name}」", { name: action.name })}>
            <h3>{t("恢复「{name}」", { name: action.name })}</h3>
            <p>{t("备份中有 {files} 个文件和 {folders} 个文件夹。", {
              files: action.backup.files.length, folders: action.backup.folders.length,
            })}</p>
            <p>{t("同名文件夹会合并，同名文件会自动编号。")}</p>
            <details>
              <summary>{t("查看备份内容")}</summary>
              <ul>
                {action.backup.folders.map(folder => (
                  <li key={folder.id}>{folderPath(backupFolders, folder.id).map(part => part.name).join("/")}/</li>
                ))}
                {action.backup.files.map((file, index) => (
                  <li key={index}>{[...folderPath(backupFolders, file.folderId).map(part => part.name), file.name].join("/")}</li>
                ))}
              </ul>
            </details>
            <div className="file-action-buttons">
              <button type="button" className="button" ref={cancelButton} disabled={busy} onClick={dismissAction}>{t("取消")}</button>
              <button type="button" className="button primary" disabled={busy} onClick={() => {
                void run(async () => {
                  await library.restore(action.backup);
                  setRestored(true);
                });
              }}>{t("确认恢复")}</button>
            </div>
          </section>
        ) : deleting ? (
          <div className="file-action">
            {action.type === "delete" ? <p>{t("删除「{name}」？", { name: action.file.name })}</p>
              : <p>{t("删除「{name}」？其中的文件和子文件夹会移到上一级。", { name: action.folder.name })}</p>}
            <div className="file-action-buttons">
              <button type="button" className="button" ref={cancelButton} disabled={busy} onClick={dismissAction}>{t("取消")}</button>
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
                }}>{t("确认删除")}</button>
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
              action.type === "new" ? t("新建文件名") : action.type === "new-folder" ? t("文件夹名称")
                : action.type === "rename-folder" ? t("新文件夹名称") : t("新文件名")
            }</label>
            <input id="library-file-name" type="text" ref={nameInput} value={name} required
              onChange={event => setName(event.currentTarget.value)} />
            <div className="file-action-buttons">
              <button type="button" className="button" disabled={busy} onClick={dismissAction}>{t("取消")}</button>
              <button type="submit" className="button primary" disabled={busy}>{creating ? t("创建") : t("保存")}</button>
            </div>
          </form>
        )}
        {error && <p className="library-error" role="alert">{t(error)}</p>}
        {restored && <p className="library-notice" role="status">{t("备份已恢复。")}</p>}
      </div>
      {(searchTerm ? matches.length > 0 : childFolders.has(null) || childFiles.has(null)) ? (
        <ul id={searchTerm ? "file-search-results" : undefined} className="library-files"
          aria-label={searchTerm ? t("文件搜索结果") : t("文件和文件夹")} data-file-scroll="">
          {searchTerm ? matches.map(renderFile) : renderBranch(null, 0)}
        </ul>
      ) : (
        <p className="library-empty">
          {!ready ? t("正在读取文件…") : searchTerm ? t("没有匹配的文件") : t("还没有文件。可新建一篇或导入 Markdown 文件。")}
        </p>
      )}
      {picked && (
        <section className="library-destinations" ref={movement.destinations} aria-label={t("放到文件夹")}>
          <p className="destination-heading" role="status">{t("放到文件夹")} <span title={picked.entry.name}>{picked.entry.name}</span></p>
          {destinations.length ? (
            <ul data-file-scroll="">
              {destinations.map(folder => (
                <li key={folder.id ?? "root"}>
                  {picked.method === "keyboard" ? (
                    <button type="button" aria-label={t("放到 {name}", { name: folder.name })}
                      onClick={() => movement.choose(folder.id)} title={folder.name}>
                      <Folder size={15} aria-hidden="true" /><span>{folder.name}</span>
                    </button>
                  ) : (
                    <div {...movement.targetProps(folder.id)} aria-label={t("放到 {name}", { name: folder.name })} title={folder.name}>
                      <Folder size={15} aria-hidden="true" /><span>{folder.name}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="destination-empty">{t("暂无可放置的文件夹")}</p>}
        </section>
      )}
    </SidePanel>
  );
}
