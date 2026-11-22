use std::ffi::{c_char, CStr, CString};
use std::path::{Path, PathBuf};

use libloading::Library;

use crate::kws::load_lib_isolated;

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
struct OnlineCtcFstDecoderConfig {
    graph: *const c_char,
    max_active: i32,
}

#[repr(C)]
struct HomophoneReplacerConfig {
    dict_dir: *const c_char,
    lexicon: *const c_char,
    rule_fsts: *const c_char,
}

#[repr(C)]
struct OnlineRecognizerConfig {
    feat_config: SherpaFeatureConfig,
    model_config: OnlineModelConfig,
    decoding_method: *const c_char,
    max_active_paths: i32,
    enable_endpoint: i32,
    rule1_min_trailing_silence: f32,
    rule2_min_trailing_silence: f32,
    rule3_min_utterance_length: f32,
    hotwords_file: *const c_char,
    hotwords_score: f32,
    ctc_fst_decoder_config: OnlineCtcFstDecoderConfig,
    rule_fsts: *const c_char,
    rule_fars: *const c_char,
    blank_penalty: f32,
    hotwords_buf: *const c_char,
    hotwords_buf_size: i32,
    hr: HomophoneReplacerConfig,
}

#[repr(C)]
struct OnlineRecognizerResult {
    text: *const c_char,
    tokens: *const c_char,
    tokens_arr: *const *const c_char,
    timestamps: *const f32,
    count: i32,
    json: *const c_char,
}

enum SherpaRecognizer {}
enum SherpaStream {}

type CreateRecognizerFn =
    unsafe extern "C" fn(*const OnlineRecognizerConfig) -> *const SherpaRecognizer;
type DestroyRecognizerFn = unsafe extern "C" fn(*const SherpaRecognizer);
type CreateStreamFn = unsafe extern "C" fn(*const SherpaRecognizer) -> *const SherpaStream;
type DestroyStreamFn = unsafe extern "C" fn(*const SherpaStream);
type AcceptWaveformFn = unsafe extern "C" fn(*const SherpaStream, i32, *const f32, i32);
type IsReadyFn = unsafe extern "C" fn(*const SherpaRecognizer, *const SherpaStream) -> i32;
type DecodeFn = unsafe extern "C" fn(*const SherpaRecognizer, *const SherpaStream);
type GetResultFn = unsafe extern "C" fn(
    *const SherpaRecognizer,
    *const SherpaStream,
) -> *const OnlineRecognizerResult;
type DestroyResultFn = unsafe extern "C" fn(*const OnlineRecognizerResult);
type IsEndpointFn = unsafe extern "C" fn(*const SherpaRecognizer, *const SherpaStream) -> i32;
type ResetFn = unsafe extern "C" fn(*const SherpaRecognizer, *const SherpaStream);

struct AsrLib {
    _lib: Library,
    create_recognizer: CreateRecognizerFn,
    destroy_recognizer: DestroyRecognizerFn,
    create_stream: CreateStreamFn,
    destroy_stream: DestroyStreamFn,
    accept_waveform: AcceptWaveformFn,
    is_ready: IsReadyFn,
    decode: DecodeFn,
    get_result: GetResultFn,
    destroy_result: DestroyResultFn,
    is_endpoint: IsEndpointFn,
    reset: ResetFn,
}

