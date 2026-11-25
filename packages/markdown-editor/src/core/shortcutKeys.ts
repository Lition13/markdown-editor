import { shortcutFromEvent } from "./keyboard";

export const editorShortcutPrefix = "Ctrl+Shift+.";
export const shortcutSequenceStart = editorShortcutPrefix + " → ";

export type ShortcutEvent = Parameters<typeof shortcutFromEvent>[0] & Pick<KeyboardEvent, "code">
  & Partial<Pick<KeyboardEvent, "getModifierState">>;

const shiftedKeys: Readonly<Record<string, string>> = {
  Backquote: "`", BracketLeft: "[", BracketRight: "]", Slash: "/", Backslash: "\\", Period: ".",
  Comma: ",", Equal: "=", Minus: "-", Semicolon: ";", Quote: "'",
};

export function markdownShortcutFromEvent(event: ShortcutEvent, prefixed = false) {
  if (event.getModifierState?.("AltGraph")) return "";
  const { key, code, ctrlKey, metaKey, altKey, shiftKey } = event;
  if (prefixed) {
    return !ctrlKey && !metaKey && !altKey && /^[!-~]$/.test(key) ? shortcutSequenceStart + key.toUpperCase() : "";
  }
  const digit = shiftKey ? /^Digit([0-9])$/.exec(code)?.[1] : undefined;
  const base = (shiftKey ? shiftedKeys[code] : undefined) ?? digit ?? key;
  if (base === "AltGraph" || base === "Process" || base === "Dead" || base === "Unidentified") return "";
  return shortcutFromEvent({ key: base === " " ? "Space" : base === "+" ? "Plus" : base, ctrlKey, metaKey, altKey, shiftKey });
}

const modifiers = new Map([
  ["ctrl", "Ctrl"], ["control", "Ctrl"], ["cmd", "Ctrl"], ["command", "Ctrl"], ["meta", "Ctrl"], ["⌘", "Ctrl"],
  ["alt", "Alt"], ["option", "Alt"], ["⌥", "Alt"], ["shift", "Shift"], ["⇧", "Shift"],
  ["win", "Win"], ["windows", "Win"], ["super", "Win"],
]);
const modifierOrder = ["Ctrl", "Alt", "Shift", "Win"];
const namedKeys = new Map([
  ...["Enter", "Escape", "Tab", "Backspace", "Delete", "Insert", "Home", "End", "Space", "PageUp", "PageDown", "Plus",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].map(key => [key.toLowerCase(), key] as const),
  ["return", "Enter"], ["esc", "Escape"], ["del", "Delete"], ["spacebar", "Space"], ["pgup", "PageUp"], ["pgdn", "PageDown"],
  ["up", "ArrowUp"], ["down", "ArrowDown"], ["left", "ArrowLeft"], ["right", "ArrowRight"],
]);

export function isModifierKey(key: string) {
  return key === "AltGraph" || modifiers.has(key.toLowerCase());
}

function normalizeChord(chord: string) {
  const parts = chord.trim().replace(/\+\s*\+$/, "+Plus").split("+").map(part => part.trim());
  const key = parts.pop() ?? "";
  const canonical = namedKeys.get(key.toLowerCase()) ?? (/^(?:[!-~]|F(?:[1-9]|1[0-9]|2[0-4]))$/i.test(key) ? key.toUpperCase() : undefined);
  if (!canonical || canonical === "+") return undefined;
  const found = new Set<string>();
  for (const part of parts) {
    const modifier = modifiers.get(part.toLowerCase());
    if (!modifier || found.has(modifier)) return undefined;
    found.add(modifier);
  }
  return [...modifierOrder.filter(modifier => found.has(modifier)), canonical].join("+");
}

export function normalizeMarkdownShortcut(value: string) {
  const [first, second, ...rest] = value.normalize("NFKC").trim().split(/\s*(?:→|->)\s*/);
  const chord = normalizeChord(first);
  if (second === undefined) return chord;
  return !rest.length && chord === editorShortcutPrefix && /^[!-~]$/.test(second)
    ? shortcutSequenceStart + second.toUpperCase() : undefined;
}

export type MarkdownShortcutIssue = {
  kind: "invalid" | "duplicate" | "reserved" | "warning";
  message: string;
};

