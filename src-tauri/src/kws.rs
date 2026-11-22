use std::ffi::{c_char, CStr, CString};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use libloading::Library;
use serde::Deserialize;
use tauri::{AppHandle, Emitter};

#[repr(C)]
struct SherpaFeatureConfig {
    sample_rate: i32,
    feature_dim: i32,
}

#[repr(C)]
struct TransducerConfig {
    encoder: *const c_char,
    decoder: *const c_char,
    joiner: *const c_char,
}

#[repr(C)]
struct ParaformerConfig {
    encoder: *const c_char,
    decoder: *const c_char,
}

#[repr(C)]
struct Zipformer2CtcConfig {
    model: *const c_char,
}

#[repr(C)]
struct NemoCtcConfig {
    model: *const c_char,
}

#[repr(C)]
struct ToneCtcConfig {
    model: *const c_char,
}

#[repr(C)]
struct OnlineModelConfig {
    transducer: TransducerConfig,
    paraformer: ParaformerConfig,
    zipformer2_ctc: Zipformer2CtcConfig,
    tokens: *const c_char,
    num_threads: i32,
    provider: *const c_char,
    debug: i32,
    model_type: *const c_char,
    modeling_unit: *const c_char,
    bpe_vocab: *const c_char,
    tokens_buf: *const c_char,
    tokens_buf_size: i32,
    nemo_ctc: NemoCtcConfig,
    t_one_ctc: ToneCtcConfig,
}

#[repr(C)]
struct KeywordSpotterConfig {
    feat_config: SherpaFeatureConfig,
    model_config: OnlineModelConfig,
    max_active_paths: i32,
    num_trailing_blanks: i32,
    keywords_score: f32,
    keywords_threshold: f32,
    keywords_file: *const c_char,
    keywords_buf: *const c_char,
    keywords_buf_size: i32,
}

#[repr(C)]
struct KeywordResult {
    keyword: *const c_char,
    tokens: *const c_char,
    tokens_arr: *const *const c_char,
    count: i32,
    timestamps: *const f32,
    start_time: f32,
    json: *const c_char,
}

#[repr(C)]
struct SherpaSpotter {
    _private: [u8; 0],
}

#[repr(C)]
struct SherpaStream {
    _private: [u8; 0],
}

type CreateSpotterFn = unsafe extern "C" fn(*const KeywordSpotterConfig) -> *const SherpaSpotter;
type DestroySpotterFn = unsafe extern "C" fn(*const SherpaSpotter);
type CreateStreamFn = unsafe extern "C" fn(*const SherpaSpotter) -> *const SherpaStream;
type DestroyStreamFn = unsafe extern "C" fn(*const SherpaStream);
type AcceptWaveformFn = unsafe extern "C" fn(*const SherpaStream, i32, *const f32, i32);
type IsReadyFn = unsafe extern "C" fn(*const SherpaSpotter, *const SherpaStream) -> i32;
type DecodeFn = unsafe extern "C" fn(*const SherpaSpotter, *const SherpaStream);
type ResetFn = unsafe extern "C" fn(*const SherpaSpotter, *const SherpaStream);
type GetResultFn =
    unsafe extern "C" fn(*const SherpaSpotter, *const SherpaStream) -> *const KeywordResult;
type DestroyResultFn = unsafe extern "C" fn(*const KeywordResult);

struct Sherpa {
    _lib: Library,
    _deps: Vec<Library>,
    create_spotter: CreateSpotterFn,
    destroy_spotter: DestroySpotterFn,
    create_stream: CreateStreamFn,
    destroy_stream: DestroyStreamFn,
    accept_waveform: AcceptWaveformFn,
    is_ready: IsReadyFn,
    decode: DecodeFn,
    reset: ResetFn,
    get_result: GetResultFn,
    destroy_result: DestroyResultFn,
}

struct Engine {
    spotter: *const SherpaSpotter,
    stream: *const SherpaStream,
    device_rate: i32,
    last_reset: Instant,
    _keep: Vec<CString>,
}

fn to_cstring(value: &str, keep: &mut Vec<CString>) -> Result<CString, String> {
    let s = CString::new(value.as_bytes()).map_err(|_| "path-nul".to_string())?;
    keep.push(s.clone());
    Ok(s)
}

