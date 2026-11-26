import {
  checkMarkdownShortcut, checkMarkdownShortcutKey, editorShortcutPrefix, getMarkdownShortcutBindings, getMarkdownShortcutCommands,
  normalizeMarkdownShortcut, readMarkdownShortcutOverrides, type MarkdownLocale, type MarkdownShortcutAction,
  type MarkdownShortcutDefinition, type MarkdownShortcutIssue, type MarkdownShortcutOverrides,
} from "@lition13/markdown-editor";
import { webTranslator } from "./locale";

const panelDefinitions = {
  outline: { label: "切换文档大纲", key: "Ctrl+Alt+O" },
  files: { label: "切换文件管理", key: "Ctrl+Alt+F" },
} as const;
type PanelShortcutAction = keyof typeof panelDefinitions;
type WorkbenchShortcutAction = MarkdownShortcutAction | PanelShortcutAction;
const panelActions = Object.keys(panelDefinitions) as PanelShortcutAction[];

export type WorkbenchShortcutOverrides = MarkdownShortcutOverrides & Partial<Record<PanelShortcutAction, string | null>>;
export type WorkbenchShortcutDefinition = Omit<MarkdownShortcutDefinition, "id" | "scopes"> & { id: WorkbenchShortcutAction };

export function isPanelShortcut(action: WorkbenchShortcutAction): action is PanelShortcutAction {
  return action in panelDefinitions;
}

export function getPanelShortcut(action: PanelShortcutAction, overrides: WorkbenchShortcutOverrides) {
  const saved = overrides[action];
  return saved === undefined ? panelDefinitions[action].key : saved;
}

export function getWorkbenchShortcutCommands(locale: MarkdownLocale): readonly WorkbenchShortcutDefinition[] {
  const t = webTranslator(locale);
  return [...getMarkdownShortcutCommands(locale), ...panelActions.map(id => {
    const { label, key } = panelDefinitions[id];
    return { id, label: t(label), group: t("视图与历史"), key };
  })];
}

function checkPanelShortcut(action: PanelShortcutAction, input: string, locale?: MarkdownLocale): MarkdownShortcutIssue | undefined {
  const binding = normalizeMarkdownShortcut(input);
  if (binding?.startsWith(editorShortcutPrefix)) {
    return { kind: "invalid", message: webTranslator(locale)("请使用一组按键，例如 {shortcut}。", { shortcut: panelDefinitions[action].key }) };
  }
  return checkMarkdownShortcutKey(input, locale);
}

export function checkWorkbenchShortcut(action: WorkbenchShortcutAction, input: string | null | undefined,
  overrides: WorkbenchShortcutOverrides, locale: MarkdownLocale): MarkdownShortcutIssue | undefined {
  if (input === null) return undefined;
  const t = webTranslator(locale);
  const duplicate = (label: string): MarkdownShortcutIssue => ({
    kind: "duplicate", message: t("与「{command}」的快捷键冲突。", { command: label }),
  });
  if (isPanelShortcut(action)) {
    const candidate = input ?? panelDefinitions[action].key;
    const issue = checkPanelShortcut(action, candidate, locale);
    if (issue && issue.kind !== "warning") return issue;
    const binding = normalizeMarkdownShortcut(candidate);
    if (!binding) return issue;
    const editor = getMarkdownShortcutCommands(locale).find(({ id }) => getMarkdownShortcutBindings(id, overrides[id]).includes(binding));
    if (editor) return duplicate(editor.label);
    const panel = panelActions.find(id => id !== action && getPanelShortcut(id, overrides) === binding);
    return panel ? duplicate(t(panelDefinitions[panel].label)) : issue;
  }
  const issue = checkMarkdownShortcut(action, input, overrides, locale);
  if (issue && issue.kind !== "warning") return issue;
  const bindings = getMarkdownShortcutBindings(action, input === undefined ? undefined : normalizeMarkdownShortcut(input));
  const panel = panelActions.find(id => {
    const key = getPanelShortcut(id, overrides);
    return key !== null && bindings.includes(key);
  });
  return panel ? duplicate(t(panelDefinitions[panel].label)) : issue;
}

export function readWorkbenchShortcutOverrides(input: unknown): WorkbenchShortcutOverrides {
  const overrides: WorkbenchShortcutOverrides = readMarkdownShortcutOverrides(input);
  const saved = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const taken = new Set(getMarkdownShortcutCommands().flatMap(({ id }) => getMarkdownShortcutBindings(id, overrides[id])));
  for (const action of panelActions) {
    const value = saved[action];
    if (value === null) {
      overrides[action] = null;
      continue;
    }
    const binding = typeof value === "string" ? normalizeMarkdownShortcut(value) : undefined;
    if (!binding || binding === panelDefinitions[action].key || taken.has(binding)) continue;
    const issue = checkPanelShortcut(action, binding);
    if (issue && issue.kind !== "warning") continue;
    overrides[action] = binding;
    taken.add(binding);
  }
  // Existing bindings take priority over panel defaults introduced by an upgrade.
  for (const action of panelActions) {
    if (overrides[action] !== undefined) continue;
    const key = panelDefinitions[action].key;
    if (taken.has(key)) overrides[action] = null;
    else taken.add(key);
  }
  return overrides;
}
