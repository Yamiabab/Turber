import { invoke } from "@tauri-apps/api/core";
import {
  AIPU_DENY_MESSAGE,
  aipuEnabled,
  judgeForeground,
  judgeTarget,
  readForeground,
  invalidateForeground,
  type ForegroundInfo,
} from "./aipuGuard";
import { isDesktop } from "./chatClient";
import { diag } from "../diag";

/** 工具 ID 集合（注意：对外统一用 keyboard_ 前缀；旧名 kebord_ 由 normalizeToolName 兼容） */
export const TOOL_IDS = {
  photo: "get_desktop_photo",
  photoLong: "long_get_desktop_photo",
  mouseGoto: "mouse_goto",
  clickLeft: "mouse_click_left",
  clickRight: "mouse_click_right",
  clickCenter: "mouse_click_center",
  longClickLeft: "long_mouse_click_left",
  longClickRight: "long_mouse_click_right",
  longClickCenter: "long_mouse_click_center",
  scroll: "mouse_scroll",
  drag: "mouse_drag",
  keyboard: "keyboard_button",
  typeText: "keyboard_type_text",
  openUrl: "open_url",
} as const;

interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const pointProps = {
  type: "object",
  properties: {
    x: { type: "number", description: "屏幕绝对横坐标（像素）" },
    y: { type: "number", description: "屏幕绝对纵坐标（像素）" },
  },
  required: ["x", "y"],
  additionalProperties: false,
};

/**
 * 常用按键清单：不再为每个按键单独注册工具，避免工具数量过多导致
 * 上下文溢出（Ollama 默认上下文偏小），按键统一走 keyboard_button 的 key 参数；
 * 模型若仍返回旧工具名，由 normalizeToolName 兼容处理。
 */
const HOTKEY_LIST: Array<{ id: string; label: string }> = [
  { id: "enter", label: "回车" },
  { id: "tab", label: "Tab" },
  { id: "esc", label: "Esc" },
  { id: "space", label: "空格" },
  { id: "backspace", label: "退格" },
  { id: "delete", label: "Delete" },
  { id: "up", label: "方向键上" },
  { id: "down", label: "方向键下" },
  { id: "left", label: "方向键左" },
  { id: "right", label: "方向键右" },
  { id: "ctrl+a", label: "全选" },
  { id: "ctrl+c", label: "复制" },
  { id: "ctrl+v", label: "粘贴" },
  { id: "ctrl+x", label: "剪切" },
  { id: "ctrl+s", label: "保存" },
  { id: "ctrl+z", label: "撤销" },
  { id: "ctrl+f", label: "查找" },
  { id: "alt+tab", label: "切换窗口" },
  { id: "win+d", label: "显示桌面" },
];

/** 供提示词使用的按键速查表（keyboard_button 的 key 取值） */
export const HOTKEY_HINT = HOTKEY_LIST.map((item) => `${item.id}=${item.label}`).join("、");

