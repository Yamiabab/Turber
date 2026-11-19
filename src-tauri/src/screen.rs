//! 桌面屏幕读取与本地输入注入（AI 用户视角操控）。
//!
//! 设计要点：
//! - 截图走 GDI BitBlt + GetDIBits，再用 image 编码为 JPEG，经 base64 回传前端。
//! - 鼠标 / 键盘走 SendInput，坐标使用虚拟屏幕绝对坐标（兼容多屏）。
//! - 「紧急停止」热键用 GetAsyncKeyState 轮询，触发后向前端发事件，由前端统一收口。
//! - 所有能力仅在本机进程内可用，不做任何网络访问。

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::thread;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const EVENT_EMERGENCY_STOP: &str = "turber:emergency-stop";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundInfo {
    /// 前台窗口所属进程的可执行文件名（小写，如 chrome.exe）
    pub process: String,
    /// 前台窗口标题
    pub title: String,
    /// 前台窗口是否为 Turber 自身
    pub is_self: bool,
    /// 前台窗口句柄（十进制字符串，便于前端日志）
    pub handle: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturePayload {
    /// data:image/jpeg;base64,....
    pub image: String,
    pub width: u32,
    pub height: u32,
    /// 虚拟屏幕左上角坐标（多屏时的负值偏移）
    pub origin_x: i32,
    pub origin_y: i32,
    /// 虚拟屏幕的真实物理宽度（截图可能被缩小，用于把截图坐标换算回物理坐标）
    pub screen_width: u32,
    pub screen_height: u32,
    pub foreground: ForegroundInfo,
}

// ---------------------------------------------------------------- foreground

#[cfg(windows)]
pub fn foreground_info() -> ForegroundInfo {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
    };

    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        if hwnd.0.is_null() {
            return ForegroundInfo {
                process: String::new(),
                title: String::new(),
                is_self: false,
                handle: "0".into(),
            };
        }

        let mut title_buf = [0u16; 512];
        let title_len = GetWindowTextW(hwnd, &mut title_buf);
        let title = String::from_utf16_lossy(&title_buf[..title_len.max(0) as usize]);

        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));

        let mut process = String::new();
        if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut path_buf = [0u16; 1024];
            let mut size = path_buf.len() as u32;
            if QueryFullProcessImageNameW(
                handle,
                PROCESS_NAME_WIN32,
                windows::core::PWSTR(path_buf.as_mut_ptr()),
                &mut size,
            )
            .is_ok()
            {
                let full = String::from_utf16_lossy(&path_buf[..size as usize]);
                process = full
                    .rsplit(['\\', '/'])
                    .next()
                    .unwrap_or(&full)
                    .to_lowercase();
            }
            let _ = windows::Win32::Foundation::CloseHandle(handle);
        }

        let self_name = std::env::current_exe()
            .ok()
            .and_then(|p| {
                p.file_name()
                    .map(|n| n.to_string_lossy().to_lowercase())
            })
            .unwrap_or_else(|| "turber.exe".to_string());
        let is_self = !process.is_empty() && process == self_name;

        ForegroundInfo {
            process,
            title,
            is_self,
            handle: format!("{}", hwnd.0 as usize),
        }
    }
}

#[cfg(not(windows))]
pub fn foreground_info() -> ForegroundInfo {
    ForegroundInfo {
        process: String::new(),
        title: String::new(),
        is_self: false,
        handle: "0".into(),
    }
}

#[tauri::command]
pub fn screen_foreground() -> ForegroundInfo {
    foreground_info()
}

// ---------------------------------------------------------------- capture