#[derive(Deserialize, Clone)]
pub struct EngineConfig {
    pub model_dir: String,
    #[serde(default = "default_feature_dim")]
    pub feature_dim: i32,
    #[serde(default)]
    pub keywords_score: Option<f32>,
    #[serde(default)]
    pub keywords_threshold: Option<f32>,
    #[serde(default)]
    pub mic_gain: Option<f32>,
}

#[derive(Deserialize)]
pub struct VoiceWakeConfig {
    pub engines: Vec<EngineConfig>,
    #[serde(default)]
    pub reply_voice: Option<String>,
    #[serde(default)]
    pub reply_text: Option<String>,
    #[serde(default)]
    pub asr: Option<crate::asr::AsrConfig>,
}

fn default_feature_dim() -> i32 {
    80
}

const DEFAULT_KEYWORDS: &str =
    "h ēi m ǐ n uò @嘿米诺\nHH EY1 M IY1 N OW0 @HEY_MINO\nm ǐ n uò @米诺\nh ei m i n uo @HEIMINUO\n";

const LOAD_WITH_ALTERED_SEARCH_PATH: u32 = 0x0000_0008;

pub(crate) fn load_lib_isolated(path: &Path) -> Result<Library, String> {
    #[cfg(windows)]
    {
        use libloading::os::windows::Library as WinLibrary;
        let lib = unsafe { WinLibrary::load_with_flags(path, LOAD_WITH_ALTERED_SEARCH_PATH) }
            .map_err(|e| format!("load {}: {e}", path.display()))?;
        return Ok(Library::from(lib));
    }
    #[cfg(not(windows))]
    {
        unsafe { Library::new(path) }.map_err(|e| format!("load {}: {e}", path.display()))
    }
}

fn load_symbols(lib: Library) -> Result<Sherpa, String> {
    unsafe {
        let create_spotter: CreateSpotterFn = *lib
            .get(b"SherpaOnnxCreateKeywordSpotter\0")
            .map_err(|e| format!("missing SherpaOnnxCreateKeywordSpotter: {e}"))?;
        let destroy_spotter: DestroySpotterFn = *lib
            .get(b"SherpaOnnxDestroyKeywordSpotter\0")
            .map_err(|e| format!("missing SherpaOnnxDestroyKeywordSpotter: {e}"))?;
        let create_stream: CreateStreamFn = *lib
            .get(b"SherpaOnnxCreateKeywordStream\0")
            .map_err(|e| format!("missing SherpaOnnxCreateKeywordStream: {e}"))?;
        let destroy_stream: DestroyStreamFn = *lib
            .get(b"SherpaOnnxDestroyOnlineStream\0")
            .map_err(|e| format!("missing SherpaOnnxDestroyOnlineStream: {e}"))?;
        let accept_waveform: AcceptWaveformFn = *lib
            .get(b"SherpaOnnxOnlineStreamAcceptWaveform\0")
            .map_err(|e| format!("missing SherpaOnnxOnlineStreamAcceptWaveform: {e}"))?;
        let is_ready: IsReadyFn = *lib
            .get(b"SherpaOnnxIsKeywordStreamReady\0")
            .map_err(|e| format!("missing SherpaOnnxIsKeywordStreamReady: {e}"))?;
        let decode: DecodeFn = *lib
            .get(b"SherpaOnnxDecodeKeywordStream\0")
            .map_err(|e| format!("missing SherpaOnnxDecodeKeywordStream: {e}"))?;
        let reset: ResetFn = *lib
            .get(b"SherpaOnnxResetKeywordStream\0")
            .map_err(|e| format!("missing SherpaOnnxResetKeywordStream: {e}"))?;
        let get_result: GetResultFn = *lib
            .get(b"SherpaOnnxGetKeywordResult\0")
            .map_err(|e| format!("missing SherpaOnnxGetKeywordResult: {e}"))?;
        let destroy_result: DestroyResultFn = *lib
            .get(b"SherpaOnnxDestroyKeywordResult\0")
            .map_err(|e| format!("missing SherpaOnnxDestroyKeywordResult: {e}"))?;

        Ok(Sherpa {
            _lib: lib,
            _deps: Vec::new(),
            create_spotter,
            destroy_spotter,
            create_stream,
            destroy_stream,
            accept_waveform,
            is_ready,
            decode,
            reset,
            get_result,
            destroy_result,
        })
    }
}

