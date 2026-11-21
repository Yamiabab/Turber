use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

pub const EVENT_DELTA: &str = "turber:chat:delta";
pub const EVENT_DONE: &str = "turber:chat:done";
pub const EVENT_ERROR: &str = "turber:chat:error";
pub const EVENT_TOOL_CALL: &str = "turber:chat:tool-call";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WireMessage {
    pub role: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

impl WireMessage {
    fn keep(&self) -> bool {
        if self.tool_calls.is_some() || self.tool_call_id.is_some() {
            return true;
        }
        match &self.content {
            Some(serde_json::Value::String(text)) => !text.trim().is_empty(),
            Some(serde_json::Value::Array(items)) => !items.is_empty(),
            Some(serde_json::Value::Null) | None => false,
            _ => true,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub request_id: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    #[serde(default)]
    pub temperature: Option<f32>,
    pub messages: Vec<WireMessage>,
    /// OpenAI 兼容的 tools 定义，原样透传给上游
    #[serde(default)]
    pub tools: Option<serde_json::Value>,
    #[serde(default)]
    pub tool_choice: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeltaPayload {
    request_id: String,
    delta: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload {
    request_id: String,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DonePayload {
    request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<serde_json::Value>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolCallPayload {
    request_id: String,
    tool_calls: serde_json::Value,
}

/// 统一诊断落盘：stderr 在 `tauri dev` 热重启后常常拿不到，
/// 这里直接把关键节点追加到临时目录下的固定文件，便于事后定位。
pub fn diag(msg: &str) {
    use std::io::Write;
    let path = std::env::temp_dir().join("turber-diag.log");
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_millis())
            .unwrap_or(0);
        let _ = writeln!(file, "[{ms}] {msg}");
    }
}

fn registry() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn emit_delta(app: &AppHandle, request_id: &str, delta: &str) {
    let _ = app.emit(
        EVENT_DELTA,
        DeltaPayload {
            request_id: request_id.to_string(),
            delta: delta.to_string(),
        },
    );
}

/// 把流式返回的 tool_calls 分片累加成完整调用列表。
fn merge_tool_call(acc: &mut Vec<serde_json::Value>, chunk: &serde_json::Value) {
    let index = chunk["index"].as_u64().unwrap_or(0) as usize;
    while acc.len() <= index {
        acc.push(serde_json::json!({
            "id": "",
            "type": "function",
            "function": { "name": "", "arguments": "" }
        }));
    }
    let slot = &mut acc[index];

    if let Some(id) = chunk["id"].as_str() {
        if !id.is_empty() {
            slot["id"] = serde_json::json!(id);
        }
    }
    if let Some(kind) = chunk["type"].as_str() {
        if !kind.is_empty() {
            slot["type"] = serde_json::json!(kind);
        }
    }
    if let Some(name) = chunk["function"]["name"].as_str() {
        if !name.is_empty() {
            let merged = format!(
                "{}{}",
                slot["function"]["name"].as_str().unwrap_or(""),
                name
            );
            slot["function"]["name"] = serde_json::json!(merged);
        }
    }
    if let Some(args) = chunk["function"]["arguments"].as_str() {
        if !args.is_empty() {
            let merged = format!(
                "{}{}",
                slot["function"]["arguments"].as_str().unwrap_or(""),
                args
            );
            slot["function"]["arguments"] = serde_json::json!(merged);
        }
    }
}

/// 本地服务统一换成 IPv4 回环：Windows 上 localhost 优先解析成 ::1，
/// 而 Ollama 只监听 127.0.0.1，绕去 IPv6 只会白等一轮连接。
fn normalize_base(raw: &str) -> String {
    raw.trim()
        .trim_end_matches('/')
        .replacen("//localhost", "//127.0.0.1", 1)
        .replacen("//[::1]", "//127.0.0.1", 1)
}

async fn send_once(
    client: &reqwest::Client,
    url: &str,
    body: &serde_json::Value,
    api_key: &str,
) -> Result<reqwest::Response, String> {
    let mut builder = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream")
        .json(body);
    if !api_key.trim().is_empty() {
        builder = builder.header("Authorization", format!("Bearer {}", api_key.trim()));
    }
    builder.send().await.map_err(|error| {
        eprintln!("[turber-ai] send error url={url} err={error}");
        diag(&format!("send error url={url} err={error}"));
        format!("请求失败：{error}")
    })
}

fn http_error(status: reqwest::StatusCode, detail: &str) -> String {
    let brief: String = detail.chars().take(240).collect();
    if brief.trim().is_empty() {
        format!("请求失败（{status}）")
    } else {
        format!("请求失败（{status}）：{brief}")
    }
}

async fn ensure_success(response: reqwest::Response) -> Result<reqwest::Response, String> {
    if response.status().is_success() {
        return Ok(response);
    }
    let status = response.status();
    let detail = response.text().await.unwrap_or_default();
    Err(http_error(status, &detail))
}

/// 部分模型（如 qwen2.5vl）不支持 OpenAI 的 tools 协议，带上 tools 一律 400。
/// 命中这类错误时去掉工具重发一次，保证普通对话仍然可用。
/// 返回 (响应, 是否降级去掉了 tools)；降级代表上游不支持原生 function calling，
/// 前端据此切换到「文本工具协议」模式。
async fn request_with_tools_fallback(
    client: &reqwest::Client,
    url: &str,
    mut body: serde_json::Value,
    api_key: &str,
) -> Result<(reqwest::Response, bool), String> {
    let has_tools = body.get("tools").is_some();
    let first = send_once(client, url, &body, api_key).await?;
    if first.status().is_success() || !has_tools {
        return Ok((ensure_success(first).await?, false));
    }

    let status = first.status();
    let detail = first.text().await.unwrap_or_default();
    eprintln!(
        "[turber-ai] status={status} detail={}",
        detail.chars().take(240).collect::<String>()
    );
    if !detail.contains("does not support tools") {
        return Err(http_error(status, &detail));
    }

    if let Some(object) = body.as_object_mut() {
        object.remove("tools");
        object.remove("tool_choice");
    }
    eprintln!("[turber-ai] retry without tools");
    let retry = send_once(client, url, &body, api_key).await?;
    Ok((ensure_success(retry).await?, true))
}

async fn run_stream(
    app: &AppHandle,
    request: &ChatRequest,
    flag: &Arc<AtomicBool>,
) -> Result<Option<serde_json::Value>, String> {
    let base = normalize_base(&request.base_url);
    if base.is_empty() {
        return Err("尚未填写接口地址，请到设置里配置模型服务。".to_string());
    }
    if request.model.trim().is_empty() {
        return Err("尚未填写模型名称，请到设置里补充。".to_string());
    }

    let url = format!("{base}/chat/completions");
    let messages: Vec<WireMessage> = request
        .messages
        .iter()
        .filter(|item| item.keep())
        .cloned()
        .collect();

    let mut body = serde_json::json!({
        "model": request.model.trim(),
        "stream": true,
        "messages": messages,
    });
    if let Some(temperature) = request.temperature {
        body["temperature"] = serde_json::json!(temperature);
    }
    if let Some(tools) = &request.tools {
        if tools.as_array().map(|items| !items.is_empty()).unwrap_or(false) {
            body["tools"] = tools.clone();
            body["tool_choice"] = serde_json::json!(request
                .tool_choice
                .clone()
                .unwrap_or_else(|| "auto".to_string()));
        }
    }

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|error| format!("初始化网络客户端失败：{error}"))?;

    let has_tools = body.get("tools").is_some();
    eprintln!(
        "[turber-ai] POST {url} model={} tools={} messages={}",
        request.model.trim(),
        has_tools,
        body["messages"].as_array().map(|items| items.len()).unwrap_or(0)
    );
    diag(&format!(
        "run_stream POST {url} model={} tools={} messages={}",
        request.model.trim(),
        has_tools,
        body["messages"].as_array().map(|items| items.len()).unwrap_or(0)
    ));
    let started = std::time::Instant::now();
    let (response, tools_dropped) =
        request_with_tools_fallback(&client, &url, body, &request.api_key).await?;
    if tools_dropped {
        // 告诉前端：本模型不支持原生 tools，请改用文本工具协议
        let _ = app.emit(
            "turber:chat:tools-dropped",
            serde_json::json!({ "requestId": request.request_id }),
        );
        diag("run_stream tools dropped, fallback to text protocol");
    }
    eprintln!(
        "[turber-ai] response ready in {}ms (status={})",
        started.elapsed().as_millis(),
        response.status()
    );
    diag(&format!(
        "run_stream response ready in {}ms status={}",
        started.elapsed().as_millis(),
        response.status()
    ));

    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        return Err(http_error(status, &detail));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut tool_acc: Vec<serde_json::Value> = Vec::new();

    'outer: while let Some(chunk) = stream.next().await {
        if flag.load(Ordering::SeqCst) {
            return Ok(None);
        }
        let bytes = chunk.map_err(|error| format!("读取响应流失败：{error}"))?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(position) = buffer.find('\n') {
            let raw: String = buffer.drain(..=position).collect();
            let line = raw.trim();
            if line.is_empty() || !line.starts_with("data:") {
                continue;
            }
            let payload = line[5..].trim();
            if payload == "[DONE]" {
                break 'outer;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(payload) {
                let delta_str = json["choices"][0]["delta"]["content"]
                    .as_str()
                    .or_else(|| json["choices"][0]["message"]["content"].as_str())
                    .unwrap_or("");
                if !delta_str.is_empty() {
                    emit_delta(app, &request.request_id, delta_str);
                }
                if let Some(calls) = json["choices"][0]["delta"]["tool_calls"].as_array() {
                    for call in calls {
                        merge_tool_call(&mut tool_acc, call);
                    }
                    let _ = app.emit(
                        EVENT_TOOL_CALL,
                        ToolCallPayload {
                            request_id: request.request_id.clone(),
                            tool_calls: serde_json::json!(tool_acc),
                        },
                    );
                }
            }
        }
    }

    if tool_acc.is_empty() {
        Ok(None)
    } else {
        Ok(Some(serde_json::json!(tool_acc)))
    }
}

#[tauri::command]
pub fn cancel_chat(request_id: String) {
    if let Ok(map) = registry().lock() {
        if let Some(flag) = map.get(&request_id) {
            flag.store(true, Ordering::SeqCst);
        }
    }
}

#[tauri::command]
pub async fn chat_stream(app: AppHandle, request: ChatRequest) -> Result<(), String> {
    let request_id = request.request_id.clone();
    diag(&format!(
        "chat_stream enter id={} base={} model={} msgs={}",
        request_id,
        request.base_url,
        request.model,
        request.messages.len()
    ));
    let flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut map) = registry().lock() {
        map.insert(request_id.clone(), flag.clone());
    }

    let result = run_stream(&app, &request, &flag).await;

    if let Ok(mut map) = registry().lock() {
        map.remove(&request_id);
    }

    diag(&format!(
        "chat_stream exit id={request_id} ok={}",
        result.is_ok()
    ));
    match result {
        Ok(tool_calls) => {
            let _ = app.emit(
                EVENT_DONE,
                DonePayload {
                    request_id,
                    tool_calls,
                },
            );
        }
        Err(message) => {
            let _ = app.emit(EVENT_ERROR, ErrorPayload { request_id, message });
        }
    }

    Ok(())
}
