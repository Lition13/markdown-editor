import { EditorView, WidgetType } from "@codemirror/view";
import { AlignCenter, AlignLeft, AlignRight, MoreHorizontal, Table2 } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { suppressBackspaceRepeat } from "../core/keyboard";
import { cellsRemovedByResize, changeMarkdownTable, serializeMarkdownTable, tableCellChange, tableModel, type MarkdownTable, type TableCellAddress, type TableCellRange, type TableCommand, type TableLayout } from "../core/markdownTable";
import { pairedSymbolAfterInput } from "../core/markdownPairs";
import { formatMarkdownInline, isInlineMarkdownFormat, isNativeHistoryShortcut, type MarkdownShortcutAction } from "../core/markdownShortcuts";
import { editorShortcutPrefix } from "../core/shortcutKeys";
import { completedSymbolPair } from "./markdownPairComposition";
import ActionMenu, { eventPoint, type ActionItem, type MenuPoint } from "./ActionMenu";
import MarkdownContent, { type MarkdownCellPosition } from "./MarkdownContent";
import MarkdownTableSize from "./MarkdownTableSize";
import { copyMarkdownText, useMarkdownEnvironment } from "./editorContext";
import { useMarkdownKeySequence } from "./useMarkdownKeySequence";
import { WidgetEnvironment, widgetEnvironment } from "./widgetEnvironment";

type ReadTable = (view: EditorView, from: number) => TableLayout | undefined;

type CellEdit = TableCellAddress & {
  key: number;
  draft: string;
  range?: TableCellRange;
  written: string;
};
type TablePanel = { kind: "actions" | "size"; address: TableCellAddress; point: MenuPoint; anchor: HTMLElement };
type CellCaret = number | "end";
type TableFocus = { from: number; address: TableCellAddress; caret?: CellCaret };
type LeaveTable = (view: EditorView, from: number, to: number, down: boolean) => void;

const pendingFocus = new WeakMap<EditorView, TableFocus>();
const mountedFocus = new WeakMap<HTMLElement, () => boolean>();
const tableStructureShortcuts: Partial<Record<MarkdownShortcutAction, TableCommand>> = {
  rowUp: { kind: "move-row", direction: -1 },
  rowDown: { kind: "move-row", direction: 1 },
  columnLeft: { kind: "move-column", direction: -1 },
  columnRight: { kind: "move-column", direction: 1 },
  deleteRow: { kind: "delete-row" },
};

export function requestTableFocus(view: EditorView, from: number, address: TableCellAddress, caret?: CellCaret) {
  pendingFocus.set(view, { from, address, caret });
}

export function focusLiveTable(view: EditorView, from: number, to: number, address: TableCellAddress, down: boolean) {
  requestTableFocus(view, from, address, down ? 0 : "end");
  // Stabilize the widget before focusing its cell. Moving away from a table
  // edge can remove the empty cursor line CodeMirror renders at that edge.
  view.dispatch({ selection: { anchor: down ? from + 1 : to - 1 }, scrollIntoView: true });
  for (const host of view.contentDOM.querySelectorAll<HTMLElement>(".notes-live-table")) {
    if (mountedFocus.get(host)?.()) return;
  }
}

function clickedOffset(event: MouseEvent<HTMLElement>, source: string) {
  const cell = event.currentTarget;
  const hit = cell.ownerDocument.caretRangeFromPoint(event.clientX, event.clientY);
  if (!hit || !cell.contains(hit.startContainer)) return source.length;
  const prefix = cell.ownerDocument.createRange();
  prefix.selectNodeContents(cell);
  prefix.setEnd(hit.startContainer, hit.startOffset);
  const textStart = source.indexOf(cell.textContent ?? "");
  return Math.min(source.length, Math.max(0, textStart) + prefix.toString().length);
}

