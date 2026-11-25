import { useEffect, useId, useState } from "react";
import { MarkdownMessageError } from "../core/locale";
import { renderMermaid } from "../diagrams/mermaidRender";
import { useMarkdownEnvironment } from "./editorContext";
export default function MermaidDiagram({ code }: { code: string }) {
  const id = "diagram-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [showSource, setShowSource] = useState(false);
  const { theme, t } = useMarkdownEnvironment();
  useEffect(() => {
    let active = true;
    setSvg("");
    setError("");
    const timer = setTimeout(() => {
      void renderMermaid(code, id, theme, t, () => active)
        .then((result) => { if (active) setSvg(result); })
        .catch((err: unknown) => {
          if (active)
            setError(
              err instanceof MarkdownMessageError ? t(err.key, err.values) : err instanceof Error
                ? err.message.split("\n").slice(0, 3).join("\n")
                : t("图表语法有误"),
            );
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [code, id, theme, t]);
  return (
    <div className="markdown-mermaid">
      {svg ? (
        <div
          className="mermaid-canvas"
          role="img"
          aria-label={t("Mermaid 图表")}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : error ? (
        <div className="markdown-diagram-error" role="status">
          {t("图表暂时无法预览：{error}", { error })}
        </div>
      ) : (
        <p className="markdown-loading">{t("正在绘制图表…")}</p>
      )}
      <button
        type="button"
        className="mermaid-source-toggle"
        aria-expanded={showSource}
        onClick={() => setShowSource(!showSource)}
      >
        {showSource ? t("收起源码") : t("查看源码")}
      </button>
      {(showSource || error) && (
        <pre>
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
