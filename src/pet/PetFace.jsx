import { useEffect, useRef, useState } from 'react';
import './PetFace.css';

const MOODS = ['happy', 'wink', 'love', 'star', 'shy', 'pout', 'squint', 'surprise'];
const EYE = '#f7f7fb';
const PINK = '#ff5c8a';
const INK = '#20202c';
const WHITE_KEYS = [0, 1, 2, 3, 4];
const BLACK_KEYS = [1, 3];

const SING_NOTES = ['♪', '♫', '♬', '♩', '♩'];

const BLUSH = {
  default: 0.16,
  happy: 0.5,
  wink: 0.42,
  love: 0.75,
  star: 0.12,
  shy: 0.9,
  pout: 0.1,
  squint: 0.35,
  surprise: 0.1,
  music: 0.45,
  sing: 0.6,
  listen: 0.3
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const LONG_REST = [[9000, 16000], [16000, 26000], [26000, 40000]];

const SEGMENTS = [
  { acts: [], weight: 20, duration: [[6000, 11000], [11000, 20000], [20000, 32000]] },
  { acts: [], weight: 9, duration: LONG_REST },
  { acts: ['sway'], weight: 15, duration: [[8000, 14000], [14000, 24000]] },
  { acts: ['piano'], weight: 11, duration: [[7000, 12000], [12000, 19000]] },
  { acts: ['sing'], weight: 9, duration: [[6000, 10000], [10000, 17000]] },
  { acts: ['piano', 'sway'], weight: 11, duration: [[9000, 15000], [15000, 24000]] },
  { acts: ['sing', 'sway'], weight: 9, duration: [[8000, 14000], [14000, 21000]] },
  { acts: ['piano', 'sing'], weight: 7, duration: [[7000, 12000], [12000, 18000]] },
  { acts: ['piano', 'sing', 'sway'], weight: 5, duration: [[6000, 10000], [10000, 15000]] },
  { acts: ['sway'], weight: 4, duration: [[3500, 6000]] }
];

const FIRST_SEGMENTS = SEGMENTS.filter(item => item.acts.includes('piano') || item.acts.includes('sing'));

const pickBand = bands => {
  const [min, max] = bands[Math.floor(Math.random() * bands.length)];
  return min + Math.random() * (max - min);
};

const pickSegment = pool => {
  const total = pool.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of pool) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return pool[pool.length - 1];
};

function createPerformance(setters) {
  let alive = true;
  const timers = new Set();
  const ends = new Map();
  const live = new Set();

  const later = (fn, ms) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, Math.max(0, ms));
    timers.add(id);
    return id;
  };

  const finish = key => {
    const pending = ends.get(key);
    if (pending) {
      window.clearTimeout(pending);
      timers.delete(pending);
    }
    live.delete(key);
    ends.delete(key);
    setters[key](false);
  };

  const extend = (key, ms) => {
    const previous = ends.get(key);
    if (previous) {
      window.clearTimeout(previous);
      timers.delete(previous);
    }
    ends.set(key, later(() => finish(key), ms));
  };

  const runSegment = first => {
    const segment = pickSegment(first ? FIRST_SEGMENTS : SEGMENTS);
    const duration = first ? 9000 + Math.random() * 5000 : pickBand(segment.duration);
    const next = new Set(segment.acts);

    [...live].forEach(key => {
      if (!next.has(key)) {
        later(() => {
          if (live.has(key)) finish(key);
        }, Math.random() * 1400);
      }
    });

    next.forEach(key => {
      if (live.has(key)) {
        extend(key, Math.max(3000, duration - Math.random() * 1800));
      } else {
        const delay = first ? Math.random() * 700 : Math.random() * 1600;
        later(() => {
          if (live.has(key)) return;
          live.add(key);
          setters[key](true);
          extend(key, Math.max(3000, duration - delay - Math.random() * 1800));
        }, delay);
      }
    });

    later(() => runSegment(false), duration);
  };

  runSegment(true);
  return () => {
    alive = false;
    timers.forEach(window.clearTimeout);
    timers.clear();
  };
}

