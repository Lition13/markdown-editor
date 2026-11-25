import { countColumn, EditorSelection, findColumn, StateEffect, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { createRoot, type Root as ReactRoot } from "react-dom/client";
import GithubSlugger from "github-slugger";
import katex from "katex";
import type { Root, RootContent } from "mdast";
import MarkdownContent from "./MarkdownContent";
import { copyMarkdownText, resolveMarkdownLink } from "./editorContext";
import { WidgetEnvironment, widgetEnvironment } from "./widgetEnvironment";
import { markdownLink, taskMarker } from "../core/markdown";
import type { MarkdownTranslator } from "../core/locale";
import { markdownParser } from "../core/markdownAst";
import { markdownListPrefix } from "../core/markdownList";
import { highlightCode, readCodeFence, type CodeFence } from "../core/markdownCode";
import { codeBodyEnd, findCodeFence } from "../core/markdownFence";
import { headingRegion } from "../core/markdownHeading";
import { markdownMath } from "../core/markdownPolicy";
import { createCodeLanguagePicker } from "./markdownLanguagePicker";
import { markdownTableLayout } from "../core/markdownTable";
import { focusLiveTable, LiveTableWidget } from "./markdownLiveTable";

const roots = new WeakMap<HTMLElement, ReactRoot>();

function makeEditable(view: EditorView, element: HTMLElement, code?: { from: number; to: number }) {
  element.addEventListener("mousedown", event => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("a, button, input, summary"))) return;
    event.preventDefault();
    let offset = code?.from ?? 0;
    if (code && event.target instanceof Element) {
      const text = event.target.closest("pre")?.querySelector("code");
      const hit = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (text && hit && text.contains(hit.startContainer)) {
        const prefix = document.createRange();
        prefix.selectNodeContents(text);
        prefix.setEnd(hit.startContainer, hit.startOffset);
        offset = Math.min(code.to, code.from + prefix.toString().length);
      }
    }
    view.dispatch({ selection: { anchor: view.posAtDOM(element) + offset }, scrollIntoView: true });
    view.focus();
  });
}

class RenderedMarkdown extends WidgetType {
  constructor(
    readonly source: string,
    readonly block: boolean,
    readonly code?: { from: number; to: number; compact: boolean },
  ) { super(); }
  eq(other: RenderedMarkdown) { return this.source === other.source && this.block === other.block; }
  toDOM(view: EditorView) {
    const element: HTMLElement = document.createElement(this.block ? "div" : "span");
    element.className = this.block ? "cm-md-rendered-block" : "cm-md-rendered-inline";
    if (this.code?.compact) element.classList.add("cm-md-rendered-code");
    const root = createRoot(element);
    roots.set(element, root);
    root.render(<WidgetEnvironment store={view.state.facet(widgetEnvironment)}>
      <MarkdownContent value={this.source} />
    </WidgetEnvironment>);
    makeEditable(view, element, this.code);
    return element;
  }
  destroy(element: HTMLElement) {
    const root = roots.get(element);
    roots.delete(element);
    queueMicrotask(() => root?.unmount());
  }
}

type CodeLanguageDraft = { from: number; language: string };
const codeLanguageEdit = StateEffect.define<CodeLanguageDraft | null>();
const projectionFocus = StateEffect.define<boolean>();
const languagePickers = new WeakMap<HTMLElement, ReturnType<typeof createCodeLanguagePicker>>();

