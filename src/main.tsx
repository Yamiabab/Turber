import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { hydrateChatStore } from "./core/store/useChatStore";
import "./styles/globals.css";

/**
 * 必须先等本地会话快照就绪再挂载 UI：
 * 桌面端 zustand persist 的 storage 被禁用，store 启动时是空的；
 * assistant-ui 的远端会话列表只在 mount 时 list() 一次，
 * 若此时会话尚未回填，会拿空列表并立刻 initialize() 出一个临时新会话，
 * 历史会话虽然已在 SQLite 里，却永远不会出现在侧栏（表现为「对话没保存」）。
 */
async function bootstrap(): Promise<void> {
  try {
    await hydrateChatStore();
  } catch (error) {
    console.error("[turber] 会话快照加载失败，按空会话启动", error);
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
