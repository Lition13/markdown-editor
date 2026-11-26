import {
  checkMarkdownShortcut, checkMarkdownShortcutKey, editorShortcutPrefix, getMarkdownShortcutBindings, getMarkdownShortcutCommands,
  normalizeMarkdownShortcut, readMarkdownShortcutOverrides, type MarkdownLocale, type MarkdownShortcutAction,
  type MarkdownShortcutDefinition, type MarkdownShortcutIssue, type MarkdownShortcutOverrides,
} from "@lition13/markdown-editor";
import { webTranslator } from "./locale";

type WorkbenchShortcutAction = MarkdownShortcutAction | "outline";
export type WorkbenchShortcutOverrides = MarkdownShortcutOverrides & { outline?: string | null };
export type WorkbenchShortcutDefinition = Omit<MarkdownShortcutDefinition, "id" | "scopes"> & { id: WorkbenchShortcutAction };

const defaultOutlineShortcut = "Ctrl+Alt+O";

export function getOutlineShortcut(overrides: WorkbenchShortcutOverrides) {
  return overrides.outline === undefined ? defaultOutlineShortcut : overrides.outline;
}

export function getWorkbenchShortcutCommands(locale: MarkdownLocale): readonly WorkbenchShortcutDefinition[] {
  const t = webTranslator(locale);
  return [...getMarkdownShortcutCommands(locale), {
    id: "outline", label: t("切换文档大纲"), group: t("视图与历史"), key: defaultOutlineShortcut,
  }];
}

function findEditorShortcut(binding: string, overrides: MarkdownShortcutOverrides, locale?: MarkdownLocale) {
  return getMarkdownShortcutCommands(locale).find(({ id }) => getMarkdownShortcutBindings(id, overrides[id]).includes(binding));
}

function checkOutlineShortcut(input: string, locale?: MarkdownLocale): MarkdownShortcutIssue | undefined {
  const binding = normalizeMarkdownShortcut(input);
  if (binding?.startsWith(editorShortcutPrefix)) {
    return { kind: "invalid", message: webTranslator(locale)("大纲快捷键使用一组按键，例如 Ctrl+Alt+O。") };
  }
  return checkMarkdownShortcutKey(input, locale);
}

export function checkWorkbenchShortcut(action: WorkbenchShortcutAction, input: string | null | undefined,
  overrides: WorkbenchShortcutOverrides, locale: MarkdownLocale): MarkdownShortcutIssue | undefined {
  if (input === null) return undefined;
  const t = webTranslator(locale);
  if (action === "outline") {
    const issue = checkOutlineShortcut(input ?? defaultOutlineShortcut, locale);
    if (issue && issue.kind !== "warning") return issue;
    const binding = input === undefined ? defaultOutlineShortcut : normalizeMarkdownShortcut(input);
    const conflict = binding && findEditorShortcut(binding, overrides, locale);
    return conflict ? { kind: "duplicate", message: t("与「{command}」的快捷键冲突。", { command: conflict.label }) } : issue;
  }
  const issue = checkMarkdownShortcut(action, input, overrides, locale);
  if (issue && issue.kind !== "warning") return issue;
  const outline = getOutlineShortcut(overrides);
  if (outline && getMarkdownShortcutBindings(action, input === undefined ? undefined : normalizeMarkdownShortcut(input)).includes(outline)) {
    return { kind: "duplicate", message: t("与「{command}」的快捷键冲突。", { command: t("切换文档大纲") }) };
  }
  return issue;
}

export function readWorkbenchShortcutOverrides(input: unknown): WorkbenchShortcutOverrides {
  const overrides = readMarkdownShortcutOverrides(input);
  const saved = input && typeof input === "object" && "outline" in input ? input.outline : undefined;
  if (saved === null) return { ...overrides, outline: null };
  const binding = typeof saved === "string" ? normalizeMarkdownShortcut(saved) : undefined;
  if (binding && binding !== defaultOutlineShortcut) {
    const issue = checkOutlineShortcut(binding);
    if ((!issue || issue.kind === "warning") && !findEditorShortcut(binding, overrides)) return { ...overrides, outline: binding };
  }
  if (findEditorShortcut(defaultOutlineShortcut, overrides)) return { ...overrides, outline: null };
  return overrides;
}
