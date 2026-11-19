import { create } from "zustand";
import { persist } from "zustand/middleware";

/** AI Agent 鼠标使用权限 */
export type MousePermission = "none" | "system";

export interface ControlState {
  /** AIPU：AI 行为总开关，关闭后控制面板内其余选项均不可用 */
  aipu: boolean;
  /** AMO：允许 AI 自主操控电脑 */
  amo: boolean;
  /** 鼠标使用权限：无 / 全系统 */
  mouse: MousePermission;
  /** AI 截取桌面（位于「AI 图像识别」） */
  captureDesktop: boolean;
  /** AI 用户视角操作（依赖 AI 截取桌面） */
  userView: boolean;
}

export const DEFAULT_CONTROL_STATE: ControlState = {
  aipu: false,
  amo: false,
  mouse: "none",
  captureDesktop: false,
  userView: false,
};

/** 用户视角操作的可用条件：AIPU → AMO → 鼠标全系统 → AI 截取桌面 */
export function canUseUserView(state: ControlState): boolean {
  return state.aipu && state.amo && state.mouse === "system" && state.captureDesktop;
}

interface ControlStore extends ControlState {
  setAipu: (value: boolean) => void;
  setAmo: (value: boolean) => void;
  setMouse: (value: MousePermission) => void;
  setCaptureDesktop: (value: boolean) => void;
  setUserView: (value: boolean) => void;
  /** 输入框旁的一键开关：开启时补齐 AIPU / AMO / 鼠标全系统 / 截取桌面 / 用户视角，关闭时仅关用户视角 */
  setAiInputControl: (value: boolean) => void;
  resetControl: () => void;
}

export const useControlStore = create<ControlStore>()(
  persist(
    (set, get) => {
      /** 写入后统一收敛依赖关系：AIPU 为总开关，关闭时其余选项全部归零 */
      const commit = (patch: Partial<ControlState>) => {
        const next: ControlState = { ...get(), ...patch };
        if (!next.aipu) {
          next.amo = false;
          next.mouse = "none";
          next.captureDesktop = false;
          next.userView = false;
        }
        // AMO 关闭后，鼠标权限回落为「无」
        if (!next.amo) {
          next.mouse = "none";
        }
        if (next.userView && !canUseUserView(next)) {
          next.userView = false;
        }
        set({
          aipu: next.aipu,
          amo: next.amo,
          mouse: next.mouse,
          captureDesktop: next.captureDesktop,
          userView: next.userView,
        });
      };

      return {
        ...DEFAULT_CONTROL_STATE,
        setAipu: (value) => commit({ aipu: value }),
        setAmo: (value) => commit({ amo: value }),
        setMouse: (value) => commit({ mouse: value }),
        setCaptureDesktop: (value) => commit({ captureDesktop: value }),
        setUserView: (value) => {
          const state = get();
          if (value && !canUseUserView(state)) return;
          set({ userView: value });
        },
        setAiInputControl: (value) => {
          if (!value) {
            set({ userView: false });
            return;
          }
          // 逐项补齐前置条件：AIPU 是总开关，必须在其余项之前置位
          commit({ aipu: true });
          commit({ amo: true });
          commit({ mouse: "system" });
          commit({ captureDesktop: true });
          commit({ userView: true });
        },
        resetControl: () => set({ ...DEFAULT_CONTROL_STATE }),
      };
    },
    {
      name: "turber.control",
      partialize: (state) => ({
        aipu: state.aipu,
        amo: state.amo,
        mouse: state.mouse,
        captureDesktop: state.captureDesktop,
        userView: state.userView,
      }),
    },
  ),
);