export function buildToolSpecs(): ToolSpec[] {
  const specs: ToolSpec[] = [
    {
      type: "function",
      function: {
        name: TOOL_IDS.photo,
        description:
          "读取当前桌面截图，返回一张图片给你观察。当需要查看屏幕内容、确认操作结果、定位按钮位置时调用。",
        parameters: {
          type: "object",
          properties: {
            maxWidth: { type: "number", description: "截图最大宽度，默认 1024" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: TOOL_IDS.photoLong,
        description: "长时观察桌面：等待指定毫秒后截图，并附带当前前台窗口信息（进程名与标题）。",
        parameters: {
          type: "object",
          properties: {
            holdMs: { type: "number", description: "等待时长（毫秒），默认 1500，最大 10000" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: TOOL_IDS.mouseGoto,
        description: "把鼠标移动到屏幕绝对坐标 (x, y)，不点击。",
        parameters: pointProps,
      },
    },
    {
      type: "function",
      function: {
        name: TOOL_IDS.clickLeft,
        description: "左键单击。可先移动到 (x, y) 再点击；带 double=true 时双击。",
        parameters: {
          type: "object",
          properties: {
            x: { type: "number", description: "横坐标，填截图上的像素；不给则点在上一次光标位置" },
            y: { type: "number", description: "纵坐标，填截图上的像素；不给则点在上一次光标位置" },
            double: { type: "boolean", description: "是否双击，默认 false" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: TOOL_IDS.clickRight,
        description: "右键单击（打开右键菜单）。可先移动到 (x, y) 再点击。",
        parameters: {
          type: "object",
          properties: {
            x: { type: "number", description: "横坐标，填截图上的像素；不给则点在上一次光标位置" },
            y: { type: "number", description: "纵坐标，填截图上的像素；不给则点在上一次光标位置" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: TOOL_IDS.clickCenter,
        description: "中键单击。可先移动到 (x, y) 再点击。",
        parameters: {
          type: "object",
          properties: {
            x: { type: "number", description: "横坐标，填截图上的像素；不给则点在上一次光标位置" },
            y: { type: "number", description: "纵坐标，填截图上的像素；不给则点在上一次光标位置" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: TOOL_IDS.longClickLeft,
        description: "左键长按（默认 800 毫秒后松开），用于拖选、长按菜单等。",
        parameters: {
          type: "object",
          properties: {
            x: { type: "number", description: "可选，按下前移动到的横坐标" },
            y: { type: "number", description: "可选，按下前移动到的纵坐标" },
            holdMs: { type: "number", description: "按住时长（毫秒），默认 800" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: TOOL_IDS.longClickRight,
        description: "右键长按（默认 800 毫秒后松开）。",
        parameters: {
          type: "object",
          properties: {
            x: { type: "number", description: "可选，按下前移动到的横坐标" },
            y: { type: "number", description: "可选，按下前移动到的纵坐标" },
            holdMs: { type: "number", description: "按住时长（毫秒），默认 800" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: TOOL_IDS.longClickCenter,
        description: "中键长按（默认 800 毫秒后松开）。",
        parameters: {
          type: "object",
          properties: {
            x: { type: "number", description: "可选，按下前移动到的横坐标" },
            y: { type: "number", description: "可选，按下前移动到的纵坐标" },
            holdMs: { type: "number", description: "按住时长（毫秒），默认 800" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: TOOL_IDS.scroll,
        description: "滚动鼠标滚轮，delta 为滚动格数（正数向上，负数向下，默认 1）。",
        parameters: {
          type: "object",
          properties: {
            delta: { type: "number", description: "滚动格数，常用 3 或 -3" },
            x: { type: "number", description: "可选，滚动前移动到的横坐标" },
            y: { type: "number", description: "可选，滚动前移动到的纵坐标" },
          },
          required: ["delta"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: TOOL_IDS.drag,
        description: "按住左键从起点拖到终点（用于拖动窗口、选中文本等）。",
        parameters: {
          type: "object",
          properties: {
            fromX: { type: "number" },
            fromY: { type: "number" },
            toX: { type: "number" },
            toY: { type: "number" },
          },
          required: ["fromX", "fromY", "toX", "toY"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: TOOL_IDS.keyboard,
        description:
          "按下并释放键盘按键，如 enter、esc、tab、ctrl+c、alt+F4、win+d 等；可选 holdMs 控制按住时长。",
        parameters: {
          type: "object",
          properties: {
            key: { type: "string", description: "按键名称，组合键用 + 连接" },
            holdMs: { type: "number", description: "可选，按住时长（毫秒）" },
          },
          required: ["key"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: TOOL_IDS.typeText,
        description: "在当前焦点位置输入文本（支持中文），可选输入后按回车。",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "要输入的文本" },
            enter: { type: "boolean", description: "可选，输入后是否按回车" },
          },
          required: ["text"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: TOOL_IDS.openUrl,
        description: "用系统默认浏览器打开网址（受 AIPU 安全策略校验），无需截图。",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "完整网址，必须以 http:// 或 https:// 开头" },
          },
          required: ["url"],
          additionalProperties: false,
        },
      },
    },
  ];

  return specs;
}

export interface ToolResultPayload {
  ok: boolean;
  /** 给模型看的文字结果 */
  content: string;
  /** 图片（dataURL），仅 get_desktop_photo 返回 */
  image?: string;
  width?: number;
  height?: number;
  foreground?: ForegroundInfo;
}

const ok = (content: string, extra?: Partial<ToolResultPayload>): ToolResultPayload => ({
  ok: true,
  content,
  ...extra,
});

const denied = (): ToolResultPayload => ({
  ok: false,
  content: AIPU_DENY_MESSAGE,
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface GuardOutcome {
  blocked: boolean;
  foreground: ForegroundInfo | null;
  reason?: string;
}

async function guard(targetUrl?: string): Promise<GuardOutcome> {
  if (!isDesktop()) return { blocked: true, foreground: null, reason: AIPU_DENY_MESSAGE };
  if (!aipuEnabled()) return { blocked: true, foreground: null, reason: AIPU_DENY_MESSAGE };

  const foreground = await readForeground(true);
  // 操作类工具放行「前台是本应用」：用户就在 Turber 里下命令，
  // 否则 guard 会把自己的窗口当成禁区，AI 连鼠标都动不了。
  const fgVerdict = judgeForeground(foreground, { allowSelf: true });
  if (fgVerdict.blocked) {
    return { blocked: true, foreground, reason: fgVerdict.detail ?? AIPU_DENY_MESSAGE };
  }
  if (targetUrl) {
    const urlVerdict = judgeTarget(targetUrl);
    if (urlVerdict.blocked) {
      return { blocked: true, foreground, reason: urlVerdict.detail ?? AIPU_DENY_MESSAGE };
    }
  }
  return { blocked: false, foreground };
}

interface CaptureResult {
  image: string;
  width: number;
  height: number;
  /** Rust 端 CapturePayload 带 #[serde(rename_all = "camelCase")]，字段名与下方一致 */
  originX?: number;
  originY?: number;
  screenWidth?: number;
  screenHeight?: number;
  foreground: ForegroundInfo;
}

/**
 * 记录最近一次截图的缩放信息，用于把模型看到的截图坐标换算成真实屏幕坐标
 * （鼠标操作走 SetCursorPos 等系统接口，需要物理坐标）。
 * 例如：物理分辨率 5120 宽、截图缩到 640 宽时，模型说“点击截图里的 (720, ...)”需按比例放大。
 */
let lastFrame: {
  shotWidth: number;
  shotHeight: number;
  screenWidth: number;
  screenHeight: number;
  originX: number;
  originY: number;
} | null = null;

/** 把截图坐标换算成屏幕物理坐标 */
export function toScreenPoint(x: number, y: number): { x: number; y: number } {
  if (!lastFrame) return { x: Math.round(x), y: Math.round(y) };
  const { shotWidth, shotHeight, screenWidth, screenHeight, originX, originY } = lastFrame;
  // 若传入的坐标已明显超出截图范围，视为模型直接给了物理坐标，原样使用
  const looksPhysical = x > shotWidth * 1.05 || y > shotHeight * 1.05;
  if (looksPhysical) return { x: Math.round(x), y: Math.round(y) };
  const ratioX = shotWidth > 0 ? screenWidth / shotWidth : 1;
  const ratioY = shotHeight > 0 ? screenHeight / shotHeight : 1;
  return {
    x: Math.round(originX + x * ratioX),
    y: Math.round(originY + y * ratioY),
  };
}

async function capture(maxWidth: number): Promise<CaptureResult> {
  return invoke<CaptureResult>("screen_capture", { maxWidth, quality: 72 });
}

async function readPhoto(maxWidth: number): Promise<ToolResultPayload> {
  const shot = await capture(maxWidth);
  lastFrame = {
    shotWidth: shot.width,
    shotHeight: shot.height,
    screenWidth: shot.screenWidth || shot.width,
    screenHeight: shot.screenHeight || shot.height,
    originX: shot.originX || 0,
    originY: shot.originY || 0,
  };
  const header =
    `已截图 ${shot.width}x${shot.height}（左上角为原点 (0,0)，右下角 (${shot.width},${shot.height})；` +
    `实际屏幕分辨率 ${lastFrame.screenWidth}x${lastFrame.screenHeight}，点击时直接使用截图上的坐标即可）`;
  // 前台是本应用时也把图给模型：图里就是客户端窗口本身，
  // 要操作它（最小化/关闭/点按钮）必须能看见按钮位置，只回文字会让模型瞎点。
  const selfNote = shot.foreground?.isSelf
    ? " 当前前台是 Turber 客户端自己，图中就是对话窗口本身。要操作客户端自身（如最小化、关闭、点界面按钮），直接按图中坐标点击；要操作其它程序，先用 keyboard_button 按 alt+tab 或 win 切换窗口，再截图确认。"
    : "";
  return ok(`${header}${selfNote}`, {
    image: shot.image,
    width: shot.width,
    height: shot.height,
    foreground: shot.foreground,
  });
}

interface PointArgs {
  x?: number;
  y?: number;
}

async function moveIfNeeded(args: PointArgs): Promise<string> {
  if (typeof args.x === "number" && typeof args.y === "number") {
    const point = toScreenPoint(args.x, args.y);
    const actual = await invoke<string>("input_mouse_move", point);
    invalidateForeground();
    await sleep(40);
    return `鼠标已移到 ${actual}`;
  }
  // 没给坐标就沿用当前光标：把真实位置报给模型，避免它以为点在了自己说的地方
  const current = await cursorPosition();
  return current ? `未指定坐标，在当前位置 ${current} 操作` : "";
}

async function cursorPosition(): Promise<string> {
  try {
    return await invoke<string>("cursor_position");
  } catch {
    return "";
  }
}

interface ParsedCall {
  name: string;
  args: Record<string, unknown>;
}

function parseArguments(raw: string): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * 工具名兼容：历史版本把 keyboard 误拼成 kebord，
 * 这里统一纠正为 keyboard_ 前缀，避免模型沿用旧名导致调用失败。
 */
export function normalizeToolName(raw: string): string {
  if (!raw) return raw;
  if (raw.startsWith("long_kebord_")) return `long_keyboard_${raw.slice("long_kebord_".length)}`;
  if (raw.startsWith("kebord_")) return `keyboard_${raw.slice("kebord_".length)}`;
  return raw;
}

/** 执行用户视角工具（先过 AIPU 安全校验）。
 *  任何工具抛错都在这里收敛成 ok=false 的可读结果，避免一次失败打断整轮对话。 */
export async function executeUserViewTool(call: ParsedCall): Promise<ToolResultPayload> {
  const name = normalizeToolName(call.name);
  const startedAt = Date.now();
  const args = call.args ?? {};
  try {
    const result = await runUserViewTool(name, args);
    diag(
      `tool ${name} args=${JSON.stringify(args)} ok=${result.ok} ${Date.now() - startedAt}ms result=${result.content.slice(0, 140)}`,
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diag(`tool ${name} args=${JSON.stringify(args)} threw ${Date.now() - startedAt}ms: ${message}`);
    return { ok: false, content: `工具 ${name} 执行失败：${message}` };
  }
}

async function runUserViewTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResultPayload> {
  if (name === TOOL_IDS.photo) {
    const verdict = await guard();
    if (verdict.blocked) return denied();
    // 默认 1024 宽：640 宽时按钮/文字太小，小模型定位误差大，容易点偏
    const maxWidth = Math.min(Math.max(Number(args.maxWidth) || 1024, 480), 1600);
    return readPhoto(maxWidth);
  }

  if (name === TOOL_IDS.photoLong) {
    const verdict = await guard();
    if (verdict.blocked) return denied();
    const holdMs = Math.min(Math.max(Number(args.holdMs) || 1500, 200), 10000);
    await sleep(holdMs);
    return readPhoto(1024);
  }

  if (name === TOOL_IDS.openUrl) {
    const url = String(args.url ?? "").trim();
    const verdict = await guard(url);
    if (verdict.blocked) return denied();
    if (!/^https?:\/\//i.test(url)) return { ok: false, content: "网址格式错误，需以 http:// 或 https:// 开头" };
    await invoke("open_external", { url });
    await sleep(600);
    return ok(`已在默认浏览器打开 ${url}`);
  }

  // 所有鼠标 / 键盘动作统一先过 AIPU 校验
  if (
    name.startsWith("mouse_") ||
    name.startsWith("long_mouse_") ||
    name.startsWith("keyboard_") ||
    name.startsWith("long_keyboard_")
  ) {
    const verdict = await guard();
    if (verdict.blocked) return denied();
  }

  try {
    if (name === TOOL_IDS.mouseGoto) {
      const x = Number(args.x);
      const y = Number(args.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { ok: false, content: "缺少坐标：请给出截图上的 x、y（像素整数）" };
      }
      const point = toScreenPoint(x, y);
      const actual = await invoke<string>("input_mouse_move", point);
      invalidateForeground();
      return ok(`鼠标已移到 (${point.x}, ${point.y})，系统实际光标位置 ${actual}`);
    }

    if (name === TOOL_IDS.clickLeft || name === TOOL_IDS.clickRight || name === TOOL_IDS.clickCenter) {
      const button =
        name === TOOL_IDS.clickLeft ? "left" : name === TOOL_IDS.clickRight ? "right" : "center";
      const moved = await moveIfNeeded(args as PointArgs);
      await invoke("input_mouse_button", { button, action: args.double ? "double" : "click" });
      invalidateForeground();
      const buttonLabel = button === "left" ? "左键" : button === "right" ? "右键" : "中键";
      return ok(`${buttonLabel}${args.double ? "双击" : "单击"}完成${moved ? `，${moved}` : ""}`);
    }

    if (
      name === TOOL_IDS.longClickLeft ||
      name === TOOL_IDS.longClickRight ||
      name === TOOL_IDS.longClickCenter
    ) {
      const button =
        name === TOOL_IDS.longClickLeft
          ? "left"
          : name === TOOL_IDS.longClickRight
            ? "right"
            : "center";
      const moved = await moveIfNeeded(args as PointArgs);
      const holdMs = Math.min(Math.max(Number(args.holdMs) || 800, 100), 10000);
      await invoke("input_mouse_button", { button, action: "down" });
      await sleep(holdMs);
      await invoke("input_mouse_button", { button, action: "up" });
      invalidateForeground();
      return ok(`${button} 键已按住 ${holdMs}ms 后松开${moved ? `，${moved}` : ""}`);
    }

    if (name === TOOL_IDS.scroll) {
      const moved = await moveIfNeeded(args as PointArgs);
      const delta = Math.round(Number(args.delta) || 0);
      await invoke("input_mouse_scroll", { delta });
      return ok(`已滚动 ${delta} 格${moved ? `，${moved}` : ""}`);
    }

    if (name === TOOL_IDS.drag) {
      const nums = [args.fromX, args.fromY, args.toX, args.toY].map((value) => Number(value));
      if (nums.some((value) => !Number.isFinite(value))) {
        return { ok: false, content: "拖拽缺少坐标：需要 fromX / fromY / toX / toY 四个截图像素坐标" };
      }
      const from = toScreenPoint(nums[0], nums[1]);
      const to = toScreenPoint(nums[2], nums[3]);
      const fromX = from.x;
      const fromY = from.y;
      const toX = to.x;
      const toY = to.y;
      await invoke("input_mouse_move", { x: fromX, y: fromY });
      await sleep(60);
      await invoke("input_mouse_button", { button: "left", action: "down" });
      const steps = 12;
      for (let index = 1; index <= steps; index += 1) {
        const x = Math.round(fromX + ((toX - fromX) * index) / steps);
        const y = Math.round(fromY + ((toY - fromY) * index) / steps);
        await invoke("input_mouse_move", { x, y });
        await sleep(18);
      }
      await invoke("input_mouse_button", { button: "left", action: "up" });
      invalidateForeground();
      return ok(`已从 (${fromX},${fromY}) 拖到 (${toX},${toY})`);
    }

    if (name === TOOL_IDS.typeText) {
      const text = String(args.text ?? "");
      if (!text) return { ok: false, content: "要输入的文本为空" };
      await invoke("input_type_text", { text });
      invalidateForeground();
      if (args.enter) {
        await sleep(80);
        await invoke("input_keys", { keys: "enter", holdMs: 40 });
      }
      return ok(`文本已输入（${text.length} 个字符）${args.enter ? "，并已回车" : ""}`);
    }

    if (name === TOOL_IDS.keyboard) {
      const key = String(args.key ?? "").trim();
      if (!key) return { ok: false, content: "按键名称为空" };
      const holdMs = typeof args.holdMs === "number" ? args.holdMs : 40;
      await invoke("input_keys", { keys: key, holdMs });
      invalidateForeground();
      return ok(`已按键 ${key}`);
    }

    // keyboard_xxx / long_keyboard_xxx（兼容旧版单键工具名）
    const longPress = name.startsWith("long_keyboard_");
    const prefix = longPress ? "long_keyboard_" : "keyboard_";
    if (name.startsWith(prefix)) {
      const key = name.slice(prefix.length);
      if (!key) return { ok: false, content: "按键名称为空" };
      await invoke("input_keys", { keys: key, holdMs: longPress ? 900 : 40 });
      invalidateForeground();
      return ok(`${longPress ? "长按" : "按键"} ${key} 已完成`);
    }

    return { ok: false, content: `未知工具：${name}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, content: `执行失败：${message}` };
  }
}

export function parseToolArguments(raw: string): Record<string, unknown> {
  return parseArguments(raw);
}
