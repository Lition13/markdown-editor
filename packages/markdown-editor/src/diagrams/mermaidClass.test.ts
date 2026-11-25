import { describe, expect, it } from "vitest";
import { classStyleRules, prepareClassLayout, withClassLayout } from "./mermaidClass";

describe("class diagram layout records", () => {
  it("keeps duplicate display names distinct and preserves class member objects", () => {
    const member = { getDisplayDetails: () => ({ displayText: "+List<T> values" }) };
    const data = { direction: "LR", nodes: [
      { id: "Work", isGroup: true }, { id: "Work", shape: "classBox", parentId: "Work", members: [member] },
      { id: "note0", shape: "classBox" }, { id: "note0", shape: "note", parentId: "Work" },
      { id: "interface0", shape: "classBox" }, { id: "interface0", shape: "rect" }, { id: "__proto__", shape: "classBox" },
    ], edges: [
      { id: "edgeNote0", start: "note0", end: "note0" },
      { id: "ordinary", start: "interface0", end: "__proto__", arrowTypeStart: "none", arrowTypeEnd: "dependency" },
      { id: "provided", start: "Work", end: "interface0", arrowTypeStart: "none", arrowTypeEnd: "lollipop" },
    ] };
    const fixed = prepareClassLayout(data);
    expect(new Set(fixed.nodes.map((node) => node.id)).size).toBe(7);
    expect(fixed.nodes[1].parentId).toBe(fixed.nodes[0].id);
    expect(fixed.nodes[3].parentId).toBe(fixed.nodes[0].id);
    expect(fixed.edges[0]).toMatchObject({ start: fixed.nodes[3].id, end: fixed.nodes[2].id });
    expect(fixed.edges[1]).toMatchObject({ start: fixed.nodes[4].id, end: fixed.nodes[6].id });
    expect(fixed.edges[2]).toMatchObject({ start: fixed.nodes[1].id, end: fixed.nodes[5].id });
    expect(fixed.nodes[1].members![0]).toBe(member);
    expect(data.nodes[1].id).toBe("Work"); expect(data.edges[0].start).toBe("note0");
  });

  it("applies earlier class definitions, retains function colors and lets inline styles win", () => {
    const definitions = new Map([["default", { styles: ["fill:rgb(210, 220, 250),color:#223344"] }], ["special", { styles: ["stroke:#b06010,fill:#ffe4d1"] }]]);
    const data = { nodes: [{ id: "A", shape: "classBox", cssClasses: "default special", styles: ["fill:#ffffff"] }], edges: [] };
    const fixed = prepareClassLayout(data, definitions);
    expect(fixed.nodes[0].cssStyles).toEqual(["fill:rgb(210, 220, 250)", "color:#223344", "stroke:#b06010", "fill:#ffe4d1", "fill:#ffffff"]);
    expect(data.nodes[0].styles).toEqual(["fill:#ffffff"]);
    expect(classStyleRules(["fill:rgba(10", "20", "30", "0.5)", "stroke:#123;stroke-width:2px"])).toEqual(["fill:rgba(10,20,30,0.5)", "stroke:#123", "stroke-width:2px"]);
    expect(classStyleRules(["font-family:'Some, Font',sans-serif", "stroke-dasharray:5", "3", "fill:#fff"])).toEqual(["font-family:'Some, Font',sans-serif", "stroke-dasharray:5,3", "fill:#fff"]);
  });

  it("adapts the renderer's fresh instance and restores the prototype after success", async () => {
    class Database { getData() { return { nodes: [{ id: "__proto__", shape: "classBox" }], edges: [] }; } }
    const original = Database.prototype.getData;
    const id = await withClassLayout(new Database(), () => new Database().getData().nodes[0].id);
    expect(id).not.toBe("__proto__"); expect(Database.prototype.getData).toBe(original);
    expect(new Database().getData().nodes[0].id).toBe("__proto__");
  });

  it("keeps namespace and interface IDs distinct between figures", () => {
    const data = { nodes: [{ id: "Work", isGroup: true }, { id: "Task", shape: "classBox", parentId: "Work" }, { id: "interface0", shape: "rect" }], edges: [{ id: "relation", start: "Task", end: "interface0", arrowTypeStart: "none", arrowTypeEnd: "lollipop" }] };
    const first = prepareClassLayout(data, undefined, "figure-1"), second = prepareClassLayout(data, undefined, "figure-2");
    expect(first.nodes.some((node) => second.nodes.some((other) => node.id === other.id))).toBe(false);
    expect(first.edges.some((edge) => second.edges.some((other) => edge.id === other.id))).toBe(false);
  });

  it("restores the prototype after a failed render", async () => {
    class Database { getData() { return { nodes: [], edges: [] }; } }
    const original = Database.prototype.getData;
    await expect(withClassLayout(new Database(), async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    expect(Database.prototype.getData).toBe(original);
  });
});
