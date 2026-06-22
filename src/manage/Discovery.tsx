// Discovery — third tab: a feed of LIVE bots built on the platform (everyone's,
// including the viewer's). Tapping a row opens the live bot in Telegram. The
// listing is server-side (GET /builder/projects/discover); until that endpoint
// ships the feed is empty. There is no client-side fallback — other users' bots
// can't be enumerated locally.
import { useMemo, useState } from 'react';
import { Theme, btnReset, hexA, toneFor } from '../theme';
import { Project } from '../api/client';
import { openTgLink } from '../telegram';
import { TGIcon, BotTile, Spinner } from '../ui';

export interface DiscoverBot {
  id: string;
  name: string;
  username: string; // real managed-bot @username — drives the t.me link
  tone: string;
  preview: string;
  activeAgents?: number;
  merged7d?: number;
  openTasks?: number;
  buildMode?: string;
  publishedAt?: string;
  createdAt?: string;
}

// A bot with no username can't be opened — omit it from the feed.
export function discoverBotFromProject(p: Project): DiscoverBot | null {
  if (!p.bot_username) return null;
  return {
    id: p.id,
    name: p.name,
    username: p.bot_username,
    tone: toneFor(p.slug),
    preview: p.short_description || p.goal_of_project || 'A bot built on AgentBot.',
    activeAgents: p.active_agents,
    merged7d: p.prs_merged_7d,
    openTasks: p.open_tasks,
    buildMode: p.build_mode,
    publishedAt: p.published_at || p.bot_go_live_at,
    createdAt: p.created_at,
  };
}

type Filter = 'all' | 'new' | 'active' | 'needs-work';

