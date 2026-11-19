import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_PROVIDER, PROVIDER_PRESETS } from "../ai/providers";
import { DEFAULT_LANGUAGE, type Language } from "../i18n/messages";
import type { AppearanceState, ProviderConfig } from "../types";

/** 一条可被用户创建 / 编辑的 API 配置（OpenAI 兼容协议）。 */
export interface ApiEntry {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  createdAt: number;
}

export interface ApiDraft {
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** 初次启动时的预置 API 列表（全部可直接改密钥后使用）。 */
const PRESET_APIS: ApiEntry[] = PROVIDER_PRESETS.filter((preset) => preset.id !== "custom").map(
  (preset) => ({
    id: preset.id,
    name: preset.name,
    baseUrl: preset.baseUrl,
    model: preset.model,
    apiKey: "",
    createdAt: 0,
  }),
);

function apiToProvider(entry: ApiEntry): ProviderConfig {
  return {
    id: entry.id,
    name: entry.name,
    baseUrl: entry.baseUrl,
    apiKey: entry.apiKey,
    model: entry.model,
  };
}

interface SettingsState {
  provider: ProviderConfig;
  apis: ApiEntry[];
  activeApiId: string | null;
  appearance: AppearanceState;
  language: Language;
  userCss: string;
  settingsOpen: boolean;
  controlPanelOpen: boolean;
  savedCss: boolean;
  setProvider: (patch: Partial<ProviderConfig>) => void;
  /** 新建一条 API，并立即设为当前使用。 */
  createApi: (draft: ApiDraft) => string;
  /** 编辑已有 API；若是当前使用项则同步到 provider。 */
  updateApi: (id: string, patch: Partial<ApiDraft>) => void;
  /** 删除 API；删除当前使用项时回退到默认配置。 */
  removeApi: (id: string) => void;
  /** 切换当前使用的 API。 */
  selectApi: (id: string) => void;
  setAppearance: (patch: Partial<AppearanceState>) => void;
  setLanguage: (language: Language) => void;
  setUserCss: (css: string) => void;
  setSettingsOpen: (open: boolean) => void;
  setControlPanelOpen: (open: boolean) => void;
  markCssSaved: (saved: boolean) => void;
  resetAppearance: () => void;
}

const DEFAULT_APPEARANCE: AppearanceState = {
  theme: "next-dark",
  radius: 10,
  fontSize: 14,
  opacity: 1,
  blur: 12,
};

function uniqueApiId(existing: ApiEntry[]): string {
  let id = "";
  do {
    id = `api_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  } while (existing.some((entry) => entry.id === id));
  return id;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      provider: DEFAULT_PROVIDER,
      apis: PRESET_APIS,
      activeApiId: PRESET_APIS[0]?.id ?? null,
      appearance: DEFAULT_APPEARANCE,
      language: DEFAULT_LANGUAGE,
      userCss: "",
      settingsOpen: false,
      controlPanelOpen: false,
      savedCss: true,
      setProvider: (patch) => set((state) => ({ provider: { ...state.provider, ...patch } })),

      createApi: (draft) => {
        const entry: ApiEntry = {
          id: uniqueApiId(get().apis),
          name: draft.name.trim() || draft.model.trim() || "自定义 API",
          baseUrl: draft.baseUrl.trim(),
          model: draft.model.trim(),
          apiKey: draft.apiKey.trim(),
          createdAt: Date.now(),
        };
        set((state) => ({
          apis: [...state.apis, entry],
          activeApiId: entry.id,
          provider: apiToProvider(entry),
        }));
        return entry.id;
      },

      updateApi: (id, patch) =>
        set((state) => {
          const apis = state.apis.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  ...(patch.name === undefined ? {} : { name: patch.name.trim() || entry.name }),
                  ...(patch.baseUrl === undefined ? {} : { baseUrl: patch.baseUrl.trim() }),
                  ...(patch.model === undefined ? {} : { model: patch.model.trim() }),
                  ...(patch.apiKey === undefined ? {} : { apiKey: patch.apiKey.trim() }),
                }
              : entry,
          );
          const active = apis.find((entry) => entry.id === state.activeApiId);
          return { apis, provider: active ? apiToProvider(active) : state.provider };
        }),

      removeApi: (id) =>
        set((state) => {
          const apis = state.apis.filter((entry) => entry.id !== id);
          if (state.activeApiId !== id) return { apis };
          const next = apis[0] ?? null;
          return {
            apis,
            activeApiId: next ? next.id : null,
            provider: next ? apiToProvider(next) : DEFAULT_PROVIDER,
          };
        }),

      selectApi: (id) =>
        set((state) => {
          const entry = state.apis.find((item) => item.id === id);
          if (!entry) return {};
          return { activeApiId: entry.id, provider: apiToProvider(entry) };
        }),

      setAppearance: (patch) => set((state) => ({ appearance: { ...state.appearance, ...patch } })),
      setLanguage: (language) => {
        set({ language });
        if (typeof document !== "undefined") {
          document.documentElement.lang = language;
          document.documentElement.dataset.language = language;
        }
      },
      setUserCss: (css) => set({ userCss: css, savedCss: false }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      setControlPanelOpen: (open) => set({ controlPanelOpen: open }),
      markCssSaved: (saved) => set({ savedCss: saved }),
      resetAppearance: () => set({ appearance: DEFAULT_APPEARANCE }),
    }),
    {
      name: "turber.settings",
      partialize: (state) => ({
        provider: state.provider,
        apis: state.apis,
        activeApiId: state.activeApiId,
        appearance: state.appearance,
        language: state.language,
        userCss: state.userCss,
      }),
    },
  ),
);
