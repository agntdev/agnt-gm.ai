// ui.tsx — shared Telegram Mini-App primitives, ported 1:1 from the design's
// theme.jsx / discover.jsx. Visuals must match the prototype.
import React from 'react';
import { Theme, hexA, tile, btnReset, EVENT_PALETTES, EventPalette } from './theme';
import { useT } from './i18n';

// ── Icons (simple geometric strokes only) ─────────────────────
export function TGIcon({ name, size = 22, color = 'currentColor', stroke = 2 }: {
  name: string; size?: number; color?: string; stroke?: number;
}) {
  const p = { fill: 'none', stroke: color, strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<string, React.ReactNode> = {
    back: <path d="M14 5l-7 7 7 7" {...p} />,
    close: <path d="M6 6l12 12M18 6L6 18" {...p} />,
    dots: <g fill={color} stroke="none"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></g>,
    chevDown: <path d="M6 9l6 6 6-6" {...p} />,
    chevRight: <path d="M9 6l6 6-6 6" {...p} />,
    check: <path d="M5 12.5l4.5 4.5L19 6.5" {...p} />,
    plus: <path d="M12 5v14M5 12h14" {...p} />,
    copy: <g {...p}><rect x="8" y="8" width="11" height="11" rx="2.5" /><path d="M5 15.5V6a2 2 0 012-2h8.5" /></g>,
    arrowUp: <path d="M12 19V6M6 11l6-6 6 6" {...p} />,
    arrowRight: <path d="M5 12h14M13 6l6 6-6 6" {...p} />,
    code: <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" {...p} />,
    server: <g {...p}><rect x="4" y="4" width="16" height="6.5" rx="2" /><rect x="4" y="13.5" width="16" height="6.5" rx="2" /><path d="M8 7.25h0M8 16.75h0" /></g>,
    beaker: <path d="M9 3h6M10 3v6l-4.5 8.5A2 2 0 007.3 21h9.4a2 2 0 001.8-3L14 9V3" {...p} />,
    spark: <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17l-1.9-5.1L4.5 10l5.6-1.4L12 3z" fill={color} stroke="none" />,
    bolt: <path d="M13 3L5 13h6l-1 8 8-10h-6l1-8z" fill={color} stroke="none" />,
    link: <g {...p}><path d="M9.5 14.5l5-5" /><path d="M8 12l-2 2a3 3 0 104 4l2-2" /><path d="M16 12l2-2a3 3 0 10-4-4l-2 2" /></g>,
    refresh: <path d="M4 11a8 8 0 0114-5l2 2M20 13a8 8 0 01-14 5l-2-2M18 4v4h-4M6 20v-4h4" {...p} />,
    sun: <g {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></g>,
    moon: <path d="M20 14.5A8 8 0 019.5 4a7 7 0 100 16 8 8 0 0010.5-5.5z" {...p} />,
    user: <g {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0113 0" /></g>,
    shield: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" {...p} />,
    clock: <g {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></g>,
    compass: <g {...p}><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2z" /></g>,
    search: <g {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></g>,
    open: <g {...p}><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 13.5V18a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h4.5" /></g>,
    star: <path d="M12 3.5l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 17l-5.3 2.9 1.2-6L3.4 9.8l6-.7L12 3.5z" fill={color} stroke="none" />,
    chat: <path d="M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1h-8.5L6 19.5V16H5a1 1 0 01-1-1V6a1 1 0 011-1z" {...p} />,
    send: <path d="M5 12l15-7-7 15-2.5-5.5L5 12z" {...p} />,
    wallet: <g {...p}><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M16 12.5h2M3 9.5h18" /></g>,
    pause: <g fill={color} stroke="none"><rect x="7" y="5" width="3.4" height="14" rx="1.2" /><rect x="13.6" y="5" width="3.4" height="14" rx="1.2" /></g>,
    play: <path d="M8 5.5v13l11-6.5-11-6.5z" fill={color} stroke="none" />,
    cloud: <path d="M7.5 18.5a4 4 0 01-.4-7.98 5.2 5.2 0 0110.06-1.3A3.75 3.75 0 0117 18.5H7.5z" {...p} />,
    folder: <path d="M4 7a2 2 0 012-2h3.2a2 2 0 011.5.7l1 1.3H18a2 2 0 012 2v7a2 2 0 01-2 2H6a2 2 0 01-2-2V7z" {...p} />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0 }}>
      {paths[name]}
    </svg>
  );
}

// ── Brand mark — green rounded-square with a terracotta hollow square ──
// AGNTDEV lockup (Bold 1c): a green tile with an inset hollow terracotta
// square glyph. Pair with the "AGNTDEV" wordmark (Onest 800) at call sites.
export function Mark({ T, size = 30, radius = 9 }: { T: Theme; size?: number; radius?: number }) {
  const inner = Math.round(size * 0.46);
  const bw = Math.max(2, Math.round(size * 0.09));
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 3px 10px ${hexA(T.text, 0.35)}`,
    }}>
      <div style={{
        width: inner, height: inner, borderRadius: Math.round(inner * 0.28),
        border: `${bw}px solid ${T.accent}`, background: 'transparent',
      }} />
    </div>
  );
}

// ── Header (Telegram mini-app top bar) ────────────────────────
export function TGHeader({ T, title, subtitle, onBack }: {
  T: Theme; title: string; subtitle?: string; onBack?: (() => void) | null;
}) {
  const t = useT();
  return (
    <div style={{
      paddingTop: 'env(safe-area-inset-top, 0px)', background: T.headerBg, position: 'relative', zIndex: 5,
      borderBottom: `1px solid ${T.sep}`,
    }}>
      <div style={{
        height: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 8px',
      }}>
        <button onClick={onBack || undefined} style={{
          ...btnReset, height: 38, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 1,
          color: T.accent, fontFamily: T.font, fontSize: 17, fontWeight: 400, minWidth: 64,
        }}>
          {onBack ? <TGIcon name="back" size={24} color={T.accent} stroke={2.1} /> : null}
          <span>{onBack ? t('Back', 'Назад') : ''}</span>
        </button>
        <div style={{ textAlign: 'center', overflow: 'hidden' }}>
          <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text, lineHeight: '18px', letterSpacing: -0.3 }}>{title}</div>
          {subtitle && <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, lineHeight: '15px', marginTop: 1 }}>{subtitle}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 64, justifyContent: 'flex-end' }}>
          <button style={{ ...btnReset, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.hint }}>
            <TGIcon name="dots" size={22} color={T.hint} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Telegram MainButton (pinned bottom) ───────────────────────
export function MainButton({ T, label, onClick, disabled, busy, icon }: {
  T: Theme; label: string; onClick?: () => void; disabled?: boolean; busy?: boolean; icon?: string;
}) {
  const bg = disabled ? T.nestedBg : T.accent;
  const fg = disabled ? T.hint : T.accentText;
  return (
    <div style={{ padding: '10px 16px 14px', background: T.headerBg, borderTop: `1px solid ${T.sep}`, position: 'relative', zIndex: 5 }}>
      <button onClick={disabled || busy ? undefined : onClick} style={{
        ...btnReset, width: '100%', height: 50, borderRadius: 15,
        backgroundColor: bg, color: fg, fontFamily: T.font, fontSize: 16, fontWeight: 700,
        letterSpacing: -0.2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
        cursor: disabled ? 'default' : 'pointer',
        boxShadow: disabled ? 'none' : T.ctaShadow,
        transition: 'transform .12s ease',
      }}>
        {busy && <Spinner color={fg} />}
        {icon && !busy && <TGIcon name={icon} size={18} color={fg} stroke={2} />}
        {label}
      </button>
    </div>
  );
}

export function Spinner({ color = '#fff', size = 17 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'tgspin 0.8s linear infinite' }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeOpacity="0.3" strokeWidth="3" />
      <path d="M12 3a9 9 0 019 9" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ── Stage stepper (slim, top of content) ──────────────────────
export function Stepper({ T, steps, current }: { T: Theme; steps: number[]; current: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '12px 16px 4px' }}>
      {steps.map((_, i) => {
        const done = i < current, active = i === current;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              height: 3, borderRadius: 2,
              background: done || active ? T.accent : T.sepStrong,
              opacity: active ? 1 : (done ? 0.55 : 1), transition: 'background .3s',
            }} />
          </div>
        );
      })}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────
export function Card({ T, children, style = {}, pad = 16 }: {
  T: Theme; children: React.ReactNode; style?: React.CSSProperties; pad?: number;
}) {
  return (
    <div style={{
      background: T.cardBg, borderRadius: T.cardRadius, padding: pad, boxShadow: T.shadow,
      border: `1px solid ${T.sep}`, ...style,
    }}>{children}</div>
  );
}

// ── Pill (status chip) ────────────────────────────────────────
export function Pill({ T, children, tone = 'neutral', style = {} }: {
  T: Theme; children: React.ReactNode; tone?: 'neutral' | 'accent' | 'green' | 'gold'; style?: React.CSSProperties;
}) {
  const map = {
    neutral: { bg: T.nestedBg, fg: T.sub },
    accent: { bg: T.accentSoft, fg: T.accent },
    green: { bg: T.sage, fg: '#2f8f6f' },  // Live
    gold: { bg: T.goldSoft, fg: T.gold },  // Building / Ready
  };
  const c = map[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px',
      borderRadius: 999, background: c.bg, color: c.fg,
      fontFamily: T.font, fontSize: 12.5, fontWeight: 600, letterSpacing: 0.1, ...style,
    }}>{children}</span>
  );
}

export function Dot({ color, size = 7, pulse }: { color: string; size?: number; pulse?: boolean }) {
  return <span style={{
    width: size, height: size, borderRadius: 999, background: color, display: 'inline-block', flexShrink: 0,
    animation: pulse ? 'tgpulse 1.6s ease-in-out infinite' : 'none',
  }} />;
}

// ── Selectable chip ───────────────────────────────────────────
export function Chip({ T, children, selected, onClick, icon }: {
  T: Theme; children: React.ReactNode; selected?: boolean; onClick?: () => void; icon?: React.ReactNode;
}) {
  return (
    <button onClick={onClick} style={{
      ...btnReset, display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px',
      borderRadius: 11, fontFamily: T.font, fontSize: 14.5, fontWeight: 600,
      background: selected ? T.accentSoft : T.nestedBg,
      color: selected ? T.accent : T.text,
      border: `1.5px solid ${selected ? T.accentBorder : T.sep}`,
      cursor: 'pointer', transition: 'all .15s',
    }}>{icon}{children}</button>
  );
}

// ── Chat bubble ───────────────────────────────────────────────
export function Bubble({ T, from = 'bot', children, animateIn }: {
  T: Theme; from?: 'bot' | 'user'; children: React.ReactNode; animateIn?: boolean;
}) {
  const isBot = from === 'bot';
  return (
    <div style={{
      display: 'flex', justifyContent: isBot ? 'flex-start' : 'flex-end',
      animation: animateIn ? 'tgbubble .32s cubic-bezier(.2,.8,.2,1)' : 'none',
    }}>
      <div style={{
        maxWidth: isBot ? '84%' : '82%', padding: '11px 15px', borderRadius: 20,
        borderBottomLeftRadius: isBot ? 6 : 20, borderBottomRightRadius: isBot ? 20 : 6,
        background: isBot ? T.botBubble : T.userBubble,
        color: isBot ? T.text : T.userBubbleText,
        border: isBot ? `1px solid ${T.sep}` : 'none',
        boxShadow: isBot ? T.shadow : `0 8px 18px -10px ${hexA(T.text, 0.5)}`,
        fontFamily: T.font, fontSize: 15, lineHeight: '20px',
      }}>{children}</div>
    </div>
  );
}

// typing indicator (three dots)
export function TypingBubble({ T }: { T: Theme }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div style={{
        padding: '13px 16px', borderRadius: 18, borderBottomLeftRadius: 5,
        background: T.botBubble, border: `0.5px solid ${T.sep}`, boxShadow: T.shadow,
        display: 'flex', gap: 5, alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 7, height: 7, borderRadius: 999, background: T.hint,
            animation: `tgtype 1.2s ease-in-out ${i * 0.16}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────
export function ProgressBar({ T, value, color }: { T: Theme; value: number; color?: string }) {
  return (
    <div style={{ height: 6, borderRadius: 4, background: hexA(T.text, 0.1), overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${value}%`, borderRadius: 4, background: color || T.accent, transition: 'width .4s cubic-bezier(.3,.8,.3,1)' }} />
    </div>
  );
}

// ── Sparkline — tiny 7-day trend (area + line + last-point dot) ─
export function Sparkline({ values, color, width = 92, height = 34 }: {
  values: number[]; color: string; width?: number; height?: number;
}) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const pad = 3;
  const pts = values.map((v, i) => [i * stepX, height - pad - ((v - min) / range) * (height - pad * 2)] as const);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', flexShrink: 0 }}>
      <path d={area} fill={color} fillOpacity={0.13} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.6} fill={color} />
    </svg>
  );
}

// ── bottom tab bar ────────────────────────────────────────────
export type Tab = 'build' | 'discover' | 'manage';

export function TabBar({ T, tab, onTab }: { T: Theme; tab: Tab; onTab: (t: Tab) => void }) {
  const t = useT();
  const side = (id: Tab, icon: string, label: string) => {
    const on = tab === id;
    return (
      <button onClick={() => onTab(id)} style={{
        ...btnReset, flex: 1, height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 3,
      }}>
        <TGIcon name={icon} size={22} color={on ? T.accent : T.hint} stroke={on ? 2.2 : 2} />
        <span style={{
          fontFamily: T.font, fontSize: 10.5, fontWeight: on ? 700 : 500,
          letterSpacing: 0.1, color: on ? T.accent : T.hint,
        }}>{label}</span>
      </button>
    );
  };
  return (
    // Wrapper stays in-flow (reserves height) with transparent surround;
    // the inner pill reads as a floating translucent bar.
    <div style={{
      background: 'transparent', padding: '6px 14px',
      paddingBottom: 'max(14px, env(safe-area-inset-bottom, 8px))',
      position: 'relative', zIndex: 20,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', height: 66,
        background: hexA('#FBF8EF', 0.92), backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${T.sep}`, borderRadius: 22, boxShadow: T.tabShadow,
        padding: '0 8px', position: 'relative',
      }}>
        {side('manage', 'folder', t('Bots', 'Боты'))}
        {/* center — terracotta ＋ (new bot / onboarding), centered in the bar */}
        <button onClick={() => onTab('build')} style={{
          ...btnReset, width: 52, height: 52, flexShrink: 0,
          borderRadius: 16, background: T.accent, color: T.accentText,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: T.ctaShadow,
        }}>
          <TGIcon name="plus" size={26} color={T.accentText} stroke={2.6} />
        </button>
        {side('discover', 'compass', t('Discover', 'Каталог'))}
      </div>
    </div>
  );
}

// ── monogram avatar tile ──────────────────────────────────────
export function BotTile({ T, name, tone, src, size = 38, radius = 12, fontSize }: {
  T: Theme; name: string; tone: string; src?: string | null; size?: number; radius?: number; fontSize?: number;
}) {
  const c = tile(tone, T.dark);
  // the generated bot avatar (the same image we set on the Telegram bot) when we
  // have one; the name monogram stays rendered underneath as the fallback, so a
  // missing or broken image (onError) reveals it rather than a broken-image icon.
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setFailed(false); }, [src]);
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      width: size, height: size, borderRadius: '50%', flexShrink: 0, background: c.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: T.font, fontSize: fontSize || size * 0.46, fontWeight: 700, color: c.fg,
      letterSpacing: -0.3,
    }}>
      {(name[0] || '?').toUpperCase()}
      {src && !failed && (
        <img src={src} alt="" onError={() => setFailed(true)} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
        }} />
      )}
    </div>
  );
}

