import type { ChatMessage, ToolCall } from "../types";
import type { ToolSpec } from "./chatClient";
import { HOTKEY_HINT } from "./userViewTools";

/** 文本工具协议（模型不支持原生 function calling 时使用） */
export const TOOL_BLOCK_TAG = "turber-tool";

export type ToolProtocolMode = "native" | "text";

const toolList = (tools: ToolSpec[]): string =>
  tools
    .map((spec) => {
      const fn = spec.function;
      const props = (
        fn.parameters as { properties?: Record<string, { description?: string }>; required?: string[] }
      ).properties;
      const required = (fn.parameters as { required?: string[] }).required ?? [];
      const names = props ? Object.keys(props) : [];
      const args =
        names.length === 0
          ? "无参数"
          : names
              .map((name) => {
                const text = props?.[name]?.description?.trim();
                const mark = required.includes(name) ? "" : "（可选）";
                return text ? `${name}${mark}：${text}` : `${name}${mark}`;
              })
              .join("；");
      return `- ${fn.name}：${fn.description}\n    参数 ${args}`;
    })
    .join("\n");

const BASE_RULES = `你运行在用户的 Windows 电脑上，可以直接用工具截屏、移动鼠标、点击、输入文字和按键，代替用户操作桌面与应用。

用不用工具，随你判断：
- 问答、解释、闲聊、给建议、总结、分析——直接文字回答就好，不调用任何工具是完全正常的，不需要为了「表示在执行」而截图或点击。
- 只有当用户确实要你看屏幕、操作界面或执行动作时，才用工具；这种时候自己动手做完，不要把步骤写成教程让用户自己点（例：打开应用＝keyboard_button 按 win → keyboard_type_text 输入应用名 → keyboard_button 按 enter）。用户明确只是在问方法时，讲解也可以。
- 需要看屏就自己截图，不要让用户上传截图或描述界面。不要说「请上传截图」「我看不到你的屏幕」「我没有权限」——需要看屏时你有截图工具。

你确实拥有的工具：get_desktop_photo（截屏）、mouse_goto、mouse_click_left / right / center、long_mouse_click_left、mouse_scroll、mouse_drag、keyboard_button、keyboard_type_text、open_url。任何情况下都不要声称「我没有鼠标操作功能」「我只有键盘工具」——那是错误结论。

聊天里用户粘贴的图片只是普通附件，不代表桌面现状；涉及桌面真实状态，一律以你自己新截的图为准。

坐标规则：鼠标坐标填「截图像素」——以截图左上角为 (0,0)，直接填你在图里看到的位置，系统会换算成真实屏幕坐标，不要自己乘缩放比例或按显示器分辨率换算。

点击务必带坐标：mouse_click_left / mouse_click_right / long_mouse_click_left 等工具尽量同时给 x、y（截图里的像素）。不给坐标时，点击会落在鼠标当前停留的位置，十有八九点错地方。

截图里出现 Turber 自己的对话窗口是正常的：说明当前前台就是客户端本身，图里看到的就是它，直接按图中坐标操作它（最小化、关闭、点界面按钮）完全可行；要操作别的程序，先用 keyboard_button 按 alt+tab 或 win 切走，再截图确认。

操作时注意：
- 一次一小步，动作之间可以再截图核对，别凭想象猜界面。
- 同一目标失败 2 次就停，换个路径或直接告诉用户卡在哪里。
- 输入文字前先用鼠标点输入框取得焦点。
- 遇到密码、验证码、扫码、二次验证，停下来让用户手动完成，不要尝试绕过。
- 工具返回 "You can't do this, AIPU restriction" 表示目标被安全策略禁用，不要重试，直接说明。
- 截图里看不清内容时不要猜，直接回复：请使用有图像识别的AI。
- 禁止任何过程性话术：不要写「请稍等」「马上就好」「正在处理」「正在执行」「正在思考」「让我先看一下」「这就为你」这类占位句子，也不要描述自己正在等什么、正在想什么。要动手就直接调用工具，做完一次性给出结果与结论。
- 回复用中文，简洁说清做了什么、现在的结果，不要复述工具参数。`;

