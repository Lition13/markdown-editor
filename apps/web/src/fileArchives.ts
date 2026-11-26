import {
  FileLibraryError, folderPath, markdownName, type FolderEntry, type LibraryImport, type MarkdownFile,
} from "./files";

const maximumZipBytes = 100 * 1024 * 1024;
const maximumZipEntries = 10_000;
const maximumZipDepth = 128;
const markdownExtension = /\.(?:md|markdown|txt)$/i;

function zipTooLarge(): never {
  throw new FileLibraryError("ZIP 文件和展开后的文本均需小于或等于 100 MiB，最多导入 10,000 个条目。");
}

async function readZip(file: File, usage: { entries: number; items: number; bytes: number }): Promise<LibraryImport> {
  if (file.size > maximumZipBytes) zipTooLarge();
  const { unzipSync } = await import("fflate");
  const imported: LibraryImport = { folders: [], files: [] };
  const folders = new Map<string, string>();
  const selected = new Map<string, { name: string; folderId: string | null }>();
  function importPath(parts: string[]) {
    let path = "";
    let parentId: string | null = null;
    for (const name of parts) {
      path += "/" + name;
      let id = folders.get(path);
      if (!id) {
        if (++usage.items > maximumZipEntries) zipTooLarge();
        id = crypto.randomUUID();
        folders.set(path, id);
        imported.folders.push({ id, name, parentId });
      }
      parentId = id;
    }
    return parentId;
  }

  try {
    const unpacked = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter(entry) {
        if (++usage.entries > maximumZipEntries) zipTooLarge();
        const path = entry.name.replaceAll("\\", "/").replace(/^(?:\.\/)+/, "");
        const directory = entry.name.endsWith("/") || entry.name.endsWith("\\");
        if (directory && !path) return false;
        const parts = (directory ? path.slice(0, -1) : path).split("/").map(part => part.trim());
        if (parts.length > maximumZipDepth || /^(?:\/|[a-z]:)/i.test(path.trimStart())
          || parts.some(part => !part || /^\.+$/.test(part) || /[\u0000-\u001f\u007f]/.test(part))) {
          throw new FileLibraryError("ZIP 中的目录结构无效。");
        }
        if (parts[0] === "__MACOSX") return false;
        if (directory) {
          importPath(parts);
          return false;
        }
        const name = parts.pop()!;
        if (!markdownExtension.test(name)) return false;
        if (selected.has(entry.name)) throw new FileLibraryError("ZIP 中有重复的文件路径。");
        const bytes = Math.max(entry.originalSize, entry.compression === 0 ? entry.size : 0);
        if (!Number.isSafeInteger(bytes) || bytes < 0) throw new FileLibraryError("无法读取 ZIP 文件。");
        usage.bytes += bytes;
        if (++usage.items > maximumZipEntries || usage.bytes > maximumZipBytes) zipTooLarge();
        selected.set(entry.name, { name: markdownName(name), folderId: importPath(parts) });
        return true;
      },
    });
    const decoder = new TextDecoder();
    for (const [path, entry] of selected) {
      const content = unpacked[path];
      if (!content) throw new FileLibraryError("无法读取 ZIP 文件。");
      imported.files.push({ ...entry, value: decoder.decode(content) });
    }
  } catch (error) {
    if (error instanceof FileLibraryError) throw error;
    throw new FileLibraryError("无法读取 ZIP 文件。");
  }
  if (!imported.files.length && !imported.folders.length) throw new FileLibraryError("ZIP 中没有 Markdown 文件或文件夹。");
  return imported;
}

export async function readImportFiles(files: File[]): Promise<LibraryImport> {
  const batch: LibraryImport = { folders: [], files: [] };
  const usage = { entries: 0, items: 0, bytes: 0 };
  for (const file of files) {
    if (/\.zip$/i.test(file.name) || file.type === "application/zip" || file.type === "application/x-zip-compressed") {
      const imported = await readZip(file, usage);
      batch.folders.push(...imported.folders);
      batch.files.push(...imported.files);
    } else batch.files.push({ name: markdownName(file.name), value: await file.text(), folderId: null });
  }
  return batch;
}

function archiveName(name: string) {
  return name.replace(/[<>:"/\\|?*%\u0000-\u001f\u007f]/g, value =>
    "%" + value.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"),
  ).replace(/\.+$/, dots => "%2E".repeat(dots.length));
}

export async function makeFolderZip({ root, folders, files }: { root: FolderEntry; folders: FolderEntry[]; files: MarkdownFile[] }) {
  const { strToU8, zipSync } = await import("fflate");
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const entries: Record<string, Uint8Array> = Object.create(null);
  const paths = new Map(folders.map(folder => [
    folder.id, folderPath(byId, folder.id).map(part => archiveName(part.name)).join("/") + "/",
  ]));
  for (const path of paths.values()) entries[path] = new Uint8Array();
  for (const file of files) {
    const dir = file.folderId ? paths.get(file.folderId) : undefined;
    if (dir) entries[dir + archiveName(file.name)] = strToU8(file.value);
  }
  const data = zipSync(entries, { level: 1 });
  return { name: archiveName(root.name) + ".zip", blob: new Blob([data], { type: "application/zip" }) };
}
