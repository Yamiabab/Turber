# 发布与推广手册

这份文档不进 README，只作为投放时的对照清单。所有文案都可以直接复制。

---

## 一、仓库设置（5 分钟，长期吃搜索流量）

**About → Description**（这段是 Google/GitHub 搜索的主要来源）：

```
A local-first desktop AI client that can actually drive your computer — screen capture, mouse & keyboard control, all on-device. Tauri 2 + React 19.
```

**About → Topics**（逐个粘贴）：

```
tauri  tauri-app  ai-agent  computer-use  local-first  ollama  llm
desktop-app  rust  react  privacy  gui-automation  windows
```

**About → Website**：填 Release 页面地址，或自己的落地页。

**Settings → Social preview**：上传 `docs/social-preview.png`（1280×640）。

**Settings → Features**：打开 Discussions（有人提问时有地方去，不会变成 Issue 噪音）。

**Releases**：确认至少有一个正式 Release，带 NSIS 安装包。README 的下载按钮指向 `/releases`，空页面会直接劝退。

---

## 二、Hacker News（英文，转化最高）

**Title**

```
Show HN: Turber – a local-first desktop AI client that drives the mouse
```

**正文**

```
I built Turber because every computer-use agent I tried had the same two problems:
the screen goes to someone else's server, and every click is billed per token.

Turber runs the whole loop on the machine. Screen capture is GDI BitBlt, input is
SendInput, and the model is whatever you point it at — Ollama on localhost, or any
OpenAI-compatible endpoint.

Stack: Tauri 2 + Rust for capture and injection, React 19 for the UI, SQLite
(rusqlite) for persistence. The tool surface is deliberately small:
get_desktop_photo, mouse_goto, mouse_click_left, keyboard_type_text, open_url.

Things I'm not happy with yet:
- Computer control is Windows-only, since it's GDI + SendInput.
- Small local models can't do native tool calling, so there's a plain-text
  protocol fallback that works but is fragile.
- History is trimmed hard (16 messages, 1 screenshot) to keep prefill cheap on
  a 4096-token context.

The part I'd most like feedback on is the permission model: four layers
(master switch → autonomous mode → mouse scope → screen capture), a site/app
blocklist, and a double-tap Alt kill switch. Is that the right shape?

AGPL-3.0. Repo: https://github.com/Yamiabab/Turber
```

**规则**：发出去后 2 小时内守着评论区逐条回。HN 的排序权重里，作者回复率影响很大。不要用营销词（revolutionary / game-changing），会被踩。

---

## 三、Reddit

### r/LocalLLaMA（最精准的人群）

**Title**

```
Turber: a local-first desktop client where the model actually moves the mouse (Ollama or any OpenAI-compatible endpoint)
```

**正文**

```
Most "computer use" demos assume a frontier model in the cloud. I wanted the same
thing against a local model, so I built a client that does the loop on-device:
screenshot → tool call → SendInput → screenshot again.

Two things I had to solve for small local models:
1. Tool calling. Most 7B models can't emit reliable native tool calls, so there's
   a plain-text protocol fallback that parses the model's reply.
2. Context. A single 1080p screenshot is expensive, so history keeps only the last
   screenshot and 16 messages; older images become text placeholders.

Works with Ollama out of the box (http://localhost:11434/v1), or any OpenAI-compatible
endpoint if you'd rather use a bigger model.

Windows-only for the control part (GDI + SendInput). AGPL-3.0.

Happy to hear what breaks first on your setup.
```

### r/selfhosted

**Title**：`Turber – a self-hosted desktop AI agent, no cloud account required`

正文重点：数据全本地、SQLite、无账号、可审计源码。少讲技术细节。

### r/tauri / r/rust

**Title**：`Built a desktop AI agent in Tauri 2 — GDI capture and SendInput from Rust`

正文重点：Rust 侧的实现（事件回推、取消请求、rusqlite WAL、跨平台桩），这两个版块吃技术细节。

---

## 四、中文渠道

