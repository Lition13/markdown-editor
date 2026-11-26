import { FileText, Search, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { FileLibraryError, type FileEntry, type FolderEntry } from "./files";
import { indexFiles, searchFiles, useResultNavigation } from "./fileSearch";
import { useWebText, type WebMessage } from "./locale";

const optionId = (id: string) => "quick-open-file-" + id;

export default function QuickOpen({ files, folders, onClose, onOpen }: {
  files: FileEntry[];
  folders: FolderEntry[];
  onClose: () => void;
  onOpen: (id: string) => Promise<void>;
}) {
  const t = useWebText();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<WebMessage | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const opening = useRef(false);
  const index = useMemo(() => indexFiles(files, folders), [files, folders]);
  const results = useMemo(() => searchFiles(index, query), [index, query]);
  const navigation = useResultNavigation(results, {
    selectFirst: true, disabled: busy, elementId: optionId, onAccept: file => { void openFile(file.id); },
  });

  useLayoutEffect(() => {
    const panel = dialog.current;
    if (panel && !panel.open) panel.showModal();
    input.current?.focus();
  }, []);

  async function openFile(id: string) {
    if (opening.current) return;
    opening.current = true;
    setBusy(true);
    setError(null);
    try {
      await onOpen(id);
      dialog.current?.close();
    } catch (error) {
      setError(error instanceof FileLibraryError ? error.label : "无法读取此文件的内容。");
      setBusy(false);
      opening.current = false;
    }
  }

  return (
    <dialog ref={dialog} id="quick-open" className="quick-open" aria-label={t("快速打开文件")} aria-busy={busy || undefined} onClose={onClose}
      onCancel={event => { if (opening.current) event.preventDefault(); }}
      onClick={event => { if (event.target === event.currentTarget && !opening.current) dialog.current?.close(); }}>
      <div className="quick-open-body">
        <div className="quick-open-query">
          <Search size={18} aria-hidden="true" />
          <input ref={input} type="text" role="combobox" aria-label={t("输入文件名或路径")} placeholder={t("输入文件名或路径")}
            aria-autocomplete="list" aria-expanded={results.length > 0} aria-controls="quick-open-results"
            aria-activedescendant={navigation.active ? optionId(navigation.active.id) : undefined}
            autoComplete="off" value={query} readOnly={busy} onKeyDown={navigation.onKeyDown}
            onChange={event => {
              setQuery(event.currentTarget.value);
              setError(null);
              navigation.select(null);
            }} />
          <button className="icon-control" type="button" aria-label={t("关闭快速打开")} title={t("关闭快速打开")}
            disabled={busy} onClick={() => dialog.current?.close()}><X size={17} aria-hidden="true" /></button>
        </div>
        <ul id="quick-open-results" className="quick-open-results" role="listbox" aria-label={t("文件搜索结果")} aria-busy={busy || undefined} hidden={!results.length}>
          {results.map(file => (
            <li key={file.id} role="presentation">
              <button type="button" role="option" id={optionId(file.id)} aria-selected={navigation.active?.id === file.id}
                tabIndex={-1} disabled={busy} onClick={() => { void openFile(file.id); }}>
                <FileText size={17} aria-hidden="true" />
                <span className="quick-open-name" title={file.name}>{file.name}</span>
                {file.path && <span className="quick-open-path" title={file.path}>{file.path}</span>}
              </button>
            </li>
          ))}
        </ul>
        {!results.length && <p className="quick-open-empty" role="status">{t("没有匹配的文件")}</p>}
        {error && <p className="quick-open-error" role="alert">{t(error)}</p>}
      </div>
    </dialog>
  );
}
