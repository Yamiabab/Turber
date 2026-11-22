use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager};

use crate::asr;
use crate::kws;
use crate::tts;

static MUSIC_PLAYING: AtomicBool = AtomicBool::new(false);
static MUSIC_LEVEL: AtomicU32 = AtomicU32::new(0);
static WAKE_LISTENING: AtomicBool = AtomicBool::new(false);
static WAKE_STOP: AtomicBool = AtomicBool::new(false);
static SPEAKING: AtomicBool = AtomicBool::new(false);

const WAKE_REPLY_RATE: i32 = -6;
const WAKE_REPLY_PITCH: i32 = 2;
const IDLE_WIDTH: f64 = 420.0;
const IDLE_HEIGHT: f64 = 240.0;
const ACTIVE_WIDTH: f64 = 800.0;
const ACTIVE_HEIGHT: f64 = 600.0;

#[tauri::command]
pub fn music_playing() -> bool {
    MUSIC_PLAYING.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn music_level() -> u32 {
    MUSIC_LEVEL.load(Ordering::Relaxed)
}

#[cfg(windows)]
fn smtc_playing() -> bool {
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    };
    let operation = match GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
        Ok(value) => value,
        Err(_) => return false,
    };
    let manager = match operation.join() {
        Ok(value) => value,
        Err(_) => return false,
    };
    let sessions = match manager.GetSessions() {
        Ok(value) => value,
        Err(_) => return false,
    };
    let count = match sessions.Size() {
        Ok(value) => value,
        Err(_) => return false,
    };
    for index in 0..count {
        if let Ok(session) = sessions.GetAt(index) {
            if let Ok(info) = session.GetPlaybackInfo() {
                if info.PlaybackStatus()
                    == Ok(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
                {
                    return true;
                }
            }
        }
    }
    false
}

#[cfg(not(windows))]
fn smtc_playing() -> bool {
    false
}

