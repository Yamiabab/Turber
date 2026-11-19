import {
  AssistantRuntimeProvider,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
  useRemoteThreadListRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { streamChat } from "../../core/ai/chatClient";
import {
  enterUserView,
  leaveUserView,
  setActiveAbort,
} from "../../core/ai/userViewController";
import {
  buildToolSpecs,
  executeUserViewTool,
  parseToolArguments,
} from "../../core/ai/userViewTools";
import {
  buildUserViewSystemPrompt,
  parseTextToolCalls,
  toTextProtocolHistory,
  type ToolProtocolMode,
} from "../../core/ai/userViewPrompt";
import { useChatStore } from "../../core/store/useChatStore";
import { useSettingsStore } from "../../core/store/useSettingsStore";
import { isApiUsable } from "../../lib/model";
import { canUseUserView, useControlStore } from "../../core/store/useControlStore";
import { useUserViewSession } from "../../core/store/useUserViewSession";
import type { ChatMessage, ToolCall } from "../../core/types";
import { threadListAdapter } from "./thread-list-adapter";
import { diag } from "../../core/diag";

const makeId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 工具调用数量（闭包内赋值后 TS 会收窄类型，这里统一走函数读取） */
const countCalls = (calls: ToolCall[] | undefined): number => calls?.length ?? 0;

/** 用户视角操控时的工具清单（提示词与原生 tools 共用同一份定义） */
const USER_VIEW_TOOL_SPECS = buildToolSpecs();

/** 一轮对话内最多允许的连续工具调用轮数，避免死循环 */
const MAX_TOOL_ROUNDS = 12;

/** 回传给模型的截图最多保留张数（只随请求发送，不落会话存储）。本地小模型上下文很小，1 张最新截图足够定位 */
const MAX_VISION_SNAPSHOTS = 1;

/** 回传给模型的历史消息上限：Ollama 默认上下文 4096，历史过长会把系统提示词前半段挤掉 */
const MAX_HISTORY_MESSAGES = 16;

/** 历史里的旧截图（base64）会让每轮请求体积暴涨、本地小模型 prefill 极慢，只留最后一张，其余替换为文字占位 */
const stripHistoryImages = (messages: ChatMessage[]): ChatMessage[] => {
  const out = messages.map((item) => ({ ...item }));
  let budget = MAX_VISION_SNAPSHOTS;
  for (let index = out.length - 1; index >= 0; index -= 1) {
    const parts = out[index].parts;
    if (!parts || !parts.some((part) => part.type === "image" && part.image)) continue;
    if (budget > 0) {
      budget -= 1;
      continue;
    }
    out[index] = {
      ...out[index],
      parts: parts.map((part) =>
        part.type === "image" ? { type: "text" as const, text: "[此前的截图已省略]" } : part,
      ),
      images: undefined,
    };
  }
  return out;
};

const trimHistory = (messages: ChatMessage[]): ChatMessage[] => {
  const kept =
    messages.length <= MAX_HISTORY_MESSAGES ? [...messages] : messages.slice(-MAX_HISTORY_MESSAGES);
  // 裁剪后开头若残留孤立的工具结果，会导致上游报“tool 消息缺少对应调用”，一并丢弃
  while (kept.length > 0 && kept[0].role === "tool") kept.shift();
  return stripHistoryImages(kept);
};

/** 模型无法识别图像时的固定回复文案（作为 AI 回复内容返回，而非前端拦截） */
const VISION_FAIL_MESSAGE = "请使用有图像识别的AI";

/** 附上底层错误摘要，避免只给一句笼统文案、真实原因被吞掉 */
const visionFailText = (reason: string): string =>
  reason ? `${VISION_FAIL_MESSAGE}（模型返回错误：${reason.slice(0, 160)}）` : VISION_FAIL_MESSAGE;

/** 模型只给空承诺却没动手时的提醒消息（每轮最多一次，仅在检测到空承诺时发送） */
const NUDGE_MESSAGE =
  "你上一条说了要动手，但这一轮没有发出任何工具调用。如果确实打算操作，现在就把调用发出来；如果只是想先说明情况，直接把你的话说完、给出结论也行。";

/** 「只承诺不动手」特征：短回复且命中未来时/安抚语 */
const EMPTY_PROMISE_PATTERN =
  /(请稍等|稍等片刻|马上|这就|正在处理|正在执行|我会帮|我来帮|我这就|我将为你|立即为您|开始处理|让我先看一下)/;

/** 判断这条回复是不是一句空承诺——只有空承诺才值得催，正常文字回答不打扰 */
const isBarePromise = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 200) return false;
  return EMPTY_PROMISE_PATTERN.test(trimmed);
};