impl AsrLib {
    fn load(path: &Path) -> Result<Self, String> {
        let lib = load_lib_isolated(path)?;
        unsafe {
            let create_recognizer = *lib
                .get(b"SherpaOnnxCreateOnlineRecognizer\0")
                .map_err(|e| format!("missing SherpaOnnxCreateOnlineRecognizer: {e}"))?;
            let destroy_recognizer = *lib
                .get(b"SherpaOnnxDestroyOnlineRecognizer\0")
                .map_err(|e| format!("missing SherpaOnnxDestroyOnlineRecognizer: {e}"))?;
            let create_stream = *lib
                .get(b"SherpaOnnxCreateOnlineStream\0")
                .map_err(|e| format!("missing SherpaOnnxCreateOnlineStream: {e}"))?;
            let destroy_stream = *lib
                .get(b"SherpaOnnxDestroyOnlineStream\0")
                .map_err(|e| format!("missing SherpaOnnxDestroyOnlineStream: {e}"))?;
            let accept_waveform = *lib
                .get(b"SherpaOnnxOnlineStreamAcceptWaveform\0")
                .map_err(|e| format!("missing SherpaOnnxOnlineStreamAcceptWaveform: {e}"))?;
            let is_ready = *lib
                .get(b"SherpaOnnxIsOnlineStreamReady\0")
                .map_err(|e| format!("missing SherpaOnnxIsOnlineStreamReady: {e}"))?;
            let decode = *lib
                .get(b"SherpaOnnxDecodeOnlineStream\0")
                .map_err(|e| format!("missing SherpaOnnxDecodeOnlineStream: {e}"))?;
            let get_result = *lib
                .get(b"SherpaOnnxGetOnlineStreamResult\0")
                .map_err(|e| format!("missing SherpaOnnxGetOnlineStreamResult: {e}"))?;
            let destroy_result = *lib
                .get(b"SherpaOnnxDestroyOnlineRecognizerResult\0")
                .map_err(|e| format!("missing SherpaOnnxDestroyOnlineRecognizerResult: {e}"))?;
            let is_endpoint = *lib
                .get(b"SherpaOnnxOnlineStreamIsEndpoint\0")
                .map_err(|e| format!("missing SherpaOnnxOnlineStreamIsEndpoint: {e}"))?;
            let reset = *lib
                .get(b"SherpaOnnxOnlineStreamReset\0")
                .map_err(|e| format!("missing SherpaOnnxOnlineStreamReset: {e}"))?;

            Ok(AsrLib {
                _lib: lib,
                create_recognizer,
                destroy_recognizer,
                create_stream,
                destroy_stream,
                accept_waveform,
                is_ready,
                decode,
                get_result,
                destroy_result,
                is_endpoint,
                reset,
            })
        }
    }
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct AsrConfig {
    #[serde(default = "default_model_dir")]
    pub model_dir: String,
    #[serde(default = "default_model_type")]
    pub model_type: String,
    #[serde(default = "default_feature_dim")]
    pub feature_dim: i32,
    #[serde(default = "default_num_threads")]
    pub num_threads: i32,
    #[serde(default = "default_rule2")]
    pub rule2_min_trailing_silence: f32,
}

fn default_model_dir() -> String {
    "asr-zh-en-int8".to_string()
}
fn default_model_type() -> String {
    "transducer".to_string()
}
fn default_feature_dim() -> i32 {
    80
}
fn default_num_threads() -> i32 {
    2
}
fn default_rule2() -> f32 {
    0.6
}

impl Default for AsrConfig {
    fn default() -> Self {
        Self {
            model_dir: default_model_dir(),
            model_type: default_model_type(),
            feature_dim: default_feature_dim(),
            num_threads: default_num_threads(),
            rule2_min_trailing_silence: default_rule2(),
        }
    }
}

fn to_cstring(value: &str, keep: &mut Vec<CString>) -> Result<*const c_char, String> {
    let c = CString::new(value).map_err(|e| format!("cstring: {e}"))?;
    let ptr = c.as_ptr();
    keep.push(c);
    Ok(ptr)
}

fn glob_one(dir: &Path, prefix: &str) -> Result<PathBuf, String> {
    let entries = std::fs::read_dir(dir).map_err(|e| format!("read-dir {}: {e}", dir.display()))?;
    let mut fallback: Option<PathBuf> = None;
    let mut int8: Option<PathBuf> = None;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name.starts_with(&prefix.to_lowercase()) && name.ends_with(".onnx") {
            if name.contains("int8") {
                int8 = Some(entry.path());
            } else if fallback.is_none() {
                fallback = Some(entry.path());
            }
        }
    }
    int8.or(fallback)
        .ok_or_else(|| format!("no {prefix}*.onnx in {}", dir.display()))
}

pub struct AsrRuntime {
    lib: AsrLib,
    recognizer: *const SherpaRecognizer,
    stream: *const SherpaStream,
    device_rate: i32,
    _keep: Vec<CString>,
    pub text: String,
    pub voiced: bool,
    pub last_voice: Option<std::time::Instant>,
}

unsafe impl Send for AsrRuntime {}

