import { streamChat, type StreamHandlers } from "../core/ai/chatClient";
import { useSettingsStore } from "../core/store/useSettingsStore";
import type { ChatMessage } from "../core/types";

export interface ApiOption {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

const makeId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const listApis = (): ApiOption[] => {
  const state = useSettingsStore.getState();
  return state.apis.map((entry) => ({
    id: entry.id,
    name: entry.name,
    baseUrl: entry.baseUrl,
    model: entry.model,
    apiKey: entry.apiKey,
  }));
};

export const activeApi = (): ApiOption | null => {
  const state = useSettingsStore.getState();
  const entry = state.apis.find((item) => item.id === state.activeApiId) ?? state.apis[0];
  if (!entry) return null;
  return {
    id: entry.id,
    name: entry.name,
    baseUrl: entry.baseUrl,
    model: entry.model,
    apiKey: entry.apiKey,
  };
};

export const selectApi = (id: string): void => {
  useSettingsStore.getState().selectApi(id);
};

export const saveApi = (
  id: string,
  patch: { baseUrl: string; model: string; apiKey: string },
): void => {
  const state = useSettingsStore.getState();
  const target = state.apis.find((item) => item.id === id);
  if (target) {
    state.updateApi(id, patch);
    state.selectApi(id);
    return;
  }
  state.createApi({
    name: patch.model || "自定义 API",
    baseUrl: patch.baseUrl,
    model: patch.model,
    apiKey: patch.apiKey,
  });
};

export const apiReady = (): boolean => {
  const api = activeApi();
  return Boolean(api && api.baseUrl.trim() && api.model.trim());
};

export async function chatStream(
  history: HistoryTurn[],
  signal: AbortSignal,
  handlers: StreamHandlers,
): Promise<void> {
  const provider = useSettingsStore.getState().provider;
  const messages: ChatMessage[] = history.map((turn) => ({
    id: makeId(),
    role: turn.role,
    content: turn.content,
    createdAt: Date.now(),
  }));
  await streamChat(provider, messages, signal, handlers);
}
