import { example } from "./example";

export interface FileEntry {
  id: string;
  name: string;
  revision: number;
}

export interface FileInput {
  name: string;
  value: string;
}

export type MarkdownFile = FileEntry & FileInput;

interface FileLibrary {
  files: FileEntry[];
  current: MarkdownFile | null;
}

const filesStore = "files";
const textStore = "contents";
const settingsStore = "settings";
const activeKey = "active-file";
const nameOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
let connection: Promise<IDBDatabase> | undefined;

export const exampleFile: MarkdownFile = { id: "example", revision: 0, ...example };
const nameKey = (name: string) => name.normalize("NFC").toLowerCase();

export function fileEntry({ id, name, revision }: FileEntry): FileEntry {
  return { id, name, revision };
}

export function sortedFiles(files: FileEntry[]) {
  return [...files].sort((left, right) => nameOrder.compare(left.name, right.name));
}

export function markdownName(input: string) {
  const name = input.trim();
  if (!name || /^\.+$/.test(name) || /[/\\]/.test(name)) {
    throw new Error("请输入有效的文件名，文件名不能包含斜杠。");
  }
  return /\.(?:md|markdown|txt)$/i.test(name) ? name : name + ".md";
}

export function newFiles(inputs: FileInput[], existing: FileEntry[]): MarkdownFile[] {
  const names = new Set(existing.map(file => nameKey(file.name)));
  return inputs.map(input => {
    const dot = input.name.lastIndexOf(".");
    const hasExtension = dot > 0;
    const stem = hasExtension ? input.name.slice(0, dot) : input.name;
    const extension = hasExtension ? input.name.slice(dot) : "";
    let name = input.name;
    for (let suffix = 2; names.has(nameKey(name)); suffix++) {
      name = stem + " (" + suffix + ")" + extension;
    }
    names.add(nameKey(name));
    return { id: crypto.randomUUID(), name, value: input.value, revision: 0 };
  });
}

export function renamedFile(files: FileEntry[], id: string, input: string): FileEntry {
  const file = files.find(file => file.id === id);
  if (!file) throw new Error("这个文件已被移除。");
  const name = markdownName(input);
  if (files.some(other => other.id !== id && nameKey(other.name) === nameKey(name))) {
    throw new Error("已有同名文件，请换一个名称。");
  }
  return { ...file, name };
}

function putFile(transaction: IDBTransaction, file: MarkdownFile) {
  transaction.objectStore(filesStore).add(fileEntry(file));
  transaction.objectStore(textStore).add(file.value, file.id);
}

function database() {
  if (connection) return connection;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lition13-markdown-editor", 2);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
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
      reject(new Error("文件存储正在其他页面中使用。"));
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
  const tx = db.transaction([filesStore, textStore, settingsStore], mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("文件操作中断，请重试。"));
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
  if (value === undefined) throw new Error("无法读取此文件的内容。");
  return { ...entry, value };
}

export function readLibrary(): Promise<FileLibrary> {
  return transaction("readonly", async tx => {
    const [entries, active] = await Promise.all([
      read<FileEntry[]>(tx.objectStore(filesStore).getAll()),
      read<string | undefined>(tx.objectStore(settingsStore).get(activeKey)),
    ]);
    const files = sortedFiles(entries);
    const entry = files.find(file => file.id === active) ?? files[0];
    return { files, current: entry ? await withText(tx, entry) : null };
  });
}

export function openFile(id: string): Promise<MarkdownFile> {
  return transaction("readwrite", async tx => {
    const entry = await read<FileEntry | undefined>(tx.objectStore(filesStore).get(id));
    if (!entry) throw new Error("这个文件已被移除。");
    const file = await withText(tx, entry);
    tx.objectStore(settingsStore).put(id, activeKey);
    return file;
  });
}

export function addFiles(inputs: [FileInput, ...FileInput[]]): Promise<{ files: FileEntry[]; current: MarkdownFile }> {
  return transaction("readwrite", async tx => {
    const entries = await read<FileEntry[]>(tx.objectStore(filesStore).getAll());
    const created = newFiles(inputs, entries);
    for (const file of created) putFile(tx, file);
    tx.objectStore(settingsStore).put(created[0].id, activeKey);
    return { files: sortedFiles([...entries, ...created.map(fileEntry)]), current: created[0] };
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

export function removeFile(id: string, currentId: string | undefined): Promise<FileLibrary> {
  return transaction("readwrite", async tx => {
    const files = tx.objectStore(filesStore);
    const settings = tx.objectStore(settingsStore);
    const [entries, active] = await Promise.all([
      read<FileEntry[]>(files.getAll()),
      read<string | undefined>(settings.get(activeKey)),
    ]);
    const remaining = sortedFiles(entries.filter(file => file.id !== id));
    const next = remaining.find(file => file.id === currentId) ?? remaining[0];
    files.delete(id);
    tx.objectStore(textStore).delete(id);
    if (id === currentId || id === active) {
      if (next) settings.put(next.id, activeKey);
      else settings.delete(activeKey);
    }
    return { files: remaining, current: id === currentId && next ? await withText(tx, next) : null };
  });
}

export function saveContent(id: string, value: string, revision: number): Promise<number> {
  return transaction("readwrite", async tx => {
    const store = tx.objectStore(filesStore);
    const file = await read<FileEntry | undefined>(store.get(id));
    if (!file) throw new Error("文件已在另一个页面中删除。可导出当前内容。");
    if (file.revision !== revision) throw new Error("文件已在另一个页面中修改。可导出当前内容。");
    const next = revision + 1;
    tx.objectStore(textStore).put(value, id);
    store.put({ ...file, revision: next });
    return next;
  });
}
