import { diagramTextWidth } from "./diagramText";
import type { DiagramNote } from "./mermaidDiagramNotes";

export interface WardleyNode {
  id: string; label: string; x: number; y: number; className?: string; labelOffsetX?: number; labelOffsetY?: number;
  inPipeline?: boolean; isPipelineParent?: boolean; inertia?: boolean; sourceStrategy?: "build" | "buy" | "outsource" | "market";
}
export interface WardleyData {
  nodes: WardleyNode[];
  links: { source: string; target: string; dashed?: boolean; label?: string; flow?: "forward" | "backward" | "bidirectional" }[];
  trends: { nodeId: string; targetX: number; targetY: number }[];
  pipelines: { nodeId: string; componentIds: string[] }[];
  annotations: { number: number; coordinates: { x: number; y: number }[]; text?: string }[];
  notes: { text: string; x: number; y: number }[];
  accelerators: { name: string; x: number; y: number }[];
  deaccelerators: { name: string; x: number; y: number }[];
  annotationsBox?: { x: number; y: number };
  axes: { xLabel?: string; yLabel?: string; stages?: string[]; stageBoundaries?: number[] };
  size?: { width: number; height: number };
}
export interface WardleyDatabase { getWardleyData: () => WardleyData; getDiagramTitle: () => string; getAccDescription: () => string }

export function wardleyNotes(data: WardleyData, title: string, description = ""): DiagramNote[] {
  const notes: DiagramNote[] = [], nodes = new Map(data.nodes.map((node) => [node.id, node]));
  const number = (value: number) => String(Number(value.toPrecision(12)));
  if (title) notes.push({ context: "地图标题", label: title });
  if (description) notes.push({ context: "说明", label: description });
  data.axes.stages?.forEach((label, index) => notes.push({ context: `S${index + 1} · Evolution${data.axes.stageBoundaries?.[index] !== undefined ? " · boundary " + number(data.axes.stageBoundaries[index]) : ""}`, label }));
  data.nodes.forEach((node, index) => notes.push({ context: `N${index + 1} · ${node.className ?? "component"} · Visibility ${number(node.y)}% · Evolution ${number(node.x)}%${node.sourceStrategy ? " · " + node.sourceStrategy : ""}${node.inertia ? " · inertia" : ""}`,
    label: node.label + (node.labelOffsetX !== undefined || node.labelOffsetY !== undefined ? `\nlabel [${node.labelOffsetX ?? 8}, ${node.labelOffsetY ?? -8}]` : "") }));
  data.links.forEach((link, index) => notes.push({ context: `R${index + 1} · ${nodes.get(link.source)?.label ?? link.source} ${link.flow === "backward" ? "←" : link.flow === "bidirectional" ? "↔" : link.flow === "forward" ? "→" : "—"} ${nodes.get(link.target)?.label ?? link.target}${link.dashed ? " · dashed" : ""}`, label: link.label ?? "" }));
  data.trends.forEach((trend, index) => notes.push({ context: `E${index + 1} · ${nodes.get(trend.nodeId)?.label ?? trend.nodeId}`, label: `演进至 Evolution ${number(trend.targetX)}% · Visibility ${number(trend.targetY)}%` }));
  data.pipelines.forEach((pipeline, index) => notes.push({ context: `P${index + 1} · Pipeline · ${nodes.get(pipeline.nodeId)?.label ?? pipeline.nodeId}`,
    label: pipeline.componentIds.map((id) => nodes.get(id)).filter((node) => !!node).sort((a, b) => a.x - b.x).map((node) => `${node.label} (${number(node.x)}%)`).join(" → ") }));
  data.notes.forEach((note, index) => notes.push({ context: `T${index + 1} · Note · Visibility ${number(note.y)}% · Evolution ${number(note.x)}%`, label: note.text }));
  data.annotations.forEach((annotation) => notes.push({ context: "Annotation " + annotation.number, label: annotation.text ?? "" }));
  if (data.annotationsBox) notes.push({ context: "Annotations box", label: `Visibility ${number(data.annotationsBox.y)}% · Evolution ${number(data.annotationsBox.x)}%` });
  for (const [kind, forces] of [["Accelerator", data.accelerators], ["Deaccelerator", data.deaccelerators]] as const) forces.forEach((force, index) => notes.push({ context: `${kind.slice(0, 1)}${index + 1} · ${kind} · Visibility ${number(force.y)}% · Evolution ${number(force.x)}%`, label: force.name }));
  return notes;
}

