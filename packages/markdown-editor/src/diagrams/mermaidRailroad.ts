import { MarkdownMessageError, markdownTranslator } from "../core/locale";
import type { DiagramNote } from "./mermaidDiagramNotes";
import { wrapDiagramText } from "./diagramText";

export type RailroadExpression =
  | { type: "terminal"; value: string }
  | { type: "nonterminal"; name: string }
  | { type: "special"; text: string }
  | { type: "sequence"; elements: RailroadExpression[] }
  | { type: "choice"; alternatives: RailroadExpression[] }
  | { type: "optional"; element: RailroadExpression }
  | { type: "repetition"; element: RailroadExpression; min: number; max: number; separator?: RailroadExpression };
export interface RailroadRule { name: string; definition: RailroadExpression; comment?: string }
export interface RailroadData {
  getRules(): RailroadRule[]; getTitle(): string; getAccTitle(): string; getAccDescription(): string;
}
export interface RailroadDatabase extends RailroadData {
  clear(): void; addRule(rule: RailroadRule): void;
  setTitle(value: string): void; setDiagramTitle(value: string): void;
  setAccTitle(value: string): void; setAccDescription(value: string): void;
}

// The canonical database sanitizes grammar literals as HTML. These literals are
// text, including "<tag>" or "<script>"; both renderers write them with textContent
// or XML escaping, followed by SVG sanitization. Capture the parser's raw model
// only for this render, and restore every public method even after failure.
export async function withRailroadText<T>(db: RailroadDatabase, render: () => Promise<T> | T) {
  const previous = { clear: db.clear, addRule: db.addRule, getRules: db.getRules,
    setTitle: db.setTitle, setDiagramTitle: db.setDiagramTitle, setAccTitle: db.setAccTitle, setAccDescription: db.setAccDescription };
  let rules: RailroadRule[] = [];
  const metadata: Partial<Record<"title" | "accTitle" | "description", string>> = {};
  db.clear = function () { rules = []; for (const key of Object.keys(metadata)) delete metadata[key as keyof typeof metadata]; previous.clear.call(this); };
  db.addRule = function (rule) { rules.push(rule); previous.addRule.call(this, rule); };
  db.getRules = () => rules;
  const fields = { setTitle: "title", setDiagramTitle: "title", setAccTitle: "accTitle", setAccDescription: "description" } as const;
  for (const method of Object.keys(fields) as (keyof typeof fields)[]) db[method] = function (value) {
    metadata[fields[method]] = value; previous[method].call(this, value);
  };
  try {
    const value = await render(), captured = rules.slice();
    const title = metadata.title ?? db.getTitle(), accTitle = metadata.accTitle ?? db.getAccTitle(), description = metadata.description ?? db.getAccDescription();
    const database: RailroadData = { getRules: () => captured, getTitle: () => title, getAccTitle: () => accTitle, getAccDescription: () => description };
    return { value, database };
  } finally { Object.assign(db, previous); }
}

export function railroadRange(min: number, max: number, t = markdownTranslator()) {
  if (!Number.isSafeInteger(min) || min < 0 || !(max === Infinity || Number.isSafeInteger(max) && max >= min)) {
    throw new MarkdownMessageError("语法重复次数范围无效。");
  }
  if (min === max && min === 1) return t("1 次");
  return t("{count} 次", { count: min === max ? min : `${min}–${max === Infinity ? "∞" : max}` });
}

export function railroadNotes(db: RailroadData, ordered = false, source = "", t = markdownTranslator()): DiagramNote[] {
  let count = 0;
  const expression = (node: RailroadExpression, depth = 0): string => {
    if (++count > 1200 || depth > 60) throw new MarkdownMessageError("语法过于复杂，请拆分后预览。");
    const child = (node: RailroadExpression) => expression(node, depth + 1);
    switch (node.type) {
      case "terminal": return JSON.stringify(node.value);
      case "nonterminal": return node.name;
      case "special": return `? ${node.text} ?`;
      case "sequence": return node.elements.map(child).join(" ");
      case "choice": return "(" + node.alternatives.map(child).join(ordered ? " / " : " | ") + ")";
      case "optional": return "[ " + child(node.element) + " ]";
      case "repetition": return `${railroadRange(node.min, node.max, t)} × (${child(node.element)})` +
        (node.separator ? " · " + t("分隔 {value}", { value: child(node.separator) }) : "");
      default: throw new MarkdownMessageError("未知的语法表达式。");
    }
  };
  const notes: DiagramNote[] = [];
  if (db.getTitle()) notes.push({ context: t("语法标题"), label: db.getTitle() });
  if (db.getAccTitle()) notes.push({ context: t("无障碍标题"), label: db.getAccTitle() });
  if (db.getAccDescription()) notes.push({ context: t("说明"), label: db.getAccDescription() });
  if (ordered) notes.push({ context: t("PEG 有序选择"), label: t("分支按图中从上到下的顺序尝试。& 为正向预判，! 为负向预判，. 为任意字符。复杂预判的完整内容见原始语法。") });
  for (const [index, rule] of db.getRules().entries()) {
    notes.push({ context: `R${index + 1} · ${rule.name}`, label: expression(rule.definition) });
    if (rule.comment) notes.push({ context: t("{name} · 注释", { name: rule.name }), label: rule.comment });
  }
  // The installed PEG parser abbreviates compound predicates to "(...)" and
  // EBNF normalizes exclusions into a sequence. Keep the original grammar too,
  // so those details and source comments remain readable without leaving SVG.
  if (source) notes.push({ context: t("原始语法"), label: source });
  return notes;
}

export function prependRailroadTitle(svg: Element, title: string, dark: boolean) {
  if (!title) return;
  const [x, y, width, height] = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (![x, y, width, height].every(Number.isFinite) || width < 80) throw new MarkdownMessageError("语法图尺寸无效。");
  const rows = wrapDiagramText(title, width - 48, 18), extra = rows.length * 24 + 22;
  if (height + extra > 12000) throw new MarkdownMessageError("语法标题过长，请缩小图表后预览。");
  const doc = svg.ownerDocument, ns = "http://www.w3.org/2000/svg", content = doc.createElementNS(ns, "g");
  content.setAttribute("transform", `translate(0 ${extra})`);
  for (const child of Array.from(svg.childNodes)) {
    if (child.nodeType === 1 && ["defs", "style", "title", "desc"].includes((child as Element).localName)) continue;
    content.appendChild(child);
  }
  svg.appendChild(content);
  const heading = doc.createElementNS(ns, "g"); heading.setAttribute("class", "railroad-title");
  rows.forEach((row, index) => {
    const text = doc.createElementNS(ns, "text");
    for (const [key, value] of Object.entries({ x: x + width / 2, y: y + 25 + index * 24, "font-size": 18,
      "font-family": "sans-serif", "font-weight": 600, "text-anchor": "middle", fill: dark ? "#eef2fc" : "#1d2c45", stroke: "none" })) text.setAttribute(key, String(value));
    text.textContent = row; heading.appendChild(text);
  });
  svg.appendChild(heading); svg.setAttribute("viewBox", `${x} ${y} ${width} ${height + extra}`);
  if (/^\d+(?:\.\d+)?$/.test(svg.getAttribute("height") ?? "")) svg.setAttribute("height", String(height + extra));
}
