import { useEffect, useRef } from 'react';
import LatticeLoader from './LatticeLoader';
import './ChatPanel.css';

export default function ChatPanel({ messages, open, onClose, hint, title = '对话' }) {
  const listRef = useRef(null);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!open || !onClose) return undefined;
    const onKey = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="chat" role="log" aria-live="polite">
      <div className="chat__head">
        <span className="chat__title">{title}</span>
      </div>
      <div className="chat__list" ref={listRef}>
        {messages.length === 0 && <p className="chat__empty">{hint}</p>}
        {messages.map(item => {
          const thinkingRow = item.pending && !item.content;
          return (
            <div key={item.id} className={`chat__row chat__row--${item.role}${thinkingRow ? ' chat__row--thinking' : ''}`}>
              <div className={`chat__bubble chat__bubble--${item.role}${item.pending ? ' chat__bubble--pending' : ''}`}>
                {thinkingRow ? (
                  <LatticeLoader
                    className="chat__think"
                    grid={3}
                    pattern="orbit"
                    cellSize={5}
                    gap={2}
                    fontSize={12.5}
                    color="#b7c9ff"
                    glow
                    glowColor="#8ea6ff"
                  />
                ) : (
                  item.content
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
