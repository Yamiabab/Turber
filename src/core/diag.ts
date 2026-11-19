import { invoke } from "@tauri-apps/api/core";

/**
 * 前端诊断打点：写入 Rust 侧统一的诊断文件（%TEMP%\turber-diag.log）。
 * 纯调试用途，任何异常都不应影响主流程。
 */
export function diag(msg: string): void {
  try {
    void Promise.resolve(invoke("diag_log", { msg })).catch(() => undefined);
  } catch {
    void 0;
  }
}
