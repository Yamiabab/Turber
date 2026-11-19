import { useMemo } from "react";

import { useSettingsStore } from "../core/store/useSettingsStore";

export type ModelOption = {
  id: string;
  name: string;
  description?: string;
};

export const DEFAULT_MODEL_ID = "turber-default";

/**
 * 输入框旁的模型列表直接映射「AI 设置 · API 创建」里的 API 列表，
 * 两处共用同一份数据（useSettingsStore.apis），不再有硬编码模型。
 * 列表项的 id 即 ApiEntry.id，选中项即 activeApiId。
 */
export function useDocsModelOptions(): readonly ModelOption[] {
  const apis = useSettingsStore((state) => state.apis);
  return useMemo(
    () =>
      apis.map((entry) => ({
        id: entry.id,
        name: entry.name || entry.model || entry.baseUrl || "API",
        description: entry.model || entry.baseUrl || undefined,
      })),
    [apis],
  );
}

/** 当前 API 是否可真正发起对话：必须有接口地址与模型名。 */
export function isApiUsable(
  entry: { baseUrl?: string; model?: string } | undefined,
): boolean {
  return Boolean(entry && entry.baseUrl?.trim() && entry.model?.trim());
}

/**
 * 是否存在可用模型。为 false 时禁止发起对话（发送按钮禁用 + 运行时拦截）。
 */
export function useHasUsableModel(): boolean {
  const apis = useSettingsStore((state) => state.apis);
  const activeApiId = useSettingsStore((state) => state.activeApiId);
  return useMemo(() => {
    const active = apis.find((entry) => entry.id === activeApiId) ?? apis[0];
    return isApiUsable(active);
  }, [apis, activeApiId]);
}
