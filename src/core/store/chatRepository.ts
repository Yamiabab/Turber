import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../ai/chatClient";
import type { ChatMessage, Session } from "../types";

interface SessionRow {
  id: string;
  title: string;
  provider: string;
  model: string;
  createdAt: number;
  updatedAt: number;
}

interface MessageRow {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  createdAt: number;
}

async function guard<T>(task: () => Promise<T>): Promise<T | null> {
  if (!isDesktop()) return null;
  try {
    return await task();
  } catch (error) {
    // 不再静默吞掉落盘失败，否则「对话没保存」在控制台完全没有线索
    console.error("[turber] 会话落盘失败", error);
    return null;
  }
}

export async function loadSnapshot(): Promise<Session[]> {
  const payload = await guard(async () => {
    const [sessions, messages] = await Promise.all([
      invoke<SessionRow[]>("list_sessions"),
      invoke<MessageRow[]>("list_all_messages"),
    ]);
    return { sessions, messages };
  });

  if (!payload) return [];

  const grouped = new Map<string, ChatMessage[]>();
  for (const row of payload.messages) {
    const bucket = grouped.get(row.sessionId) ?? [];
    bucket.push({
      id: row.id,
      role: row.role as ChatMessage["role"],
      content: row.content,
      createdAt: row.createdAt,
    });
    grouped.set(row.sessionId, bucket);
  }

  return payload.sessions
    .map((row) => ({
      id: row.id,
      title: row.title,
      messages: grouped.get(row.id) ?? [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function persistSession(session: Session, provider = "", model = ""): Promise<void> {
  await guard(() =>
    invoke("save_session", {
      session: {
        id: session.id,
        title: session.title,
        provider,
        model,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
    }),
  );
}

export async function persistMessage(sessionId: string, message: ChatMessage): Promise<void> {
  await guard(() =>
    invoke("save_message", {
      message: {
        id: message.id,
        sessionId,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      },
    }),
  );
}

export async function persistMessageContent(id: string, content: string): Promise<void> {
  await guard(() => invoke("update_message", { id, content }));
}

export async function removeSessionRecord(id: string): Promise<void> {
  await guard(() => invoke("delete_session", { id }));
}

export async function purgeRecords(): Promise<void> {
  await guard(() => invoke("clear_sessions"));
}
