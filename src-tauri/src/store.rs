use std::path::PathBuf;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRow {
    pub id: String,
    pub title: String,
    pub provider: String,
    pub model: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageRow {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub created_at: i64,
}

fn connect(app: &tauri::AppHandle) -> Result<Connection, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let file: PathBuf = dir.join("turber.chat.db");
    let connection = Connection::open(file).map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                provider TEXT NOT NULL DEFAULT '',
                model TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);",
        )
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

#[tauri::command]
pub fn list_sessions(app: tauri::AppHandle) -> Result<Vec<SessionRow>, String> {
    let connection = connect(&app)?;
    let mut statement = connection
        .prepare("SELECT id, title, provider, model, created_at, updated_at FROM sessions ORDER BY updated_at DESC")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(SessionRow {
                id: row.get(0)?,
                title: row.get(1)?,
                provider: row.get(2)?,
                model: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut result = Vec::new();
    for item in rows {
        result.push(item.map_err(|error| error.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn list_all_messages(app: tauri::AppHandle) -> Result<Vec<MessageRow>, String> {
    let connection = connect(&app)?;
    let mut statement = connection
        .prepare("SELECT id, session_id, role, content, created_at FROM messages ORDER BY created_at ASC")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(MessageRow {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut result = Vec::new();
    for item in rows {
        result.push(item.map_err(|error| error.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn save_session(app: tauri::AppHandle, session: SessionRow) -> Result<(), String> {
    let connection = connect(&app)?;
    connection
        .execute(
            "INSERT INTO sessions (id, title, provider, model, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET title = ?2, provider = ?3, model = ?4, updated_at = ?6",
            params![
                session.id,
                session.title,
                session.provider,
                session.model,
                session.created_at,
                session.updated_at
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_session(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let connection = connect(&app)?;
    connection
        .execute("DELETE FROM messages WHERE session_id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM sessions WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_sessions(app: tauri::AppHandle) -> Result<(), String> {
    let connection = connect(&app)?;
    connection
        .execute_batch("DELETE FROM messages; DELETE FROM sessions;")
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_message(app: tauri::AppHandle, message: MessageRow) -> Result<(), String> {
    let connection = connect(&app)?;
    connection
        .execute(
            "INSERT INTO messages (id, session_id, role, content, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET content = ?4",
            params![
                message.id,
                message.session_id,
                message.role,
                message.content,
                message.created_at
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_message(app: tauri::AppHandle, id: String, content: String) -> Result<(), String> {
    let connection = connect(&app)?;
    connection
        .execute(
            "UPDATE messages SET content = ?2 WHERE id = ?1",
            params![id, content],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}
