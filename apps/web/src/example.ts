import english from "./examples/en.md?raw";
import chinese from "./examples/zh-CN.md?raw";

// Match the original, unedited samples so existing libraries can show the newer guide.
const previousChineseExample = {
  name: "入门示例.md",
  value: [
    "# 开始写作",
    "",
    "点击正文任意位置开始编辑。输入 `/` 可以搜索格式、插入表格或切换到源码。",
    "",
    "- [ ] 试试勾选待办",
    "- [ ] 导入自己的 Markdown 文件",
    "",
    "| 操作 | 快捷键 |",
    "| :--- | :--- |",
    "| 切换正文和源码 | Ctrl+/ |",
    "| 插入表格 | Ctrl+Alt+T |",
    "| 全屏编辑 | Alt+Enter |",
    "",
    "## 公式与图表",
    "",
    "$$",
    "\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}",
    "$$",
    "",
    "```mermaid",
    "flowchart LR",
    "  A[导入 Markdown] --> B[编辑正文]",
    "  B --> C[导出文件]",
    "```",
    "",
  ].join("\n"),
};

const previousEnglishExample = {
  name: "Getting started.md",
  value: [
    "# Getting started",
    "",
    "Click anywhere in the document to start editing. Type `/` to find formatting tools, insert a table, or switch to Markdown source.",
    "",
    "- [ ] Try checking off a task",
    "- [ ] Import your own Markdown file",
    "",
    "| Action | Shortcut |",
    "| :--- | :--- |",
    "| Switch between editing and source | Ctrl+/ |",
    "| Insert a table | Ctrl+Alt+T |",
    "| Edit in fullscreen | Alt+Enter |",
    "",
    "## Math and diagrams",
    "",
    "$$",
    "\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}",
    "$$",
    "",
    "```mermaid",
    "flowchart LR",
    "  A[Import Markdown] --> B[Edit the document]",
    "  B --> C[Export the file]",
    "```",
    "",
  ].join("\n"),
};

export const example = { name: previousChineseExample.name, value: chinese.replace(/\r\n?/g, "\n") };
export const englishExample = { name: previousEnglishExample.name, value: english.replace(/\r\n?/g, "\n") };

export const previousExampleValues = {
  "zh-CN": new Set(["Ctrl+Alt+T", "Ctrl+T", "Ctrl+Shift+Enter"].map(key =>
    previousChineseExample.value.replace("| 插入表格 | Ctrl+Alt+T |", `| 插入表格 | ${key} |`))),
  en: new Set([previousEnglishExample.value]),
};