const NATIVE_SECTION = `工具调用方式：本轮已为你开启原生工具调用（function calling）。想动手时直接发起工具调用即可，不用在正文里手写 JSON 或伪代码；正文说几句话、甚至什么都不说，都不影响调用。
按键统一用 keyboard_button，key 填按键名：${HOTKEY_HINT}；组合键用 + 连接（如 ctrl+c、alt+F4）。鼠标操作用 mouse_goto / mouse_click_left 等，不要声称自己只有键盘工具。`;

const textSection = (tools: ToolSpec[]): string => `工具调用方式：当前模型不支持原生工具调用，所以你要动手时，用下面这个固定文本格式发出工具调用（只是格式固定，内容随你判断）。

格式：正文（可省略，20 字以内）+ 一个或多个下面这种代码块：

\`\`\`${TOOL_BLOCK_TAG}
{"name": "get_desktop_photo", "arguments": {"maxWidth": 1024}}
\`\`\`

硬性要求（只有格式是硬的，说什么、说多少随你）：
- 工具块按需输出，不是每轮必出。需要看屏幕或操控时，输出 1 个或多个工具块；纯聊天、解释、给建议这类轮次直接说话就行，不必带工具块。
- 说了要动手的话，同一回复里带上工具块最省事（否则可能被用户再问一句），但这不是失败判定。
- 你可以随时截屏：需要看屏幕就在同一回复里发 get_desktop_photo 块，不必先问用户。
- 鼠标工具齐全（mouse_goto / mouse_click_left / keyboard_button 等），不要声称自己只有键盘工具。
- 按键统一用 keyboard_button，key 填按键名：${HOTKEY_HINT}；组合键用 + 连接（如 ctrl+c、alt+F4）。
- name 必须严格取自下面的工具清单，不得发明新工具名；arguments 必须是 JSON 对象，没有参数就写 {}。
- 一次可以输出多个块，按执行顺序排列。
- 工具块之外不要输出任何 JSON、伪代码或函数调用示意。
- 系统会执行这些调用，并把「工具结果」作为新消息回给你（截图会以图片形式附上）。在看到结果之前不要编造结果，也不要假设操作成功。
- 收到结果后继续下一轮：要么输出新的工具块继续操作，要么给出最终答复并结束。

可用工具清单：
${toolList(tools)}`;

/**
 * 生成注入到对话里的系统提示词。
 * @param tools 当前可用的工具定义
 * @param mode  native=原生 function calling；text=文本工具协议
 */
export function buildUserViewSystemPrompt(
  tools: ToolSpec[],
  mode: ToolProtocolMode = "native",
): string {
  return [
    BASE_RULES,
    mode === "native" ? NATIVE_SECTION : textSection(tools),
  ].join("\n\n");
}

const BLOCK_PATTERNS = [
  /```[ \t]*turber-tool[ \t]*\r?\n([\s\S]*?)```/gi,
  /<turber-tool>([\s\S]*?)<\/turber-tool>/gi,
  /```json[ \t]*\r?\n([\s\S]*?)```/gi,
];

interface RawCall {
  name?: unknown;
  arguments?: unknown;
  args?: unknown;
}

/**
 * 参数容错：模型常见非法写法 ["url":"https://x"] / {url:"x"} 直接 JSON.parse 会失败，
 * 此时从文本里抽出 key:value 对重建对象，避免参数被整体丢弃导致执行层拿不到必填项。
 */
