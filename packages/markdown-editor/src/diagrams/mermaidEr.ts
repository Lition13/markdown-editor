type ErAttribute = { type: string; name: string; comment?: string; keys?: string[] };
type ErNode = { id: string; label?: string; alias?: string; attributes?: ErAttribute[]; isGroup?: boolean; parentId?: string; cssClasses?: string; cssStyles?: string[]; cssCompiledStyles?: string[] };
type ErEdge = { id: string; start: string; end: string };
type ErData = { nodes: ErNode[]; edges: ErEdge[] };
type Relationship = { entityA: string; entityB: string };
export interface ErDatabase {
  getData(): ErData;
  getEntities(): Map<string, ErNode>;
  getSubGraphs(): { id: string; nodes: string[] }[];
  getRelationships(): Relationship[];
  getCompiledStyles(names: string[]): string[];
  addEntity(name: string, alias?: string): ErNode;
  addSubGraph(id: unknown, members: unknown[], title: unknown): string;
  addRelationship(from: string, label: string, to: string, spec: unknown): void;
}
const kinds = new WeakMap<object, readonly [boolean, boolean]>();
const entityOrigins = new WeakMap<object, boolean>();
const groupMembers = new WeakMap<object, { name: string; group: boolean }[]>();

export function recordErSubgraph(original: ErDatabase["addSubGraph"]): ErDatabase["addSubGraph"] {
  return function (this: ErDatabase, id, members, title) {
    const groups = new Set(this.getSubGraphs().map((item) => item.id));
    const values = members.flat().filter((item): item is string => typeof item === "string").map((name) => name.trim()).filter(Boolean).map((name) => ({ name, group: groups.has(name) }));
    const result = original.call(this, id, members, title), record = this.getSubGraphs().at(-1);
    if (record) groupMembers.set(record, values);
    return result;
  };
}

// Jison also adds empty entity records for references to already defined groups.
// Those are group-reference stubs, distinct from real same-named child entities.
export function recordErEntity(original: ErDatabase["addEntity"]): ErDatabase["addEntity"] {
  return function (this: ErDatabase, name, alias) {
    const existing = this.getEntities().has(name), group = this.getSubGraphs().some((item) => item.id === name);
    const entity = original.call(this, name, alias);
    if (!existing) entityOrigins.set(entity, !group);
    return entity;
  };
}

// The DB's generated entity IDs can collide with literal group IDs. Remember
// its own endpoint classification before the two kinds share a layout namespace.
export function recordErRelationship(original: ErDatabase["addRelationship"]): ErDatabase["addRelationship"] {
  return function (this: ErDatabase, from, label, to, spec) {
    const groups = new Set(this.getSubGraphs().map((group) => group.id)), index = this.getRelationships().length;
    original.call(this, from, label, to, spec);
    const record = this.getRelationships()[index];
    if (record) kinds.set(record, [groups.has(from), groups.has(to)]);
  };
}

export function prepareErLayout<T extends ErData>(data: T, database: ErDatabase, scope = ""): T & ErData {
  const records = data.nodes.map((node) => ({ ...node })), subgraphs = database.getSubGraphs(), relationships = database.getRelationships();
  const groupNames = new Set(subgraphs.map((group) => group.id)), groupParents = new Map<string, string>(), entityParents = new Map<string, string>();
  for (const group of subgraphs) for (const member of groupMembers.get(group) ?? group.nodes.map((name) => ({ name, group: groupNames.has(name) && name !== group.id }))) {
    const parents = member.group ? groupParents : entityParents;
    if (!parents.has(member.name)) parents.set(member.name, group.id);
  }
  // getData() hides an entity whose source name equals a subgraph name. Restore
  // its attributes and keep the containing group's layout free of self-parenting.
  for (const [name, entity] of database.getEntities()) if (!(entityOrigins.get(entity) === false && !entity.attributes?.length && !entity.alias) && !records.some((node) => !node.isGroup && node.id === entity.id)) records.push({
    ...entity, isGroup: false, parentId: entityParents.get(name),
    cssCompiledStyles: database.getCompiledStyles((entity.cssClasses ?? "").split(/\s+/)),
  });
  const prefix = "dida_er_" + (scope ? scope.replace(/[^\w-]/g, "_") + "_" : ""), groups = new Map<string, string>(), entities = new Map<string, string>();
  const sourceNames = new Map([...database.getEntities()].map(([name, entity]) => [entity.id, name]));
  const nodes = records.map((node) => {
    const catalog = node.isGroup ? groups : entities;
    if (catalog.has(node.id)) throw new Error("实体或分组标识重复，请使用不同的名称。");
    const id = prefix + (node.isGroup ? "g" : "n") + catalog.size; catalog.set(node.id, id);
    return { ...node, id };
  }).map((node, index) => {
    const original = records[index], sourceName = sourceNames.get(original.id);
    const parent = original.isGroup ? groupParents.get(original.id) : sourceName !== undefined ? entityParents.get(sourceName) : original.parentId;
    return { ...node, parentId: groups.get(parent ?? "") };
  });
  const endpoint = (id: string, group?: boolean) => group === true ? groups.get(id) ?? id : group === false ? entities.get(id) ?? id : entities.get(id) ?? groups.get(id) ?? id;
  const edges = data.edges.map((edge, index) => {
    const kind = kinds.get(relationships[index]);
    return { ...edge, id: prefix + "e" + index, start: endpoint(edge.start, kind?.[0]), end: endpoint(edge.end, kind?.[1]) };
  });
  return { ...data, nodes, edges };
}

// Mermaid's render factory creates a fresh DB. Scope both adapters to that
// render, with restoration on failure; the app serializes all diagram renders.
export async function withErLayout<T>(database: ErDatabase, scope: string, render: () => T | Promise<T>, fieldText?: (value: string) => string) {
  const prototype = Object.getPrototypeOf(database) as ErDatabase, getData = prototype.getData, addRelationship = prototype.addRelationship, addEntity = prototype.addEntity, addSubGraph = prototype.addSubGraph;
  if ([getData, addRelationship, addEntity, addSubGraph].some((method) => typeof method !== "function")) throw new Error("实体关系图数据接口不可用。");
  prototype.addSubGraph = recordErSubgraph(addSubGraph);
  prototype.addEntity = recordErEntity(addEntity);
  prototype.addRelationship = recordErRelationship(addRelationship);
  prototype.getData = function () {
    const data = prepareErLayout(getData.call(this), this, scope);
    // ER cells bypass the ordinary label sanitizer. Decode their protected
    // characters before measurement, while keeping literal markup inert.
    return fieldText ? { ...data, nodes: data.nodes.map((node) => ({ ...node, attributes: node.attributes?.map((field) => ({
      ...field, type: fieldText(field.type), name: fieldText(field.name), comment: fieldText(field.comment ?? ""),
    })) })) } : data;
  };
  try { return await render(); }
  finally { prototype.getData = getData; prototype.addRelationship = addRelationship; prototype.addEntity = addEntity; prototype.addSubGraph = addSubGraph; }
}
