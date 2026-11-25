import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MarkdownRenderer from "../react/MarkdownRenderer";
import { defaultEnvironment, MarkdownEnvironment, type MarkdownOptions } from "../react/editorContext";
import { emptyMarkdownMarkerRange, indentListItems } from "./markdownList";
import { codeIndentBackspace, codeIndentWidth, codeLineBreak, editableCodeFence } from "./markdownCodeEditing";
import {
  normalizeMarkdown,
  wrapInline,
  wrapInlineCode,
  prefixLines,
  indentLines,
  insertCodeBlock,
  continueMarkdownLine,
  isMarkdownIndentContext,
  taskMarker,
  toggleMarkdownTask,
  safeMarkdownUrl,
  markdownLink,
} from "./markdown";

const render = (value: string, normalizeLink?: MarkdownOptions["normalizeLink"]) =>
  renderToStaticMarkup(<MarkdownEnvironment.Provider value={{ ...defaultEnvironment, normalizeLink }}>
    <MarkdownRenderer value={value} />
  </MarkdownEnvironment.Provider>);
const all = (value: string) => ({ start: 0, end: value.length });
const end = (value: string) => ({ start: value.length, end: value.length });
describe("Markdown 描述编辑", () => {
  it("代码续行沿用制表符或空格，注释与纯文本保持原缩进", () => {
    const python = "~~~python\nif enabled:\n\tprepare()\n~~~";
    const atColon = end(python.slice(0, python.indexOf(":") + 1));
    const fence = editableCodeFence(python, atColon)!;
    expect(codeIndentWidth(python, fence)).toBe("\t");
    expect(codeLineBreak(python, atColon, fence)).toEqual({ insert: "\n\t", caret: 2 });
    expect(codeLineBreak(python, atColon, fence, true)).toEqual({ insert: "\n", caret: 1 });
    const afterTab = end(python.slice(0, python.indexOf("prepare")));
    expect(codeIndentBackspace(python, afterTab, fence)).toEqual({ start: afterTab.start - 1, end: afterTab.end });

    for (const [language, line] of [["js", "  // {"], ["text", "  项目["]]) {
      const source = "~~~" + language + "\n" + line + "\n~~~";
      const range = end(source.slice(0, source.lastIndexOf("\n")));
      expect(codeLineBreak(source, range, editableCodeFence(source, range)!)).toEqual({ insert: "\n  ", caret: 3 });
    }
  });
  it("只读预览从正文开始，后续分隔线仍按 Markdown 渲染", () => {
    const preview = render("---\nname: my-skill\n# 文件头注释\n---\n\n# 正文\n\n---\n\n完成。");
    expect(preview).toContain(">正文</h1>");
    expect(preview).toContain("<hr/>");
    expect(preview).not.toContain("my-skill");
    expect(preview).not.toContain("文件头注释");
    expect(render("---\n\n# 普通文档")).toContain("<hr/>");
  });
  it("粗体与斜体可叠加和取消，不误删另一种格式", () => {
    const bold = wrapInline("重点", all("重点"), "**");
    expect(bold.value).toBe("**重点**");
    const both = wrapInline(bold.value, bold, "*");
    expect(both.value).toBe("***重点***");
    expect(wrapInline(both.value, both, "*").value).toBe("**重点**");
    expect(wrapInline("**重点**", all("**重点**"), "*").value).toBe(
      "***重点***",
    );
    expect(wrapInline(bold.value, bold, "**").value).toBe("重点");
  });
  it("行内代码和代码块保留反引号、空格及选择内容", () => {
    const code = "`a` + b";
    const inline = wrapInlineCode(code, all(code));
    expect(inline.value).toBe("`` `a` + b ``");
    expect(render(inline.value)).toContain("`a` + b</code>");
    expect(wrapInlineCode(inline.value, all(inline.value)).value).toBe(code);
    expect(render(wrapInlineCode(" a ", all(" a ")).value)).toContain(
      "> a </code>",
    );
    const block = insertCodeBlock(
      "```example",
      all("```example"),
      "javascript",
    );
    expect(block.value).toContain("````javascript\n```example\n````");
    expect(block.value.slice(block.start, block.end)).toBe("```example");
  });
  it("整行格式、取消格式、嵌套缩进和末尾换行选区正确", () => {
    const text = "第一项\n第二项\n后续";
    const changed = prefixLines(text, { start: 0, end: 8 }, "ordered");
    expect(changed.value).toBe("1. 第一项\n2. 第二项\n后续");
    const nested = indentLines("- 父项\n- 子项", { start: 5, end: 9 });
    expect(nested.value).toBe("- 父项\n    - 子项");
    expect(
      indentLines(nested.value, { start: 5, end: nested.value.length }, true)
        .value,
    ).toBe("- 父项\n- 子项");
    expect(prefixLines("- [x] 完成", all("- [x] 完成"), "task").value).toBe(
      "完成",
    );
    expect(prefixLines("## 标题", all("## 标题"), 3).value).toBe("### 标题");
  });
  it("列表、引用回车续写，完成项重置为空，空项退出", () => {
    for (const [source, expected] of [
      ["9. 项目", "9. 项目\n10. "],
      ["  - [x] 完成", "  - [x] 完成\n  - [ ] "],
      ["> - 引用项", "> - 引用项\n> - "],
      ["> 引用", "> 引用\n> "],
    ])
      expect(continueMarkdownLine(source, end(source))?.value).toBe(expected);
    expect(continueMarkdownLine("- [ ] ", end("- [ ] "))?.value).toBe("");
    expect(continueMarkdownLine("普通段落", end("普通段落"))).toBeNull();
    expect(isMarkdownIndentContext("普通段落", end("普通段落"))).toBe(false);
    expect(isMarkdownIndentContext("```js\na", end("```js\na"))).toBe(true);
  });
  it("有序列表移动后按目标层编号并保留所选项的正文和下级", () => {
    const source = "8. 父项\n    1. 已有子项\n9. 移动项\n    - 下级\n10. 后续项";
    const caret = source.indexOf("移动项") + "移动项".length;
    const nested = indentListItems(source, { start: caret, end: caret }, false)!;
    expect(nested.value).toBe("8. 父项\n    1. 已有子项\n    2. 移动项\n        - 下级\n10. 后续项");
    expect(nested.start).toBe(nested.value.indexOf("移动项") + "移动项".length);
    expect(indentListItems(nested.value, nested, true)?.value).toBe(source);

    const wideMarker = "100. 父项\n101. ";
    const child = indentListItems(wideMarker, end(wideMarker), false)!;
    expect(child.value).toBe("100. 父项\n\n     1. ");
    expect(child.start).toBe(child.value.length);
    expect(render(child.value)).toContain('<ol start="100">');
    expect(render(child.value)).toContain("<ol>");

    const quote = "> 3. 父项\n> 4. ";
    expect(indentListItems(quote, end(quote), false)?.value).toBe("> 3. 父项\n>\n>     1. ");
  });
  it("空列表项退格要求空格，并保留引用、正文及下级内容", () => {
    for (const marker of ["1.", "-", "+", "*"]) {
      const quoted = `> ${marker} `;
      expect(emptyMarkdownMarkerRange(quoted, end(quoted))).toEqual({ start: 2, end: quoted.length });
      for (const [draft, cursor] of [
        [marker, marker.length],
        [`${marker} 内容`, marker.length + 1],
        [`    ${marker} `, marker.length + 5],
        [`\`\`\`\n${marker} `, marker.length + 5],
        [`${marker} \n    - 子项`, marker.length + 1],
      ] as const) {
        expect(emptyMarkdownMarkerRange(draft, { start: cursor, end: cursor })).toBeNull();
      }
    }
  });
  it("空待办可移除复选框，保留正文、下级和代码里的标记", () => {
    for (const [source, start] of [["- [ ] ", 0], ["+ [x]", 0], ["> - [X] ", 2]] as const) {
      expect(emptyMarkdownMarkerRange(source, end(source))).toEqual({ start, end: source.length });
    }
    for (const [source, cursor] of [
      ["- [ ] 正文", 6],
      ["- [ ] \n  继续正文", 6],
      ["- [ ] \n  - 下级", 6],
      ["```\n- [ ] ", 10],
    ] as const) {
      expect(emptyMarkdownMarkerRange(source, { start: cursor, end: cursor })).toBeNull();
    }
  });
  it("空引用只移除最后一层，忽略非空引用及代码里的符号", () => {
    expect(emptyMarkdownMarkerRange("> ", end("> "))).toEqual({ start: 0, end: 2 });
    const nested = "> 上文\n> > ";
    expect(emptyMarkdownMarkerRange(nested, end(nested))).toEqual({ start: nested.lastIndexOf(">"), end: nested.length });
    for (const [source, cursor] of [
      ["> 引用内容", 2],
      ["    > ", 6],
      ["```\n> ", 6],
      ["> ```\n> > \n> ```", 10],
    ] as const) {
      expect(emptyMarkdownMarkerRange(source, { start: cursor, end: cursor })).toBeNull();
    }
  });
  it("按 UTF-16 源位置勾选正确项，保留引用和多级列表", () => {
    const text = normalizeMarkdown(
      "说明😀\r\n- [ ] 第一项\r\n  - [x] 第二项\r\n> - [ ] 引用项",
    );
    const offset = text.indexOf("- [ ] 引用项");
    expect(taskMarker(text, offset)?.label).toBe("引用项");
    expect(toggleMarkdownTask(text, offset, true)).toBe(
      text.replace("> - [ ]", "> - [x]"),
    );
    expect(toggleMarkdownTask(text, 0, true)).toBe(text);
    expect(
      toggleMarkdownTask(text, text.indexOf("- [x] 第二项"), false),
    ).toContain("- [ ] 第二项");
  });
  it("允许网页、任务链接和嵌入图片，拒绝脚本、文件和 SVG 数据地址", () => {
    for (const url of [
      "javascript:alert(1)",
      "java\nscript:alert(1)",
      "file:///C:/Windows/a",
      "data:text/html,abc",
      "vbscript:hi",
    ])
      expect(safeMarkdownUrl(url)).toBe("");
    expect(safeMarkdownUrl("//example.com/a")).toBe("https://example.com/a");
    expect(safeMarkdownUrl("#task=hello")).toBe("#task=hello");
    expect(safeMarkdownUrl("mailto:test@example.com")).toBe(
      "mailto:test@example.com",
    );
    expect(safeMarkdownUrl("data:image/svg+xml;base64,AA==", "image")).toBe("");
    expect(safeMarkdownUrl("data:image/png;base64,AA==", "image")).toContain(
      "data:image/png",
    );
    expect(
      render(markdownLink("说明 ] 内容", "https://example.com/a(b)")),
    ).toContain('href="https://example.com/a(b)"');
  });
});
describe("Markdown 标准渲染", () => {
  it("宿主链接转换在清洗前生效，其他链接沿用通用安全规则", () => {
    const alias = "file:///C:/legacy.html";
    const fragment = "#task=read";
    const external = "https://example.com/notes";
    expect(safeMarkdownUrl(alias)).toBe("");
    const normalizeLink = (href: string) => href === alias ? fragment : undefined;
    const html = render([
      markdownLink("关联记录", alias),
      `<a href="${alias}" onclick="void(0)">旧地址</a>`,
      markdownLink("网页", external),
      markdownLink("其他文件", "file:///C:/other.html"),
    ].join("\n\n"), normalizeLink);
    expect(html.split(`href="${fragment}"`)).toHaveLength(3);
    expect(html).toContain(`href="${external}"`);
    expect(html).not.toMatch(/file:\/\/|onclick=/);
  });
  it("支持 CommonMark 标题、嵌套列表、引用、分隔线及转义", () => {
    const html = render(
      "# 标题\n\n## 二级\n\n### 三级\n\n#### 四级\n\n##### 五级\n\n###### 六级\n\n- 父项\n  - 子项\n\n7. 第七项\n\n> **重点** 与 *斜体*\n\n---\n\n\\*原样\\*\n下一行",
    );
    for (let i = 1; i <= 6; i++) expect(html).toContain(`<h${i} `);
    expect(html).toMatch(/<ul>[\s\S]*<ul>/);
    expect(html).toContain('<ol start="7">');
    expect(html).toContain("<strong>重点</strong>");
    expect(html).toContain("<em>斜体</em>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<hr/>");
    expect(html).toContain("*原样*<br/>");
  });
  it("支持 GFM 表格、删除线、待办、自动链接、引用式链接及脚注", () => {
    const html = render(
      '| 名称 | 数量 |\n| :--- | ---: |\n| ~~旧~~ | 2 |\n\n- [ ] 待办\n- [x] 完成\n\nhttps://example.com\n\n[参考][ref] 和注释[^1]\n\n[ref]: https://example.com/ref "说明"\n[^1]: 脚注内容',
    );
    expect(html).toContain("<table>");
    expect(html).toContain("text-align:right");
    expect(html).toContain("<del>旧</del>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked=""');
    expect(html).toContain('href="https://example.com/ref"');
    expect(html).toContain("data-footnotes");
    expect(html).toContain("脚注内容");
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.every((id) => id.startsWith("md-"))).toBe(true);
    for (const id of ids.filter((id) => id.includes("fn")))
      expect(html).toContain('href="#' + id + '"');
  });
  it("代码高亮、行内和块级公式可离线渲染，未知语言仍显示源码", () => {
    const html = render(
      "```javascript\nconst answer = 42\n```\n\n```unknownlang\n<hello>\n```\n\n公式 $x^2$\n\n$$\n\\frac{1}{2}\n$$",
    );
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("&lt;hello&gt;");
    expect(html).toContain('class="katex"');
    expect(html).toContain("katex-display");
    expect(html).toContain("<math");
  });
  it("支持安全 HTML 和图片，清除执行代码、危险属性和协议", () => {
    const html = render(
      '<details open><summary>展开</summary><kbd>Ctrl</kbd><mark>标记</mark>H<sub>2</sub>O</details>\n\n<img src="data:image/png;base64,AA==" alt="嵌入图片" onerror="alert(1)">\n\n<script>alert(1)</script><iframe src="https://example.com"></iframe>\n\n[恶意](javascript:alert%281%29)\n\n<a href="file:///secret" style="color:red" onclick="bad()">文件</a>',
    );
    expect(html).toContain('<details open="">');
    expect(html).toContain("<kbd>Ctrl</kbd>");
    expect(html).toContain("<mark>标记</mark>");
    expect(html).toContain("<sub>2</sub>");
    expect(html).toContain("data:image/png;base64,AA==");
    expect(html).not.toMatch(
      /<script|<iframe|onerror=|onclick=|javascript:|file:\/\/|style="color:red"/,
    );
  });
});