impl AsrRuntime {
    pub fn new(base: &Path, cfg: &AsrConfig) -> Result<Self, String> {
        let dll_name = if cfg!(windows) {
            "sherpa-onnx-c-api.dll"
        } else if cfg!(target_os = "macos") {
            "libsherpa-onnx-c-api.dylib"
        } else {
            "libsherpa-onnx-c-api.so"
        };
        let dll_path = base.join("sherpa-bin").join(dll_name);
        if !dll_path.is_file() {
            return Err(format!("asr-dll-missing: {}", dll_path.display()));
        }
        let lib = AsrLib::load(&dll_path)?;

        let model_dir = if Path::new(&cfg.model_dir).is_absolute() {
            PathBuf::from(&cfg.model_dir)
        } else {
            base.join("sherpa-models").join(&cfg.model_dir)
        };
        if !model_dir.is_dir() {
            return Err(format!("asr-model-missing: {}", model_dir.display()));
        }
        let is_transducer = cfg.model_type.to_lowercase().contains("transducer");
        let tokens_path = model_dir.join("tokens.txt");
        if !tokens_path.is_file() {
            return Err(format!("asr-tokens-missing: {}", tokens_path.display()));
        }
        let bbpe_path = model_dir.join("bbpe.model").exists().then(|| model_dir.join("bbpe.model")).or_else(|| {
            let bpe = model_dir.join("bpe.model");
            bpe.is_file().then_some(bpe)
        });

        let (encoder_path, decoder_path, joiner_path, ctc_path) = if is_transducer {
            (
                Some(glob_one(&model_dir, "encoder")?),
                Some(glob_one(&model_dir, "decoder")?),
                Some(glob_one(&model_dir, "joiner")?),
                None,
            )
        } else {
            (None, None, None, Some(glob_one(&model_dir, "model")?))
        };

        let mut keep: Vec<CString> = Vec::new();
        let null = std::ptr::null();
        let c_encoder = match &encoder_path {
            Some(path) => to_cstring(&path.to_string_lossy(), &mut keep)?,
            None => null,
        };
        let c_decoder = match &decoder_path {
            Some(path) => to_cstring(&path.to_string_lossy(), &mut keep)?,
            None => null,
        };
        let c_joiner = match &joiner_path {
            Some(path) => to_cstring(&path.to_string_lossy(), &mut keep)?,
            None => null,
        };
        let c_model = match &ctc_path {
            Some(path) => to_cstring(&path.to_string_lossy(), &mut keep)?,
            None => null,
        };
        let c_tokens = to_cstring(&tokens_path.to_string_lossy(), &mut keep)?;
        let c_provider = to_cstring("cpu", &mut keep)?;
        let c_decoding = to_cstring("greedy_search", &mut keep)?;
        let c_model_type = to_cstring(
            if is_transducer { "transducer" } else { "zipformer2_ctc" },
            &mut keep,
        )?;
        let c_bpe = match &bbpe_path {
            Some(path) => to_cstring(&path.to_string_lossy(), &mut keep)?,
            None => null,
        };
        let c_modeling_unit = if c_bpe.is_null() {
            null
        } else {
            to_cstring("bpe", &mut keep)?
        };

        let config = OnlineRecognizerConfig {
            feat_config: SherpaFeatureConfig {
                sample_rate: 16000,
                feature_dim: cfg.feature_dim,
            },
            model_config: OnlineModelConfig {
                transducer: TransducerConfig {
                    encoder: c_encoder,
                    decoder: c_decoder,
                    joiner: c_joiner,
                },
                paraformer: ParaformerConfig {
                    encoder: std::ptr::null(),
                    decoder: std::ptr::null(),
                },
                zipformer2_ctc: Zipformer2CtcConfig {
                    model: c_model,
                },
                tokens: c_tokens,
                num_threads: cfg.num_threads,
                provider: c_provider,
                debug: 0,
                model_type: c_model_type,
                modeling_unit: c_modeling_unit,
                bpe_vocab: c_bpe,
                tokens_buf: std::ptr::null(),
                tokens_buf_size: 0,
                nemo_ctc: NemoCtcConfig {
                    model: std::ptr::null(),
                },
                t_one_ctc: ToneCtcConfig {
                    model: std::ptr::null(),
                },
            },
            decoding_method: c_decoding,
            max_active_paths: 4,
            enable_endpoint: 1,
            rule1_min_trailing_silence: 2.4,
            rule2_min_trailing_silence: cfg.rule2_min_trailing_silence,
            rule3_min_utterance_length: 12.0,
            hotwords_file: std::ptr::null(),
            hotwords_score: 1.5,
            ctc_fst_decoder_config: OnlineCtcFstDecoderConfig {
                graph: std::ptr::null(),
                max_active: 3000,
            },
            rule_fsts: std::ptr::null(),
            rule_fars: std::ptr::null(),
            blank_penalty: 0.0,
            hotwords_buf: std::ptr::null(),
            hotwords_buf_size: 0,
            hr: HomophoneReplacerConfig {
                dict_dir: std::ptr::null(),
                lexicon: std::ptr::null(),
                rule_fsts: std::ptr::null(),
            },
        };

        let recognizer = unsafe { (lib.create_recognizer)(&config) };
        if recognizer.is_null() {
            return Err(format!("asr-create-failed: {}", model_dir.display()));
        }
        let stream = unsafe { (lib.create_stream)(recognizer) };
        if stream.is_null() {
            unsafe { (lib.destroy_recognizer)(recognizer) };
            return Err("asr-create-stream-failed".into());
        }

        eprintln!(
            "[mino] asr loaded: dir={} type={} threads={}",
            model_dir.display(),
            cfg.model_type,
            cfg.num_threads
        );

        Ok(Self {
            lib,
            recognizer,
            stream,
            device_rate: 16000,
            _keep: keep,
            text: String::new(),
            voiced: false,
            last_voice: None,
        })
    }

