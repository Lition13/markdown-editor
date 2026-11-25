import {
  Bold,
  Code,
  CodeXml,
  FileCode,
  Heading,
  HelpCircle,
  ImagePlus,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Maximize2,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Sigma,
  Strikethrough,
  Table2,
  Undo2,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import EditorDialog from "./EditorDialog";
import { resolveMarkdownLink, useMarkdownEnvironment } from "./editorContext";
import ActionMenu, { type ActionItem, type MenuPoint } from "./ActionMenu";
import MarkdownTableSize from "./MarkdownTableSize";
import { newMarkdownTable, serializeMarkdownTable, type TableSize } from "../core/markdownTable";
import type { InlineMarkdownHandle, MarkdownKeystroke } from "./InlineMarkdownEditor";
import { emptyMarkdownMarkerRange, indentListItems } from "../core/markdownList";
import { suppressBackspaceRepeat } from "../core/keyboard";
import { pairedSymbolAfterInput } from "../core/markdownPairs";
import { formatMarkdownInline, isInlineMarkdownFormat, markdownShortcut, markdownShortcutLabels as keys } from "../core/markdownShortcuts";
import { completedSymbolPair } from "./markdownPairComposition";
import {
  changeMarkdownHeading,
  clampSelection,
  continueMarkdownHeading,
  continueMarkdownLine,
  indentLines,
  insertBlock,
  insertCodeBlock,
  insertMarkdownRule,
  isInMarkdownAddress,
  isInMarkdownFence,
  isMarkdownIndentContext,
  markdownLink,
  normalizeMarkdown,
  prefixLines,
  replaceSelection,
  safeMarkdownUrl,
  type MarkdownEdit,
  type TextSelection,
} from "../core/markdown";
import type { codeLanguages } from "../core/markdownCode";
type Mode = "live" | "edit";
type Snapshot = { value: string; selection: TextSelection };
const InlineMarkdownEditor = lazy(() => import("./InlineMarkdownEditor"));

function textareaPoint(field: HTMLTextAreaElement, position: number): MenuPoint {
  const bounds = field.getBoundingClientRect();
  const style = getComputedStyle(field);
  const mirror = document.createElement("div");
  const properties = ["font", "lineHeight", "letterSpacing", "padding", "border", "boxSizing", "tabSize", "overflowWrap", "wordBreak", "textAlign"] as const;
  for (const property of properties) mirror.style[property] = style[property];
  Object.assign(mirror.style, {
    position: "fixed", visibility: "hidden", whiteSpace: "pre-wrap", width: `${bounds.width}px`,
    left: `${bounds.left - field.scrollLeft}px`, top: `${bounds.top - field.scrollTop}px`,
  });
  mirror.textContent = field.value.slice(0, position);
  const caret = document.createElement("span");
  caret.textContent = field.value.slice(position) || "\u200b";
  mirror.append(caret);
  document.body.append(mirror);
  const rect = caret.getClientRects()[0] ?? bounds;
  mirror.remove();
  return { x: rect.left, y: rect.bottom + 5, aboveY: rect.top };
}

export default function MarkdownNotes({
  value,
  onChange,
  allowExpand = true,
}: {
  value: string;
  onChange: (value: string) => void;
  allowExpand?: boolean;
}) {
  const normalized = normalizeMarkdown(value);
  const [mode, setMode] = useState<Mode>("live");
  const [focusLive, setFocusLive] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [, refresh] = useState(0);
  const selection = useRef<TextSelection>({ start: 0, end: 0 });
  const current = useRef(normalized);
  const past = useRef<Snapshot[]>([]),
    future = useRef<Snapshot[]>([]);
  const last = useRef({ at: 0, kind: "" });
  useEffect(() => {
    if (normalized !== current.current) {
      current.current = normalized;
      past.current = [];
      future.current = [];
      last.current = { at: 0, kind: "" };
      selection.current = clampSelection(normalized, selection.current);
      refresh((v) => v + 1);
    }
  }, [normalized]);
  const commit = (next: string, kind = "typing") => {
    if (next === current.current) return;
    const coalesce =
      kind === "typing" &&
      last.current.kind === kind &&
      Date.now() - last.current.at < 750;
    if (!coalesce)
      past.current = [
        ...past.current.slice(-49),
        { value: current.current, selection: { ...selection.current } },
      ];
    future.current = [];
    last.current = { at: Date.now(), kind };
    current.current = next;
    onChange(next);
    refresh((v) => v + 1);
  };
  const undo = (redo = false) => {
    const source = redo ? future : past,
      target = redo ? past : future;
    const snapshot = source.current.pop();
    if (!snapshot) return null;
    target.current.push({
      value: current.current,
      selection: { ...selection.current },
    });
    current.current = snapshot.value;
    selection.current = snapshot.selection;
    last.current = { at: 0, kind: "" };
    onChange(snapshot.value);
    refresh((v) => v + 1);
    return snapshot.selection;
  };
  const closeExpanded = () => {
    setFocusLive(true);
    setExpanded(false);
  };
  const editor = (
    <Editor
      value={normalized}
      mode={mode}
      onMode={(next) => {
        setFocusLive(next === "live");
        setMode(next);
        last.current = { at: 0, kind: "" };
      }}
      onMove={() => { last.current = { at: 0, kind: "" }; }}
      commit={commit}
      onUndo={undo}
      canUndo={past.current.length > 0}
      canRedo={future.current.length > 0}
      focusLive={focusLive}
      selection={selection}
      expanded={expanded}
      onExpand={allowExpand ? (expanded ? closeExpanded : () => setExpanded(true)) : undefined}
    />
  );
  return expanded ? (
    <>
      <EditorDialog
        title="编辑 Markdown"
        onClose={closeExpanded}
        initialFocus=".notes-editor-textarea, .notes-inline-editor .cm-content"
      >
        {editor}
        <div className="markdown-editor-modal-footer">
          <button
            className="primary-button small"
            onClick={closeExpanded}
          >
            完成编辑
          </button>
        </div>
      </EditorDialog>
    </>
  ) : (
    editor
  );
}
function Editor({
  value,
  mode,
  onMode,
  onMove,
  commit,
  onUndo,
  canUndo,
  canRedo,
  focusLive,
  selection,
  expanded,
  onExpand,
}: {
  value: string;
  mode: Mode;
  onMode: (mode: Mode) => void;
  onMove: () => void;
  commit: (value: string, kind?: string) => void;
  onUndo: (redo?: boolean) => TextSelection | null;
  canUndo: boolean;
  canRedo: boolean;
  focusLive: boolean;
  selection: RefObject<TextSelection>;
  expanded: boolean;
  onExpand?: () => void;
}) {
  const environment = useMarkdownEnvironment();
  const ref = useRef<HTMLTextAreaElement>(null);
  const inline = useRef<InlineMarkdownHandle>(null);
  const pendingFocus = useRef<TextSelection | null>(null);
  const compositionStart = useRef<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [tools, setTools] = useState<MenuPoint | null>(null);
  const [languages, setLanguages] = useState<typeof codeLanguages>([]);
  const [panelPoint, setPanelPoint] = useState<MenuPoint | null>(null);
  const latest = useRef(value);
  latest.current = value;
  const active = useRef(true);
  const [panel, setPanel] = useState<"link" | "image" | "help" | "table" | null>(null);
  const [url, setUrl] = useState(""),
    [label, setLabel] = useState(""),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const focusAt = (range: TextSelection) => {
    selection.current = range;
    if (inline.current) {
      inline.current.focus(range);
      return;
    }
    const editor = ref.current;
    if (!editor) return;
    const local = clampSelection(editor.value, range);
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(local.start, local.end);
  };
  const sourceSelection = (field: HTMLTextAreaElement) => ({ start: field.selectionStart, end: field.selectionEnd });
  const range = () => inline.current?.selection() ?? (ref.current ? sourceSelection(ref.current) : selection.current);
  const pointAt = (position: number) => inline.current?.point(position) ?? (ref.current ? textareaPoint(ref.current, position) : undefined);
  const openTools = (bookmark: TextSelection, point: MenuPoint) => {
    if (isInMarkdownFence(latest.current, bookmark.start)
      || isInMarkdownAddress(latest.current, bookmark.start)) return false;
    selection.current = bookmark;
    setTools(point);
    if (!languages.length) {
      void import("../core/markdownCode").then(module => {
        if (active.current) setLanguages(module.codeLanguages);
      }).catch(() => {
        if (active.current) setError("无法加载代码语言");
      });
    }
    return true;
  };
  const closeTools = (restore = true) => {
    setTools(null);
    if (restore) focusAt(selection.current);
  };
  const closePanel = (restore = true) => {
    setPanel(null);
    if (restore) focusAt(selection.current);
  };
  const edit = (result: MarkdownEdit, kind = "format") => {
    const next = { start: result.start, end: result.end };
    if (result.value === latest.current) {
      focusAt(next);
      return;
    }
    pendingFocus.current = next;
    commit(result.value, kind);
    selection.current = next;
  };
  const undoEdit = (redo = false) => {
    const restored = onUndo(redo);
    if (restored) pendingFocus.current = restored;
  };
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const next = pendingFocus.current;
    pendingFocus.current = null;
    focusAt(next);
  }, [value]);
  useLayoutEffect(() => {
    if (mode === "edit") focusAt(selection.current);
  }, [expanded, mode]);
  const format = (
    kind:
      | "bold"
      | "italic"
      | "strike"
      | "inline"
      | "bullet"
      | "ordered"
      | "task"
      | "quote"
      | "code"
      | "rule"
      | "math"
      | "mermaid"
      | number,
    language = "text",
  ) => {
    setPanel(null);
    const text = latest.current,
      s = range();
    if (typeof kind === "number") {
      if (inline.current?.setHeading(kind) || kind === 0) return;
      return edit(prefixLines(text, s, kind));
    }
    if (["bullet", "ordered", "task", "quote"].includes(kind))
      return edit(
        prefixLines(text, s, kind as "bullet" | "ordered" | "task" | "quote"),
      );
    if (isInlineMarkdownFormat(kind)) return edit(formatMarkdownInline(text, s, kind));
    if (kind === "code") return edit(insertCodeBlock(text, s, language));
    if (kind === "rule") return edit(insertMarkdownRule(text, s));
    if (kind === "math") {
      const equation = text.slice(s.start, s.end) || "e = mc^2";
      return edit(insertBlock(text, s, "$$\n" + equation + "\n$$", 3, 3 + equation.length));
    }
    if (kind === "mermaid")
      return edit(
        insertBlock(
          text,
          s,
          "```mermaid\nflowchart LR\n  A[开始] --> B[完成]\n```",
        ),
      );
  };
  const showPanel = (kind: "link" | "image" | "help" | "table") => {
    selection.current = range();
    const point = tools ?? pointAt(selection.current.end);
    if (!point) return;
    setPanelPoint(point);
    setLabel(value.slice(selection.current.start, selection.current.end));
    setUrl("");
    setError("");
    setPanel(kind);
  };
  const insertTable = (size: TableSize) => {
    const source = serializeMarkdownTable(newMarkdownTable(size));
    const bookmark = selection.current;
    setPanel(null);
    if (inline.current) inline.current.insertTable(source, bookmark);
    else edit(insertBlock(latest.current, bookmark, source, 2, 2));
  };
  const insertLink = () => {
    const safe = panel === "image" ? safeMarkdownUrl(url, "image") : resolveMarkdownLink(url, environment.normalizeLink);
    if (!safe) {
      setError("请输入有效的网络地址或描述内锚点");
      return;
    }
    edit(
      replaceSelection(
        latest.current,
        selection.current,
        markdownLink(
          label || (panel === "image" ? "图片" : "链接"),
          safe,
          panel === "image",
        ),
      ),
    );
    setPanel(null);
  };
  const loadImages = async (files: File[]) => {
    const images = files.filter((f) =>
      /^image\/(png|jpeg|gif|webp|avif)$/.test(f.type),
    );
    if (!images.length) {
      setError("支持 PNG、JPEG、GIF、WebP 和 AVIF 图片");
      return;
    }
    const initial = latest.current,
      bookmark = range();
    selection.current = bookmark;
    setLoading(true);
    setError("");
    try {
      const values = await Promise.all(
        images.slice(0, 8).map(
          (image) =>
            new Promise<string>((resolve, reject) => {
              if (image.size > 2 * 1024 * 1024) {
                reject(new Error("每张图片不能超过 2 MB"));
                return;
              }
              const reader = new FileReader();
              reader.onload = () =>
                resolve(markdownLink(image.name, String(reader.result), true));
              reader.onerror = () => reject(new Error("图片读取失败"));
              reader.readAsDataURL(image);
            }),
        ),
      );
      if (!active.current) return;
      const source = latest.current;
      const s = source === initial ? bookmark : range();
      edit(replaceSelection(source, s, values.join("\n\n")));
      setPanel(null);
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : "图片读取失败");
    } finally {
      if (active.current) setLoading(false);
      if (file.current) file.current.value = "";
    }
  };
  const handleKey = (event: MarkdownKeystroke, composing: boolean) => {
    if (composing || event.defaultPrevented) return false;
    const mod = event.ctrlKey || event.metaKey;
    const shortcut = markdownShortcut(event);
    if (shortcut) {
      if (shortcut === "expand" && !onExpand) return false;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return true;
      const current = range();
      if (shortcut === "source") {
        selection.current = current;
        onMode(mode === "live" ? "edit" : "live");
      } else if (shortcut === "expand") {
        selection.current = current;
        onExpand?.();
      } else if (shortcut === "help") {
        showPanel("help");
      } else if (shortcut === "undo" || shortcut === "redo") {
        undoEdit(shortcut === "redo");
      } else if (shortcut === "indent" || shortcut === "outdent") {
        const value = latest.current;
        const outdent = shortcut === "outdent";
        edit(indentListItems(value, current, outdent) ?? indentLines(value, current, outdent));
      } else if (!isInMarkdownFence(latest.current, current.start)) {
        if (shortcut === "table" || shortcut === "link" || shortcut === "image") showPanel(shortcut);
        else format(shortcut);
      }
      return true;
    }
    if (ref.current && event.key === "/" && !mod && !event.altKey) {
      const bookmark = range();
      if (openTools(bookmark, textareaPoint(ref.current, bookmark.end))) {
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
    }
    if (ref.current && event.key === "Backspace" && !mod && !event.altKey && !event.shiftKey) {
      const gap = emptyMarkdownMarkerRange(latest.current, range());
      if (gap) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) edit(replaceSelection(latest.current, gap, "", 0, 0));
        suppressBackspaceRepeat(environment.surface, environment.overlay);
        return true;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !mod && !event.altKey) {
      const value = latest.current;
      const current = range();
      const next = isInMarkdownFence(value, current.start) ? null
        : continueMarkdownHeading(value, current) ?? continueMarkdownLine(value, current);
      if (next) {
        event.preventDefault();
        edit(next);
        return true;
      }
    }
    if (event.key === "Tab" && !mod && !event.altKey) {
      const value = latest.current;
      const current = range();
      const next = changeMarkdownHeading(value, current, event.shiftKey ? -1 : 1)
        ?? indentListItems(value, current, event.shiftKey)
        ?? (isInMarkdownFence(value, current.start) || isMarkdownIndentContext(value, current)
          ? indentLines(value, current, event.shiftKey) : null);
      if (next) {
        event.preventDefault();
        event.stopPropagation();
        edit(next);
        return true;
      }
    }
    return false;
  };
  const option = (
    id: string,
    label: string,
    icon: React.ReactNode,
    run: () => void,
    keywords?: string,
    shortcut?: string,
    disabled = false,
  ): ActionItem => ({
    id, label, icon, keywords, shortcut, disabled, keepOpen: true,
    run: () => {
      setTools(null);
      run();
    },
  });
  const commands: ActionItem[] = tools ? [
    { id: "search", search: "搜索描述工具" },
    ...["一", "二", "三", "四", "五", "六"].map((name, index) => {
      const depth = index + 1;
      return option(`h${depth}`, `${name}级标题`, <Heading size={15} />, () => format(depth), `h${depth} 标题 heading`, mode === "live" ? `Ctrl ${depth}` : undefined);
    }),
    ...(mode === "live" ? [option("paragraph", "普通段落", <Pilcrow size={15} />, () => format(0), "取消标题 paragraph", "Ctrl 0")] : []),
    option("bold", "描述加粗", <Bold size={15} />, () => format("bold"), "bold 粗体", keys.bold),
    option("italic", "描述斜体", <Italic size={15} />, () => format("italic"), "italic", keys.italic),
    option("strike", "描述删除线", <Strikethrough size={15} />, () => format("strike"), "strike", keys.strike),
    option("inline", "描述行内代码", <Code size={15} />, () => format("inline"), "inline code", keys.inline),
    option("bullet", "描述无序列表", <List size={15} />, () => format("bullet"), "bullet list", keys.bullet),
    option("ordered", "描述有序列表", <ListOrdered size={15} />, () => format("ordered"), "ordered list", keys.ordered),
    option("task", "描述待办列表", <ListChecks size={15} />, () => format("task"), "checklist todo 复选框", keys.task),
    option("quote", "描述引用", <Quote size={15} />, () => format("quote"), "quote", keys.quote),
    option("link", "插入描述链接", <Link size={15} />, () => showPanel("link"), "link", keys.link),
    option("image", "插入描述图片", <ImagePlus size={15} />, () => showPanel("image"), "image", keys.image),
    option("table", "描述表格", <Table2 size={15} />, () => showPanel("table"), "table", keys.table),
    option("rule", "描述分隔线", <Minus size={15} />, () => format("rule"), "divider"),
    {
      id: "code", label: "描述代码块", icon: <CodeXml size={15} />, keywords: "code block", shortcut: keys.code,
      children: languages.map(({ id, label, aliases }) =>
        option(id, label, <CodeXml size={14} />, () => format("code", id), [id, ...aliases].join(" "))),
    },
    option("math", "描述数学公式", <Sigma size={15} />, () => format("math"), "math formula latex", keys.math),
    option("mermaid", "描述 Mermaid 图表", <FileCode size={15} />, () => format("mermaid"), "diagram"),
    option("undo", "撤销描述编辑", <Undo2 size={15} />, () => undoEdit(), "undo", keys.undo, !canUndo),
    option("redo", "重做描述编辑", <Redo2 size={15} />, () => undoEdit(true), "redo", keys.redo, !canRedo),
    mode === "live"
      ? option("source", "编辑描述源码", <Code size={15} />, () => onMode("edit"), "source markdown", keys.source)
      : option("live", "实时编辑描述", <Code size={15} />, () => onMode("live"), "live 正文", keys.source),
    ...(onExpand && !expanded ? [option("expand", "全屏编辑描述", <Maximize2 size={15} />, onExpand, "fullscreen", keys.expand)] : []),
    option("help", "Markdown 语法帮助", <HelpCircle size={15} />, () => showPanel("help"), "help", keys.help),
  ] : [];
  const textarea = (
    <textarea
      ref={ref}
      className="detail-notes notes-editor-textarea"
      aria-label={environment.ariaLabel}
      aria-description="输入 / 打开描述工具"
      placeholder={environment.placeholder}
      value={value}
      onCompositionStart={() => { compositionStart.current = latest.current; }}
      onCompositionEnd={e => {
        const before = compositionStart.current;
        compositionStart.current = null;
        const field = e.currentTarget;
        const pair = before !== null && completedSymbolPair(before, field.value, field.selectionEnd, e.data);
        if (pair) {
          field.value = pair.edit.value;
          selection.current = pair.range;
          edit(pair.edit, "typing");
        }
      }}
      onChange={(e) => {
        const field = e.currentTarget;
        const event = e.nativeEvent as InputEvent;
        const pair = !event.isComposing && pairedSymbolAfterInput(latest.current, field.value, field.selectionEnd, {
          inputType: event.inputType, previousSelection: selection.current,
        });
        if (pair) {
          field.value = pair.edit.value;
          selection.current = pair.range;
          edit(pair.edit);
          return;
        }
        commit(field.value);
        selection.current = sourceSelection(field);
      }}
      onSelect={(e) => { selection.current = sourceSelection(e.currentTarget); }}
      rows={Math.max(6, Math.min(16, value.split("\n").length + 2))}
      onKeyDown={(e) => {
        if (e.currentTarget === e.currentTarget.ownerDocument.activeElement) {
          handleKey(e, e.nativeEvent.isComposing || compositionStart.current !== null);
        }
      }}
      onPaste={(e) => {
        const images = Array.from(e.clipboardData.files).filter(f => f.type.startsWith("image/"));
        if (images.length) {
          e.preventDefault();
          void loadImages(images);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          e.stopPropagation();
          void loadImages(Array.from(e.dataTransfer.files));
        }
      }}
    />
  );

  const panelLabel = panel === "image" ? "插入描述图片" : panel === "link" ? "插入描述链接" : panel === "table" ? "插入表格" : "Markdown 语法帮助";
  return (
    <div className="markdown-notes" aria-busy={loading || undefined}>
      <input
        ref={file}
        type="file"
        hidden
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
        aria-label="插入本地 Markdown 图片"
        onChange={e => { void loadImages(Array.from(e.target.files ?? [])); }}
      />
      {error && !panel && <p className="notes-edit-error" role="alert">{error}</p>}
      <div className="notes-editor-body">
        {mode === "live" ? (
          <div className="notes-live-document">
            <Suspense fallback={<div className="markdown-loading">正在载入描述…</div>}>
              <InlineMarkdownEditor
                ref={inline}
                value={value}
                cursor={selection}
                focusOnMount={focusLive || expanded}
                onEdit={(next, before, after, kind) => {
                  selection.current = before;
                  commit(next, kind);
                  selection.current = after;
                }}
                onMove={onMove}
                onKey={handleKey}
                onSlash={openTools}
                onImages={files => { void loadImages(files); }}
              />
            </Suspense>
          </div>
        ) : textarea}
      </div>
      {tools && (
        <ActionMenu
          label="描述工具"
          className="notes-command-menu"
          items={commands}
          point={tools}
          onClose={closeTools}
          resolvePoint={() => pointAt(selection.current.end)}
          search={{
            emptyText: "没有匹配的工具",
            selectFirst: true,
            closeOnEmptyBackspace: true,
            onEmptySlash: () => {
              setTools(null);
              edit(replaceSelection(latest.current, selection.current, "/"));
            },
          }}
        />
      )}
      {panel && panelPoint && (
        <ActionMenu
          dialog
          label={panelLabel}
          closeLabel={panel === "help" ? "关闭语法帮助" : "关闭插入面板"}
          className="notes-command-panel"
          point={panelPoint}
          onClose={closePanel}
          items={[{
            id: "description-panel",
            content: panel === "table" ? <MarkdownTableSize initial={{ rows: 3, columns: 2 }} label="插入表格" onApply={insertTable} /> : panel === "help" ? (
              <div className="notes-help-panel">
                <pre>{"# 一级标题 · ## 二级标题\n**加粗**  *斜体*  ~~删除线~~\n`行内代码`\n- 无序列表\n1. 有序列表\n- [ ] 未完成  - [x] 已完成\n> 引用\n[文字](https://example.com)\n![图片说明](图片地址)\n| 标题 | 标题 |\n| --- | --- |\n| 内容 | 内容 |\n$行内公式$ · $$块级公式$$\n脚注[^1]\n[^1]: 脚注内容"}</pre>
                <p>输入 / 搜索工具，连续输入 // 插入 /。Ctrl+B 加粗、Ctrl+I 斜体、Ctrl+K 插入链接、Alt+T 切换待办列表。列表内回车续写，空列表项回车退出。支持粘贴或拖入本地图片。</p>
              </div>
            ) : (
              <form className="notes-insert-form" onSubmit={e => { e.preventDefault(); insertLink(); }}>
                <label>
                  {panel === "link" ? "显示文字" : "图片说明"}
                  <input aria-label="Markdown 链接文字" value={label} onChange={e => setLabel(e.target.value)} />
                </label>
                <label>
                  {panel === "link" ? "链接地址" : "图片地址"}
                  <input
                    aria-label="Markdown 地址"
                    placeholder={panel === "image" ? "https://…/image.png" : "https://… 或 #章节"}
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                  />
                </label>
                {error && <p className="notes-edit-error" role="alert">{error}</p>}
                {panel === "image" && (
                  <button type="button" className="outline-button small" onClick={() => file.current?.click()} disabled={loading}>
                    从设备选择图片
                  </button>
                )}
                <button className="primary-button small" type="submit">插入</button>
              </form>
            ),
          }]}
        />
      )}
    </div>
  );
}
