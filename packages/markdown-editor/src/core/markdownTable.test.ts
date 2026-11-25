import { describe, expect, it } from "vitest";
import { cellsRemovedByResize, changeMarkdownTable, completeTableHeader, escapeTableCell, type MarkdownTable } from "./markdownTable";

describe("Markdown 表格结构编辑", () => {
  it("建表和编辑保留转义竖线", () => {
    expect(completeTableHeader("| `A\\|B` | 备注 |  ")).toBe("\n| --- | --- |\n|   |   |");
    expect(completeTableHeader("| A \\|")).toBeNull();
    expect(escapeTableCell("A\\|B | C\nD")).toBe("A\\|B \\| C D");
  });

  it("移动列、扩展行数时保留旧行中的额外单元格和对齐", () => {
    const input: MarkdownTable = { rows: [["阶段", "次数"], ["**原型**", "1\\|2", "旧备注"]], align: ["left", "right"] };
    const moved = changeMarkdownTable(input, { row: 1, column: 0 }, { kind: "move-column", direction: 1 })!;
    expect(moved.table.align).toEqual(["right", "left"]);
    expect(moved.table.rows[1]).toEqual(["1\\|2", "**原型**", "旧备注"]);
    const bigger = changeMarkdownTable(moved.table, moved.address, { kind: "resize", size: { rows: 3, columns: 2 } })!;
    expect(bigger.table.rows).toEqual([["次数", "阶段"], ["1\\|2", "**原型**", "旧备注"], ["", ""]]);
    expect(cellsRemovedByResize(bigger.table, { rows: 2, columns: 1 })).toBe(3);
    expect(input.rows[1]).toEqual(["**原型**", "1\\|2", "旧备注"]);
  });
});
