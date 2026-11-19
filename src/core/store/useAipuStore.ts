import { create } from "zustand";
import { persist } from "zustand/middleware";

/** AIPU 黑名单条目类型：网站 / 应用 */
export type AipuTargetKind = "site" | "app";

export interface AipuTarget {
  id: string;
  kind: AipuTargetKind;
  /** 网站为域名（如 example.com），应用为名称或进程名（如 chrome.exe / WeChat） */
  value: string;
  createdAt: number;
}

/** 默认紧急停止热键：双击 Alt */
export const DEFAULT_EMERGENCY_HOTKEY = "double:alt";

const makeId = (): string => `aipu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

interface AipuState {
  targets: AipuTarget[];
  /** 紧急停止热键：double:alt / double:ctrl / double:shift / combo:ctrl+shift+q */
  emergencyHotkey: string;
  addTarget: (kind: AipuTargetKind, value: string) => void;
  removeTarget: (id: string) => void;
  clearTargets: () => void;
  setEmergencyHotkey: (value: string) => void;
}

const normalize = (value: string): string => value.trim().toLowerCase();

export const useAipuStore = create<AipuState>()(
  persist(
    (set, get) => ({
      targets: [],
      emergencyHotkey: DEFAULT_EMERGENCY_HOTKEY,
      addTarget: (kind, value) => {
        const clean = normalize(value);
        if (!clean) return;
        const existing = get().targets;
        if (existing.some((item) => item.kind === kind && item.value === clean)) return;
        set({
          targets: [...existing, { id: makeId(), kind, value: clean, createdAt: Date.now() }],
        });
      },
      removeTarget: (id) => set({ targets: get().targets.filter((item) => item.id !== id) }),
      clearTargets: () => set({ targets: [] }),
      setEmergencyHotkey: (value) => set({ emergencyHotkey: normalize(value) || DEFAULT_EMERGENCY_HOTKEY }),
    }),
    {
      name: "turber.aipu",
      partialize: (state) => ({
        targets: state.targets,
        emergencyHotkey: state.emergencyHotkey,
      }),
    },
  ),
);

export const listTargets = (kind: AipuTargetKind): string[] =>
  useAipuStore
    .getState()
    .targets.filter((item) => item.kind === kind)
    .map((item) => item.value);