fn glob_one(dir: &Path, prefix: &str) -> Result<PathBuf, String> {
    let entries = std::fs::read_dir(dir).map_err(|e| format!("read-dir {}: {e}", dir.display()))?;
    let mut hit: Option<PathBuf> = None;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name.starts_with(&prefix.to_lowercase()) && name.ends_with(".onnx") {
            hit = Some(entry.path());
            break;
        }
    }
    hit.ok_or_else(|| format!("no {prefix}*.onnx in {}", dir.display()))
}

fn build_engine(sherpa: &Sherpa, cfg: &EngineConfig, base: &Path) -> Result<Engine, String> {
    let model_dir = if Path::new(&cfg.model_dir).is_absolute() {
        PathBuf::from(&cfg.model_dir)
    } else {
        base.join("sherpa-models").join(&cfg.model_dir)
    };
    if !model_dir.is_dir() {
        return Err(format!("model-missing: {}", model_dir.display()));
    }
    let encoder = glob_one(&model_dir, "encoder")?;
    let decoder = glob_one(&model_dir, "decoder")?;
    let joiner = glob_one(&model_dir, "joiner")?;
    let tokens_path = model_dir.join("tokens.txt");
    if !tokens_path.is_file() {
        return Err(format!("tokens-missing: {}", tokens_path.display()));
    }

    let mut keep: Vec<CString> = Vec::new();

    let c_encoder = to_cstring(&encoder.to_string_lossy(), &mut keep)?;
    let c_decoder = to_cstring(&decoder.to_string_lossy(), &mut keep)?;
    let c_joiner = to_cstring(&joiner.to_string_lossy(), &mut keep)?;
    let c_tokens = to_cstring(&tokens_path.to_string_lossy(), &mut keep)?;
    let c_provider = to_cstring("cpu", &mut keep)?;

    let keywords_path = model_dir.join("keywords.txt");
    let mut kw_file: Option<CString> = None;
    let mut kw_buf: *const c_char = std::ptr::null();
    let mut kw_buf_size: i32 = 0;
    if keywords_path.is_file() {
        kw_file = Some(to_cstring(&keywords_path.to_string_lossy(), &mut keep)?);
    } else {
        kw_buf = DEFAULT_KEYWORDS.as_ptr() as *const c_char;
        kw_buf_size = DEFAULT_KEYWORDS.len() as i32;
    }
    let kw_file_ptr = kw_file.as_ref().map(|c| c.as_ptr()).unwrap_or(std::ptr::null());

    let config = KeywordSpotterConfig {
        feat_config: SherpaFeatureConfig {
            sample_rate: 16000,
            feature_dim: cfg.feature_dim,
        },
        model_config: OnlineModelConfig {
            transducer: TransducerConfig {
                encoder: c_encoder.as_ptr(),
                decoder: c_decoder.as_ptr(),
                joiner: c_joiner.as_ptr(),
            },
            paraformer: ParaformerConfig {
                encoder: std::ptr::null(),
                decoder: std::ptr::null(),
            },
            zipformer2_ctc: Zipformer2CtcConfig {
                model: std::ptr::null(),
            },
            tokens: c_tokens.as_ptr(),
            num_threads: 1,
            provider: c_provider.as_ptr(),
            debug: 0,
            model_type: std::ptr::null(),
            modeling_unit: std::ptr::null(),
            bpe_vocab: std::ptr::null(),
            tokens_buf: std::ptr::null(),
            tokens_buf_size: 0,
            nemo_ctc: NemoCtcConfig {
                model: std::ptr::null(),
            },
            t_one_ctc: ToneCtcConfig {
                model: std::ptr::null(),
            },
        },
        max_active_paths: 4,
        num_trailing_blanks: 1,
        keywords_score: cfg.keywords_score.unwrap_or(1.0),
        keywords_threshold: cfg.keywords_threshold.unwrap_or(0.25),
        keywords_file: kw_file_ptr,
        keywords_buf: kw_buf,
        keywords_buf_size: kw_buf_size,
    };

    let spotter = unsafe { (sherpa.create_spotter)(&config) };
    if spotter.is_null() {
        return Err(format!("create-spotter-failed: {}", model_dir.display()));
    }
    let stream = unsafe { (sherpa.create_stream)(spotter) };
    if stream.is_null() {
        unsafe { (sherpa.destroy_spotter)(spotter) };
        return Err("create-stream-failed".into());
    }

    Ok(Engine {
        spotter,
        stream,
        device_rate: 16000,
        last_reset: Instant::now(),
        _keep: keep,
    })
}