#[cfg(windows)]
fn grab_screen() -> Result<(Vec<u8>, u32, u32, i32, i32), String> {
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DIB_RGB_COLORS, HGDIOBJ, SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN,
    };

    unsafe {
        let origin_x = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let origin_y = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        if width <= 0 || height <= 0 {
            return Err("无法读取屏幕尺寸".to_string());
        }

        let screen_dc = GetDC(None);
        if screen_dc.is_invalid() {
            return Err("无法获取屏幕设备上下文".to_string());
        }
        let mem_dc = CreateCompatibleDC(Some(screen_dc));
        let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
        if bitmap.is_invalid() {
            let _ = ReleaseDC(None, screen_dc);
            return Err("无法创建屏幕位图".to_string());
        }
        let old = SelectObject(mem_dc, HGDIOBJ(bitmap.0));

        let blt = BitBlt(
            mem_dc,
            0,
            0,
            width,
            height,
            Some(screen_dc),
            origin_x,
            origin_y,
            SRCCOPY,
        );

        let mut result = Ok((Vec::new(), width as u32, height as u32, origin_x, origin_y));

        if blt.is_err() {
            result = Err("屏幕抓取失败".to_string());
        } else {
            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: width,
                    biHeight: -height, // top-down
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut buffer = vec![0u8; (width * height * 4) as usize];
            let scanned = GetDIBits(
                mem_dc,
                bitmap,
                0,
                height as u32,
                Some(buffer.as_mut_ptr().cast()),
                &mut info,
                DIB_RGB_COLORS,
            );
            if scanned == 0 {
                result = Err("读取屏幕像素失败".to_string());
            } else {
                result = Ok((buffer, width as u32, height as u32, origin_x, origin_y));
            }
        }

        SelectObject(mem_dc, old);
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
        let _ = DeleteDC(mem_dc);
        let _ = ReleaseDC(None, screen_dc);

        result
    }
}

#[cfg(not(windows))]
fn grab_screen() -> Result<(Vec<u8>, u32, u32, i32, i32), String> {
    Err("当前平台不支持屏幕抓取".to_string())
}

#[tauri::command]
pub fn screen_capture(max_width: Option<u32>, quality: Option<u8>) -> Result<CapturePayload, String> {
    let (bgra, width, height, origin_x, origin_y) = grab_screen()?;

    let mut rgb = Vec::with_capacity((width * height * 3) as usize);
    for chunk in bgra.chunks_exact(4) {
        rgb.push(chunk[2]);
        rgb.push(chunk[1]);
        rgb.push(chunk[0]);
    }

    let mut image = image::RgbImage::from_raw(width, height, rgb)
        .ok_or_else(|| "屏幕像素格式异常".to_string())?;

    let limit = max_width.unwrap_or(1440).max(320);
    if image.width() > limit {
        let ratio = limit as f32 / image.width() as f32;
        let target_h = ((image.height() as f32) * ratio).round().max(1.0) as u32;
        image = image::imageops::resize(&image, limit, target_h, image::imageops::FilterType::Triangle);
    }

    let quality = quality.unwrap_or(72).clamp(30, 95);
    let mut buffer: Vec<u8> = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buffer);
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, quality)
        .encode_image(&image)
        .map_err(|error| format!("截图编码失败：{error}"))?;

    Ok(CapturePayload {
        image: format!("data:image/jpeg;base64,{}", B64.encode(&buffer)),
        width: image.width(),
        height: image.height(),
        origin_x,
        origin_y,
        screen_width: width as u32,
        screen_height: height as u32,
        foreground: foreground_info(),
    })
}

// ---------------------------------------------------------------- input

#[cfg(windows)]
fn key_code(name: &str) -> Option<u16> {
    let lower = name.trim().to_lowercase();
    let code: u16 = match lower.as_str() {
        "ctrl" | "control" => 0x11,
        "shift" => 0x10,
        "alt" | "menu" => 0x12,
        "win" | "meta" | "super" => 0x5B,
        "enter" | "return" => 0x0D,
        "esc" | "escape" => 0x1B,
        "tab" => 0x09,
        "space" | "spacebar" => 0x20,
        "backspace" => 0x08,
        "delete" | "del" => 0x2E,
        "insert" | "ins" => 0x2D,
        "home" => 0x24,
        "end" => 0x23,
        "pageup" | "pgup" => 0x21,
        "pagedown" | "pgdn" => 0x22,
        "up" => 0x26,
        "down" => 0x28,
        "left" => 0x25,
        "right" => 0x27,
        "capslock" => 0x14,
        "printscreen" => 0x2C,
        "pause" => 0x13,
        "apps" | "menu_key" => 0x5D,
        "-" | "minus" => 0xBD,
        "=" | "equal" | "plus" => 0xBB,
        "," | "comma" => 0xBC,
        "." | "period" | "dot" => 0xBE,
        "/" | "slash" => 0xBF,
        ";" | "semicolon" => 0xBA,
        "'" | "quote" => 0xDE,
        "[" | "lbracket" => 0xDB,
        "]" | "rbracket" => 0xDD,
        "\\" | "backslash" => 0xDC,
        "`" | "grave" => 0xC0,
        other => {
            if let Some(rest) = other.strip_prefix('f') {
                if let Ok(index) = rest.parse::<u16>() {
                    if (1..=24).contains(&index) {
                        return Some(0x70 + index - 1);
                    }
                }
            }
            let mut chars = other.chars();
            let (first, trailing) = (chars.next()?, chars.next());
            if trailing.is_some() {
                return None;
            }
            if first.is_ascii_alphabetic() {
                return Some(first.to_ascii_uppercase() as u16);
            }
            if first.is_ascii_digit() {
                return Some(first as u16);
            }
            return None;
        }
    };
    Some(code)
}

