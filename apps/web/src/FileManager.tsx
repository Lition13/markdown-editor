import { ChevronRight, Download, FileText, Folder, FolderOpen, FolderPlus, FolderTree, PencilLine, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import SidePanel from "./SidePanel";
import { preserveTextSelection } from "./dialogFocus";
import { makeFolderZip, readImportFiles } from "./fileArchives";
import { useResultNavigation } from "./fileSearch";
import { FileLibraryError, folderPath, markdownName, type FileEntry, type FolderEntry, type MarkdownFile } from "./files";
import { useWebText, type WebMessage } from "./locale";
import type { useFileLibrary } from "./useFileLibrary";
import { useLibraryDrag } from "./useLibraryDrag";

type FileAction = (
  | { type: "new" }
  | { type: "new-folder" }
  | { type: "rename"; file: FileEntry }
  | { type: "delete"; file: FileEntry }
  | { type: "rename-folder"; folder: FolderEntry }
  | { type: "delete-folder"; folder: FolderEntry }
) & { inDialog?: true };

const expandedFoldersKey = "lition13-markdown-editor-expanded-folders";

export type FileManagerCommand = "new" | "new-folder" | "import" | "export" | "delete" | "rename";
export interface FileManagerHandle {
  executeCommand(command: FileManagerCommand): void;
}

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

const searchResultId = (id: string) => "library-row-" + id;

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

export default function FileManager({ ref, library, open, compact, onClose, onOpenFile, searchFocusRequest }: {
  ref?: Ref<FileManagerHandle>;
  library: ReturnType<typeof useFileLibrary>;
  open: boolean;
  compact: boolean;
  onClose: () => void;
  onOpenFile: (id: string, keyboard: boolean) => Promise<void>;
  searchFocusRequest: number;
}) {
  const t = useWebText();
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<FileAction | null>(null);
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState<string | null>();
  const [openFolders, setOpenFolders] = useState(readExpandedFolders);
  const [error, setError] = useState<WebMessage | "">("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const focusedRequest = useRef(searchFocusRequest);
  const nameInput = useRef<HTMLInputElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const previousControl = useRef<HTMLButtonElement | null>(null);
  const actionDialog = useRef<HTMLDialogElement>(null);
  const restoreSelection = useRef<ReturnType<typeof preserveTextSelection>>(undefined);
  const inDialog = action?.inDialog === true;
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
  const matches = useMemo(() => searchTerm
    ? files.filter(file => file.name.normalize("NFC").toLowerCase().includes(searchTerm)) : [], [files, searchTerm]);
  const results = useMemo(() => {
    if (searchTerm) return matches;
    const rows: (FileEntry | FolderEntry)[] = [];
    function visit(parent: string | null) {
      for (const folder of childFolders.get(parent) ?? []) {
        rows.push(folder);
        if (expanded.has(folder.id)) visit(folder.id);
      }
      for (const file of childFiles.get(parent) ?? []) rows.push(file);
    }
    visit(null);
    return rows;
  }, [searchTerm, matches, expanded, childFiles, childFolders]);
  const { active, select: selectResult, onKeyDown: searchKeys } = useResultNavigation<FileEntry | FolderEntry>(results, {
    selectFirst: Boolean(searchTerm), disabled: busy, elementId: searchResultId,
    onAccept(entry) {
      if ("parentId" in entry) {
        toggleFolder(entry.id);
        selectResult(entry.id);
      } else openResult(entry, true);
    },
  });
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
    setAction(previous => previous?.inDialog ? previous : null);
    setError("");
    setQuery("");
    selectResult(null);
  }, [open, selectResult]);
  useLayoutEffect(() => {
    if (!open || focusedRequest.current === searchFocusRequest) return;
    focusedRequest.current = searchFocusRequest;
    const frame = requestAnimationFrame(() => search.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open, searchFocusRequest]);

  useLayoutEffect(() => {
    const dialog = actionDialog.current;
    if (!inDialog || !dialog || dialog.open) return;
    restoreSelection.current = preserveTextSelection(dialog.ownerDocument);
    dialog.showModal();
  }, [inDialog]);

  useImperativeHandle(ref, () => ({
    executeCommand(command) {
      if (locked.current || !ready) return;
      if (command === "import") return chooseImport();
      if (command === "new" || command === "new-folder") return begin({ type: command }, null);
      if (!current) return;
      if (command === "export") exportEntry(current, document.activeElement);
      else begin({ type: command, file: current, inDialog: true }, null);
    },
  }));

  useEffect(() => {
    if (!action) return;
    if (action.type === "delete" || action.type === "delete-folder") cancelButton.current?.focus();
    else {
      nameInput.current?.focus();
      nameInput.current?.select();
    }
  }, [action]);

  function begin(next: FileAction, button: HTMLButtonElement | null) {
    movement.reset();
    previousControl.current = button;
    setError("");
    if (next.type === "rename") setName(next.file.name);
    if (next.type === "rename-folder") setName(next.folder.name);
    if (next.type === "new") setName(t("未命名.md"));
    if (next.type === "new-folder") setName(t("新建文件夹"));
    setAction(next);
  }

  function chooseImport() {
    movement.reset();
    setAction(null);
    setError("");
    fileInput.current?.click();
  }

  function dismissAction() {
    const dialog = actionDialog.current;
    if (dialog?.open) {
      dialog.close();
      restoreSelection.current?.();
    }
    setAction(null);
    setError("");
    if (dialog) return;
    requestAnimationFrame(() => {
      const button = previousControl.current;
      (button?.isConnected ? button : search.current)?.focus();
    });
  }

  function selectFolder(next: string | null) {
    movement.reset();
    setFolderId(next);
    setQuery("");
    selectResult(null);
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

  function revealFolder(id: string | null, createdId?: string, lookup = foldersById) {
    const path = folderPath(lookup, id).map(folder => folder.id);
    if (createdId) path.push(createdId);
    if (path.length) setOpenFolders(previous => new Set([...(previous ?? expanded), ...path]));
  }

  function dismissPanel() {
    if (locked.current) return;
    if (movement.cancel()) return;
    if (action) dismissAction();
    else onClose();
  }

  async function run(operation: () => Promise<void>, finish: "action" | "open" | "export" = "action") {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
      if (finish === "open") {
        setAction(null);
        if (compact) onClose();
      } else if (action && finish === "action") dismissAction();
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
    }, "open");
  }

  function exportEntry(entry: FileEntry | FolderEntry, origin: Element | null) {
    const panel = origin?.closest<HTMLElement>("dialog[open]") ?? document.body;
    void run(async () => {
      if ("parentId" in entry) {
        const { name, blob } = await makeFolderZip(await library.folderForExport(entry.id));
        downloadFile(panel, name, blob);
      } else exportFile(await library.fileForExport(entry.id), panel, t("未命名"));
    }, "export");
  }

  const deleting = action?.type === "delete" || action?.type === "delete-folder";
  const creating = action?.type === "new" || action?.type === "new-folder";
  const placementTitle = t("存放到 {name}", { name: placement || t("文件库") });

  function renderFile(file: FileEntry) {
    const parentId = file.folderId ?? null;
    const isCurrent = file.id === current?.id;
    return (
      <li key={file.id}>
        <div className={`library-row${isCurrent ? " is-current" : ""}`}>
          <button type="button" className="file-open" aria-current={isCurrent ? "true" : undefined}
            id={searchResultId(file.id)} data-search-active={active?.id === file.id || undefined}
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
          <button type="button" className="icon-control file-row-tool" title={t("导出为 Markdown")}
            aria-label={t("导出 {name}", { name: file.name })} disabled={busy} onClick={event => exportEntry(file, event.currentTarget)}>
            <Download size={15} aria-hidden="true" />
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
            id={searchResultId(folder.id)} data-search-active={active?.id === folder.id || undefined}
            aria-expanded={expandedHere} aria-controls={branch} aria-current={currentFolder === folder.id ? "location" : undefined}
            {...movement.rowProps({ kind: "folder", id: folder.id, name: folder.name, parentId: folder.parentId })}
            onClick={() => toggleFolder(folder.id)}>
            <ChevronRight size={12} className="folder-chevron" aria-hidden="true" />
            <span className="file-kind-icon" aria-hidden="true"><FolderIcon size={16} /></span>
            <span className="file-list-name">{folder.name}</span>
          </button>
          <button type="button" className="icon-control file-row-tool" title={t("导出为 ZIP")}
            aria-label={t("导出文件夹 {name}", { name: folder.name })} disabled={busy} onClick={event => exportEntry(folder, event.currentTarget)}>
            <Download size={15} aria-hidden="true" />
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

  const actionControls = deleting ? (
    <div className="file-action">
      {action.type === "delete" ? <p>{t("删除「{name}」？", { name: action.file.name })}</p>
        : <p>{t("永久删除「{name}」及其中的所有文件和子文件夹？", { name: action.folder.name })}</p>}
      <div className="file-action-buttons">
        <button type="button" className="button" ref={cancelButton} disabled={busy} onClick={dismissAction}>{t("取消")}</button>
        <button type="button" className="button danger" disabled={busy}
          onClick={() => {
            void run(async () => {
              if (action.type === "delete") await library.remove(action.file.id);
              else {
                const { parentId, folderIds } = await library.deleteFolder(action.folder.id);
                if (currentFolder && folderIds.has(currentFolder)) setFolderId(parentId);
                setOpenFolders(previous => new Set([...(previous ?? expanded)].filter(id => !folderIds.has(id))));
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
      }, action.type === "new" ? "open" : "action");
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
  );
  const actionError = error && <p className="library-error" role="alert">{t(error)}</p>;

  return <>
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
          <button type="button" className="button" title={placementTitle} disabled={busy || !ready} onClick={chooseImport}>
            <Upload size={16} aria-hidden="true" />{t("导入")}
          </button>
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            aria-label={t("选择 Markdown 或 ZIP 文件")}
            accept=".md,.markdown,.txt,.zip,text/markdown,text/plain,application/zip,application/x-zip-compressed"
            onChange={event => {
              const selected = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (!selected.length) return;
              void run(async () => {
                const imported = await library.importFiles(await readImportFiles(selected), currentFolder);
                const location = imported.current ? imported.current.folderId ?? null : currentFolder;
                selectFolder(location);
                revealFolder(location, undefined, new Map(imported.folders.map(folder => [folder.id, folder])));
                if (compact && imported.current) onClose();
              });
            }}
          />
        </div>
        <label className="file-search">
          <Search size={17} aria-hidden="true" />
          <input ref={search} type="search" placeholder={t("搜索文件名")} aria-label={t("搜索文件名")}
            aria-controls={results.length ? "file-search-results" : undefined}
            aria-activedescendant={active ? searchResultId(active.id) : undefined}
            value={query} onKeyDown={searchKeys} onChange={event => {
              setQuery(event.currentTarget.value);
              selectResult(null);
            }} />
        </label>
        <div className="library-location">
          <button type="button" className="library-root" disabled={busy || !ready} title={t("选择文件库根目录")}
            aria-current={currentFolder === null ? "location" : undefined} {...movement.targetProps(null)} onClick={() => selectFolder(null)}>
            <FolderTree size={15} aria-hidden="true" />{t("文件库")}
          </button>
          {placement && <span className="library-placement" title={placementTitle} aria-live="polite">{placementTitle}</span>}
        </div>
        {!inDialog && <>{actionControls}{actionError}</>}
      </div>
      {(searchTerm ? matches.length > 0 : childFolders.has(null) || childFiles.has(null)) ? (
        <ul id="file-search-results" className="library-files"
          aria-label={searchTerm ? t("文件搜索结果") : t("文件和文件夹")} data-file-scroll="">
          {searchTerm ? matches.map(renderFile) : renderBranch(null, 0)}
        </ul>
      ) : (
        <p className="library-empty">
          {!ready ? t("正在读取文件…") : searchTerm ? t("没有匹配的文件") : t("还没有文件。可新建一篇或导入 Markdown 或 ZIP 文件。")}
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
    {inDialog && (
      <dialog ref={actionDialog} className="file-command-dialog" aria-busy={busy || undefined}
        aria-label={t(deleting ? "删除当前文件" : "重命名当前文件")}
        onCancel={event => { event.preventDefault(); if (!locked.current) dismissAction(); }}>
        {actionControls}
        {actionError}
      </dialog>
    )}
  </>;
}
