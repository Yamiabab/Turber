import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import SlideCommit from './SlideCommit';
import PetFace from './PetFace';
import PromptBar from './PromptBar';
import ChatPanel from './ChatPanel';
import { MenuButton } from './AppMenu';
import { STRINGS, voiceHint } from './i18n';
import { chatStream } from './bridge';
import { useSettingsStore } from '../core/store/useSettingsStore';
import { ControlPanelSheet } from '../components/control/ControlPanelSheet';
import { SettingsPanel } from '../components/settings/SettingsPanel';
import { UserViewGuard } from '../components/userview/UserViewGuard';
import './App.css';

let appWindow = null;

const windowApi = () => {
  if (!appWindow && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    appWindow = getCurrentWindow();
  }
  return appWindow;
};

const enterApp = () => {
  if (!windowApi()) return;
  invoke('expand_window').catch(() => {});
};

const collapseApp = () => {
  if (!windowApi()) return;
  invoke('collapse_window').catch(() => {});
};

const IDLE_TIMEOUT = 180000;
const IDLE_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'mino:activity'];

const WAKE_REPLY_TEXT = '我在呢';
const WAKE_REPLY_VOICE = 'zh-CN-XiaoyiNeural';

const WAKE_RATE = -6;
const WAKE_PITCH = 2;

const say = (text, voice = WAKE_REPLY_VOICE, rate = 0, pitch = 0) => {
  if (!windowApi()) return;
  invoke('speak', { text, voice, rate, pitch }).catch(() => {});
};

const SPEAK_MAX = 4000;

