import { MarkdownMessageError, markdownTranslator, type MarkdownTranslator } from "../core/locale";
import { blockRouter, type BlockBounds, type BlockObstacle, type BlockPoint } from "./blockRouting";
import { diagramTextWidth, wrapDiagramText } from "./diagramText";

let eventModelText = markdownTranslator();

// Mermaid calls the patched SVG renderer without a React context. Its render
// queue scopes this locale to the current request and restores it on failure.
export async function withEventModelText<T>(render: () => Promise<T>, t: MarkdownTranslator) {
  const previous = eventModelText;
  eventModelText = t;
  try { return await render(); }
  finally { eventModelText = previous; }
}

export interface EventFrame {
  $type: string; name: string; entityIdentifier: string; modelEntityType: string;
  dataInlineValue?: string; dataReference?: { $refText: string }; sourceFrames?: { $refText: string }[];
}
export interface EventModelAst {
  frames: EventFrame[]; dataEntities: { name: string; dataBlockValue: string }[];
  title?: string; accTitle?: string; accDescr?: string;
}
export type EventRole = "ui" | "processor" | "command" | "readmodel" | "event";
export interface EventRow { text: string; size: number; height: number; bold?: boolean; gap?: number }
export interface EventLane { key: string; index: number; label: string; y: number; height: number }
export interface EventBox extends BlockBounds { frame: EventFrame; role: EventRole; rows: EventRow[]; lane: EventLane; index: number }
export interface EventModelState {
  boxes: EventBox[]; lanes: EventLane[]; relations: { source: EventBox; target: EventBox; explicit: boolean }[];
  maxR: number; height: number; title?: string; description?: string;
}
export interface EventModelDatabase {
  clear(): void; getState(): EventModelState; getDiagramTitle(): string; getAccTitle(): string; getAccDescription(): string;
}

const roles: Record<string, EventRole> = { ui: "ui", pcr: "processor", processor: "processor", cmd: "command", command: "command", rmo: "readmodel", readmodel: "readmodel", evt: "event", event: "event" };
const category = (role: EventRole) => role === "ui" || role === "processor" ? 0 : role === "command" || role === "readmodel" ? 1 : 2;
const defaults = ["UI / Automation", "Command / Read Model", "Events"];
const prefixes = ["UI/A", "C/RM", "Stream"];

export function eventDataBody(raw: string) {
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new MarkdownMessageError("事件数据块缺少完整的大括号。");
  const body = raw.slice(start + 1, end).replace(/^\r?\n/, "").replace(/\r?\n[ \t]*$/, "");
  const lines = body.split(/\r?\n/), indent = Math.min(...lines.filter((line) => line.trim()).map((line) => /^[ \t]*/.exec(line)![0].length));
  return lines.map((line) => Number.isFinite(indent) ? line.slice(indent) : line).join("\n").trim();
}

