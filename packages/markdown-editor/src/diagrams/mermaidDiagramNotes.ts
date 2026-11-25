import { MarkdownMessageError } from "../core/locale";
import { wrapDiagramText } from "./diagramText";

export interface VennArea { sets: string[]; size: number; label?: string }
export interface VennText { sets: string[]; id: string; label?: string }
export interface VennStyle { targets: string[]; styles: Record<string, string> }
export interface VennDatabase {
  getSubsetData: () => VennArea[]; getTextData: () => VennText[]; getStyleData: () => VennStyle[];
}
export interface CynefinDatabase {
  getDomains: () => Map<string, { name: string; items: { label: string }[] }>;
}
export interface DiagramNote { context: string; label: string; color?: string }
export const vennAreaKey = (sets: string[]) => JSON.stringify([...sets].sort());
export const literalPaint = /^(?:#[a-f\d]{3,8}|[a-z]{1,24}|(?:rgb|hsl)a?\([\d.,% /-]+\))$/i;

export function vennNotes(db: VennDatabase): DiagramNote[] {
  const areas = new Map(db.getSubsetData().map((area) => [vennAreaKey(area.sets), area]));
  const names = new Map(db.getSubsetData().filter((area) => area.sets.length === 1).map((area) => [area.sets[0], area.label ?? area.sets[0]]));
  const styles = new Map<string, Record<string, string>>();
  for (const entry of db.getStyleData()) styles.set(vennAreaKey(entry.targets), { ...styles.get(vennAreaKey(entry.targets)), ...entry.styles });
  return db.getTextData().map((node) => ({
    context: areas.get(vennAreaKey(node.sets))?.label ?? node.sets.map((id) => names.get(id) ?? id).join(" ∩ "),
    label: node.label ?? node.id, color: styles.get(vennAreaKey([node.id]))?.color,
  }));
}

export function appendDiagramNotes(svg: Element, notes: DiagramNote[], dark: boolean) {
  if (!notes.length) return;
  const [x, y, width, height] = (svg.getAttribute("viewBox") ?? "").trim().split(/[ ,]+/).map(Number);
  if (![x, y, width, height].every(Number.isFinite) || width < 80 || height < 1) throw new MarkdownMessageError("图表说明区域尺寸无效。");
  const doc = svg.ownerDocument, ns = "http://www.w3.org/2000/svg", group = doc.createElementNS(ns, "g");
  group.setAttribute("class", "diagram-notes");
  let top = y + height + 22;
  const write = (value: string, size: number, fill: string, weight?: string) => {
    const node = doc.createElementNS(ns, "text");
    for (const [key, value] of Object.entries({ x: String(x + 24), y: String(top), fill, "font-size": String(size), "font-family": "sans-serif" })) node.setAttribute(key, value);
    if (weight) node.setAttribute("font-weight", weight);
    node.textContent = value; group.appendChild(node); top += size === 12 ? 18 : 20;
  };
  for (const note of notes) {
    for (const row of wrapDiagramText(note.context, width - 48, 12)) write(row, 12, dark ? "#b6c3db" : "#506482", "600");
    const fill = note.color && literalPaint.test(note.color) && typeof CSS !== "undefined" && CSS.supports("color", note.color)
      ? note.color : dark ? "#eef2fc" : "#1d2c45";
    for (const row of wrapDiagramText(note.label, width - 48)) write(row, 14, fill);
    top += 12;
  }
  const nextHeight = top - y + 8;
  if (nextHeight > 12000) throw new MarkdownMessageError("图表说明过多，请分成多个图表预览。");
  svg.appendChild(group); svg.setAttribute("viewBox", `${x} ${y} ${width} ${nextHeight}`);
  if (/^\d+(?:\.\d+)?$/.test(svg.getAttribute("height") ?? "")) svg.setAttribute("height", String(nextHeight));
}