class CodeLanguageField extends WidgetType {
  constructor(readonly fence: CodeFence, readonly t: MarkdownTranslator) { super(); }
  eq(other: CodeLanguageField) {
    return this.fence.languageFrom === other.fence.languageFrom && this.fence.language === other.fence.language && this.t === other.t;
  }
  toDOM(view: EditorView) {
    const { t } = this;
    const { language, languageFrom, languageTo } = this.fence;
    const preview = (next: string) => {
      const draft = view.state.field(projection).codeLanguage;
      if (draft?.from !== languageFrom || draft.language !== next) {
        view.dispatch({ effects: codeLanguageEdit.of({ from: languageFrom, language: next }) });
      }
    };
    const picker = createCodeLanguagePicker(language, preview, (next, destination) => {
      if (!view.dom.isConnected) return;
      const refocus = destination === "code" || destination === "below";
      if (refocus) view.focus();
      const draft = destination === "toolbar" ? { from: languageFrom, language: next ?? language } : null;
      const languageEffect = codeLanguageEdit.of(draft);
      const effects = refocus ? [languageEffect, projectionFocus.of(true)] : [languageEffect];
      if (destination === "below") {
        const current = codeFenceAt(view.state, view.state.selection.main.head);
        view.dispatch({ effects });
        if (current) leaveMarkdownBlock(view, current.from, current.to, true);
        return;
      }
      if (next !== null && next !== language && view.state.sliceDoc(languageFrom, languageTo) === language) {
        view.dispatch({ changes: { from: languageFrom, to: languageTo, insert: next }, effects, userEvent: "input.code-language" });
      } else view.dispatch({ effects });
    }, () => view.state.facet(widgetEnvironment).getSnapshot().topInset, t);
    const action = (label: string, text: string) => {
      const button = picker.footer.ownerDocument.createElement("button");
      button.type = "button";
      button.className = "notes-code-action";
      button.setAttribute("aria-label", label);
      button.textContent = text;
      button.addEventListener("mousedown", event => { if (event.button === 0) event.preventDefault(); });
      button.addEventListener("focus", () => preview(language));
      return button;
    };
    const copy = action(t("复制代码"), t("复制"));
    let copyFeedback: ReturnType<typeof setTimeout> | undefined;
    copy.addEventListener("click", async () => {
      const node = markdownBlockAt(view.state, this.fence.from);
      if (node?.type !== "code") return;
      try {
        await copyMarkdownText(node.value, view.state.facet(widgetEnvironment).getSnapshot());
        if (!copy.isConnected) return;
        copy.textContent = t("已复制");
        clearTimeout(copyFeedback);
        copyFeedback = setTimeout(() => { copy.textContent = t("复制"); }, 1800);
      } catch {
        if (copy.isConnected) copy.textContent = t("复制失败");
      }
    });
    const leaveLabel = t("继续正文");
    const leave = action(leaveLabel, leaveLabel);
    leave.addEventListener("click", () => {
      const fence = codeFenceAt(view.state, this.fence.from);
      if (!fence) return;
      view.dispatch({ effects: codeLanguageEdit.of(null) });
      leaveMarkdownBlock(view, fence.from, fence.to, true);
    });
    picker.footer.prepend(copy, leave);
    const controls = [copy, leave, picker.input];
    picker.footer.addEventListener("keydown", event => {
      if (event.key !== "Tab" || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      const current = controls.findIndex(control => control === event.target);
      const next = controls[current + (event.shiftKey ? -1 : 1)];
      if (current < 0 || !next) return;
      event.preventDefault();
      event.stopPropagation();
      next.focus();
    });
    picker.footer.addEventListener("focusout", () => {
      queueMicrotask(() => {
        const footer = picker.footer;
        if (!footer.isConnected || footer.contains(footer.ownerDocument.activeElement)) return;
        if (view.state.field(projection).codeLanguage?.from === languageFrom) {
          view.dispatch({ effects: codeLanguageEdit.of(null) });
        }
      });
    });
    languagePickers.set(picker.footer, {
      ...picker,
      dispose() {
        clearTimeout(copyFeedback);
        picker.dispose();
      },
    });
    return picker.footer;
  }
  destroy(element: HTMLElement) {
    languagePickers.get(element)?.dispose();
    languagePickers.delete(element);
  }
}

class InlineFormula extends WidgetType {
  constructor(readonly formula: string) { super(); }
  eq(other: InlineFormula) { return this.formula === other.formula; }
  toDOM(view: EditorView) {
    const element = document.createElement("span");
    element.className = "cm-md-formula";
    katex.render(this.formula, element, markdownMath);
    makeEditable(view, element);
    return element;
  }
}

class VisibleMarker extends WidgetType {
  constructor(readonly text: string, readonly className: string) { super(); }
  eq(other: VisibleMarker) { return this.text === other.text && this.className === other.className; }
  toDOM(view: EditorView) {
    const element = document.createElement("span");
    element.className = this.className;
    element.textContent = this.text;
    makeEditable(view, element);
    return element;
  }
}

class TaskMarker extends WidgetType {
  constructor(readonly checked: boolean, readonly label: string) { super(); }
  eq(other: TaskMarker) { return this.checked === other.checked && this.label === other.label; }
  toDOM(view: EditorView) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.className = "cm-md-task-checkbox";
    input.setAttribute("aria-label", this.label);
    input.addEventListener("change", () => {
      const from = view.posAtDOM(input);
      const text = view.state.sliceDoc(from, from + 3);
      if (/^\[[ xX]\]$/.test(text)) {
        view.dispatch({ changes: { from: from + 1, to: from + 2, insert: input.checked ? "x" : " " }, userEvent: "input.toggle" });
      }
    });
    return input;
  }
}

