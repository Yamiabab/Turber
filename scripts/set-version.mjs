#!/usr/bin/env node
/**
 * 将版本号同步写入项目内全部版本承载文件。
 * 用途：CI 中由 workflow 传入版本号，一次性覆盖 package.json / tauri.conf.json / Cargo.toml / Cargo.lock，
 *      避免三处版本漂移导致的产物命名混乱或 MSI 构建报错。
 *
 * 用法: node scripts/set-version.mjs 26.0.2
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const version = (process.argv[2] || process.env.TURBER_VERSION || "").trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`[set-version] 非法版本号: "${version}"（需为纯数字 x.y.z）`);
  process.exit(1);
}

function patch(rel, regexp, replace) {
  if (!existsSync(rel)) {
    console.log(`[set-version] 跳过（不存在）: ${rel}`);
    return;
  }
  const before = readFileSync(rel, "utf8");
  const after = before.replace(regexp, replace);
  if (after === before) {
    console.log(`[set-version] 无需修改: ${rel}`);
    return;
  }
  writeFileSync(rel, after, "utf8");
  console.log(`[set-version] 已写入 ${version}: ${rel}`);
}

// package.json：首个 "version" 字段
patch("package.json", /("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);

// tauri.conf.json：顶层 version
patch("src-tauri/tauri.conf.json", /("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);

// Cargo.toml：[package] 段内的 version
patch(
  "src-tauri/Cargo.toml",
  /(^\[package\][\s\S]*?^version\s*=\s*")[^"]*(")/m,
  `$1${version}$2`,
);

// Cargo.lock：本 crate 的锁定版本，避免离线/锁定构建出现版本不一致
patch(
  "src-tauri/Cargo.lock",
  /(name = "turber"\r?\nversion = ")[^"]*(")/,
  `$1${version}$2`,
);

console.log(`[set-version] 完成，目标版本 ${version}`);
