import { wrapInline, wrapInlineCode, type TextSelection } from "./markdown";
import { keyIssue, markdownShortcutFromEvent, normalizeMarkdownShortcut, shortcutSequenceStart, type MarkdownShortcutIssue, type ShortcutEvent } from "./shortcutKeys";

type ShortcutScope = "live" | "source" | "table";
type Binding = { key: string; controlOnly?: boolean };
type ShortcutDefinition = {
  label: string;
  group: string;
  key: string;
  scopes: readonly ShortcutScope[];
  aliases?: readonly Binding[];
};

const body = ["live", "source"] as const;
const live = ["live"] as const;
const table = ["table"] as const;
const all = ["live", "source", "table"] as const;
const sequence = (key: string) => shortcutSequenceStart + key;

const definitions = {
  source: { label: "切换编辑与源码", group: "视图与历史", key: "Ctrl+/", scopes: body },
  expand: { label: "切换全屏编辑", group: "视图与历史", key: "Alt+Enter", scopes: body },
  undo: { label: "撤销", group: "视图与历史", key: "Ctrl+Z", scopes: all },
  redo: { label: "重做", group: "视图与历史", key: "Ctrl+Shift+Z", scopes: all, aliases: [{ key: "Ctrl+Y", controlOnly: true }] },
  help: { label: "Markdown 语法帮助", group: "视图与历史", key: sequence("/"), scopes: body },
  bold: { label: "加粗", group: "文字与段落", key: sequence("B"), scopes: all, aliases: [{ key: "Ctrl+B" }] },
  italic: { label: "斜体", group: "文字与段落", key: sequence("I"), scopes: all, aliases: [{ key: "Ctrl+I" }] },
  strike: { label: "删除线", group: "文字与段落", key: sequence("S"), scopes: all },
  inline: { label: "行内代码", group: "文字与段落", key: sequence("`"), scopes: all },
  quote: { label: "引用", group: "文字与段落", key: sequence("Q"), scopes: body },
  ordered: { label: "有序列表", group: "文字与段落", key: "Ctrl+Shift+7", scopes: body },
  bullet: { label: "无序列表", group: "文字与段落", key: "Ctrl+Shift+8", scopes: body },
  task: { label: "待办列表", group: "文字与段落", key: sequence("T"), scopes: body },
  indent: { label: "增加缩进", group: "文字与段落", key: sequence("["), scopes: body },
  outdent: { label: "减少缩进", group: "文字与段落", key: sequence("]"), scopes: body },
  table: { label: "插入表格", group: "插入", key: "Ctrl+Shift+Enter", scopes: body },
  link: { label: "插入链接", group: "插入", key: sequence("K"), scopes: body },
  image: { label: "插入图片", group: "插入", key: sequence("P"), scopes: body },
  code: { label: "插入代码块", group: "插入", key: sequence("C"), scopes: body },
  math: { label: "插入块级公式", group: "插入", key: sequence("M"), scopes: body },
  heading1: { label: "一级标题", group: "标题", key: sequence("1"), scopes: body },
  heading2: { label: "二级标题", group: "标题", key: sequence("2"), scopes: body },
  heading3: { label: "三级标题", group: "标题", key: sequence("3"), scopes: body },
  heading4: { label: "四级标题", group: "标题", key: sequence("4"), scopes: body },
  heading5: { label: "五级标题", group: "标题", key: sequence("5"), scopes: body },
  heading6: { label: "六级标题", group: "标题", key: sequence("6"), scopes: body },
  paragraph: { label: "普通段落", group: "标题", key: sequence("0"), scopes: live },
  raiseHeading: { label: "提高标题级别", group: "标题", key: sequence("="), scopes: live },
  lowerHeading: { label: "降低标题级别", group: "标题", key: sequence("-"), scopes: live },
  rowUp: { label: "上移表格行", group: "表格单元格", key: sequence("U"), scopes: table },
  rowDown: { label: "下移表格行", group: "表格单元格", key: sequence("D"), scopes: table },
  columnLeft: { label: "左移表格列", group: "表格单元格", key: sequence("L"), scopes: table },
  columnRight: { label: "右移表格列", group: "表格单元格", key: sequence("R"), scopes: table },
  insertRow: { label: "在下方插入行", group: "表格单元格", key: "Ctrl+Enter", scopes: table },
  deleteRow: { label: "删除当前表格行", group: "表格单元格", key: "Ctrl+Shift+Backspace", scopes: table },
} as const satisfies Record<string, ShortcutDefinition>;

export type MarkdownShortcutAction = keyof typeof definitions;
export type MarkdownShortcutOverrides = Partial<Record<MarkdownShortcutAction, string | null>>;
export type MarkdownShortcutDefinition = ShortcutDefinition & { id: MarkdownShortcutAction };

export const markdownShortcutCommands: readonly MarkdownShortcutDefinition[] = Object.entries(definitions)
  .map(([id, definition]) => ({ id: id as MarkdownShortcutAction, ...definition }));