#[cfg(windows)]
fn send_key(code: u16, up: bool) {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
        VIRTUAL_KEY,
    };

    let flags = if up { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) };
    let input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(code),
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    unsafe {
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

#[cfg(windows)]
fn mouse_flags(button: &str, up: bool) -> Option<windows::Win32::UI::Input::KeyboardAndMouse::MOUSE_EVENT_FLAGS> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP,
        MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
    };

    let flag = match (button.trim().to_lowercase().as_str(), up) {
        ("left" | "l" | "primary", false) => MOUSEEVENTF_LEFTDOWN,
        ("left" | "l" | "primary", true) => MOUSEEVENTF_LEFTUP,
        ("right" | "r" | "secondary", false) => MOUSEEVENTF_RIGHTDOWN,
        ("right" | "r" | "secondary", true) => MOUSEEVENTF_RIGHTUP,
        ("center" | "c" | "middle" | "wheel", false) => MOUSEEVENTF_MIDDLEDOWN,
        ("center" | "c" | "middle" | "wheel", true) => MOUSEEVENTF_MIDDLEUP,
        _ => return None,
    };
    Some(flag)
}

#[cfg(windows)]
fn send_mouse_button(button: &str, up: bool) -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEINPUT};

    let flags = mouse_flags(button, up).ok_or_else(|| format!("不支持的鼠标按键：{button}"))?;
    let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    unsafe {
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
    Ok(())
}

/// 读取当前光标物理坐标，返回 "x,y"，用于让模型知道自己此刻到底在哪。
#[tauri::command]
pub fn cursor_position() -> Result<String, String> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
        let mut point = POINT::default();
        unsafe {
            GetCursorPos(&mut point).map_err(|error| format!("读取光标位置失败：{error}"))?;
        }
        Ok(format!("{},{}", point.x, point.y))
    }
    #[cfg(not(windows))]
    {
        Err("当前平台不支持读取光标位置".to_string())
    }
}

/// 移动鼠标到虚拟屏幕绝对坐标 (x, y)，返回移动后系统读到的真实光标位置。
/// 坐标换算由前端 toScreenPoint 完成，这里只负责落到物理坐标。
#[tauri::command]
pub fn input_mouse_move(x: i32, y: i32) -> Result<String, String> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_MOVE,
            MOUSEINPUT,
        };
        use windows::Win32::UI::WindowsAndMessaging::{
            GetCursorPos, GetSystemMetrics, SetCursorPos, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
            SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
        };

        unsafe {
            // 首选 SetCursorPos：同一桌面内最直接，不受 UIPI 限制
            if SetCursorPos(x, y).is_err() {
                // 兜底：SendInput 归一化绝对移动（部分远程桌面 / 受保护桌面下 SetCursorPos 会失败）
                let vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
                let vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
                let vw = GetSystemMetrics(SM_CXVIRTUALSCREEN).max(1);
                let vh = GetSystemMetrics(SM_CYVIRTUALSCREEN).max(1);
                let ax = (((x - vx) as f64 + 0.5) * 65535.0 / vw as f64).round() as i32;
                let ay = (((y - vy) as f64 + 0.5) * 65535.0 / vh as f64).round() as i32;
                let input = INPUT {
                    r#type: INPUT_MOUSE,
                    Anonymous: INPUT_0 {
                        mi: MOUSEINPUT {
                            dx: ax,
                            dy: ay,
                            mouseData: 0,
                            dwFlags: MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                };
                let sent = SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
                if sent == 0 {
                    return Err(format!("移动鼠标失败：坐标 ({x}, {y}) 无法落到当前桌面"));
                }
            }
            let mut point = POINT::default();
            let _ = GetCursorPos(&mut point);
            Ok(format!("({}, {})", point.x, point.y))
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (x, y);
        Err("当前平台不支持鼠标注入".to_string())
    }
}

#[tauri::command]
pub fn input_mouse_button(button: String, action: String) -> Result<(), String> {
    match action.trim().to_lowercase().as_str() {
        "down" => send_mouse_button(&button, false),
        "up" => send_mouse_button(&button, true),
        "click" => {
            send_mouse_button(&button, false)?;
            thread::sleep(Duration::from_millis(24));
            send_mouse_button(&button, true)
        }
        "double" => {
            for _ in 0..2 {
                send_mouse_button(&button, false)?;
                thread::sleep(Duration::from_millis(22));
                send_mouse_button(&button, true)?;
                thread::sleep(Duration::from_millis(62));
            }
            Ok(())
        }
        other => Err(format!("未知的鼠标动作：{other}")),
    }
}

#[tauri::command]
pub fn input_mouse_scroll(delta: i32) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_WHEEL, MOUSEINPUT,
        };
        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: (delta * 120) as u32,
                    dwFlags: MOUSEEVENTF_WHEEL,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        unsafe {
            SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = delta;
        Err("当前平台不支持鼠标注入".to_string())
    }
}

