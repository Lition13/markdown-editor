import type { Table } from "mdast";

export type TableAlignment = "left" | "center" | "right" | null;

export interface MarkdownTable {
  rows: string[][];
  align: TableAlignment[];
}

export interface TableCellAddress { row: number; column: number }
export interface TableSize { rows: number; columns: number }
export interface TableCellRange { from: number; to: number }
export interface TableLayout {
  source: string;
  rows: (TableCellRange & { cells: TableCellRange[] })[];
  columns: number;
  align: TableAlignment[];
}

export function markdownTableLayout(source: string, table: Table, start: number, end: number): TableLayout {
  const rows = table.children.map(row => ({
    from: row.position!.start.offset! - start,
    to: row.position!.end.offset! - start,
    cells: row.children.map(cell => {
      const edge = cell.position!.start.offset!;
      const afterPipe = edge + (source[edge] === "|" ? 1 : 0);
      const empty = afterPipe + (/^[\t ]/.test(source.slice(afterPipe, cell.position!.end.offset!)) ? 1 : 0);
      const from = cell.children[0]?.position?.start.offset ?? empty;
      const to = cell.children.at(-1)?.position?.end.offset ?? from;
      return { from: from - start, to: to - start };
    }),
  }));
  const columns = rows[0].cells.length;
  return { source: source.slice(start, end), rows, columns, align: Array.from({ length: columns }, (_, column) => table.align?.[column] ?? null) };
}

export function tableModel(layout: TableLayout): MarkdownTable {
  return {
    align: layout.align,
    rows: layout.rows.map(row => Array.from({ length: Math.max(layout.columns, row.cells.length) }, (_, column) => {
      const cell = row.cells[column];
      return cell ? layout.source.slice(cell.from, cell.to) : "";
    })),
  };
}

export type TableCommand =
  | { kind: "insert-row" | "insert-column" | "move-row" | "move-column"; direction: -1 | 1 }
  | { kind: "delete-row" | "delete-column" }
  | { kind: "align"; alignment: TableAlignment }
  | { kind: "resize"; size: TableSize };

export function escapeTableCell(value: string) {
  return value.replace(/\r\n?|\n/g, " ").replace(/\\*\|/g, run => run.length % 2 ? run.slice(0, -1) + "\\|" : run);
}

export function tableCellChange(table: TableLayout, address: TableCellAddress, draft: string, range = table.rows[address.row].cells[address.column]) {
  const row = table.rows[address.row];
  const content = escapeTableCell(draft);
  const from = range?.from ?? row.to;
  const to = range?.to ?? row.to;
  let prefix = "", suffix = "";
  if (!range) {
    const trailingPipe = /(?:^|[^\\])(?:\\\\)*\|[\t ]*$/.test(table.source.slice(row.from, row.to));
    prefix = (trailingPipe ? "" : " |") + " |".repeat(address.column - row.cells.length) + " ";
    suffix = " |";
  }
  const start = from + prefix.length;
  return { from, to, insert: prefix + content + suffix, range: { from: start, to: start + content.length }, content };
}

export function serializeMarkdownTable(table: MarkdownTable, pad = false) {
  const delimiter = table.align.map(value => value === "left" ? ":---" : value === "center" ? ":---:" : value === "right" ? "---:" : "---");
  const widths = delimiter.map(marker => marker.length);
  if (pad) {
    for (const row of table.rows) row.forEach((cell, column) => { widths[column] = Math.max(widths[column] ?? 0, cell.length); });
  }
  const rowText = (row: string[]) => "| " + row.map((cell, column) => pad ? cell.padEnd(widths[column]) : cell).join(" | ") + " |";
  return [rowText(table.rows[0]), rowText(delimiter), ...table.rows.slice(1).map(rowText)].join("\n");
}

export function newMarkdownTable(size: TableSize): MarkdownTable {
  return {
    align: Array<TableAlignment>(size.columns).fill(null),
    rows: Array.from({ length: size.rows }, () => Array<string>(size.columns).fill("")),
  };
}

export function completeTableHeader(line: string) {
  const indent = /^ {0,3}(?=\|)/.exec(line)?.[0];
  if (indent === undefined || !line.trimEnd().endsWith("|")) return null;
  const pipes = Array.from(line.matchAll(/\\*\|/g));
  const columns = pipes.filter(pipe => pipe[0].length % 2 === 1).length - 1;
  if (columns < 1 || (pipes.at(-1)?.[0].length ?? 0) % 2 === 0) return null;
  return "\n" + indent + "|" + " --- |".repeat(columns) + "\n" + indent + "|" + "   |".repeat(columns);
}

export function cellsRemovedByResize(table: MarkdownTable, size: TableSize) {
  const shrinkColumns = size.columns < table.align.length;
  return table.rows.reduce((count, row, index) => {
    const removed = index >= size.rows ? row : shrinkColumns ? row.slice(size.columns) : [];
    return count + removed.filter(cell => cell.trim()).length;
  }, 0);
}

export function changeMarkdownTable(table: MarkdownTable, address: TableCellAddress, command: TableCommand) {
  let { row, column } = address;
  if (row < 0 || row >= table.rows.length || column < 0 || column >= table.align.length) return null;
  const rows = table.rows.map(cells => [...cells]);
  const align = [...table.align];
  const move = <T,>(values: T[], from: number, to: number) => { values.splice(to, 0, values.splice(from, 1)[0]); };
  switch (command.kind) {
    case "insert-row": {
      row += command.direction === 1 ? 1 : 0;
      if (row === 0) return null;
      rows.splice(row, 0, Array<string>(align.length).fill(""));
      break;
    }
    case "delete-row":
      if (row === 0) return null;
      rows.splice(row, 1);
      row = Math.min(row, rows.length - 1);
      break;
    case "move-row": {
      const next = row + command.direction;
      if (row === 0 || next < 1 || next >= rows.length) return null;
      move(rows, row, next);
      row = next;
      break;
    }
    case "insert-column":
      column += command.direction === 1 ? 1 : 0;
      align.splice(column, 0, null);
      rows.forEach(cells => cells.splice(column, 0, ""));
      break;
    case "delete-column":
      if (align.length === 1) return null;
      align.splice(column, 1);
      rows.forEach(cells => cells.splice(column, 1));
      column = Math.min(column, align.length - 1);
      break;
    case "move-column": {
      const next = column + command.direction;
      if (next < 0 || next >= align.length) return null;
      move(align, column, next);
      rows.forEach(cells => move(cells, column, next));
      column = next;
      break;
    }
    case "align":
      if (align[column] === command.alignment) return null;
      align[column] = command.alignment;
      break;
    case "resize": {
      const size = command.size;
      if (!Number.isInteger(size.rows) || size.rows < 1 || !Number.isInteger(size.columns) || size.columns < 1) return null;
      if (size.rows === rows.length && size.columns === align.length) return null;
      if (size.rows < rows.length) rows.length = size.rows;
      while (rows.length < size.rows) rows.push([]);
      const shrink = size.columns < align.length;
      if (shrink) align.length = size.columns;
      while (align.length < size.columns) align.push(null);
      rows.forEach(cells => {
        if (shrink && cells.length > size.columns) cells.length = size.columns;
        while (cells.length < size.columns) cells.push("");
      });
      row = Math.min(row, size.rows - 1);
      column = Math.min(column, size.columns - 1);
      break;
    }
  }
  return { table: { rows, align }, address: { row, column } };
}
