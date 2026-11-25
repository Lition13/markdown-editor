import { wrapInline, wrapInlineCode, type TextSelection } from "./markdown";
import { markdownTranslator, type MarkdownLocale } from "./locale";
import { keyIssue, markdownShortcutFromEvent, normalizeMarkdownShortcut, shortcutSequenceStart, type MarkdownShortcutIssue, type ShortcutEvent } from "./shortcutKeys";

type ShortcutScope = "live" | "source" | "table";
type Binding = { key: string };
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

const definitions = {
  source: { label: "切换编辑与源码", group: "视图与历史", key: "Ctrl+/", scopes: body },
  expand: { label: "切换全屏编辑", group: "视图与历史", key: "Alt+Enter", scopes: body },
  undo: { label: "撤销", group: "视图与历史", key: "Ctrl+Z", scopes: all },
  redo: { label: "重做", group: "视图与历史", key: "Ctrl+Y", scopes: all, aliases: [{ key: "Ctrl+Shift+Z" }] },
  help: { label: "Markdown 语法帮助", group: "视图与历史", key: "Ctrl+Shift+/", scopes: body },
  bold: { label: "加粗", group: "文字与段落", key: "Ctrl+B", scopes: all },
  italic: { label: "斜体", group: "文字与段落", key: "Ctrl+I", scopes: all },
  strike: { label: "删除线", group: "文字与段落", key: "Alt+Shift+5", scopes: all },
  inline: { label: "行内代码", group: "文字与段落", key: "Ctrl+Shift+`", scopes: all, aliases: [{ key: "Ctrl+`" }] },
  quote: { label: "引用", group: "文字与段落", key: "Ctrl+Shift+Q", scopes: body },
  ordered: { label: "有序列表", group: "文字与段落", key: "Ctrl+Shift+[", scopes: body },
  bullet: { label: "无序列表", group: "文字与段落", key: "Ctrl+Shift+]", scopes: body },
  task: { label: "待办列表", group: "文字与段落", key: "Alt+T", scopes: body },
  indent: { label: "增加缩进", group: "文字与段落", key: "Ctrl+[", scopes: body },
  outdent: { label: "减少缩进", group: "文字与段落", key: "Ctrl+]", scopes: body },
  table: { label: "插入表格", group: "插入", key: "Ctrl+Alt+T", scopes: body },
  link: { label: "插入链接", group: "插入", key: "Ctrl+K", scopes: body },
  image: { label: "插入图片", group: "插入", key: "Ctrl+Shift+I", scopes: body },
  code: { label: "插入代码块", group: "插入", key: "Ctrl+Shift+K", scopes: body },
  math: { label: "插入块级公式", group: "插入", key: "Ctrl+Shift+M", scopes: body },
  heading1: { label: "一级标题", group: "标题", key: "Ctrl+1", scopes: live },
  heading2: { label: "二级标题", group: "标题", key: "Ctrl+2", scopes: live },
  heading3: { label: "三级标题", group: "标题", key: "Ctrl+3", scopes: live },
  heading4: { label: "四级标题", group: "标题", key: "Ctrl+4", scopes: live },
  heading5: { label: "五级标题", group: "标题", key: "Ctrl+5", scopes: live },
  heading6: { label: "六级标题", group: "标题", key: "Ctrl+6", scopes: live },
  paragraph: { label: "普通段落", group: "标题", key: "Ctrl+0", scopes: live },
  raiseHeading: { label: "提高标题级别", group: "标题", key: "Ctrl+=", scopes: live },
  lowerHeading: { label: "降低标题级别", group: "标题", key: "Ctrl+-", scopes: live },
  rowUp: { label: "上移表格行", group: "表格单元格", key: "Alt+ArrowUp", scopes: table },
  rowDown: { label: "下移表格行", group: "表格单元格", key: "Alt+ArrowDown", scopes: table },
  columnLeft: { label: "左移表格列", group: "表格单元格", key: "Alt+ArrowLeft", scopes: table },
  columnRight: { label: "右移表格列", group: "表格单元格", key: "Alt+ArrowRight", scopes: table },
  insertRow: { label: "在下方插入行", group: "表格单元格", key: "Ctrl+Enter", scopes: table, aliases: [{ key: "Ctrl+Shift+Enter" }] },
  deleteRow: { label: "删除当前表格行", group: "表格单元格", key: "Ctrl+Shift+Backspace", scopes: table },
} as const satisfies Record<string, ShortcutDefinition>;

