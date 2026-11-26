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
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from "react";
import EditorDialog from "./EditorDialog";
import { editorViewport } from "./editorViewport";
import { resolveMarkdownLink, useMarkdownEnvironment, type MarkdownEditorHandle, type MarkdownMode } from "./editorContext";
import { MarkdownMessageError, type MarkdownMessage } from "../core/locale";
import ActionMenu, { type ActionItem, type MenuPoint } from "./ActionMenu";
import MarkdownTableSize from "./MarkdownTableSize";
import { newMarkdownTable, serializeMarkdownTable, type TableSize } from "../core/markdownTable";
import type { InlineMarkdownHandle, MarkdownKeystroke } from "./InlineMarkdownEditor";
import { emptyMarkdownMarkerRange, indentListItems } from "../core/markdownList";
import { readYamlFrontmatter } from "../core/markdownAst";
import { codeIndentBackspace, codeIndentWidth, codeLineBreak, editableCodeFence } from "../core/markdownCodeEditing";
import { suppressBackspaceRepeat } from "../core/keyboard";
import { pairedSymbolAfterInput } from "../core/markdownPairs";
import { formatMarkdownInline, headingForShortcut, headingShortcuts, isInlineMarkdownFormat, isNativeHistoryShortcut } from "../core/markdownShortcuts";
import { editorShortcutPrefix } from "../core/shortcutKeys";
import { useMarkdownKeySequence } from "./useMarkdownKeySequence";
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
  isInMarkdownLiteralBlock,
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
type Snapshot = { value: string; selection: TextSelection };
const InlineMarkdownEditor = lazy(() => import("./InlineMarkdownEditor"));

function changeIndentation(value: string, range: TextSelection, outdent: boolean, explicit = false) {
  const yaml = readYamlFrontmatter(value);
  if (yaml && range.start <= yaml.to) {
    return range.start >= yaml.bodyFrom && range.end <= yaml.bodyTo
      ? indentLines(value, range, outdent, 2)
      : null;
  }
  const trailingNewline = range.start < range.end && value[range.end - 1] === "\n" ? 1 : 0;
  const codeRange = { start: range.start, end: range.end - trailingNewline };
  const fence = editableCodeFence(value, codeRange);
  if (fence) {
    const next = indentLines(value, codeRange, outdent, codeIndentWidth(value, fence), fence.indent.length);
    return { ...next, end: next.end + trailingNewline };
  }
  const heading = explicit ? null : changeMarkdownHeading(value, range, outdent ? -1 : 1);
  return heading ?? indentListItems(value, range, outdent)
    ?? (explicit || isInMarkdownLiteralBlock(value, range.start) || isMarkdownIndentContext(value, range)
      ? indentLines(value, range, outdent) : null);
}

const textareaLayout = ["font", "lineHeight", "letterSpacing", "padding", "border", "boxSizing", "tabSize", "overflowWrap", "wordBreak", "textAlign"] as const;

function textareaMirror(field: HTMLTextAreaElement, bounds: DOMRect, style: CSSStyleDeclaration) {
  const mirror = field.ownerDocument.createElement("div");
  for (const property of textareaLayout) mirror.style[property] = style[property];
  Object.assign(mirror.style, {
    position: "fixed", visibility: "hidden", whiteSpace: "pre-wrap", width: `${bounds.width}px`,
    left: `${bounds.left - field.scrollLeft}px`, top: `${bounds.top - field.scrollTop}px`,
  });
  return mirror;
}

function textareaPoint(field: HTMLTextAreaElement, position: number) {
  const owner = field.ownerDocument;
  const bounds = field.getBoundingClientRect();
  const mirror = textareaMirror(field, bounds, owner.defaultView!.getComputedStyle(field));
  mirror.textContent = field.value.slice(0, position);
  const caret = owner.createElement("span");
  caret.textContent = field.value.slice(position) || "\u200b";
  mirror.append(caret);
  owner.body.append(mirror);
  const rect = caret.getClientRects()[0] ?? bounds;
  mirror.remove();
  return { x: rect.left, y: rect.bottom + 5, aboveY: rect.top };
}