export function buildEventModel(ast: EventModelAst): EventModelState {
  if (!ast || !Array.isArray(ast.frames) || ast.frames.length > 160) throw new MarkdownMessageError("事件时间帧过多，请拆分后预览。");
  const data = new Map<string, string>();
  for (const item of ast.dataEntities ?? []) if (!data.has(item.name)) data.set(item.name, item.dataBlockValue);
  const lanes = new Map<string, EventLane>(), seen = new Set<string>();
  const laneOrder = [0, 0, 0];
  const boxes = ast.frames.map((frame, index): EventBox => {
    if (seen.has(frame.name)) throw new MarkdownMessageError("事件时间帧编号重复：{name}", { name: frame.name });
    seen.add(frame.name);
    const role = Object.prototype.hasOwnProperty.call(roles, frame.modelEntityType) ? roles[frame.modelEntityType] : undefined;
    if (!role || !["EmTimeFrame", "EmResetFrame"].includes(frame.$type)) throw new MarkdownMessageError("无法识别的事件时间帧类型。");
    const parts = frame.entityIdentifier.split("."), namespace = parts.length === 2 ? parts[0] : "", name = parts.length === 2 ? parts[1] : frame.entityIdentifier;
    const group = category(role), key = JSON.stringify([group, namespace]);
    let lane = lanes.get(key);
    if (!lane) {
      lane = { key, index: group * 1000 + (namespace ? ++laneOrder[group] : 0), label: namespace ? `${prefixes[group]}: ${namespace}` : defaults[group], y: 0, height: 0 };
      lanes.set(key, lane);
    }
    const rows: EventRow[] = [];
    const add = (value: string, size: number, bold = false, gap = 0) => wrapDiagramText(value, 390, size).forEach((text, index) => rows.push({ text, size, bold, height: size === 16 ? 24 : size === 12 ? 18 : 20, gap: index ? 0 : gap }));
    add(`${frame.name} · ${role.toUpperCase()}${frame.$type === "EmResetFrame" ? " · RESET" : ""}`, 12);
    add(name, 16, true, 6);
    let raw = frame.dataInlineValue;
    if (frame.dataReference) {
      raw = data.get(frame.dataReference.$refText);
      if (raw === undefined) throw new MarkdownMessageError("事件数据块不存在：{name}", { name: frame.dataReference.$refText });
      add("[[" + frame.dataReference.$refText + "]]", 12, false, 6);
    }
    if (raw !== undefined) add(eventDataBody(raw), 14, false, 12);
    const width = Math.max(132, ...rows.map((row) => diagramTextWidth(row.text, row.size) + 40));
    const height = Math.max(96, rows.reduce((sum, row) => sum + row.height + (row.gap ?? 0), 40));
    return { frame, role, rows, width, height, x: 0, y: 0, lane, index };
  });
  const ordered = [...lanes.values()].sort((a, b) => a.index - b.index);
  let y = 70;
  for (const lane of ordered) {
    const titleRows = wrapDiagramText(lane.label, 190, 14).length;
    const top = Math.max(72, titleRows * 20 + 44);
    lane.y = y; lane.height = Math.max(...boxes.filter((box) => box.lane === lane).map((box) => box.height)) + top + 24;
    for (const box of boxes.filter((box) => box.lane === lane)) box.y = y + top;
    y += lane.height + 20;
  }
  const right = new Map<string, number>();
  let previous: EventBox | undefined;
  for (const box of boxes) {
    const next = previous ? previous.x + previous.width - (previous.lane === box.lane ? -24 : 70) : 28;
    box.x = Math.max(28, next, (right.get(box.lane.key) ?? 4) + 24);
    right.set(box.lane.key, box.x + box.width); previous = box;
  }
  const byId = new Map(boxes.map((box) => [box.frame.name, box])), relations: EventModelState["relations"] = [];
  for (const box of boxes) {
    const ids = new Set((box.frame.sourceFrames ?? []).map((ref) => ref.$refText));
    if (ids.size) {
      for (const id of ids) if (!byId.has(id)) throw new MarkdownMessageError("来源时间帧不存在：{name}", { name: id });
      for (const source of boxes) if (ids.has(source.frame.name)) relations.push({ source, target: box, explicit: true });
    } else if (box.frame.$type !== "EmResetFrame") {
      const source = boxes.slice(0, box.index).reverse().find((source) => source.lane !== box.lane);
      if (source) relations.push({ source, target: box, explicit: false });
    }
  }
  if (relations.length > 500) throw new MarkdownMessageError("事件关系过多，请拆分后预览。");
  return { boxes, lanes: ordered, relations, maxR: Math.max(200, ...boxes.map((box) => box.x + box.width)), height: Math.max(160, y), title: ast.title ?? ast.accTitle, description: ast.accDescr };
}

const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tag = (name: string, attrs: Record<string, string | number>, content?: string) => {
  const attributes = Object.entries(attrs).map(([key, value]) => {
    if (typeof value === "number" && !Number.isFinite(value)) throw new MarkdownMessageError("事件图形包含无效坐标。");
    return ` ${key}="${xml(String(typeof value === "number" ? Math.round(value * 100) / 100 : value))}"`;
  }).join("");
  return content === undefined ? `<${name}${attributes}/>` : `<${name}${attributes}>${content}</${name}>`;
};