const coerceArgsText = (raw: string): string => {
  const text = raw.trim();
  if (!text) return "{}";
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return text;
  } catch {
    void 0;
  }
  const pairs: Record<string, unknown> = {};
  const pattern = /["']?([A-Za-z_]\w*)["']?\s*:\s*("(?:[^"\\]|\\.)*"|[^,\]}]+)/g;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match) {
    const key = match[1];
    const rawValue = match[2].trim();
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      pairs[key] = rawValue.slice(1, -1);
    } else if (rawValue === "true" || rawValue === "false") {
      pairs[key] = rawValue === "true";
    } else if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
      pairs[key] = Number(rawValue);
    } else {
      pairs[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
    match = pattern.exec(text);
  }
  return Object.keys(pairs).length > 0 ? JSON.stringify(pairs) : text;
};

/** 旧版热键工具名（keyboard_enter、long_keyboard_ctrl+c）已不再注册，但执行层仍支持 */
const LEGACY_KEY_ALIAS = /^(long_)?keyboard_[A-Za-z0-9+_-]+$/;

const isKnownTool = (name: string, known: Set<string>): boolean =>
  known.has(name) || LEGACY_KEY_ALIAS.test(name);


const toToolCall = (raw: RawCall, known: Set<string>, index: number): ToolCall | null => {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  if (known.size > 0 && !isKnownTool(name, known)) return null;
  const argsValue = raw.arguments ?? raw.args ?? {};
  let args = "{}";
  if (typeof argsValue === "string") {
    args = coerceArgsText(argsValue);
  } else if (argsValue && typeof argsValue === "object") {
    args = JSON.stringify(argsValue);
  }
  return {
    id: `text-call-${Date.now().toString(36)}-${index}`,
    type: "function",
    function: { name, arguments: args },
  };
};

/**
 * 从模型正文中解析文本工具调用，并返回剔除调用块后的展示文本。
 * 会按已知工具名做白名单校验，避免误吞普通 JSON 代码块。
 */
export function parseTextToolCalls(
  text: string,
  tools: ToolSpec[],
): { calls: ToolCall[]; cleaned: string } {
  const known = new Set(tools.map((item) => item.function.name));
  const calls: ToolCall[] = [];
  let cleaned = text;

  for (const pattern of BLOCK_PATTERNS) {
    cleaned = cleaned.replace(pattern, (_match, body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return "";
      const candidates: RawCall[] = [];
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item === "object") candidates.push(item as RawCall);
          }
        } else if (parsed && typeof parsed === "object") {
          candidates.push(parsed as RawCall);
        }
      } catch {
        // 兼容一行一个 JSON 的写法
        for (const line of trimmed.split(/\r?\n/)) {
          const single = line.trim().replace(/,$/, "");
          if (!single.startsWith("{") || !single.endsWith("}")) continue;
          try {
            const parsed = JSON.parse(single);
            if (parsed && typeof parsed === "object") candidates.push(parsed as RawCall);
          } catch {
            void 0;
          }
        }
      }
      let consumed = false;
      for (const candidate of candidates) {
        const call = toToolCall(candidate, known, calls.length);
        if (call) {
          calls.push(call);
          consumed = true;
        }
      }
      return consumed ? "" : _match;
    });
  }

  cleaned = cleaned
    .replace(/[ \t]+\r?\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { calls, cleaned };
}

const renderToolResult = (message: ChatMessage): string =>
  `工具结果（${message.toolName ?? "tool"}）：${message.content}`;

/**
 * 文本协议下的历史渲染：上游不支持 tools 协议，因此
 * - 工具结果从 role=tool 折叠成 user 文本消息
 * - assistant 的 tool_calls 字段丢弃（只保留正文）
 */
export function toTextProtocolHistory(messages: ChatMessage[]): ChatMessage[] {
  const rendered: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role === "tool") {
      rendered.push({
        id: message.id,
        role: "user",
        content: renderToolResult(message),
        createdAt: message.createdAt,
        parts: message.parts,
      });
      continue;
    }
    if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
      if (message.content.trim().length > 0 || (message.parts?.length ?? 0) > 0) {
        rendered.push({
          id: message.id,
          role: "assistant",
          content: message.content,
          createdAt: message.createdAt,
          parts: message.parts,
        });
      }
      continue;
    }
    rendered.push(message);
  }
  return rendered;
}
