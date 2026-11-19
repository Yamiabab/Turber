import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ChatMessage, Session } from "../types";
import { isDesktop } from "../ai/chatClient";
import {
  loadSnapshot,
  persistMessage,
  persistMessageContent,
  persistSession,
  purgeRecords,
  removeSessionRecord,
} from "./chatRepository";

const makeId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const makeSession = (sessionId?: string): Session => {
  const now = Date.now();
  return { id: sessionId ?? makeId(), title: "新对话", messages: [], createdAt: now, updatedAt: now };
};

const writeTimers = new Map<string, ReturnType<typeof setTimeout>>();

const scheduleMessageWrite = (messageId: string, content: string) => {
  const running = writeTimers.get(messageId);
  if (running) clearTimeout(running);
  const timer = setTimeout(() => {
    writeTimers.delete(messageId);
    void persistMessageContent(messageId, content);
  }, 320);
  writeTimers.set(messageId, timer);
};

const browserStorage = createJSONStorage(() => ({
  getItem: (name: string) => (isDesktop() ? null : window.localStorage.getItem(name)),
  setItem: (name: string, value: string) => {
    if (!isDesktop()) window.localStorage.setItem(name, value);
  },
  removeItem: (name: string) => {
    if (!isDesktop()) window.localStorage.removeItem(name);
  },
}));

interface ChatState {
  sessions: Session[];
  activeId: string | null;
  streaming: boolean;
  streamingId: string | null;
  error: string | null;
  createSession: (id?: string) => string;
  selectSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  appendMessage: (sessionId: string, message: ChatMessage) => void;
  patchMessage: (sessionId: string, messageId: string, content: string) => void;
  patchMessageFields: (sessionId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  setStreaming: (value: boolean, sessionId?: string | null) => void;
  setError: (value: string | null) => void;
  flushWrites: () => void;
  clearAll: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeId: null,
      streaming: false,
      streamingId: null,
      error: null,
      createSession: (id) => {
        if (id) {
          const existing = get().sessions.find((item) => item.id === id);
          if (existing) return existing.id;
        }
        const session = makeSession(id);
        set((state) => ({ sessions: [session, ...state.sessions], activeId: session.id, error: null }));
        void persistSession(session);
        return session.id;
      },
      selectSession: (id) => set({ activeId: id, error: null }),
      renameSession: (id, title) => {
        set((state) => ({
          sessions: state.sessions.map((item) =>
            item.id === id ? { ...item, title: title.trim() || "新对话", updatedAt: Date.now() } : item,
          ),
        }));
        const updated = get().sessions.find((item) => item.id === id);
        if (updated) void persistSession(updated);
      },
      deleteSession: (id) => {
        set((state) => {
          const sessions = state.sessions.filter((item) => item.id !== id);
          const activeId = state.activeId === id ? (sessions[0]?.id ?? null) : state.activeId;
          return { sessions, activeId };
        });
        void removeSessionRecord(id);
      },
      appendMessage: (sessionId, message) => {
        set((state) => ({
          sessions: state.sessions.map((item) => {
            if (item.id !== sessionId) return item;
            const messages = [...item.messages, message];
            const title =
              item.messages.length === 0 && message.role === "user"
                ? message.content.slice(0, 18) || "新对话"
                : item.title;
            return { ...item, messages, title, updatedAt: Date.now() };
          }),
        }));
        const session = get().sessions.find((item) => item.id === sessionId);
        if (session) void persistSession(session);
        void persistMessage(sessionId, message);
      },
      patchMessage: (sessionId, messageId, content) => {
        set((state) => ({
          sessions: state.sessions.map((item) =>
            item.id === sessionId
              ? {
                  ...item,
                  messages: item.messages.map((msg) => (msg.id === messageId ? { ...msg, content } : msg)),
                  updatedAt: Date.now(),
                }
              : item,
          ),
        }));
        scheduleMessageWrite(messageId, content);
      },
      patchMessageFields: (sessionId, messageId, patch) => {
        set((state) => ({
          sessions: state.sessions.map((item) =>
            item.id === sessionId
              ? {
                  ...item,
                  messages: item.messages.map((msg) => (msg.id === messageId ? { ...msg, ...patch } : msg)),
                  updatedAt: Date.now(),
                }
              : item,
          ),
        }));
        if (typeof patch.content === "string") scheduleMessageWrite(messageId, patch.content);
      },
      setStreaming: (value, sessionId) => set({ streaming: value, streamingId: value ? (sessionId ?? get().streamingId) : null }),
      setError: (value) => set({ error: value }),
      /**
       * 立刻把 debounce 中待写的正文刷进 SQLite。
       * 流式结束、用户中止、窗口即将关闭时都必须调用，
       * 否则最后 320ms 内的增量（含整条短回复）会随进程退出一起丢失。
       */
      flushWrites: () => {
        const pending = [...writeTimers.entries()];
        writeTimers.clear();
        const sessions = get().sessions;
        for (const [messageId, timer] of pending) {
          clearTimeout(timer);
          const message = sessions
            .flatMap((item) => item.messages)
            .find((item) => item.id === messageId);
          if (message) void persistMessageContent(messageId, message.content);
        }
      },
      clearAll: () => {
        set({ sessions: [], activeId: null, error: null });
        void purgeRecords();
      },
    }),
    {
      name: "turber.chat",
      storage: browserStorage,
      partialize: (state) => ({ sessions: state.sessions, activeId: state.activeId }),
      onRehydrateStorage: () => (state) => {
        if (state && !state.activeId && state.sessions.length > 0) {
          state.activeId = state.sessions[0].id;
        }
      },
    },
  ),
);

export const activeSession = (state: ChatState): Session | null =>
  state.sessions.find((item) => item.id === state.activeId) ?? null;

export const ensureSession = (): string => {
  const store = useChatStore.getState();
  return store.activeId ?? store.createSession();
};

export async function hydrateChatStore(): Promise<void> {
  if (!isDesktop()) return;
  const stored = await loadSnapshot();
  const current = useChatStore.getState();

  if (stored.length > 0) {
    const activeId =
      current.activeId && stored.some((item) => item.id === current.activeId)
        ? current.activeId
        : stored[0].id;
    useChatStore.setState({ sessions: stored, activeId });
    return;
  }

  if (current.sessions.length === 0) return;

  for (const session of current.sessions) {
    await persistSession(session);
    for (const message of session.messages) {
      await persistMessage(session.id, message);
    }
  }
}
