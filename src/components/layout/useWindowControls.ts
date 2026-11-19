import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Window control helpers for the custom (decorations: false) window.
 * All calls are no-ops outside of the Tauri runtime (e.g. plain `vite dev`),
 * so the UI stays usable in a browser tab.
 */
const currentWindow = () => {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
};

export const minimizeWindow = async () => {
  try {
    await currentWindow()?.minimize();
  } catch (error) {
    console.warn("[window] minimize failed", error);
  }
};

export const toggleMaximizeWindow = async () => {
  try {
    const win = currentWindow();
    if (!win) return;
    await win.toggleMaximize();
  } catch (error) {
    console.warn("[window] toggleMaximize failed", error);
  }
};

export const closeWindow = async () => {
  try {
    await currentWindow()?.close();
  } catch (error) {
    console.warn("[window] close failed", error);
  }
};