function bindings(definition: ShortcutDefinition, override?: string | null): readonly Binding[] {
  if (override === null) return [];
  if (override !== undefined && override !== definition.key) return [{ key: override }];
  return [{ key: definition.key }, ...(definition.aliases ?? [])];
}

function findConflict(action: MarkdownShortcutAction, binding: string | null | undefined, overrides: MarkdownShortcutOverrides) {
  const definition: ShortcutDefinition = definitions[action];
  const keys = bindings(definition, binding).map(item => item.key);
  return markdownShortcutCommands.find(other => other.id !== action
    && other.scopes.some(scope => definition.scopes.includes(scope))
    && bindings(other, overrides[other.id]).some(item => keys.includes(item.key)));
}

export function checkMarkdownShortcut(action: MarkdownShortcutAction, input: string | null | undefined,
  overrides: MarkdownShortcutOverrides): MarkdownShortcutIssue | undefined {
  if (input === null) return undefined;
  const binding = input === undefined ? definitions[action].key : normalizeMarkdownShortcut(input);
  if (!binding) return { kind: "invalid", message: "请输入有效的快捷键，例如 Ctrl+Shift+Enter。" };
  const issue = keyIssue(binding);
  if (issue && issue.kind !== "warning") return issue;
  const conflict = findConflict(action, binding, overrides);
  if (conflict) return { kind: "duplicate", message: `与「${conflict.label}」的快捷键冲突。` };
  return issue;
}

export function readMarkdownShortcutOverrides(input: unknown): MarkdownShortcutOverrides {
  const overrides: MarkdownShortcutOverrides = {};
  if (!input || typeof input !== "object") return overrides;
  const record = input as Record<string, unknown>;
  for (const command of markdownShortcutCommands) {
    const value = record[command.id];
    if (value === null) overrides[command.id] = null;
    if (typeof value !== "string") continue;
    const binding = normalizeMarkdownShortcut(value);
    if (!binding || binding === command.key) continue;
    const issue = keyIssue(binding);
    if (!issue || issue.kind === "warning") overrides[command.id] = binding;
  }
  // Recheck after restoring defaults, which can expose another collision in damaged preferences.
  while (true) {
    const conflicts = markdownShortcutCommands.filter(({ id }) => overrides[id] != null && findConflict(id, overrides[id], overrides));
    if (!conflicts.length) return overrides;
    for (const { id } of conflicts) delete overrides[id];
  }
}

export function resolveMarkdownShortcuts(input?: MarkdownShortcutOverrides) {
  const overrides = readMarkdownShortcutOverrides(input);
  const labels: Partial<Record<MarkdownShortcutAction, string>> = {};
  type ShortcutEntry = Binding & { action: MarkdownShortcutAction };
  const lookups: Record<ShortcutScope, Map<string, ShortcutEntry>> = { live: new Map(), source: new Map(), table: new Map() };
  for (const command of markdownShortcutCommands) {
    const active = bindings(command, overrides[command.id]);
    if (!active.length) continue;
    labels[command.id] = active[0].key;
    for (const scope of command.scopes) {
      for (const item of active) lookups[scope].set(item.key, { ...item, action: command.id });
    }
  }
  return {
    labels,
    match(scope: ShortcutScope, event: ShortcutEvent, prefixed = false) {
      const item = lookups[scope].get(markdownShortcutFromEvent(event, prefixed));
      return item && (!item.controlOnly || (event.ctrlKey && !event.metaKey)) ? item.action : undefined;
    },
  };
}

export const headingShortcuts = ["paragraph", "heading1", "heading2", "heading3", "heading4", "heading5", "heading6"] as const;
const headingLevels: Partial<Record<MarkdownShortcutAction, number | "raise" | "lower">> = {
  paragraph: 0, heading1: 1, heading2: 2, heading3: 3, heading4: 4, heading5: 5, heading6: 6,
  raiseHeading: "raise", lowerHeading: "lower",
};

export function headingForShortcut(action: MarkdownShortcutAction | undefined) {
  return action === undefined ? undefined : headingLevels[action];
}

export function isNativeHistoryShortcut(event: ShortcutEvent) {
  const chord = markdownShortcutFromEvent(event);
  return chord === definitions.undo.key || chord === definitions.redo.key || (chord === "Ctrl+Y" && event.ctrlKey && !event.metaKey);
}

const inlineMarkers = { bold: "**", italic: "*", strike: "~~" } as const;
type InlineFormat = keyof typeof inlineMarkers | "inline";

export function isInlineMarkdownFormat(action: string | undefined): action is InlineFormat {
  return action === "inline" || action === "bold" || action === "italic" || action === "strike";
}

export function formatMarkdownInline(value: string, range: TextSelection, action: InlineFormat) {
  return action === "inline" ? wrapInlineCode(value, range) : wrapInline(value, range, inlineMarkers[action]);
}
