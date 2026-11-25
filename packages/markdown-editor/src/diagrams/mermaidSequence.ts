import type { DiagramNote } from "./mermaidDiagramNotes";

export interface SequenceDatabase {
  getActors(): Map<string, { name: string; description?: string; links?: Record<string, unknown>; properties?: Record<string, unknown>; detailReference?: string }>;
  getBoxes(): { name?: string; actorKeys: string[] }[];
}

// The standard sequence DB uses browser CSS validation for box declarations.
// Keep that split in a pure helper; the Mini adapter supplies its color parser.
export function sequenceBoxText(source: string, validColor: (color: string) => boolean) {
  const match = /^((?:rgba?|hsla?)\s*\(.*\)|\w*)(.*)$/.exec(source);
  const color = match?.[1]?.trim() || "transparent";
  return validColor(color) ? { color, title: match?.[2]?.trim() }
    : { color: "transparent", title: source.trim() };
}

export function sequenceNumber(value: number) {
  if (!Number.isFinite(value)) throw new Error("时序编号包含无效数值。");
  return String(Math.round((value + Number.EPSILON) * 100) / 100);
}

export function sequenceNotes(database: SequenceDatabase, labelText: (value: string) => string, includeEmptyBoxes = true): DiagramNote[] {
  const notes: DiagramNote[] = [];
  if (includeEmptyBoxes) for (const group of database.getBoxes()) if (!group.actorKeys.length && group.name) notes.push({ context: "参与者分组", label: labelText(group.name) + "（暂无参与者）" });
  for (const actor of database.getActors().values()) {
    const context = "参与者 · " + labelText(actor.description || actor.name);
    for (const [field, values] of [["链接", actor.links], ["属性", actor.properties]] as const) {
      for (const [name, value] of Object.entries(values ?? {})) if (!["__proto__", "constructor", "prototype"].includes(name)) notes.push({
        context: context + " · " + field + " · " + labelText(name), label: labelText(typeof value === "string" ? value : JSON.stringify(value) ?? String(value)),
      });
    }
    if (actor.detailReference) notes.push({ context: context + " · 资料引用", label: labelText(actor.detailReference) });
  }
  return notes;
}

// Decode Mermaid's protected entities as text without creating active HTML.
export function sequenceLiteralText(value: string, decodeHtml: (value: string) => string) {
  return decodeHtml(value.replace(/ﬂ°°/g, "&#").replace(/ﬂ°/g, "&").replace(/¶ß/g, ";").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
}
