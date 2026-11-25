import type { MarkdownTheme } from "@lition13/markdown-editor";
import { Copy, FileText, Moon, RotateCcw, Sun, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useWebText } from "./locale";
import {
  formatThemeSource, newCustomTheme, normalizeThemeColor, parseThemeSource, themeColors, themeFields, themeVariables,
  validateThemeName, type CustomTheme, type SavedTheme, type ThemeField,
} from "./themes";
import "./themeSettings.css";

export default function ThemeSettings({ base, themes, selected, onSave, onClose }: {
  base: MarkdownTheme;
  themes: SavedTheme[];
  selected?: SavedTheme;
  onSave: (theme: CustomTheme, id: string) => string | undefined;
  onClose: () => void;
}) {
  const t = useWebText();
  const dialog = useRef<HTMLDialogElement>(null);
  const sourceInput = useRef<HTMLTextAreaElement>(null);
  const [themeId, setThemeId] = useState(selected?.id ?? "");
  const [draft, setDraft] = useState(() => selected ?? newCustomTheme(base, themes, t));
  const [inputs, setInputs] = useState<CustomTheme["colors"]>({});
  const [mode, setMode] = useState<"colors" | "source">("colors");
  const [source, setSource] = useState<{ text: string; error?: string }>();
  const [copyStatus, setCopyStatus] = useState("");
  const [saveError, setSaveError] = useState<string>();
  const colors = themeColors(draft);
  const sourceText = source?.text ?? formatThemeSource(draft);
  const invalidHex = themeFields.some(({ id }) => inputs[id] !== undefined && !normalizeThemeColor(inputs[id]));
  const nameError = validateThemeName(draft.name, themeId, themes, t);
  const error = mode === "source" ? source?.error : invalidHex ? t("请输入有效的颜色值，例如 #3458c7。") : undefined;

  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  function resetSource() {
    setSource(undefined);
    setCopyStatus("");
    setSaveError(undefined);
  }

  function chooseTheme(id: string) {
    setThemeId(id);
    setDraft(themes.find(theme => theme.id === id) ?? newCustomTheme(base, themes, t));
    setInputs({});
    resetSource();
  }

  function changeName(name: string) {
    setDraft(previous => ({ ...previous, name }));
    resetSource();
  }

  function setColor(id: ThemeField, value: string, fromPicker = false) {
    resetSource();
    setInputs(previous => ({ ...previous, [id]: fromPicker ? undefined : value }));
    const hex = normalizeThemeColor(value);
    if (!hex) return;
    setDraft(previous => {
      const colors = { ...previous.colors, [id]: hex };
      if (hex === themeColors({ base: previous.base, colors: {} })[id]) delete colors[id];
      return { ...previous, colors };
    });
  }

  function chooseBase(base: MarkdownTheme) {
    setDraft(previous => ({ ...previous, base }));
    setInputs({});
    resetSource();
  }

  function reset() {
    setDraft(previous => ({ ...previous, colors: {} }));
    setInputs({});
    resetSource();
  }

  function changeSource(text: string) {
    const parsed = parseThemeSource(text, t);
    setSource({ text, error: parsed.error });
    setCopyStatus("");
    setSaveError(undefined);
    if (parsed.theme) {
      setDraft(parsed.theme);
      setInputs({});
    }
  }

  async function copySource() {
    try {
      await navigator.clipboard.writeText(sourceText);
      setCopyStatus(t("已复制源码"));
    } catch {
      sourceInput.current?.focus();
      sourceInput.current?.select();
      setCopyStatus(t("已选中源码，可以复制。"));
    }
  }

  return <dialog ref={dialog} id="theme-settings" className="theme-settings" aria-labelledby="theme-settings-title"
    onClose={onClose} onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
    <form className="theme-settings-form" onSubmit={event => {
      event.preventDefault();
      if (error || nameError) return;
      const failure = onSave(draft, themeId);
      if (failure) setSaveError(failure);
      else dialog.current?.close();
    }}>
      <header className="theme-settings-heading">
        <h2 id="theme-settings-title">{t("自定义主题")}</h2>
        <button type="button" className="icon-control" aria-label={t("关闭自定义主题")} onClick={() => dialog.current?.close()}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="theme-settings-body">
        <div className="theme-library">
          <label htmlFor="theme-profile">{t("编辑主题")}</label>
          <select id="theme-profile" value={themeId} onChange={event => chooseTheme(event.currentTarget.value)}>
            <option value="">{t("新建主题")}</option>
            {themes.map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
          </select>
          <div className="theme-base-options theme-modes" role="group" aria-label={t("主题编辑方式")}>
            <button type="button" className="button" aria-pressed={mode === "colors"} onClick={() => setMode("colors")}>{t("配色")}</button>
            <button type="button" className="button" aria-pressed={mode === "source"} onClick={() => setMode("source")}>{t("主题源码")}</button>
          </div>
        </div>
        <div className="theme-settings-columns">
          <div className="theme-controls">
            {mode === "colors" ? <>
              <div className="theme-name">
                <label htmlFor="theme-name">{t("主题名称")}</label>
                <input id="theme-name" type="text" value={draft.name} autoComplete="off" aria-invalid={!!nameError || undefined}
                  onChange={event => changeName(event.currentTarget.value)} />
              </div>
              <div className="theme-base">
                <span id="theme-base-label">{t("主题基底")}</span>
                <div className="theme-base-options" role="group" aria-labelledby="theme-base-label">
                  <button type="button" className="button" aria-pressed={draft.base === "light"} onClick={() => chooseBase("light")}>
                    <Sun size={15} aria-hidden="true" />{t("浅色")}
                  </button>
                  <button type="button" className="button" aria-pressed={draft.base === "dark"} onClick={() => chooseBase("dark")}>
                    <Moon size={15} aria-hidden="true" />{t("深色")}
                  </button>
                </div>
              </div>
              <div className="theme-fields">
                {themeFields.map(({ id, label }) => {
                  const hexInput = inputs[id];
                  return <div className="theme-color-field" key={id}>
                    <label htmlFor={"theme-hex-" + id}>{t(label)}</label>
                    <input type="color" aria-label={t("{label}取色", { label: t(label) })} value={colors[id]}
                      onInput={event => setColor(id, event.currentTarget.value, true)} />
                    <input id={"theme-hex-" + id} type="text" value={hexInput ?? colors[id]}
                      spellCheck={false} autoComplete="off" autoCapitalize="off" placeholder="#RRGGBB"
                      aria-invalid={hexInput !== undefined && !normalizeThemeColor(hexInput) || undefined}
                      onChange={event => setColor(id, event.currentTarget.value)}
                      onBlur={() => {
                        if (hexInput !== undefined && normalizeThemeColor(hexInput)) {
                          setInputs(previous => ({ ...previous, [id]: undefined }));
                        }
                      }} />
                  </div>;
                })}
              </div>
            </> : <div className="theme-source">
              <div className="theme-source-heading">
                <label htmlFor="theme-source-code">{t("JSON 源码")}</label>
                <button className="button" type="button" onClick={() => void copySource()}>
                  <Copy size={14} aria-hidden="true" />{t("复制源码")}
                </button>
              </div>
              <p id="theme-source-help">{t("粘贴或编辑主题 JSON，省略的颜色沿用基底。")}</p>
              <textarea ref={sourceInput} id="theme-source-code" value={sourceText} wrap="off" spellCheck={false}
                aria-describedby="theme-source-help" aria-invalid={!!source?.error || undefined}
                onChange={event => changeSource(event.currentTarget.value)} />
              {copyStatus && <p role="status">{copyStatus}</p>}
            </div>}
            {(error || nameError) && <p className="theme-settings-error" role="status">{error ?? nameError}</p>}
          </div>
          <section className="theme-preview" aria-label={t("主题预览")}>
            <h3>{t("预览")}</h3>
            <div className="theme-preview-window" style={themeVariables(draft) as CSSProperties}>
              <div className="theme-preview-title"><FileText size={14} aria-hidden="true" />{t("项目笔记.md")}</div>
              <div className="theme-preview-workbench">
                <div className="theme-preview-sidebar"><span>{t("项目笔记")}</span></div>
                <div className="theme-preview-document">
                  <strong>{t("项目笔记")}</strong>
                  <p>{t("段落中的")}<span>{t("链接")}</span>{t("与文字。")}</p>
                  <pre><code><span>const</span>{" title = "}<span>{JSON.stringify(t("项目笔记"))}</span>;</code></pre>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
      <footer className="theme-settings-footer">
        {mode === "colors" && <button type="button" className="button theme-reset" onClick={reset}>
          <RotateCcw size={14} aria-hidden="true" />{t("恢复基底颜色")}
        </button>}
        <div className="theme-settings-actions">
          <button type="button" className="button" onClick={() => dialog.current?.close()}>{t("取消")}</button>
          <button type="submit" className="button primary" disabled={!!(error || nameError)}>{t("保存并应用")}</button>
        </div>
        {saveError && <p className="theme-settings-error" role="alert">{saveError}</p>}
      </footer>
    </form>
  </dialog>;
}