export function eventModelSvg(state: EventModelState, dark: boolean, meta: { title?: string; description?: string; source?: string; id?: string } = {}) {
  const t = eventModelText;
  const ink = dark ? "#eef2fc" : "#1d2c45", secondary = dark ? "#b6c3db" : "#506482", grid = dark ? "#475777" : "#d4deed", paper = dark ? "#191f2c" : "#ffffff";
  const fills: Record<EventRole, string> = dark ? { ui: "#273650", processor: "#40304c", command: "#243957", readmodel: "#203a3e", event: "#453529" }
    : { ui: "#f8faff", processor: "#f2e4f8", command: "#e1ebff", readmodel: "#e7f3d5", event: "#ffead1" };
  const borders: Record<EventRole, string> = dark ? { ui: "#9eb7ff", processor: "#bfadf4", command: "#9eb7ff", readmodel: "#63dbc4", event: "#f2b96e" }
    : { ui: "#8096bf", processor: "#9c75ab", command: "#7196c7", readmodel: "#7d9c4b", event: "#bb8d46" };
  const arrowId = (meta.id ?? "event-model").replace(/[^\w-]/g, "") + "-arrow";
  const text = (value: string, x: number, y: number, size = 14, fill = ink, anchor = "start", bold = false) => tag("text", {
    x, y, "font-size": size, "font-family": "sans-serif", "text-anchor": anchor, "dominant-baseline": "middle", "font-weight": bold ? 600 : 400, fill, stroke: "none", "xml:space": "preserve",
  }, xml(value));
  const port = (box: BlockBounds): BlockObstacle => ({ ...box, container: false, ports: [
    { point: { x: box.x + box.width / 2, y: box.y }, outside: { x: box.x + box.width / 2, y: box.y - 20 }, direction: 1 },
    { point: { x: box.x + box.width / 2, y: box.y + box.height }, outside: { x: box.x + box.width / 2, y: box.y + box.height + 20 }, direction: 1 },
    { point: { x: box.x, y: box.y + box.height / 2 }, outside: { x: box.x - 20, y: box.y + box.height / 2 }, direction: 0 },
    { point: { x: box.x + box.width, y: box.y + box.height / 2 }, outside: { x: box.x + box.width + 20, y: box.y + box.height / 2 }, direction: 0 },
  ] });
  const obstacles = state.boxes.map(port);
  const route = blockRouter(obstacles, state.maxR + 80, state.height + 30, t("事件模型"));
  const paths: BlockPoint[][] = state.relations.map(({ source, target }) => route(obstacles[source.index], obstacles[target.index]));
  const width = Math.max(240, state.maxR + 32, ...paths.flat().map((point) => point.x + 24));
  const content: string[] = [tag("rect", { x: 0, y: 0, width, height: state.height, fill: paper })];
  const title = meta.title || state.title || t("事件模型"), titleRows = wrapDiagramText(title, width - 48, 18), extra = Math.max(0, titleRows.length * 26 - 26);
  titleRows.forEach((row, index) => content.push(text(row, 24, 26 + index * 26, 18, ink, "start", true)));
  const drawing: string[] = [];
  for (const lane of state.lanes) {
    drawing.push(tag("g", { class: "em-swimlane" }, tag("rect", { x: 12, y: lane.y, width: width - 24, height: lane.height, rx: 8, fill: dark ? "#202838" : "#f7f9fc", stroke: grid }) +
      wrapDiagramText(lane.label, 190).map((row, index) => text(row, 26, lane.y + 25 + index * 20, 14, secondary, "start", true)).join("")));
  }
  drawing.push(tag("defs", {}, tag("marker", { id: arrowId, markerWidth: 10, markerHeight: 7, refX: 9, refY: 3.5, orient: "auto" }, tag("polygon", { points: "0 0,10 3.5,0 7", fill: secondary }))));
  paths.forEach((points) => drawing.push(tag("path", { class: "em-relation", d: points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" "), fill: "none", stroke: secondary, "stroke-width": 1.5, "marker-end": `url(#${arrowId})` })));
  for (const box of state.boxes) {
    const card = [tag("rect", { x: box.x, y: box.y, width: box.width, height: box.height, rx: 6, fill: fills[box.role], stroke: borders[box.role], "stroke-width": 1.2 })];
    let y = box.y + 20;
    for (const row of box.rows) {
      y += (row.gap ?? 0) + row.height / 2;
      if (row.text) card.push(text(row.text, box.x + 20, y, row.size, row.size === 12 ? secondary : ink, "start", row.bold));
      y += row.height / 2;
    }
    drawing.push(tag("g", { class: "em-box", "data-frame-id": box.frame.name }, card.join("")));
  }
  content.push(tag("g", { transform: `translate(0 ${extra})` }, drawing.join("")));
  let y = Math.max(state.height, ...paths.flat().map((point) => point.y + 24)) + extra + 18;
  const notes = [
    ...(meta.description || state.description ? [{ context: t("说明"), label: meta.description || state.description! }] : []),
    ...state.relations.map((relation) => ({ context: `${relation.source.frame.name} → ${relation.target.frame.name} · ${t(relation.explicit ? "指定来源" : "自动关联")}`, label: `${relation.source.frame.entityIdentifier} → ${relation.target.frame.entityIdentifier}` })),
    ...(meta.source ? [{ context: t("原始语法"), label: meta.source }] : []),
  ];
  if (!state.boxes.length) { content.push(text(t("没有事件时间帧"), 24, y)); y += 30; }
  for (const note of notes) {
    for (const row of wrapDiagramText(note.context, width - 48, 12)) { content.push(text(row, 24, y, 12, secondary, "start", true)); y += 18; }
    for (const row of wrapDiagramText(note.label, width - 48)) { if (row) content.push(text(row, 24, y)); y += 20; }
    y += 14;
  }
  const height = y + 16;
  if (width > 12000 || height > 12000) throw new MarkdownMessageError("事件模型过大，请拆分后预览。");
  content[0] = tag("rect", { x: 0, y: 0, width, height, fill: paper });
  return { content: content.join(""), width, height, svg: tag("svg", { xmlns: "http://www.w3.org/2000/svg", width, height, viewBox: `0 0 ${width} ${height}` }, content.join("")) };
}

export function infoModelSvg(version: string, dark: boolean) {
  const width = 240, height = 104;
  const content = tag("rect", { x: 0, y: 0, width, height, fill: dark ? "#191f2c" : "#ffffff" }) + tag("text", {
    x: width / 2, y: height / 2, "font-family": "sans-serif", "font-size": 32, "text-anchor": "middle", "dominant-baseline": "middle", fill: dark ? "#eef2fc" : "#1d2c45", stroke: "none",
  }, xml("v" + version));
  return { width, height, content, svg: tag("svg", { xmlns: "http://www.w3.org/2000/svg", width, height, viewBox: `0 0 ${width} ${height}` }, content) };
}