// ── bot avatar: AI-generated image, else the monogram tile ────
// Shows the AI-generated avatar (bot_avatar_url) when present, else falls back to
// the BotTile monogram. Also falls back if the image errors (broken/expired URL),
// so the slot always shows something. Same size/shape as BotTile — a drop-in swap.
export function BotAvatar({ T, name, tone, avatarUrl, size = 38, radius = 12, fontSize }: {
  T: Theme; name: string; tone: string; avatarUrl?: string; size?: number; radius?: number; fontSize?: number;
}) {
  const [failed, setFailed] = React.useState(false);
  // reset the error gate when the URL changes (e.g. a regenerate produced a new one)
  React.useEffect(() => { setFailed(false); }, [avatarUrl]);
  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={`${name} avatar`}
        onError={() => setFailed(true)}
        style={{
          width: size, height: size, borderRadius: '50%', flexShrink: 0,
          objectFit: 'cover', display: 'block', background: T.cardBg,
        }}
      />
    );
  }
  return <BotTile T={T} name={name} tone={tone} size={size} radius={radius} fontSize={fontSize} />;
}

// ── shared small blocks used across screens ───────────────────
export function SpecBlock({ T, title, children }: { T: Theme; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 4px 9px' }}>{title}</div>
      <Card T={T} pad={14}>{children}</Card>
    </div>
  );
}