const speakable = text => {
  let out = String(text || '');
  out = out.replace(/```[\s\S]*?```/g, ' ');
  out = out.replace(/~~~[\s\S]*?~~~/g, ' ');
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  out = out.replace(/`([^`]*)`/g, '$1');
  out = out.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  out = out.replace(/^\s{0,3}>\s?/gm, '');
  out = out.replace(/^\s*[-*+]\s+/gm, '');
  out = out.replace(/^\s*\d+[.)]\s+/gm, '');
  out = out.replace(/^\s*\|.*\|\s*$/gm, ' ');
  out = out.replace(/^\s*[-:|\s]{3,}$/gm, ' ');
  out = out.replace(/(\*\*|__|\*|_|~~)/g, '');
  out = out.replace(/<[^>]+>/g, ' ');
  out = out.replace(/[\u2500-\u257F]/g, ' ');
  out = out.replace(/[ \t]+/g, ' ');
  out = out.replace(/\n{2,}/g, '\n').trim();
  if (out.length > SPEAK_MAX) out = `${out.slice(0, SPEAK_MAX)}……`;
  return out;
};

const IconMinimize = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d="M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

const IconMaximize = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <rect x="3.5" y="3.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

const IconRestore = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <rect x="5" y="2.5" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <path d="M11 5.5H3v8h8" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

const IconClose = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

function TitleBar({
  voice = 'off',
  listening = false,
  fxKey = 0,
  asrText = '',
  asrFinal = false,
  t,
  showMenu = false,
  voiceReply = true,
  onToggleVoiceReply
}) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = windowApi();
    if (!win) return;
    let active = true;
    let unlisten = () => {};
    const sync = async () => {
      try {
        const value = await win.isMaximized();
        if (active) setMaximized(value);
      } catch {}
    };
    sync();
    win
      .onResized(sync)
      .then(fn => {
        if (active) unlisten = fn;
        else fn();
      })
      .catch(() => {});
    return () => {
      active = false;
      unlisten();
    };
  }, []);

  const toggleMaximize = async () => {
    const win = windowApi();
    if (!win) return;
    try {
      await win.toggleMaximize();
      setMaximized(await win.isMaximized());
    } catch {}
  };

  const minimize = () => windowApi()?.minimize().catch(() => {});
  const close = () => windowApi()?.close().catch(() => {});

  return (
    <div className="titlebar" aria-label={voiceHint(t, voice)}>
      {showMenu && (
        <MenuButton t={t} voiceReply={voiceReply} onToggleVoiceReply={onToggleVoiceReply} />
      )}
      <div className="titlebar__drag" data-tauri-drag-region onDoubleClick={toggleMaximize} />
      <div key={fxKey} className={`titlebar__beam${listening ? ' titlebar__beam--on' : ''}`} aria-hidden="true" />
      {asrText ? (
        <div
          className={`titlebar__asr${asrFinal ? ' titlebar__asr--final' : ''}`}
          aria-live="polite"
          title={asrText}
        >
          <span>{asrText}</span>
        </div>
      ) : null}
      <div className="titlebar__actions">
        <button type="button" className="titlebar__btn" aria-label={t.minimize} onClick={minimize}>
          <IconMinimize />
        </button>
        <button
          type="button"
          className="titlebar__btn"
          aria-label={maximized ? t.restore : t.maximize}
          onClick={toggleMaximize}
        >
          {maximized ? <IconRestore /> : <IconMaximize />}
        </button>
        <button type="button" className="titlebar__btn titlebar__btn--close" aria-label={t.close} onClick={close}>
          <IconClose />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [entered, setEntered] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState('text');
  const [awake, setAwake] = useState(false);
  const [listening, setListening] = useState(false);
  const [pan, setPan] = useState(0);
  const [voice, setVoice] = useState('off');
  const [fxKey, setFxKey] = useState(0);
  const [asrText, setAsrText] = useState('');
  const [asrFinal, setAsrFinal] = useState(false);
  const [asrLive, setAsrLive] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [voiceReply, setVoiceReply] = useState(() => {
    try {
      return window.localStorage.getItem('mino.voiceReply') !== 'off';
    } catch {
      return true;
    }
  });
  const settingsLanguage = useSettingsStore(state => state.language);
  const apis = useSettingsStore(state => state.apis);
  const activeApiId = useSettingsStore(state => state.activeApiId);
  const selectApiEntry = useSettingsStore(state => state.selectApi);
  const voiceTimer = useRef(0);
  const asrTimer = useRef(0);
  const asrLiveTimer = useRef(0);
  const levelRef = useRef(0);
  const enterTimer = useRef(0);
  const awakeTimer = useRef(0);
  const listenTimer = useRef(0);
  const speakTimer = useRef(0);
  const enteredRef = useRef(false);
  const replyRef = useRef({ text: WAKE_REPLY_TEXT, voice: WAKE_REPLY_VOICE });
  const msgSeq = useRef(0);
  const historyRef = useRef([]);
  const chatBusyRef = useRef(false);
  const abortRef = useRef(null);
  const sendRef = useRef(null);
  const barApi = useRef(null);
  const lastVoice = useRef({ text: '', at: 0 });
  const voiceReplyRef = useRef(voiceReply);
  const lang = settingsLanguage === 'en-US' ? 'en' : 'zh';
  const t = STRINGS[lang] || STRINGS.zh;

  useEffect(() => {
    voiceReplyRef.current = voiceReply;
    try {
      window.localStorage.setItem('mino.voiceReply', voiceReply ? 'on' : 'off');
    } catch {}
  }, [voiceReply]);

  const speakReply = text => {
    if (!windowApi() || !voiceReplyRef.current) return;
    const spoken = speakable(text);
    if (!spoken) return;
    say(spoken, replyRef.current.voice, WAKE_RATE, WAKE_PITCH);
  };

  const stopChat = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const sendToAi = async text => {
    const value = String(text || '').trim();
    if (!value) return false;
    if (chatBusyRef.current) return false;
    if (windowApi()) invoke('speak_abort').catch(() => {});
    chatBusyRef.current = true;
    const userId = `m${++msgSeq.current}`;
    const replyId = `m${++msgSeq.current}`;
    const history = [...historyRef.current, { role: 'user', content: value }];
    historyRef.current = history;
    setChatOpen(true);
    setSending(true);
    setMessages(prev => [
      ...prev,
      { id: userId, role: 'user', content: value },
      { id: replyId, role: 'assistant', content: '', pending: true }
    ]);
    const controller = new AbortController();
    abortRef.current = controller;
    let buffer = '';
    let failure = '';
    try {
      await chatStream(history, controller.signal, {
        onDelta: chunk => {
          buffer += chunk;
          const textNow = buffer;
          setMessages(prev =>
            prev.map(item => (item.id === replyId ? { ...item, content: textNow, pending: false } : item))
          );
        },
        onDone: () => {},
        onError: reason => {
          failure = reason;
        }
      });
      const finalText = buffer.trim();
      if (controller.signal.aborted) {
        setMessages(prev =>
          prev.map(item =>
            item.id === replyId ? { ...item, content: finalText || '（已停止）', pending: false } : item
          )
        );
        if (finalText) historyRef.current = [...history, { role: 'assistant', content: finalText }];
        return true;
      }
      if (failure && !finalText) throw failure;
      if (!finalText) throw '接口没有返回任何内容';
      setMessages(prev =>
        prev.map(item => (item.id === replyId ? { ...item, content: finalText, pending: false } : item))
      );
      historyRef.current = [...history, { role: 'assistant', content: finalText }];
      speakReply(finalText);
      return true;
    } catch (err) {
      const reason = typeof err === 'string' ? err : err?.message || '请求失败';
      const partial = buffer.trim();
      setMessages(prev =>
        prev.map(item =>
          item.id === replyId
            ? {
                ...item,
                role: partial ? 'assistant' : 'error',
                content: partial ? `${partial}\n\n（请求中断：${reason}）` : reason,
                pending: false
              }
            : item
        )
      );
      historyRef.current = history;
      return false;
    } finally {
      abortRef.current = null;
      chatBusyRef.current = false;
      setSending(false);
    }
  };
  sendRef.current = sendToAi;

  useEffect(() => {
    enteredRef.current = entered;
  }, [entered]);

  useEffect(() => () => clearTimeout(enterTimer.current), []);

  useEffect(() => {
    if (!entered) return;
    let timer = 0;
    const goIdle = () => {
      const panels = useSettingsStore.getState();
      if (panels.settingsOpen || panels.controlPanelOpen) {
        timer = window.setTimeout(goIdle, IDLE_TIMEOUT);
        return;
      }
      window.clearTimeout(enterTimer.current);
      setEntered(false);
      collapseApp();
    };
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(goIdle, IDLE_TIMEOUT);
    };
    IDLE_EVENTS.forEach(name => window.addEventListener(name, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(timer);
      IDLE_EVENTS.forEach(name => window.removeEventListener(name, reset));
    };
  }, [entered]);

  useEffect(() => {
    if (!windowApi()) return;
    let active = true;
    const pollStatus = () => {
      invoke('music_playing')
        .then(value => {
          if (active) setPlaying(Boolean(value));
        })
        .catch(() => {});
    };
    const pollLevel = () => {
      invoke('music_level')
        .then(value => {
          if (active) levelRef.current = Number(value) || 0;
        })
        .catch(() => {});
    };
    pollStatus();
    pollLevel();
    const statusTimer = setInterval(pollStatus, 1200);
    const levelTimer = setInterval(pollLevel, 50);
    return () => {
      active = false;
      clearInterval(statusTimer);
      clearInterval(levelTimer);
    };
  }, []);

  useEffect(() => {
    if (!windowApi()) return;
    invoke('wake_reply')
      .then(value => {
        if (Array.isArray(value) && value.length === 2) {
          replyRef.current = {
            text: value[0] || WAKE_REPLY_TEXT,
            voice: value[1] || WAKE_REPLY_VOICE
          };
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    let unlistenWake = () => {};
    let unlistenStatus = () => {};
    let unlistenSpeakStart = () => {};
    let unlistenSpeakEnd = () => {};
    let unlistenAsr = () => {};
    let unlistenAsrStatus = () => {};
    const armAwake = ms => {
      window.clearTimeout(awakeTimer.current);
      awakeTimer.current = window.setTimeout(() => {
        setAwake(false);
        setListening(false);
      }, ms);
    };
    const trigger = event => {
      setVoice('triggered');
      setFxKey(value => value + 1);
      window.clearTimeout(voiceTimer.current);
      voiceTimer.current = window.setTimeout(() => setVoice('listening'), 1200);
      const payload = event?.payload;
      const source = typeof payload === 'string' ? payload : payload?.keyword;
      const panValue = payload && typeof payload === 'object' ? Number(payload.pan) || 0 : 0;
      window.clearTimeout(listenTimer.current);
      window.clearTimeout(speakTimer.current);
      setPan(panValue);
      setAwake(true);
      setListening(false);
      window.clearTimeout(asrTimer.current);
      window.clearTimeout(asrLiveTimer.current);
      setAsrText('');
      setAsrFinal(false);
      setAsrLive(false);
      window.dispatchEvent(new Event('mino:activity'));
      armAwake(4200);
      if (!enteredRef.current) {
        setEntered(true);
        enterApp();
      }
      if (source === 'manual') {
        setListening(true);
        return;
      }
      listenTimer.current = window.setTimeout(() => setListening(true), 180);
      speakTimer.current = window.setTimeout(() => {
        say(replyRef.current.text, replyRef.current.voice, WAKE_RATE, WAKE_PITCH);
      }, 420);
    };
    const onSpeakStart = () => {
      window.clearTimeout(listenTimer.current);
      setAwake(true);
      setListening(true);
      armAwake(4200);
    };
    const onSpeakEnd = () => {
      window.clearTimeout(listenTimer.current);
      setAwake(true);
      setListening(true);
      armAwake(1200);
    };
    const onAsr = event => {
      const payload = event?.payload;
      const text = typeof payload === 'string' ? payload : payload?.text || '';
      const isFinal = Boolean(payload && typeof payload === 'object' && payload.final);
      window.clearTimeout(asrTimer.current);
      window.clearTimeout(asrLiveTimer.current);
      setAsrLive(true);
      setAsrText(text);
      setAsrFinal(isFinal);
      if (isFinal) {
        const spoken = String(text || '').trim();
        if (spoken.length >= 2) {
          const now = Date.now();
          const prevVoice = lastVoice.current;
          if (!(prevVoice.text === spoken && now - prevVoice.at < 1600)) {
            lastVoice.current = { text: spoken, at: now };
            sendRef.current?.(spoken);
          }
        }
        asrTimer.current = window.setTimeout(() => {
          setAsrText('');
          setAsrFinal(false);
        }, 2200);
        asrLiveTimer.current = window.setTimeout(() => setAsrLive(false), 2200);
      }
    };
    const onAsrStatus = event => {
      const status = String(event.payload || '');
      if (status === 'listening') {
        window.clearTimeout(asrLiveTimer.current);
        setAsrLive(true);
        asrLiveTimer.current = window.setTimeout(() => setAsrLive(false), 20000);
        return;
      }
      if (status === 'idle') {
        window.clearTimeout(asrLiveTimer.current);
        asrLiveTimer.current = window.setTimeout(() => setAsrLive(false), 1200);
        return;
      }
      console.info('[turber] asr status:', status);
    };
    if (windowApi()) {
      invoke('voice_wake_start').catch(() => {});
      listen('mino-wake', trigger)
        .then(fn => {
          if (active) unlistenWake = fn;
          else fn();
        })
        .catch(() => {});
      invoke('voice_wake_state')
        .then(value => {
          if (active && typeof value === 'string') setVoice(value);
        })
        .catch(() => {});
      listen('mino-wake-status', event => {
        const status = String(event.payload || '');
        if (status === 'listening') {
          setVoice('listening');
        } else if (status === 'triggered') {
          setVoice('triggered');
          window.clearTimeout(voiceTimer.current);
          voiceTimer.current = window.setTimeout(() => setVoice('listening'), 1200);
        } else {
          console.info('[turber] wake status:', status);
          setVoice('error');
        }
      })
        .then(fn => {
          if (active) unlistenStatus = fn;
          else fn();
        })
        .catch(() => {});
      listen('mino-speak-start', onSpeakStart)
        .then(fn => {
          if (active) unlistenSpeakStart = fn;
          else fn();
        })
        .catch(() => {});
      listen('mino-speak-end', onSpeakEnd)
        .then(fn => {
          if (active) unlistenSpeakEnd = fn;
          else fn();
        })
        .catch(() => {});
      listen('mino-asr', onAsr)
        .then(fn => {
          if (active) unlistenAsr = fn;
          else fn();
        })
        .catch(() => {});
      listen('mino-asr-status', onAsrStatus)
        .then(fn => {
          if (active) unlistenAsrStatus = fn;
          else fn();
        })
        .catch(() => {});
    }
    window.addEventListener('mino:wake', trigger);
    return () => {
      active = false;
      unlistenWake();
      unlistenStatus();
      unlistenSpeakStart();
      unlistenSpeakEnd();
      unlistenAsr();
      unlistenAsrStatus();
      window.removeEventListener('mino:wake', trigger);
      window.clearTimeout(awakeTimer.current);
      window.clearTimeout(listenTimer.current);
      window.clearTimeout(speakTimer.current);
      window.clearTimeout(voiceTimer.current);
      window.clearTimeout(asrTimer.current);
      window.clearTimeout(asrLiveTimer.current);
    };
  }, []);

  const handleDone = () => {
    enterTimer.current = setTimeout(() => {
      setEntered(true);
      enterApp();
    }, 1000);
  };

  return (
    <div className="app">
      <TitleBar
        voice={voice}
        listening={listening || asrLive}
        fxKey={fxKey}
        asrText={asrText}
        asrFinal={asrFinal}
        t={t}
        showMenu={entered}
        voiceReply={voiceReply}
        onToggleVoiceReply={setVoiceReply}
      />
      <main className="stage">{!entered && <SlideCommit holdMs={0} onDone={handleDone} />}</main>
      {entered && (
        <ChatPanel
          open={chatOpen}
          messages={messages}
          onClose={() => setChatOpen(false)}
          hint={t.chatHint}
          title={t.chatTitle}
        />
      )}
      {entered && (
        <div className="composer">
          <PetFace playing={playing} levelRef={levelRef} awake={awake} listening={listening} pan={pan} dim={chatOpen} />
          <PromptBar
            width={720}
            mode={mode}
            onModeChange={setMode}
            apiRef={barApi}
            busy={sending}
            models={apis.map(item => ({ key: item.id, name: item.name || item.model, tag: item.model }))}
            defaultModel={activeApiId ?? ''}
            onModelChange={id => selectApiEntry(id)}
            onSend={text => sendRef.current?.(text)}
            onStop={stopChat}
          />
        </div>
      )}
      <ControlPanelSheet />
      <SettingsPanel />
      <UserViewGuard />
    </div>
  );
}
