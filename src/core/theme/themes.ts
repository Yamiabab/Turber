export type ThemeMode = "dark" | "light";

export interface ThemePreset {
  id: string;
  name: string;
  desc: string;
  swatch: string;
  mode: ThemeMode;
  /** 内置预设，禁止删除 */
  locked?: boolean;
  /** 用户在主题预设页自建 */
  custom?: boolean;
}

/** 内置预设：深色 / 浅色，二者锁定，不可删除。 */
export const BUILTIN_THEMES: ThemePreset[] = [
  {
    id: "next-dark",
    name: "深色",
    desc: "#111111 / #151515 近黑中性",
    swatch: "linear-gradient(135deg,#111111,#151515 55%,#f0efec)",
    mode: "dark",
    locked: true,
  },
  {
    id: "next-light",
    name: "浅色",
    desc: "#ffffff / #e5e5e5 极简留白",
    swatch: "linear-gradient(135deg,#ffffff,#f5f5f5 55%,#2563eb)",
    mode: "light",
    locked: true,
  },
];

export const THEME_PRESETS = BUILTIN_THEMES;

export const DEFAULT_THEME_ID = "next-dark";

/** 主题预设 CSS 目录（与主页面 CSS 分离） */
export const THEME_CSS_DIR = "styles/themes";

export const themeCssKey = (id: string): string => `${THEME_CSS_DIR}/${id}.css`;

export const BUILTIN_THEME_CSS_KEYS: string[] = BUILTIN_THEMES.map((theme) => themeCssKey(theme.id));

export const BUILTIN_THEME_IDS: string[] = BUILTIN_THEMES.map((theme) => theme.id);

export function findTheme(id: string, list: ThemePreset[] = BUILTIN_THEMES): ThemePreset | undefined {
  return list.find((theme) => theme.id === id);
}

export function isLightTheme(id: string, list: ThemePreset[] = BUILTIN_THEMES): boolean {
  return findTheme(id, list)?.mode === "light";
}

export function themeName(id: string, list: ThemePreset[] = BUILTIN_THEMES): string {
  return findTheme(id, list)?.name ?? id;
}

/** 内置预设（深色 / 浅色）锁定，不允许删除。 */
export function isLockedTheme(id: string): boolean {
  return BUILTIN_THEME_IDS.includes(id);
}

export function themeSwatch(mode: ThemeMode): string {
  return mode === "light"
    ? "linear-gradient(135deg,#ffffff,#f5f5f5 55%,#2563eb)"
    : "linear-gradient(135deg,#111111,#151515 55%,#f0efec)";
}

const slug = (input: string): string => {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "theme";
};

/** 生成唯一主题 id，同时作为 CSS 文件名：custom-<slug>-<stamp> */
export function makeCustomThemeId(name: string, taken: string[] = []): string {
  const base = `custom-${slug(name)}`;
  if (!taken.includes(base)) return base;
  let index = 2;
  while (taken.includes(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

/** 新建主题的 CSS 模板：以主题 id 作为选择器作用域，切换主题即生效。 */
export function themeCssTemplate(id: string, mode: ThemeMode): string {
  const dark = mode === "dark";
  return `:root[data-turber-theme="${id}"] {
  color-scheme: ${dark ? "dark" : "light"};
  --turber-bg: ${dark ? "#151515" : "#ffffff"};
  --turber-sidebar: ${dark ? "#111111" : "#fafafa"};
  --turber-bg-elevated: ${dark ? "#1a1a1a" : "#ffffff"};
  --turber-surface: ${dark ? "#212121" : "#ffffff"};
  --turber-surface-hover: ${dark ? "#2a2a2a" : "#f5f5f5"};
  --turber-border: ${dark ? "#2e2e2e" : "#e5e5e5"};
  --turber-fg: ${dark ? "#f0efec" : "#333333"};
  --turber-fg-muted: ${dark ? "#8c8a86" : "#666666"};
  --turber-accent: ${dark ? "#f0efec" : "#2563eb"};
  --turber-accent-2: ${dark ? "#b9b5ae" : "#1d4ed8"};
  --turber-accent-fg: ${dark ? "#111111" : "#ffffff"};
  --turber-field: ${dark ? "#20201f" : "#ffffff"};
  --turber-radius: 10px;
  --turber-shadow: 0 10px 26px rgba(0, 0, 0, ${dark ? "0.5" : "0.08"});
  --turber-opacity: 1;
}
`;
}
