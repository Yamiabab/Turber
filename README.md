<div align="center">

# Turber

**可换肤的本地优先桌面 AI 客户端**

[![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](#)

</div>

Turber 是一个跑在本机的桌面 AI 工作台：会话与数据都留在本地，模型可以直接接本地 Ollama，也可以接任意 OpenAI 兼容端点。界面皮肤、字号、CSS 全部可改，AI 还能以「用户视角」直接操作这台电脑。

## 功能

- **本地优先**：会话、设置、主题全部存在本地，桌面端用 SQLite（rusqlite）落盘，不依赖云端账号。
- **多后端模型**：内置 Ollama 与 OpenAI 兼容协议，改一行配置即可切换模型服务。
- **可换肤**：内置主题引擎，支持亮/暗、强调色、圆角密度与自定义 CSS 覆盖，改完即时生效。
- **用户视角操作**：AI 可读取屏幕并模拟鼠标键盘操作本机应用，带紧急停止热键与运行状态提示。
- **多会话管理**：线程列表、重命名、删除、消息流式渲染（assistant-ui + assistant-stream）。
- **中英双语**：界面文案统一走 i18n，可运行时切换。
- **配套本地账户服务**：`server/` 提供账户页、16 位授权 ID + 验证码、登录码与安装包下载清单（Node 22 + `node:sqlite`）。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面壳 | Tauri 2（Rust，rusqlite / reqwest / windows-rs） |
| 前端 | React 19 + TypeScript + Vite |
| 样式 | Tailwind CSS 4 + Radix UI + 自研主题引擎 |
| 对话 | assistant-ui + assistant-stream + Lexical + Monaco |
| 状态 | Zustand |
| 账户服务 | Node.js 22 + `node:sqlite`（零外部数据库依赖） |

## 快速开始

环境要求：Node.js ≥ 20、Rust stable、[Tauri 2 系统依赖](https://tauri.app/start/prerequisites/)。

```bash
npm install
npm run tauri dev      # 启动桌面端（含 Rust 热重载）
npm run build          # 类型检查 + 前端打包
npm run tauri build    # 生成当前平台的安装包
```

本地模型默认指向 `http://localhost:11434/v1`（Ollama）。改模型或换端点见 `src/core/ai/providers.ts`。

### 本地账户服务（可选）

```bash
cd server
npm install
npm start              # http://127.0.0.1:8787
```

服务只监听本机回环地址。可用环境变量调整：`TURBER_PORT`、`TURBER_HOST`、`TURBER_DB`、`TURBER_RATE_LIMIT`、`TURBER_ALLOWED_ORIGINS`。

## 目录结构

```
src/
├── components/         # 布局、对话、设置、控制面板、用户视角守卫
├── core/
│   ├── ai/             # 模型接入、桌面操控工具、提示词
│   ├── i18n/           # 中英文案
│   ├── store/          # Zustand 状态与会话仓库
│   └── theme/          # 主题引擎与样式覆盖
├── pages/              # 页面级组装
└── styles/             # 全局样式与主题变量
src-tauri/              # Rust 后端、窗口与系统能力
server/                 # 本地账户服务（Node 22）
.github/workflows/      # 多平台安装包自动构建
```

## 打包与发布

推送 `v*` 标签（或在 Actions 里手动触发 **Release** 工作流）会自动在三平台构建安装包并附到 GitHub Release：

- Windows：`.msi` / `.exe`（NSIS）
- macOS：`.dmg`（Intel + Apple Silicon）
- Linux：`.deb` / `.AppImage`

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Yamiabab/Turber&type=Date)](https://star-history.com/#Yamiabab/Turber&Date)

## License

本项目以 [GNU Affero General Public License v3.0](./LICENSE) 发布。

简单说：你可以自由使用、修改、分发，但**分发修改版或以网络服务形式提供修改版时，必须同样以 AGPL-3.0 开源完整源码**并保留版权声明。商业闭源使用需另行获得授权。