export function DiscoveryPage({ T, bots, loading }: {
  T: Theme; bots: DiscoverBot[]; loading: boolean;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const filteredBots = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bots.filter(bot => {
      if (q && !(bot.name + ' ' + bot.username + ' ' + bot.preview).toLowerCase().includes(q)) return false;
      if (filter === 'new') return isNew(bot);
      if (filter === 'active') return (bot.merged7d ?? 0) > 0 || (bot.activeAgents ?? 0) > 0;
      if (filter === 'needs-work') return (bot.openTasks ?? 0) > 0;
      return true;
    });
  }, [bots, filter, query]);

  const metrics = useMemo(() => ({
    live: bots.length,
    maintained: bots.filter(bot => (bot.merged7d ?? 0) > 0 || (bot.activeAgents ?? 0) > 0).length,
    clean: bots.filter(bot => typeof bot.openTasks === 'number' && bot.openTasks === 0).length,
  }), [bots]);

  return (
    <div style={{ padding: '14px 14px 24px', display: 'flex', flexDirection: 'column', minHeight: '100%', gap: 12 }}>
      <section style={{
        borderRadius: 18, overflow: 'hidden', border: `0.5px solid ${T.sep}`,
        background: T.dark
          ? `linear-gradient(145deg, ${T.cardBg} 0%, ${hexA(T.accent, 0.1)} 100%)`
          : `linear-gradient(145deg, #fff 0%, ${hexA(T.accent, 0.08)} 100%)`,
        boxShadow: T.shadow,
      }}>
        <div style={{ padding: '14px 14px 13px', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.font, fontSize: 12, fontWeight: 700, color: T.accent, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              Bot directory
            </div>
            <div style={{ fontFamily: T.font, fontSize: 21, lineHeight: '25px', fontWeight: 750, color: T.text, letterSpacing: -0.35, marginTop: 4 }}>
              Production bots with real Telegram handles
            </div>
          </div>
          <div style={{
            width: 44, height: 44, borderRadius: 14, background: T.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            boxShadow: `0 8px 22px ${hexA(T.accent, 0.28)}`,
          }}>
            <TGIcon name="compass" size={22} color={T.accentText} stroke={2.1} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', borderTop: `0.5px solid ${T.sep}` }}>
          <MetricCell T={T} label="Live" value={loading ? '...' : String(metrics.live)} />
          <MetricCell T={T} label="Maintained" value={loading ? '...' : String(metrics.maintained)} />
          <MetricCell T={T} label="Clean" value={loading ? '...' : String(metrics.clean)} last />
        </div>
      </section>

      <div style={{
        minHeight: 42, borderRadius: 13, background: T.inputBg, border: `0.5px solid ${T.sep}`,
        display: 'flex', alignItems: 'center', gap: 9, padding: '0 12px',
      }}>
        <TGIcon name="search" size={18} color={T.hint} stroke={2} />
        <input
          value={query}
          onChange={e => setQuery(e.currentTarget.value)}
          placeholder="Search bots"
          style={{
            flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
            color: T.text, fontFamily: T.font, fontSize: 15,
          }}
        />
        {query && (
          <button onClick={() => setQuery('')} style={{ ...btnReset, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TGIcon name="close" size={17} color={T.hint} stroke={2.2} />
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 7 }}>
        <FilterButton T={T} active={filter === 'all'} label="All" onClick={() => setFilter('all')} />
        <FilterButton T={T} active={filter === 'new'} label="New" onClick={() => setFilter('new')} />
        <FilterButton T={T} active={filter === 'active'} label="Active" onClick={() => setFilter('active')} />
        <FilterButton T={T} active={filter === 'needs-work'} label="Queue" onClick={() => setFilter('needs-work')} />
      </div>

      {!loading && bots.length === 0 && (
        <EmptyDiscovery T={T} />
      )}

      {!loading && bots.length > 0 && filteredBots.length === 0 && (
        <div style={{
          padding: 18, borderRadius: 16, background: T.cardBg, border: `0.5px solid ${T.sep}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ width: 38, height: 38, borderRadius: 13, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TGIcon name="search" size={19} color={T.accent} stroke={2} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 700, color: T.text }}>No matching bots</div>
            <div style={{ fontFamily: T.font, fontSize: 13, color: T.hint, marginTop: 2 }}>Try another query or filter.</div>
          </div>
        </div>
      )}

      {loading && <LoadingRows T={T} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {!loading && filteredBots.map(bot => <DiscoveryRow key={bot.id} T={T} bot={bot} />)}
      </div>
    </div>
  );
}

function DiscoveryRow({ T, bot }: { T: Theme; bot: DiscoverBot }) {
  const signals = qualitySignals(bot);
  const age = timeAgo(bot.publishedAt || bot.createdAt);
  const buildMode = modeLabel(bot.buildMode);

  return (
    <button
      key={bot.id}
      onClick={() => openTgLink(`https://t.me/${bot.username}`)}
      style={{
        ...btnReset,
        textAlign: 'left',
        width: '100%',
        display: 'grid',
        gridTemplateColumns: '4px 50px minmax(0, 1fr) 32px',
        alignItems: 'stretch',
        gap: 11,
        padding: 0,
        borderRadius: 16,
        background: T.cardBg,
        border: `0.5px solid ${T.sep}`,
        boxShadow: T.shadow,
        overflow: 'hidden',
      }}
    >
      <div style={{ background: signalColor(T, signals), opacity: 0.95 }} />
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0' }}>
        <BotTile T={T} name={bot.name} tone={bot.tone} size={50} radius={15} />
      </div>
      <div style={{ minWidth: 0, padding: '12px 0 11px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <div style={{
            fontFamily: T.font, fontSize: 16, fontWeight: 750, color: T.text, letterSpacing: -0.25,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{bot.name}</div>
          {isNew(bot) && <span style={{ flexShrink: 0, width: 7, height: 7, borderRadius: 999, background: T.green }} />}
        </div>
        <div style={{
          fontFamily: T.mono, fontSize: 12.5, color: T.accent, marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>@{bot.username}</div>
        <div style={{
          fontFamily: T.font, fontSize: 13.2, color: T.sub, lineHeight: '18px', marginTop: 8,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>{bot.preview}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          <Signal T={T} icon="check" label="Live" tone="green" />
          {age && <Signal T={T} icon="clock" label={age} />}
          {buildMode && <Signal T={T} icon={buildMode.icon} label={buildMode.label} />}
          {typeof bot.activeAgents === 'number' && bot.activeAgents > 0 && <Signal T={T} icon="cloud" label={`${bot.activeAgents} agent${bot.activeAgents === 1 ? '' : 's'}`} tone="accent" />}
          {typeof bot.merged7d === 'number' && bot.merged7d > 0 && <Signal T={T} icon="code" label={`${bot.merged7d} merged`} tone="accent" />}
          {typeof bot.openTasks === 'number' && bot.openTasks > 0 && <Signal T={T} icon="clock" label={`${bot.openTasks} queued`} tone="amber" />}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingRight: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 11, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TGIcon name="open" size={16} color={T.accent} stroke={2.1} />
        </div>
      </div>
    </button>
  );
}

function MetricCell({ T, label, value, last }: { T: Theme; label: string; value: string; last?: boolean }) {
  return (
    <div style={{ padding: '11px 12px 12px', borderRight: last ? 'none' : `0.5px solid ${T.sep}` }}>
      <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 750, color: T.text, lineHeight: '23px', letterSpacing: -0.25 }}>{value}</div>
      <div style={{ fontFamily: T.font, fontSize: 11.5, color: T.hint, marginTop: 1 }}>{label}</div>
    </div>
  );
}

function FilterButton({ T, active, label, onClick }: { T: Theme; active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      ...btnReset,
      height: 34,
      borderRadius: 11,
      background: active ? T.accent : T.cardBg,
      color: active ? T.accentText : T.sub,
      border: `0.5px solid ${active ? T.accent : T.sep}`,
      fontFamily: T.font,
      fontSize: 13,
      fontWeight: 700,
      boxShadow: active ? `0 8px 18px ${hexA(T.accent, 0.18)}` : 'none',
    }}>{label}</button>
  );
}

function Signal({ T, icon, label, tone = 'neutral' }: {
  T: Theme; icon: string; label: string; tone?: 'neutral' | 'green' | 'accent' | 'amber';
}) {
  const palette = tone === 'green'
    ? { bg: T.greenSoft, fg: T.green }
    : tone === 'accent'
      ? { bg: T.accentSoft, fg: T.accent }
      : tone === 'amber'
        ? { bg: T.dark ? 'rgba(233,177,92,0.16)' : 'rgba(201,138,30,0.1)', fg: T.amber }
        : { bg: T.dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,22,32,0.045)', fg: T.hint };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 23, padding: '0 8px',
      borderRadius: 9, background: palette.bg, color: palette.fg,
      fontFamily: T.font, fontSize: 11.5, fontWeight: 700,
    }}>
      <TGIcon name={icon} size={13} color={palette.fg} stroke={2.1} />
      {label}
    </span>
  );
}

function EmptyDiscovery({ T }: { T: Theme }) {
  const rows = [
    ['Live bot', 'Deployed and reachable'],
    ['Telegram handle', 'Real @username attached'],
    ['Visible', 'Owner leaves Discovery on'],
  ];
  return (
    <div style={{
      marginTop: 2, padding: 16, borderRadius: 16, background: T.cardBg,
      border: `0.5px solid ${T.sep}`, boxShadow: T.shadow,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 14, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TGIcon name="compass" size={21} color={T.accent} stroke={2} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 750, color: T.text, letterSpacing: -0.2 }}>No discoverable bots yet</div>
          <div style={{ fontFamily: T.font, fontSize: 13, color: T.hint, marginTop: 2 }}>The feed opens when live bots have public handles.</div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 15 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 8, borderTop: `0.5px solid ${T.sep}` }}>
            <div style={{ fontFamily: T.font, fontSize: 13.5, fontWeight: 650, color: T.text }}>{label}</div>
            <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, textAlign: 'right' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingRows({ T }: { T: Theme }) {
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          height: 104, borderRadius: 16, background: T.cardBg, border: `0.5px solid ${T.sep}`,
          boxShadow: T.shadow, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {i === 1 ? <Spinner color={T.accent} size={20} /> : <div style={{ width: '82%', height: 42, borderRadius: 12, background: T.dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,22,32,0.045)' }} />}
        </div>
      ))}
    </div>
  );
}

function qualitySignals(bot: DiscoverBot): number {
  let score = 1; // live with a real handle
  if (typeof bot.openTasks === 'number' && bot.openTasks === 0) score++;
  if ((bot.activeAgents ?? 0) > 0 || (bot.merged7d ?? 0) > 0) score++;
  if (isNew(bot)) score++;
  return Math.min(score, 4);
}

function signalColor(T: Theme, score: number): string {
  if (score >= 3) return T.green;
  if (score === 2) return T.accent;
  return T.amber;
}

function modeLabel(mode?: string): { label: string; icon: string } | null {
  if (!mode) return null;
  if (mode === 'platform_agent') return { label: 'Platform', icon: 'cloud' };
  if (mode === 'local_agent') return { label: 'Local', icon: 'server' };
  return { label: mode.replace(/_/g, ' '), icon: 'code' };
}

function isNew(bot: DiscoverBot): boolean {
  const age = daysSince(bot.publishedAt || bot.createdAt);
  return age !== null && age <= 14;
}

function timeAgo(date?: string): string | null {
  const days = daysSince(date);
  if (days === null) return null;
  if (days <= 0) return 'today';
  if (days === 1) return '1d live';
  if (days < 30) return `${days}d live`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1mo live' : `${months}mo live`;
}

function daysSince(date?: string): number | null {
  if (!date) return null;
  const time = Date.parse(date);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86400000));
}
