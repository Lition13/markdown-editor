import { example } from "./example";
import type { WebMessage } from "./locale";

export class FileLibraryError extends Error {
  constructor(readonly label: WebMessage) { super(label); }
}

export interface FileEntry {
  id: string;
  name: string;
  revision: number;
  folderId?: string | null;
}

export interface FolderEntry {
  id: string;
  name: string;
  parentId: string | null;
}

export interface FileInput {
  name: string;
  value: string;
}

export type MarkdownFile = FileEntry & FileInput;

interface FileLibrary {
  files: FileEntry[];
  folders: FolderEntry[];
  current: MarkdownFile | null;
}

const filesStore = "files";
const foldersStore = "folders";
const textStore = "contents";
const settingsStore = "settings";
const activeKey = "active-file";
const nameOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
let connection: Promise<IDBDatabase> | undefined;

export const exampleFile: MarkdownFile = { id: "example", revision: 0, ...example };
const previousExamples = new Set(["Ctrl+T", "Ctrl+Shift+Enter"].map(key =>
  example.value.replace("| 插入表格 | Ctrl+Alt+T |", `| 插入表格 | ${key} |`)));
const nameKey = (name: string) => name.normalize("NFC").toLowerCase();

export function fileEntry({ id, name, revision, folderId }: FileEntry): FileEntry {
  return { id, name, revision, folderId };
}

export function sortByName<T extends { name: string }>(entries: T[]) {
  return [...entries].sort((left, right) => nameOrder.compare(left.name, right.name));
}

function cleanName(input: string, kind: "file" | "folder") {
  const name = input.trim();
  if (!name || /^\.+$/.test(name) || /[/\\]/.test(name)) {
    throw new FileLibraryError(kind === "file" ? "请输入有效的文件名称，名称不能包含斜杠。" : "请输入有效的文件夹名称，名称不能包含斜杠。");
  }
  return name;
}

export function markdownName(input: string) {
  const name = cleanName(input, "file");
  return /\.(?:md|markdown|txt)$/i.test(name) ? name : name + ".md";
}

function reserveName(stem: string, extension: string, names: Set<string>) {
  let name = stem + extension;
  for (let suffix = 2; names.has(nameKey(name)); suffix++) {
    name = stem + " (" + suffix + ")" + extension;
  }
  names.add(nameKey(name));
  return name;
}

function reserveFileName(name: string, names: Set<string>) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? reserveName(name.slice(0, dot), name.slice(dot), names) : reserveName(name, "", names);
}

function namesInFolder(files: FileEntry[], folderId: string | null) {
  return new Set(files.filter(file => (file.folderId ?? null) === folderId).map(file => nameKey(file.name)));
}

export function newFiles(inputs: FileInput[], existing: FileEntry[], folderId: string | null): MarkdownFile[] {
  const names = namesInFolder(existing, folderId);
  return inputs.map(input => {
    const name = reserveFileName(input.name, names);
    return { id: crypto.randomUUID(), name, value: input.value, revision: 0, folderId };
  });
}

export function renamedFile(files: FileEntry[], id: string, input: string): FileEntry {
  const file = files.find(file => file.id === id);
  if (!file) throw new FileLibraryError("这个文件已被移除。");
  const name = markdownName(input);
  if (files.some(other => other.id !== id && (other.folderId ?? null) === (file.folderId ?? null) && nameKey(other.name) === nameKey(name))) {
    throw new FileLibraryError("已有同名文件，请换一个名称。");
  }
  return { ...file, name };
}

export function newFolder(folders: FolderEntry[], input: string, parentId: string | null): FolderEntry {
  if (parentId !== null && !folders.some(folder => folder.id === parentId)) throw new FileLibraryError("上一级文件夹已被移除。");
  const names = new Set(folders.filter(folder => folder.parentId === parentId).map(folder => nameKey(folder.name)));
  const name = reserveName(cleanName(input, "folder"), "", names);
  return { id: crypto.randomUUID(), name, parentId };
}

export function renamedFolder(folders: FolderEntry[], id: string, input: string): FolderEntry {
  const folder = folders.find(folder => folder.id === id);
  if (!folder) throw new FileLibraryError("这个文件夹已被移除。");
  const name = cleanName(input, "folder");
  if (folders.some(other => other.id !== id && other.parentId === folder.parentId && nameKey(other.name) === nameKey(name))) {
    throw new FileLibraryError("已有同名文件夹，请换一个名称。");
  }
  return { ...folder, name };
}

export function movedFile(files: FileEntry[], id: string, folderId: string | null): FileEntry {
  const file = files.find(file => file.id === id);
  if (!file) throw new FileLibraryError("这个文件已被移除。");
  if ((file.folderId ?? null) === folderId) return file;
  return { ...file, folderId, name: reserveFileName(file.name, namesInFolder(files, folderId)) };
}

export function containsFolder(folders: Map<string, FolderEntry>, ancestorId: string, folderId: string | null) {
  for (let id = folderId; id !== null; id = folders.get(id)?.parentId ?? null) {
    if (id === ancestorId) return true;
  }
  return false;
}