export function MiniStat({ T, icon, label, value }: { T: Theme; icon: string; label: string; value: string }) {
  return (
    <Card T={T} pad={13} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 11 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TGIcon name={icon} size={18} color={T.accent} stroke={1.9} />
      </div>
      <div>
        <div style={{ fontFamily: T.font, fontSize: 12, color: T.hint }}>{label}</div>
        <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text }}>{value}</div>
      </div>
    </Card>
  );
}

export function BigStat({ T, value, label, tone }: { T: Theme; value: string; label: string; tone: 'green' | 'accent' }) {
  const color = tone === 'green' ? T.green : T.accent;
  return (
    <Card T={T} pad={15} style={{ flex: 1 }}>
      <div style={{ fontFamily: T.font, fontSize: 28, fontWeight: 700, color, letterSpacing: -0.5 }}>{value}</div>
      <div style={{ fontFamily: T.font, fontSize: 13, color: T.hint, marginTop: 2 }}>{label}</div>
    </Card>
  );
}

// ── Bold 1c: brand wordmark lockup ────────────────────────────
export function Wordmark({ T, size = 30 }: { T: Theme; size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Mark T={T} size={size} radius={Math.round(size * 0.3)} />
      <span style={{ fontFamily: T.font, fontWeight: 800, fontSize: size * 0.62, letterSpacing: -0.4, color: T.text }}>AGNTDEV</span>
    </div>
  );
}

