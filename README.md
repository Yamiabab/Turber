---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: e02b66b0b4cf27c6de3344f74d002f78_93d7f1b1e54211f1a9b8525400f8a581
    ReservedCode1: gP9amBldCPLdOjy5H0bekc8tnRrMuA2WVzNgzSIOl7F7YDKEyRMwj2Vvgggm0txIHyeZu7wT7SfjeNd4h/KdoSABRW95QW24Kng9qVwlIh2kcTueVCD5oKBUp+VBKUjHEAjZtti1GIbr1i0Z/61cxOgdNsVV76Q2U93kc7jmzffl++q5hSAaXs/bz8U=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: e02b66b0b4cf27c6de3344f74d002f78_93d7f1b1e54211f1a9b8525400f8a581
    ReservedCode2: gP9amBldCPLdOjy5H0bekc8tnRrMuA2WVzNgzSIOl7F7YDKEyRMwj2Vvgggm0txIHyeZu7wT7SfjeNd4h/KdoSABRW95QW24Kng9qVwlIh2kcTueVCD5oKBUp+VBKUjHEAjZtti1GIbr1i0Z/61cxOgdNsVV76Q2U93kc7jmzffl++q5hSAaXs/bz8U=
---

<div align="center">

# Turber

**A themeable, local-first desktop AI client**

[![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](#)

</div>

Turber is a desktop AI workbench that runs entirely on your own machine. Conversations and data stay local, and models can be served by a local Ollama instance or any OpenAI-compatible endpoint. Skins, font sizes and raw CSS are all replaceable, and the assistant can drive this computer from the user's point of view.

## Features

- **Local-first**: conversations, settings and themes are stored on disk; the desktop app persists state in SQLite (rusqlite) with no cloud account required.
- **Multiple model backends**: built-in Ollama and OpenAI-compatible providers, so switching model services is a one-line config change.
- **Themeable**: a built-in theme engine with light/dark mode, accent colors, corner-radius density and custom CSS overrides that apply instantly.
- **User-view operation**: the assistant can read the screen and simulate mouse and keyboard input on local applications, with an emergency-stop hotkey and a visible run indicator.
- **Multi-thread management**: thread list, rename, delete, and streaming message rendering (assistant-ui + assistant-stream).
- **Bilingual UI**: all copy runs through i18n and can be switched at runtime between English and Chinese.
- **Companion local account service**: `server/` provides the account page, 16-digit authorization IDs with verification codes, login codes and an installer manifest (Node 22 + `node:sqlite`).

## Tech stack

| Layer | Choice |
| --- | --- |
| Desktop shell | Tauri 2 (Rust, rusqlite / reqwest / windows-rs) |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS 4 + Radix UI + custom theme engine |
| Chat | assistant-ui + assistant-stream + Lexical + Monaco |
| State | Zustand |
| Account service | Node.js 22 + `node:sqlite` (no external database) |

## Getting started

Requirements: Node.js >= 20, stable Rust, and the [Tauri 2 system dependencies](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev      # run the desktop app (with Rust hot reload)
npm run build          # type check + frontend bundle
npm run tauri build    # build an installer for the current platform
```

Local models default to `http://localhost:11434/v1` (Ollama). To change the model or endpoint, edit `src/core/ai/providers.ts`.

### Local account service (optional)

```bash
cd server
npm install
npm start              # http://127.0.0.1:8787
```

The service binds to the loopback interface only. It can be tuned with the environment variables `TURBER_PORT`, `TURBER_HOST`, `TURBER_DB`, `TURBER_RATE_LIMIT` and `TURBER_ALLOWED_ORIGINS`.

## Project structure

```
src/
├── components/         # layout, chat, settings, control panel, user-view guard
├── core/
│   ├── ai/             # model providers, desktop control tools, prompts
│   ├── i18n/           # English and Chinese copy
│   ├── store/          # Zustand state and thread repositories
│   └── theme/          # theme engine and style overrides
├── pages/              # page-level composition
└── styles/             # global styles and theme variables
src-tauri/              # Rust backend (not included in this snapshot)
server/                 # local account service (Node 22)
```

## Building installers

```bash
npm run tauri build
```

This produces an installer for the platform you are building on. The repository does not ship a CI release pipeline, so packages are built locally rather than in GitHub Actions.

This published snapshot contains the frontend and the local account service only; the Rust backend under `src-tauri/` is not part of it, so `npm run tauri build` cannot complete without restoring it locally.

## Contributors

- **DeepSeek** — [github.com/deepseek-ai](https://github.com/deepseek-ai)

## License

Released under the [GNU Affero General Public License v3.0](./LICENSE).

In short: you may use, modify and redistribute this software, but if you distribute a modified version or make a modified version available over a network, you must release the complete corresponding source under AGPL-3.0 and keep the copyright notices. Commercial closed-source use requires a separate license.
