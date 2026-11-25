import { Annotation, Compartment, EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, placeholder } from "@codemirror/view";
import { useImperativeHandle, useLayoutEffect, useRef, useState, type Ref, type RefObject } from "react";
import { suppressBackspaceRepeat } from "../core/keyboard";
import { clampSelection, insertBlock, type TextSelection } from "../core/markdown";
import { emptyMarkdownMarkerRange } from "../core/markdownList";
import { isPairedSymbol, pairedSymbolChange } from "../core/markdownPairs";
import { completeTableHeader } from "../core/markdownTable";
import { openMarkdownLink, useMarkdownEnvironment, type EditorEnvironment } from "./editorContext";
import { createEnvironmentStore, widgetEnvironment } from "./widgetEnvironment";
import { codeFenceAt, enterPreviousMarkdownBlock, findHeading, handleMarkdownBlockArrow, markdownBlockAt, markdownProjection, paragraphJoinAt, projection, projectionComposition, refreshProjection } from "./markdownProjection";
import { handleCodeBlockBackspace, handleCodeFenceKey, insertIntoEmptyFence, markdownCodeCompletion } from "./markdownCodeCompletion";
import { handleHeadingKey, setHeadingLevel } from "./markdownHeadingEditing";
import { isTableHistoryKey, requestTableFocus } from "./markdownLiveTable";
import { completedSymbolPair } from "./markdownPairComposition";
import type { MenuPoint } from "./ActionMenu";

export type MarkdownKeystroke = Pick<KeyboardEvent,
  "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "repeat" | "defaultPrevented" | "preventDefault" | "stopPropagation"
>;
export interface InlineMarkdownHandle {
  selection(): TextSelection;
  focus(range: TextSelection): void;
  point(position: number): MenuPoint | undefined;
  setHeading(depth: number): boolean;
  insertTable(source: string, range: TextSelection): void;
}

type Props = {
  ref: Ref<InlineMarkdownHandle>;
  value: string;
  cursor: RefObject<TextSelection>;
  focusOnMount: boolean;
  onEdit(value: string, before: TextSelection, after: TextSelection, kind?: string): void;
  onMove(): void;
  onKey(event: MarkdownKeystroke, composing: boolean): boolean;
  onSlash(range: TextSelection, point: MenuPoint): boolean;
  onImages(files: File[]): void;
};

const syncedValue = Annotation.define<boolean>();
const sourceSelection = (state: EditorState): TextSelection => ({
  start: state.selection.main.from,
  end: state.selection.main.to,
});

function select(value: string, range: TextSelection) {
  const { start, end } = clampSelection(value, range);
  return { anchor: start, head: end };
}

function caretPoint(view: EditorView, position: number): MenuPoint {
  const rect = view.coordsAtPos(position) ?? view.contentDOM.getBoundingClientRect();
  return { x: rect.left, y: rect.bottom + 5, aboveY: rect.top };
}

function linkAt(event: MouseEvent) {
  return event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a.cm-md-link") : null;
}

function followLink(view: EditorView, link: HTMLAnchorElement) {
  const href = link.getAttribute("href");
  if (!href) return;
  if (href.startsWith("#") && !href.startsWith("#task=")) {
    let anchor = href.slice(1);
    try { anchor = decodeURIComponent(anchor); } catch {}
    const position = findHeading(view.state, anchor);
    if (position !== undefined) {
      view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
      view.focus();
    }
  } else void openMarkdownLink(href, view.state.facet(widgetEnvironment).getSnapshot());
}

function insertAtBlockEdge(view: EditorView, from: number, to: number, text: string, caret = text.length) {
  const { state } = view;
  if (from !== to) return false;
  const block = markdownBlockAt(state, from);
  const before = block?.position?.start.offset === from;
  if (!before && to !== state.doc.length) return false;
  if (block?.type !== "table" && block?.type !== "thematicBreak" && codeFenceAt(state, from)?.closerFrom == null) return false;
  const insert = before ? text + "\n\n" : "\n\n" + text;
  view.dispatch({
    changes: { from, insert }, selection: { anchor: from + (before ? caret : caret + 2) },
    scrollIntoView: true, userEvent: "input.structure",
  });
  return true;
}