#[derive(Clone, serde::Serialize)]
pub struct WakePayload {
    pub keyword: String,
    pub pan: f32,
}

fn downmix_and_pan(samples: &[f32], channels: usize, pan_milli: &AtomicI32) -> Vec<f32> {
    if channels <= 1 {
        return samples.to_vec();
    }
    let mut energy_l = 0.0f32;
    let mut energy_r = 0.0f32;
    let mut mono: Vec<f32> = Vec::with_capacity(samples.len() / channels);
    for frame in samples.chunks(channels) {
        if frame.len() < channels {
            break;
        }
        let left = frame[0];
        let right = frame[channels - 1];
        let mut sum = 0.0f32;
        for s in frame {
            sum += *s;
        }
        mono.push(sum / channels as f32);
        energy_l += left * left;
        energy_r += right * right;
    }
    if !mono.is_empty() {
        let n = mono.len() as f32;
        let rms_l = (energy_l / n).sqrt();
        let rms_r = (energy_r / n).sqrt();
        if rms_l + rms_r > 0.01 {
            let raw = (rms_r - rms_l) / (rms_l + rms_r + 1e-6);
            let prev = pan_milli.load(Ordering::Relaxed) as f32 / 1000.0;
            let smoothed = prev * 0.72 + raw * 0.28;
            pan_milli.store((smoothed * 1000.0) as i32, Ordering::Relaxed);
        }
    }
    mono
}

