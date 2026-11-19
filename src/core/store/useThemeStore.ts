import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  BUILTIN_THEMES,
  findTheme,
  isLockedTheme,
  isLightTheme as isLightThemeIn,
  makeCustomThemeId,
  themeSwatch,
  type ThemeMode,
  type ThemePreset,
} from "../theme/themes";

/**
 * 自建主题只保存元数据，主题 CSS 与其它样式覆盖一起走
 * cssOverrides（键 = styles/themes/<id>.css），避免两套存储重复。
 */
interface ThemeState {
  customThemes: ThemePreset[];
  addTheme: (name: string, mode: ThemeMode) => ThemePreset;
  renameTheme: (id: string, name: string) => void;
  removeTheme: (id: string) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      customThemes: [],
      addTheme: (name, mode) => {
        const taken = [...BUILTIN_THEMES.map((theme) => theme.id), ...get().customThemes.map((theme) => theme.id)];
        const id = makeCustomThemeId(name, taken);
        const label = name.trim() || id;
        const preset: ThemePreset = {
          id,
          name: label,
          desc: mode === "light" ? "#ffffff / #e5e5e5 自建浅色" : "#151515 / #2e2e2e 自建深色",
          swatch: themeSwatch(mode),
          mode,
          custom: true,
        };
        set((state) => ({ customThemes: [...state.customThemes, preset] }));
        return preset;
      },
      renameTheme: (id, name) =>
        set((state) => ({
          customThemes: state.customThemes.map((theme) => (theme.id === id ? { ...theme, name: name.trim() || theme.name } : theme)),
        })),
      removeTheme: (id) => {
        if (isLockedTheme(id)) return;
        set((state) => ({ customThemes: state.customThemes.filter((theme) => theme.id !== id) }));
      },
    }),
    { name: "turber.themes" },
  ),
);

/** 内置 + 自建，React 外可直接读快照。 */
export function allThemesSnapshot(): ThemePreset[] {
  return [...BUILTIN_THEMES, ...useThemeStore.getState().customThemes];
}

export function isLightThemeResolved(id: string): boolean {
  return isLightThemeIn(id, allThemesSnapshot());
}

export function findThemeResolved(id: string): ThemePreset | undefined {
  return findTheme(id, allThemesSnapshot());
}
