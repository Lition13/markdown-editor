import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Check, Copy, ExternalLink, ImageOff } from "lucide-react";
import type { Element, Root } from "hast";
import type { MarkdownCellPosition, MarkdownContentProps } from "./MarkdownContent";
import {
  normalizeMarkdown,
  safeMarkdownUrl,
  taskMarker,
  toggleMarkdownTask,
} from "../core/markdown";
import { copyMarkdownText, openMarkdownLink, useMarkdownEnvironment } from "./editorContext";
import { markdownFootnotes, markdownMath, markdownSchema, rehypeNormalizeLinks } from "../core/markdownPolicy";
import MermaidDiagram from "./MermaidDiagram";
function documentIds(options: { prefix: string }) {
  return (tree: Root) => {
    const walk = (node: Root | Element | Root["children"][number]) => {
      if (node.type === "element") {
        const p = node.properties;
        if (typeof p.id === "string") p.id = options.prefix + p.id;
        if (
          typeof p.href === "string" &&
          p.href.startsWith("#") &&
          !p.href.startsWith("#task=")
        )
          p.href = "#" + options.prefix + p.href.slice(1);
        if (Array.isArray(p.ariaDescribedBy))
          p.ariaDescribedBy = p.ariaDescribedBy.map(
            (id) => options.prefix + id,
          );
      }
      if ("children" in node) for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}
function plainText(value: ReactNode): string {
  return Children.toArray(value)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? plainText(child.props.children)
          : "",
    )
    .join("");
}
const TaskContext = createContext<ReturnType<typeof taskMarker>>(null);
const SourceContext = createContext<{
  source: string;
  onChange?: MarkdownContentProps["onChange"];
  renderTableCell?: MarkdownContentProps["renderTableCell"];
}>({ source: "" });
const TableCellPosition = createContext<MarkdownCellPosition | null>(null);

function TableRow({ children, node, ...props }: ComponentProps<"tr"> & ExtraProps) {
  const { renderTableCell } = useContext(SourceContext);
  const rowOffset = node?.position?.start.offset;
  return <tr {...props}>
    {renderTableCell && rowOffset !== undefined
      ? Children.toArray(children).filter(isValidElement).map((cell, column) => (
        <TableCellPosition.Provider key={cell.key} value={{ rowOffset, column }}>{cell}</TableCellPosition.Provider>
      ))
      : children}
  </tr>;
}

function TableCell({ tag: Tag, children, ...props }: ComponentProps<"td"> & { tag: "td" | "th" }) {
  const { renderTableCell } = useContext(SourceContext);
  const position = useContext(TableCellPosition);
  return <Tag {...props}>{renderTableCell && position ? renderTableCell(position, children) : children}</Tag>;
}
function TaskCheckbox({ checked }: { checked: boolean }) {
  const marker = useContext(TaskContext);
  const { source, onChange } = useContext(SourceContext);
  return (
    <input
      type="checkbox"
      aria-label={`Markdown 待办：${marker?.label || "待办事项"}`}
      checked={checked}
      disabled={!marker || !onChange}
      onChange={(e) =>
        marker &&
        onChange?.(toggleMarkdownTask(source, marker.offset, e.target.checked))
      }
    />
  );
}
function CodeBlock({ children }: { children: ReactNode }) {
  const environment = useMarkdownEnvironment();
  const [copied, setCopied] = useState(false);
  const child = Children.toArray(children).find((c) => isValidElement(c));
  const language = isValidElement<{ className?: string }>(child)
    ? /language-([\w+-]+)/.exec(child.props.className || "")?.[1] || "text"
    : "text";
  const text = plainText(children).replace(/\n$/, "");
  const copy = async () => {
    try {
      await copyMarkdownText(text, environment);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="markdown-code-block">
      <div className="markdown-code-toolbar">
        <span>{language}</span>
        <button
          type="button"
          aria-label="复制代码"
          title={copied ? "已复制" : "复制代码"}
          onClick={() => void copy()}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "已复制" : "复制"}</span>
        </button>
      </div>
      {language.toLowerCase() === "mermaid" ? (
        <MermaidDiagram code={text} />
      ) : (
        <pre>{children}</pre>
      )}
    </div>
  );
}
function Image({
  src,
  alt,
  title,
}: {
  src?: string;
  alt?: string;
  title?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const safe = src ? safeMarkdownUrl(src, "image") : "";
  if (!safe || failed)
    return (
      <span className="markdown-image-error">
        <ImageOff size={15} />
        {alt || "图片"} · {failed ? "加载失败" : "地址不可用"}
      </span>
    );
  return (
    <span className="markdown-image">
      <img
        src={safe}
        alt={alt || ""}
        title={title}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
      {alt && <span className="markdown-image-caption">{alt}</span>}
    </span>
  );
}
const components: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  img: ({ src, alt, title }) => (
    <Image
      src={typeof src === "string" ? src : undefined}
      alt={alt}
      title={title}
    />
  ),
  table: ({ children }) => (
    <div className="markdown-table-scroll">
      <table>{children}</table>
    </div>
  ),
  tr: TableRow,
  th: ({ node: _node, ...props }) => <TableCell tag="th" {...props} />,
  td: ({ node: _node, ...props }) => <TableCell tag="td" {...props} />,
  li: ({ node, children, className }) => {
    const { source } = useContext(SourceContext);
    const marker = taskMarker(source, node?.position?.start.offset);
    return (
      <TaskContext.Provider value={marker}>
        <li className={className}>{children}</li>
      </TaskContext.Provider>
    );
  },
  input: ({ type, checked }) =>
    type === "checkbox" ? <TaskCheckbox checked={!!checked} /> : null,
  a: ({ href, children, title }) => {
    const environment = useMarkdownEnvironment();
    return href ? (
      <a
        href={href}
        title={title}
        rel="noopener noreferrer"
        onClick={(e) => {
          e.preventDefault();
          if (href.startsWith("#") && !href.startsWith("#task=")) {
            let id = href.slice(1);
            try {
              id = decodeURIComponent(id);
            } catch {}
            e.currentTarget
              .closest(".markdown-body")
              ?.querySelector<HTMLElement>("#" + CSS.escape(id))
              ?.scrollIntoView({ block: "nearest" });
          } else void openMarkdownLink(href, environment);
        }}
      >
        {children}
        {!href.startsWith("#") && (
          <ExternalLink className="markdown-link-icon" size={10} />
        )}
      </a>
    ) : (
      <span>{children}</span>
    );
  },
};
export default function MarkdownRenderer({
  value,
  onChange,
  className = "",
  renderTableCell,
}: MarkdownContentProps) {
  const prefix = "md-" + useId().replace(/[^a-zA-Z0-9_-]/g, "") + "-";
  const { normalizeLink } = useMarkdownEnvironment();
  const source = normalizeMarkdown(value);
  return (
    <SourceContext.Provider value={{ source, onChange, renderTableCell }}>
      <div className={`markdown-body ${className}`}>
        <Markdown
          remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
          remarkRehypeOptions={markdownFootnotes}
          rehypePlugins={[
            rehypeRaw,
            [rehypeNormalizeLinks, normalizeLink],
            [rehypeSanitize, markdownSchema],
            [rehypeKatex, markdownMath],
            [rehypeHighlight, { detect: false, ignoreMissing: true }],
            rehypeSlug,
            [documentIds, { prefix }],
          ]}
          urlTransform={(url, key) =>
            safeMarkdownUrl(url, key === "src" ? "image" : "link")
          }
          components={components}
        >
          {source}
        </Markdown>
      </div>
    </SourceContext.Provider>
  );
}
