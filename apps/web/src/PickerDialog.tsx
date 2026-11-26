import { Search, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useResultNavigation } from "./fileSearch";

export default function PickerDialog<T extends { id: string }>({ id, title, placeholder, closeLabel, resultsLabel, emptyLabel,
  busy = false, error, searchIcon, find, render, onQueryChange, onPick, onClose,
}: {
  id: string;
  title: string;
  placeholder: string;
  closeLabel: string;
  resultsLabel: string;
  emptyLabel: string;
  busy?: boolean;
  error?: string;
  searchIcon?: ReactNode;
  find: (query: string) => readonly T[];
  render: (item: T) => ReactNode;
  onQueryChange?: () => void;
  onPick: (item: T, close: () => void) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => find(query), [find, query]);
  const resultsId = id + "-results";
  const optionId = (itemId: string) => id + "-option-" + itemId;
  const close = () => dialog.current?.close();
  const pick = (item: T) => onPick(item, close);
  const navigation = useResultNavigation(results, { selectFirst: true, disabled: busy, elementId: optionId, onAccept: pick });

  useLayoutEffect(() => {
    const panel = dialog.current;
    if (panel && !panel.open) panel.showModal();
    input.current?.focus();
  }, []);

  return (
    <dialog ref={dialog} id={id} className="quick-open" aria-label={title} aria-busy={busy || undefined} onClose={onClose}
      onCancel={event => { if (busy) event.preventDefault(); }}
      onClick={event => { if (event.target === event.currentTarget && !busy) close(); }}>
      <div className="quick-open-body">
        <div className="quick-open-query">
          {searchIcon ?? <Search size={18} aria-hidden="true" />}
          <input ref={input} type="text" role="combobox" aria-label={placeholder} placeholder={placeholder}
            aria-autocomplete="list" aria-expanded={results.length > 0} aria-controls={resultsId}
            aria-activedescendant={navigation.active ? optionId(navigation.active.id) : undefined}
            autoComplete="off" value={query} readOnly={busy} onKeyDown={navigation.onKeyDown}
            onChange={event => {
              setQuery(event.currentTarget.value);
              onQueryChange?.();
              navigation.select(null);
            }} />
          <button className="icon-control" type="button" aria-label={closeLabel} title={closeLabel}
            disabled={busy} onClick={close}><X size={17} aria-hidden="true" /></button>
        </div>
        <ul id={resultsId} className="quick-open-results" role="listbox" aria-label={resultsLabel} aria-busy={busy || undefined} hidden={!results.length}>
          {results.map(item => (
            <li key={item.id} role="presentation">
              <button type="button" role="option" id={optionId(item.id)} aria-selected={navigation.active?.id === item.id}
                tabIndex={-1} disabled={busy} onClick={() => pick(item)}>{render(item)}</button>
            </li>
          ))}
        </ul>
        {!results.length && <p className="quick-open-empty" role="status">{emptyLabel}</p>}
        {error && <p className="quick-open-error" role="alert">{error}</p>}
      </div>
    </dialog>
  );
}