const punctuation = Decoration.mark({ class: "cm-md-syntax" });
const hidden = Decoration.replace({});
const richBlocks = new Set(["code", "html", "math", "thematicBreak"]);
const hiddenFence = Decoration.replace({ block: true, inclusiveStart: true, inclusiveEnd: false });
const textStyles = { emphasis: "cm-md-emphasis", strong: "cm-md-strong", delete: "cm-md-delete" };

function isRenderedBlock(node: RootContent) {
  return richBlocks.has(node.type) || (node.type === "paragraph" && node.children.some(child => child.type === "html"));
}

function isStandaloneInlineBlock(node: RootContent) {
  if (node.type !== "paragraph" || node.children.length !== 1) return false;
  const { type } = node.children[0];
  return type === "image" || type === "imageReference" || type === "inlineMath";
}

function project(state: EditorState, tree: Root, focused: boolean, codeLanguage: CodeLanguageDraft | null) {
  const { t, normalizeLink } = state.facet(widgetEnvironment).getSnapshot();
  const source = state.doc.toString();
  const caret = focused ? state.selection.main : null;
  const definitions = new Map<string, string>();
  const footnotes = new Map<string, number>();
  for (const node of tree.children) {
    if (node.type === "definition" && !definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
    if (node.type === "footnoteDefinition" && !footnotes.has(node.identifier)) footnotes.set(node.identifier, footnotes.size + 1);
  }
  const decorations: Range<Decoration>[] = [];
  const quotes = new Set<number>();
  const active = (from: number, to: number) => caret && from <= caret.from && caret.to <= to;
  const replace = (from: number, to: number, widget: WidgetType, block = false) => {
    // Keep a cursor stop only when a block edge owns the caret. Otherwise an
    // exclusive block range creates empty visual lines on both sides.
    decorations.push(Decoration.replace({
      widget, block,
      inclusiveStart: block && caret?.head !== from,
      inclusiveEnd: block && caret?.head !== to,
    }).range(from, to));
  };
  const mark = (from: number, to: number, className: string) => {
    if (from < to) decorations.push(Decoration.mark({ class: className }).range(from, to));
  };
  const syntax = (from: number, to: number, show: boolean) => {
    if (from < to) decorations.push((show ? punctuation : hidden).range(from, to));
  };
  const line = (position: number, className: string) => {
    decorations.push(Decoration.line({ class: className }).range(state.doc.lineAt(position).from));
  };

  const visit = (node: RootContent, topLevel = false, listNumber?: number) => {
    const from = node.position?.start.offset;
    const to = node.position?.end.offset;
    if (from === undefined || to === undefined || from >= to) return;
    const raw = source.slice(from, to);
    const show = !!active(from, to);

    if (node.type === "yaml") {
      const first = state.doc.lineAt(from).number;
      const last = state.doc.lineAt(to).number;
      for (let number = first; number <= last; number++) {
        const edge = number === first ? " cm-md-code-first cm-md-yaml-opener cm-md-yaml-marker"
          : number === last ? " cm-md-code-last cm-md-yaml-marker" : "";
        line(state.doc.line(number).from, "cm-md-code-line" + edge);
      }
      const bodyFrom = state.doc.line(first + 1).from;
      const bodyTo = state.doc.line(last).from - 1;
      for (const token of highlightCode(source.slice(bodyFrom, bodyTo), "yaml")) {
        mark(bodyFrom + token.from, bodyFrom + token.to, token.className);
      }
      return;
    }

    if (topLevel && node.type === "table") {
      replace(from, to, new LiveTableWidget(markdownTableLayout(source, node, from, to), readLiveTable, leaveMarkdownBlock), true);
      return;
    }

    if (topLevel && node.type === "code") {
      const fence = readCodeFence(source, from, to);
      const end = fence?.closerFrom;
      if (fence && end != null) {
        const bodyEnd = codeBodyEnd(fence);
        if (!active(fence.bodyFrom, bodyEnd)) {
          replace(from, to, new RenderedMarkdown(raw, true, {
            from: fence.bodyFrom - from, to: bodyEnd - from,
            compact: node.lang?.toLowerCase() !== "mermaid",
          }), true);
          return;
        }
        decorations.push(hiddenFence.range(from, fence.bodyFrom));
        if (end === fence.bodyFrom) {
          // A legacy empty block has no body line. Keep an edit position before its closer.
          syntax(end, to, false);
          line(end, "cm-md-code-line cm-md-code-first cm-md-code-last");
          decorations.push(Decoration.widget({ widget: new CodeLanguageField(fence, t), block: true, side: 1 }).range(to));
        } else {
          const first = state.doc.lineAt(fence.bodyFrom).number;
          const last = state.doc.lineAt(bodyEnd).number;
          for (let number = first; number <= last; number++) {
            const edge = (number === first ? " cm-md-code-first" : "") + (number === last ? " cm-md-code-last" : "");
            line(state.doc.line(number).from, "cm-md-code-line" + edge);
          }
          const language = codeLanguage?.from === fence.languageFrom ? codeLanguage.language : fence.language;
          for (const token of highlightCode(source.slice(fence.bodyFrom, bodyEnd), language)) {
            mark(fence.bodyFrom + token.from, fence.bodyFrom + token.to, token.className);
          }
          line(end, "cm-md-code-separator");
          replace(end, to, new CodeLanguageField(fence, t), true);
        }
        return;
      }
    }

    // Full blocks occupy the same document range in either presentation.
    if (topLevel && isRenderedBlock(node)) {
      if (!show) replace(from, to, new RenderedMarkdown(raw, true), true);
      else if (node.type === "code" || node.type === "math" || node.type === "html") {
        const firstLine = state.doc.lineAt(from).number;
        const lastLine = state.doc.lineAt(to).number;
        for (let number = firstLine; number <= lastLine; number++) line(state.doc.line(number).from, "cm-md-source-block");
      }
      return;
    }
    if (node.type === "definition" || node.type === "footnoteDefinition") {
      if (!show) {
        const label = t(node.type === "definition" ? "链接定义 · {label}" : "注释 · {label}", { label: node.label || node.identifier });
        replace(from, to, new VisibleMarker(label, "cm-md-definition"), topLevel);
        return;
      }
    }
    if (node.type === "inlineMath" && !show && !raw.includes("\n")) {
      replace(from, to, new InlineFormula(node.value));
      return;
    }
    if ((node.type === "image" || node.type === "imageReference") && !show && !raw.includes("\n")) {
      const url = node.type === "imageReference" ? definitions.get(node.identifier) : undefined;
      const image = node.type === "image" ? raw : url && markdownLink(node.alt ?? t("图片"), url, true);
      if (image) {
        replace(from, to, new RenderedMarkdown(image, false));
        return;
      }
    }
    if (node.type === "footnoteReference" && !show) {
      const number = footnotes.get(node.identifier);
      if (number) replace(from, to, new VisibleMarker(String(number), "cm-md-footnote"));
      return;
    }
    if (node.type === "heading") {
      const heading = headingRegion(node, source, from, to);
      const typingPrefix = heading.atx === raw && /^#+$/.test(raw) && !!show;
      if (!typingPrefix) {
        decorations.push(Decoration.line({
          class: `cm-md-heading cm-md-heading-${node.depth}`,
          attributes: { role: "heading", "aria-level": String(node.depth) },
        }).range(state.doc.lineAt(from).from));
      }
      if (heading.atx !== undefined) {
        const marker = !!caret && from < caret.from && caret.from < heading.textFrom;
        syntax(from, heading.textFrom, typingPrefix || marker);
        if (!typingPrefix) syntax(heading.textTo, to, !!caret && heading.textTo < caret.from && caret.from <= to);
      } else {
        const underline = state.doc.lineAt(to);
        if (underline.from > heading.textTo && !active(underline.from, underline.to)) {
          syntax(underline.from, underline.to, false);
          line(underline.from, "cm-md-heading-underline");
        }
      }
    }
    if (node.type === "list") {
      node.children.forEach((item, index) => visit(item, false, node.ordered ? (node.start ?? 1) + index : undefined));
      return;
    }
    if (node.type === "listItem") {
      const marker = markdownListPrefix(raw);
      if (marker) {
        const end = from + marker.length;
        // GFM leaves checked unset until an item has text after the checkbox.
        const task = taskMarker(source, from, t("待办事项"));
        const markerEnd = task ? task.end + 1 : end;
        const showMarker = !!caret && from <= caret.from && caret.from < markerEnd;
        if (task && !showMarker) {
          syntax(from, end, false);
          replace(task.start - 1, task.end + 1, new TaskMarker(task.checked, t("Markdown 待办：{label}", { label: task.label })));
        } else if (showMarker) {
          syntax(from, task ? task.end + 1 : end, true);
        } else {
          replace(from, end, new VisibleMarker(listNumber === undefined ? "•" : `${listNumber}.`, "cm-md-list-marker"));
        }
      }
    }
    if (node.type === "blockquote") {
      for (let number = state.doc.lineAt(from).number; number <= state.doc.lineAt(to).number; number++) {
        const current = state.doc.line(number);
        if (quotes.has(number)) continue;
        const prefix = /^[\t ]*(?:>[\t ]?)*/.exec(current.text)?.[0] ?? "";
        const markers = Array.from(prefix.matchAll(/>[\t ]?/g), match => ({ from: current.from + match.index, to: current.from + match.index + match[0].length }));
        quotes.add(number);
        line(current.from, "cm-md-quote-line");
        for (const marker of markers) {
          if (caret && marker.from <= caret.from && caret.from < marker.to) syntax(marker.from, marker.to, true);
          else replace(marker.from, marker.to, new VisibleMarker("", "cm-md-quote-mark"));
        }
      }
    }
    if (node.type === "emphasis" || node.type === "strong" || node.type === "delete" || node.type === "link" || node.type === "linkReference") {
      const start = node.children[0]?.position?.start.offset ?? from;
      const end = node.children.at(-1)?.position?.end.offset ?? to;
      // Inline replacement decorations must stay on a single line.
      syntax(from, start, show || source.slice(from, start).includes("\n"));
      syntax(end, to, show || source.slice(end, to).includes("\n"));
      if (node.type === "link" || node.type === "linkReference") {
        const url = node.type === "link" ? node.url : definitions.get(node.identifier);
        const href = url && resolveMarkdownLink(url, normalizeLink);
        if (start < end && href) {
          decorations.push(Decoration.mark({ tagName: "a", class: "cm-md-link", attributes: { href, title: t("按住 Ctrl 单击打开链接") } }).range(start, end));
        } else mark(start, end, "cm-md-link");
      } else mark(start, end, textStyles[node.type]);
    }
    if (node.type === "inlineCode") {
      const delimiter = /^`+/.exec(raw)?.[0].length ?? 0;
      let start = from + delimiter;
      let end = to - delimiter;
      if (source[start] === " " && source[end - 1] === " " && /\S/.test(source.slice(start, end))) {
        start++;
        end--;
      }
      syntax(from, start, show);
      syntax(end, to, show);
      mark(start, end, "cm-md-code");
    }
    if (node.type === "break") {
      syntax(from, state.doc.lineAt(from).to, show);
    }
    if (node.type === "text" && raw !== node.value) {
      for (const match of raw.matchAll(/\\([!-/:-@[-`{-~])/g)) {
        const start = from + match.index;
        syntax(start, start + 1, !!active(start, start + match[0].length));
      }
    }
    if ("children" in node) node.children.forEach(child => visit(child));
  };

  tree.children.forEach(node => visit(node, true));
  for (let number = 1; number <= state.doc.lines; number++) {
    const { from, to } = state.doc.line(number);
    if (from === to && !active(from, to)) line(from, "cm-md-gap");
  }
  return Decoration.set(decorations, true);
}

