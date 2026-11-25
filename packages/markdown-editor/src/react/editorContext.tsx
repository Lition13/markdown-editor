import { createContext, useContext, type Ref } from "react";
import { safeMarkdownUrl } from "../core/markdown";
import { resolveMarkdownShortcuts, type MarkdownShortcutOverrides } from "../core/markdownShortcuts";

export type MarkdownTheme = "light" | "dark";
export type MarkdownMode = "live" | "source";

export interface MarkdownEditorHandle {
  focusAt(offset: number): void;
  openFullscreen(): void;
}

export interface MarkdownOptions {
  theme?: MarkdownTheme;
  className?: string;
  normalizeLink?: (href: string) => string | undefined;
  onOpenLink?: (href: string) => boolean | void | Promise<boolean | void>;
  copyText?: (text: string) => void | Promise<void>;
}

export interface MarkdownEditorProps extends MarkdownOptions {
  ref?: Ref<MarkdownEditorHandle>;
  value: string;
  onChange: (value: string) => void;
  mode?: MarkdownMode;
  onModeChange?: (mode: MarkdownMode) => void;
  allowExpand?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  overlayContainer?: HTMLElement | null;
  overlayTopInset?: number;
  shortcuts?: MarkdownShortcutOverrides;
}

export interface MarkdownPreviewProps extends MarkdownOptions {
  value: string;
}

export interface EditorEnvironment {
  theme: MarkdownTheme;
  normalizeLink?: MarkdownOptions["normalizeLink"];
  onOpenLink?: MarkdownOptions["onOpenLink"];
  copyText?: MarkdownOptions["copyText"];
  ariaLabel: string;
  placeholder: string;
  surface: HTMLElement | null;
  overlay: HTMLElement | null;
  topInset: number;
  shortcuts: ReturnType<typeof resolveMarkdownShortcuts>;
  onTableHistory?: (redo: boolean) => void;
}

export const defaultEnvironment: EditorEnvironment = {
  theme: "light",
  ariaLabel: "Markdown 正文",
  placeholder: "开始输入。输入 / 打开编辑工具",
  surface: null,
  overlay: null,
  topInset: 0,
  shortcuts: resolveMarkdownShortcuts(),
};

export const MarkdownEnvironment = createContext(defaultEnvironment);
export const useMarkdownEnvironment = () => useContext(MarkdownEnvironment);

export function resolveMarkdownLink(href: string, normalizeLink?: MarkdownOptions["normalizeLink"]) {
  return safeMarkdownUrl(normalizeLink?.(href) ?? href);
}

export async function openMarkdownLink(href: string, environment: EditorEnvironment) {
  const safe = safeMarkdownUrl(href);
  if (!safe) return false;
  try {
    if (environment.onOpenLink) return await environment.onOpenLink(safe) !== false;
    if (safe.startsWith("#")) return false;
    window.open(safe, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

export async function copyMarkdownText(text: string, environment: EditorEnvironment) {
  if (environment.copyText) await environment.copyText(text);
  else await navigator.clipboard.writeText(text);
}