// Browser shortcut references are listed in the project README.
const browserReserved = new Map([
  ["Ctrl+T", "新建标签页"], ["Ctrl+Shift+T", "恢复已关闭的标签页"], ["Ctrl+W", "关闭标签页"],
  ["Ctrl+Shift+W", "关闭窗口"], ["Ctrl+F4", "关闭标签页"], ["Ctrl+N", "新建窗口"], ["Ctrl+Shift+N", "打开隐私窗口"],
  ["Ctrl+Tab", "切换标签页"], ["Ctrl+Shift+Tab", "切换标签页"], ["Ctrl+PageUp", "切换标签页"],
  ["Ctrl+PageDown", "切换标签页"], ["Ctrl+Shift+PageUp", "移动标签页"], ["Ctrl+Shift+PageDown", "移动标签页"],
  ["Ctrl+L", "聚焦地址栏"], ["Alt+D", "聚焦地址栏"], ["F6", "切换到浏览器工具栏"],
]);
const systemReserved = new Map([
  ["Alt+Tab", "切换窗口"], ["Alt+Shift+Tab", "切换窗口"], ["Alt+F4", "关闭窗口"], ["Alt+Space", "打开窗口菜单"],
  ["Ctrl+Shift+Escape", "打开任务管理器"], ["Ctrl+Escape", "打开开始菜单"], ["Ctrl+Alt+Delete", "打开安全选项"],
  ["Ctrl+Alt+Tab", "切换窗口"], ["Alt+Escape", "切换窗口"],
]);
const browserWarnings = new Map([
  ["Ctrl+R", "刷新页面"], ["Ctrl+Shift+R", "刷新页面"], ["F5", "刷新页面"], ["Shift+F5", "刷新页面"],
  ["Ctrl+F", "查找页面文字"], ["F3", "查找页面文字"], ["Ctrl+G", "查找下一个结果"], ["Ctrl+Shift+G", "查找上一个结果"],
  ["Ctrl+S", "保存网页"], ["Ctrl+P", "打印网页"], ["Ctrl+O", "打开本地文件"], ["Ctrl+D", "添加书签"],
  ["Ctrl+Shift+D", "为标签页添加书签"], ["Ctrl+Shift+O", "打开书签管理器"], ["Ctrl+Shift+A", "搜索标签页"],
  ["Ctrl+B", "打开书签栏"], ["Ctrl+Shift+B", "切换书签栏"], ["Ctrl+I", "打开页面信息"], ["Ctrl+U", "查看网页源码"],
  ["Ctrl+E", "搜索地址栏"], ["Ctrl+K", "搜索地址栏"], ["Ctrl+H", "查看历史"], ["Ctrl+J", "查看下载"],
  ["Ctrl+M", "最小化窗口或切换静音"], ["Ctrl+Q", "退出浏览器"], ["Ctrl+Shift+Q", "退出浏览器"],
  ["Ctrl+Y", "查看历史"], ["Ctrl+,", "打开浏览器设置"],
  ["Ctrl+Shift+C", "打开开发者工具"], ["Ctrl+Shift+I", "打开开发者工具"], ["Ctrl+Shift+J", "打开开发者工具"],
  ["Ctrl+Shift+K", "打开控制台或复制标签页"], ["Ctrl+Shift+M", "打开用户菜单或响应式设计工具"],
  ["Ctrl+Shift+P", "打开隐私窗口或打印"], ["Ctrl+Shift+Delete", "清除浏览数据"],
  ["Ctrl+Shift+E", "打开侧栏搜索"], ["Ctrl+Shift+U", "朗读页面"], ["Ctrl+Shift+Y", "打开集锦"],
  ["Ctrl+[", "后退"], ["Ctrl+]", "前进"], ["Alt+ArrowLeft", "后退"], ["Alt+ArrowRight", "前进"], ["Alt+Home", "打开主页"],
  ["Alt+F", "打开浏览器菜单"], ["F1", "打开帮助"], ["F4", "聚焦地址栏"], ["F7", "切换光标浏览"],
  ["F9", "切换阅读模式"], ["F10", "聚焦菜单栏"], ["Shift+F10", "打开上下文菜单"],
  ["F11", "切换浏览器全屏"], ["F12", "打开开发者工具"],
  ["Ctrl+0", "重置页面缩放"], ["Ctrl+=", "放大页面"], ["Ctrl+Plus", "放大页面"],
  ["Ctrl+Shift+=", "放大页面"], ["Ctrl+-", "缩小页面"], ["Ctrl+Shift+-", "缩小页面"],
]);
const editingKeys = new Set([
  "/", "Enter", "Shift+Enter", "Tab", "Shift+Tab", "Space", "Shift+Space", "Escape", "Backspace", "Delete", "Home", "End",
  "Ctrl+A", "Ctrl+C", "Ctrl+V", "Ctrl+Shift+V", "Ctrl+X", "Ctrl+Insert", "Shift+Insert", "Shift+Delete",
  "Ctrl+Backspace", "Ctrl+Delete", "Alt+Backspace", "Alt+Delete", "Alt+Shift+Enter",
]);

export function keyIssue(binding: string): MarkdownShortcutIssue | undefined {
  if (binding.startsWith(shortcutSequenceStart)) return undefined;
  if (binding === editorShortcutPrefix) return { kind: "reserved", message: "这是双段快捷键的起始键，请再指定第二个键。" };
  const system = systemReserved.get(binding);
  if (system || binding.split("+").includes("Win")) {
    return { kind: "reserved", message: system ? `系统保留此快捷键，用于${system}。` : "Win 键组合由系统保留。" };
  }
  const browser = browserReserved.get(binding) ?? (/^Ctrl\+[1-9]$/.test(binding) ? "切换标签页" : undefined);
  if (browser) return { kind: "reserved", message: `浏览器保留此快捷键，用于${browser}。` };
  if (editingKeys.has(binding) || /^Ctrl\+(?:Shift\+)?(?:Home|End|Arrow\w+)$/.test(binding)) {
    return { kind: "reserved", message: "编辑器已将此组合用于输入、选区或光标移动。" };
  }
  if (!/(?:^|\+)(?:Ctrl|Alt)\+|(?:^|\+)F(?:[1-9]|1[0-9]|2[0-4])$/.test(binding)) {
    return { kind: "invalid", message: "请组合 Ctrl、Alt 或功能键，也可以使用双段快捷键。" };
  }
  const warning = browserWarnings.get(binding);
  if (warning) return { kind: "warning", message: `可能与浏览器的「${warning}」冲突，浏览器优先时编辑器收不到按键。` };
  if (binding === "Ctrl+Space") return { kind: "warning", message: "此组合可能被系统用于切换中文输入法。" };
  if (binding === "Ctrl+Alt+T") return { kind: "warning", message: "部分系统会用它打开终端，部分键盘布局可能将它识别为 AltGr。" };
  if (binding.startsWith("Ctrl+Alt+")) {
    return { kind: "warning", message: "这个组合可能被识别为 AltGr，部分键盘布局下会用来输入字符。" };
  }
  return undefined;
}