function EditableTable({ view, host, layout, read, leaveTable }: {
  view: EditorView;
  host: HTMLElement;
  layout: TableLayout;
  read: ReadTable;
  leaveTable: LeaveTable;
}) {
  const environment = useMarkdownEnvironment();
  const shortcuts = environment.shortcuts;
  const keySequence = useMarkdownKeySequence(shortcuts.hasSequence("table"));
  const [editing, setEditing] = useState<CellEdit | null>(null);
  const [panel, setPanel] = useState<TablePanel | null>(null);
  const [copyFeedback, setCopyFeedback] = useState("");
  const panelRef = useRef<TablePanel | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const editCounter = useRef(0);
  const pendingCaret = useRef<number | null>(null);
  const cellSelection = useRef({ start: 0, end: 0 });
  const compositionStart = useRef<string | null>(null);
  const bindField = useCallback((input: HTMLInputElement | null) => {
    field.current = input;
    if (!input) return;
    input.focus({ preventScroll: true });
    if (pendingCaret.current === null) input.select();
    else input.setSelectionRange(pendingCaret.current, pendingCaret.current);
    cellSelection.current = { start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0 };
    input.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);

  const current = () => {
    if (!host.isConnected) return null;
    const from = view.posAtDOM(host);
    const table = read(view, from);
    return table ? { from, table } : null;
  };

  const startEditing = (row: number, column: number, caret?: CellCaret | MouseEvent<HTMLElement>) => {
    const location = current();
    const target = location?.table.rows[row];
    if (!location || !target) return;
    const range = target.cells[column];
    const draft = range ? location.table.source.slice(range.from, range.to) : "";
    pendingCaret.current = typeof caret === "number" ? Math.min(caret, draft.length)
      : caret === "end" ? draft.length : caret ? clickedOffset(caret, draft) : null;
    setEditing({ row, column, draft, key: ++editCounter.current, range, written: draft });
    view.dispatch({ selection: { anchor: location.from + (range?.from ?? target.to) } });
  };

  useLayoutEffect(() => {
    const focus = () => {
      const request = pendingFocus.get(view);
      if (!request || !host.isConnected || view.posAtDOM(host) !== request.from) return false;
      pendingFocus.delete(view);
      startEditing(request.address.row, request.address.column, request.caret);
      return true;
    };
    mountedFocus.set(host, focus);
    focus();
    return () => { mountedFocus.delete(host); };
  }, [view, host, layout.source]);

  const changeCell = (entry: CellEdit, draft: string, userEvent = "input.type") => {
    const location = current();
    const row = location?.table.rows[entry.row];
    if (!location || !row) return;
    const { from, table } = location;
    const previous = entry.range;
    const range = previous && table.source.slice(previous.from, previous.to) === entry.written
      ? previous : row.cells[entry.column];
    const edit = tableCellChange(table, entry, draft, range);
    setEditing({ ...entry, draft, range: edit.range, written: edit.content });
    view.dispatch({ changes: { from: from + edit.from, to: from + edit.to, insert: edit.insert }, userEvent });
  };

  const leave = (backwards = false) => {
    const location = current();
    setEditing(null);
    if (!location) return;
    const { from, table } = location;
    const anchor = backwards ? Math.max(0, from - 1) : Math.min(view.state.doc.length, from + table.source.length + 1);
    view.dispatch({ selection: { anchor }, scrollIntoView: true });
    view.focus();
  };

  const closePanel = (restore = true) => {
    const active = panelRef.current;
    panelRef.current = null;
    setPanel(null);
    if (restore && active) startEditing(active.address.row, active.address.column);
    else if (!restore && document.activeElement !== field.current) setEditing(null);
  };

  const openPanel = (kind: TablePanel["kind"], address: TableCellAddress, event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = eventPoint(event);
    const next = { kind, address, point: point.x || point.y ? point : { x: rect.left, y: rect.bottom + 4 }, anchor: event.currentTarget };
    setCopyFeedback("");
    panelRef.current = next;
    setPanel(next);
  };

  const rewrite = (table: MarkdownTable, address: TableCellAddress, pad = false) => {
    const location = current();
    if (!location) return;
    const { from, table: before } = location;
    const indent = view.state.sliceDoc(view.state.doc.lineAt(from).from, from);
    const insert = serializeMarkdownTable(table, pad).replace(/\n/g, "\n" + indent);
    closePanel(false);
    if (insert !== before.source) view.dispatch({ changes: { from, to: from + before.source.length, insert }, userEvent: "input.structure" });
    startEditing(address.row, address.column);
  };

  const changeStructure = (command: TableCommand, address: TableCellAddress) => {
    const location = current();
    if (!location) return;
    const result = changeMarkdownTable(tableModel(location.table), address, command);
    if (result) rewrite(result.table, result.address);
    else closePanel();
  };

  const removeTable = (location = current()) => {
    if (!location) return;
    closePanel(false);
    setEditing(null);
    view.dispatch({ changes: { from: location.from, to: location.from + location.table.source.length }, userEvent: "input.structure", selection: { anchor: location.from }, scrollIntoView: true });
    view.focus();
  };

  const copyTable = async () => {
    const location = current();
    closePanel();
    if (!location) return;
    try {
      await copyMarkdownText(location.table.source, environment);
      setCopyFeedback("已复制表格");
    } catch { setCopyFeedback("复制表格失败"); }
  };

  const insertRow = (rowIndex: number, column: number) => {
    const location = current();
    if (!location) return;
    const { from, table } = location;
    // The alignment row follows the header and stays above any new body rows.
    const firstBody = table.rows[1];
    const after = rowIndex === 0
      ? (firstBody ? view.state.doc.lineAt(from + firstBody.from).from - from - 1 : table.source.length)
      : table.rows[rowIndex].to;
    const insert = "\n|" + "   |".repeat(table.columns);
    view.dispatch({ changes: { from: from + after, insert }, userEvent: "input.structure" });
    startEditing(rowIndex + 1, column);
  };

  const handleKeys = (event: KeyboardEvent<HTMLInputElement>, entry: CellEdit) => {
    const input = event.currentTarget;
    if (event.nativeEvent.isComposing || compositionStart.current !== null || input !== input.ownerDocument.activeElement) return;
    const prefixed = keySequence.read(event);
    if (prefixed === null) return;
    const action = shortcuts.match("table", event, prefixed);
    if (action === "undo" || action === "redo" || (!action && isNativeHistoryShortcut(event))) {
      event.preventDefault();
      event.stopPropagation();
      if (action && !event.repeat) environment.onTableHistory?.(action === "redo");
      return;
    }
    if (isInlineMarkdownFormat(action)) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) {
        const edit = formatMarkdownInline(entry.draft, { start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0 }, action);
        input.value = edit.value;
        input.setSelectionRange(edit.start, edit.end);
        cellSelection.current = { start: edit.start, end: edit.end };
        if (edit.value !== entry.draft) changeCell(entry, edit.value, "input.structure");
      }
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    const { row, column } = entry;
    const { key } = event;
    const structure = action && tableStructureShortcuts[action];
    if (structure) {
      if (!event.repeat) changeStructure(structure, entry);
    } else if (action === "insertRow") {
      if (!event.repeat) insertRow(row, column);
    } else if (event.altKey) return;
    else if (key === "Escape") leave();
    else if (mod) return;
    else if (!event.shiftKey && (key === "ArrowUp" || key === "ArrowDown")) {
      const down = key === "ArrowDown";
      const next = row + (down ? 1 : -1);
      const location = current();
      if (!location) return;
      if (next >= 0 && next < location.table.rows.length) {
        startEditing(next, column, event.currentTarget.selectionEnd ?? 0);
      } else {
        setEditing(null);
        leaveTable(view, location.from, location.from + location.table.source.length, down);
      }
    } else if (event.key === "Enter") {
      if (row + 1 < layout.rows.length) startEditing(row + 1, column);
      else leave();
    } else if (key === "Tab" || (!event.shiftKey && (key === "ArrowLeft" || key === "ArrowRight"))) {
      const tab = key === "Tab";
      const backwards = event.shiftKey || key === "ArrowLeft";
      if (!tab) {
        const edge = backwards ? 0 : input.value.length;
        if (input.selectionStart !== edge || input.selectionEnd !== edge) return;
      }
      const { columns, rows } = layout;
      const index = row * columns + column + (backwards ? -1 : 1);
      if (index >= 0 && index < rows.length * columns) {
        const caret = tab ? undefined : backwards ? "end" : 0;
        startEditing(Math.floor(index / columns), index % columns, caret);
      } else if (!tab) return;
      else if (backwards) leave(true);
      else insertRow(row, 0);
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const renderCell = ({ rowOffset, column }: MarkdownCellPosition, children: ReactNode) => {
    const row = layout.rows.findIndex(item => item.from === rowOffset);
    if (row < 0) return children;
    const entry = editing?.row === row && editing.column === column ? editing : null;
    const label = `表格第 ${row + 1} 行第 ${column + 1} 列`;
    return <span className="notes-table-cell" tabIndex={entry ? -1 : 0}
      onContextMenu={event => openPanel("actions", { row, column }, event)}
      onMouseDown={event => {
        if (entry || event.button !== 0 || (event.target instanceof Element && event.target.closest("a, button, input"))) return;
        event.preventDefault();
        startEditing(row, column, event);
      }}
      onKeyDown={event => {
        if (event.defaultPrevented || event.nativeEvent.isComposing || compositionStart.current !== null) return;
        if (row === 0 && column === 0 && event.key === "Backspace"
          && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
          && event.target === (entry ? field.current : event.currentTarget)) {
          const location = current();
          if (!location) return;
          const { table } = location;
          const range = table.rows[0].cells[0];
          const source = range ? table.source.slice(range.from, range.to) : "";
          if (source.trim() || (entry && field.current?.value.trim())) return;
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat) {
            suppressBackspaceRepeat(environment.surface, environment.overlay);
            removeTable(location);
          }
          return;
        }
        if (entry || event.key !== "Enter" || event.target !== event.currentTarget) return;
        event.preventDefault();
        startEditing(row, column);
      }}>
      <span className={entry ? "notes-table-cell-hidden" : undefined} aria-hidden={!!entry}>{children}</span>
      {entry && <input key={entry.key} ref={bindField} aria-label={`编辑${label}`} value={entry.draft} spellCheck={false}
        onCompositionStart={() => {
          keySequence.reset();
          compositionStart.current = entry.draft;
        }}
        onCompositionEnd={event => {
          const before = compositionStart.current;
          compositionStart.current = null;
          const input = event.currentTarget;
          const pair = before !== null && completedSymbolPair(before, input.value, input.selectionEnd, event.data);
          if (!pair) return;
          input.value = pair.edit.value;
          input.setSelectionRange(pair.edit.start, pair.edit.end);
          cellSelection.current = pair.edit;
          if (pair.edit.value !== entry.draft) changeCell(entry, pair.edit.value);
        }}
        onChange={event => {
          const input = event.currentTarget;
          const native = event.nativeEvent as InputEvent;
          const pair = !native.isComposing && pairedSymbolAfterInput(entry.draft, input.value, input.selectionEnd ?? undefined, {
            inputType: native.inputType, previousSelection: cellSelection.current,
          });
          if (pair) {
            input.value = pair.edit.value;
            input.setSelectionRange(pair.edit.start, pair.edit.end);
            if (pair.edit.value !== entry.draft) changeCell(entry, pair.edit.value, "input.pair");
          } else changeCell(entry, input.value);
          cellSelection.current = { start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0 };
        }}
        onSelect={event => {
          const input = event.currentTarget;
          cellSelection.current = { start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0 };
        }}
        onPointerDown={keySequence.reset}
        onBlur={() => {
          keySequence.reset();
          if (!panelRef.current) setEditing(active => active?.key === entry.key ? null : active);
        }}
        onKeyDown={event => handleKeys(event, entry)} />}
    </span>;
  };

  const active = panel?.address ?? editing;
  const toolbarVisible = !!active;
  useLayoutEffect(() => {
    const tools = toolbar.current;
    if (!toolbarVisible || !tools) return;
    const scroll = host.closest(".markdown-editor-modal .notes-editor-body");
    const place = () => {
      const table = host.getBoundingClientRect();
      const viewport = scroll?.getBoundingClientRect();
      const title = environment.topInset;
      const top = Math.max(8, title, viewport?.top ?? 0);
      const bottom = Math.min(window.innerHeight - 8, viewport?.bottom ?? window.innerHeight);
      const width = tools.offsetWidth;
      tools.style.left = `${Math.max(8, Math.min(table.right - width - 4, window.innerWidth - width - 8))}px`;
      tools.style.top = `${Math.max(top, Math.min(table.top - tools.offsetHeight - 3, bottom - tools.offsetHeight))}px`;
      tools.style.visibility = table.bottom <= top || table.top >= bottom ? "hidden" : "visible";
    };
    const size = new ResizeObserver(place);
    size.observe(host);
    size.observe(tools);
    place();
    document.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      size.disconnect();
      document.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [toolbarVisible, host, environment.topInset, environment.overlay]);
  const alignments = [
    { value: "left", label: "左对齐", Icon: AlignLeft },
    { value: "center", label: "居中对齐", Icon: AlignCenter },
    { value: "right", label: "右对齐", Icon: AlignRight },
  ] as const;
  const actions: ActionItem[] = [];
  if (panel?.kind === "actions") {
    const address = panel.address;
    const { row, column } = address;
    const action = (id: string, label: string, command: TableCommand, disabled = false, shortcut?: string): ActionItem => ({
      id, label, disabled, shortcut, keepOpen: true, run: () => changeStructure(command, address),
    });
    actions.push(
      action("row-before", "上方插入行", { kind: "insert-row", direction: -1 }, row === 0),
      action("row-after", "下方插入行", { kind: "insert-row", direction: 1 }, false, shortcuts.labels.insertRow),
      action("col-before", "左侧插入列", { kind: "insert-column", direction: -1 }),
      action("col-after", "右侧插入列", { kind: "insert-column", direction: 1 }),
      { id: "move-divider", separator: true },
      action("row-up", "上移该行", { kind: "move-row", direction: -1 }, row <= 1, shortcuts.labels.rowUp),
      action("row-down", "下移该行", { kind: "move-row", direction: 1 }, row === 0 || row === layout.rows.length - 1, shortcuts.labels.rowDown),
      action("col-left", "左移该列", { kind: "move-column", direction: -1 }, column === 0, shortcuts.labels.columnLeft),
      action("col-right", "右移该列", { kind: "move-column", direction: 1 }, column === layout.columns - 1, shortcuts.labels.columnRight),
      { id: "table-divider", separator: true },
      action("row-remove", "删除行", { kind: "delete-row" }, row === 0, shortcuts.labels.deleteRow),
      action("col-remove", "删除列", { kind: "delete-column" }, layout.columns === 1),
      { id: "copy", label: "复制表格", keepOpen: true, run: () => void copyTable() },
      { id: "format", label: "格式化表格源码", keepOpen: true, run: () => {
        const location = current();
        if (location) rewrite(tableModel(location.table), address, true);
      } },
      { id: "remove", label: "删除表格", danger: true, keepOpen: true, run: removeTable },
    );
  }

  return <>
    {keySequence.waiting && environment.overlay && createPortal(
      <div className="notes-key-sequence" role="status">已输入 {editorShortcutPrefix}，等待下一个键</div>, environment.overlay,
    )}
    {active && environment.overlay && createPortal(<div ref={toolbar} className="notes-table-toolbar" role="toolbar" aria-label="表格工具" onMouseDown={event => event.preventDefault()}>
      <button type="button" aria-label="调整表格大小" title="调整行列数" onClick={event => openPanel("size", active, event)}><Table2 size={15} /></button>
      {alignments.map(({ value, label, Icon }) => (
        <button type="button" key={value} aria-label={label} title={label + "当前列"} aria-pressed={layout.align[active.column] === value}
          onClick={() => changeStructure({ kind: "align", alignment: value }, active)}><Icon size={15} /></button>
      ))}
      <button type="button" aria-label="表格行列操作" title="行列操作" onClick={event => openPanel("actions", active, event)}><MoreHorizontal size={16} /></button>
      {copyFeedback && <span role="status" className="notes-table-copy-status">{copyFeedback}</span>}
    </div>, environment.overlay)}
    <MarkdownContent value={layout.source} renderTableCell={renderCell} />
    {panel && <ActionMenu label={panel.kind === "size" ? "调整表格大小" : "表格行列操作"} point={panel.point} anchor={panel.anchor}
      className={panel.kind === "size" ? "notes-command-panel" : "notes-table-menu"} dialog={panel.kind === "size"}
      closeLabel="关闭表格操作" onClose={closePanel} items={panel.kind === "actions" ? actions : [{
        id: "table-size", content: <MarkdownTableSize initial={{ rows: layout.rows.length, columns: layout.columns }} label="应用尺寸"
          removedCells={size => cellsRemovedByResize(tableModel(layout), size)} onApply={size => changeStructure({ kind: "resize", size }, panel.address)} />,
      }]} />}
  </>;
}

const roots = new WeakMap<HTMLElement, Root>();

export class LiveTableWidget extends WidgetType {
  constructor(readonly layout: TableLayout, readonly read: ReadTable, readonly leaveTable: LeaveTable) { super(); }
  eq(other: LiveTableWidget) { return other.layout.source === this.layout.source; }
  toDOM(view: EditorView) {
    const element = document.createElement("div");
    element.className = "cm-md-rendered-block notes-live-table";
    roots.set(element, createRoot(element));
    this.updateDOM(element, view);
    return element;
  }
  updateDOM(element: HTMLElement, view: EditorView) {
    const root = roots.get(element);
    if (!root) return false;
    root.render(<WidgetEnvironment store={view.state.facet(widgetEnvironment)}>
      <EditableTable view={view} host={element} layout={this.layout} read={this.read} leaveTable={this.leaveTable} />
    </WidgetEnvironment>);
    return true;
  }
  destroy(element: HTMLElement) {
    const root = roots.get(element);
    roots.delete(element);
    queueMicrotask(() => root?.unmount());
  }
}