const Heart = () => <path d="M 0 10 C -14 0 -10 -14 0 -6 C 10 -14 14 0 0 10 Z" fill={PINK} />;

const Sparkle = ({ x, y, r, delay = 0 }) => (
  <path
    className="pet__sparkle"
    style={{ animationDelay: `${delay}s` }}
    d={`M ${x} ${y - r} Q ${x} ${y} ${x + r} ${y} Q ${x} ${y} ${x} ${y + r} Q ${x} ${y} ${x - r} ${y} Q ${x} ${y} ${x} ${y - r} Z`}
    fill={INK}
  />
);

function Eye({ mood, side }) {
  if (mood === 'listen') {
    return (
      <g>
        <rect x="-10.4" y="-15" width="20.8" height="29" rx="10.4" fill="url(#petEyeFill)" />
        <ellipse cx="-3.4" cy="-7.8" rx="3.2" ry="4.6" fill="#ffffff" opacity="0.88" />
        <ellipse cx="3.6" cy="-5.6" rx="1.6" ry="2.4" fill="#ffffff" opacity="0.55" />
        <path d="M -6 2.5 Q 0 5.5 6 2.5" fill="none" stroke="#9fa2c8" strokeWidth="1" opacity="0.25" />
      </g>
    );
  }
  if (mood === 'love') return <Heart />;
  if (mood === 'squint') {
    const d = side === 'left' ? 'M -7 -8 L 7 0 L -7 8' : 'M 7 -8 L -7 0 L 7 8';
    return <path d={d} fill="none" stroke={EYE} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (mood === 'happy' || mood === 'music' || mood === 'sing' || (mood === 'wink' && side === 'left')) {
    return <path d="M -11 5 Q 0 -12 11 5 Q 0 -1 -11 5 Z" fill={EYE} />;
  }
  const tilt = mood === 'pout' ? (side === 'left' ? 12 : -12) : 0;
  const wide = mood === 'surprise' || mood === 'star' ? 1.14 : 1;
  return (
    <g transform={`rotate(${tilt}) scale(${wide})`}>
      <rect x="-10" y="-14" width="20" height="28" rx="10" fill="url(#petEyeFill)" />
      <ellipse cx="-3.6" cy="-7.4" rx="3" ry="4.2" fill="#ffffff" opacity="0.75" />
      <path d="M -6.5 10.5 Q 0 13 6.5 10.5" fill="none" stroke="#9fa2c8" strokeWidth="1.1" opacity="0.35" />
      {mood === 'star' && (
        <>
          <Sparkle x={1.5} y={-3} r={5} />
          <Sparkle x={-3} y={4} r={2.4} delay={-0.8} />
        </>
      )}
    </g>
  );
}

function Mouth({ mood }) {
  const stroke = { fill: 'none', stroke: EYE, strokeWidth: 2.2, strokeLinecap: 'round' };
  if (mood === 'sing') {
    return (
      <g>
        <ellipse cx="60" cy="65" rx="3.5" ry="4.5" fill={INK} opacity="0.88" />
        <ellipse cx="60" cy="67" rx="2" ry="2.2" fill={PINK} opacity="0.7" />
      </g>
    );
  }
  if (mood === 'listen') {
    return (
      <g>
        <ellipse cx="60" cy="65.2" rx="2.7" ry="3.2" fill={INK} opacity="0.5" />
        <ellipse cx="60" cy="67.2" rx="1.4" ry="1.2" fill={PINK} opacity="0.45" />
      </g>
    );
  }
  if (mood === 'music') return <ellipse cx="60" cy="65" rx="2" ry="2.6" fill={EYE} opacity="0.85" />;
  if (mood === 'star' || mood === 'surprise') {
    return <ellipse cx="60" cy="65" rx="2.4" ry="3" fill={EYE} opacity="0.9" />;
  }
  if (mood === 'pout') return <path d="M 55 66 L 65 66" {...stroke} opacity="0.8" />;
  if (mood === 'shy') return <path d="M 55 64 Q 60 69 65 64" {...stroke} opacity="0.85" />;
  if (mood === 'squint') return <path d="M 54 63 Q 60 69 66 63" {...stroke} opacity="0.85" />;
  if (mood === 'happy' || mood === 'wink' || mood === 'love') {
    return <path d="M 53 63 Q 60 71 67 63" {...stroke} />;
  }
  return <path d="M 55 64 Q 60 68 65 64" {...stroke} opacity="0.4" />;
}

const PIANO_W = 24;
const PIANO_H = 7;
const PIANO_X = 6;
const PIANO_Y = 72;
const TILT_TOWARD_FACE = 24;
const kW = PIANO_W / WHITE_KEYS.length;
const HAND_R = 2;

function Instrument({ on, levelRef }) {
  const handLRef = useRef(null);
  const handRRef = useRef(null);
  const keyRefs = useRef([]);
  const lastRealRef = useRef(0);

  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const keys = WHITE_KEYS.length;
    const tick = now => {
      const t = now * 0.001;
      const real = levelRef?.current ?? 0;
      if (real > 0) lastRealRef.current = now;
      const stale = now - lastRealRef.current > 1200;
      const beat = Math.pow(Math.max(0, Math.sin(t * 3.2)), 2);
      const swell = Math.sin(t * 1.1) * 0.5 + 0.5;
      const shimmer = Math.sin(t * 8) * 0.5 + 0.5;
      const synth = Math.min(1000, (beat * 0.62 + swell * 0.28 + shimmer * 0.1) * 1000);
      const lv = stale ? synth : real;
      const intensity = lv / 1000;

      const lKey = Math.floor((Math.sin(t * 1.8) * 0.5 + 0.5) * keys) % keys;
      const rKey = Math.floor((Math.sin(t * 1.5 + 1.3) * 0.5 + 0.5) * keys) % keys;

      const energy = 0.55 + intensity * 0.9;
      const lJitterX = (Math.sin(t * 4.1) * 1.2 + Math.sin(t * 2.6) * 0.8) * energy;
      const lJitterY = (Math.cos(t * 3.3) * 0.8 + Math.sin(t * 5.4) * 0.5) * energy;
      const rJitterX = (Math.sin(t * 3.6 + 2) * 1.2 + Math.cos(t * 2.2) * 0.8) * energy;
      const rJitterY = (Math.cos(t * 3 + 1) * 0.8 + Math.sin(t * 4.8 + 0.5) * 0.5) * energy;

      const lX = PIANO_X + lKey * kW + kW / 2 + lJitterX;
      const lY = PIANO_Y - 2 + lJitterY;
      const rX = PIANO_X + rKey * kW + kW / 2 + rJitterX;
      const rY = PIANO_Y - 2 + rJitterY;

      if (handLRef.current) {
        handLRef.current.style.transform = `translate(${lX}px, ${lY}px)`;
      }
      if (handRRef.current) {
        handRRef.current.style.transform = `translate(${rX}px, ${rY}px)`;
      }

      for (let i = 0; i < keyRefs.current.length; i++) {
        const el = keyRefs.current[i];
        if (!el) continue;
        const phase = t * 2.8 + i * 1.3;
        const wave = Math.sin(phase);
        const threshold = 1 - intensity * 1.6;
        const active = wave > threshold && intensity > 0.05;
        el.style.opacity = active ? Math.min(1, intensity * 1.6 + 0.25).toFixed(2) : '0';
      }

      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
      keyRefs.current.forEach(el => {
        if (el) el.style.opacity = '0';
      });
    };
  }, [on, levelRef]);

  const cx = PIANO_X + PIANO_W / 2;
  const cy = PIANO_Y + PIANO_H / 2;

  return (
    <g className={`pet__instrument${on ? ' pet__instrument--on' : ''}`}>
      <g transform={`translate(${cx} ${cy}) rotate(${TILT_TOWARD_FACE}) translate(${-cx} ${-cy})`}>
        <g className="pet__stroke">
          <path d={`M ${PIANO_X} ${PIANO_Y} H ${PIANO_X + PIANO_W} V ${PIANO_Y + PIANO_H} H ${PIANO_X} Z`} />
          {WHITE_KEYS.slice(1).map(index => (
            <path key={index} d={`M ${PIANO_X + index * kW} ${PIANO_Y} V ${PIANO_Y + PIANO_H}`} />
          ))}
          {BLACK_KEYS.map(index => (
            <rect
              key={index}
              x={PIANO_X + index * kW - kW * 0.26}
              y={PIANO_Y}
              width={kW * 0.52}
              height={PIANO_H * 0.55}
              rx="0.4"
            />
          ))}
        </g>
        {WHITE_KEYS.map(index => (
          <rect
            key={index}
            ref={el => { keyRefs.current[index] = el; }}
            className="pet__key"
            x={PIANO_X + index * kW + 0.3}
            y={PIANO_Y + 0.3}
            width={kW - 0.6}
            height={PIANO_H - 0.6}
            rx="0.3"
            style={{ opacity: 0 }}
          />
        ))}
        <g ref={handLRef} className="pet__hand-group">
          <circle cx="0" cy="0" r={HAND_R} fill={EYE} opacity="0.85" />
        </g>
        <g ref={handRRef} className="pet__hand-group pet__hand-group--right">
          <circle cx="0" cy="0" r={HAND_R} fill={EYE} opacity="0.85" />
        </g>
      </g>
    </g>
  );
}