pub fn run(
    app: AppHandle,
    base: PathBuf,
    engines_cfg: Vec<EngineConfig>,
    asr_cfg: Option<crate::asr::AsrConfig>,
    stop: &AtomicBool,
    speaking: &AtomicBool,
) -> Result<(), String> {
    let mic_gain = engines_cfg
        .iter()
        .find_map(|c| c.mic_gain)
        .unwrap_or(2.5)
        .clamp(0.5, 8.0);
    eprintln!("[mino] kws mic_gain: {mic_gain}");

    let dll_name = if cfg!(windows) {
        "sherpa-onnx-c-api.dll"
    } else if cfg!(target_os = "macos") {
        "libsherpa-onnx-c-api.dylib"
    } else {
        "libsherpa-onnx-c-api.so"
    };
    let dll_path = base.join("sherpa-bin").join(dll_name);
    if !dll_path.is_file() {
        let _ = app.emit("mino-wake-status", "dll-missing");
        return Err(format!("dll-missing: {}", dll_path.display()));
    }

    let bin_dir = base.join("sherpa-bin");
    let mut deps: Vec<Library> = Vec::new();
    for dep in ["onnxruntime.dll", "onnxruntime_providers_shared.dll"] {
        let dep_path = bin_dir.join(dep);
        if dep_path.is_file() {
            match load_lib_isolated(&dep_path) {
                Ok(dep_lib) => deps.push(dep_lib),
                Err(e) => eprintln!("[mino] dep load warn: {e}"),
            }
        }
    }

    let lib = load_lib_isolated(&dll_path)?;
    let mut sherpa = load_symbols(lib)?;
    sherpa._deps = deps;
    let sherpa = sherpa;

    let mut engines: Vec<Engine> = Vec::new();
    for cfg in &engines_cfg {
        match build_engine(&sherpa, cfg, &base) {
            Ok(engine) => engines.push(engine),
            Err(e) => {
                let _ = app.emit("mino-wake-status", format!("error:{e}"));
                return Err(e);
            }
        }
    }
    if engines.is_empty() {
        let _ = app.emit("mino-wake-status", "no-engine");
        return Err("no-engine".into());
    }

    let (tx, rx) = mpsc::channel::<Vec<f32>>();

    let host = cpal::default_host();
    let device = host.default_input_device().ok_or_else(|| {
        let _ = app.emit("mino-wake-status", "no-microphone");
        "no-input-device".to_string()
    })?;
    let default_cfg = device
        .default_input_config()
        .map_err(|e| format!("no-input-config:{e}"))?;
    let sample_rate = default_cfg.sample_rate().0;
    let channels = default_cfg.channels();
    let stream_config = cpal::StreamConfig {
        channels,
        sample_rate: cpal::SampleRate(sample_rate),
        buffer_size: cpal::BufferSize::Default,
    };

    let err_cb = |e: cpal::StreamError| {
        eprintln!("mino-kws audio error: {e}");
    };

    let tx_audio = tx.clone();
    let pan_state = Arc::new(AtomicI32::new(0));
    let pan_cb_f32 = pan_state.clone();
    let ch_count = channels as usize;
    let build_f32 = device.build_input_stream(
        &stream_config,
        move |data: &[f32], _: &cpal::InputCallbackInfo| {
            let mono = downmix_and_pan(data, ch_count, pan_cb_f32.as_ref());
            let _ = tx_audio.send(mono);
        },
        err_cb,
        None,
    );

    let stream = match build_f32 {
        Ok(s) => s,
        Err(_) => {
            let tx_audio = tx.clone();
            let pan_cb_i16 = pan_state.clone();
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        let floats: Vec<f32> =
                            data.iter().map(|s| *s as f32 / 32768.0).collect();
                        let mono = downmix_and_pan(&floats, ch_count, pan_cb_i16.as_ref());
                        let _ = tx_audio.send(mono);
                    },
                    err_cb,
                    None,
                )
                .map_err(|e| {
                    let _ = app.emit("mino-wake-status", "mic-error");
                    format!("build-stream-failed:{e}")
                })?
        }
    };

    stream.play().ok();

    for engine in engines.iter_mut() {
        engine.device_rate = sample_rate as i32;
    }

    let mut asr: Option<crate::asr::AsrRuntime> = None;
    if let Some(cfg) = asr_cfg {
        match crate::asr::AsrRuntime::new(&base, &cfg) {
            Ok(mut rt) => {
                rt.set_device_rate(sample_rate as i32);
                asr = Some(rt);
                let _ = app.emit("mino-asr-status", "ready");
            }
            Err(e) => {
                eprintln!("[mino] asr init failed: {e}");
                let _ = app.emit("mino-asr-status", format!("error:{e}"));
            }
        }
    }
    let mut asr_arm: Option<Instant> = None;
    let mut asr_started = Instant::now();
    let mut asr_active = false;

    let _ = app.emit("mino-wake-status", "listening");
    eprintln!(
        "[mino] kws listening: rate={}, engines={}, dll={}",
        sample_rate,
        engines.len(),
        dll_path.display()
    );

    let mut last_wake: Option<Instant> = None;
    let mut peak_report = Instant::now();
    let mut peak: f32 = 0.0;
    let mut hold_until: Option<Instant> = None;
    let mut echo_base: f32 = 0.12;
    let mut interrupted = false;

    while !stop.load(Ordering::SeqCst) {
        let mut chunk = match rx.recv() {
            Ok(c) => c,
            Err(_) => break,
        };
        if chunk.is_empty() {
            continue;
        }

        let now = Instant::now();
        let speaking_now = speaking.load(Ordering::SeqCst);
        if !speaking_now {
            interrupted = false;
        }

        for sample in &chunk {
            let v = sample.abs();
            if v > peak {
                peak = v;
            }
        }
        if peak_report.elapsed() > Duration::from_secs(2) {
            eprintln!("[mino] mic peak: {peak:.4}");
            peak = 0.0;
            peak_report = now;
        }
        if (mic_gain - 1.0).abs() > 0.01 {
            for s in chunk.iter_mut() {
                *s = (*s * mic_gain).tanh();
            }
        }

        let mut energy = 0.0f32;
        for s in &chunk {
            energy += s * s;
        }
        let rms = (energy / chunk.len().max(1) as f32).sqrt();

        if let Some(arm) = asr_arm.take() {
            if let Some(rt) = asr.as_mut() {
                rt.begin();
                asr_started = arm;
                asr_active = true;
                interrupted = speaking_now;
                hold_until = Some(now + Duration::from_millis(160));
                echo_base = rms.max(0.08);
                let _ = app.emit("mino-asr-status", "listening");
            }
        }

        if speaking_now && asr_active {
            let loud = rms > 0.28 && rms > echo_base * 2.2;
            if loud {
                eprintln!("[mino] barge-in: rms={rms:.3} base={echo_base:.3}");
                crate::tts::abort_playback();
                hold_until = None;
                interrupted = true;
            } else {
                echo_base = echo_base * 0.9 + rms * 0.1;
            }
        }

        if asr_active {
            if let Some(rt) = asr.as_mut() {
                let holding = (speaking.load(Ordering::SeqCst) && !interrupted)
                    || hold_until.map(|t| now < t).unwrap_or(false);
                let changed = if holding {
                    let silence = vec![0.0f32; chunk.len()];
                    let _ = rt.feed(&silence);
                    false
                } else {
                    rt.feed(&chunk)
                };
                if changed {
                    let _ = app.emit(
                        "mino-asr",
                        crate::asr::AsrPayload::new(rt.text.clone(), false),
                    );
                }
                let idle = rt.last_voice.map(|t| t.elapsed()).unwrap_or(Duration::MAX);
                let spoken = rt.voiced && !rt.text.is_empty();
                let endpoint = spoken && rt.is_endpoint();
                let silence_done = spoken && idle > Duration::from_millis(1800);
                let no_speech = !rt.voiced && asr_started.elapsed() > Duration::from_secs(9);
                let too_long = asr_started.elapsed() > Duration::from_secs(16);
                if endpoint || silence_done || no_speech || too_long {
                    if spoken {
                        eprintln!("[mino] asr text: {}", rt.text);
                    }
                    let _ = app.emit(
                        "mino-asr",
                        crate::asr::AsrPayload::new(
                            if spoken { rt.text.clone() } else { String::new() },
                            true,
                        ),
                    );
                    rt.end();
                    asr_active = false;
                    let _ = app.emit("mino-asr-status", "idle");
                }
            }
        }

        for engine in engines.iter_mut() {
            if speaking_now {
                unsafe { (sherpa.reset)(engine.spotter, engine.stream) };
                engine.last_reset = now;
                continue;
            }
            if engine.last_reset.elapsed() > Duration::from_secs(20) {
                unsafe { (sherpa.reset)(engine.spotter, engine.stream) };
                engine.last_reset = now;
            }

            unsafe {
                (sherpa.accept_waveform)(
                    engine.stream,
                    engine.device_rate,
                    chunk.as_ptr(),
                    chunk.len() as i32,
                )
            };

            let mut found: Option<String> = None;
            while unsafe { (sherpa.is_ready)(engine.spotter, engine.stream) } == 1 {
                unsafe { (sherpa.decode)(engine.spotter, engine.stream) };
                let result = unsafe { (sherpa.get_result)(engine.spotter, engine.stream) };
                if !result.is_null() {
                    unsafe {
                        let ptr = (*result).keyword;
                        if !ptr.is_null() {
                            let keyword = CStr::from_ptr(ptr).to_string_lossy().into_owned();
                            if !keyword.trim().is_empty() {
                                found = Some(keyword);
                            }
                        }
                        (sherpa.destroy_result)(result);
                    }
                }
            }

            if let Some(keyword) = found {
                let cooldown = last_wake.map(|w| w.elapsed()).unwrap_or(Duration::MAX);
                unsafe { (sherpa.reset)(engine.spotter, engine.stream) };
                engine.last_reset = now;
                if cooldown > Duration::from_millis(700) && !asr_active {
                    last_wake = Some(now);
                    let pan = pan_state.load(Ordering::Relaxed) as f32 / 1000.0;
                    let pan = (pan * 100.0).round() / 100.0;
                    eprintln!("[mino] keyword hit: {keyword} pan={pan:.2}");
                    let _ = app.emit("mino-wake", WakePayload { keyword, pan });
                    let _ = app.emit("mino-wake-status", "triggered");
                    asr_arm = Some(now);
                }
            }
        }
    }

    for engine in engines {
        unsafe {
            (sherpa.destroy_stream)(engine.stream);
            (sherpa.destroy_spotter)(engine.spotter);
        }
    }
    drop(stream);
    Ok(())
}
