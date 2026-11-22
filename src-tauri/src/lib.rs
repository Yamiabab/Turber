mod ai;
mod asr;
mod ide;
mod kws;
mod screen;
mod store;
mod tts;
mod voice;

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use tauri::Manager;

fn css_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("user.css"))
}

#[tauri::command]
fn load_user_css(app: tauri::AppHandle) -> Result<String, String> {
    let path = css_file(&app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_user_css(app: tauri::AppHandle, css: String) -> Result<(), String> {
    let path = css_file(&app)?;
    fs::write(path, css).map_err(|error| error.to_string())
}

fn css_overrides_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("css-overrides");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn override_file_name(key: &str) -> Result<String, String> {
    if key.is_empty() || key.contains("..") || key.contains(':') {
        return Err(format!("invalid css key: {key}"));
    }
    Ok(format!("{}.css", key.replace(['/', '\\'], "__")))
}

fn override_key_from_file(name: &str) -> String {
    let stem = name.strip_suffix(".css").unwrap_or(name);
    stem.replace("__", "/")
}

#[tauri::command]
fn load_css_overrides(app: tauri::AppHandle) -> Result<HashMap<String, String>, String> {
    let dir = css_overrides_dir(&app)?;
    let mut map = HashMap::new();
    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("css") {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let css = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        map.insert(override_key_from_file(name), css);
    }
    Ok(map)
}

#[tauri::command]
fn save_css_overrides(
    app: tauri::AppHandle,
    overrides: HashMap<String, String>,
) -> Result<(), String> {
    let dir = css_overrides_dir(&app)?;
    for entry in fs::read_dir(&dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) == Some("css") {
            fs::remove_file(&path).map_err(|error| error.to_string())?;
        }
    }
    for (key, css) in overrides {
        let name = override_file_name(&key)?;
        fs::write(dir.join(name), css).map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// 前端诊断打点：把前端关键节点写进与 Rust 相同的诊断文件
#[tauri::command]
fn diag_log(msg: String) {
    ai::diag(&format!("[ui] {msg}"));
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let target = url.trim().to_string();
    if !(target.starts_with("http://") || target.starts_with("https://")) {
        return Err("只允许打开 http/https 网址".to_string());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .args(["/C", "start", "", target.as_str()])
            .creation_flags(0x0800_0000)
            .spawn()
            .map_err(|error| format!("打开浏览器失败：{error}"))?;
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        Err("当前平台暂不支持".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    voice::start_music_watcher();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            voice::spawn_startup(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_user_css,
            save_user_css,
            load_css_overrides,
            save_css_overrides,
            open_external,
            diag_log,
            voice::music_playing,
            voice::music_level,
            voice::expand_window,
            voice::collapse_window,
            voice::voice_wake_start,
            voice::voice_wake_state,
            voice::voice_wake_now,
            voice::tts_voices,
            voice::wake_reply,
            voice::speak,
            voice::speak_stop,
            ide::ide_get_root,
            ide::ide_pick_folder,
            ide::ide_set_root,
            ide::ide_list_dir,
            ide::ide_read_file,
            ide::ide_write_file,
            ide::ide_create_entry,
            ide::ide_delete_entry,
            ide::ide_rename_entry,
            ide::ide_list_files,
            ide::ide_search,
            ai::chat_stream,
            ai::cancel_chat,
            store::list_sessions,
            store::list_all_messages,
            store::save_session,
            store::delete_session,
            store::clear_sessions,
            store::save_message,
            store::update_message,
            screen::screen_foreground,
            screen::screen_capture,
            screen::input_mouse_move,
            screen::cursor_position,
            screen::input_mouse_button,
            screen::input_mouse_scroll,
            screen::input_keys,
            screen::input_key_down,
            screen::input_key_up,
            screen::input_type_text,
            screen::emergency_watch_start,
            screen::emergency_watch_stop
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