export type MarkdownShortcutAction = keyof typeof definitions;
export type MarkdownShortcutOverrides = Partial<Record<MarkdownShortcutAction, string | null>>;
export type MarkdownShortcutDefinition = ShortcutDefinition & { id: MarkdownShortcutAction };

const commands = Object.entries(definitions)
  .map(([id, definition]) => ({ id: id as MarkdownShortcutAction, ...definition }));
export const markdownShortcutCommands: readonly MarkdownShortcutDefinition[] = commands;

export function getMarkdownShortcutCommands(locale: MarkdownLocale = "zh-CN"): readonly MarkdownShortcutDefinition[] {
  if (locale === "zh-CN") return markdownShortcutCommands;
  const t = markdownTranslator(locale);
  return commands.map(command => ({ ...command, label: t(command.label), group: t(command.group) }));
}

function bindings(definition: ShortcutDefinition, override?: string | null): readonly Binding[] {
  if (override === null) return [];
  if (override !== undefined && override !== definition.key) return [{ key: override }];
  return [{ key: definition.key }, ...(definition.aliases ?? [])];
}

function findConflict(action: MarkdownShortcutAction, binding: string | null | undefined, overrides: MarkdownShortcutOverrides) {
  const definition: ShortcutDefinition = definitions[action];
  const keys = bindings(definition, binding).map(item => item.key);
  return commands.find(other => other.id !== action
    && other.scopes.some(scope => definition.scopes.includes(scope))
    && bindings(other, overrides[other.id]).some(item => keys.includes(item.key)));
}

export function checkMarkdownShortcut(action: MarkdownShortcutAction, input: string | null | undefined,
  overrides: MarkdownShortcutOverrides, locale?: MarkdownLocale): MarkdownShortcutIssue | undefined {
  if (input === null) return undefined;
  const t = markdownTranslator(locale);
  const defaultKey = definitions[action].key;
  const binding = input === undefined ? defaultKey : normalizeMarkdownShortcut(input);
  if (!binding) return { kind: "invalid", message: t("请输入有效的快捷键，例如 Ctrl+Shift+Enter。") };
  const issue = keyIssue(binding, t);
  if (issue && issue.kind !== "warning" && binding !== defaultKey) return issue;
  const conflict = findConflict(action, binding, overrides);
  if (conflict) return { kind: "duplicate", message: t("与「{command}」的快捷键冲突。", { command: t(conflict.label) }) };
  // A shipped default can be restored even if some browsers reserve it.
  return issue && binding === defaultKey ? { ...issue, kind: "warning" } : issue;
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
  const lookups: Record<ShortcutScope, Map<string, MarkdownShortcutAction>> = { live: new Map(), source: new Map(), table: new Map() };
  const sequencedScopes = new Set<ShortcutScope>();
  for (const command of markdownShortcutCommands) {
    const active = bindings(command, overrides[command.id]);
    if (!active.length) continue;
    labels[command.id] = active[0].key;
    for (const scope of command.scopes) {
      for (const item of active) {
        lookups[scope].set(item.key, command.id);
        if (item.key.startsWith(shortcutSequenceStart)) sequencedScopes.add(scope);
      }
    }
  }
  return {
    labels,
    hasSequence: (scope: ShortcutScope) => sequencedScopes.has(scope),
    match(scope: ShortcutScope, event: ShortcutEvent, prefixed = false) {
      return lookups[scope].get(markdownShortcutFromEvent(event, prefixed));
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
  return chord === definitions.undo.key || chord === definitions.redo.key || definitions.redo.aliases.some(alias => alias.key === chord);
}

const inlineMarkers = { bold: "**", italic: "*", strike: "~~" } as const;
type InlineFormat = keyof typeof inlineMarkers | "inline";

export function isInlineMarkdownFormat(action: string | undefined): action is InlineFormat {
  return action === "inline" || action === "bold" || action === "italic" || action === "strike";
}

export function formatMarkdownInline(value: string, range: TextSelection, action: InlineFormat, t = markdownTranslator()) {
  if (action === "inline") return wrapInlineCode(value, range, t("代码"));
  const marker = inlineMarkers[action];
  return wrapInline(value, range, marker, marker, t("文字"));
}
