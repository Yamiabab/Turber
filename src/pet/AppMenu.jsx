import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../core/store/useSettingsStore';

const IconMark = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
  </svg>
);

const IconSliders = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
    <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" />
  </svg>
);

const IconGear = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
  </svg>
);

const IconVolume = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z" />
  </svg>
);

export function MenuButton({ t, voiceReply = true, onToggleVoiceReply }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const setSettingsOpen = useSettingsStore(state => state.setSettingsOpen);
  const setControlPanelOpen = useSettingsStore(state => state.setControlPanelOpen);

  useEffect(() => {
    if (!open) return;
    const onDown = event => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = action => {
    setOpen(false);
    action();
  };

  return (
    <div className="titlebar__menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`titlebar__logo${open ? ' titlebar__logo--active' : ''}`}
        aria-label={t.menu}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <IconMark />
      </button>
      {open && (
        <div className="titlebar__menu" role="menu">
          <button
            type="button"
            className="titlebar__menu-item"
            role="menuitem"
            onClick={() => pick(() => setControlPanelOpen(true))}
          >
            <IconSliders />
            <span>{t.control}</span>
          </button>
          <button
            type="button"
            className="titlebar__menu-item"
            role="menuitem"
            onClick={() => pick(() => setSettingsOpen(true))}
          >
            <IconGear />
            <span>{t.settings}</span>
          </button>
          <button
            type="button"
            className="titlebar__menu-item"
            role="menuitemcheckbox"
            aria-checked={voiceReply}
            data-on={voiceReply ? '' : undefined}
            onClick={() => onToggleVoiceReply?.(!voiceReply)}
          >
            <IconVolume />
            <span>{t.voiceReply}</span>
            <span className="titlebar__menu-mark">{voiceReply ? t.voiceReplyOn : t.voiceReplyOff}</span>
          </button>
        </div>
      )}
    </div>
  );
}