    pub fn set_device_rate(&mut self, rate: i32) {
        self.device_rate = rate;
    }

    pub fn begin(&mut self) {
        unsafe { (self.lib.reset)(self.recognizer, self.stream) };
        self.text.clear();
        self.voiced = false;
        self.last_voice = None;
    }

    pub fn end(&mut self) {
        unsafe { (self.lib.reset)(self.recognizer, self.stream) };
        self.text.clear();
        self.voiced = false;
        self.last_voice = None;
    }

    pub fn is_endpoint(&self) -> bool {
        unsafe { (self.lib.is_endpoint)(self.recognizer, self.stream) == 1 }
    }

    pub fn feed(&mut self, chunk: &[f32]) -> bool {
        let mut rms = 0.0f32;
        for s in chunk {
            rms += s * s;
        }
        let rms = (rms / chunk.len().max(1) as f32).sqrt();
        if rms > 0.012 {
            self.voiced = true;
            self.last_voice = Some(std::time::Instant::now());
        }

        unsafe {
            (self.lib.accept_waveform)(
                self.stream,
                self.device_rate,
                chunk.as_ptr(),
                chunk.len() as i32,
            );
        }

        let mut changed = false;
        let mut guard = 0;
        loop {
            guard += 1;
            if guard > 64 {
                break;
            }
            if unsafe { (self.lib.is_ready)(self.recognizer, self.stream) } != 1 {
                break;
            }
            unsafe { (self.lib.decode)(self.recognizer, self.stream) };
        }

        let result = unsafe { (self.lib.get_result)(self.recognizer, self.stream) };
        if !result.is_null() {
            unsafe {
                let ptr = (*result).text;
                if !ptr.is_null() {
                    let text = CStr::from_ptr(ptr).to_string_lossy().into_owned();
                    let text = text.trim().to_string();
                    if !text.is_empty() && text != self.text {
                        self.text = text;
                        changed = true;
                    }
                }
                (self.lib.destroy_result)(result);
            }
        }
        changed
    }
}

impl Drop for AsrRuntime {
    fn drop(&mut self) {
        unsafe {
            (self.lib.destroy_stream)(self.stream);
            (self.lib.destroy_recognizer)(self.recognizer);
        }
    }
}

#[derive(Clone, serde::Serialize)]
pub struct AsrPayload {
    pub text: String,
    #[serde(rename = "final")]
    pub is_final: bool,
}

impl AsrPayload {
    pub fn new(text: String, is_final: bool) -> Self {
        Self {
            text,
            is_final,
        }
    }
}
