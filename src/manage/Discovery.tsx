// Discovery - a public feed of live production bots built on the platform.
// Tapping a row opens the live bot in Telegram. The list comes from
// GET /builder/projects/discover; other users' bots cannot be enumerated
// client-side, so an empty API response stays empty.
import { useMemo, useState } from 'react';
import { Theme, btnReset, hexA, toneFor } from '../theme';
import { Project } from '../api/client';
import { openTgLink } from '../telegram';
import { TGIcon, BotTile, Spinner } from '../ui';

export interface DiscoverBot {
  id: string;
  name: string;
  username: string; // real managed-bot @username - drives the t.me link
  tone: string;
  preview: string;
  activeAgents?: number;
  merged7d?: number;
  openTasks?: number;
  buildMode?: string;
  publishedAt?: string;
  createdAt?: string;
}

type Filter = 'all' | 'new' | 'active' | 'needs-work';

interface DiscoveryPalette {
  board: string;
  boardText: string;
  boardMuted: string;
  panel: string;
  panelAlt: string;
  panelSoft: string;
  edge: string;
  edgeStrong: string;
  accent: string;
  accentSoft: string;
  blue: string;
  blueSoft: string;
  amber: string;
  amberSoft: string;
  rail: string;
  input: string;
}

// A bot with no username cannot be opened, so omit it from the feed.
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

export function DiscoveryPage({ T, bots, loading }: {
  T: Theme; bots: DiscoverBot[]; loading: boolean;
}) {
  const C = discoveryPalette(T);
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
    queued: bots.reduce((sum, bot) => sum + Math.max(0, bot.openTasks ?? 0), 0),
  }), [bots]);

  const boardSubtitle = loading
    ? 'Indexing live bots'
    : bots.length
      ? `${bots.length} live bot${bots.length === 1 ? '' : 's'} ready to open in Telegram`
      : 'Live bots appear here when they have a public handle';

  return (
    <div style={{
      padding: '12px 12px 24px',
      minHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      background:
        `linear-gradient(180deg, ${hexA(C.blue, T.dark ? 0.1 : 0.05)} 0%, transparent 210px)`,
    }}>
      <section style={{
        borderRadius: 20,
        overflow: 'hidden',
        background: C.board,
        color: C.boardText,
        border: `1px solid ${C.edgeStrong}`,
        boxShadow: T.dark ? '0 18px 40px rgba(0,0,0,0.25)' : '0 16px 32px rgba(15,22,32,0.09)',
      }}>
        <div style={{
          padding: '15px 15px 13px',
          background:
            `linear-gradient(135deg, ${hexA(C.blue, 0.24)}, transparent 42%), ` +
            `repeating-linear-gradient(90deg, transparent 0 13px, ${hexA(C.edgeStrong, 0.28)} 13px 14px)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                height: 24,
                padding: '0 9px',
                borderRadius: 999,
                background: hexA(C.accent, 0.16),
                color: C.accent,
                fontFamily: T.mono,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0.3,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: C.accent }} />
                DISCOVERY
              </div>
              <div style={{
                marginTop: 10,
                fontFamily: T.font,
                fontSize: 24,
                lineHeight: '27px',
                fontWeight: 800,
                letterSpacing: -0.55,
                color: C.boardText,
              }}>
                Bot signal board
              </div>
              <div style={{
                marginTop: 6,
                fontFamily: T.font,
                fontSize: 13,
                lineHeight: '18px',
                color: C.boardMuted,
                maxWidth: 260,
              }}>
                {boardSubtitle}
              </div>
            </div>

            <div style={{
              width: 58,
              height: 58,
              borderRadius: 17,
              background: hexA(C.blue, 0.18),
              border: `1px solid ${hexA(C.blue, 0.45)}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <TGIcon name="compass" size={28} color={C.blue} stroke={2.1} />
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          borderTop: `1px solid ${hexA(C.edgeStrong, 0.72)}`,
          background: hexA(T.dark ? '#ffffff' : '#0d1620', T.dark ? 0.035 : 0.03),
        }}>
          <BoardMetric T={T} C={C} label="Live" value={loading ? '...' : String(metrics.live)} />
          <BoardMetric T={T} C={C} label="Maintained" value={loading ? '...' : String(metrics.maintained)} />
          <BoardMetric T={T} C={C} label="Queue" value={loading ? '...' : String(metrics.queued)} last />
        </div>
      </section>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 8,
      }}>
        <div style={{
          minHeight: 44,
          borderRadius: 15,
          background: C.input,
          border: `1px solid ${C.edge}`,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '0 12px',
        }}>
          <TGIcon name="search" size={18} color={T.hint} stroke={2} />
          <input
            value={query}
            onChange={e => setQuery(e.currentTarget.value)}
            placeholder="Search handles or purpose"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: T.text,
              fontFamily: T.font,
              fontSize: 15,
            }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ ...btnReset, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TGIcon name="close" size={17} color={T.hint} stroke={2.2} />
            </button>
          )}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 7,
        }}>
          <FilterButton T={T} C={C} active={filter === 'all'} label="All" onClick={() => setFilter('all')} />
          <FilterButton T={T} C={C} active={filter === 'new'} label="New" onClick={() => setFilter('new')} />
          <FilterButton T={T} C={C} active={filter === 'active'} label="Active" onClick={() => setFilter('active')} />
          <FilterButton T={T} C={C} active={filter === 'needs-work'} label="Queue" onClick={() => setFilter('needs-work')} />
        </div>
      </div>

      {!loading && bots.length === 0 && <EmptyDiscovery T={T} C={C} />}
      {!loading && bots.length > 0 && filteredBots.length === 0 && <NoMatches T={T} C={C} />}
      {loading && <LoadingRows T={T} C={C} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!loading && filteredBots.map((bot, index) => (
          <DiscoveryRow key={bot.id} T={T} C={C} bot={bot} rank={index + 1} />
        ))}
      </div>
    </div>
  );
}

