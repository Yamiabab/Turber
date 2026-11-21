use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

const SKIP_DIRS: [&str; 12] = [
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".svelte-kit",
    "__pycache__",
    ".idea",
    ".vscode",
    "vendor",
];

const WRITE_DENY: [&str; 4] = [
    "c:\\windows",
    "c:\\program files",
    "c:\\program files (x86)",
    "c:\\programdata",
];

const MAX_TEXT_BYTES: u64 = 2 * 1024 * 1024;
const MAX_READ_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    pub path: String,
    pub rel: String,
    pub line: usize,
    pub text: String,
}

fn state_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("ide-state.json"))
}

fn compile_time_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn saved_root(app: &tauri::AppHandle) -> Option<PathBuf> {
    let path = state_file(app).ok()?;
    let raw = fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let root = value.get("root")?.as_str()?.to_string();
    let path = PathBuf::from(root);
    if path.is_dir() { Some(path) } else { None }
}

fn persist_root(app: &tauri::AppHandle, root: &Path) -> Result<(), String> {
    let path = state_file(app)?;
    let value = serde_json::json!({ "root": root.to_string_lossy() });
    fs::write(path, value.to_string()).map_err(|e| e.to_string())
}

fn guard_write(path: &Path) -> Result<(), String> {
    let text = path.to_string_lossy().to_lowercase().replace('/', "\\");
    if WRITE_DENY.iter().any(|deny| text.starts_with(deny)) {
        return Err("该路径属于系统受保护目录，已拒绝写入".into());
    }
    if path.parent().is_none() {
        return Err("不能操作磁盘根目录".into());
    }
    Ok(())
}

fn current_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(root) = saved_root(app) {
        return Ok(root);
    }
    let root = compile_time_root();
    if root.is_dir() {
        Ok(root)
    } else {
        Err("尚未选择工作区文件夹".into())
    }
}

#[tauri::command]
pub fn ide_get_root(app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(current_root(&app).ok().map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn ide_pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    let Some(folder) = picked else {
        return Ok(None);
    };
    let path = folder.into_path().map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn ide_set_root(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("文件夹不存在: {path}"));
    }
    persist_root(&app, &root)?;
    Ok(root.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn ide_list_dir(path: String) -> Result<Vec<Entry>, String> {
    let dir = PathBuf::from(&path);
    let mut entries = Vec::new();
    for item in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let Ok(item) = item else { continue };
        let item_path = item.path();
        let name = item.file_name().to_string_lossy().into_owned();
        let meta = match item.metadata() {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        entries.push(Entry {
            name,
            path: item_path.to_string_lossy().into_owned(),
            is_dir: meta.is_dir(),
            size: meta.len(),
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
pub fn ide_read_file(path: String) -> Result<String, String> {
    let file = PathBuf::from(&path);
    let meta = fs::metadata(&file).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("目标不是文件".into());
    }
    if meta.len() > MAX_READ_BYTES {
        return Err(format!("文件过大（{} MB），已跳过", meta.len() / 1024 / 1024));
    }
    let bytes = fs::read(&file).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[tauri::command]
pub fn ide_write_file(path: String, content: String) -> Result<(), String> {
    let file = PathBuf::from(&path);
    guard_write(&file)?;
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&file, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ide_create_entry(path: String, is_dir: bool) -> Result<(), String> {
    let target = PathBuf::from(&path);
    guard_write(&target)?;
    if target.exists() {
        return Err("同名文件或文件夹已存在".into());
    }
    if is_dir {
        fs::create_dir_all(&target).map_err(|e| e.to_string())
    } else {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&target, "").map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn ide_delete_entry(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    guard_write(&target)?;
    if let Ok(root) = current_root(&app) {
        if target == root {
            return Err("不能删除工作区根目录".into());
        }
    }
    if !target.exists() {
        return Err("目标不存在".into());
    }
    if target.is_dir() {
        fs::remove_dir_all(&target).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&target).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn ide_rename_entry(from: String, to: String) -> Result<(), String> {
    let src = PathBuf::from(&from);
    let dst = PathBuf::from(&to);
    guard_write(&src)?;
    guard_write(&dst)?;
    if dst.exists() {
        return Err("目标名称已存在".into());
    }
    fs::rename(&src, &dst).map_err(|e| e.to_string())
}

fn collect_files(root: &Path, limit: usize) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if out.len() >= limit {
            break;
        }
        let Ok(read) = fs::read_dir(&dir) else { continue };
        for item in read.flatten() {
            let path = item.path();
            let name = item.file_name().to_string_lossy().into_owned();
            if path.is_dir() {
                if SKIP_DIRS.contains(&name.as_str()) {
                    continue;
                }
                stack.push(path);
            } else {
                out.push(path);
                if out.len() >= limit {
                    break;
                }
            }
        }
    }
    out
}

#[tauri::command]
pub fn ide_list_files(root: String, limit: Option<usize>) -> Result<Vec<String>, String> {
    let base = PathBuf::from(&root);
    let cap = limit.unwrap_or(20_000).min(20_000);
    let mut rels: Vec<String> = collect_files(&base, cap)
        .into_iter()
        .filter_map(|path| {
            path.strip_prefix(&base)
                .ok()
                .map(|rel| rel.to_string_lossy().replace('\\', "/"))
        })
        .collect();
    rels.sort();
    Ok(rels)
}

#[tauri::command]
pub fn ide_search(
    root: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<Hit>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let base = PathBuf::from(&root);
    let cap = max_results.unwrap_or(200).min(500);
    let needle = query.to_lowercase();
    let mut hits: Vec<Hit> = Vec::new();

    for file in collect_files(&base, 20_000) {
        if hits.len() >= cap {
            break;
        }
        let Ok(meta) = fs::metadata(&file) else { continue };
        if meta.len() > MAX_TEXT_BYTES {
            continue;
        }
        let Ok(bytes) = fs::read(&file) else { continue };
        if bytes.iter().take(2048).any(|byte| *byte == 0) {
            continue;
        }
        let text = String::from_utf8_lossy(&bytes);
        if !text.to_lowercase().contains(&needle) {
            continue;
        }
        let rel = file
            .strip_prefix(&base)
            .map(|value| value.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        for (index, line) in text.lines().enumerate() {
            if hits.len() >= cap {
                break;
            }
            if line.to_lowercase().contains(&needle) {
                hits.push(Hit {
                    path: file.to_string_lossy().into_owned(),
                    rel: rel.clone(),
                    line: index + 1,
                    text: line.trim().chars().take(240).collect(),
                });
            }
        }
    }

    Ok(hits)
}
