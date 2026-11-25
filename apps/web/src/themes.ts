import type { MarkdownTheme } from "@lition13/markdown-editor";

export const themeFields = [
  { id: "background", label: "工作区背景" },
  { id: "sidebar", label: "侧栏背景" },
  { id: "text", label: "文字颜色" },
  { id: "accent", label: "强调色" },
  { id: "code", label: "代码底色" },
] as const;

export type ThemeField = typeof themeFields[number]["id"];
export type CustomTheme = { name: string; base: MarkdownTheme; colors: Partial<Record<ThemeField, string>> };
export type SavedTheme = CustomTheme & { id: string };
export type ThemePreference = { active: MarkdownTheme | "custom"; customId?: string; themes: SavedTheme[] };

const builtInColors: Record<MarkdownTheme, Record<ThemeField, string>> = {
  light: { background: "#ffffff", sidebar: "#f4f7fc", text: "#1c2840", accent: "#3458c7", code: "#f2f5fa" },
  dark: { background: "#192133", sidebar: "#161e30", text: "#edf2ff", accent: "#98afff", code: "#222e44" },
};

const builtInTheme = (value: unknown): value is MarkdownTheme => value === "light" || value === "dark";
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function normalizeThemeColor(value: string) {
  const digits = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())?.[1].toLowerCase();
  if (digits) return "#" + (digits.length === 3 ? [...digits].map(digit => digit + digit).join("") : digits);
}

function readCustomTheme(value: unknown): CustomTheme | undefined {
  if (!isRecord(value) || !builtInTheme(value.base)) return;
  const colors: CustomTheme["colors"] = {};
  if (isRecord(value.colors)) {
    for (const { id } of themeFields) {
      const raw = value.colors[id];
      const color = typeof raw === "string" && normalizeThemeColor(raw);
      if (color) colors[id] = color;
    }
  }
  const name = typeof value.name === "string" && value.name.trim();
  return { name: name || "我的主题", base: value.base, colors };
}

export function readThemePreference(saved: string | null, fallback: MarkdownTheme): ThemePreference {
  if (builtInTheme(saved)) return { active: saved, themes: [] };
  try {
    const value: unknown = JSON.parse(saved ?? "null");
    if (isRecord(value)) {
      const themes: SavedTheme[] = [];
      if (Array.isArray(value.themes)) {
        for (const item of value.themes) {
          if (!isRecord(item) || typeof item.id !== "string" || !item.id || themes.some(theme => theme.id === item.id)) continue;
          const theme = readCustomTheme(item);
          if (theme) themes.push({ id: item.id, ...theme });
        }
      } else {
        const theme = readCustomTheme(value.custom);
        if (theme) themes.push({ id: "custom-theme", ...theme });
      }
      const customId = themes.find(theme => theme.id === value.customId)?.id ?? themes.at(0)?.id;
      const active = value.active === "custom" && customId ? "custom" : builtInTheme(value.active) ? value.active : fallback;
      return { active, themes, customId };
    }
  } catch {}
  return { active: fallback, themes: [] };
}

export function themeColors(theme: Pick<CustomTheme, "base" | "colors">): Record<ThemeField, string> {
  return { ...builtInColors[theme.base], ...theme.colors };
}

export function newCustomTheme(base: MarkdownTheme, themes: SavedTheme[]): CustomTheme {
  let name = "我的主题";
  for (let suffix = 2; themes.some(theme => theme.name === name); suffix++) name = `我的主题 ${suffix}`;
  return { name, base, colors: {} };
}

export function validateThemeName(name: string, id: string, themes: SavedTheme[]) {
  const label = name.trim();
  if (!label) return "请输入主题名称。";
  if (themes.some(theme => theme.id !== id && theme.name === label)) return "已有同名主题，请换个名字。";
}

export function formatThemeSource(theme: CustomTheme) {
  return JSON.stringify({ name: theme.name, base: theme.base, colors: themeColors(theme) }, null, 2);
}

export function parseThemeSource(source: string): { theme: CustomTheme; error?: never } | { error: string; theme?: never } {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return { error: "请输入有效的 JSON。" };
  }
  if (!isRecord(value)) return { error: "主题源码必须是一个 JSON 对象。" };
  const { name, base, colors } = value;
  if (typeof name !== "string" || !name.trim()) return { error: "请在 name 中填写主题名称。" };
  if (!builtInTheme(base)) return { error: 'base 请选择 "light" 或 "dark"。' };
  if (colors !== undefined && !isRecord(colors)) return { error: "colors 必须是一个颜色对象。" };

  const palette: CustomTheme["colors"] = {};
  for (const [id, raw] of Object.entries(colors ?? {})) {
    const field = themeFields.find(field => field.id === id);
    if (!field) return { error: `colors 中没有 ${id} 这个颜色项。` };
    const color = typeof raw === "string" && normalizeThemeColor(raw);
    if (!color) return { error: `${field.id} 需要有效的十六进制颜色，例如 #3458c7。` };
    if (color !== builtInColors[base][field.id]) palette[field.id] = color;
  }
  return { theme: { name: name.trim(), base, colors: palette } };
}

const rgb = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));

function luminance(hex: string) {
  const [red, green, blue] = rgb(hex).map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function mix(first: string, second: string, weight: number) {
  const other = rgb(second);
  return "#" + rgb(first).map((value, index) =>
    Math.round(value * (1 - weight) + other[index] * weight).toString(16).padStart(2, "0"),
  ).join("");
}

function inkOn(background: string) {
  const light = luminance(background) + 0.05;
  return light / 0.05 >= 1.05 / light ? "#000000" : "#ffffff";
}

function readableOn(color: string, background: string) {
  const backdrop = luminance(background) + 0.05;
  const ink = inkOn(background);
  for (let amount = 0; amount < 1; amount += 0.125) {
    const next = amount === 0 ? color : mix(color, ink, amount);
    const light = luminance(next) + 0.05;
    if (Math.max(light, backdrop) / Math.min(light, backdrop) >= 4.5) return next;
  }
  return ink;
}

export function themeVariables(theme: CustomTheme) {
  const { background, sidebar, text, accent, code } = themeColors(theme);
  const darkCode = inkOn(code) === "#ffffff";
  return {
    "--theme-background": background,
    "--theme-sidebar": sidebar,
    "--theme-text": text,
    "--theme-muted": readableOn(mix(text, background, 0.32), background),
    "--theme-sidebar-text": readableOn(text, sidebar),
    "--theme-sidebar-muted": readableOn(mix(text, sidebar, 0.32), sidebar),
    "--theme-sidebar-link": readableOn(accent, sidebar),
    "--theme-accent": accent,
    "--theme-accent-ink": inkOn(accent),
    "--theme-link": readableOn(accent, background),
    "--theme-code": code,
    "--theme-code-text": readableOn(text, code),
    "--theme-code-muted": readableOn(mix(text, code, 0.32), code),
    "--theme-code-comment": readableOn(darkCode ? "#8b949e" : "#6a737d", code),
    "--theme-code-keyword": readableOn(darkCode ? "#ff8593" : "#c12745", code),
    "--theme-code-string": readableOn(darkCode ? "#a5d6ff" : "#175e8d", code),
    "--theme-code-number": readableOn(darkCode ? "#79c0ff" : "#1751a0", code),
    "--theme-code-title": readableOn(darkCode ? "#d2a8ff" : "#6f42c1", code),
    "--theme-code-variable": readableOn(darkCode ? "#ffa657" : "#9a4f00", code),
  };
}
