import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** 口令散列：scrypt + 随机盐，数据库中不落明文。 */
export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  try {
    const actual = scryptSync(String(password), String(salt), 64);
    const expected = Buffer.from(String(expectedHash), "hex");
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("hex");
}