export const projectionComposition = StateEffect.define<boolean>();
export const refreshProjection = StateEffect.define<null>();

export const projection = StateField.define<{
  tree: Root;
  focused: boolean;
  codeLanguage: CodeLanguageDraft | null;
  composing: boolean;
  decorations: DecorationSet;
}>({
  create(state) {
    const tree = markdownParser.parse(state.doc.toString());
    return { tree, focused: false, codeLanguage: null, composing: false, decorations: project(state, tree, false, null) };
  },
  update(previous, transaction) {
    let { focused, composing, codeLanguage } = previous;
    for (const effect of transaction.effects) {
      if (effect.is(projectionFocus)) focused = effect.value;
      if (effect.is(projectionComposition)) composing = effect.value;
      if (effect.is(codeLanguageEdit)) codeLanguage = effect.value;
    }
    const refresh = transaction.effects.some(effect => effect.is(refreshProjection));
    if (!refresh && !transaction.docChanged && !transaction.selection && focused === previous.focused && composing === previous.composing && codeLanguage === previous.codeLanguage) return previous;
    if (composing) return { ...previous, focused, composing, codeLanguage, decorations: previous.decorations.map(transaction.changes) };
    const tree = transaction.docChanged || previous.composing ? markdownParser.parse(transaction.state.doc.toString()) : previous.tree;
    return { tree, focused, composing, codeLanguage, decorations: project(transaction.state, tree, focused || codeLanguage !== null, codeLanguage) };
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations),
});