function SingNotes({ on }) {
  return (
    <g className={`pet__sing-notes${on ? ' pet__sing-notes--on' : ''}`}>
      {SING_NOTES.map((note, i) => (
        <text
          key={i}
          x={28 + i * 18}
          y={28}
          fill={EYE}
          fontSize="7"
          style={{
            transformBox: 'fill-box',
            transformOrigin: 'center',
            animationDelay: `${i * -0.34}s`
          }}
        >
          {note}
        </text>
      ))}
    </g>
  );
}

export default function PetFace({ playing = false, levelRef, awake = false, listening = false, pan = 0, dim = false }) {
  const [mood, setMood] = useState('default');
  const [pianoOn, setPianoOn] = useState(false);
  const [singOn, setSingOn] = useState(false);
  const [swayOn, setSwayOn] = useState(false);
  const [blinking, setBlinking] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [isNear, setIsNear] = useState(false);
  const [override, setOverride] = useState(false);

  const jamming = playing !== override;

  const petRef = useRef(null);
  const faceRef = useRef(null);
  const leftEyeRef = useRef(null);
  const rightEyeRef = useRef(null);
  const leftShapeRef = useRef(null);
  const rightShapeRef = useRef(null);
  const pointer = useRef({ x: -9999, y: -9999 });
  const near = useRef(false);
  const moodRef = useRef(mood);
  const listeningRef = useRef(listening);
  const panRef = useRef(pan);
  const pressedRef = useRef(pressed);
  const jammingRef = useRef(jamming);
  const lastMood = useRef('');

  moodRef.current = mood;
  listeningRef.current = listening;
  panRef.current = Math.min(1, Math.max(-1, Number(pan) || 0));
  pressedRef.current = pressed;
  jammingRef.current = jamming;

  const pick = () => {
    const choices = MOODS.filter(item => item !== lastMood.current);
    const next = choices[Math.floor(Math.random() * choices.length)];
    lastMood.current = next;
    return next;
  };

  useEffect(() => {
    if (!jamming) {
      setPianoOn(false);
      setSingOn(false);
      setSwayOn(false);
      setMood(near.current ? pick() : 'default');
      return;
    }
    return createPerformance({ piano: setPianoOn, sing: setSingOn, sway: setSwayOn });
  }, [jamming]);

  useEffect(() => {
    const onMove = event => {
      pointer.current.x = event.clientX;
      pointer.current.y = event.clientY;
    };
    window.addEventListener('pointermove', onMove);
    let frame = 0;
    let lx = 0;
    let ly = 0;
    let rx = 0;
    let ry = 0;
    const tick = now => {
      const box = petRef.current?.getBoundingClientRect();
      if (box) {
        const px = pointer.current.x;
        const py = pointer.current.y;
        const nearNow =
          Math.hypot(px - (box.left + box.width / 2), py - (box.top + box.height / 2)) < box.width * 0.8;
        if (nearNow !== near.current) {
          near.current = nearNow;
          setIsNear(nearNow);
          if (!jammingRef.current) setMood(nearNow ? pick() : 'default');
        }

        const eyeY = box.top + box.height * 0.4;
        const normX = Math.max(120, window.innerWidth * 0.42);
        const normY = Math.max(100, window.innerHeight * 0.42);
        let tLx;
        let tLy;
        let tRx;
        let tRy;
        if (listeningRef.current) {
          const p = panRef.current;
          const drift = Math.sin(now * 0.00068) * 0.07;
          tLx = p * 0.85 + drift;
          tRx = p * 0.85 + drift;
          tLy = -0.2;
          tRy = -0.16;
        } else if (nearNow) {
          tLx = clamp((px - (box.left + box.width / 3)) / normX, -1, 1);
          tRx = clamp((px - (box.left + (box.width * 2) / 3)) / normX, -1, 1);
          tLy = clamp((py - eyeY) / normY, -1, 1);
          tRy = tLy;
          if (!jammingRef.current && moodRef.current === 'shy') {
            tLx = tLx * 0.3 + 0.5;
            tRx = tRx * 0.3 + 0.5;
            tLy = 0.75;
            tRy = 0.75;
          }
        } else {
          const wave = now * 0.00042;
          tLx = Math.sin(wave) * 0.8 + Math.sin(now * 0.0011) * 0.15;
          tRx = Math.sin(wave + 0.25) * 0.8 + Math.sin(now * 0.0011 + 0.4) * 0.15;
          tLy = Math.sin(now * 0.00029) * 0.35;
          tRy = Math.sin(now * 0.00029 + 0.3) * 0.35;
        }
        lx += (tLx - lx) * 0.12;
        ly += (tLy - ly) * 0.12;
        rx += (tRx - rx) * 0.12;
        ry += (tRy - ry) * 0.12;

        const spread = pressedRef.current ? 5 : 0;
        const tilt = pressedRef.current ? 10 : 0;
        const gaze = (lx + rx) / 2;
        const heightLeft = 1 + 0.2 * Math.max(0, -gaze);
        const heightRight = 1 + 0.2 * Math.max(0, gaze);

        if (leftEyeRef.current) {
          leftEyeRef.current.style.transform = `translate(${lx * 13 - spread}px, ${ly * 10}px)`;
        }
        if (rightEyeRef.current) {
          rightEyeRef.current.style.transform = `translate(${rx * 13 + spread}px, ${ry * 10}px)`;
        }
        if (leftShapeRef.current) {
          leftShapeRef.current.style.transform = `rotate(${-tilt}deg) scale(1, ${heightLeft})`;
        }
        if (rightShapeRef.current) {
          rightShapeRef.current.style.transform = `rotate(${tilt}deg) scale(1, ${heightRight})`;
        }
        if (faceRef.current) {
          const bounce = jammingRef.current ? Math.sin(now * 0.0026) * 1.5 : 0;
          const tiltFace = listeningRef.current ? panRef.current * 4.5 : 0;
          faceRef.current.style.transform = `rotate(${tiltFace}deg) translate(${gaze * 4}px, ${((ly + ry) / 2) * 3 + bounce}px)`;
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setBlinking(true);
        timer = window.setTimeout(() => {
          setBlinking(false);
          schedule();
        }, 200);
      }, 3400 + Math.random() * 4600);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  const baseMood = !jamming
    ? mood
    : singOn ? 'sing'
    : pianoOn ? 'music'
    : swayOn ? 'happy'
    : mood;
  const displayMood = listening ? 'listen' : awake ? 'star' : baseMood;
  const blinkOn =
    blinking && !['love', 'squint', 'happy', 'wink', 'music', 'sing', 'listen'].includes(displayMood);
  const glowColor = listening
    ? '#9fd8ff'
    : awake
    ? '#b39dff'
    : displayMood === 'love' ? PINK : displayMood === 'sing' ? '#ffc0dc' : '#ffffff';
  const pianoClass = jamming && pianoOn && !singOn ? ' pet--act-piano' : '';
  const singClass = jamming && singOn ? ' pet--act-sing' : '';
  const swayClass = jamming && swayOn ? ' pet--swaying' : '';
  const actClass = pianoClass + singClass + swayClass;

  return (
    <div
      ref={petRef}
      className={`pet${pressed ? ' pet--pressed' : ''}${isNear ? ' pet--near' : ''}${blinkOn ? ' pet--blink' : ''}${awake ? ' pet--awake' : ''}${listening ? ' pet--listening' : ''}${actClass}${dim ? ' pet--dim' : ''}`}
      onPointerDown={() => {
        setPressed(true);
        if (!jamming) setMood('surprise');
      }}
      onPointerUp={() => {
        setPressed(false);
        if (!jamming) setMood(pick());
      }}
      onPointerLeave={() => setPressed(false)}
      onDoubleClick={() => setOverride(value => !value)}
    >
      <div className="pet__sway">
        <svg viewBox="0 0 120 100" aria-hidden="true">
          <defs>
            <linearGradient id="petEyeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="65%" stopColor="#f4f4fc" />
              <stop offset="100%" stopColor="#cdcfe6" />
            </linearGradient>
            <radialGradient id="petGlow">
              <stop offset="0%" stopColor={glowColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="petGlowCore">
              <stop offset="0%" stopColor={glowColor} stopOpacity="0.42" />
              <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
            </radialGradient>
          </defs>

          <g ref={faceRef}>
            <g opacity={BLUSH[displayMood] ?? 0.16}>
              <ellipse cx="20" cy="57" rx="7" ry="3.6" fill={PINK} />
              <ellipse cx="100" cy="57" rx="7" ry="3.6" fill={PINK} />
              <ellipse cx="17" cy="54" rx="1.8" ry="1.1" fill="#ffffff" opacity="0.55" />
              <ellipse cx="103" cy="54" rx="1.8" ry="1.1" fill="#ffffff" opacity="0.55" />
            </g>
            <Mouth mood={displayMood} />
          </g>

          <g ref={leftEyeRef}>
            <g className="pet__halo">
              <ellipse cx="40" cy="40" rx="27" ry="25" fill="url(#petGlow)" />
              <ellipse cx="40" cy="40" rx="15" ry="16" fill="url(#petGlowCore)" />
            </g>
            <g transform="translate(40 40)">
              <g ref={leftShapeRef}>
                <g className="pet__eye">
                  <Eye mood={displayMood} side="left" />
                </g>
              </g>
            </g>
          </g>

          <g ref={rightEyeRef}>
            <g className="pet__halo">
              <ellipse cx="80" cy="40" rx="27" ry="25" fill="url(#petGlow)" />
              <ellipse cx="80" cy="40" rx="15" ry="16" fill="url(#petGlowCore)" />
            </g>
            <g transform="translate(80 40)">
              <g ref={rightShapeRef}>
                <g className="pet__eye">
                  <Eye mood={displayMood} side="right" />
                </g>
              </g>
            </g>
          </g>

          <Instrument on={jamming && pianoOn} levelRef={levelRef} />
          <SingNotes on={jamming && singOn} />
        </svg>
      </div>
    </div>
  );
}
