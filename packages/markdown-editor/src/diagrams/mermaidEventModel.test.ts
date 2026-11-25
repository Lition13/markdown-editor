import { expect, test } from "vitest";
import { buildEventModel, eventDataBody, eventModelSvg, type EventFrame, type EventModelAst } from "./mermaidEventModel";

const frame = (name: string, modelEntityType: string, entityIdentifier: string, extra: Partial<EventFrame> = {}): EventFrame => ({
  name, modelEntityType, entityIdentifier, $type: "EmTimeFrame", sourceFrames: [], ...extra,
});

test("Event Modeling retains full inline/block data, namespace roles and repeated calls without overlap", () => {
  const ast: EventModelAst = { frames: [frame("01", "ui", "Shop.Screen"), frame("02", "cmd", "Shop.Add", { dataInlineValue: "{value:30}" }),
    frame("03", "cmd", "Shop.Other", { dataReference: { $refText: "__proto__" } }), frame("04", "evt", "Shop.Saved")],
    dataEntities: [{ name: "__proto__", dataBlockValue: "{\r\n  value: '<script> &amp;'\r\n  last: 'finalZ9'\r\n}" }] };
  const before = JSON.stringify(ast), state = buildEventModel(ast);
  expect(eventDataBody("{value:30}")).toBe("value:30");
  expect(state.lanes).toHaveLength(3);
  expect(state.boxes[0].x).toBeLessThan(40);
  expect(state.boxes[1].lane).toBe(state.boxes[2].lane);
  expect(state.boxes[2].x).toBeGreaterThan(state.boxes[1].x + state.boxes[1].width);
  expect(state.boxes[2].rows.map((row) => row.text).join(" ")).toContain("last: 'finalZ9'");
  expect(state.relations.map(({ source, target }) => [source.frame.name, target.frame.name])).toEqual([["01", "02"], ["01", "03"], ["03", "04"]]);
  const drawing = eventModelSvg(state, true);
  expect(drawing.svg).toContain("&lt;script&gt; &amp;amp;");
  expect(drawing.svg).not.toMatch(/<script|foreignObject|\sonerror=/);
  expect(JSON.stringify(ast)).toBe(before);
});

test("Event Modeling resolves explicit forward sources, reset semantics and unknown IDs", () => {
  const ast: EventModelAst = { dataEntities: [], frames: [frame("01", "rmo", "Projection", { sourceFrames: [{ $refText: "02" }] }),
    frame("02", "evt", "Changed", { $type: "EmResetFrame" }), frame("03", "ui", "Other"),
    frame("04", "rmo", "View", { $type: "EmResetFrame", sourceFrames: [{ $refText: "02" }] })] };
  const state = buildEventModel(ast);
  expect(state.relations.map(({ source, target, explicit }) => [source.frame.name, target.frame.name, explicit])).toEqual([["02", "01", true], ["02", "03", false], ["02", "04", true]]);
  expect(() => buildEventModel({ ...ast, frames: [...ast.frames, ast.frames[0]] })).toThrow("编号重复");
  expect(() => buildEventModel({ dataEntities: [], frames: [frame("01", "rmo", "View", { sourceFrames: [{ $refText: "missing" }] })] })).toThrow("来源时间帧不存在");
});
