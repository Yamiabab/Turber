import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { diag } from "../diag";
import type { ChatMessage, ProviderConfig, ToolCall } from "../types";

export interface StreamResult {
  /** 本轮模型请求的工具调用（无则为空） */
  toolCalls?: ToolCall[];
}

export interface StreamHandlers {
  onDelta: (chunk: string) => void;
  onDone: (result?: StreamResult) => void;
  onError: (message: string) => void;
  /** 上游不支持原生 tools 协议、已降级为纯文本请求时触发 */
  onToolsDropped?: () => void;
}

/** 模型可用的工具定义（OpenAI function calling 结构） */
export type ToolSpec = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const EVENT_DELTA = "turber:chat:delta";
const EVENT_DONE = "turber:chat:done";
const EVENT_ERROR = "turber:chat:error";
const EVENT_TOOLS_DROPPED = "turber:chat:tools-dropped";

export const isDesktop = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const makeRequestId = (): string =>
  `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface WireMessage {
  role: string;
  content?: unknown;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

const toWire = (messages: ChatMessage[]): WireMessage[] =>
  messages
    .map((item): WireMessage => {
      if (item.role === "tool") {
        return {
          role: "tool",
          content: item.content,
          tool_call_id: item.toolCallId ?? "",
          name: item.toolName,
        };
      }
      if (item.role === "assistant" && item.toolCalls && item.toolCalls.length > 0) {
        return {
          role: "assistant",
          content: item.content ? item.content : null,
          tool_calls: item.toolCalls,
        };
      }
      if (item.parts && item.parts.length > 0) {
        return {
          role: item.role,
          content: item.parts.map((part) =>
            part.type === "image"
              ? { type: "image_url", image_url: { url: part.image ?? "" } }
              : { type: "text", text: part.text ?? "" },
          ),
        };
      }
      return { role: item.role, content: item.content };
    })
    .filter((item) => {
      if (item.role === "tool") return Boolean(item.tool_call_id);
      if (item.tool_calls && item.tool_calls.length > 0) return true;
      if (typeof item.content === "string") return item.content.trim().length > 0;
      return item.content != null;
    });

interface DesktopOptions {
  tools?: ToolSpec[];
}

/** 命令返回后给 DONE/ERROR 事件留出投递窗口，避免竞态把结果丢掉。 */
function waitForSettle(requestId: string): Promise<void> {
  diag(`desktop wait late event id=${requestId}`);
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 1500);
  });
}

async function streamFromDesktop(
  config: ProviderConfig,
  messages: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  options: DesktopOptions,
): Promise<void> {
  const requestId = makeRequestId();
  let settled = false;
  const unlisteners: UnlistenFn[] = [];
  diag(`desktop listen start id=${requestId} base=${config.baseUrl} model=${config.model}`);

  const release = () => {
    while (unlisteners.length > 0) {
      const off = unlisteners.pop();
      if (!off) continue;
      try {
        off();
      } catch {
        void 0;
      }
    }
  };

  const settle = (action: () => void) => {
    if (settled) return;
    settled = true;
    release();
    action();
  };

  unlisteners.push(
    await listen<{ requestId: string; delta: string }>(EVENT_DELTA, (event) => {
      if (event.payload.requestId !== requestId) return;
      handlers.onDelta(event.payload.delta);
    }),
    await listen<{ requestId: string; toolCalls?: ToolCall[] }>(EVENT_DONE, (event) => {
      if (event.payload.requestId !== requestId) return;
      const toolCalls = event.payload.toolCalls;
      settle(() =>
        handlers.onDone(toolCalls && toolCalls.length > 0 ? { toolCalls } : undefined),
      );
    }),
    await listen<{ requestId: string; message: string }>(EVENT_ERROR, (event) => {
      if (event.payload.requestId !== requestId) return;
      const { message } = event.payload;
      settle(() => handlers.onError(message));
    }),
    await listen<{ requestId: string }>(EVENT_TOOLS_DROPPED, (event) => {
      if (event.payload.requestId !== requestId) return;
      diag("desktop tools dropped -> text protocol");
      handlers.onToolsDropped?.();
    }),
  );

  const stop = () => {
    void invoke("cancel_chat", { requestId }).catch(() => undefined);
    settle(() => handlers.onDone());
  };

  signal.addEventListener("abort", stop, { once: true });
  diag(`desktop listen ready id=${requestId}`);

  try {
    await invoke("chat_stream", {
      request: {
        requestId,
        baseUrl: config.baseUrl.trim(),
        apiKey: config.apiKey,
        model: config.model.trim(),
        messages: toWire(messages),
        tools: options.tools && options.tools.length > 0 ? options.tools : undefined,
        toolChoice: options.tools && options.tools.length > 0 ? "auto" : undefined,
      },
    });
  } catch (error) {
    diag(`desktop invoke failed id=${requestId} err=${String(error)}`);
    const message = error instanceof Error ? error.message : String(error);
    settle(() => handlers.onError(message || "请求失败，请检查接口地址与网络。"));
    return;
  } finally {
    diag(`desktop invoke returned id=${requestId} settled=${settled}`);
    signal.removeEventListener("abort", stop);
  }

  // Rust 侧 emit(DONE/ERROR) 与命令返回是两路异步投递，事件可能晚于 invoke resolve 到达。
  // 若在这里立刻 release 监听，会丢掉最后一条事件、让调用方永远等不到结果（表现为界面什么都不返回）。
  if (!settled) await waitForSettle(requestId);
  if (!settled) {
    diag(`desktop stream missing done/error id=${requestId}`);
    settle(() => handlers.onError("请求已结束，但没有收到任何响应数据（连接可能被中断或模型服务无响应）。"));
  }
}

async function streamFromBrowser(
  config: ProviderConfig,
  messages: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  options: DesktopOptions,
): Promise<void> {
  const base = config.baseUrl.trim().replace(/\/+$/, "");
  if (!base) {
    handlers.onError("尚未填写接口地址，请到设置里配置模型服务。");
    return;
  }

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        stream: true,
        messages: toWire(messages),
        ...(options.tools && options.tools.length > 0
          ? { tools: options.tools, tool_choice: "auto" }
          : {}),
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      handlers.onError(`请求失败（${response.status}）${detail ? `：${detail.slice(0, 200)}` : ""}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const toolAcc: ToolCall[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          handlers.onDone(toolAcc.length > 0 ? { toolCalls: [...toolAcc] } : undefined);
          return;
        }
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  index?: number;
                  id?: string;
                  type?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
              message?: { content?: string };
            }>;
          };
          const choice = json.choices?.[0];
          const delta = choice?.delta?.content ?? choice?.message?.content;
          if (typeof delta === "string" && delta.length > 0) handlers.onDelta(delta);

          const calls = choice?.delta?.tool_calls;
          if (Array.isArray(calls)) {
            for (const call of calls) {
              const index = call.index ?? toolAcc.length;
              while (toolAcc.length <= index) {
                toolAcc.push({ id: "", type: "function", function: { name: "", arguments: "" } });
              }
              const slot = toolAcc[index];
              if (call.id) slot.id = call.id;
              if (call.type) slot.type = call.type;
              if (call.function?.name) slot.function.name += call.function.name;
              if (call.function?.arguments) slot.function.arguments += call.function.arguments;
            }
          }
        } catch {
          continue;
        }
      }
    }

    handlers.onDone(toolAcc.length > 0 ? { toolCalls: [...toolAcc] } : undefined);
  } catch (error) {
    const err = error as Error;
    if (err.name === "AbortError") {
      handlers.onDone();
      return;
    }
    handlers.onError(err.message || "网络异常，请检查接口地址与网络。");
  }
}

export async function streamChat(
  config: ProviderConfig,
  messages: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  options: { tools?: ToolSpec[] } = {},
): Promise<void> {
  if (isDesktop()) {
    await streamFromDesktop(config, messages, signal, handlers, options);
    return;
  }
  await streamFromBrowser(config, messages, signal, handlers, options);
}
