import { useEffect, useRef, useState } from "react";
import {
  addFiles, exampleFile, fileEntry, newFiles, openFile, readLibrary, removeFile, renamedFile, renameFile,
  saveContent, sortedFiles, type FileEntry, type FileInput, type MarkdownFile,
} from "./files";

interface PendingEdit {
  value: string;
  revision: number;
  saving: boolean;
}

export function useFileLibrary() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [current, setCurrent] = useState<MarkdownFile | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionOnly, setSessionOnly] = useState(false);
  const [progress, setProgress] = useState<Partial<Record<string, string | null>>>({});
  const active = useRef<MarkdownFile | null>(null);
  const memory = useRef<Map<string, string> | null>(null);
  const pending = useRef(new Map<string, PendingEdit>());

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
    void readLibrary().then(library => {
      if (!mounted) return;
      setFiles(library.files);
      show(library.current);
    }).catch(() => {
      if (!mounted) return;
      memory.current = new Map([[exampleFile.id, exampleFile.value]]);
      setSessionOnly(true);
      setFiles([fileEntry(exampleFile)]);
      show(exampleFile);
    }).finally(() => {
      if (mounted) setReady(true);
    });
    return () => { mounted = false; };
  }, []);

  function markSave(id: string, state: string | null | undefined) {
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
      const message = error instanceof Error && !(error instanceof DOMException)
        ? error.message : "保存失败，可导出当前内容。";
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

  async function add(inputs: [FileInput, ...FileInput[]]) {
    if (!memory.current) {
      const result = await addFiles(inputs);
      setFiles(result.files);
      show(result.current);
      return;
    }
    const created = newFiles(inputs, files);
    for (const file of created) memory.current.set(file.id, file.value);
    setFiles(sortedFiles([...files, ...created.map(fileEntry)]));
    show(created[0]);
  }

  async function rename(id: string, name: string) {
    const entry = memory.current ? renamedFile(files, id, name) : await renameFile(id, name);
    setFiles(previous => sortedFiles(previous.map(file => file.id === id ? entry : file)));
    if (active.current?.id === id) show({ ...active.current, name: entry.name });
  }

  async function remove(id: string) {
    const currentId = active.current?.id;
    if (memory.current) {
      memory.current.delete(id);
      const remaining = files.filter(file => file.id !== id);
      setFiles(remaining);
      if (id === currentId) {
        const next = remaining[0];
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
  let status = "已保存到此浏览器";
  if (!ready) status = "正在读取文件…";
  else if (sessionOnly) status = "浏览器存储不可用，文件仅保留在此页面";
  else if (typeof activeSave === "string") status = activeSave;
  else if (activeSave === null) status = "正在保存…";
  else if (unsavedIds.length) status = "有文件尚未保存";
  else if (!current) status = "暂无文件";
  else if (current.id === exampleFile.id && current.revision === 0 && current.name === exampleFile.name) {
    status = "示例文档";
  }

  return { files, current, ready, status, sessionOnly, unsavedIds, change, open, add, rename, remove };
}