export function movedFolder(folders: FolderEntry[], id: string, parentId: string | null): FolderEntry {
  const entries = new Map(folders.map(folder => [folder.id, folder]));
  const folder = entries.get(id);
  if (!folder) throw new FileLibraryError("这个文件夹已被移除。");
  if (folder.parentId === parentId) return folder;
  if (parentId !== null && !entries.has(parentId)) throw new FileLibraryError("目标文件夹已被移除。");
  if (containsFolder(entries, id, parentId)) throw new FileLibraryError("不能把文件夹移到自身或子文件夹。");
  const names = new Set(folders.filter(other => other.parentId === parentId).map(other => nameKey(other.name)));
  return { ...folder, parentId, name: reserveName(folder.name, "", names) };
}

export function folderRemoval(folders: FolderEntry[], files: FileEntry[], id: string) {
  const removed = folders.find(folder => folder.id === id);
  if (!removed) throw new FileLibraryError("这个文件夹已被移除。");
  const folderNames = new Set(folders.filter(folder => folder.parentId === removed.parentId && folder.id !== id).map(folder => nameKey(folder.name)));
  const fileNames = namesInFolder(files, removed.parentId);
  const movedFolders = folders.filter(folder => folder.parentId === id).map(folder => ({
    ...folder, parentId: removed.parentId, name: reserveName(folder.name, "", folderNames),
  }));
  const movedFiles = files.filter(file => file.folderId === id).map(file => ({
    ...file, folderId: removed.parentId, name: reserveFileName(file.name, fileNames),
  }));
  return { removed, movedFolders, movedFiles };
}

function putFile(transaction: IDBTransaction, file: MarkdownFile) {
  transaction.objectStore(filesStore).add(fileEntry(file));
  transaction.objectStore(textStore).add(file.value, file.id);
}

function database() {
  if (connection) return connection;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lition13-markdown-editor", 3);
    let blocked = false;
    request.onupgradeneeded = event => {
      const db = request.result;
      db.createObjectStore(foldersStore, { keyPath: "id" });
      if (event.oldVersion >= 2) return;
      const transaction = request.transaction!;
      db.createObjectStore(filesStore, { keyPath: "id" });
      db.createObjectStore(textStore);
      const settings = db.createObjectStore(settingsStore);
      const seed = (file: MarkdownFile) => {
        putFile(transaction, file);
        settings.add(file.id, activeKey);
      };
      if (db.objectStoreNames.contains("drafts")) {
        const drafts = transaction.objectStore("drafts");
        const previous = drafts.get("current");
        previous.onsuccess = () => {
          const draft = previous.result as Partial<FileInput> | undefined;
          if (typeof draft?.name === "string" && typeof draft.value === "string") {
            seed({ id: "legacy-draft", name: draft.name, value: draft.value, revision: 0 });
            drafts.delete("current");
          } else {
            seed(exampleFile);
          }
        };
      } else {
        seed(exampleFile);
      }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new FileLibraryError("文件存储正在其他页面中使用。"));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        if (connection === opening) connection = undefined;
      };
      resolve(db);
    };
  });
  connection = opening;
  void opening.catch(() => {
    if (connection === opening) connection = undefined;
  });
  return opening;
}

function read<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (tx: IDBTransaction) => T | Promise<T>): Promise<T> {
  const db = await database();
  const tx = db.transaction([filesStore, textStore, settingsStore, foldersStore], mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new FileLibraryError("文件操作中断，请重试。"));
  });
  try {
    const [result] = await Promise.all([action(tx), done]);
    return result;
  } catch (error) {
    try { tx.abort(); } catch {}
    await done.catch(() => {});
    throw error;
  }
}

async function withText(tx: IDBTransaction, entry: FileEntry): Promise<MarkdownFile> {
  const value = await read<string | undefined>(tx.objectStore(textStore).get(entry.id));
  if (value === undefined) throw new FileLibraryError("无法读取此文件的内容。");
  const unchangedExample = entry.id === exampleFile.id && entry.name === exampleFile.name
    && entry.revision === 0 && previousExamples.has(value);
  return { ...entry, value: unchangedExample ? example.value : value };
}

export function readLibrary(): Promise<FileLibrary> {
  return transaction("readonly", async tx => {
    const [entries, folders, active] = await Promise.all([
      read<FileEntry[]>(tx.objectStore(filesStore).getAll()),
      read<FolderEntry[]>(tx.objectStore(foldersStore).getAll()),
      read<string | undefined>(tx.objectStore(settingsStore).get(activeKey)),
    ]);
    const files = sortByName(entries);
    const entry = files.find(file => file.id === active) ?? files[0];
    return { files, folders: sortByName(folders), current: entry ? await withText(tx, entry) : null };
  });
}