// ── Bold 1c: circular build-progress ring ─────────────────────
// 172px conic ring on a dark-green disc; large percent numeral.
export function ProgressRing({ T, value, size = 172, label, color }: {
  T: Theme; value: number; size?: number; label?: string; color?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const arc = color || T.accent;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', margin: '0 auto', position: 'relative',
      background: `conic-gradient(${arc} ${pct}%, ${hexA(T.text, 0.12)} 0)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: T.heroShadow,
    }}>
      <div style={{
        position: 'absolute', inset: 13, borderRadius: '50%', background: T.text,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
      }}>
        <span style={{ fontFamily: T.font, fontWeight: 700, fontSize: 32, letterSpacing: -1, color: T.accentText }}>{pct}%</span>
        {label && <span style={{ fontFamily: T.font, fontSize: 12, fontWeight: 500, color: hexA(T.accentText, 0.7) }}>{label}</span>}
      </div>
    </div>
  );
}

// ── Bold 1c: stage-coloured event card (chat feed system message) ──
// Stage-coloured system-event card (the distinctive 1c chat treatment):
// 40px icon tile · title + muted sub stacked · optional right-aligned action.
export function EventCard({ T, palette = 'neutral', icon, title, sub, action, onAction }: {
  T: Theme; palette?: keyof typeof EVENT_PALETTES; icon?: string;
  title: React.ReactNode; sub?: React.ReactNode; action?: string; onAction?: () => void;
}) {
  const p: EventPalette = EVENT_PALETTES[palette];
  return (
    <div style={{
      background: p.bg, border: `1px solid ${p.border}`, borderRadius: 16, padding: '13px 14px',
      display: 'flex', alignItems: 'center', gap: 13,
      animation: 'tgbubble .32s cubic-bezier(.2,.8,.2,1)',
    }}>
      {icon && (
        <div style={{ width: 40, height: 40, borderRadius: 12, background: p.chip, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <TGIcon name={icon} size={20} color={p.accent} stroke={2} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: -0.2, lineHeight: '20px' }}>{title}</div>
        {sub && <div style={{ fontFamily: T.font, fontSize: 13, color: T.sub, lineHeight: '18px', marginTop: 2 }}>{sub}</div>}
      </div>
      {action && (
        <button onClick={onAction} style={{
          ...btnReset, flexShrink: 0, padding: '9px 16px', borderRadius: 12,
          background: p.accent, color: '#FBF8EF', fontFamily: T.font, fontSize: 14, fontWeight: 700,
        }}>{action}</button>
      )}
    </div>
  );
}

// Terracotta bordered quick-reply chips (wrap); tapping sends the label.
export function QuickReplies({ T, options, onPick }: {
  T: Theme; options: string[]; onPick: (label: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {options.map(o => (
        <button key={o} onClick={() => onPick(o)} style={{
          ...btnReset, padding: '11px 18px', borderRadius: 999,
          background: '#FBF3EC', color: T.accentPressed, border: `1.5px solid ${T.accent}`,
          fontFamily: T.font, fontSize: 15, fontWeight: 600, letterSpacing: -0.1,
          transition: 'transform .1s ease',
        }}>{o}</button>
      ))}
    </div>
  );
}

// Dashboard status chip — uppercase label + coloured dot + bold value.
export function StatusChip({ T, label, value, dot }: {
  T: Theme; label: string; value: string; dot?: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: T.cardBg, border: `1px solid ${T.sep}`, borderRadius: 14, padding: '11px 12px' }}>
      <div style={{ fontFamily: T.font, fontSize: 11, fontWeight: 700, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
        {dot && <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, flexShrink: 0 }} />}
        <span style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 700, color: T.text, letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
      </div>
    </div>
  );
}

// ── Bold 1c: toast (bottom, above tab bar) ────────────────────
export function Toast({ T, show, children, bottom = 92 }: {
  T: Theme; show: boolean; children: React.ReactNode; bottom?: number;
}) {
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom, display: 'flex', justifyContent: 'center',
      pointerEvents: 'none', zIndex: 60, padding: '0 20px',
      opacity: show ? 1 : 0, transform: show ? 'translateY(0)' : 'translateY(10px)',
      transition: 'opacity .22s ease, transform .22s ease',
    }}>
      <div style={{
        background: T.text, color: T.accentText, fontFamily: T.font, fontSize: 14, fontWeight: 600,
        padding: '11px 18px', borderRadius: 14, boxShadow: T.heroShadow, maxWidth: '100%',
        display: 'flex', alignItems: 'center', gap: 9, letterSpacing: -0.1,
      }}>{children}</div>
    </div>
  );
}

// ── Bold 1c: toggle switch (48×28) ────────────────────────────
export function Toggle({ T, on, onChange }: { T: Theme; on: boolean; onChange?: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange?.(!on)} style={{
      ...btnReset, width: 48, height: 28, borderRadius: 999, flexShrink: 0,
      background: on ? T.green : T.sepStrong, position: 'relative', transition: 'background .2s ease',
    }}>
      <span style={{
        position: 'absolute', top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: '50%',
        background: '#FBF8EF', boxShadow: '0 1px 3px rgba(34,64,46,0.35)', transition: 'left .2s ease',
      }} />
    </button>
  );
}

// ── Bold 1c: segmented control (active = green fill, cream text) ──
export function Segmented<V extends string>({ T, value, options, onChange }: {
  T: Theme; value: V; options: { id: V; label: string }[]; onChange: (v: V) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, background: T.nestedBg, borderRadius: 13, padding: 4 }}>
      {options.map(o => {
        const on = o.id === value;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            ...btnReset, flex: 1, height: 36, borderRadius: 10, fontFamily: T.font, fontSize: 13.5,
            fontWeight: on ? 700 : 600, color: on ? T.accentText : T.sub,
            background: on ? T.text : 'transparent', transition: 'background .18s ease, color .18s ease',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}
