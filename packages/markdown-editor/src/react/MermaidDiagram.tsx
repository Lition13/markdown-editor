import { useEffect, useId, useState } from "react";
import { renderMermaid } from "../diagrams/mermaidRender";
import { useMarkdownEnvironment } from "./editorContext";
export default function MermaidDiagram({ code }: { code: string }) {
  const id = "diagram-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [showSource, setShowSource] = useState(false);
  const { theme } = useMarkdownEnvironment();
  useEffect(() => {
    let active = true;
    setSvg("");
    setError("");
    const timer = setTimeout(() => {
      void renderMermaid(code, id, theme, () => active)
        .then((result) => { if (active) setSvg(result); })
        .catch((err: unknown) => {
          if (active)
            setError(
              err instanceof Error
                ? err.message.split("\n").slice(0, 3).join("\n")
                : "图表语法有误",
            );
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [code, id, theme]);
  return (
    <div className="markdown-mermaid">
      {svg ? (
        <div
          className="mermaid-canvas"
          role="img"
          aria-label="Mermaid 图表"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : error ? (
        <div className="markdown-diagram-error" role="status">
          图表暂时无法预览：{error}
        </div>
      ) : (
        <p className="markdown-loading">正在绘制图表…</p>
      )}
      <button
        type="button"
        className="mermaid-source-toggle"
        aria-expanded={showSource}
        onClick={() => setShowSource(!showSource)}
      >
        {showSource ? "收起源码" : "查看源码"}
      </button>
      {(showSource || error) && (
        <pre>
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
