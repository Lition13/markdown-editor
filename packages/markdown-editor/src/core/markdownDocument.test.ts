import { expect, test } from "vitest";
import { inspectMarkdown } from "./markdownDocument";

test("大纲和字词统计按正文解析，定位使用编辑器换行格式", () => {
  const lines = [
    "# 计划 *更新*", "", "正文 [链接](https://example.test/path) and version 2.", "",
    "小结", "----", "", "\x60\x60\x60md", "## 代码里的假标题", "\x60\x60\x60",
  ];
  const result = inspectMarkdown(lines.join("\r\n"));
  expect(result).toEqual({
    headings: [
      { depth: 1, title: "计划 更新", offset: 0 },
      { depth: 2, title: "小结", offset: lines.join("\n").indexOf("小结") },
    ],
    words: 13,
    lines: 10,
  });
  expect(inspectMarkdown("中文Hello-world\n")).toMatchObject({ words: 3, lines: 2 });
  expect(inspectMarkdown("")).toEqual({ headings: [], words: 0, lines: 1 });
});