const textOf = (content: readonly { type: string; text?: string }[]): string =>
  content
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("\n")
    .trim();

/** 空回复（只有工具调用、没有任何文字）不参与渲染，避免出现空白气泡或占位提示 */
const isBlankAssistant = (item: ChatMessage): boolean => {
  if (item.role !== "assistant") return false;
  if ((item.content ?? "").trim().length > 0) return false;
  return !item.parts?.some((part) => part.type === "image" && part.image);
};

/** UI 侧只展示 user / assistant，工具结果消息由界面提示代替 */
const visibleMessages = (messages: ChatMessage[]): ChatMessage[] =>
  messages.filter(
    (item) => item.role !== "tool" && item.role !== "system" && !isBlankAssistant(item),
  );

function useThreadRuntime() {
  const aui = useAui();
  const remoteId = useAuiState((state) => state.threadListItem.remoteId);
  const externalId = useAuiState((state) => state.threadListItem.externalId);
  const sessionId = remoteId ?? externalId ?? null;

  const sessions = useChatStore((state) => state.sessions);
  const streaming = useChatStore((state) => state.streaming);
  const streamingId = useChatStore((state) => state.streamingId);
  const provider = useSettingsStore((state) => state.provider);
  const abortRef = useRef<AbortController | null>(null);

  const messages = useMemo<ChatMessage[]>(() => {
    if (!sessionId) return [];
    const current = sessions.find((item) => item.id === sessionId);
    return current ? visibleMessages(current.messages) : [];
  }, [sessions, sessionId]);

  const convertMessage = useCallback((item: ChatMessage): ThreadMessageLike => {
    const role: "user" | "assistant" | "system" =
      item.role === "user" ? "user" : item.role === "system" ? "system" : "assistant";
    const hasImage = Boolean(item.parts?.some((part) => part.type === "image" && part.image));
    if (hasImage && item.parts) {
      return {
        id: item.id,
        role,
        content: item.parts.map((part) =>
          part.type === "image"
            ? { type: "image" as const, image: part.image ?? "" }
            : { type: "text" as const, text: part.text ?? "" },
        ),
        createdAt: new Date(item.createdAt),
      };
    }
    // 正文只放模型真正说的话：既不注入「调用工具」备注，也不放任何占位文案，
    // 保证复制出来的就是回答原文。
    const text = (item.content ?? "").trim();
    return {
      id: item.id,
      role,
      content: [{ type: "text" as const, text }],
      createdAt: new Date(item.createdAt),
    };
  }, []);

  return useExternalStoreRuntime({
    messages,
    convertMessage,
    isRunning: sessionId !== null && streaming && streamingId === sessionId,
    onNew: async (message) => {
      const text = textOf(message.content);
      diag(`onNew start text=${text.length}`);
      if (text.length === 0) return;

      // 没有任何可用模型接口时一律禁止发起对话：发送按钮已禁用，
      // 这里兜底 Enter 提交 / 建议芯片 / 重试等所有入口。
      const settings = useSettingsStore.getState();
      const activeApi =
        settings.apis.find((entry) => entry.id === settings.activeApiId) ??
        settings.apis[0];
      if (!isApiUsable(activeApi)) {
        diag(`onNew api unusable id=${activeApi?.id ?? "none"}`);
        useChatStore
          .getState()
          .setError(
            "尚未配置模型接口，无法发起对话。请先在控制面板的「AI 设置 · API 创建」中添加一条 API。",
          );
        return;
      }

      const store = useChatStore.getState();
      if (store.streaming) {
        diag("onNew blocked: already streaming");
        return;
      }

      let sid = sessionId;
      if (!sid) {
        try {
          sid = (await aui.threadListItem.initialize()).remoteId;
          diag(`onNew initialized sid=${sid ?? "null"}`);
        } catch (error) {
          diag(`onNew initialize failed: ${String(error)}`);
          return;
        }
      }
      const activeId = sid as string;

      const before = useChatStore.getState().sessions.find((item) => item.id === activeId);
      const isFirstMessage = (before?.messages.length ?? 0) === 0;
      const userMessage: ChatMessage = { id: makeId(), role: "user", content: text, createdAt: Date.now() };
      store.appendMessage(activeId, userMessage);
      if (isFirstMessage) {
        aui.threadListItem.rename(text.slice(0, 18) || "新对话");
      }
      store.setError(null);

      // —— 是否启用「AI 用户视角操控」——
      // 只看控制面板 / 输入框开关的四项前置条件，不再按会话弹窗询问
      const control = useControlStore.getState();
      const toolEnabled = control.userView && canUseUserView(control);

      const controller = new AbortController();
      abortRef.current = controller;
      setActiveAbort(controller);
      useChatStore.getState().setStreaming(true, activeId);
      diag(`onNew streaming=true sid=${activeId} toolEnabled=${toolEnabled}`);

      if (toolEnabled) {
        // 接管链路只是「体验层」：任何一步卡住都不能阻塞真正的对话请求
        await Promise.race([
          enterUserView()
            .then(() => diag("onNew enterUserView done"))
            .catch((error) => diag(`onNew enterUserView failed: ${String(error)}`)),
          new Promise<void>((resolve) => {
            setTimeout(() => {
              diag("onNew enterUserView timeout, continue chat");
              resolve();
            }, 3000);
          }),
        ]);
      }

      // 截图只回传给模型，不写入会话记录，避免本地存储被大图撑爆
      const visionHistory: ChatMessage[] = [];

      // 上游不支持原生 tools 时自动切换到文本工具协议
      let protocolMode: ToolProtocolMode = "native";

      // 本轮是否已经因为「只说话不动手」催过模型
      let nudged = false;
      // 催促消息只随请求发送，不写入会话记录
      const nudgeHistory: ChatMessage[] = [];

      try {
        const rounds = toolEnabled ? MAX_TOOL_ROUNDS : 1;
        for (let round = 0; round < rounds; round += 1) {
          if (controller.signal.aborted) break;

          const assistantMessage: ChatMessage = {
            id: makeId(),
            role: "assistant",
            content: "",
            createdAt: Date.now(),
          };
          useChatStore.getState().appendMessage(activeId, assistantMessage);

          const snapshot = useChatStore.getState().sessions.find((item) => item.id === activeId);
          const rawHistory = (snapshot ? snapshot.messages : []).filter(
            (item) =>
              item.id !== assistantMessage.id &&
              (item.content.trim().length > 0 ||
                (item.parts?.length ?? 0) > 0 ||
                (item.toolCalls?.length ?? 0) > 0 ||
                item.role === "tool"),
          );

          let buffer = "";
          let toolCalls: ToolCall[] | undefined;
          let failed = false;
          let lastError = "";
          let hasImageInput = false;

          // 最多两次尝试：原生 tools →（被拒则）文本协议重发
          for (let attempt = 0; attempt < 2; attempt += 1) {
            const useText = protocolMode === "text";
            const history: ChatMessage[] = toolEnabled
              ? [
                  {
                    id: "system-userview",
                    role: "system",
                    content: buildUserViewSystemPrompt(USER_VIEW_TOOL_SPECS, protocolMode),
                    createdAt: Date.now(),
                  },
                  ...(useText ? toTextProtocolHistory(trimHistory(rawHistory)) : trimHistory(rawHistory)),
                  ...nudgeHistory,
                  ...visionHistory,
                ]
              : rawHistory;

            hasImageInput = history.some((item) =>
              item.parts?.some((part) => part.type === "image" && part.image),
            );
            buffer = "";
            toolCalls = undefined;
            failed = false;
            let dropped = false;

            await streamChat(
              provider,
              history,
              controller.signal,
              {
                onDelta: (chunk) => {
                  buffer += chunk;
                  useChatStore.getState().patchMessage(activeId, assistantMessage.id, buffer);
                },
                onDone: (result) => {
                  toolCalls = result?.toolCalls;
                },
                onError: (reason) => {
                  failed = true;
                  lastError = reason;
                  diag(`onNew stream error: ${reason}`);
                  useChatStore.getState().setError(reason);
                },
                onToolsDropped: () => {
                  dropped = true;
                },
              },
              toolEnabled && !useText ? { tools: USER_VIEW_TOOL_SPECS } : {},
            );
            diag(
              `onNew streamChat returned round=${round} mode=${protocolMode} dropped=${dropped} buffer=${buffer.length} toolCalls=${countCalls(toolCalls)} aborted=${controller.signal.aborted}`,
            );

            if (controller.signal.aborted || failed) break;
            if (dropped && !useText && toolEnabled) {
              protocolMode = "text";
              useChatStore.getState().patchMessage(activeId, assistantMessage.id, "");
              useChatStore.getState().setError(null);
              continue;
            }
            break;
          }

          if (controller.signal.aborted) break;
          if (failed) {
            // 本轮请求中带图且模型报错：判定为模型无法识别图像，直接返回固定文案
            if (hasImageInput) {
              useChatStore.getState().patchMessage(
                activeId,
                assistantMessage.id,
                visionFailText(lastError),
              );
              useChatStore.getState().setError(null);
            } else {
              // 失败原因必须落到会话内容里，store.error 目前没有任何界面消费，只写进去等于什么都不提示
              const reason = lastError.trim() || "模型服务没有返回任何内容";
              useChatStore
                .getState()
                .patchMessage(
                  activeId,
                  assistantMessage.id,
                  buffer.trim().length > 0 ? `${buffer}\n\n（请求中断：${reason}）` : `请求失败：${reason}`,
                );
            }
            break;
          }
          if ((!toolCalls || toolCalls.length === 0) && toolEnabled) {
            // 文本协议兜底：模型把工具调用写进了正文
            const parsed = parseTextToolCalls(buffer, USER_VIEW_TOOL_SPECS);
            diag(
              `onNew text parse mode=${protocolMode} calls=${parsed.calls.length} head=${JSON.stringify(
                buffer.slice(0, 160),
              )}`,
            );
            if (parsed.calls.length > 0) {
              toolCalls = parsed.calls;
              buffer = parsed.cleaned;
              useChatStore.getState().patchMessage(activeId, assistantMessage.id, buffer);
            }
          }
          if (!toolCalls || toolCalls.length === 0) {
            // 带图请求但模型既无文本输出也不调用工具：同样按无法识别图像处理
            if (hasImageInput && buffer.trim().length === 0) {
              useChatStore.getState().patchMessage(
                activeId,
                assistantMessage.id,
                visionFailText(lastError),
              );
              useChatStore.getState().setError(null);
              break;
            }
            // 只有「说了要做却没动手」的空承诺才催一次；正常的文字回答直接接受，不打扰模型
            if (toolEnabled && !nudged && round + 1 < rounds && isBarePromise(buffer)) {
              nudged = true;
              diag(`onNew nudge bare-promise round=${round} mode=${protocolMode}`);
              nudgeHistory.push({
                id: `nudge-${makeId()}`,
                role: "user",
                content: NUDGE_MESSAGE,
                createdAt: Date.now(),
              });
              continue;
            }
            // 请求「成功」但一个字都没回来：不能留空白气泡，给出可见提示
            if (buffer.trim().length === 0) {
              useChatStore
                .getState()
                .patchMessage(activeId, assistantMessage.id, "（模型没有返回任何内容，请检查模型配置或稍后重试）");
            }
            break;
          }
          // 只调工具、没有任何文字时按空回复处理，不留占位、不展示「正在执行 xxx」
          const visibleText =
            toolCalls.length > 0 && isBarePromise(buffer) ? "" : buffer;
          useChatStore.getState().patchMessageFields(
            activeId,
            assistantMessage.id,
            protocolMode === "native"
              ? { toolCalls, content: visibleText }
              : { content: visibleText },
          );

          for (const call of toolCalls) {
            if (controller.signal.aborted) break;
            const name = call.function.name;
            useUserViewSession.getState().setBusy(true);

            const result = await executeUserViewTool({
              name,
              args: parseToolArguments(call.function.arguments),
            });

            useUserViewSession.getState().setBusy(false);
            useUserViewSession.getState().setLastAction(null);

            useChatStore.getState().appendMessage(activeId, {
              id: makeId(),
              role: "tool",
              content: result.content,
              createdAt: Date.now(),
              toolCallId: call.id || `call-${makeId()}`,
              toolName: name,
            });

            if (result.image) {
              visionHistory.push({
                id: makeId(),
                role: "user",
                content: "（当前桌面截图）",
                createdAt: Date.now(),
                parts: [
                  { type: "text", text: "这是当前桌面截图，请结合实际画面继续操作。" },
                  { type: "image", image: result.image },
                ],
                images: [result.image],
              });
              // 只保留最近若干张截图，控制上下文体积；模型仍可在后续轮次继续截图
              while (visionHistory.length > MAX_VISION_SNAPSHOTS) visionHistory.shift();
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        diag(`onNew threw: ${message}`);
        useChatStore.getState().setError(message);
        // 异常同样要变成可见回复，否则界面上只留一条空白气泡
        const messages = useChatStore.getState().sessions.find((item) => item.id === activeId)?.messages ?? [];
        const lastAssistant = [...messages].reverse().find((item) => item.role === "assistant");
        if (lastAssistant && lastAssistant.content.trim().length === 0) {
          useChatStore.getState().patchMessage(activeId, lastAssistant.id, `请求失败：${message}`);
        } else {
          useChatStore.getState().appendMessage(activeId, {
            id: makeId(),
            role: "assistant",
            content: `请求失败：${message}`,
            createdAt: Date.now(),
          });
        }
      } finally {
        useChatStore.getState().flushWrites();
        useChatStore.getState().setStreaming(false);
        setActiveAbort(null);
        abortRef.current = null;
        useUserViewSession.getState().setBusy(false);
        useUserViewSession.getState().setLastAction(null);
        if (toolEnabled) await leaveUserView();
      }
    },
    onCancel: async () => {
      abortRef.current?.abort();
      abortRef.current = null;
      setActiveAbort(null);
      useChatStore.getState().flushWrites();
      useChatStore.getState().setStreaming(false);
      await leaveUserView();
    },
  });
}

/** 应用级 runtime：assistant-ui 官方远端会话列表 + 本地线程 runtime。 */
export function useAppRuntime() {
  const initialThreadId = useRef(useChatStore.getState().activeId ?? undefined).current;

  return useRemoteThreadListRuntime({
    runtimeHook: useThreadRuntime,
    adapter: threadListAdapter,
    initialThreadId,
    onThreadIdChange: (threadId) => {
      if (!threadId) return;
      const store = useChatStore.getState();
      if (store.activeId === threadId) return;
      if (store.sessions.some((item) => item.id === threadId)) store.selectSession(threadId);
    },
  });
}

export function ChatRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useAppRuntime();
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
