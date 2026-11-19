import { createServer } from "node:http";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderAccountPage } from "./account-page.mjs";
import { renderLoginPage } from "./login-page.mjs";
import {
  DB_PATH,
  db,
  countUserSessions,
  createAuthorization,
  createLoginCode,
  dropSession,
  dropUserSession,
  ensureAccount,
  ensureSeedUsers,
  formatAuthId,
  listAuthorizations,
  listLoginCodes,
  listUserActivity,
  listUsers,
  loginUser,
  redeemLoginCode,
  registerUser,
  revokeAuthorization,
  revokeLoginCode,
  sessionFor,
  updateUserAvatar,
  updateUserName,
  changeUserPassword,
  userSessionFor,
  verifyAuthorization,
} from "./db.mjs";

const PORT = Number(process.env.TURBER_PORT ?? 8787);
const HOST = process.env.TURBER_HOST ?? "127.0.0.1";

/** 前端产物目录：由 scripts/build-ui.mjs 打包 MUI 应用生成。 */
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const ASSET_MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};

/** 产品下载目录：安装包直接放在 public/downloads 下即可被「产品」页列出。 */
const DOWNLOAD_DIR = join(PUBLIC_DIR, "downloads");
const DOWNLOAD_EXT = new Set([
  ".exe",
  ".msi",
  ".pkg",
  ".dmg",
  ".apk",
  ".deb",
  ".rpm",
  ".appimage",
  ".zip",
  ".7z",
]);

function platformOf(fileName) {
  const lower = fileName.toLowerCase();
  if (/\.(exe|msi)$/.test(lower)) return "windows";
  if (/\.(dmg|pkg)$/.test(lower)) return "macos";
  if (/\.(apk)$/.test(lower)) return "android";
  if (/\.(deb|rpm|appimage)$/.test(lower)) return "linux";
  if (/\.(zip|7z)$/.test(lower)) return "archive";
  return "other";
}

/** 扫描 public/downloads，返回真实存在的安装包清单；目录缺失时返回空数组。 */
async function listDownloadItems() {
  let names;
  try {
    names = await readdir(DOWNLOAD_DIR);
  } catch {
    return [];
  }
  const items = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    if (!DOWNLOAD_EXT.has(extname(name).toLowerCase())) continue;
    try {
      const info = await stat(join(DOWNLOAD_DIR, name));
      if (!info.isFile()) continue;
      items.push({
        fileName: name,
        platform: platformOf(name),
        size: info.size,
        updatedAt: Math.round(info.mtimeMs),
        url: `/downloads/${encodeURIComponent(name)}`,
      });
    } catch {
      /* 单个文件异常忽略，不影响整体列表 */
    }
  }
  items.sort((a, b) => b.updatedAt - a.updatedAt);
  return items;
}

/** 安全响应头：统一附加，防 MIME 嗅探、点击劫持与来源泄露。 */
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-site",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

/**
 * CORS 白名单：默认只放行本机地址与 Tauri 桌面端来源，
 * 需要追加时设置环境变量 TURBER_ALLOWED_ORIGINS（逗号分隔）。
 */
const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:8787",
  "http://localhost:8787",
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
];
const ALLOWED_ORIGINS = new Set(
  (process.env.TURBER_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .concat(DEFAULT_ALLOWED_ORIGINS),
);

/** 仅对白名单来源回写 CORS 头，不再无条件放行 *。 */
function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** 跨站写请求拦截（CSRF 基线防护）。 */
function crossSiteWrite(req) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return false;
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.has(origin)) return false;
  try {
    return new URL(origin).host !== req.headers.host;
  } catch {
    return true;
  }
}

/** 全局限流：同一来源 IP 每分钟最多 RATE_LIMIT 次接口调用。 */
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = Number(process.env.TURBER_RATE_LIMIT ?? 300);
const rateBuckets = new Map();

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

