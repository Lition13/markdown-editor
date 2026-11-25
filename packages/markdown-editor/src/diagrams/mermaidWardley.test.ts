import { expect, test } from "vitest";
import { wardleyNotes, type WardleyData } from "./mermaidWardley";

test("Wardley appendix preserves annotations without a box, literal text and all map metadata", () => {
  const data: WardleyData = {
    nodes: [{ id: "__proto__", label: "<literal> & 原文", x: 35, y: 0.28 * 100, inertia: true, sourceStrategy: "build", labelOffsetX: -80 }],
    links: [{ source: "__proto__", target: "__proto__", flow: "backward", label: "完整关系", dashed: true }],
    trends: [{ nodeId: "__proto__", targetX: 85, targetY: 80 }], pipelines: [{ nodeId: "__proto__", componentIds: ["__proto__"] }],
    annotations: [{ number: 7, coordinates: [{ x: 50, y: 50 }], text: "没有注释框也保留全文" }],
    notes: [{ text: "说明", x: 20, y: 30 }], accelerators: [{ name: "加速", x: 10, y: 20 }], deaccelerators: [{ name: "减速", x: 30, y: 40 }],
    axes: { stages: ["阶段一"], stageBoundaries: [1] },
  };
  const before = JSON.stringify(data), notes = wardleyNotes(data, "地图", "辅助说明");
  expect(notes.find((note) => note.context === "Annotation 7")?.label).toBe("没有注释框也保留全文");
  expect(notes.find((note) => note.context.startsWith("N1"))).toEqual({ context: "N1 · component · Visibility 28% · Evolution 35% · build · inertia", label: "<literal> & 原文\nlabel [-80, -8]" });
  expect(notes.find((note) => note.context.startsWith("R1"))?.context).toContain("← <literal> & 原文 · dashed");
  for (const prefix of ["E1", "P1", "T1", "A1", "D1", "S1"]) expect(notes.some((note) => note.context.startsWith(prefix))).toBe(true);
  expect(JSON.stringify(data)).toBe(before);
});