export const markdownProjection = [
  projection,
  EditorView.focusChangeEffect.of((_state, focused) => projectionFocus.of(focused)),
];

export function markdownBlockAt(state: EditorState, position: number) {
  return state.field(projection).tree.children.find(node => {
    const from = node.position?.start.offset;
    const to = node.position?.end.offset;
    return from !== undefined && to !== undefined && from <= position && position <= to;
  });
}

export function headingAt(state: EditorState, position: number) {
  const node = markdownBlockAt(state, position);
  if (node?.type !== "heading" || node.position?.start.offset === undefined || node.position.end.offset === undefined) return null;
  return headingRegion(node, state.doc.toString(), node.position.start.offset, node.position.end.offset);
}

function readLiveTable(view: EditorView, from: number) {
  const node = markdownBlockAt(view.state, from);
  if (node?.type !== "table" || node.position?.start.offset !== from || node.position.end.offset === undefined) return undefined;
  return markdownTableLayout(view.state.doc.toString(), node, from, node.position.end.offset);
}

export function paragraphJoinAt(state: EditorState, position: number, backwards: boolean) {
  const from = backwards ? position - 2 : position;
  const to = from + 2;
  if (from < 0 || to > state.doc.length || state.sliceDoc(from, to) !== "\n\n") return null;
  if (markdownBlockAt(state, from)?.type !== "paragraph") return null;
  if (to !== state.doc.length && markdownBlockAt(state, to)?.type !== "paragraph") return null;
  return { from, to };
}

