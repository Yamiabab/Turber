import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";
import { useChatStore } from "../../core/store/useChatStore";

const toMetadata = (id: string, title: string, updatedAt: number) => ({
  remoteId: id,
  externalId: id,
  status: "regular" as const,
  title,
  lastMessageAt: new Date(updatedAt),
});

/**
 * 把 assistant-ui 的远端会话列表适配到本地 zustand + SQLite 会话仓库。
 * 约定：remoteId 与本地会话 id 完全一致，避免维护额外映射表。
 */
export const threadListAdapter: RemoteThreadListAdapter = {
  async list() {
    const sessions = useChatStore.getState().sessions;
    return {
      threads: sessions.map((session) => toMetadata(session.id, session.title, session.updatedAt)),
    };
  },
  async initialize(threadId) {
    const id = useChatStore.getState().createSession(threadId);
    return { remoteId: id, externalId: id };
  },
  async rename(remoteId, newTitle) {
    useChatStore.getState().renameSession(remoteId, newTitle);
  },
  async archive() {
    // 本地仓库不支持归档，保持常规状态
  },
  async unarchive() {
    // 同上
  },
  async delete(remoteId) {
    useChatStore.getState().deleteSession(remoteId);
  },
  async fetch(threadId) {
    const session = useChatStore.getState().sessions.find((item) => item.id === threadId);
    if (!session) throw new Error(`thread not found: ${threadId}`);
    return toMetadata(session.id, session.title, session.updatedAt);
  },
  async generateTitle() {
    // 标题由本地仓库在首条用户消息写入时生成，这里不重复生成
    return createAssistantStream(() => {});
  },
};