/// 发送一组按键，支持组合键写法：`ctrl+shift+t`、`enter`。
/// hold_ms 用于「长按」语义，按下后保持该时长再抬起。
#[tauri::command]
pub fn input_keys(keys: String, hold_ms: Option<u64>) -> Result<(), String> {
    let parts: Vec<&str> = keys
        .split('+')
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .collect();
    if parts.is_empty() {
        return Err("缺少按键名称".to_string());
    }

    let mut codes = Vec::new();
    let explicit_shift = parts.iter().any(|part| part.eq_ignore_ascii_case("shift"));
    // 组合键里出现单个大写字母（如 "A"）时自动补 Shift，保证输出大写
    let mut needs_shift = false;
    for part in &parts {
        let code = key_code(part).ok_or_else(|| format!("无法识别的按键：{part}"))?;
        if !explicit_shift && !needs_shift {
            let mut chars = part.chars();
            if let (Some(first), None) = (chars.next(), chars.next()) {
                if first.is_ascii_uppercase() {
                    needs_shift = true;
                }
            }
        }
        codes.push(code);
    }

    let hold = hold_ms.unwrap_or(40).clamp(0, 10_000);

    if needs_shift {
        send_key(0x10, false);
        thread::sleep(Duration::from_millis(10));
    }
    for code in &codes {
        send_key(*code, false);
        thread::sleep(Duration::from_millis(12));
    }
    thread::sleep(Duration::from_millis(hold));
    for code in codes.iter().rev() {
        send_key(*code, true);
        thread::sleep(Duration::from_millis(10));
    }
    if needs_shift {
        send_key(0x10, true);
    }
    Ok(())
}

#[tauri::command]
pub fn input_key_down(key: String) -> Result<(), String> {
    let code = key_code(&key).ok_or_else(|| format!("无法识别的按键：{key}"))?;
    send_key(code, false);
    Ok(())
}

#[tauri::command]
pub fn input_key_up(key: String) -> Result<(), String> {
    let code = key_code(&key).ok_or_else(|| format!("无法识别的按键：{key}"))?;
    send_key(code, true);
    Ok(())
}

/// 逐字符输入文本：走 KEYEVENTF_UNICODE，中文、大小写、符号都不需要切输入法。
/// 若底层拒绝 Unicode 注入（部分安全桌面），回退到虚拟键映射。
#[tauri::command]
pub fn input_type_text(text: String) -> Result<(), String> {
    if text.is_empty() {
        return Ok(());
    }
    #[cfg(windows)]
    {
        if send_unicode_text(&text) {
            return Ok(());
        }
    }
    for ch in text.chars() {
        let mapped = match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' => Some(ch.to_string()),
            ' ' => Some("space".to_string()),
            '\n' => Some("enter".to_string()),
            '\t' => Some("tab".to_string()),
            '-' => Some("minus".to_string()),
            '=' => Some("equal".to_string()),
            ',' => Some("comma".to_string()),
            '.' => Some("period".to_string()),
            '/' => Some("slash".to_string()),
            ';' => Some("semicolon".to_string()),
            '\'' => Some("quote".to_string()),
            '[' => Some("lbracket".to_string()),
            ']' => Some("rbracket".to_string()),
            '\\' => Some("backslash".to_string()),
            '`' => Some("grave".to_string()),
            _ => None,
        };
        let key = mapped.unwrap_or_default();
        if key.is_empty() {
            continue;
        }
        input_keys(key, Some(0))?;
    }
    Ok(())
}

