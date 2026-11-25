import { describe, expect, it } from "vitest";
import { prepareErLayout, recordErEntity, recordErRelationship, withErLayout, type ErDatabase } from "./mermaidEr";

const empty = () => ({ getSubGraphs: () => [], getRelationships: () => [], getEntities: () => new Map(), getCompiledStyles: () => [], addEntity(name: string) { return { id: "entity-" + name }; }, addSubGraph() { return "group"; }, addRelationship() {}, getData: () => ({ nodes: [], edges: [] }) });

describe("ER layout records", () => {
  it("restores an entity hidden by a same-named group without changing its attributes", () => {
    const attributes = [{ type: "string", name: "title", keys: ["PK"], comment: "完整字段说明" }];
    const group = { id: "Work", label: "工作域", isGroup: true, parentId: "Work" }, entity = { id: "entity-Work-0", label: "Work", attributes, cssClasses: "default marked" };
    const data = { direction: "LR", nodes: [group], edges: [] }, before = JSON.stringify(data);
    const database = { ...empty(), getEntities: () => new Map([["Work", entity]]), getSubGraphs: () => [{ id: "Work", nodes: ["Work"] }], getCompiledStyles: () => ["fill:#ffe4d1"] };
    const fixed = prepareErLayout(data, database);
    expect(fixed.nodes).toHaveLength(2); expect(fixed.nodes[0].parentId).toBeUndefined(); expect(fixed.nodes[1].parentId).toBe(fixed.nodes[0].id);
    expect((fixed.nodes[1] as typeof entity).attributes).toBe(attributes); expect(fixed.nodes[1].cssCompiledStyles).toEqual(["fill:#ffe4d1"]);
    expect(JSON.stringify(data)).toBe(before); expect(entity.id).toBe("entity-Work-0");
  });

  it("keeps a literal group ID distinct from an identical generated entity ID", () => {
    const relationships: { entityA: string; entityB: string }[] = [], database: ErDatabase = { ...empty(), getRelationships: () => relationships, getSubGraphs: () => [{ id: "entity-A-0", nodes: ["Child"] }],
      addRelationship(from, _label, to) { relationships.push({ entityA: from === "A" ? "entity-A-0" : from, entityB: to }); },
    };
    database.addRelationship = recordErRelationship(database.addRelationship).bind(database);
    database.addRelationship("A", "实体来源", "entity-Child-1", {}); database.addRelationship("entity-A-0", "分组来源", "entity-Child-1", {});
    const data = { nodes: [{ id: "entity-A-0", isGroup: true }, { id: "entity-A-0", isGroup: false }, { id: "entity-Child-1", parentId: "entity-A-0" }],
      edges: relationships.map((rel, index) => ({ id: "edge" + index, start: rel.entityA, end: rel.entityB })) };
    const fixed = prepareErLayout(data, database);
    expect(fixed.edges[0].start).toBe(fixed.nodes[1].id); expect(fixed.edges[1].start).toBe(fixed.nodes[0].id); expect(fixed.nodes[2].parentId).toBe(fixed.nodes[0].id);
    const next = prepareErLayout(data, database, "figure-2"); expect(next.nodes.some((node) => fixed.nodes.some((other) => node.id === other.id))).toBe(false);
    expect(next.edges.some((edge) => fixed.edges.some((other) => edge.id === other.id))).toBe(false);
  });

  it("rejects repeated group IDs instead of merging their content silently", () => {
    expect(() => prepareErLayout({ nodes: [{ id: "group", isGroup: true }, { id: "group", isGroup: true }], edges: [] }, empty())).toThrow("标识重复");
  });

  it("omits implicit group-reference stubs while preserving real empty child entities", () => {
    const entities = new Map<string, { id: string }>(), groups: { id: string; nodes: string[] }[] = [];
    const database = { ...empty(), getEntities: () => entities, getSubGraphs: () => groups, addEntity(name: string) { const value = { id: "entity-" + name }; entities.set(name, value); return value; } };
    database.addEntity = recordErEntity(database.addEntity).bind(database);
    database.addEntity("Real"); groups.push({ id: "Real", nodes: ["Real"] }, { id: "Stub", nodes: [] }); database.addEntity("Stub");
    const fixed = prepareErLayout({ nodes: groups.map((group) => ({ id: group.id, isGroup: true })), edges: [] }, database);
    expect(fixed.nodes.filter((node) => !node.isGroup)).toHaveLength(1); expect(fixed.nodes[2].parentId).toBe(fixed.nodes[0].id);
  });

  it("adapts a fresh render database and decodes fields without changing stored records", async () => {
    const attributes = [{ type: "string", name: "title", comment: "encoded" }];
    class Database {
      constructor() { this.addRelationship = this.addRelationship.bind(this); this.addEntity = this.addEntity.bind(this); }
      getEntities() { return new Map(); } getSubGraphs() { return []; } getRelationships() { return []; } getCompiledStyles() { return []; }
      addEntity(name: string) { return { id: name }; } addSubGraph() { return "group"; } addRelationship() {} getData() { return { nodes: [{ id: "__proto__", label: "字面名称", attributes }], edges: [] }; }
    }
    const original = Database.prototype.getData, relationship = Database.prototype.addRelationship;
    const data = await withErLayout(new Database(), "figure-1", () => new Database().getData(), (value) => value === "encoded" ? "&lt;literal&gt; ♥" : value);
    expect(data.nodes[0].id).not.toBe("__proto__"); expect(data.nodes[0].label).toBe("字面名称");
    expect(data.nodes[0].attributes?.[0].comment).toBe("&lt;literal&gt; ♥"); expect(attributes[0].comment).toBe("encoded");
    expect(Database.prototype.getData).toBe(original); expect(Database.prototype.addRelationship).toBe(relationship);
  });

  it("restores the parser and layout adapters after a failed render", async () => {
    class Database {
      getEntities() { return new Map(); } getSubGraphs() { return []; } getRelationships() { return []; } getCompiledStyles() { return []; }
      addEntity(name: string) { return { id: name }; } addSubGraph() { return "group"; } addRelationship() {} getData() { return { nodes: [], edges: [] }; }
    }
    const database = new Database(), prototype = Database.prototype, before = { getData: prototype.getData, addRelationship: prototype.addRelationship, addEntity: prototype.addEntity, addSubGraph: prototype.addSubGraph };
    await expect(withErLayout(database, "failed", async () => { throw new Error("渲染失败"); })).rejects.toThrow("渲染失败");
    expect(prototype.getData).toBe(before.getData); expect(prototype.addRelationship).toBe(before.addRelationship); expect(prototype.addEntity).toBe(before.addEntity); expect(prototype.addSubGraph).toBe(before.addSubGraph);
  });
});
