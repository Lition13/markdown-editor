import type { MarkdownLocale } from "@lition13/markdown-editor";
import { useEffect, useRef, useState } from "react";
import {
  addFiles, addFolder, exampleFiles, FileLibraryError, fileEntry, folderContents, importLibraryFiles, isOriginalExample,
  movedFile, movedFolder, moveFile, moveFolder, newFiles, newFolder, nextFileAfterRemoval,
  openFile, planFolderRemoval, planLibraryImport, readFileForExport, readFolderForExport, readLibrary, removeFile, removeFolder, renamedFile, renamedFolder,
  renameFile, renameFolder, saveContent, sortByName, syncExampleLanguage,
  type FileEntry, type FileInput, type FolderEntry, type LibraryImport, type MarkdownFile,
} from "./files";
import type { WebMessage } from "./locale";

interface PendingEdit {
  value: string;
  revision: number;
  saving: boolean;
}

export function useFileLibrary(preferredLocale: MarkdownLocale | null) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [current, setCurrent] = useState<MarkdownFile | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionOnly, setSessionOnly] = useState(false);
  const [progress, setProgress] = useState<Partial<Record<string, WebMessage | null>>>({});
  const active = useRef<MarkdownFile | null>(null);
  const memory = useRef<Map<string, string> | null>(null);
  const pending = useRef(new Map<string, PendingEdit>());
  const initialLocale = useRef(preferredLocale);
  const currentLocale = useRef(preferredLocale);
  const previousLocale = useRef(preferredLocale);
  const exampleQueue = useRef(Promise.resolve());
  currentLocale.current = preferredLocale;

  function show(file: MarkdownFile | null) {
    active.current = file;
    setCurrent(file);
  }

  function select(file: MarkdownFile | null) {
    const edit = file && pending.current.get(file.id);
    show(file && edit ? { ...file, value: edit.value, revision: edit.revision } : file);
  }

  useEffect(() => {
    let mounted = true;
    void readLibrary(initialLocale.current).then(library => {
      if (!mounted) return;
      setFiles(library.files);
      setFolders(library.folders);
      show(library.current);
    }).catch(() => {
      if (!mounted) return;
      const examples = Object.values(exampleFiles);
      memory.current = new Map(examples.map(file => [file.id, file.value]));
      setSessionOnly(true);
      setFiles(sortByName(examples.map(fileEntry)));
      show(exampleFiles[initialLocale.current ?? "en"]);
    }).finally(() => {
      if (mounted) setReady(true);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!ready || previousLocale.current === preferredLocale) return;
    previousLocale.current = preferredLocale;
    const locale = preferredLocale ?? "en";

    function source() {
      if (currentLocale.current !== preferredLocale) return;
      const file = active.current;
      if (file && (!isOriginalExample(file) || pending.current.has(file.id))) return;
      return file;
    }

    const content = memory.current;
    if (content) {
      const target = files.find(file => file.id === exampleFiles[locale].id);
      if (!target) return;
      const from = source();
      const file = { ...target, value: content.get(target.id) ?? "" };
      if (from !== undefined && from?.id !== file.id && isOriginalExample(file)) show(file);
      return;
    }

    exampleQueue.current = exampleQueue.current.then(async () => {
      if (currentLocale.current !== preferredLocale) return;
      const { entry, selection } = await syncExampleLanguage(locale, source);
      if (entry) {
        setFiles(previous => sortByName([...previous.filter(file => file.id !== entry.id), entry]));
      }
      if (selection && active.current === selection.from) show(selection.target);
    }).catch(() => {});
  }, [files, preferredLocale, ready]);

  function markSave(id: string, state: WebMessage | null | undefined) {
    setProgress(previous => {
      const next = { ...previous };
      if (state === undefined) delete next[id];
      else next[id] = state;
      return next;
    });
  }

  async function persist(id: string, edit: PendingEdit) {
    edit.saving = true;
    markSave(id, null);
    try {
      let value: string;
      do {
        value = edit.value;
        edit.revision = await saveContent(id, value, edit.revision);
        if (pending.current.get(id) !== edit) return;
      } while (value !== edit.value);
      pending.current.delete(id);
      if (active.current?.id === id) show({ ...active.current, revision: edit.revision });
      markSave(id, undefined);
    } catch (error) {
      if (pending.current.get(id) !== edit) return;
      const message = error instanceof FileLibraryError ? error.label : "保存失败，可导出当前内容。";
      markSave(id, message);
    } finally {
      edit.saving = false;
    }
  }

  function change(id: string, value: string) {
    const file = active.current;
    if (file?.id !== id || file.value === value) return;
    show({ ...file, value });
    if (memory.current) {
      memory.current.set(id, value);
      return;
    }
    const edit = pending.current.get(id) ?? { value, revision: file.revision, saving: false };
    edit.value = value;
    pending.current.set(id, edit);
    if (!edit.saving) void persist(id, edit);
  }

  async function open(id: string) {
    if (active.current?.id === id) return;
    const content = memory.current;
    if (!content) {
      select(await openFile(id));
      return;
    }
    const entry = files.find(file => file.id === id);
    if (entry) show({ ...entry, value: content.get(id) ?? "" });
  }

  async function add(inputs: [FileInput, ...FileInput[]], folderId: string | null) {
    if (!memory.current) {
      const result = await addFiles(inputs, folderId);
      setFiles(result.files);
      show(result.current);
      return;
    }
    const created = newFiles(inputs, files, folderId);
    for (const file of created) memory.current.set(file.id, file.value);
    setFiles(sortByName([...files, ...created.map(fileEntry)]));
    show(created[0]);
  }

  function localValue(id: string) {
    return active.current?.id === id ? active.current.value : pending.current.get(id)?.value ?? memory.current?.get(id);
  }

  async function fileForExport(id: string): Promise<MarkdownFile> {
    const value = localValue(id);
    if (active.current?.id === id) return active.current;
    if (value !== undefined || memory.current) {
      const entry = files.find(file => file.id === id);
      if (!entry) throw new FileLibraryError("这个文件已被移除。");
      return { ...entry, value: value ?? "" };
    }
    return readFileForExport(id);
  }

  async function folderForExport(id: string) {
    if (memory.current) {
      const contents = folderContents(id, folders, files);
      return { ...contents, files: contents.files.map(file => ({ ...file, value: localValue(file.id) ?? "" })) };
    }
    const contents = await readFolderForExport(id);
    return { ...contents, files: contents.files.map(file => ({ ...file, value: localValue(file.id) ?? file.value })) };
  }

  async function importFiles(batch: LibraryImport, destinationId: string | null) {
    if (!memory.current) {
      const result = await importLibraryFiles(batch, destinationId);
      setFiles(result.files);
      setFolders(result.folders);
      if (result.current) show(result.current);
      return result;
    }
    const added = planLibraryImport(batch, files, folders, destinationId);
    for (const file of added.files) memory.current.set(file.id, file.value);
    const result = {
      files: sortByName([...files, ...added.files.map(fileEntry)]),
      folders: sortByName([...folders, ...added.folders]),
      current: added.files[0] ?? null,
    };
    setFiles(result.files);
    setFolders(result.folders);
    if (result.current) show(result.current);
    return result;
  }

  function updateEntries(entries: FileEntry[]) {
    const updates = new Map(entries.map(entry => [entry.id, entry]));
    setFiles(previous => sortByName(previous.map(file => updates.get(file.id) ?? file)));
    const current = active.current;
    const updated = current && updates.get(current.id);
    if (current && updated) show({ ...current, name: updated.name, folderId: updated.folderId });
  }

  async function rename(id: string, name: string) {
    updateEntries([memory.current ? renamedFile(files, id, name) : await renameFile(id, name)]);
  }

  async function move(id: string, folderId: string | null) {
    updateEntries([memory.current ? movedFile(files, id, folderId) : await moveFile(id, folderId)]);
  }

  async function createFolder(name: string, parentId: string | null) {
    const entry = memory.current ? newFolder(folders, name, parentId) : await addFolder(name, parentId);
    setFolders(previous => sortByName([...previous, entry]));
    return entry;
  }

  async function changeFolderName(id: string, name: string) {
    const entry = memory.current ? renamedFolder(folders, id, name) : await renameFolder(id, name);
    setFolders(previous => sortByName(previous.map(folder => folder.id === id ? entry : folder)));
  }

  async function relocateFolder(id: string, parentId: string | null) {
    const entry = memory.current ? movedFolder(folders, id, parentId) : await moveFolder(id, parentId);
    setFolders(previous => sortByName(previous.map(folder => folder.id === id ? entry : folder)));
  }

  async function deleteFolder(id: string) {
    const content = memory.current;
    let result;
    if (content) {
      const removal = planFolderRemoval(id, folders, files);
      for (const fileId of removal.fileIds) content.delete(fileId);
      const next = nextFileAfterRemoval(removal.files, removal.parentId);
      result = { ...removal, current: next ? { ...next, value: content.get(next.id) ?? "" } : null };
    } else result = await removeFolder(id, active.current?.id);

    for (const fileId of result.fileIds) pending.current.delete(fileId);
    if (result.fileIds.size) {
      setProgress(previous => {
        const next = { ...previous };
        for (const fileId of result.fileIds) delete next[fileId];
        return next;
      });
    }
    setFolders(result.folders);
    setFiles(result.files);
    const currentId = active.current?.id;
    if (currentId && result.fileIds.has(currentId)) select(result.current);
    return { parentId: result.parentId, folderIds: result.folderIds };
  }

  async function remove(id: string) {
    const currentId = active.current?.id;
    if (memory.current) {
      memory.current.delete(id);
      const remaining = files.filter(file => file.id !== id);
      setFiles(remaining);
      if (id === currentId) {
        const removedFolder = active.current?.folderId ?? null;
        const next = nextFileAfterRemoval(remaining, removedFolder);
        show(next ? { ...next, value: memory.current.get(next.id) ?? "" } : null);
      }
    } else {
      const result = await removeFile(id, currentId);
      setFiles(result.files);
      if (id === currentId) select(result.current);
    }
    pending.current.delete(id);
    markSave(id, undefined);
  }

  const activeSave = current ? progress[current.id] : undefined;
  const unsavedIds = Object.keys(progress).filter(id => typeof progress[id] === "string");
  let status: WebMessage = "已保存到此浏览器";
  if (!ready) status = "正在读取文件…";
  else if (sessionOnly) status = "浏览器存储不可用，关闭页面前可导出文件";
  else if (typeof activeSave === "string") status = activeSave;
  else if (activeSave === null) status = "正在保存…";
  else if (unsavedIds.length) status = "有文件尚未保存";
  else if (!current) status = "暂无文件";
  else if (isOriginalExample(current)) {
    status = "示例文档";
  }

  return {
    files, folders, current, ready, status, unsavedIds,
    change, open, add, rename, move, remove, createFolder, changeFolderName, relocateFolder, deleteFolder,
    fileForExport, folderForExport, importFiles,
  };
}