/// 用 KEYEVENTF_UNICODE 直接注入字符（UTF-16 代码单元），返回是否全部成功。
#[cfg(windows)]
fn send_unicode_text(text: &str) -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
        KEYEVENTF_UNICODE, VIRTUAL_KEY,
    };

    let mut buffer = [0u16; 2];
    for ch in text.chars() {
        let units: &[u16] = ch.encode_utf16(&mut buffer);
        for unit in units {
            for up in [false, true] {
                let mut flags = KEYEVENTF_UNICODE;
                if up {
                    flags |= KEYEVENTF_KEYUP;
                }
                let input = INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: VIRTUAL_KEY(0),
                            wScan: *unit,
                            dwFlags: KEYBD_EVENT_FLAGS(flags.0),
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                };
                let sent = unsafe { SendInput(&[input], std::mem::size_of::<INPUT>() as i32) };
                if sent == 0 {
                    return false;
                }
                thread::sleep(Duration::from_millis(6));
            }
        }
    }
    true
}

// 非 Windows 平台：桌面输入注入尚未实现，这里保留同名桩函数，
// 让整个 crate 能在 macOS / Linux 上编译，调用时会得到明确的不支持提示。
#[cfg(not(windows))]
fn key_code(_name: &str) -> Option<u16> {
    None
}

#[cfg(not(windows))]
fn send_key(_code: u16, _up: bool) {}

#[cfg(not(windows))]
fn send_mouse_button(_button: &str, _up: bool) -> Result<(), String> {
    Err("当前平台不支持鼠标注入".to_string())
}

// ---------------------------------------------------------------- emergency stop

fn watch_generation() -> &'static AtomicU64 {
    static GEN: OnceLock<AtomicU64> = OnceLock::new();
    GEN.get_or_init(|| AtomicU64::new(0))
}

#[cfg(windows)]
fn key_down(code: u16) -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    unsafe { (GetAsyncKeyState(code as i32) as u16 & 0x8000) != 0 }
}


/// 急停时把窗口拉回前台：不依赖前端回调，避免窗口隐藏/WebView 节流导致无响应
fn surface_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// 启动紧急停止监听。
/// hotkey 取值：
/// - `double:alt` / `double:ctrl` / `double:shift`（双击修饰键）
/// - `combo:ctrl+shift+q`（组合键）
#[tauri::command]
pub fn emergency_watch_start(app: AppHandle, hotkey: String) -> Result<(), String> {
    let generation = watch_generation().fetch_add(1, Ordering::SeqCst) + 1;

    thread::spawn(move || {
        let spec = hotkey.trim().to_lowercase();
        let is_double = spec.starts_with("double:");
        let key_name = spec
            .strip_prefix("double:")
            .or_else(|| spec.strip_prefix("combo:"))
            .unwrap_or("alt")
            .to_string();

        let combo_codes: Vec<u16> = if is_double {
            key_code(&key_name).into_iter().collect()
        } else {
            key_name
                .split('+')
                .filter_map(|item| key_code(item.trim()))
                .collect()
        };
        if combo_codes.is_empty() {
            return;
        }

        let mut was_down = false;
        let mut last_press = std::time::Instant::now() - Duration::from_secs(10);

        loop {
            if watch_generation().load(Ordering::SeqCst) != generation {
                return;
            }
            if !cfg!(windows) {
                return;
            }

            #[cfg(windows)]
            {
                let all_down = combo_codes.iter().all(|code| key_down(*code));
                if is_double {
                    if all_down && !was_down {
                        let now = std::time::Instant::now();
                        if now.duration_since(last_press) < Duration::from_millis(480) {
                            let _ = app.emit(EVENT_EMERGENCY_STOP, "double");
                            surface_main_window(&app);
                            was_down = all_down;
                            last_press = now - Duration::from_secs(10);
                            continue;
                        }
                        last_press = now;
                    }
                    was_down = all_down;
                } else if all_down && !was_down {
                    let _ = app.emit(EVENT_EMERGENCY_STOP, "combo");
                    surface_main_window(&app);
                } else {
                    was_down = all_down;
                }
            }

            thread::sleep(Duration::from_millis(22));
        }
    });

    Ok(())
}

#[tauri::command]
pub fn emergency_watch_stop() {
    watch_generation().fetch_add(1, Ordering::SeqCst);
}