function textareaAnchorPositions(field: HTMLTextAreaElement, bounds: DOMRect, style: CSSStyleDeclaration, offsets: readonly number[]) {
  const owner = field.ownerDocument;
  const mirror = textareaMirror(field, bounds, style);
  const text = mirror.appendChild(owner.createTextNode(field.value + "\u200b"));
  const range = owner.createRange();
  owner.body.append(mirror);
  try {
    const top = mirror.getBoundingClientRect().top;
    return offsets.map(offset => {
      const at = Number.isFinite(offset) ? Math.max(0, Math.min(field.value.length, Math.trunc(offset))) : 0;
      range.setStart(text, at);
      range.setEnd(text, at + 1);
      return range.getBoundingClientRect().top - top;
    });
  } finally { mirror.remove(); }
}

function revealSourceCaret(field: HTMLTextAreaElement, align?: "start") {
  const frame = editorViewport(field);
  if (!frame) return;
  const bounds = field.getBoundingClientRect();
  const internal = field.scrollHeight > field.clientHeight
    && frame.viewport.getComputedStyle(field).getPropertyValue("field-sizing") !== "content";
  const top = internal ? bounds.top + 8 : frame.top;
  const bottom = internal ? bounds.bottom - 8 : frame.bottom;
  if (!internal && !align && bounds.top >= top && bounds.bottom <= bottom) return;
  const caret = textareaPoint(field, field.selectionEnd);
  const target = internal ? field : frame.scroller ?? frame.viewport;
  if (align === "start" || caret.aboveY < top) target.scrollBy(0, caret.aboveY - top);
  else if (caret.y > bottom) target.scrollBy(0, caret.y - bottom);
}