function applyPairedSymbol(view: EditorView, from: number, to: number, key: string) {
  const change = pairedSymbolChange(view.state.doc.toString(), { start: from, end: to }, key);
  if (!change) return false;
  const { insert, start, end } = change;
  if (from === to && insert && (insertIntoEmptyFence(view, from, to, insert, start - from)
    || insertAtBlockEdge(view, from, to, insert, start - from))) return true;
  const backwards = view.state.selection.main.anchor > view.state.selection.main.head;
  view.dispatch({
    changes: change.from === change.to && !insert ? undefined : { from: change.from, to: change.to, insert },
    selection: { anchor: backwards ? end : start, head: backwards ? start : end },
    scrollIntoView: true, userEvent: "input.pair",
  });
  return true;
}

function finishComposedPair(view: EditorView, before: EditorState, symbol: string) {
  const { from, to } = before.selection.main;
  const current = view.state;
  const cursor = current.selection.main;
  if (!isPairedSymbol(symbol) || !cursor.empty || cursor.head !== from + 1) return;
  const pair = completedSymbolPair(before.doc.toString(), current.doc.toString(), cursor.head, symbol);
  if (!pair || pair.range.start !== from || pair.range.end !== to) return;
  const { value, start, end } = pair.edit;
  const insert = value.slice(from, value.length - (current.doc.length - cursor.head));
  view.dispatch({
    changes: { from, to: cursor.head, insert }, selection: { anchor: start, head: end },
    scrollIntoView: true, userEvent: "input.type",
  });
}

function insertLineBreak(view: EditorView, soft: boolean) {
  const { state } = view;
  const { from, to } = state.selection.main;
  if (insertIntoEmptyFence(view, from, to, "\n") || insertAtBlockEdge(view, from, to, "")) return;
  const current = state.doc.lineAt(from);
  const block = markdownBlockAt(state, from);
  if (!soft && from === to && from === current.to && block?.type === "paragraph") {
    const continuation = completeTableHeader(current.text);
    if (continuation) {
      const indent = /^ */.exec(current.text)![0].length;
      const lead = (block.position?.start.offset ?? from) < current.from ? "\n" : "";
      const nextLine = current.number < state.doc.lines ? state.doc.line(current.number + 1).text : "";
      const tail = nextLine.trim() ? "\n" : "";
      const start = current.from + indent + lead.length;
      requestTableFocus(view, start, { row: 1, column: 0 });
      view.dispatch({
        changes: [{ from: current.from, insert: lead }, { from: current.to, insert: continuation + tail }],
        selection: { anchor: start }, scrollIntoView: true, userEvent: "input.structure",
      });
      return;
    }
  }
  const insideCode = block?.type === "code";
  const indent = insideCode ? /^[\t ]*/.exec(state.sliceDoc(current.from, from))?.[0] ?? "" : "";
  const single = soft || !current.text.trim() || insideCode || block?.type === "math" || block?.type === "html";
  const text = single ? "\n" + indent : "\n\n";
  view.dispatch(state.replaceSelection(text), { scrollIntoView: true, userEvent: "input.structure" });
}

function removeEmptyMarkdownMarker(view: EditorView, repeat = false) {
  const { state } = view;
  const range = emptyMarkdownMarkerRange(state.doc.toString(), sourceSelection(state), state.field(projection).tree);
  if (!range) return false;
  if (!repeat) view.dispatch({
    changes: { from: range.start, to: range.end },
    selection: { anchor: range.start },
    scrollIntoView: true,
    userEvent: "input.structure",
  });
  return true;
}

function editorPresentation(environment: EditorEnvironment, host: HTMLElement) {
  return [
    markdownCodeCompletion(environment.overlay ?? host),
    EditorView.contentAttributes.of({ "aria-label": environment.ariaLabel, "aria-description": "输入 / 打开描述工具", spellcheck: "false" }),
    placeholder(environment.placeholder),
  ];
}

