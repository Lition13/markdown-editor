import type { DiagramNote } from "./mermaidDiagramNotes";

type Metadata = { metadata?: Record<string, unknown> };
export interface AgentflowModel {
  direction?: string;
  vertices: ({ id: string; label?: string; shape?: string; vertexKind?: string } & Metadata)[];
  subGraphs: ({ id: string; title?: string; nodes: string[]; direction?: string } & Metadata)[];
  connectors: ({ id: string; title?: string } & Metadata)[];
  edges: ({ id?: string; start: string; end: string; label?: string; edgeSemantic?: string } & Metadata)[];
  diagnostics: readonly { id: string; message: string }[];
}
export interface AgentflowDatabase { getData(): unknown; getSemanticModel(): AgentflowModel }

export const agentflowKinds: Readonly<Record<string, string>> = {
  task: "任务", tool: "工具", input: "输入", decision: "判断", refdoc: "参考资料", action: "动作", connector: "连接器",
};
const semantics: Readonly<Record<string, string>> = { sequence: "顺序", reference: "参考", failure: "失败" };
const metadataNames: Readonly<Record<string, string>> = {
  description: "说明", instruction: "指令", model: "模型", params: "输入约定", returns: "返回约定", value: "值", example: "示例",
  connectorRef: "连接器引用", protocol: "协议", endpoint: "端点",
};
const labelText = (value: string) => value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
  if (entity[0] !== "#") return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[entity.toLowerCase()];
  const point = parseInt(entity.slice(/^#x/i.test(entity) ? 2 : 1), /^#x/i.test(entity) ? 16 : 10);
  return point <= 0x10ffff ? String.fromCodePoint(point) : match;
});

// Metadata remains data: even instructions, endpoints and nested values are
// literal text. The diagram's parser owns validation and prototype-key removal.
export function agentflowNotes(model: AgentflowModel): DiagramNote[] {
  const notes: DiagramNote[] = [];
  const add = (context: string, label: string) => { if (label) notes.push({ context, label }); };
  const meta = (context: string, value?: Record<string, unknown>) => {
    for (const [key, entry] of Object.entries(value ?? {})) {
      const ancestors: object[] = [];
      const label = typeof entry === "string" ? entry : JSON.stringify(entry, function (_key, value: unknown) {
        if (value && typeof value === "object") {
          while (ancestors.length && ancestors[ancestors.length - 1] !== this) ancestors.pop();
          if (ancestors.includes(value)) return "[循环引用]";
          ancestors.push(value);
        }
        return value;
      });
      add(context + " · " + (Object.hasOwn(metadataNames, key) ? metadataNames[key] : key), label ?? String(entry));
    }
  };
  for (const flow of model.subGraphs) {
    const context = "流程 · " + labelText(flow.title || flow.id) + " [" + flow.id + "]";
    add(context, flow.nodes.length ? "成员：" + flow.nodes.join("、") : "空流程");
    meta(context, flow.metadata);
  }
  for (const vertex of model.vertices) {
    const kind = vertex.vertexKind && Object.hasOwn(agentflowKinds, vertex.vertexKind) ? agentflowKinds[vertex.vertexKind] : "节点";
    const context = kind + " · " + labelText(vertex.label || vertex.id) + " [" + vertex.id + "]";
    add(kind + " [" + vertex.id + "]", labelText(vertex.label || vertex.id));
    meta(context, vertex.metadata);
  }
  for (const connector of model.connectors) {
    const context = "连接器 · " + labelText(connector.title || connector.id) + " [" + connector.id + "]";
    add(context, "外部系统定义"); meta(context, connector.metadata);
  }
  model.edges.forEach((edge, index) => {
    const kind = edge.edgeSemantic && Object.hasOwn(semantics, edge.edgeSemantic) ? semantics[edge.edgeSemantic] : "连线";
    const context = `R${index + 1} · ${edge.start} ${kind === "参考" ? "—" : kind === "失败" ? "×" : "→"} ${edge.end} · ${kind}`;
    add(context, edge.label ? labelText(edge.label) : kind + "关系");
    meta(context, edge.metadata);
  });
  for (const item of model.diagnostics) add("提示 · " + item.id, item.message);
  return notes;
}