export default function MarkdownNotes({
  editorRef,
  value,
  onChange,
  mode: controlledMode,
  onModeChange,
  allowExpand = true,
}: {
  editorRef?: Ref<MarkdownEditorHandle>;
  value: string;
  onChange: (value: string) => void;
  mode?: MarkdownMode;
  onModeChange?: (mode: MarkdownMode) => void;
  allowExpand?: boolean;
}) {
  const normalized = normalizeMarkdown(value);
  const [localMode, setLocalMode] = useState<MarkdownMode>("live");
  const mode = controlledMode ?? localMode;
  const [focusLive, setFocusLive] = useState(false);
  const wasInSourceMode = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const normalHeight = useRef(0);
  const [, refresh] = useState(0);
  const selection = useRef<TextSelection>({ start: 0, end: 0 });
  const current = useRef(normalized);
  const past = useRef<Snapshot[]>([]),
    future = useRef<Snapshot[]>([]);
  const last = useRef({ at: 0, kind: "" });
  useLayoutEffect(() => {
    if (mode === "source") wasInSourceMode.current = true;
    last.current = { at: 0, kind: "" };
  }, [mode]);
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
    last.current = { at: 0, kind: "" };
    setFocusLive(true);
    setExpanded(false);
  };
  const openExpanded = () => {
    normalHeight.current = stage.current?.getBoundingClientRect().height ?? 0;
    last.current = { at: 0, kind: "" };
    setExpanded(true);
  };
  const changeMode = (next: MarkdownMode) => {
    if (controlledMode === undefined) setLocalMode(next);
    onModeChange?.(next);
  };
  const editor = (
    <Editor
      editorRef={editorRef}
      value={normalized}
      mode={mode}
      onMode={changeMode}
      onMove={() => { last.current = { at: 0, kind: "" }; }}
      commit={commit}
      onUndo={undo}
      canUndo={past.current.length > 0}
      canRedo={future.current.length > 0}
      focusLive={focusLive || wasInSourceMode.current}
      selection={selection}
      expanded={expanded}
      onExpand={allowExpand ? (expanded ? closeExpanded : openExpanded) : undefined}
    />
  );
  return (
    <>
      <div ref={stage} className="markdown-editor-stage" style={expanded ? { blockSize: normalHeight.current } : undefined}>
        {!expanded && editor}
      </div>
      {expanded && <EditorDialog mode={mode} onMode={changeMode} onClose={closeExpanded}>{editor}</EditorDialog>}
    </>
  );
}
function Editor({
  editorRef,
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
  editorRef?: Ref<MarkdownEditorHandle>;
  value: string;
  mode: MarkdownMode;
  onMode: (mode: MarkdownMode) => void;
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
  const { t, shortcuts: { labels: keys } } = environment;
  const ref = useRef<HTMLTextAreaElement>(null);
  const inline = useRef<InlineMarkdownHandle>(null);
  const sourceAnchors = useRef<{ value: string; layout: string; offsets: readonly number[]; tops: number[] } | null>(null);
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
    [error, setError] = useState<MarkdownMessage | "">("");
  const [loading, setLoading] = useState(false);
  const [focusOnLoad, setFocusOnLoad] = useState(false);
  const keySequence = useMarkdownKeySequence(environment.shortcuts.hasSequence(mode));
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const focusAt = (range: TextSelection, align?: "start") => {
    selection.current = range;
    if (inline.current) {
      inline.current.focus(range, align);
      return;
    }
    const editor = ref.current;
    if (!editor) return;
    const local = clampSelection(editor.value, range);
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(local.start, local.end);
    revealSourceCaret(editor, align);
  };
  const sourceSelection = (field: HTMLTextAreaElement) => ({ start: field.selectionStart, end: field.selectionEnd });
  const range = () => inline.current?.selection() ?? (ref.current ? sourceSelection(ref.current) : selection.current);
  const toggleFullscreen = () => {
    selection.current = range();
    onExpand?.();
  };
  useImperativeHandle(editorRef, () => ({
    focusAt(offset) {
      const position = Number.isFinite(offset) ? Math.trunc(offset) : 0;
      setTools(null);
      setPanel(null);
      onMove();
      focusAt(clampSelection(value, { start: position, end: position }), "start");
      if (!inline.current && !ref.current) setFocusOnLoad(true);
    },
    getSelection: range,
    anchorAtViewport(y, offsets) {
      if (!offsets.length) return null;
      const visible = inline.current?.offsetAtViewport(y);
      if (visible != null) return offsets.findLast(offset => offset <= visible) ?? offsets[0];
      const field = ref.current;
      if (!field) return null;
      const bounds = field.getBoundingClientRect();
      const style = field.ownerDocument.defaultView!.getComputedStyle(field);
      const layout = [bounds.width, ...textareaLayout.map(property => style[property])].join("|");
      let cached = sourceAnchors.current;
      if (!cached || cached.value !== field.value || cached.layout !== layout || cached.offsets !== offsets) {
        cached = { value: field.value, layout, offsets, tops: textareaAnchorPositions(field, bounds, style, offsets) };
        sourceAnchors.current = cached;
      }
      const index = cached.tops.findLastIndex(top => top <= y - bounds.top + field.scrollTop);
      return offsets[Math.max(0, index)];
    },
    openFullscreen() {
      if (!expanded) toggleFullscreen();
    },
  }));
  const pointAt = (position: number) => inline.current?.point(position) ?? (ref.current ? textareaPoint(ref.current, position) : undefined);
  const openTools = (bookmark: TextSelection, point: MenuPoint) => {
    if (isInMarkdownLiteralBlock(latest.current, bookmark.start)
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
    if (mode !== "source") return;
    focusAt(selection.current);
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
    if (isInlineMarkdownFormat(kind)) return edit(formatMarkdownInline(text, s, kind, t));
    if (kind === "code") return edit(insertCodeBlock(text, s, language, t("代码")));
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
          t("```mermaid\nflowchart LR\n  A[开始] --> B[完成]\n```"),
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
  const editYamlFrontmatter = () => {
    const text = latest.current;
    const yaml = readYamlFrontmatter(text);
    if (yaml) {
      const start = Math.min(yaml.bodyFrom, yaml.bodyTo);
      focusAt({ start, end: start }, "start");
      return;
    }
    const start = "---\nname: ";
    edit(insertBlock(text, { start: 0, end: 0 }, start + "\ndescription: \n---", start.length, start.length));
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
          label || (panel === "image" ? t("图片") : t("链接")),
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
                reject(new MarkdownMessageError("每张图片不能超过 2 MB"));
                return;
              }
              const reader = new FileReader();
              reader.onload = () =>
                resolve(markdownLink(image.name, String(reader.result), true));
              reader.onerror = () => reject(new MarkdownMessageError("图片读取失败"));
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
        setError(e instanceof MarkdownMessageError ? e.key : "图片读取失败");
    } finally {
      if (active.current) setLoading(false);
      if (file.current) file.current.value = "";
    }
  };
  const handleKey = (event: MarkdownKeystroke, composing: boolean) => {
    if (composing) {
      keySequence.reset();
      return false;
    }
    if (event.defaultPrevented) return false;
    const prefixed = keySequence.read(event);
    if (prefixed === null) return true;
    const mod = event.ctrlKey || event.metaKey;
    const shortcut = environment.shortcuts.match(mode, event, prefixed);
    const heading = headingForShortcut(shortcut);
    if (heading !== undefined) {
      if (event.repeat) {
        event.preventDefault();
        return true;
      } else if (mode === "live") {
        if (!inline.current?.setHeading(heading)) return false;
      } else {
        if (typeof heading !== "number" || heading === 0 || isInMarkdownLiteralBlock(latest.current, range().start)) return false;
        format(heading);
      }
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    if (shortcut) {
      if (shortcut === "expand" && !onExpand) return false;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return true;
      const current = range();
      if (shortcut === "source") {
        selection.current = current;
        onMode(mode === "live" ? "source" : "live");
      } else if (shortcut === "expand") {
        toggleFullscreen();
      } else if (shortcut === "help") {
        showPanel("help");
      } else if (shortcut === "undo" || shortcut === "redo") {
        undoEdit(shortcut === "redo");
      } else if (shortcut === "indent" || shortcut === "outdent") {
        const next = changeIndentation(latest.current, current, shortcut === "outdent", true);
        if (next) edit(next);
      } else if (!isInMarkdownLiteralBlock(latest.current, current.start)) {
        switch (shortcut) {
          case "table": case "link": case "image":
            showPanel(shortcut);
            break;
          case "bold": case "italic": case "strike": case "inline": case "bullet": case "ordered":
          case "task": case "quote": case "code": case "math":
            format(shortcut);
            break;
        }
      }
      return true;
    }
    if (isNativeHistoryShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
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
      const value = latest.current;
      const current = range();
      const fence = editableCodeFence(value, current);
      const indent = fence && codeIndentBackspace(value, current, fence);
      if (indent) {
        event.preventDefault();
        edit(replaceSelection(value, indent, ""));
        return true;
      }
      const gap = emptyMarkdownMarkerRange(value, current);
      if (gap) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) edit(replaceSelection(latest.current, gap, "", 0, 0));
        suppressBackspaceRepeat(environment.surface, environment.overlay);
        return true;
      }
    }
    if (event.key === "Enter" && !mod && !event.altKey) {
      const value = latest.current;
      const current = range();
      const fence = ref.current && editableCodeFence(value, current);
      const lineBreak = fence && codeLineBreak(value, current, fence, event.shiftKey);
      const next = lineBreak ? replaceSelection(value, current, lineBreak.insert, lineBreak.caret, lineBreak.caret)
        : event.shiftKey || isInMarkdownLiteralBlock(value, current.start) ? null
          : continueMarkdownHeading(value, current) ?? continueMarkdownLine(value, current);
      if (next) {
        event.preventDefault();
        edit(next);
        return true;
      }
    }
    if (event.key === "Tab" && !mod && !event.altKey) {
      const next = changeIndentation(latest.current, range(), event.shiftKey);
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
    { id: "search", search: t("搜索描述工具") },
    ...(["一级标题", "二级标题", "三级标题", "四级标题", "五级标题", "六级标题"] as const).map((name, index) => {
      const depth = index + 1;
      return option(`h${depth}`, t(name), <Heading size={15} />, () => format(depth), `h${depth} 标题 heading`, mode === "live" ? keys[headingShortcuts[depth]] : undefined);
    }),
    ...(mode === "live" ? [option("paragraph", t("普通段落"), <Pilcrow size={15} />, () => format(0), "取消标题 paragraph", keys.paragraph)] : []),
    option("bold", t("描述加粗"), <Bold size={15} />, () => format("bold"), "bold 粗体", keys.bold),
    option("italic", t("描述斜体"), <Italic size={15} />, () => format("italic"), "italic", keys.italic),
    option("strike", t("描述删除线"), <Strikethrough size={15} />, () => format("strike"), "strike", keys.strike),
    option("inline", t("描述行内代码"), <Code size={15} />, () => format("inline"), "inline code", keys.inline),
    option("bullet", t("描述无序列表"), <List size={15} />, () => format("bullet"), "bullet list", keys.bullet),
    option("ordered", t("描述有序列表"), <ListOrdered size={15} />, () => format("ordered"), "ordered list", keys.ordered),
    option("task", t("描述待办列表"), <ListChecks size={15} />, () => format("task"), "checklist todo 复选框", keys.task),
    option("quote", t("描述引用"), <Quote size={15} />, () => format("quote"), "quote", keys.quote),
    option("link", t("插入描述链接"), <Link size={15} />, () => showPanel("link"), "link", keys.link),
    option("image", t("插入描述图片"), <ImagePlus size={15} />, () => showPanel("image"), "image", keys.image),
    option("table", t("描述表格"), <Table2 size={15} />, () => showPanel("table"), "table", keys.table),
    option("yaml", t("YAML 文件头"), <FileCode size={15} />, editYamlFrontmatter, "frontmatter SKILL.md 元数据"),
    option("rule", t("描述分隔线"), <Minus size={15} />, () => format("rule"), "divider"),
    {
      id: "code", label: t("描述代码块"), icon: <CodeXml size={15} />, keywords: "code block", shortcut: keys.code,
      children: languages.map(({ id, label, aliases }) =>
        option(id, id === "plaintext" ? t("纯文本") : label, <CodeXml size={14} />, () => format("code", id), [id, ...aliases].join(" "))),
    },
    option("math", t("描述数学公式"), <Sigma size={15} />, () => format("math"), "math formula latex", keys.math),
    option("mermaid", t("描述 Mermaid 图表"), <FileCode size={15} />, () => format("mermaid"), "diagram"),
    option("undo", t("撤销描述编辑"), <Undo2 size={15} />, () => undoEdit(), "undo", keys.undo, !canUndo),
    option("redo", t("重做描述编辑"), <Redo2 size={15} />, () => undoEdit(true), "redo", keys.redo, !canRedo),
    mode === "live"
      ? option("source", t("编辑描述源码"), <Code size={15} />, () => onMode("source"), "source markdown", keys.source)
      : option("live", t("实时编辑描述"), <Code size={15} />, () => onMode("live"), "live 正文", keys.source),
    ...(onExpand && !expanded ? [option("expand", t("全屏编辑描述"), <Maximize2 size={15} />, toggleFullscreen, "fullscreen", keys.expand)] : []),
    option("help", t("Markdown 语法帮助"), <HelpCircle size={15} />, () => showPanel("help"), "help", keys.help),
  ] : [];
  const textarea = (
    <textarea
      ref={ref}
      className="detail-notes notes-editor-textarea"
      aria-label={environment.ariaLabel}
      aria-description={t("输入 / 打开描述工具")}
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

  const panelLabel = panel === "image" ? t("插入描述图片") : panel === "link" ? t("插入描述链接") : panel === "table" ? t("插入表格") : t("Markdown 语法帮助");
  return (
    <div className="markdown-notes" aria-busy={loading || undefined}>
      <input
        ref={file}
        type="file"
        hidden
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
        aria-label={t("插入本地 Markdown 图片")}
        onChange={e => { void loadImages(Array.from(e.target.files ?? [])); }}
      />
      {error && !panel && <p className="notes-edit-error" role="alert">{t(error)}</p>}
      <div className="notes-editor-body" onPointerDownCapture={keySequence.reset} onBlurCapture={keySequence.reset}>
        {mode === "live" ? (
          <div className="notes-live-document">
            <Suspense fallback={<div className="markdown-loading">{t("正在载入描述…")}</div>}>
              <InlineMarkdownEditor
                ref={inline}
                value={value}
                cursor={selection}
                focusOnMount={focusOnLoad ? "start" : focusLive || expanded}
                onEdit={(next, before, after, kind) => {
                  selection.current = before;
                  commit(next, kind);
                  selection.current = after;
                }}
                onMove={onMove}
                hasKeySequence={keySequence.isWaiting}
                onKey={handleKey}
                onHistory={undoEdit}
                onSlash={openTools}
                onImages={files => { void loadImages(files); }}
              />
            </Suspense>
          </div>
        ) : textarea}
      </div>
      {keySequence.waiting && <div className="notes-key-sequence" role="status">{t("已输入 {prefix}，等待下一个键", { prefix: editorShortcutPrefix })}</div>}
      {tools && (
        <ActionMenu
          label={t("描述工具")}
          className="notes-command-menu"
          items={commands}
          point={tools}
          onClose={closeTools}
          resolvePoint={() => pointAt(selection.current.end)}
          search={{
            emptyText: t("没有匹配的工具"),
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
          initialFocus={panel === "table" ? ".notes-table-size-fields input" : undefined}
          label={panelLabel}
          closeLabel={panel === "help" ? t("关闭语法帮助") : t("关闭插入面板")}
          className="notes-command-panel"
          point={panelPoint}
          onClose={closePanel}
          items={[{
            id: "description-panel",
            content: panel === "table" ? <MarkdownTableSize initial={{ rows: 3, columns: 2 }} label={t("插入表格")} cycleFields onApply={insertTable} /> : panel === "help" ? (
              <div className="notes-help-panel">
                <pre>{t("# 一级标题 · ## 二级标题\n**加粗**  *斜体*  ~~删除线~~\n`行内代码`\n- 无序列表\n1. 有序列表\n- [ ] 未完成  - [x] 已完成\n> 引用\n[文字](https://example.com)\n![图片说明](图片地址)\n| 标题 | 标题 |\n| --- | --- |\n| 内容 | 内容 |\n$行内公式$ · $$块级公式$$\n脚注[^1]\n[^1]: 脚注内容")}</pre>
                <p>{t("输入 / 搜索工具和对应快捷键。带 → 的组合先按左边，再按右边。")}
                  {keys.table && t("{shortcut} 插入表格。", { shortcut: keys.table })}
                  {t("连续输入 // 插入 /。列表内回车续写，空列表项回车退出。支持粘贴或拖入本地图片。")}</p>
              </div>
            ) : (
              <form className="notes-insert-form" onSubmit={e => { e.preventDefault(); insertLink(); }}>
                <label>
                  {panel === "link" ? t("显示文字") : t("图片说明")}
                  <input aria-label={t("Markdown 链接文字")} value={label} onChange={e => setLabel(e.target.value)} />
                </label>
                <label>
                  {panel === "link" ? t("链接地址") : t("图片地址")}
                  <input
                    aria-label={t("Markdown 地址")}
                    placeholder={panel === "image" ? "https://…/image.png" : t("https://… 或 #章节")}
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                  />
                </label>
                {error && <p className="notes-edit-error" role="alert">{t(error)}</p>}
                {panel === "image" && (
                  <button type="button" className="outline-button small" onClick={() => file.current?.click()} disabled={loading}>
                    {t("从设备选择图片")}
                  </button>
                )}
                <button className="primary-button small" type="submit">{t("插入")}</button>
              </form>
            ),
          }]}
        />
      )}
    </div>
  );
}
