import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import { EditorView, showTooltip, tooltips } from "@codemirror/view";
import { codeLanguageId, completeCodeFence, suggestCodeLanguages } from "../core/markdownCode";
import { codeBodyEnd, emptyCodeFenceRemoval } from "../core/markdownFence";
import { codeFenceAt, projection } from "./markdownProjection";
import { codeLanguageOption } from "./markdownLanguagePicker";

const chooseLanguage = StateEffect.define<number | null>();
const initial = { index: 0, dismissed: false };
const languageChoice = StateField.define({
  create: () => initial,
  update(previous, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(chooseLanguage)) {
        return effect.value === null ? { index: 0, dismissed: true } : { index: effect.value, dismissed: false };
      }
    }
    return transaction.docChanged || transaction.selection ? initial : previous;
  },
});

function draftFence(state: EditorState) {
  const cursor = state.selection.main;
  if (!cursor.empty) return null;
  const fence = codeFenceAt(state, cursor.head);
  if (!fence || fence.closerFrom !== null || cursor.head !== fence.openerEnd
    || state.sliceDoc(fence.languageTo, fence.openerEnd).trim()) return null;
  return fence;
}

function choices(state: EditorState) {
  const { focused, composing } = state.field(projection);
  if (!focused || composing || state.field(languageChoice).dismissed) return [];
  const fence = draftFence(state);
  return fence?.language ? suggestCodeLanguages(fence.language) : [];
}

function finishFence(view: EditorView, language: string) {
  const fence = draftFence(view.state);
  if (!fence) return false;
  const value = view.state.doc.toString();
  const next = completeCodeFence(value, fence, language);
  const insertionEnd = next.value.length - (value.length - fence.openerEnd);
  view.dispatch({
    changes: { from: fence.languageFrom, to: fence.openerEnd, insert: next.value.slice(fence.languageFrom, insertionEnd) },
    selection: { anchor: next.start },
    scrollIntoView: true,
    userEvent: "input.code-fence",
  });
  return true;
}

function languageTooltip(view: EditorView) {
  const dom = view.dom.ownerDocument.createElement("div");
  dom.className = "notes-code-suggestions";
  dom.setAttribute("role", "listbox");
  dom.setAttribute("aria-label", "代码语言建议");
  const update = () => {
    const active = view.state.field(languageChoice).index;
    dom.replaceChildren(...choices(view.state).map((language, index) => {
      const item = codeLanguageOption(language);
      item.setAttribute("aria-selected", String(index === active));
      item.addEventListener("mousedown", event => event.preventDefault());
      item.addEventListener("click", () => { finishFence(view, language.id); });
      return item;
    }));
  };
  update();
  return { dom, update, offset: { x: 0, y: 4 } };
}

export const markdownCodeCompletion = (parent: HTMLElement) => [
  languageChoice,
  tooltips({ parent }),
  showTooltip.compute(["doc", "selection", projection, languageChoice], state =>
    choices(state).length ? { pos: state.selection.main.head, create: languageTooltip } : null),
];

export function handleCodeFenceKey(event: KeyboardEvent, view: EditorView) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
  const fence = draftFence(view.state);
  if (!fence) return false;
  const options = choices(view.state);
  const index = view.state.field(languageChoice).index;
  if (options.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    const step = event.key === "ArrowDown" ? 1 : -1;
    view.dispatch({ effects: chooseLanguage.of((index + step + options.length) % options.length) });
    return true;
  }
  if (options.length && event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    view.dispatch({ effects: chooseLanguage.of(null) });
    return true;
  }
  if (event.key !== "Enter") return false;
  const language = options[index]?.id ?? codeLanguageId(fence.language);
  return language !== null && finishFence(view, language);
}

export function insertIntoEmptyFence(view: EditorView, from: number, to: number, text: string, caret = text.length) {
  if (!text || from !== to) return false;
  const fence = codeFenceAt(view.state, from);
  if (!fence || fence.bodyFrom !== from || fence.closerFrom !== from) return false;
  view.dispatch({ changes: { from, insert: text + "\n" }, selection: { anchor: from + caret }, userEvent: caret === text.length ? "input.type" : "input.pair" });
  return true;
}

export function handleCodeBlockBackspace(view: EditorView, repeat = false) {
  const { state } = view;
  const cursor = state.selection.main;
  if (!cursor.empty) return false;
  const fence = codeFenceAt(state, cursor.head);
  if (fence?.closerFrom == null) return false;
  const bodyEnd = codeBodyEnd(fence);
  if (cursor.head < fence.bodyFrom || cursor.head > bodyEnd) return false;
  const changes = emptyCodeFenceRemoval(state.doc.toString(), fence);
  // Backspace at the first code position must not edit the hidden opening fence.
  if (!changes) return cursor.head === fence.bodyFrom;
  if (repeat) return true;
  view.dispatch({
    changes,
    selection: { anchor: changes.from },
    scrollIntoView: true,
    userEvent: "input.structure",
  });
  return true;
}
