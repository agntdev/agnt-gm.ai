// theme.ts — Telegram Mini-App design tokens (ported from the design's theme.jsx).

export interface Theme {
  dark: boolean;
  accent: string;
  accentText: string;
  accentSoft: string;
  accentBorder: string;
  pageBg: string;
  cardBg: string;
  headerBg: string;
  inputBg: string;
  text: string;
  hint: string;
  sub: string;
  sep: string;
  sepStrong: string;
  botBubble: string;
  userBubble: string;
  userBubbleText: string;
  green: string;
  greenSoft: string;
  amber: string;
  shadow: string;
  font: string;
  mono: string;
  cardRadius: number;
}

export function hexA(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Telegram-native palette, light + dark, parameterised by accent hue.
export function tgTheme(mode: 'light' | 'dark', accent = '#229ED9'): Theme {
  const dark = mode === 'dark';
  const a = accent;
  return {
    dark,
    accent: a,
    accentText: '#ffffff',
    // accent tint used for soft fills / selected chips
    accentSoft: dark ? hexA(a, 0.18) : hexA(a, 0.1),
    accentBorder: dark ? hexA(a, 0.5) : hexA(a, 0.32),
    pageBg: dark ? '#0e1621' : '#eef1f5',
    cardBg: dark ? '#17212b' : '#ffffff',
    headerBg: dark ? '#17212b' : '#ffffff',
    inputBg: dark ? '#0e1621' : '#f3f5f8',
    text: dark ? '#f5f7fa' : '#0d1620',
    hint: dark ? '#7d8b99' : '#8a929c',
    sub: dark ? '#aab4be' : '#5c6570',
    sep: dark ? 'rgba(255,255,255,0.07)' : 'rgba(15,22,32,0.07)',
    sepStrong: dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,22,32,0.1)',
    botBubble: dark ? '#1c2a37' : '#ffffff',
    userBubble: a,
    userBubbleText: '#ffffff',
    green: dark ? '#5cc98c' : '#21a05a',
    greenSoft: dark ? 'rgba(92,201,140,0.16)' : 'rgba(33,160,90,0.1)',
    amber: dark ? '#e9b15c' : '#c98a1e',
    shadow: dark ? '0 1px 2px rgba(0,0,0,0.4)' : '0 1px 2px rgba(15,22,32,0.05), 0 1px 12px rgba(15,22,32,0.04)',
    font: '-apple-system, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif',
    mono: '"SF Mono", ui-monospace, "JetBrains Mono", Menlo, monospace',
    cardRadius: 16,
  };
}

// ── per-bot tile colours (harmonious, share chroma/lightness) ──
const TILE: Record<string, string> = {
  blue: '#2A8BD9',
  teal: '#129B8B',
  green: '#1FA058',
  amber: '#CC8A1E',
  purple: '#7C5CFC',
  rose: '#E0533D',
  indigo: '#5B6CE0',
  slate: '#6B7585',
};
const TILE_KEYS = Object.keys(TILE);

// nudge a hex lighter for dark mode legibility
function lighten(hex: string): string {
  const h = hex.replace('#', '');
  const r = Math.min(255, Math.round(parseInt(h.slice(0, 2), 16) * 1.25 + 26));
  const g = Math.min(255, Math.round(parseInt(h.slice(2, 4), 16) * 1.25 + 26));
  const b = Math.min(255, Math.round(parseInt(h.slice(4, 6), 16) * 1.25 + 26));
  return `rgb(${r},${g},${b})`;
}

export function tile(key: string, dark: boolean): { fg: string; bg: string } {
  const fg = TILE[key] || TILE.slate;
  return { fg: dark ? lighten(fg) : fg, bg: hexA(fg, dark ? 0.2 : 0.11) };
}

// deterministic tile colour for a real bot (hash of its slug)
export function toneFor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return TILE_KEYS[h % TILE_KEYS.length];
}

export const btnReset: React.CSSProperties = {
  border: 'none', background: 'none', padding: 0, margin: 0, font: 'inherit',
  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
};
