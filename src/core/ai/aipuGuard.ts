import { invoke } from "@tauri-apps/api/core";
import { listTargets } from "../store/useAipuStore";
import { useControlStore } from "../store/useControlStore";
import { isDesktop } from "./chatClient";

/** AIPU 拦截时回给 AI 的固定文案：用中文写清「为什么不行 + 下一步怎么做」，避免模型自行脑补成「系统安全策略限制」 */
export const AIPU_DENY_MESSAGE =
  "操作被 AIPU 拦截：AIPU 总开关未开启，或前台窗口位于黑名单。请让用户在控制面板开启 AIPU（AI 行为总开关）后重试。";

/** 前台是本应用时给模型的提示：只影响截图，不影响鼠标与键盘 */
export const SELF_WINDOW_NOTICE =
  "当前前台是 Turber 客户端自己，截图里只有对话窗口，看不到用户要操作的程序。请先点击目标窗口把它切到前台，再重新截图；如果拿不到目标窗口位置，可以先让用户把目标窗口点一下。";

export interface ForegroundInfo {
  process: string;
  title: string;
  isSelf: boolean;
  handle: string;
}

const EMPTY_FOREGROUND: ForegroundInfo = {
  process: "",
  title: "",
  isSelf: false,
  handle: "0",
};

let cachedForeground: { value: ForegroundInfo; at: number } | null = null;

/** 读取前台窗口信息（300ms 内复用缓存，避免连续工具调用反复查询） */
export async function readForeground(force = false): Promise<ForegroundInfo> {
  if (!isDesktop()) return EMPTY_FOREGROUND;
  const now = Date.now();
  if (!force && cachedForeground && now - cachedForeground.at < 300) {
    return cachedForeground.value;
  }
  try {
    const info = await invoke<ForegroundInfo>("screen_foreground");
    const value: ForegroundInfo = {
      process: (info?.process ?? "").toLowerCase(),
      title: info?.title ?? "",
      isSelf: Boolean(info?.isSelf),
      handle: info?.handle ?? "0",
    };
    cachedForeground = { value, at: now };
    return value;
  } catch {
    return EMPTY_FOREGROUND;
  }
}

export function invalidateForeground(): void {
  cachedForeground = null;
}

/** 把 URL / 域名归一化为可比较的 host + 完整串 */
export function siteKey(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value) return "";
  const withoutScheme = value.replace(/^[a-z]+:\/\//, "");
  const host = withoutScheme.split(/[/?#]/)[0].replace(/^www\./, "").replace(/:\d+$/, "");
  return host;
}

export function siteBlocked(raw: string): boolean {
  const host = siteKey(raw);
  if (!host) return false;
  for (const rule of listTargets("site")) {
    const key = siteKey(rule);
    if (!key) continue;
    if (host === key || host.endsWith(`.${key}`) || key.endsWith(`.${host}`)) return true;
  }
  return false;
}

export function appBlocked(name: string): boolean {
  const value = name.trim().toLowerCase();
  if (!value) return false;
  const base = value.split(/[\\/]/).pop() ?? value;
  for (const rule of listTargets("app")) {
    const key = rule.trim().toLowerCase();
    if (!key) continue;
    const bareKey = key.endsWith(".exe") ? key.slice(0, -4) : key;
    const bareBase = base.endsWith(".exe") ? base.slice(0, -4) : base;
    if (base === key || base.includes(key) || bareBase.includes(bareKey)) return true;
  }
  return false;
}

export type AipuBlockReason = "self-window" | "blocked-app" | "blocked-site";

export interface AipuVerdict {
  blocked: boolean;
  reason?: AipuBlockReason;
  /** 供 UI / 日志展示的中文说明 */
  detail?: string;
}

export interface JudgeOptions {
  /**
   * 是否允许「前台是本应用」。
   * 用户就是在 Turber 窗口里下达指令，前台必然是自己；
   * 若因此把鼠标/键盘工具一票否决，AI 连第一步都迈不出去（死锁）。
   * 因此：观察类工具（截图）不放行，操作类工具放行。
   */
  allowSelf?: boolean;
}

/** 判定「当前前台窗口」是否允许 AI 观察或操作 */
export function judgeForeground(info: ForegroundInfo, options?: JudgeOptions): AipuVerdict {
  if (info.isSelf && !options?.allowSelf) {
    return { blocked: true, reason: "self-window", detail: "AI 无法访问 Turber 客户端窗口" };
  }
  if (appBlocked(info.process)) {
    return { blocked: true, reason: "blocked-app", detail: `前台应用 ${info.process} 位于 AIPU 黑名单` };
  }
  if (info.title && appBlocked(info.title)) {
    return { blocked: true, reason: "blocked-app", detail: `前台窗口「${info.title}」位于 AIPU 黑名单` };
  }
  if (info.title && siteBlocked(info.title)) {
    return { blocked: true, reason: "blocked-site", detail: `前台窗口标题命中黑名单站点：${info.title}` };
  }
  return { blocked: false };
}

/** 判定目标 URL 是否允许 AI 访问 */
export function judgeTarget(raw: string | undefined): AipuVerdict {
  if (!raw) return { blocked: false };
  if (siteBlocked(raw)) {
    return { blocked: true, reason: "blocked-site", detail: `目标地址 ${raw} 位于 AIPU 黑名单` };
  }
  return { blocked: false };
}

/** AIPU 是否生效：以控制面板总开关为准 */
export function aipuEnabled(): boolean {
  return useControlStore.getState().aipu;
}
