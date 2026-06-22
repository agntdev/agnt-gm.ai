// Discovery - a public registry of live production bots built on the platform.
// Tapping a row opens the live bot in Telegram. The list comes from
// GET /builder/projects/discover; other users' bots cannot be enumerated
// client-side, so an empty API response stays empty.
import { useMemo, useState } from 'react';
import { Theme, btnReset, hexA, toneFor, tile } from '../theme';
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

interface RegistryPalette {
  page: string;
  panel: string;
  panelMuted: string;
  row: string;
  input: string;
  edge: string;
  edgeStrong: string;
  ink: string;
  muted: string;
  live: string;
  liveBg: string;
  blue: string;
  blueBg: string;
  amber: string;
  amberBg: string;
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
  const C = registryPalette(T);
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

  return (
    <div style={{
      padding: '12px 12px 24px',
      minHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      background: C.page,
    }}>
      <section style={{
        background: C.panel,
        border: `1px solid ${C.edgeStrong}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '12px 12px 10px',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 14,
          alignItems: 'flex-start',
          borderBottom: `1px solid ${C.edge}`,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: T.mono,
              fontSize: 11,
              fontWeight: 800,
              color: C.live,
              letterSpacing: 0,
              textTransform: 'uppercase',
            }}>Discovery Registry</div>
            <div style={{
              marginTop: 5,
              fontFamily: T.font,
              fontSize: 22,
              lineHeight: '26px',
              fontWeight: 800,
              letterSpacing: 0,
              color: C.ink,
            }}>Live Telegram bots</div>
            <div style={{
              marginTop: 4,
              fontFamily: T.font,
              fontSize: 13,
              lineHeight: '18px',
              color: C.muted,
            }}>
              {loading ? 'Indexing live bots' : bots.length ? `${bots.length} bots with public handles` : 'Public bots appear here after launch'}
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(44px, 1fr))',
            gap: 6,
            flexShrink: 0,
          }}>
            <MiniCount T={T} C={C} label="Live" value={loading ? '-' : String(metrics.live)} />
            <MiniCount T={T} C={C} label="Maint." value={loading ? '-' : String(metrics.maintained)} />
            <MiniCount T={T} C={C} label="Queue" value={loading ? '-' : String(metrics.queued)} />
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 8,
          padding: 10,
          background: C.panelMuted,
        }}>
          <div style={{
            minHeight: 42,
            borderRadius: 8,
            background: C.input,
            border: `1px solid ${C.edge}`,
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '0 11px',
          }}>
            <TGIcon name="search" size={17} color={C.muted} stroke={2} />
            <input
              value={query}
              onChange={e => setQuery(e.currentTarget.value)}
              placeholder="Search name, handle, purpose"
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: C.ink,
                fontFamily: T.font,
                fontSize: 14.5,
              }}
            />
            {query && (
              <button onClick={() => setQuery('')} style={{ ...btnReset, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TGIcon name="close" size={16} color={C.muted} stroke={2.2} />
              </button>
            )}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 6,
          }}>
            <FilterButton T={T} C={C} active={filter === 'all'} label="All" onClick={() => setFilter('all')} />
            <FilterButton T={T} C={C} active={filter === 'new'} label="New" onClick={() => setFilter('new')} />
            <FilterButton T={T} C={C} active={filter === 'active'} label="Active" onClick={() => setFilter('active')} />
            <FilterButton T={T} C={C} active={filter === 'needs-work'} label="Queue" onClick={() => setFilter('needs-work')} />
          </div>
        </div>
      </section>

      {!loading && bots.length === 0 && <EmptyDiscovery T={T} C={C} />}
      {!loading && bots.length > 0 && filteredBots.length === 0 && <NoMatches T={T} C={C} />}
      {loading && <LoadingRows T={T} C={C} />}

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${C.edgeStrong}`,
        borderRadius: 8,
        overflow: 'hidden',
        background: C.row,
      }}>
        {!loading && filteredBots.map((bot, index) => (
          <DiscoveryRow
            key={bot.id}
            T={T}
            C={C}
            bot={bot}
            rank={index + 1}
            last={index === filteredBots.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function DiscoveryRow({ T, C, bot, rank, last }: {
  T: Theme; C: RegistryPalette; bot: DiscoverBot; rank: number; last: boolean;
}) {
  const tone = tile(bot.tone, T.dark);
  const age = timeAgo(bot.publishedAt || bot.createdAt);
  const buildMode = modeLabel(bot.buildMode);
  const queue = queueLabel(bot);
  const queueTone = typeof bot.openTasks === 'number' && bot.openTasks > 0 ? 'amber' : 'neutral';

  return (
    <button
      onClick={() => openTgLink(`https://t.me/${bot.username}`)}
      style={{
        ...btnReset,
        width: '100%',
        textAlign: 'left',
        display: 'grid',
        gridTemplateColumns: '38px 46px minmax(0, 1fr) 30px',
        gap: 10,
        alignItems: 'start',
        padding: '12px 10px 12px 0',
        background: C.row,
        borderBottom: last ? 'none' : `1px solid ${C.edge}`,
      }}
    >
      <div style={{
        height: '100%',
        minHeight: 96,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 3,
        borderRight: `3px solid ${tone.fg}`,
      }}>
        <span style={{
          fontFamily: T.mono,
          fontSize: 11,
          fontWeight: 800,
          color: C.muted,
          letterSpacing: 0,
        }}>{String(rank).padStart(2, '0')}</span>
      </div>

      <BotTile T={T} name={bot.name} tone={bot.tone} size={42} radius={8} />

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <div style={{
            fontFamily: T.font,
            fontSize: 16,
            fontWeight: 800,
            color: C.ink,
            letterSpacing: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>{bot.name}</div>
          {isNew(bot) && <span style={{ flexShrink: 0, width: 7, height: 7, borderRadius: 999, background: C.live }} />}
        </div>

        <div style={{
          marginTop: 2,
          fontFamily: T.mono,
          fontSize: 12.2,
          lineHeight: '16px',
          color: C.blue,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>@{bot.username}</div>

        <div style={{
          marginTop: 7,
          fontFamily: T.font,
          fontSize: 13,
          lineHeight: '18px',
          color: T.sub,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>{bot.preview}</div>

        <div style={{
          marginTop: 10,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
        }}>
          <LedgerCell T={T} C={C} label="State" value="Live" tone="live" />
          {age && <LedgerCell T={T} C={C} label="Age" value={age} />}
          {buildMode && <LedgerCell T={T} C={C} label="Mode" value={buildMode.label} />}
          <LedgerCell T={T} C={C} label="Queue" value={queue === 'Clear' ? 'Clear' : `Q ${queue}`} tone={queueTone} />
        </div>
      </div>

      <div style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        background: C.blueBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${hexA(C.blue, 0.22)}`,
      }}>
        <TGIcon name="open" size={15} color={C.blue} stroke={2.1} />
      </div>
    </button>
  );
}

function MiniCount({ T, C, label, value }: { T: Theme; C: RegistryPalette; label: string; value: string }) {
  return (
    <div style={{
      minWidth: 0,
      padding: '7px 8px',
      borderRadius: 8,
      background: C.panelMuted,
      border: `1px solid ${C.edge}`,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 850, color: C.ink, lineHeight: '18px', letterSpacing: 0 }}>{value}</div>
      <div style={{ fontFamily: T.font, fontSize: 10.8, color: C.muted, marginTop: 1 }}>{label}</div>
    </div>
  );
}

function FilterButton({ T, C, active, label, onClick }: {
  T: Theme; C: RegistryPalette; active: boolean; label: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      ...btnReset,
      height: 34,
      borderRadius: 8,
      background: active ? C.ink : C.input,
      color: active ? (T.dark ? '#0e1621' : '#ffffff') : C.muted,
      border: `1px solid ${active ? C.ink : C.edge}`,
      fontFamily: T.font,
      fontSize: 12.8,
      fontWeight: 800,
      letterSpacing: 0,
    }}>{label}</button>
  );
}

function LedgerCell({ T, C, label, value, tone = 'neutral' }: {
  T: Theme; C: RegistryPalette; label: string; value: string; tone?: 'neutral' | 'live' | 'amber';
}) {
  const fg = tone === 'live' ? C.live : tone === 'amber' ? C.amber : C.ink;
  const bg = tone === 'live' ? C.liveBg : tone === 'amber' ? C.amberBg : C.panelMuted;
  return (
    <div style={{
      minWidth: 0,
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 8,
      padding: '5px 8px',
      background: bg,
      border: `1px solid ${C.edge}`,
      maxWidth: '100%',
    }}>
      <div style={{
        fontFamily: T.font,
        fontSize: 12,
        fontWeight: 800,
        color: fg,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }} title={label}>{value}</div>
    </div>
  );
}

function EmptyDiscovery({ T, C }: { T: Theme; C: RegistryPalette }) {
  const rows = [
    ['Live bot', 'Deployed and reachable'],
    ['Telegram handle', 'Real @username attached'],
    ['Visible', 'Owner leaves Discovery on'],
  ];
  return (
    <div style={{
      padding: 14,
      borderRadius: 8,
      background: C.panel,
      border: `1px solid ${C.edgeStrong}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 42,
          height: 42,
          borderRadius: 8,
          background: C.blueBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <TGIcon name="compass" size={21} color={C.blue} stroke={2} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: 0 }}>No public bots yet</div>
          <div style={{ fontFamily: T.font, fontSize: 13, color: C.muted, marginTop: 2 }}>The registry opens when live bots have public handles.</div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 7, marginTop: 14 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 7, borderTop: `1px solid ${C.edge}` }}>
            <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 750, color: C.ink }}>{label}</div>
            <div style={{ fontFamily: T.font, fontSize: 12.5, color: C.muted, textAlign: 'right' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NoMatches({ T, C }: { T: Theme; C: RegistryPalette }) {
  return (
    <div style={{
      padding: 15,
      borderRadius: 8,
      background: C.panel,
      border: `1px solid ${C.edgeStrong}`,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 8, background: C.blueBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TGIcon name="search" size={20} color={C.blue} stroke={2} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 800, color: C.ink }}>No matching bots</div>
        <div style={{ fontFamily: T.font, fontSize: 13, color: C.muted, marginTop: 2 }}>Try another query or filter.</div>
      </div>
    </div>
  );
}

function LoadingRows({ T, C }: { T: Theme; C: RegistryPalette }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      border: `1px solid ${C.edgeStrong}`,
      borderRadius: 8,
      overflow: 'hidden',
      background: C.row,
    }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          minHeight: 104,
          borderBottom: i === 2 ? 'none' : `1px solid ${C.edge}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {i === 1 ? <Spinner color={C.blue} size={20} /> : (
            <div style={{ width: '76%', height: 42, borderRadius: 8, background: C.panelMuted }} />
          )}
        </div>
      ))}
    </div>
  );
}

function registryPalette(T: Theme): RegistryPalette {
  if (T.dark) {
    return {
      page: '#0e1621',
      panel: '#151e28',
      panelMuted: '#101923',
      row: '#151e28',
      input: '#0f1822',
      edge: 'rgba(210,224,238,0.08)',
      edgeStrong: 'rgba(210,224,238,0.13)',
      ink: '#f3f6f8',
      muted: '#8d9aa7',
      live: '#52c48f',
      liveBg: 'rgba(82,196,143,0.12)',
      blue: '#65a9e8',
      blueBg: 'rgba(101,169,232,0.12)',
      amber: '#dca24a',
      amberBg: 'rgba(220,162,74,0.12)',
    };
  }
  return {
    page: '#eef1f5',
    panel: '#ffffff',
    panelMuted: '#f4f6f8',
    row: '#ffffff',
    input: '#ffffff',
    edge: 'rgba(13,22,32,0.08)',
    edgeStrong: 'rgba(13,22,32,0.12)',
    ink: '#0d1620',
    muted: '#68737f',
    live: '#178557',
    liveBg: 'rgba(23,133,87,0.09)',
    blue: '#236fae',
    blueBg: 'rgba(35,111,174,0.09)',
    amber: '#a46a14',
    amberBg: 'rgba(164,106,20,0.09)',
  };
}

function modeLabel(mode?: string): { label: string; icon: string } | null {
  if (!mode) return null;
  if (mode === 'platform_agent') return { label: 'Platform', icon: 'cloud' };
  if (mode === 'local_agent') return { label: 'Local', icon: 'server' };
  return { label: mode.replace(/_/g, ' '), icon: 'code' };
}

function queueLabel(bot: DiscoverBot): string {
  if (typeof bot.openTasks !== 'number') return '-';
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
