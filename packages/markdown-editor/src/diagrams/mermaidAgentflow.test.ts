import { expect, test } from "vitest";
import { agentflowNotes, type AgentflowModel } from "./mermaidAgentflow";

const model = (): AgentflowModel => ({ direction: "LR", vertices: [], subGraphs: [], connectors: [], edges: [], diagnostics: [] });
test("Agentflow notes preserve contracts, flow membership, connector definitions and edge semantics as text", () => {
  const data = model();
  data.subGraphs.push({ id: "team", title: "交付团队", nodes: ["work", "check"], metadata: { instruction: "只作为说明，不执行", model: "local-model" } });
  data.vertices.push({ id: "work", label: "调用工具", shape: "subroutine", vertexKind: "tool", metadata: {
    params: "城市 :: String", returns: "完整报告", connectorRef: "api.search", retry: 0, enabled: false,
    nested: { tags: ["<Policy> & 原文", 3, null] },
  } });
  data.connectors.push({ id: "api", title: "本地查询", metadata: { protocol: "http", endpoint: "https://example.test/api?q=<x>" } });
  data.edges.push({ start: "work", end: "check", edgeSemantic: "sequence", label: "检查结果", metadata: { instruction: "保留关系指令" } },
    { start: "work", end: "guide", edgeSemantic: "reference", label: "参考关系" },
    { start: "check", end: "work", edgeSemantic: "failure", label: "重新处理" });
  data.diagnostics = [{ id: "SHAPE_UNSUPPORTED", message: "保留完整警告" }];
  const before = JSON.stringify(data), notes = agentflowNotes(data);
  expect(notes).toContainEqual({ context: "流程 · 交付团队 [team]", label: "成员：work、check" });
  expect(notes.find((note) => note.context.endsWith("· nested"))?.label).toBe('{"tags":["<Policy> & 原文",3,null]}');
  for (const label of ["0", "false", "只作为说明，不执行", "城市 :: String", "api.search", "保留关系指令", "https://example.test/api?q=<x>", "保留完整警告"])
    expect(notes.some((note) => note.label === label)).toBe(true);
  expect(notes.some((note) => note.context === "R2 · work — guide · 参考")).toBe(true);
  expect(notes.some((note) => note.context === "R3 · check × work · 失败")).toBe(true);
  expect(JSON.stringify(data)).toBe(before);
});

test("Agentflow notes keep literal identifiers, shared metadata values and true cycles distinct", () => {
  const data = model(), shared = { value: "完整内容" }, cycle: { self?: unknown } = {}; cycle.self = cycle;
  data.vertices.push({ id: "constructor", label: "字面 &amp; &#x6587;字", vertexKind: "constructor", metadata: { aliases: { a: shared, b: shared }, cycle } });
  data.subGraphs.push({ id: "__proto__", nodes: [] });
  data.edges.push({ start: "constructor", end: "__proto__", edgeSemantic: "failure" });
  const notes = agentflowNotes(data);
  expect(notes[0]).toEqual({ context: "流程 · __proto__ [__proto__]", label: "空流程" });
  expect(notes.find((note) => note.context.endsWith("· aliases"))?.label).toBe('{"a":{"value":"完整内容"},"b":{"value":"完整内容"}}');
  expect(notes.find((note) => note.context.endsWith("· cycle"))?.label).toBe('{"self":"[循环引用]"}');
  expect(notes.some((note) => note.context.startsWith("节点 · 字面 & 文字"))).toBe(true);
  expect(notes).toContainEqual({ context: "R1 · constructor × __proto__ · 失败", label: "失败关系" });
});