export function codeFenceAt(state: EditorState, position: number): CodeFence | null {
  return findCodeFence(state.field(projection).tree, position, () => state.doc.toString());
}

type MarkdownRegion = { node: RootContent; from: number; to: number };

function region(node: RootContent | undefined): MarkdownRegion | null {
  const from = node?.position?.start.offset;
  const to = node?.position?.end.offset;
  return node && from !== undefined && to !== undefined ? { node, from, to } : null;
}

function adjacentLine(state: EditorState, position: number, down: boolean, skipFromEmpty = false) {
  const current = state.doc.lineAt(position);
  const step = down ? 1 : -1;
  const index = current.number + step;
  if (index < 1 || index > state.doc.lines) return null;
  const line = state.doc.line(index);
  const beyond = index + step;
  // A single Markdown separator between blocks is spacing. Keep stops on
  // deliberate empty lines, including the empty lines at either document edge.
  if (!line.text.trim() && (skipFromEmpty || current.text.trim()) && beyond >= 1 && beyond <= state.doc.lines) {
    const following = state.doc.line(beyond);
    if (following.text.trim()) return following;
  }
  return line;
}

function regionOnLine(state: EditorState, line: { from: number; to: number }) {
  return region(state.field(projection).tree.children.find(node => {
    const block = region(node);
    return block && block.from <= line.to && block.to >= line.from;
  }));
}

