import { create } from "zustand";

interface UserViewSessionState {
  /** 窗口是否处于隐藏（用户视角操控进行中） */
  windowHidden: boolean;
  /** 接管开始时的提示是否可见（英伟达录屏同款提示） */
  takeoverNotice: boolean;
  /** 是否正在执行工具调用 */
  busy: boolean;
  /** 最近一次工具动作描述 */
  lastAction: string | null;
  /** 紧急停止提示 */
  stopNotice: string | null;
  setWindowHidden: (value: boolean) => void;
  setTakeoverNotice: (value: boolean) => void;
  setBusy: (value: boolean) => void;
  setLastAction: (value: string | null) => void;
  setStopNotice: (value: string | null) => void;
}

export const useUserViewSession = create<UserViewSessionState>()((set) => ({
  windowHidden: false,
  takeoverNotice: false,
  busy: false,
  lastAction: null,
  stopNotice: null,
  setWindowHidden: (value) => set({ windowHidden: value }),
  setTakeoverNotice: (value) => set({ takeoverNotice: value }),
  setBusy: (value) => set({ busy: value }),
  setLastAction: (value) => set({ lastAction: value }),
  setStopNotice: (value) => set({ stopNotice: value }),
}));
