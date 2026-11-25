import { expect, test } from "vitest";
import { inspectMarkdown } from "./markdownDocument";
import { isInMarkdownLiteralBlock } from "./markdown";

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

test("文件头中的 YAML 注释与代码标记留在头部，正文定位使用规范化偏移", () => {
  const lines = ["---", "description: |", "  \x60\x60\x60md", "# 元数据注释", "---", "", "# 正文", "", "开始。"];
  const source = lines.join("\n");
  const title = source.indexOf("# 正文");
  expect(inspectMarkdown("\uFEFF" + lines.join("\r\n"))).toEqual({
    headings: [{ depth: 1, title: "正文", offset: title }],
    words: 4,
    lines: lines.length,
  });
  expect(isInMarkdownLiteralBlock(source, source.indexOf("# 元数据注释"))).toBe(true);
  expect(isInMarkdownLiteralBlock(source, title)).toBe(false);
});
