export function diagramTextWidth(value: string, size = 14) {
  // Conservative advances keep literal notes inside SVG bounds without a DOM
  // font measurer. Wide Latin glyphs cannot use an average alphabetic width.
  return Array.from(value).reduce((width, char) => width + size * (char === "\t" ? 3.2 : /[MW@#%]/.test(char) ? 1.15
    : /[mw]/.test(char) ? 1.05 : char.codePointAt(0)! > 255 ? 1.1 : 0.8), 0);
}

export function wrapDiagramText(value: string, width: number, size = 14) {
  const rows: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    let row = "";
    for (const char of paragraph) {
      if (row && diagramTextWidth(row + char, size) > width) { rows.push(row); row = ""; }
      row += char;
    }
    rows.push(row);
  }
  return rows;
}