### V2EX · 分享创造

**标题**

```
[分享创造] 做了个能自己动鼠标的本地 AI 客户端，开源
```

**正文**

```
一直觉得"AI 操作电脑"这事有点别扭：能力是有的，但每一步都要把桌面截图传到云端，
每次点击都按 token 计费。

所以写了个反着来的：整个循环跑在本机，截图走 GDI，点击走 SendInput，模型可以接
本地 Ollama，也能接任意 OpenAI 兼容接口。数据不出本机。

几个自己踩过的坑：
- 小模型不会原生 tool calling，得自己写一套纯文本协议兜底
- 一张 1080p 截图很贵，历史只留最后一张图 + 16 条消息
- 权限做了四层（总开关 → 自主操控 → 鼠标范围 → 截屏），外加黑名单和双击 Alt 急停

Tauri 2 + React 19，AGPL-3.0，Windows 可用。
https://github.com/Yamiabab/Turber

求轻拍，也想知道你们最想让它干什么活。
```

### 掘金（技术文，不是广告）

标题：`从零做一个能操作鼠标的桌面 AI：截图、注入、上下文裁剪`

正文按技术点展开：GDI BitBlt 截图为什么比 Electron 方案快、SendInput 的坐标换算、小模型上下文怎么省、工具调用降级协议。文末再放仓库链接。技术文在掘金的留存远高于纯推广帖。

### 少数派

标题：`让 AI 替你点鼠标：一个本地优先的桌面助手`

正文走场景：整理截图、批量归档、跨软件搬运数据。配 GIF。

### 即刻

```
做了个会自己动鼠标的 AI 客户端。
截图、定位、点击全在本机跑，模型接的 Ollama。
双击 Alt 随时叫停。
开源：github.com/Yamiabab/Turber
```

---

## 五、周刊投稿

### 阮一峰《科技爱好者周刊》

邮件标题：`投稿：Turber - 本地运行的桌面 AI 客户端`

正文三句话：

```
阮老师好，

推荐一个开源项目：Turber，本地优先的桌面 AI 客户端。
它能读取屏幕、模拟鼠标键盘操作本机应用，整个循环在本地完成，模型可接 Ollama。
地址：https://github.com/Yamiabab/Turber

如果合适，希望能出现在周刊里。
```

### HelloGitHub

在 [hellogithub.com](https://hellogithub.com) 提 Issue（项目自荐），按模板填：项目名、一句话介绍、截图、GitHub 地址。

### Awesome lists（PR）

- `tauri-apps/awesome-tauri` — 加进 Applications 分类
- `awesome-local-llm` — 加进 Desktop clients
- `e2b-dev/awesome-ai-agents` — 加进 Open source

PR 描述写清楚"这个项目解决了什么"，别只贴链接。

---

## 六、投放节奏

**不要一天全发。** 分两波，每波集中在同一天：

| 时间 | 渠道 |
| --- | --- |
| 第 1 周 周二 21:00 | HN + r/LocalLLaMA |
| 第 1 周 周四 21:00 | V2EX + 掘金 |
| 第 2 周 | 周刊投稿、Awesome PR、少数派 |

原因：GitHub Trending 看的是短时间内的 star 增速，分散投放等于每波都不够门槛。

**发布前检查清单**

- [ ] README 首屏有 GIF（已就绪：`docs/media/`）
- [ ] 至少一个 Release，带安装包
- [ ] Description 和 Topics 填好
- [ ] Social preview 上传
- [ ] Discussions 打开
- [ ] 仓库有 `LICENSE`、`README.zh-CN.md`

---

## 七、不要做的事

- **不要买 star / 互赞**：GitHub 会清，而且 Trending 算法能识别
- **不要在 HN 用小号自问自答**：被识别后账号会被封
- **不要写"10 倍效率"**：没有 benchmark 支撑的数字，评论区第一条就是让你给数据
- **不要在中文社区只发链接**：V2EX 和掘金对纯链接帖的处理很直接