function DiscoveryRow({ T, C, bot, rank }: { T: Theme; C: DiscoveryPalette; bot: DiscoverBot; rank: number }) {
  const signals = qualitySignals(bot);
  const age = timeAgo(bot.publishedAt || bot.createdAt);
  const buildMode = modeLabel(bot.buildMode);
  const signal = signalColor(C, signals);

  return (
    <button
      onClick={() => openTgLink(`https://t.me/${bot.username}`)}
      style={{
        ...btnReset,
        textAlign: 'left',
        width: '100%',
        display: 'grid',
        gridTemplateColumns: '60px minmax(0, 1fr)',
        borderRadius: 18,
        background: C.panel,
        border: `1px solid ${C.edge}`,
        boxShadow: T.dark ? '0 8px 22px rgba(0,0,0,0.16)' : '0 8px 22px rgba(15,22,32,0.06)',
        overflow: 'hidden',
      }}
    >
      <div style={{
        minHeight: 142,
        background:
          `linear-gradient(180deg, ${hexA(signal, 0.2)}, transparent), ` +
          `linear-gradient(90deg, ${hexA(signal, 0.25)}, ${C.rail})`,
        borderRight: `1px solid ${C.edge}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 0 10px',
      }}>
        <div style={{
          fontFamily: T.mono,
          fontSize: 10.5,
          fontWeight: 800,
          color: signal,
          letterSpacing: 0.2,
        }}>{String(rank).padStart(2, '0')}</div>
        <BotTile T={T} name={bot.name} tone={bot.tone} size={42} radius={14} />
        <div style={{ display: 'grid', gap: 4 }}>
          {[0, 1, 2, 3].map(i => (
            <span key={i} style={{
              width: 18,
              height: 3,
              borderRadius: 999,
              background: i < signals ? signal : hexA(T.hint, 0.22),
            }} />
          ))}
        </div>
      </div>

      <div style={{ minWidth: 0, padding: '13px 12px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <div style={{
                fontFamily: T.font,
                fontSize: 16.5,
                fontWeight: 800,
                color: T.text,
                letterSpacing: -0.28,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>{bot.name}</div>
              {isNew(bot) && <span style={{ width: 7, height: 7, borderRadius: 999, background: C.accent, flexShrink: 0 }} />}
            </div>
            <div style={{
              fontFamily: T.mono,
              fontSize: 12.4,
              color: C.blue,
              marginTop: 3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>@{bot.username}</div>
          </div>

          <div style={{
            width: 31,
            height: 31,
            borderRadius: 11,
            background: C.blueSoft,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            border: `1px solid ${hexA(C.blue, 0.18)}`,
          }}>
            <TGIcon name="open" size={16} color={C.blue} stroke={2.1} />
          </div>
        </div>

        <div style={{
          marginTop: 9,
          fontFamily: T.font,
          fontSize: 13.3,
          color: T.sub,
          lineHeight: '18px',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>{bot.preview}</div>

        <div style={{
          marginTop: 11,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 6,
        }}>
          <MiniMetric T={T} C={C} label="State" value="Live" tone="green" />
          <MiniMetric T={T} C={C} label="Age" value={age || 'Live'} />
          <MiniMetric T={T} C={C} label="Queue" value={queueLabel(bot)} tone={(bot.openTasks ?? 0) > 0 ? 'amber' : 'neutral'} />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
          {buildMode && <Signal T={T} C={C} icon={buildMode.icon} label={buildMode.label} tone="blue" />}
          {typeof bot.activeAgents === 'number' && bot.activeAgents > 0 && <Signal T={T} C={C} icon="cloud" label={`${bot.activeAgents} agent${bot.activeAgents === 1 ? '' : 's'}`} tone="blue" />}
          {typeof bot.merged7d === 'number' && bot.merged7d > 0 && <Signal T={T} C={C} icon="code" label={`${bot.merged7d} merged`} tone="blue" />}
          {isNew(bot) && <Signal T={T} C={C} icon="spark" label="new" tone="green" />}
        </div>
      </div>
    </button>
  );
}

function BoardMetric({ T, C, label, value, last }: { T: Theme; C: DiscoveryPalette; label: string; value: string; last?: boolean }) {
  return (
    <div style={{ padding: '11px 12px 12px', borderRight: last ? 'none' : `1px solid ${hexA(C.edgeStrong, 0.7)}` }}>
      <div style={{ fontFamily: T.mono, fontSize: 19, fontWeight: 850, color: C.boardText, lineHeight: '22px' }}>{value}</div>
      <div style={{ fontFamily: T.font, fontSize: 11.5, color: C.boardMuted, marginTop: 1 }}>{label}</div>
    </div>
  );
}

function FilterButton({ T, C, active, label, onClick }: { T: Theme; C: DiscoveryPalette; active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      ...btnReset,
      height: 35,
      borderRadius: 12,
      background: active ? C.board : C.panelAlt,
      color: active ? C.accent : T.sub,
      border: `1px solid ${active ? hexA(C.accent, 0.55) : C.edge}`,
      fontFamily: T.font,
      fontSize: 12.8,
      fontWeight: 750,
      boxShadow: active ? `0 8px 20px ${hexA(C.accent, 0.16)}` : 'none',
    }}>{label}</button>
  );
}

function MiniMetric({ T, C, label, value, tone = 'neutral' }: {
  T: Theme; C: DiscoveryPalette; label: string; value: string; tone?: 'neutral' | 'green' | 'amber';
}) {
  const color = tone === 'green' ? C.accent : tone === 'amber' ? C.amber : T.text;
  return (
    <div style={{
      minWidth: 0,
      borderRadius: 12,
      padding: '8px 8px 7px',
      background: C.panelSoft,
      border: `1px solid ${C.edge}`,
    }}>
      <div style={{ fontFamily: T.font, fontSize: 10.8, color: T.hint, lineHeight: '13px' }}>{label}</div>
      <div style={{
        marginTop: 1,
        fontFamily: T.font,
        fontSize: 12.3,
        fontWeight: 800,
        color,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>{value}</div>
    </div>
  );
}

function Signal({ T, C, icon, label, tone = 'neutral' }: {
  T: Theme; C: DiscoveryPalette; icon: string; label: string; tone?: 'neutral' | 'green' | 'blue' | 'amber';
}) {
  const palette = tone === 'green'
    ? { bg: C.accentSoft, fg: C.accent }
    : tone === 'blue'
      ? { bg: C.blueSoft, fg: C.blue }
      : tone === 'amber'
        ? { bg: C.amberSoft, fg: C.amber }
        : { bg: T.dark ? 'rgba(255,255,255,0.055)' : 'rgba(15,22,32,0.045)', fg: T.hint };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      minHeight: 23,
      padding: '0 8px',
      borderRadius: 9,
      background: palette.bg,
      color: palette.fg,
      fontFamily: T.font,
      fontSize: 11.4,
      fontWeight: 750,
    }}>
      <TGIcon name={icon} size={13} color={palette.fg} stroke={2.1} />
      {label}
    </span>
  );
}

function EmptyDiscovery({ T, C }: { T: Theme; C: DiscoveryPalette }) {
  const rows = [
    ['Live bot', 'Deployed and reachable'],
    ['Telegram handle', 'Real @username attached'],
    ['Visible', 'Owner leaves Discovery on'],
  ];
  return (
    <div style={{
      padding: 16,
      borderRadius: 18,
      background: C.panel,
      border: `1px solid ${C.edge}`,
      boxShadow: T.shadow,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 15, background: C.blueSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TGIcon name="compass" size={22} color={C.blue} stroke={2} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 800, color: T.text, letterSpacing: -0.2 }}>No public bots yet</div>
          <div style={{ fontFamily: T.font, fontSize: 13, color: T.hint, marginTop: 2 }}>The directory opens when live bots have public handles.</div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 15 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 8, borderTop: `1px solid ${C.edge}` }}>
            <div style={{ fontFamily: T.font, fontSize: 13.5, fontWeight: 700, color: T.text }}>{label}</div>
            <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, textAlign: 'right' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NoMatches({ T, C }: { T: Theme; C: DiscoveryPalette }) {
  return (
    <div style={{
      padding: 18,
      borderRadius: 18,
      background: C.panel,
      border: `1px solid ${C.edge}`,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 14, background: C.blueSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TGIcon name="search" size={20} color={C.blue} stroke={2} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 800, color: T.text }}>No matching bots</div>
        <div style={{ fontFamily: T.font, fontSize: 13, color: T.hint, marginTop: 2 }}>Try another query or filter.</div>
      </div>
    </div>
  );
}

function LoadingRows({ T, C }: { T: Theme; C: DiscoveryPalette }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          minHeight: 116,
          borderRadius: 18,
          background: C.panel,
          border: `1px solid ${C.edge}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {i === 1 ? <Spinner color={C.blue} size={20} /> : (
            <div style={{ width: '82%', height: 44, borderRadius: 13, background: C.panelSoft }} />
          )}
        </div>
      ))}
    </div>
  );
}