function takeRateLimit(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start >= RATE_WINDOW_MS) {
    rateBuckets.set(ip, { start: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT;
}

/** 验证码错误次数限制：同一授权 ID 连续失败 10 次后锁 10 分钟。 */
const failures = new Map();
const MAX_FAILURES = 10;
const LOCK_MS = 10 * 60 * 1000;

function failureState(authId) {
  const state = failures.get(authId);
  if (!state) return { count: 0, lockedUntil: 0 };
  if (state.lockedUntil && state.lockedUntil < Date.now()) {
    failures.delete(authId);
    return { count: 0, lockedUntil: 0 };
  }
  return state;
}

function sendJson(req, res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...SECURITY_HEADERS,
    ...corsHeaders(req),
  });
  res.end(body);
}

const MAX_BODY_BYTES = 512 * 1024;

/**
 * 读取 JSON 请求体：按字节累积后统一解码，避免多字节字符被分块截断；
 * 超过上限直接回 413，不再静默丢弃请求。
 */
function readBody(req, res) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on("data", (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        if (!res.headersSent) {
          sendJson(req, res, 413, { error: "payload_too_large", message: "请求体过大" });
        }
        req.resume();
        resolve({});
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (aborted) return;
      if (!size) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

const ERROR_TEXT = {
  invalid_id: "授权 ID 不存在",
  invalid_code: "验证码不正确",
  revoked: "该授权已被撤销",
  expired: "授权已过期，请重新生成",
  locked: "尝试次数过多，请 10 分钟后再试",
  missing: "请填写授权 ID 与验证码",
};

const LOGIN_CODE_ERROR = {
  missing: "请输入登录码",
  invalid_code: "登录码无效，请核对网页端显示的内容",
  used: "该登录码已被使用，请在网页端重新生成",
  revoked: "该登录码已被撤销",
  expired: "登录码已过期，请在网页端重新生成",
  locked: "尝试次数过多，请 10 分钟后再试",
};

/** 从 Authorization 头、请求体或查询串中取会话 token。 */
function extractToken(req, url, body) {
  const header = req.headers.authorization ?? "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return String(body?.token ?? url.searchParams.get("token") ?? "");
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error("[turber-server] 未处理异常", error);
    if (!res.headersSent) {
      sendJson(req, res, 500, { error: "internal_error", message: "服务器内部错误" });
      return;
    }
    res.end();
  });
});