function formulaBody(state: EditorState, { from, to }: MarkdownRegion) {
  const first = state.doc.lineAt(from);
  const last = state.doc.lineAt(to);
  if (last.number - first.number < 2) return { from, to };
  const body = /^\s*\${2,}\s*$/.test(last.text) ? state.doc.line(last.number - 1) : last;
  return { from: state.doc.line(first.number + 1).from, to: body.to };
}

function moveCaret(view: EditorView, position: number, down: boolean, goal?: number) {
  view.focus();
  // Cell editors and the language field hold their own DOM focus. Restore
  // projection focus immediately so an edge has a caret before the next key.
  view.dispatch({
    selection: EditorSelection.cursor(position, down ? 1 : -1, undefined, goal),
    effects: projectionFocus.of(true),
    scrollIntoView: true,
  });
}

function enterMarkdownBlock(view: EditorView, block: MarkdownRegion, down: boolean, column?: number, goal?: number) {
  const { node, from, to } = block;
  if (node.type === "table") {
    const row = down ? 0 : node.children.length - 1;
    const column = down ? 0 : node.children[0].children.length - 1;
    focusLiveTable(view, from, to, { row, column }, down);
    return true;
  }
  if (isStandaloneInlineBlock(node)) {
    moveCaret(view, down ? from : to, down);
    return true;
  }
  if (node.type !== "heading" && node.type !== "definition" && node.type !== "footnoteDefinition" && !isRenderedBlock(node)) return false;
  const { state } = view;
  let start = from, end = to;
  if (node.type === "code") {
    const fence = readCodeFence(state.doc.toString(), from, to);
    if (fence?.closerFrom != null) {
      start = fence.bodyFrom;
      end = codeBodyEnd(fence);
    }
  } else if (node.type === "math") {
    ({ from: start, to: end } = formulaBody(state, block));
  } else if (node.type === "heading") {
    ({ textFrom: start, textTo: end } = headingRegion(node, state.doc.toString(), from, to));
  }
  const line = state.doc.lineAt(down ? start : end);
  const head = column === undefined ? (down ? line.from : line.to) : line.from + findColumn(line.text, column, state.tabSize);
  moveCaret(view, Math.max(start, Math.min(head, end)), down, goal);
  return true;
}

function leaveMarkdownBlock(view: EditorView, from: number, to: number, down: boolean) {
  const line = adjacentLine(view.state, down ? to : from, down);
  const block = line && regionOnLine(view.state, line);
  if (block && enterMarkdownBlock(view, block, down)) return;
  // At a document edge leave the caret on the block boundary. Typing can
  // start a paragraph there without changing the source just by navigating.
  moveCaret(view, down ? line?.from ?? to : line?.to ?? from, down);
}

