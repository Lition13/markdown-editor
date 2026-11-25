import { useRef, useState } from "react";
import type { TableSize } from "../core/markdownTable";
import { useMarkdownEnvironment } from "./editorContext";

const cells = Array.from({ length: 36 }, (_, index) => ({ rows: Math.floor(index / 6) + 1, columns: index % 6 + 1 }));

export default function MarkdownTableSize({ initial, label, removedCells, cycleFields = false, onApply }: {
  initial: TableSize;
  label: string;
  removedCells?: (size: TableSize) => number;
  cycleFields?: boolean;
  onApply: (size: TableSize) => void;
}) {
  const { t } = useMarkdownEnvironment();
  const [rows, setRows] = useState(String(initial.rows));
  const [columns, setColumns] = useState(String(initial.columns));
  const [hover, setHover] = useState<TableSize | null>(null);
  const rowField = useRef<HTMLInputElement>(null);
  const columnField = useRef<HTMLInputElement>(null);
  const maxRows = Math.max(200, initial.rows), maxColumns = Math.max(50, initial.columns);
  const size = { rows: Number(rows), columns: Number(columns) };
  const valid = Number.isInteger(size.rows) && size.rows >= 1 && size.rows <= maxRows
    && Number.isInteger(size.columns) && size.columns >= 1 && size.columns <= maxColumns;
  const selected = hover ?? size;
  const removed = valid ? removedCells?.(size) ?? 0 : 0;
  return <form className="notes-table-size"
    onKeyDown={event => {
      if (!cycleFields || event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      (event.target === rowField.current ? columnField.current : rowField.current)?.focus();
    }}
    onSubmit={event => {
      event.preventDefault();
      if (valid) onApply(size);
    }}>
    <div className="notes-table-size-grid" onPointerLeave={() => setHover(null)}>
      {cells.map(cell => {
        const title = t("{rows} 行 {columns} 列", { rows: cell.rows, columns: cell.columns });
        return <button type="button" key={`${cell.rows}-${cell.columns}`} title={title} aria-label={t("选择 {size}", { size: title })} tabIndex={-1}
          className={cell.rows <= selected.rows && cell.columns <= selected.columns ? "selected" : undefined}
          onPointerEnter={() => setHover(cell)} onClick={() => { setRows(String(cell.rows)); setColumns(String(cell.columns)); }} />;
      })}
    </div>
    <div className="notes-table-size-fields">
      <label>{t("行数（含表头）")}<input ref={rowField} type="number" min={1} max={maxRows} value={rows} onChange={event => setRows(event.target.value)} /></label>
      <label>{t("列数")}<input ref={columnField} type="number" min={1} max={maxColumns} value={columns} onChange={event => setColumns(event.target.value)} /></label>
    </div>
    {removed > 0 && <p className="notes-table-size-warning" role="status">
      {removed === 1 ? t("将移除 1 个有内容的单元格，可撤销。") : t("将移除 {count} 个有内容的单元格，可撤销。", { count: removed })}
    </p>}
    <button type="submit" className="primary-button small" disabled={!valid}>{label}</button>
  </form>;
}