#[cfg(windows)]
fn read_audio_level() -> u32 {
    use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
    use windows::Win32::Media::Audio::{
        eConsole, eRender, Endpoints::IAudioMeterInformation, IMMDeviceEnumerator,
        MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    unsafe {
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
        let co_init = hr.is_ok();
        if hr.is_err() && hr != RPC_E_CHANGED_MODE {
            return 0;
        }
        let result = (|| -> windows::core::Result<u32> {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
            let meter: IAudioMeterInformation = device.Activate(CLSCTX_ALL, None)?;
            let peak = meter.GetPeakValue()?;
            Ok((peak.clamp(0.0, 1.0) * 1000.0) as u32)
        })();
        if co_init {
            CoUninitialize();
        }
        result.unwrap_or(0)
    }
}

#[cfg(not(windows))]
fn read_audio_level() -> u32 {
    0
}

pub fn start_music_watcher() {
    std::thread::spawn(|| {
        #[cfg(windows)]
        unsafe {
            use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
        loop {
            let playing = smtc_playing();
            MUSIC_PLAYING.store(playing, Ordering::Relaxed);
            if playing {
                let level = read_audio_level();
                MUSIC_LEVEL.store(level, Ordering::Relaxed);
            } else {
                MUSIC_LEVEL.store(0, Ordering::Relaxed);
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    });
}

fn resolve_resource_base(app: &AppHandle) -> PathBuf {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidates: Vec<PathBuf> = vec![
        app.path().resource_dir().ok(),
        Some(manifest.clone()),
        std::env::current_exe()
            .ok()
            .and_then(|e| e.parent().map(|p| p.to_path_buf())),
    ]
    .into_iter()
    .flatten()
    .collect();

    for base in &candidates {
        for cand in [base.clone(), base.join("resources")] {
            if cand.join("sherpa-bin").is_dir() || cand.join("sherpa-models").is_dir() {
                return cand;
            }
        }
    }
    app.path()
        .resource_dir()
        .unwrap_or_else(|_| manifest.join("resources"))
}

fn load_engines(base: &Path) -> Vec<kws::EngineConfig> {
    let path = base.join("voice_wake.json");
    if let Ok(text) = std::fs::read_to_string(&path) {
        if let Ok(cfg) = serde_json::from_str::<kws::VoiceWakeConfig>(&text) {
            if !cfg.engines.is_empty() {
                return cfg.engines;
            }
        }
    }
    default_engines()
}

fn default_engines() -> Vec<kws::EngineConfig> {
    vec![kws::EngineConfig {
        model_dir: "kws-zh-en-3M".to_string(),
        feature_dim: 80,
        keywords_score: Some(2.0),
        keywords_threshold: Some(0.15),
        mic_gain: Some(2.5),
    }]
}

fn load_asr(base: &Path) -> Option<asr::AsrConfig> {
    let mut cfg = asr::AsrConfig::default();
    if let Ok(text) = std::fs::read_to_string(base.join("voice_wake.json")) {
        if let Ok(parsed) = serde_json::from_str::<kws::VoiceWakeConfig>(&text) {
            if let Some(asr_cfg) = parsed.asr {
                cfg = asr_cfg;
            }
        }
    }
    let model_dir = if Path::new(&cfg.model_dir).is_absolute() {
        PathBuf::from(&cfg.model_dir)
    } else {
        base.join("sherpa-models").join(&cfg.model_dir)
    };
    if !model_dir.is_dir() {
        eprintln!("[turber] asr model dir missing: {}", model_dir.display());
        return None;
    }
    Some(cfg)
}

#[tauri::command]
pub fn voice_wake_start(app: AppHandle) {
    if WAKE_LISTENING.swap(true, Ordering::SeqCst) {
        return;
    }
    let resource_base = resolve_resource_base(&app);
    let engines = load_engines(&resource_base);
    let asr = load_asr(&resource_base);
    WAKE_STOP.store(false, Ordering::SeqCst);
    std::thread::spawn(move || {
        if let Err(status) = kws::run(
            app.clone(),
            resource_base,
            engines,
            asr,
            &WAKE_STOP,
            &SPEAKING,
        ) {
            let _ = app.emit("mino-wake-status", status);
            WAKE_LISTENING.store(false, Ordering::SeqCst);
        }
    });
}

#[tauri::command]
pub fn voice_wake_state() -> String {
    if WAKE_LISTENING.load(Ordering::SeqCst) {
        "listening".to_string()
    } else {
        "off".to_string()
    }
}

#[tauri::command]
pub fn voice_wake_now(app: AppHandle) {
    let _ = app.emit("mino-wake", "manual");
}

#[tauri::command]
pub fn tts_voices() -> Vec<(String, String)> {
    tts::list_voices()
}

fn reply_config(base: &Path) -> (String, String) {
    if let Ok(text) = std::fs::read_to_string(base.join("voice_wake.json")) {
        if let Ok(cfg) = serde_json::from_str::<kws::VoiceWakeConfig>(&text) {
            return (
                cfg.reply_text.unwrap_or_else(|| "我在呢".to_string()),
                cfg.reply_voice
                    .unwrap_or_else(|| tts::DEFAULT_VOICE.to_string()),
            );
        }
    }
    ("我在呢".to_string(), tts::DEFAULT_VOICE.to_string())
}

#[tauri::command]
pub fn wake_reply(app: AppHandle) -> (String, String) {
    let base = resolve_resource_base(&app);
    reply_config(&base)
}

#[tauri::command]
pub fn speak(app: AppHandle, text: String, voice: Option<String>, rate: Option<i32>, pitch: Option<i32>) {
    let voice = voice.unwrap_or_else(|| tts::DEFAULT_VOICE.to_string());
    let rate = rate.unwrap_or(0);
    let pitch = pitch.unwrap_or(0);
    std::thread::spawn(move || {
        let _ = app.emit("mino-speak-start", text.clone());
        match tts::speak(&text, &voice, rate, pitch, &SPEAKING) {
            Ok(()) => {}
            Err(err) => {
                eprintln!("[turber] tts error: {err}");
                let _ = app.emit("mino-speak-error", err);
            }
        }
        let _ = app.emit("mino-speak-end", text);
    });
}

#[tauri::command]
pub fn speak_stop() -> bool {
    SPEAKING.load(Ordering::SeqCst)
}

fn animate_window(window: tauri::Window, target_w: f64, target_h: f64) {
    std::thread::spawn(move || {
        let scale = match window.scale_factor() {
            Ok(value) => value,
            Err(_) => return,
        };
        let start = match window.inner_size() {
            Ok(value) => value,
            Err(_) => return,
        };
        let origin = match window.outer_position() {
            Ok(value) => value,
            Err(_) => return,
        };

        let start_w = start.width as f64 / scale;
        let start_h = start.height as f64 / scale;
        let center_x = origin.x as f64 / scale + start_w / 2.0;
        let center_y = origin.y as f64 / scale + start_h / 2.0;

        let frames = 30u32;
        for frame in 1..=frames {
            let t = frame as f64 / frames as f64;
            let eased = if t < 0.5 {
                4.0 * t * t * t
            } else {
                1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
            };
            let w = start_w + (target_w - start_w) * eased;
            let h = start_h + (target_h - start_h) * eased;
            let x = center_x - w / 2.0;
            let y = center_y - h / 2.0;

            if window.set_size(LogicalSize::new(w, h)).is_err() {
                return;
            }
            if window.set_position(LogicalPosition::new(x, y)).is_err() {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(16));
        }
    });
}

#[tauri::command]
pub fn expand_window(window: tauri::Window) {
    animate_window(window, ACTIVE_WIDTH, ACTIVE_HEIGHT);
}

#[tauri::command]
pub fn collapse_window(window: tauri::Window) {
    if matches!(window.is_maximized(), Ok(true)) {
        let _ = window.unmaximize();
        std::thread::sleep(std::time::Duration::from_millis(60));
    }
    animate_window(window, IDLE_WIDTH, IDLE_HEIGHT);
}

pub fn spawn_startup(app: AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1500));
        voice_wake_start(handle);
    });
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(2600));
        let base = resolve_resource_base(&app);
        let (text, voice) = reply_config(&base);
        tts::prewarm(&text, &voice, WAKE_REPLY_RATE, WAKE_REPLY_PITCH);
    });
}
