use std::collections::HashMap;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use msedge_tts::tts::client::connect;
use msedge_tts::tts::SpeechConfig;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error as SymError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

pub const DEFAULT_VOICE: &str = "zh-CN-XiaoyiNeural";

pub const VOICES: &[(&str, &str)] = &[
    ("zh-CN-XiaoyiNeural", "晓伊 · 温柔女声"),
    ("zh-CN-XiaoxiaoNeural", "晓晓 · 自然女声"),
    ("zh-CN-XiaochenNeural", "晓辰 · 轻快女声"),
    ("zh-CN-XiaohanNeural", "晓涵 · 沉稳女声"),
    ("zh-CN-YunxiNeural", "云希 · 少年男声"),
    ("zh-CN-YunjianNeural", "云健 · 磁性男声"),
    ("zh-CN-YunxiaNeural", "云夏 · 童声"),
    ("zh-CN-XiaomoNeural", "晓墨 · 情感女声"),
];

static PLAY_LOCK: Mutex<()> = Mutex::new(());

static ABORT: AtomicBool = AtomicBool::new(false);

pub fn abort_playback() {
    ABORT.store(true, Ordering::SeqCst);
}

pub fn synthesize(text: &str, voice: &str, rate: i32, pitch: i32) -> Result<Vec<u8>, String> {
    let voice_name = if voice.trim().is_empty() {
        DEFAULT_VOICE.to_string()
    } else {
        voice.trim().to_string()
    };
    let config = SpeechConfig {
        voice_name,
        audio_format: "audio-24khz-48kbitrate-mono-mp3".to_string(),
        pitch,
        rate,
        volume: 0,
    };
    let mut client = connect().map_err(|e| format!("tts-connect:{e}"))?;
    let audio = client
        .synthesize(text, &config)
        .map_err(|e| format!("tts-synth:{e}"))?;
    if audio.audio_bytes.is_empty() {
        return Err("tts-empty".into());
    }
    Ok(audio.audio_bytes)
}

struct Pcm {
    samples: Vec<f32>,
    channels: usize,
    rate: u32,
}

fn decode_mp3(bytes: &[u8]) -> Result<Pcm, String> {
    let source = MediaSourceStream::new(Box::new(Cursor::new(bytes.to_vec())), Default::default());
    let mut hint = Hint::new();
    hint.with_extension("mp3");

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            source,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("mp3-probe:{e}"))?;
    let mut format = probed.format;

    let track = format
        .default_track()
        .ok_or_else(|| "mp3-no-track".to_string())?;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("mp3-decoder:{e}"))?;

    let mut samples: Vec<f32> = Vec::new();
    let mut channels = track.codec_params.channels.map(|c| c.count()).unwrap_or(1);
    let mut rate = track.codec_params.sample_rate.unwrap_or(24000);

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymError::IoError(err)) if err.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(SymError::ResetRequired) => break,
            Err(err) => return Err(format!("mp3-packet:{err}")),
        };
        if packet.track_id() != track_id {
            continue;
        }
        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                channels = spec.channels.count();
                rate = spec.rate;
                let mut buffer = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
                buffer.copy_interleaved_ref(decoded);
                samples.extend_from_slice(buffer.samples());
            }
            Err(SymError::DecodeError(_)) => continue,
            Err(err) => return Err(format!("mp3-decode:{err}")),
        }
    }

    if samples.is_empty() {
        return Err("mp3-empty".into());
    }
    Ok(Pcm {
        samples,
        channels,
        rate,
    })
}

fn resample(input: &[f32], channels: usize, from: u32, to: u32) -> Vec<f32> {
    if from == to || from == 0 {
        return input.to_vec();
    }
    let frames_in = input.len() / channels;
    let frames_out = ((frames_in as u64 * to as u64) / from as u64).max(1) as usize;
    let ratio = from as f64 / to as f64;
    let mut out = vec![0.0f32; frames_out * channels];
    for i in 0..frames_out {
        let pos = i as f64 * ratio;
        let idx = pos.floor() as usize;
        let frac = (pos - idx as f64) as f32;
        let i0 = idx.min(frames_in - 1);
        let i1 = (idx + 1).min(frames_in - 1);
        for ch in 0..channels {
            let s0 = input[i0 * channels + ch];
            let s1 = input[i1 * channels + ch];
            out[i * channels + ch] = s0 + (s1 - s0) * frac;
        }
    }
    out
}

