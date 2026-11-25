type ClassNode = { id: string; isGroup?: boolean; shape?: string; parentId?: string; cssClasses?: string; styles?: string[]; cssStyles?: string[]; [key: string]: unknown };
type ClassEdge = { id: string; start: string; end: string; arrowTypeStart?: string; arrowTypeEnd?: string; [key: string]: unknown };
type ClassData = { nodes: ClassNode[]; edges: ClassEdge[]; [key: string]: unknown };
type ClassStyles = Map<string, { styles?: string[] }>;
export type ClassDatabase = { getData(): ClassData; styleClasses?: ClassStyles; diagramId?: string };

export function classStyleRules(values: string[]) {
  const rules: string[] = [], source = values.join(","); let current = "", depth = 0, quote = "", escaped = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quote) { current += char; if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === quote) quote = ""; continue; }
    if (["'", '"'].includes(char)) { quote = char; current += char; continue; }
    if (char === "(") depth++;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (!depth && (char === ";" || char === "," && /^\s*[-a-zA-Z_][\w-]*\s*:/.test(source.slice(index + 1)))) { if (current.trim()) rules.push(current.trim()); current = ""; }
    else current += char;
  }
  if (current.trim()) rules.push(current.trim());
  return rules;
}

// Classes, namespaces, notes and generated interfaces use overlapping source
// IDs. Keep those source records intact and give the layout distinct IDs.
export function prepareClassLayout<T extends ClassData>(data: T, definitions?: ClassStyles, scope = ""): T & ClassData {
  const groups = new Map<string, string>(), classes = new Map<string, string>(), notes = new Map<string, string>(), interfaces = new Map<string, string>();
  const diagram = scope ? scope.replace(/[^\w-]/g, "_") + "_" : "";
  const nodes = data.nodes.map((node) => {
    const catalog = node.isGroup ? groups : node.shape === "classBox" ? classes : node.shape === "note" ? notes : interfaces;
    const prefix = catalog === groups ? "n" : catalog === classes ? "c" : catalog === notes ? "t" : "i";
    const id = "dida_class_" + diagram + prefix + catalog.size; catalog.set(node.id, id);
    const styles = node.shape === "classBox" ? classStyleRules([
      ...(node.cssClasses?.split(/\s+/).flatMap((name) => definitions?.get(name)?.styles ?? []) ?? []), ...(node.styles ?? []), ...(node.cssStyles ?? []),
    ]) : undefined;
    return { ...node, id, ...(styles ? { styles, cssStyles: styles } : {}) };
  }).map((node, index) => ({ ...node, parentId: groups.get(data.nodes[index].parentId ?? "") }));
  const edges = data.edges.map((edge, index) => ({ ...edge, id: "dida_class_" + diagram + "e" + index,
    start: edge.id.startsWith("edgeNote") ? notes.get(edge.start) ?? edge.start : edge.arrowTypeStart === "lollipop" && edge.arrowTypeEnd === "none" ? interfaces.get(edge.start) ?? edge.start : classes.get(edge.start) ?? edge.start,
    end: edge.arrowTypeEnd === "lollipop" && edge.arrowTypeStart === "none" ? interfaces.get(edge.end) ?? edge.end : classes.get(edge.end) ?? edge.end,
  }));
  return { ...data, nodes, edges };
}

// Mermaid creates a fresh ClassDB for render(). Scope the prototype adapter to
// that render so the real factory uses it, then restore it even on failure.
export async function withClassLayout<T>(database: ClassDatabase, render: () => T | Promise<T>) {
  const prototype = Object.getPrototypeOf(database) as ClassDatabase, original = prototype.getData;
  if (typeof original !== "function") throw new Error("类图数据接口不可用");
  prototype.getData = function () { return prepareClassLayout(original.call(this), this.styleClasses, this.diagramId); };
  try { return await render(); }
  finally { prototype.getData = original; }
}