export default function InlineMarkdownEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView>(null);
  const environment = useMarkdownEnvironment();
  const [store] = useState(() => createEnvironmentStore(environment));
  const [presentation] = useState(() => new Compartment());
  const latest = useRef(props);
  latest.current = props;

  useImperativeHandle(props.ref, () => ({
    selection: () => editor.current ? sourceSelection(editor.current.state) : latest.current.cursor.current,
    point: position => editor.current ? caretPoint(editor.current, position) : undefined,
    setHeading: depth => editor.current ? setHeadingLevel(editor.current, depth) : false,
    insertTable(source, range) {
      const view = editor.current;
      if (!view) return;
      const value = view.state.doc.toString();
      const { start, end } = clampSelection(value, range);
      const next = insertBlock(value, { start, end }, source, 0, 0);
      requestTableFocus(view, next.start, { row: 0, column: 0 });
      view.dispatch({
        changes: { from: start, to: end, insert: next.value.slice(start, next.value.length - (value.length - end)) },
        selection: { anchor: next.start }, scrollIntoView: true, userEvent: "input.structure",
      });
    },
    focus(range) {
      const view = editor.current;
      if (!view) return;
      view.focus();
      view.dispatch({ selection: select(view.state.doc.toString(), range), scrollIntoView: true });
    },
  }), []);

  useLayoutEffect(() => {
    if (!host.current) return;
    const { value, cursor } = latest.current;
    let compositionStart: EditorState | undefined;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        selection: select(value, cursor.current),
        extensions: [
          markdownProjection,
          widgetEnvironment.of(store),
          presentation.of(editorPresentation(store.getSnapshot(), host.current)),
          EditorView.lineWrapping,
          EditorView.inputHandler.of((view, from, to, text, insert) => {
            if (view.compositionStarted) return false;
            if (isPairedSymbol(text) && insert().isUserEvent("input.type") && applyPairedSymbol(view, from, to, text)) return true;
            return insertIntoEmptyFence(view, from, to, text)
              || (text === "/" && insert().isUserEvent("input.type")
                && latest.current.onSlash({ start: from, end: to }, caretPoint(view, to)))
              || (text !== "" && insertAtBlockEdge(view, from, to, text));
          }),
          EditorView.updateListener.of(update => {
            const next = sourceSelection(update.state);
            if (update.docChanged && !update.transactions.some(transaction => transaction.annotation(syncedValue))) {
              const format = update.transactions.some(transaction => ["input.toggle", "input.code-language", "input.code-fence", "input.structure", "input.pair"].some(event => transaction.isUserEvent(event)));
              latest.current.onEdit(update.state.doc.toString(), sourceSelection(update.startState), next, format ? "format" : undefined);
            } else if (update.selectionSet && !update.docChanged) {
              const before = sourceSelection(update.startState);
              if (before.start !== next.start || before.end !== next.end) latest.current.onMove();
            }
            latest.current.cursor.current = next;
          }),
          EditorView.domEventHandlers({
            keydown(event, view) {
              const composing = event.isComposing || view.compositionStarted;
              if (!view.hasFocus) return isTableHistoryKey(event) && latest.current.onKey(event, composing);
              if (!composing && (handleCodeFenceKey(event, view) || handleMarkdownBlockArrow(event, view) || handleHeadingKey(event, view))) return true;
              if (latest.current.onKey(event, composing)) return true;
              if (composing) return false;
              const mod = event.ctrlKey || event.metaKey;
              if (event.key === "/" && !mod && !event.altKey
                && latest.current.onSlash(sourceSelection(view.state), caretPoint(view, view.state.selection.main.head))) return true;
              if (mod && (event.key === "Home" || event.key === "End")) {
                const position = event.key === "Home" ? 0 : view.state.doc.length;
                const selection = event.shiftKey
                  ? EditorSelection.range(view.state.selection.main.anchor, position)
                  : EditorSelection.cursor(position);
                view.dispatch({ selection, scrollIntoView: true });
                return true;
              }
              if (event.key === "Enter" && !mod && !event.altKey) {
                insertLineBreak(view, event.shiftKey);
                return true;
              }
              if (!mod && !event.shiftKey && !event.altKey && (event.key === "Backspace" || event.key === "Delete")) {
                const cursor = view.state.selection.main;
                if (event.key === "Backspace" && cursor.empty) {
                  if (removeEmptyMarkdownMarker(view, event.repeat) || enterPreviousMarkdownBlock(view) || handleCodeBlockBackspace(view, event.repeat)) {
                    const { surface, overlay } = store.getSnapshot();
                    suppressBackspaceRepeat(surface, overlay);
                    return true;
                  }
                  if (isPairedSymbol(view.state.sliceDoc(Math.max(0, cursor.head - 1), cursor.head))
                    && applyPairedSymbol(view, cursor.from, cursor.to, "Backspace")) return true;
                }
                const gap = cursor.empty ? paragraphJoinAt(view.state, cursor.head, event.key === "Backspace") : null;
                if (gap) {
                  view.dispatch({ changes: gap, selection: { anchor: gap.from }, scrollIntoView: true, userEvent: "input.structure" });
                  return true;
                }
              }
              return false;
            },
            beforeinput(event, view) {
              return event.inputType === "deleteContentBackward" && event.cancelable && !event.isComposing
                && !view.compositionStarted && (removeEmptyMarkdownMarker(view) || enterPreviousMarkdownBlock(view) || handleCodeBlockBackspace(view));
            },
            compositionstart(_event, view) {
              compositionStart = view.state;
              view.dispatch({ effects: projectionComposition.of(true) });
              return false;
            },
            compositionend(event, view) {
              const before = compositionStart;
              compositionStart = undefined;
              queueMicrotask(() => {
                if (editor.current !== view || view.compositionStarted) return;
                view.dispatch({ effects: projectionComposition.of(false) });
                if (before) finishComposedPair(view, before, event.data);
              });
              return false;
            },
            paste(event, view) {
              const images = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith("image/"));
              if (!images.length) {
                const { from, to } = view.state.selection.main;
                const text = event.clipboardData?.getData("text/plain").replace(/\r\n?/g, "\n") ?? "";
                return !!text && (insertIntoEmptyFence(view, from, to, text) || insertAtBlockEdge(view, from, to, text));
              }
              latest.current.onImages(images);
              return true;
            },
            dragover(event) {
              return event.dataTransfer?.types.includes("Files") ?? false;
            },
            drop(event, view) {
              const files = Array.from(event.dataTransfer?.files ?? []);
              if (!files.length) return false;
              const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
              if (position !== null) view.dispatch({ selection: { anchor: position } });
              latest.current.onImages(files);
              return true;
            },
            mousedown(event, view) {
              const link = linkAt(event);
              if (!link || event.button !== 0 || !(event.ctrlKey || event.metaKey)) return false;
              followLink(view, link);
              return true;
            },
            click(event, view) {
              const link = linkAt(event);
              if (!link) return false;
              event.preventDefault();
              if (event.detail === 0 && document.activeElement === link) followLink(view, link);
              return false;
            },
          }),
        ],
      }),
    });
    editor.current = view;
    if (latest.current.focusOnMount) {
      view.focus();
      const padding = parseFloat(getComputedStyle(view.dom.ownerDocument.documentElement).scrollPaddingTop) || 0;
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { yMargin: padding + 8 }) });
    }
    return () => {
      editor.current = null;
      view.destroy();
    };
  }, []);

  useLayoutEffect(() => {
    const previous = store.getSnapshot();
    store.update(environment);
    const view = editor.current;
    const element = host.current;
    if (!view || !element) return;
    const updatePresentation = previous.overlay !== environment.overlay || previous.ariaLabel !== environment.ariaLabel || previous.placeholder !== environment.placeholder;
    const updateLinks = previous.normalizeLink !== environment.normalizeLink;
    if (updatePresentation || updateLinks) view.dispatch({
      effects: [
        ...(updatePresentation ? [presentation.reconfigure(editorPresentation(environment, element))] : []),
        ...(updateLinks ? [refreshProjection.of(null)] : []),
      ],
    });
  }, [environment, presentation, store]);

  useLayoutEffect(() => {
    const view = editor.current;
    if (!view) return;
    const previous = view.state.doc.toString();
    const next = props.value;
    if (previous === next) return;
    let from = 0;
    while (from < previous.length && from < next.length && previous[from] === next[from]) from++;
    let to = previous.length;
    let end = next.length;
    while (to > from && end > from && previous[to - 1] === next[end - 1]) {
      to--;
      end--;
    }
    view.dispatch({
      changes: { from, to, insert: next.slice(from, end) },
      selection: select(next, props.cursor.current),
      annotations: syncedValue.of(true),
    });
  }, [props.value, props.cursor]);

  return <div className="notes-inline-editor" ref={host} />;
}