export function enterPreviousMarkdownBlock(view: EditorView) {
  const { state } = view;
  const cursor = state.selection.main;
  if (!cursor.empty) return false;
  const position = cursor.head;
  const current = region(markdownBlockAt(state, position));
  if (current?.node.type === "table" && position > current.from) return enterMarkdownBlock(view, current, false);
  if (current?.node.type === "code" && position === current.to && codeFenceAt(state, position)?.closerFrom != null) {
    return enterMarkdownBlock(view, current, false);
  }
  if (position !== state.doc.lineAt(position).from) return false;
  const previousLine = adjacentLine(state, position, false, true);
  const previous = previousLine && regionOnLine(state, previousLine);
  if (!previous || previous.node === current?.node || previous.to > position) return false;
  if (enterMarkdownBlock(view, previous, false)) return true;
  if (previous.node.type !== "list" && previous.node.type !== "blockquote") return false;
  moveCaret(view, previous.to, false);
  return true;
}

export function handleMarkdownBlockArrow(event: KeyboardEvent, view: EditorView) {
  const down = event.key === "ArrowDown";
  if ((!down && event.key !== "ArrowUp") || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
  const { state } = view;
  const cursor = state.selection.main;
  if (!cursor.empty) return false;
  const current = region(markdownBlockAt(state, cursor.head));
  if (current?.node.type === "table" && (down ? cursor.head < current.to : cursor.head > current.from)) {
    return enterMarkdownBlock(view, current, down);
  }
  if (current && isStandaloneInlineBlock(current.node)) {
    leaveMarkdownBlock(view, current.from, current.to, down);
    return true;
  }
  const line = state.doc.lineAt(cursor.head);
  const next = view.moveVertically(cursor, down);
  const column = countColumn(state.sliceDoc(line.from, cursor.head), state.tabSize);
  const fence = current?.node.type === "code" ? readCodeFence(state.doc.toString(), current.from, current.to) : null;
  const body = fence?.closerFrom != null ? { from: fence.bodyFrom, to: codeBodyEnd(fence) }
    : current?.node.type === "math" ? formulaBody(state, current) : null;
  if (current && body) {
    if (down ? cursor.head < body.from : cursor.head > body.to) return enterMarkdownBlock(view, current, down, column, next.goalColumn);
    if (body.from <= cursor.head && cursor.head <= body.to) {
      if (down ? next.head <= body.to : next.head >= body.from) return false;
      const footer = down && fence && view.contentDOM.querySelector<HTMLElement>(".cm-md-code-settings");
      const picker = footer ? languagePickers.get(footer) : undefined;
      if (picker) picker.focusForNavigation();
      else leaveMarkdownBlock(view, current.from, current.to, down);
      return true;
    }
  }
  if (current?.node.type === "heading" && down) {
    const heading = headingRegion(current.node, state.doc.toString(), current.from, current.to);
    if (!heading.atx && cursor.head <= heading.textTo && next.head > heading.textTo && next.head <= current.to) {
      leaveMarkdownBlock(view, current.from, current.to, down);
      return true;
    }
  }
  // Let CodeMirror move through the wrapped visual rows of a source line
  // before looking for a widget on the next logical line.
  if (next.head !== cursor.head && state.doc.lineAt(next.head).number === line.number) return false;
  const adjacent = adjacentLine(state, cursor.head, down);
  const target = adjacent && regionOnLine(state, adjacent);
  return !!target && target.node !== current?.node && enterMarkdownBlock(view, target, down, column, next.goalColumn);
}

function headingText(node: RootContent): string {
  if ("value" in node) return node.value;
  if ("alt" in node) return node.alt ?? "";
  return "children" in node ? node.children.map(headingText).join("") : "";
}

export function findHeading(state: EditorState, anchor: string) {
  const slugger = new GithubSlugger();
  for (const node of state.field(projection).tree.children) {
    if (node.type === "heading" && slugger.slug(headingText(node)) === anchor) return node.position?.start.offset;
  }
  return undefined;
}
