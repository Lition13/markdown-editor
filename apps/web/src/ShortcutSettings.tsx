import {
  editorShortcutPrefix, markdownShortcutFromEvent, normalizeMarkdownShortcut, type MarkdownShortcutIssue,
} from "@lition13/markdown-editor";
import { PencilLine, Search, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useWebLocale, webTranslator } from "./locale";
import {
  checkWorkbenchShortcut, getWorkbenchShortcutCommands, type WorkbenchShortcutDefinition, type WorkbenchShortcutOverrides,
} from "./workbenchShortcuts";
import "./shortcutSettings.css";

const fixedShortcuts = [
  { label: "打开斜杠菜单", key: "/" },
  { label: "表格上一格 / 下一格", key: "Shift+Tab / Tab" },
  { label: "标题升一级 / 降一级", key: "Shift+Tab / Tab" },
  { label: "续写同级标题", key: "Alt+Shift+Enter" },
  { label: "选择文件或文件夹的移动位置", key: "Shift+Space" },
] as const;

export default function ShortcutSettings({ value, onChange, onClose, storageFailed }: {
  value: WorkbenchShortcutOverrides;
  onChange: (next: WorkbenchShortcutOverrides) => void;
  onClose: () => void;
  storageFailed: boolean;
}) {
  const locale = useWebLocale();
  const t = webTranslator(locale);
  const actions = useMemo(() => getWorkbenchShortcutCommands(locale), [locale]);
  const groups = [...new Set(actions.map(command => command.group))];
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const previousButton = useRef<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<WorkbenchShortcutDefinition | null>(null);
  const [draft, setDraft] = useState("");
  const [capture, setCapture] = useState<"first" | "second" | null>(null);
  const [restoreIssue, setRestoreIssue] = useState<MarkdownShortcutIssue>();

  useLayoutEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    if (!matchMedia("(pointer: coarse)").matches) search.current?.focus();
  }, []);
  useLayoutEffect(() => {
    if (!editing) return;
    input.current?.focus();
    input.current?.select();
  }, [editing]);

  const searchTerm = (normalizeMarkdownShortcut(query) ?? query.normalize("NFKC").trim()).toLowerCase();
  const matches = (...texts: (string | null | undefined)[]) => texts.some(text => text?.toLowerCase().includes(searchTerm));
  const commands = actions.filter(command => matches(command.label, command.group, command.key, value[command.id],
    ...(value[command.id] === undefined ? (command.aliases ?? []).map(alias => alias.key) : [])));
  const fixed = fixedShortcuts.filter(item => matches(t(item.label), item.key, t("固定操作")));
  const typedIssue = editing && draft.trim() ? checkWorkbenchShortcut(editing.id, draft, value, locale) : undefined;
  const issue = restoreIssue ?? typedIssue;
  const canSave = !!draft.trim() && (!typedIssue || typedIssue.kind === "warning");

  function finishEdit() {
    setEditing(null);
    setCapture(null);
    setRestoreIssue(undefined);
    previousButton.current?.focus({ preventScroll: true });
  }

  function changeDraft(next: string) {
    setDraft(next);
    setRestoreIssue(undefined);
  }

  function startEdit(command: WorkbenchShortcutDefinition, button: HTMLButtonElement, binding: string | null) {
    if (editing?.id === command.id) {
      finishEdit();
      return;
    }
    previousButton.current = button;
    setEditing(command);
    changeDraft(binding ?? "");
    setCapture(null);
  }

  function save(binding: string | null | undefined) {
    if (!editing) return;
    const warning = checkWorkbenchShortcut(editing.id, binding, value, locale);
    if (warning && warning.kind !== "warning") {
      setRestoreIssue(warning);
      return;
    }
    const next = { ...value };
    if (binding === undefined || binding === editing.key) delete next[editing.id];
    else next[editing.id] = binding;
    onChange(next);
    finishEdit();
  }

  function record(event: KeyboardEvent<HTMLButtonElement>) {
    if (!capture || event.repeat || event.nativeEvent.isComposing) return;
    if ((event.key === "Escape" || event.key === "Tab") && !event.ctrlKey && !event.metaKey && !event.altKey) {
      setCapture(null);
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    const chord = markdownShortcutFromEvent(event);
    if (!chord) return;
    event.preventDefault();
    event.stopPropagation();
    if (chord === editorShortcutPrefix && editing?.id !== "outline") {
      setCapture("second");
      return;
    }
    const binding = capture === "second" ? markdownShortcutFromEvent(event, true) : chord;
    if (!binding) return;
    changeDraft(binding);
    setCapture(null);
  }

  function editForm(command: WorkbenchShortcutDefinition) {
    return <form className="shortcut-form" aria-label={t("设置 {command}", { command: command.label })} onSubmit={event => {
      event.preventDefault();
      const binding = canSave && normalizeMarkdownShortcut(draft);
      if (binding) save(binding);
    }}>
      <label className="visually-hidden" htmlFor="shortcut-draft">{t("快捷键组合")}</label>
      <div className="shortcut-input-row">
        <input id="shortcut-draft" ref={input} value={draft} maxLength={64} spellCheck={false} autoComplete="off"
          placeholder={t("例如 Ctrl+Shift+Enter")} aria-invalid={issue && issue.kind !== "warning" ? true : undefined}
          aria-describedby={issue ? "shortcut-conflict" : "shortcut-input-hint"} onChange={event => changeDraft(event.currentTarget.value)} />
        <button className="button" type="button" aria-pressed={capture !== null}
          onClick={() => { setCapture(capture ? null : "first"); setRestoreIssue(undefined); }}
          onKeyDown={record} onBlur={() => setCapture(null)}>
          {capture === "second" ? t("按下第二个键") : capture ? t("按下快捷键") : t("录制")}
        </button>
      </div>
      {issue ? <p id="shortcut-conflict" className="shortcut-issue" data-kind={issue.kind} role={issue.kind === "warning" ? "status" : "alert"}>
        {issue.message}
      </p> : <p id="shortcut-input-hint" className="shortcut-hint">{command.id === "outline"
        ? t("大纲快捷键使用一组按键，例如 Ctrl+Alt+O。")
        : t("可录制或手动输入。带 → 的组合先按 {prefix}，松开后再按第二个键。", { prefix: editorShortcutPrefix })}</p>}
      <div className="shortcut-actions">
        <button className="button" type="button" disabled={value[command.id] === undefined} onClick={() => save(undefined)}>{t("恢复默认")}</button>
        <button className="button" type="button" disabled={value[command.id] === null} onClick={() => save(null)}>{t("停用")}</button>
        <button className="button" type="button" onClick={finishEdit}>{t("取消")}</button>
        <button className="button primary" type="submit" disabled={!canSave}>{t("保存")}</button>
      </div>
    </form>;
  }

  return <dialog id="shortcut-settings" ref={dialog} className="shortcut-settings" aria-labelledby="shortcut-settings-title"
    onClose={onClose} onCancel={event => {
      if (!editing) return;
      event.preventDefault();
      finishEdit();
    }} onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
    <div className="shortcut-settings-panel">
      <header className="shortcut-settings-heading">
        <h2 id="shortcut-settings-title">{t("快捷键设置")}</h2>
        <button type="button" className="icon-control" aria-label={t("关闭快捷键设置")} onClick={() => dialog.current?.close()}><X size={19} aria-hidden="true" /></button>
      </header>
      <label className="file-search shortcut-search">
        <Search size={16} aria-hidden="true" />
        <input ref={search} type="search" aria-label={t("搜索快捷键")} placeholder={t("搜索操作或快捷键")} value={query} onChange={event => {
          setQuery(event.currentTarget.value);
          setEditing(null);
          setCapture(null);
          setRestoreIssue(undefined);
        }} />
      </label>
      <div className="shortcut-settings-list">
        {!commands.length && !fixed.length && <p className="shortcut-empty">{t("没有匹配的快捷键")}</p>}
        {groups.map(group => {
          const items = commands.filter(command => command.group === group);
          if (!items.length) return null;
          return <section className="shortcut-group" key={group} aria-label={group}>
            <h3>{group}</h3>
            <ul>
              {items.map(command => {
                const override = value[command.id];
                const binding = override === undefined ? command.key : override;
                const aliases = override === undefined ? command.aliases ?? [] : [];
                return <li key={command.id} className="shortcut-entry">
                  <div className="shortcut-row">
                    <span>{command.label}</span>
                    <button type="button" className="shortcut-binding" aria-label={t("修改 {command}", { command: command.label })} aria-expanded={editing?.id === command.id}
                      onClick={event => startEdit(command, event.currentTarget, binding)}>
                      <span className="shortcut-binding-keys">
                        {binding ? <kbd>{binding}</kbd> : <span className="shortcut-hint">{t("已停用")}</span>}
                        {aliases.map(alias => <kbd key={alias.key}>{alias.key}</kbd>)}
                      </span>
                      <PencilLine size={14} aria-hidden="true" />
                    </button>
                  </div>
                  {editing?.id === command.id && editForm(command)}
                </li>;
              })}
            </ul>
          </section>;
        })}
        {fixed.length > 0 && <section className="shortcut-group" aria-label={t("固定操作")}>
          <h3>{t("固定操作")}</h3>
          <ul>{fixed.map(item => <li key={item.label} className="shortcut-row shortcut-fixed"><span>{t(item.label)}</span><kbd>{item.key}</kbd></li>)}</ul>
        </section>}
      </div>
      <footer className="shortcut-settings-footer">
        <button className="button" type="button" disabled={!Object.keys(value).length} onClick={() => {
          onChange({});
          if (editing) finishEdit();
          else search.current?.focus();
        }}>{t("恢复全部默认")}</button>
        {storageFailed && <p className="shortcut-issue" data-kind="warning" role="status">{t("浏览器存储不可用，本次打开期间仍可使用。")}</p>}
      </footer>
    </div>
  </dialog>;
}