async function handle(req, res) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${HOST}:${PORT}`}`);
  const path = url.pathname;

  if (!takeRateLimit(req)) {
    sendJson(req, res, 429, { error: "rate_limited", message: "请求过于频繁，请稍后再试" });
    return;
  }

  if (crossSiteWrite(req)) {
    sendJson(req, res, 403, { error: "forbidden", message: "非法来源" });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, { ...SECURITY_HEADERS, ...corsHeaders(req) });
    res.end();
    return;
  }

  if (req.method === "GET" && path.startsWith("/assets/")) {
    const name = path.slice("/assets/".length);
    if (!/^[A-Za-z0-9._-]+$/.test(name)) {
      sendJson(req, res, 404, { error: "not_found" });
      return;
    }
    try {
      const file = await readFile(join(PUBLIC_DIR, name));
      const cacheable = name !== "app.js" && name !== "app.css";
      res.writeHead(200, {
        "Content-Type": ASSET_MIME[extname(name).toLowerCase()] ?? "application/octet-stream",
        "Content-Length": file.length,
        "Cache-Control": cacheable ? "public, max-age=31536000, immutable" : "no-cache",
        ...SECURITY_HEADERS,
      });
      res.end(file);
    } catch {
      sendJson(req, res, 404, { error: "not_found" });
    }
    return;
  }

  if (req.method === "GET" && (path === "/login" || path === "/login.html")) {
    const html = renderLoginPage();
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(html),
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
    });
    res.end(html);
    return;
  }

  if (req.method === "GET" && (path === "/" || path === "/account")) {
    const html = renderAccountPage();
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(html),
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
    });
    res.end(html);
    return;
  }

  const account = ensureAccount();

  if (req.method === "GET" && path === "/api/health") {
    sendJson(req, res, 200, { ok: true, service: "turber-server" });
    return;
  }

  if (req.method === "GET" && path === "/api/account") {
    sendJson(req, res, 200, {
      account: { id: account.id, name: account.name, createdAt: account.created_at },
      authorizations: listAuthorizations(account.id),
    });
    return;
  }

  if (req.method === "POST" && path === "/api/auth/start") {
    const created = createAuthorization(account.id);
    sendJson(req, res, 201, {
      id: created.id,
      display: formatAuthId(created.id),
      code: created.code,
      status: created.status,
      createdAt: created.createdAt,
      expiresAt: created.expiresAt,
    });
    return;
  }

  if (req.method === "POST" && path === "/api/auth/revoke") {
    const body = await readBody(req, res);
    const ok = revokeAuthorization(account.id, body.id);
    sendJson(req, res, ok ? 200 : 404, ok ? { ok: true } : { error: "not_found" });
    return;
  }

  if (req.method === "POST" && path === "/api/auth/verify") {
    const body = await readBody(req, res);
    const authId = String(body.authId ?? body.id ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    const code = String(body.code ?? "");
    if (!authId || !code) {
      sendJson(req, res, 400, { error: "missing", message: ERROR_TEXT.missing });
      return;
    }

    const state = failureState(authId);
    if (state.lockedUntil && state.lockedUntil > Date.now()) {
      sendJson(req, res, 429, { error: "locked", message: ERROR_TEXT.locked });
      return;
    }

    const result = verifyAuthorization(authId, code);
    if (!result.ok) {
      const next = { count: state.count + 1, lockedUntil: 0 };
      if (next.count >= MAX_FAILURES) next.lockedUntil = Date.now() + LOCK_MS;
      failures.set(authId, next);
      sendJson(req, res, 400, {
        error: result.error,
        message: ERROR_TEXT[result.error] ?? "授权失败",
        remaining: Math.max(0, MAX_FAILURES - next.count),
      });
      return;
    }

    failures.delete(authId);
    sendJson(req, res, 200, {
      ok: true,
      token: result.token,
      account: result.account,
      authorizationId: result.authorizationId,
    });
    return;
  }

  if (req.method === "GET" && path === "/api/session") {
    const token = url.searchParams.get("token") ?? "";
    const userSession = userSessionFor(token);
    if (userSession) {
      sendJson(req, res, 200, userSession);
      return;
    }
    const session = sessionFor(token);
    sendJson(req, res, session ? 200 : 401, session ?? { error: "unauthorized" });
    return;
  }

  if (req.method === "POST" && path === "/api/logout") {
    const body = await readBody(req, res);
    dropUserSession(body.token);
    dropSession(body.token);
    sendJson(req, res, 200, { ok: true });
    return;
  }

  /* ── 用户名 + 密码：登录 / 注册（暂未开放）/ 用户列表 ─────────────── */

  if (req.method === "POST" && path === "/api/login") {
    const body = await readBody(req, res);
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!username || !password) {
      sendJson(req, res, 400, { error: "missing", message: ERROR_TEXT.missing });
      return;
    }

    const key = `u:${username.toLowerCase()}`;
    const state = failureState(key);
    if (state.lockedUntil && state.lockedUntil > Date.now()) {
      sendJson(req, res, 429, { error: "locked", message: ERROR_TEXT.locked });
      return;
    }

    const result = loginUser(username, password);
    if (!result.ok) {
      const next = { count: state.count + 1, lockedUntil: 0 };
      if (next.count >= MAX_FAILURES) next.lockedUntil = Date.now() + LOCK_MS;
      failures.set(key, next);
      sendJson(req, res, 401, {
        error: result.error,
        message: "用户名或密码不正确",
        remaining: Math.max(0, MAX_FAILURES - next.count),
      });
      return;
    }

    failures.delete(key);
    sendJson(req, res, 200, { ok: true, token: result.token, user: result.user });
    return;
  }

  if (req.method === "POST" && path === "/api/register") {
    const result = registerUser();
    sendJson(req, res, 501, { error: result.error, message: "注册暂未开放" });
    return;
  }

  if (req.method === "GET" && path === "/api/users") {
    if (!userSessionFor(extractToken(req, url))) {
      sendJson(req, res, 401, { error: "unauthorized", message: "请先登录" });
      return;
    }
    sendJson(req, res, 200, {
      users: listUsers().map((user) => ({ ...user, sessions: countUserSessions(user.id) })),
    });
    return;
  }

  /* ── 账户资料：头像 / 显示名 / 密码，均需登录态 ─────────────────── */

  if (req.method === "GET" && path === "/api/profile") {
    const session = userSessionFor(extractToken(req, url));
    if (!session) {
      sendJson(req, res, 401, { error: "unauthorized", message: "请先登录" });
      return;
    }
    sendJson(req, res, 200, { user: session.user });
    return;
  }

  if (req.method === "POST" && path === "/api/profile/name") {
    const body = await readBody(req, res);
    const session = userSessionFor(extractToken(req, url, body));
    if (!session) {
      sendJson(req, res, 401, { error: "unauthorized", message: "请先登录" });
      return;
    }
    const result = updateUserName(session.user.id, body.displayName);
    if (!result.ok) {
      sendJson(req, res, 400, { error: "invalid_name", message: "名字长度需在 1~24 个字符" });
      return;
    }
    sendJson(req, res, 200, { ok: true, user: result.user });
    return;
  }

  if (req.method === "POST" && path === "/api/profile/avatar") {
    const body = await readBody(req, res);
    const session = userSessionFor(extractToken(req, url, body));
    if (!session) {
      sendJson(req, res, 401, { error: "unauthorized", message: "请先登录" });
      return;
    }
    const result = updateUserAvatar(session.user.id, body.avatar);
    if (!result.ok) {
      sendJson(req, res, 400, { error: "invalid_avatar", message: "头像格式不正确或图片过大" });
      return;
    }
    sendJson(req, res, 200, { ok: true, user: result.user });
    return;
  }

  if (req.method === "POST" && path === "/api/profile/password") {
    const body = await readBody(req, res);
    const session = userSessionFor(extractToken(req, url, body));
    if (!session) {
      sendJson(req, res, 401, { error: "unauthorized", message: "请先登录" });
      return;
    }
    const result = changeUserPassword(session.user.id, body.oldPassword, body.newPassword);
    if (!result.ok) {
      const message = result.error === "weak_password" ? "新密码至少 6 位" : "原密码不正确";
      sendJson(req, res, 400, { error: result.error, message });
      return;
    }
    sendJson(req, res, 200, { ok: true });
    return;
  }

  /* ── 登录码：网页端登录后生成，用户端只输入这串码 ───────────────── */

  if (req.method === "GET" && path === "/api/login-code") {
    const session = userSessionFor(extractToken(req, url));
    if (!session) {
      sendJson(req, res, 401, { error: "unauthorized", message: "请先在网页端登录" });
      return;
    }
    sendJson(req, res, 200, { user: session.user, codes: listLoginCodes(session.user.id) });
    return;
  }

  if (req.method === "POST" && path === "/api/login-code") {
    const body = await readBody(req, res);
    const session = userSessionFor(extractToken(req, url, body));
    if (!session) {
      sendJson(req, res, 401, { error: "unauthorized", message: "请先在网页端登录" });
      return;
    }
    const created = createLoginCode(session.user.id);
    sendJson(req, res, 201, { ok: true, code: created, user: session.user });
    return;
  }

  if (req.method === "POST" && path === "/api/login-code/revoke") {
    const body = await readBody(req, res);
    const session = userSessionFor(extractToken(req, url, body));
    if (!session) {
      sendJson(req, res, 401, { error: "unauthorized", message: "请先在网页端登录" });
      return;
    }
    const result = revokeLoginCode(session.user.id, body.id);
    sendJson(req, res, result.ok ? 200 : 404, result.ok ? { ok: true } : { error: result.error });
    return;
  }

  if (req.method === "POST" && path === "/api/login-code/redeem") {
    const body = await readBody(req, res);
    const raw = String(body.code ?? "");
    const normalized = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (!normalized) {
      sendJson(req, res, 400, { error: "missing", message: LOGIN_CODE_ERROR.missing });
      return;
    }

    const key = `c:${normalized}`;
    const state = failureState(key);
    if (state.lockedUntil && state.lockedUntil > Date.now()) {
      sendJson(req, res, 429, { error: "locked", message: LOGIN_CODE_ERROR.locked });
      return;
    }

    const result = redeemLoginCode(normalized);
    if (!result.ok) {
      const next = { count: state.count + 1, lockedUntil: 0 };
      if (next.count >= MAX_FAILURES) next.lockedUntil = Date.now() + LOCK_MS;
      failures.set(key, next);
      sendJson(req, res, 400, {
        error: result.error,
        message: LOGIN_CODE_ERROR[result.error] ?? "登录失败",
      });
      return;
    }

    failures.delete(key);
    sendJson(req, res, 200, { ok: true, token: result.token, user: result.user });
    return;
  }

  /* ── 活动看板：聚合当前登录用户的账户动态 ─────────────────────── */

  if (req.method === "GET" && path === "/api/activity") {
    const session = userSessionFor(extractToken(req, url));
    if (!session) {
      sendJson(req, res, 401, { error: "unauthorized", message: "请先在网页端登录" });
      return;
    }
    const activity = listUserActivity(session.user.id);
    if (!activity) {
      sendJson(req, res, 404, { error: "not_found" });
      return;
    }
    sendJson(req, res, 200, activity);
    return;
  }

  /* ── 产品下载：清单来自 public/downloads 的真实文件 ─────────────── */

  if (req.method === "GET" && path === "/api/products") {
    sendJson(req, res, 200, { items: await listDownloadItems() });
    return;
  }

  if (req.method === "GET" && path.startsWith("/downloads/")) {
    const name = decodeURIComponent(path.slice("/downloads/".length));
    const items = await listDownloadItems();
    if (!items.some((item) => item.fileName === name)) {
      sendJson(req, res, 404, { error: "not_found" });
      return;
    }
    try {
      const file = await readFile(join(DOWNLOAD_DIR, name));
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": file.length,
        "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-cache",
        ...SECURITY_HEADERS,
      });
      res.end(file);
    } catch {
      sendJson(req, res, 404, { error: "not_found" });
    }
    return;
  }

  sendJson(req, res, 404, { error: "not_found" });
}

server.headersTimeout = 15_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 10_000;

/** 定时清理过期的限流桶与失败计数，避免 Map 无界增长。 */
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) {
    if (now - bucket.start >= RATE_WINDOW_MS) rateBuckets.delete(ip);
  }
  for (const [key, state] of failures) {
    if (state.lockedUntil && state.lockedUntil < now) failures.delete(key);
  }
}, RATE_WINDOW_MS);
sweeper.unref();

server.listen(PORT, HOST, () => {
  ensureAccount();
  ensureSeedUsers();
  console.log(`[turber-server] 账户页  http://${HOST}:${PORT}/`);
  console.log(`[turber-server] 数据库  ${DB_PATH}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`[turber-server] 收到 ${signal}，正在关闭…`);
    clearInterval(sweeper);
    server.close(() => {
      try {
        db.close();
      } catch {
        /* 关闭时忽略 */
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
