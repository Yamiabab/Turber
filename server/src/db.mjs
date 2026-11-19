import { DatabaseSync } from "node:sqlite";
import { randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword, randomToken, verifyPassword } from "./auth.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(here, "..", "data");
export const DB_PATH = process.env.TURBER_DB ?? join(DATA_DIR, "turber.db");

mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS accounts (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS authorizations (
    id             TEXT PRIMARY KEY,
    account_id     TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    code           TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending',
    created_at     INTEGER NOT NULL,
    expires_at     INTEGER NOT NULL,
    authorized_at  INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token             TEXT PRIMARY KEY,
    account_id        TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    authorization_id  TEXT,
    created_at        INTEGER NOT NULL,
    last_seen_at      INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_auth_account ON authorizations(account_id);
  CREATE INDEX IF NOT EXISTS idx_session_account ON sessions(account_id);

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt          TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    token         TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    INTEGER NOT NULL,
    last_seen_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_user_session ON user_sessions(user_id);

  CREATE TABLE IF NOT EXISTS login_codes (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code        TEXT NOT NULL UNIQUE,
    status      TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    used_at     INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_login_code_user ON login_codes(user_id);
`);

/** 老库兼容：avatar 是后加字段，启动时按需补列（幂等）。 */
function ensureUserColumns() {
  const columns = db
    .prepare("PRAGMA table_info(users)")
    .all()
    .map((column) => column.name);
  if (!columns.includes("avatar")) {
    db.prepare("ALTER TABLE users ADD COLUMN avatar TEXT").run();
  }
}

ensureUserColumns();

/** 授权 ID 字母表：去掉 0/O/1/I 等易混字符。 */
const ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** 用密码学随机数取字符，避免 Math.random 可预测导致授权码被推算。 */
function randomFrom(alphabet, length) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[randomInt(alphabet.length)];
  }
  return out;
}

export function normalizeAuthId(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 16);
}

export function normalizeCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function formatAuthId(id) {
  return (id.match(/.{1,4}/g) ?? []).join("-");
}

export function formatCode(accountId, suffix) {
  return `TB-${accountId}-${suffix}`;
}

function uniqueAuthId() {
  for (;;) {
    const id = randomFrom(ID_ALPHABET, 16);
    const hit = db.prepare("SELECT 1 FROM authorizations WHERE id = ?").get(id);
    if (!hit) return id;
  }
}

function uniqueAccountId() {
  for (;;) {
    const id = `1${randomFrom("0123456789", 9)}`;
    const hit = db.prepare("SELECT 1 FROM accounts WHERE id = ?").get(id);
    if (!hit) return id;
  }
}

/** 本机单账户：首次启动时创建，之后复用。 */
export function ensureAccount() {
  const existing = db.prepare("SELECT * FROM accounts ORDER BY created_at ASC LIMIT 1").get();
  if (existing) return existing;
  const id = uniqueAccountId();
  const now = Date.now();
  db.prepare("INSERT INTO accounts (id, name, created_at) VALUES (?, ?, ?)").run(id, "本机账户", now);
  return db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
}

const AUTH_TTL_MS = 24 * 60 * 60 * 1000;

export function createAuthorization(accountId) {
  const id = uniqueAuthId();
  const suffix = randomFrom(CODE_ALPHABET, 4);
  const code = formatCode(accountId, suffix);
  const now = Date.now();
  const expiresAt = now + AUTH_TTL_MS;
  db.prepare(
    "INSERT INTO authorizations (id, account_id, code, status, created_at, expires_at) VALUES (?, ?, ?, 'pending', ?, ?)",
  ).run(id, accountId, code, now, expiresAt);
  return { id, code, createdAt: now, expiresAt, status: "pending" };
}

export function listAuthorizations(accountId) {
  const now = Date.now();
  return db
    .prepare("SELECT * FROM authorizations WHERE account_id = ? ORDER BY created_at DESC LIMIT 20")
    .all(accountId)
    .map((row) => ({
      id: row.id,
      display: formatAuthId(row.id),
      code: row.code,
      status: row.status === "pending" && row.expires_at < now ? "expired" : row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      authorizedAt: row.authorized_at ?? null,
    }));
}

/** 活跃会话数量（会话在退出登录时删除）。 */
export function countSessions(accountId) {
  const row = db.prepare("SELECT COUNT(*) AS total FROM sessions WHERE account_id = ?").get(accountId);
  return Number(row?.total ?? 0);
}

export function revokeAuthorization(accountId, id) {
  const normalized = normalizeAuthId(id);
  const result = db
    .prepare("UPDATE authorizations SET status = 'revoked' WHERE id = ? AND account_id = ?")
    .run(normalized, accountId);
  return result.changes > 0;
}

export function verifyAuthorization(authId, code) {
  const normalizedId = normalizeAuthId(authId);
  const normalizedCode = normalizeCode(code);
  const row = db.prepare("SELECT * FROM authorizations WHERE id = ?").get(normalizedId);
  if (!row) return { ok: false, error: "invalid_id" };
  if (row.code !== normalizedCode) return { ok: false, error: "invalid_code" };
  if (row.status === "revoked") return { ok: false, error: "revoked" };
  if (row.expires_at < Date.now()) return { ok: false, error: "expired" };

  const now = Date.now();
  const token = `tbt_${randomFrom("0123456789abcdef", 32)}`;
  db.prepare("UPDATE authorizations SET status = 'authorized', authorized_at = ? WHERE id = ?").run(
    now,
    row.id,
  );
  db.prepare(
    "INSERT INTO sessions (token, account_id, authorization_id, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
  ).run(token, row.account_id, row.id, now, now);
  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(row.account_id);
  return { ok: true, token, account: publicAccount(account), authorizationId: row.id };
}

export function sessionFor(token) {
  if (!token) return null;
  const row = db.prepare("SELECT * FROM sessions WHERE token = ?").get(String(token));
  if (!row) return null;
  db.prepare("UPDATE sessions SET last_seen_at = ? WHERE token = ?").run(Date.now(), row.token);
  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(row.account_id);
  if (!account) return null;
  return { token: row.token, account: publicAccount(account) };
}

export function dropSession(token) {
  if (!token) return false;
  return db.prepare("DELETE FROM sessions WHERE token = ?").run(String(token)).changes > 0;
}

export function publicAccount(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

/* ── 用户（用户名 + 密码）────────────────────────────────────────────── */

/** 预置账号：首次启动写入数据库，已存在则跳过。 */
const SEED_USERS = [{ username: "yami", password: "Wsq20141108", displayName: "yami" }];

function uniqueUserId() {
  for (;;) {
    const id = `1${randomFrom("0123456789", 9)}`;
    const hit = db.prepare("SELECT 1 FROM users WHERE id = ?").get(id);
    if (!hit) return id;
  }
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatar: row.avatar ?? null,
    createdAt: row.created_at,
  };
}

export function ensureSeedUsers() {
  for (const seed of SEED_USERS) {
    const username = seed.username.toLowerCase();
    const existing = db.prepare("SELECT 1 FROM users WHERE username = ?").get(username);
    if (existing) continue;
    const { salt, hash } = hashPassword(seed.password);
    db.prepare(
      "INSERT INTO users (id, username, display_name, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(uniqueUserId(), username, seed.displayName, hash, salt, Date.now());
  }
}

export function listUsers() {
  return db
    .prepare("SELECT * FROM users ORDER BY created_at ASC")
    .all()
    .map((row) => publicUser(row));
}

export function findUserByName(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(String(username ?? "").trim().toLowerCase()) ?? null;
}

/** 用户名 + 密码校验；成功返回用户与新建的会话令牌。 */
export function loginUser(username, password) {
  const row = findUserByName(username);
  if (!row) return { ok: false, error: "invalid_credentials" };
  if (!verifyPassword(password, row.salt, row.password_hash)) {
    return { ok: false, error: "invalid_credentials" };
  }
  const token = `tbt_${randomToken(24)}`;
  const now = Date.now();
  db.prepare(
    "INSERT INTO user_sessions (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
  ).run(token, row.id, now, now);
  return { ok: true, token, user: publicUser(row) };
}

export function userSessionFor(token) {
  if (!token) return null;
  const row = db.prepare("SELECT * FROM user_sessions WHERE token = ?").get(String(token));
  if (!row) return null;
  db.prepare("UPDATE user_sessions SET last_seen_at = ? WHERE token = ?").run(Date.now(), row.token);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id);
  if (!user) return null;
  return { token: row.token, user: publicUser(user) };
}

export function dropUserSession(token) {
  if (!token) return false;
  return db.prepare("DELETE FROM user_sessions WHERE token = ?").run(String(token)).changes > 0;
}

export function countUserSessions(userId) {
  const row = db.prepare("SELECT COUNT(*) AS total FROM user_sessions WHERE user_id = ?").get(userId);
  return Number(row?.total ?? 0);
}

/* ────────────────────────── 账户资料 ────────────────────────── */

const AVATAR_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;
const AVATAR_MAX_LENGTH = 400000;

/** 按 ID 取原始用户行，找不到返回 null。 */
export function getUserById(id) {
  if (!id) return null;
  return db.prepare("SELECT * FROM users WHERE id = ?").get(String(id)) ?? null;
}

/** 修改显示名：1~24 个字符，成功后返回最新的公开用户。 */
export function updateUserName(userId, displayName) {
  const name = String(displayName ?? "").trim();
  if (name.length < 1 || name.length > 24) return { ok: false, error: "invalid_name" };
  const row = getUserById(userId);
  if (!row) return { ok: false, error: "invalid_user" };
  db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(name, row.id);
  return { ok: true, user: publicUser(getUserById(row.id)) };
}

/** 修改头像：只接受 png/jpeg/webp 的 base64 dataURL，且不超过 400000 字符。 */
export function updateUserAvatar(userId, avatar) {
  const value = String(avatar ?? "");
  if (value.length > AVATAR_MAX_LENGTH || !AVATAR_PATTERN.test(value)) {
    return { ok: false, error: "invalid_avatar" };
  }
  const row = getUserById(userId);
  if (!row) return { ok: false, error: "invalid_user" };
  db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(value, row.id);
  return { ok: true, user: publicUser(getUserById(row.id)) };
}

/** 修改密码：校验原密码，新密码长度 6~72，成功后换新盐与新 hash。 */
export function changeUserPassword(userId, oldPassword, newPassword) {
  const row = getUserById(userId);
  if (!row) return { ok: false, error: "invalid_password" };
  if (!verifyPassword(String(oldPassword ?? ""), row.salt, row.password_hash)) {
    return { ok: false, error: "invalid_password" };
  }
  const next = String(newPassword ?? "");
  if (next.length < 6 || next.length > 72) return { ok: false, error: "weak_password" };
  const { salt, hash } = hashPassword(next);
  db.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?").run(hash, salt, row.id);
  return { ok: true };
}

/** 注册暂未开放：保留函数签名，便于后续打开。 */
export function registerUser() {
  return { ok: false, error: "register_closed" };
}

/* ── 登录码：网页端登录后生成，客户端只输入这串码 ───────────────── */

/** 登录码有效期：15 分钟，一次性使用。 */
const LOGIN_CODE_TTL_MS = 15 * 60 * 1000;

function uniqueLoginCode() {
  for (;;) {
    const code = randomFrom(CODE_ALPHABET, 16);
    const hit = db.prepare("SELECT 1 FROM login_codes WHERE code = ?").get(code);
    if (!hit) return code;
  }
}

function publicLoginCode(row) {
  const now = Date.now();
  const status = row.status === "pending" && row.expires_at < now ? "expired" : row.status;
  return {
    id: row.id,
    code: row.code,
    display: formatAuthId(row.code),
    status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at ?? null,
  };
}

export function createLoginCode(userId) {
  const id = uniqueAuthId();
  const code = uniqueLoginCode();
  const now = Date.now();
  db.prepare(
    "INSERT INTO login_codes (id, user_id, code, status, created_at, expires_at, used_at) VALUES (?, ?, ?, 'pending', ?, ?, NULL)",
  ).run(id, userId, code, now, now + LOGIN_CODE_TTL_MS);
  return publicLoginCode(db.prepare("SELECT * FROM login_codes WHERE id = ?").get(id));
}

export function listLoginCodes(userId) {
  return db
    .prepare("SELECT * FROM login_codes WHERE user_id = ? ORDER BY created_at DESC LIMIT 20")
    .all(userId)
    .map(publicLoginCode);
}

export function revokeLoginCode(userId, id) {
  const row = db.prepare("SELECT * FROM login_codes WHERE id = ? AND user_id = ?").get(String(id), userId);
  if (!row) return { ok: false, error: "not_found" };
  if (row.status === "pending") {
    db.prepare("UPDATE login_codes SET status = 'revoked' WHERE id = ?").run(row.id);
  }
  return { ok: true };
}

/** 客户端凭登录码换会话；码一次性、15 分钟内有效。 */
export function redeemLoginCode(rawCode) {
  const code = String(rawCode ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
  if (!code) return { ok: false, error: "missing" };

  const row = db.prepare("SELECT * FROM login_codes WHERE code = ?").get(code);
  if (!row) return { ok: false, error: "invalid_code" };
  if (row.status === "revoked") return { ok: false, error: "revoked" };
  if (row.status === "used") return { ok: false, error: "used" };
  if (row.expires_at < Date.now()) return { ok: false, error: "expired" };

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id);
  if (!user) return { ok: false, error: "invalid_code" };

  const now = Date.now();
  const token = `tbt_${randomToken(24)}`;
  db.prepare("UPDATE login_codes SET status = 'used', used_at = ? WHERE id = ?").run(now, row.id);
  db.prepare(
    "INSERT INTO user_sessions (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
  ).run(token, user.id, now, now);
  return { ok: true, token, user: publicUser(user) };
}


/**
 * 用户活动看板：聚合注册信息、网页登录会话与登录码流水，供网页端「活动」页展示。
 * 只做只读聚合，不新增表。
 */
export function listUserActivity(userId) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) return null;

  const now = Date.now();
  const codes = db
    .prepare("SELECT * FROM login_codes WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
    .all(userId);
  const sessions = db
    .prepare("SELECT * FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
    .all(userId);

  const events = [];
  for (const row of codes) {
    const display = formatAuthId(row.code);
    events.push({ id: `code-created-${row.id}`, type: "code.created", at: row.created_at, detail: display });
    if (row.used_at) {
      events.push({ id: `code-used-${row.id}`, type: "code.redeemed", at: row.used_at, detail: display });
    } else if (row.status === "revoked") {
      events.push({ id: `code-revoked-${row.id}`, type: "code.revoked", at: row.created_at, detail: display });
    } else if (row.expires_at < now) {
      events.push({ id: `code-expired-${row.id}`, type: "code.expired", at: row.expires_at, detail: display });
    }
  }
  for (const row of sessions) {
    events.push({
      id: `session-${String(row.token).slice(-10)}`,
      type: "session.login",
      at: row.created_at,
      detail: "",
    });
  }
  events.sort((a, b) => b.at - a.at);

  return {
    stats: {
      joinedAt: user.created_at,
      webLogins: sessions.length,
      lastActiveAt: sessions.reduce((max, row) => Math.max(max, row.last_seen_at ?? 0), 0) || null,
      codesTotal: codes.length,
      codesUsed: codes.filter((row) => row.status === "used").length,
      codesPending: codes.filter((row) => row.status === "pending" && row.expires_at > now).length,
    },
    events: events.slice(0, 30),
  };
}
