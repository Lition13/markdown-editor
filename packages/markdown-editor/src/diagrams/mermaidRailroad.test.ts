import { expect, test } from "vitest";
import { railroadNotes, railroadRange, withRailroadText, type RailroadDatabase, type RailroadRule } from "./mermaidRailroad";

function database(): RailroadDatabase {
  let rules: RailroadRule[] = [], title = "", accTitle = "", description = "";
  const setTitle = (value: string) => { title = value; };
  return {
    clear() { rules = []; title = accTitle = description = ""; },
    addRule(rule) { rules.push({ ...rule, name: "HTML sanitized" }); }, getRules: () => rules,
    getTitle: () => title, setTitle, setDiagramTitle: setTitle,
    getAccTitle: () => accTitle, setAccTitle(value) { accTitle = value; },
    getAccDescription: () => description, setAccDescription(value) { description = value; },
  };
}

test("Railroad notes retain exact bounds, ordered branches, predicates and complete literal grammar", () => {
  const db = database(), rule: RailroadRule = { name: "__proto__", comment: "完整说明", definition: { type: "sequence", elements: [
    { type: "terminal", value: "<tag> & 原文" }, { type: "special", text: "!Keyword" },
    { type: "optional", element: { type: "nonterminal", name: "suffix" } },
    { type: "repetition", min: 2, max: 4, element: { type: "choice", alternatives: [{ type: "terminal", value: "a" }, { type: "terminal", value: "b" }] }, separator: { type: "terminal", value: "," } },
  ] } };
  db.getRules = () => [rule]; db.setTitle("语法标题"); db.setAccDescription("语法用途");
  const source = 'railroad-peg-beta\nLook <- &("prefix" "suffix") !("x" / "y") . ;';
  const before = JSON.stringify(rule), notes = railroadNotes(db, true, source);
  expect(notes.find((note) => note.context === "R1 · __proto__")?.label).toBe('"<tag> & 原文" ? !Keyword ? [ suffix ] 2–4 次 × (("a" / "b")) · 分隔 ","');
  expect(notes.some((note) => note.context === "PEG 有序选择")).toBe(true);
  expect(notes.some((note) => note.label === "完整说明")).toBe(true);
  expect(notes.some((note) => note.label === "语法标题")).toBe(true);
  expect(notes.find((note) => note.context === "原始语法")?.label).toBe(source);
  expect(JSON.stringify(rule)).toBe(before);
  expect(railroadRange(3, 3)).toBe("3 次"); expect(railroadRange(0, Infinity)).toBe("0–∞ 次");
  for (const [min, max] of [[4, 2], [-1, 3], [1.5, 4], [1, NaN]]) expect(() => railroadRange(min, max)).toThrow();
});

test("Railroad captures text without changing the database or leaking a failed render", async () => {
  const db = database(), methods = { ...db }, rule: RailroadRule = { name: "<literal>", definition: { type: "terminal", value: "<script> &amp;" } };
  const captured = await withRailroadText(db, () => {
    db.clear(); db.setTitle("完整标题"); db.setAccTitle("无障碍"); db.setAccDescription("说明"); db.addRule(rule);
    expect(db.getRules()).toEqual([rule]); return "rendered";
  });
  expect(captured.value).toBe("rendered"); expect(captured.database.getRules()).toEqual([rule]);
  expect(captured.database.getTitle()).toBe("完整标题"); expect(captured.database.getAccTitle()).toBe("无障碍");
  for (const method of Object.keys(methods) as (keyof typeof methods)[]) expect(db[method]).toBe(methods[method]);
  expect(db.getRules()[0].name).toBe("HTML sanitized");
  await expect(withRailroadText(db, () => { db.clear(); throw new Error("syntax"); })).rejects.toThrow("syntax");
  for (const method of Object.keys(methods) as (keyof typeof methods)[]) expect(db[method]).toBe(methods[method]);
  const next = await withRailroadText(db, () => { db.clear(); db.addRule({ name: "next", definition: { type: "terminal", value: "next" } }); });
  expect(next.database.getRules().map(({ name }) => name)).toEqual(["next"]);
  expect(captured.database.getRules()).toEqual([rule]);
});