// The complete renderer places one-line text at fixed map coordinates. Keep
// those coordinates and provide full text in the appendix when it cannot fit.
export function fitWardleyLabels(svg: Element, dark: boolean, data: WardleyData) {
  const [, , width, height] = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;
  const fit = (selector: string, reference: (index: number, node: Element) => string, limit: number | ((index: number) => number) = 250) => {
    Array.from(svg.querySelectorAll(selector)).forEach((node, index) => {
      const x = Number(node.getAttribute("x")), y = Number(node.getAttribute("y")), font = Number(node.getAttribute("font-size")) || 14;
      const center = node.getAttribute("text-anchor") === "middle", text = node.textContent ?? "";
      const available = Math.max(0, Math.min(typeof limit === "number" ? limit : limit(index), center ? Math.min(x - 16, width - x - 16) * 2 : width - x - 16));
      if (diagramTextWidth(text, font) <= available && x >= 16 && y >= 16 && y <= height - 16) return;
      const label = reference(index, node);
      node.textContent = label;
      node.setAttribute("text-anchor", "start");
      node.setAttribute("x", String(Math.max(16, Math.min(x, width - diagramTextWidth(label, font) - 16))));
      node.setAttribute("y", String(Math.max(18, Math.min(y, height - 18))));
    });
  };
  fit(".wardley-title", () => "Wardley · 标题见下方", width - 48);
  fit(".wardley-node-label", (index) => "N" + (index + 1));
  const labeledLinks = data.links.map((link, index) => ({ link, index })).filter(({ link }) => !!link.label);
  fit(".wardley-link-label", (index) => "R" + (labeledLinks[index].index + 1));
  fit(".wardley-notes text", (index) => "T" + (index + 1));
  const stages = svg.querySelectorAll(".wardley-stage-label").length, boundaries = data.axes.stageBoundaries;
  fit(".wardley-stages .wardley-stage-label", (index) => "S" + (index + 1), (index) => Math.max(24, (width - 96) *
    (boundaries?.length === stages ? boundaries[index] - (boundaries[index - 1] ?? 0) : 1 / Math.max(1, stages)) - 16));
  fit(".wardley-annotations-box text", (index, node) => "Annotation " + (/^(-?\d+)/.exec(node.textContent ?? "")?.[1] ?? index + 1));
  svg.querySelectorAll(".wardley-annotations-box").forEach((group) => {
    const labels = Array.from(group.querySelectorAll("text")), box = group.querySelector("rect");
    if (!box || !labels.length) return;
    const left = Math.min(...labels.map((label) => Number(label.getAttribute("x")))) - 10;
    const right = Math.max(...labels.map((label) => Number(label.getAttribute("x")) + diagramTextWidth(label.textContent ?? "", Number(label.getAttribute("font-size")) || 11))) + 10;
    const top = Math.min(...labels.map((label) => Number(label.getAttribute("y")))) - 18, bottom = Math.max(...labels.map((label) => Number(label.getAttribute("y")))) + 12;
    for (const [key, value] of Object.entries({ x: Math.max(4, left), y: Math.max(4, top), width: Math.min(width - 8, right - left), height: Math.min(height - 8, bottom - top) })) if (Number.isFinite(value)) box.setAttribute(key, String(value));
  });
  fit(".wardley-accelerators text", (index) => "A" + (index + 1));
  fit(".wardley-deaccelerators text", (index) => "D" + (index + 1));
  for (const selector of [".wardley-accelerators", ".wardley-deaccelerators"]) {
    const paths = Array.from(svg.querySelectorAll(selector + " path")), labels = Array.from(svg.querySelectorAll(selector + " text"));
    paths.forEach((path, index) => {
      // The glyph extends 60px to the right of its map coordinate. A force on
      // the right boundary must keep that origin while fitting inside the SVG.
      const force = (selector.includes("deaccelerators") ? data.deaccelerators : data.accelerators)[index];
      const origin = force ? 48 + force.x / 100 * (width - 96) : Number(labels[index]?.getAttribute("x")) - 30;
      const scale = Math.max(0.15, Math.min(1, (width - origin - 12) / 60));
      if (Number.isFinite(origin) && scale < 1) path.setAttribute("transform", `translate(${origin} 0) scale(${scale} 1) translate(${-origin} 0)`);
    });
  }
  if (dark) {
    svg.querySelectorAll(".wardley-stages line").forEach((node) => node.setAttribute("stroke", "#9aa9c6"));
    svg.querySelectorAll(".wardley-node--anchor text").forEach((node) => node.setAttribute("fill", "#eef2fc"));
    svg.querySelectorAll(".wardley-annotation circle").forEach((node) => { node.setAttribute("fill", "#191f2c"); node.setAttribute("stroke", "#9aa9c6"); });
    svg.querySelectorAll(".wardley-annotations-box rect").forEach((node) => {
      (node as SVGElement).style.setProperty("fill", "#191f2c");
      (node as SVGElement).style.setProperty("stroke", "#9aa9c6");
    });
  }
}
