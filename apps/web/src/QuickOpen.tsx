import { FileText } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type Ref } from "react";
import { FileLibraryError, type FileEntry, type FolderEntry } from "./files";
import { indexFiles, searchFiles } from "./fileSearch";
import { useWebText, type WebMessage } from "./locale";
import PickerDialog, { type PickerDialogHandle } from "./PickerDialog";

export default function QuickOpen({ ref, files, folders, onClose, onOpen }: {
  ref?: Ref<PickerDialogHandle>;
  files: FileEntry[];
  folders: FolderEntry[];
  onClose: () => void;
  onOpen: (id: string) => Promise<void>;
}) {
  const t = useWebText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<WebMessage | null>(null);
  const opening = useRef(false);
  const index = useMemo(() => indexFiles(files, folders), [files, folders]);
  const find = useCallback((query: string) => searchFiles(index, query), [index]);

  async function openFile(id: string, close: () => void) {
    if (opening.current) return;
    opening.current = true;
    setBusy(true);
    setError(null);
    try {
      await onOpen(id);
      close();
    } catch (error) {
      setError(error instanceof FileLibraryError ? error.label : "无法读取此文件的内容。");
      setBusy(false);
      opening.current = false;
    }
  }

  return (
    <PickerDialog ref={ref} id="quick-open" title={t("快速打开文件")} placeholder={t("输入文件名或路径")} closeLabel={t("关闭快速打开")}
      resultsLabel={t("文件搜索结果")} emptyLabel={t("没有匹配的文件")} busy={busy} error={error ? t(error) : undefined}
      find={find} onQueryChange={() => setError(null)} onClose={onClose} onPick={(file, close) => { void openFile(file.id, close); }}
      render={file => <>
        <FileText size={17} aria-hidden="true" />
        <span className="quick-open-name" title={file.name}>{file.name}</span>
        {file.path && <span className="quick-open-path" title={file.path}>{file.path}</span>}
      </>} />
  );
}
