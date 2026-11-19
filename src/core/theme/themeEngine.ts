import type { AppearanceState } from "../types";
import { isLightThemeResolved } from "../store/useThemeStore";

const STYLE_ID = "turber-user-css";
const CSS_KEY = "turber.user.css";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function applyTheme(theme: string): void {
  const root = document.documentElement;
  root.dataset.turberTheme = theme;
  root.classList.toggle("dark", !isLightThemeResolved(theme));
}

export function applyAppearance(state: AppearanceState): void {
  const style = document.documentElement.style;
  style.setProperty("--turber-radius", `${state.radius}px`);
  style.setProperty("--turber-radius-sm", `${Math.max(4, Math.round(state.radius * 0.65))}px`);
  style.setProperty("--turber-font-size", `${state.fontSize}px`);
  style.setProperty("--turber-opacity", state.opacity.toFixed(2));
  style.setProperty("--turber-blur", `${state.blur}px`);
}

export function resetAppearance(): void {
  const style = document.documentElement.style;
  ["--turber-radius", "--turber-radius-sm", "--turber-font-size", "--turber-opacity", "--turber-blur"].forEach((key) =>
    style.removeProperty(key),
  );
}

export function applyUserCss(css: string): void {
  let element = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!element) {
    element = document.createElement("style");
    element.id = STYLE_ID;
    document.head.appendChild(element);
  }
  element.textContent = css;
}

export async function loadUserCss(): Promise<string> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<string>("load_user_css");
    } catch {
      return localStorage.getItem(CSS_KEY) ?? "";
    }
  }
  return localStorage.getItem(CSS_KEY) ?? "";
}

export async function saveUserCss(css: string): Promise<boolean> {
  localStorage.setItem(CSS_KEY, css);
  if (!isTauri()) return true;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_user_css", { css });
    return true;
  } catch {
    return false;
  }
}

export function downloadCss(css: string, filename = "turber-theme.css"): void {
  const blob = new Blob([css], { type: "text/css;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const CSS_TEMPLATE = `:root {
  --turber-accent: #f0efec;
  --turber-radius: 10px;
}

.turber-message-assistant {
  backdrop-filter: blur(8px);
}
`;
