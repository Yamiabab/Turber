import { isTauri } from "./themeEngine";

export type CssOverrideMap = Record<string, string>;

const STYLE_ATTR = "data-turber-css-file";
const STORAGE_KEY = "turber.css.overrides";

const styleId = (key: string) => `turber-css-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

/**
 * Injects every override as its own <style> node so the cascade behaves the
 * same way it would for the real source files (later files win).
 */
export function applyCssOverrides(map: CssOverrideMap): void {
  const nodes = Array.from(
    document.querySelectorAll<HTMLStyleElement>(`style[${STYLE_ATTR}]`),
  );
  for (const node of nodes) {
    const key = node.getAttribute(STYLE_ATTR);
    if (!key || !(key in map)) node.remove();
  }

  for (const [key, css] of Object.entries(map)) {
    if (!css.trim()) continue;
    const id = styleId(key);
    let element = document.getElementById(id) as HTMLStyleElement | null;
    if (!element) {
      element = document.createElement("style");
      element.id = id;
      element.setAttribute(STYLE_ATTR, key);
      document.head.appendChild(element);
    }
    if (element.textContent !== css) element.textContent = css;
  }
}

export async function loadCssOverrides(): Promise<CssOverrideMap> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const map = await invoke<CssOverrideMap>("load_css_overrides");
      if (map && typeof map === "object") return map;
    } catch (error) {
      console.warn("[css] load overrides failed", error);
    }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CssOverrideMap) : {};
  } catch {
    return {};
  }
}

export async function persistCssOverrides(map: CssOverrideMap): Promise<boolean> {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  if (!isTauri()) return true;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_css_overrides", { overrides: map });
    return true;
  } catch (error) {
    console.warn("[css] save overrides failed", error);
    return false;
  }
}

export function downloadCssText(css: string, filename: string): void {
  const blob = new Blob([css], { type: "text/css;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
