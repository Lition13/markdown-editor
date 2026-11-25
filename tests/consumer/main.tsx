import { MarkdownEditor, MarkdownPreview, type MarkdownTheme } from "@lition13/markdown-editor";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "@lition13/markdown-editor/style.css";

const initial = [
  "# 独立宿主",
  "",
  "| 标题 | 状态 |",
  "| --- | --- |",
  "| 中文 | 待验收 |",
  "",
  "$$",
  "\\frac{1}{2}",
  "$$",
  "",
  "```js",
  "const value = 42;",
  "```",
  "",
  "```mermaid",
  "flowchart LR",
  "  A[本地组件] --> B[完成验收]",
  "```",
  "",
  "[打开记录](file:///C:/export/index.html)",
].join("\n");

function Example() {
  const [value, setValue] = useState(initial);
  const [theme, setTheme] = useState<MarkdownTheme>("dark");
  const [secondEditor, setSecondEditor] = useState(true);
  const [opened, setOpened] = useState("");
  const [copied, setCopied] = useState("");
  return (
    <>
      <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>修改第二个编辑器主题</button>
      <button type="button" onClick={() => setSecondEditor(false)}>卸载第二个编辑器</button>
      <output aria-label="宿主链接">{opened}</output>
      <output aria-label="宿主剪贴板">{copied}</output>
      <MarkdownEditor value={value} onChange={setValue} ariaLabel="第一个编辑器" />
      {secondEditor && <MarkdownEditor value="独立的第二篇文档" onChange={() => {}} ariaLabel="第二个编辑器" theme={theme} />}
      <section aria-label="只读预览">
        <MarkdownPreview
          value={value}
          normalizeLink={href => href === "file:///C:/export/index.html" ? "#task=record" : undefined}
          onOpenLink={setOpened}
          copyText={setCopied}
        />
      </section>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Example />);