function discoveryPalette(T: Theme): DiscoveryPalette {
  if (T.dark) {
    return {
      board: '#101923',
      boardText: '#f5f7fa',
      boardMuted: '#9eacba',
      panel: '#151f2a',
      panelAlt: '#111a24',
      panelSoft: 'rgba(255,255,255,0.045)',
      edge: 'rgba(130,154,174,0.16)',
      edgeStrong: 'rgba(84,184,255,0.2)',
      accent: '#37d69b',
      accentSoft: 'rgba(55,214,155,0.15)',
      blue: '#54b8ff',
      blueSoft: 'rgba(84,184,255,0.14)',
      amber: '#f0b35a',
      amberSoft: 'rgba(240,179,90,0.15)',
      rail: '#101720',
      input: '#0f1720',
    };
  }
  return {
    board: '#17202b',
    boardText: '#ffffff',
    boardMuted: '#b8c4cf',
    panel: '#ffffff',
    panelAlt: '#f3f7fb',
    panelSoft: 'rgba(23,32,43,0.045)',
    edge: 'rgba(23,32,43,0.09)',
    edgeStrong: 'rgba(42,139,217,0.22)',
    accent: '#10996c',
    accentSoft: 'rgba(16,153,108,0.1)',
    blue: '#247cc9',
    blueSoft: 'rgba(36,124,201,0.1)',
    amber: '#b97816',
    amberSoft: 'rgba(185,120,22,0.1)',
    rail: '#f4f7fa',
    input: '#ffffff',
  };
}

