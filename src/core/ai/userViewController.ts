import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAipuStore } from "../store/useAipuStore";
import { useControlStore } from "../store/useControlStore";
import { useUserViewSession } from "../store/useUserViewSession";
import { useChatStore } from "../store/useChatStore";
import { isDesktop } from "./chatClient";
import { diag } from "../diag";

const EVENT_EMERGENCY_STOP = "turber:emergency-stop";

/**
 * 给接管链路的每个异步步骤加超时保护：
 * 任何一步（快捷键监听、悬浮窗创建、窗口隐藏）卡住都不能拖死整轮对话。
 */
async function withTimeout<T>(
  task: Promise<T>,
  ms: number,
  label: string,
): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      diag(`userview step timeout: ${label} (${ms}ms)`);
      resolve(undefined);
    }, ms);
  });
  try {
    return await Promise.race([task, timeout]);
  } catch (error) {
    diag(`userview step failed: ${label} ${String(error)}`);
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

let activeAbort: AbortController | null = null;
let watchStarted = false;
let unlisten: UnlistenFn | null = null;

export function setActiveAbort(controller: AbortController | null): void {
  activeAbort = controller;
}

export async function hideWindow(): Promise<void> {
  if (!isDesktop()) return;
  try {
    await getCurrentWindow().hide();
    useUserViewSession.getState().setWindowHidden(true);
  } catch {
    void 0;
  }
}

export async function showWindow(): Promise<void> {
  if (!isDesktop()) return;
  try {
    const win = getCurrentWindow();
    await win.show();
    await win.setFocus();
    useUserViewSession.getState().setWindowHidden(false);
  } catch {
    void 0;
  }
}

async function handleEmergencyStop(reason: string): Promise<void> {
  activeAbort?.abort();
  activeAbort = null;
  useChatStore.getState().setStreaming(false);
  // 紧急停止后同时关掉「AI 操作鼠标键盘」开关，避免下一句又被接管
  useControlStore.getState().setAiInputControl(false);
  useUserViewSession.getState().setBusy(false);
  useUserViewSession.getState().setLastAction(null);
  useUserViewSession.getState().setTakeoverNotice(false);
  useUserViewSession.getState().setStopNotice(
    reason || "已紧急停止 AI 用户视角操控（可通过设置修改快捷键）",
  );
  await showWindow();
}

/** 启动全局紧急停止监听（按当前设置的快捷键） */
export async function startEmergencyWatch(): Promise<void> {
  if (!isDesktop()) return;
  await stopEmergencyWatch();
  const hotkey = useAipuStore.getState().emergencyHotkey;
  diag(`emergency watch: listen hotkey=${hotkey}`);
  try {
    unlisten = await listen<string>(EVENT_EMERGENCY_STOP, () => {
      void handleEmergencyStop("已紧急停止 AI 用户视角操控");
    });
    diag("emergency watch: listen ready");
    await invoke("emergency_watch_start", { hotkey });
    diag("emergency watch: invoke done");
    watchStarted = true;
  } catch (error) {
    diag(`emergency watch failed: ${String(error)}`);
    watchStarted = false;
  }
}

export async function stopEmergencyWatch(): Promise<void> {
  if (unlisten) {
    try {
      unlisten();
    } catch {
      void 0;
    }
    unlisten = null;
  }
  if (watchStarted && isDesktop()) {
    try {
      await invoke("emergency_watch_stop");
    } catch {
      void 0;
    }
  }
  watchStarted = false;
}

/** 设置里改快捷键后重启监听 */
export async function restartEmergencyWatch(): Promise<void> {
  if (!watchStarted) return;
  await startEmergencyWatch();
}

/** 进入用户视角操控：启动急停监听并在主窗口内曝光接管提示，不自动隐藏窗口 */
export async function enterUserView(): Promise<void> {
  diag("enterUserView start");
  await withTimeout(startEmergencyWatch(), 1500, "startEmergencyWatch");
  diag("enterUserView: emergency watch settled");
  useUserViewSession.getState().setTakeoverNotice(true);
  diag("enterUserView done (window kept visible)");
}

/** 一轮任务结束后回到用户可见状态（窗口默认保持可见，仅在被隐藏时恢复） */
export async function leaveUserView(): Promise<void> {
  await withTimeout(stopEmergencyWatch(), 1500, "stopEmergencyWatch");
  useUserViewSession.getState().setTakeoverNotice(false);
  if (useUserViewSession.getState().windowHidden) {
    await withTimeout(showWindow(), 1500, "showWindow");
  }
}