fn cache_key(text: &str, voice: &str, rate: i32, pitch: i32) -> String {
    format!("{text}\u{1}{voice}\u{1}{rate}\u{1}{pitch}")
}

static PCM_CACHE: OnceLock<Mutex<HashMap<String, Arc<Pcm>>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<String, Arc<Pcm>>> {
    PCM_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cached(key: &str) -> Option<Arc<Pcm>> {
    cache().lock().ok().and_then(|guard| guard.get(key).cloned())
}

fn store(key: String, pcm: Pcm) -> Arc<Pcm> {
    let arc = Arc::new(pcm);
    if let Ok(mut guard) = cache().lock() {
        if guard.len() > 16 {
            guard.clear();
        }
        guard.insert(key, arc.clone());
    }
    arc
}

fn pcm_for(text: &str, voice: &str, rate: i32, pitch: i32) -> Result<Arc<Pcm>, String> {
    let key = cache_key(text, voice, rate, pitch);
    if let Some(hit) = cached(&key) {
        return Ok(hit);
    }
    let bytes = synthesize(text, voice, rate, pitch)?;
    let pcm = decode_mp3(&bytes)?;
    Ok(store(key, pcm))
}

pub fn prewarm(text: &str, voice: &str, rate: i32, pitch: i32) -> bool {
    let text = text.trim();
    if text.is_empty() {
        return false;
    }
    let key = cache_key(text, voice, rate, pitch);
    if cached(&key).is_some() {
        return true;
    }
    match pcm_for(text, voice, rate, pitch) {
        Ok(_) => {
            eprintln!("[mino] tts warm ok: {text}");
            true
        }
        Err(err) => {
            eprintln!("[mino] tts warm fail: {err}");
            false
        }
    }
}

fn build_frames(pcm: &Pcm, out_rate: u32, out_channels: usize) -> Vec<f32> {
    let mono: Vec<f32> = if pcm.channels <= 1 {
        pcm.samples.clone()
    } else {
        pcm.samples
            .chunks(pcm.channels)
            .map(|c| c.iter().sum::<f32>() / pcm.channels as f32)
            .collect()
    };
    let mono = resample(&mono, 1, pcm.rate, out_rate);
    if out_channels <= 1 {
        return mono;
    }
    let delay = ((out_rate as f32) * 0.026) as usize;
    let total = mono.len() + delay;
    let mut frames = Vec::with_capacity(total * 2);
    for i in 0..total {
        let dry = mono.get(i).copied().unwrap_or(0.0);
        let wet = if i >= delay { mono[i - delay] * 0.32 } else { 0.0 };
        frames.push(dry * 0.95);
        frames.push(dry * 0.68 + wet);
    }
    frames
}

fn play_pcm(pcm: &Pcm) -> Result<(), String> {
    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or_else(|| "no-output-device".to_string())?;
    let supported = device
        .default_output_config()
        .map_err(|e| format!("no-output-config:{e}"))?;
    let out_rate = supported.sample_rate().0;
    let out_channels = supported.channels() as usize;

    let data = Arc::new(build_frames(pcm, out_rate, out_channels));
    let stereo = out_channels > 1;
    let total = if stereo { data.len() / 2 } else { data.len() };
    let cursor = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let done = Arc::new(AtomicBool::new(false));

    let data_cb = data.clone();
    let cursor_cb = cursor.clone();
    let done_cb = done.clone();
    let stream_config = cpal::StreamConfig {
        channels: out_channels as u16,
        sample_rate: cpal::SampleRate(out_rate),
        buffer_size: cpal::BufferSize::Default,
    };
    let err_fn = |e: cpal::StreamError| eprintln!("mino-tts play error: {e}");

    let build = device.build_output_stream::<f32, _, _>(
        &stream_config,
        move |out: &mut [f32], _: &cpal::OutputCallbackInfo| {
            if ABORT.load(Ordering::Relaxed) {
                for s in out.iter_mut() {
                    *s = 0.0;
                }
                done_cb.store(true, Ordering::Relaxed);
                return;
            }
            let mut pos = cursor_cb.load(Ordering::Relaxed);
            for frame in out.chunks_mut(out_channels) {
                if pos < total && stereo {
                    let l = data_cb[pos * 2];
                    let r = data_cb[pos * 2 + 1];
                    frame[0] = l;
                    if frame.len() > 1 {
                        frame[1] = r;
                    }
                    for s in frame[2..].iter_mut() {
                        *s = (l + r) * 0.5;
                    }
                } else if pos < total {
                    let v = data_cb[pos];
                    for s in frame.iter_mut() {
                        *s = v;
                    }
                } else {
                    for s in frame.iter_mut() {
                        *s = 0.0;
                    }
                }
                pos += 1;
            }
            cursor_cb.store(pos, Ordering::Relaxed);
            if pos >= total {
                done_cb.store(true, Ordering::Relaxed);
            }
        },
        err_fn,
        None,
    );

    let stream = match build {
        Ok(stream) => stream,
        Err(_) => {
            let data_cb = data.clone();
            let cursor_cb = cursor.clone();
            let done_cb = done.clone();
            let err_fn = |e: cpal::StreamError| eprintln!("mino-tts play error: {e}");
            device
                .build_output_stream::<i16, _, _>(
                    &stream_config,
                    move |out: &mut [i16], _: &cpal::OutputCallbackInfo| {
                        if ABORT.load(Ordering::Relaxed) {
                            for s in out.iter_mut() {
                                *s = 0;
                            }
                            done_cb.store(true, Ordering::Relaxed);
                            return;
                        }
                        let mut pos = cursor_cb.load(Ordering::Relaxed);
                        for frame in out.chunks_mut(out_channels) {
                            if pos < total && stereo {
                                let l = data_cb[pos * 2];
                                let r = data_cb[pos * 2 + 1];
                                frame[0] = (l.clamp(-1.0, 1.0) * 32767.0) as i16;
                                if frame.len() > 1 {
                                    frame[1] = (r.clamp(-1.0, 1.0) * 32767.0) as i16;
                                }
                                let mid = ((l + r) * 0.5).clamp(-1.0, 1.0) * 32767.0;
                                for s in frame[2..].iter_mut() {
                                    *s = mid as i16;
                                }
                            } else if pos < total {
                                let v = (data_cb[pos].clamp(-1.0, 1.0) * 32767.0) as i16;
                                for s in frame.iter_mut() {
                                    *s = v;
                                }
                            } else {
                                for s in frame.iter_mut() {
                                    *s = 0;
                                }
                            }
                            pos += 1;
                        }
                        cursor_cb.store(pos, Ordering::Relaxed);
                        if pos >= total {
                            done_cb.store(true, Ordering::Relaxed);
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("play-stream:{e}"))?
        }
    };

    stream.play().map_err(|e| format!("play:{e}"))?;

    let expected = Duration::from_secs_f64(total as f64 / out_rate as f64);
    let started = Instant::now();
    while !done.load(Ordering::Relaxed) {
        if started.elapsed() > expected + Duration::from_secs(2) {
            break;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    std::thread::sleep(Duration::from_millis(120));
    drop(stream);
    Ok(())
}

pub fn speak(
    text: &str,
    voice: &str,
    rate: i32,
    pitch: i32,
    speaking: &AtomicBool,
) -> Result<(), String> {
    let text = text.trim();
    if text.is_empty() {
        return Ok(());
    }
    let guard = PLAY_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    ABORT.store(false, Ordering::SeqCst);
    speaking.store(true, Ordering::SeqCst);
    let result = (|| -> Result<(), String> {
        let pcm = pcm_for(text, voice, rate, pitch)?;
        play_pcm(&pcm)
    })();
    speaking.store(false, Ordering::SeqCst);
    drop(guard);
    result
}

pub fn list_voices() -> Vec<(String, String)> {
    VOICES
        .iter()
        .map(|(id, label)| (id.to_string(), label.to_string()))
        .collect()
}