function qualitySignals(bot: DiscoverBot): number {
  let score = 1; // live with a real handle
  if (typeof bot.openTasks === 'number' && bot.openTasks === 0) score++;
  if ((bot.activeAgents ?? 0) > 0 || (bot.merged7d ?? 0) > 0) score++;
  if (isNew(bot)) score++;
  return Math.min(score, 4);
}

function signalColor(C: DiscoveryPalette, score: number): string {
  if (score >= 3) return C.accent;
  if (score === 2) return C.blue;
  return C.amber;
}

function modeLabel(mode?: string): { label: string; icon: string } | null {
  if (!mode) return null;
  if (mode === 'platform_agent') return { label: 'Platform', icon: 'cloud' };
  if (mode === 'local_agent') return { label: 'Local', icon: 'server' };
  return { label: mode.replace(/_/g, ' '), icon: 'code' };
}

function queueLabel(bot: DiscoverBot): string {
  if (typeof bot.openTasks !== 'number') return 'n/a';
  if (bot.openTasks <= 0) return 'Clear';
  return String(bot.openTasks);
}

function isNew(bot: DiscoverBot): boolean {
  const age = daysSince(bot.publishedAt || bot.createdAt);
  return age !== null && age <= 14;
}

function timeAgo(date?: string): string | null {
  const days = daysSince(date);
  if (days === null) return null;
  if (days <= 0) return 'today';
  if (days === 1) return '1d';
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1mo' : `${months}mo`;
}

function daysSince(date?: string): number | null {
  if (!date) return null;
  const time = Date.parse(date);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86400000));
}
