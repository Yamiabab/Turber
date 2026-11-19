export type Role = "user" | "assistant" | "system" | "tool";

/** OpenAI 兼容的工具调用结构 */
export interface ToolCall {
  id: string;
  type?: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface MessagePart {
  type: "text" | "image";
  text?: string;
  /** dataURL */
  image?: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  /** 多模态内容（文字 + 图片），传给模型时优先使用 */
  parts?: MessagePart[];
  /** assistant 消息携带的工具调用请求 */
  toolCalls?: ToolCall[];
  /** role=tool 时对应的调用 id */
  toolCallId?: string;
  /** role=tool 时对应的工具名 */
  toolName?: string;
  /** 附加图片（dataURL），仅用于界面展示，不写入数据库 */
  images?: string[];
}

export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AppearanceState {
  theme: string;
  radius: number;
  fontSize: number;
  opacity: number;
  blur: number;
}
