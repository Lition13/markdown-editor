import { describe, expect, it } from "vitest";
import { vennNotes } from "./mermaidDiagramNotes";

describe("Venn project descriptions", () => {
  it("retains every record, literal labels and distinct region keys without prototype collisions", () => {
    const areas = [{ sets: ["a,b", "c"], size: 2, label: "第一区域" }, { sets: ["a", "b,c"], size: 3, label: "第二区域" }];
    const texts = [{ sets: ["a,b", "c"], id: "__proto__", label: "<literal> & 说明" }, { sets: ["a", "b,c"], id: "constructor", label: "第二条记录" }, { sets: ["unknown"], id: "第三条记录" }];
    const result = vennNotes({ getSubsetData: () => areas, getTextData: () => texts, getStyleData: () => [
      { targets: ["__proto__"], styles: { color: "#b64976" } }, { targets: ["constructor"], styles: { color: "#178673" } },
    ] });
    expect(result).toEqual([{ context: "第一区域", label: "<literal> & 说明", color: "#b64976" },
      { context: "第二区域", label: "第二条记录", color: "#178673" }, { context: "unknown", label: "第三条记录", color: undefined }]);
    expect(Object.prototype).not.toHaveProperty("color");
    expect(texts[0].sets).toEqual(["a,b", "c"]);
  });
});