export function openFile(id: string): Promise<MarkdownFile> {
  return transaction("readwrite", async tx => {
    const entry = await read<FileEntry | undefined>(tx.objectStore(filesStore).get(id));
    if (!entry) throw new FileLibraryError("这个文件已被移除。");
    const file = await withText(tx, entry);
    tx.objectStore(settingsStore).put(id, activeKey);
    return file;
  });
}

async function confirmFolder(tx: IDBTransaction, folderId: string | null) {
  if (folderId !== null && !await read(tx.objectStore(foldersStore).getKey(folderId))) {
    throw new FileLibraryError("目标文件夹已被移除。");
  }
}

export function addFiles(inputs: [FileInput, ...FileInput[]], folderId: string | null): Promise<{ files: FileEntry[]; current: MarkdownFile }> {
  return transaction("readwrite", async tx => {
    const [entries] = await Promise.all([
      read<FileEntry[]>(tx.objectStore(filesStore).getAll()), confirmFolder(tx, folderId),
    ]);
    const created = newFiles(inputs, entries, folderId);
    for (const file of created) putFile(tx, file);
    tx.objectStore(settingsStore).put(created[0].id, activeKey);
    return { files: sortByName([...entries, ...created.map(fileEntry)]), current: created[0] };
  });
}

export function renameFile(id: string, input: string): Promise<FileEntry> {
  return transaction("readwrite", async tx => {
    const store = tx.objectStore(filesStore);
    const entry = renamedFile(await read<FileEntry[]>(store.getAll()), id, input);
    store.put(entry);
    return entry;
  });
}

export function removeFile(id: string, currentId: string | undefined): Promise<Pick<FileLibrary, "files" | "current">> {
  return transaction("readwrite", async tx => {
    const files = tx.objectStore(filesStore);
    const settings = tx.objectStore(settingsStore);
    const [entries, active] = await Promise.all([
      read<FileEntry[]>(files.getAll()),
      read<string | undefined>(settings.get(activeKey)),
    ]);
    const remaining = sortByName(entries.filter(file => file.id !== id));
    const removedFolder = entries.find(file => file.id === id)?.folderId ?? null;
    const next = remaining.find(file => file.id === currentId)
      ?? remaining.find(file => (file.folderId ?? null) === removedFolder) ?? remaining[0];
    files.delete(id);
    tx.objectStore(textStore).delete(id);
    if (id === currentId || id === active) {
      if (next) settings.put(next.id, activeKey);
      else settings.delete(activeKey);
    }
    return { files: remaining, current: id === currentId && next ? await withText(tx, next) : null };
  });
}

export function addFolder(name: string, parentId: string | null): Promise<FolderEntry> {
  return transaction("readwrite", async tx => {
    const store = tx.objectStore(foldersStore);
    const folder = newFolder(await read<FolderEntry[]>(store.getAll()), name, parentId);
    store.add(folder);
    return folder;
  });
}

export function renameFolder(id: string, name: string): Promise<FolderEntry> {
  return transaction("readwrite", async tx => {
    const store = tx.objectStore(foldersStore);
    const folder = renamedFolder(await read<FolderEntry[]>(store.getAll()), id, name);
    store.put(folder);
    return folder;
  });
}

export function moveFile(id: string, folderId: string | null): Promise<FileEntry> {
  return transaction("readwrite", async tx => {
    const store = tx.objectStore(filesStore);
    const [entries] = await Promise.all([read<FileEntry[]>(store.getAll()), confirmFolder(tx, folderId)]);
    const file = movedFile(entries, id, folderId);
    store.put(file);
    return file;
  });
}

export function moveFolder(id: string, parentId: string | null): Promise<FolderEntry> {
  return transaction("readwrite", async tx => {
    const store = tx.objectStore(foldersStore);
    const folder = movedFolder(await read<FolderEntry[]>(store.getAll()), id, parentId);
    store.put(folder);
    return folder;
  });
}

export function removeFolder(id: string): Promise<ReturnType<typeof folderRemoval>> {
  return transaction("readwrite", async tx => {
    const files = tx.objectStore(filesStore);
    const folders = tx.objectStore(foldersStore);
    const [folderEntries, fileEntries] = await Promise.all([
      read<FolderEntry[]>(folders.getAll()), read<FileEntry[]>(files.getAll()),
    ]);
    const result = folderRemoval(folderEntries, fileEntries, id);
    for (const folder of result.movedFolders) folders.put(folder);
    for (const file of result.movedFiles) files.put(file);
    folders.delete(id);
    return result;
  });
}

export function saveContent(id: string, value: string, revision: number): Promise<number> {
  return transaction("readwrite", async tx => {
    const store = tx.objectStore(filesStore);
    const file = await read<FileEntry | undefined>(store.get(id));
    if (!file) throw new FileLibraryError("文件已在另一个页面中删除。可导出当前内容。");
    if (file.revision !== revision) throw new FileLibraryError("文件已在另一个页面中修改。可导出当前内容。");
    const next = revision + 1;
    tx.objectStore(textStore).put(value, id);
    store.put({ ...file, revision: next });
    return next;
  });
}
