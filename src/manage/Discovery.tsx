// Discovery - a public list of live production bots built on the platform.
// Tapping a row opens the live bot in Telegram. The list comes from
// GET /builder/projects/discover; other users' bots cannot be enumerated
// client-side, so an empty API response stays empty.
import { useMemo } from 'react';
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

interface DiscoveryPalette {
  page: string;
  panel: string;
  row: string;
  rowPressed: string;
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
  const C = discoveryPalette(T);
  const visibleBots = useMemo(() => bots, [bots]);

  return (
    <div style={{
      minHeight: '100%',
      padding: '14px 12px 24px',
      background: C.page,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <section style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        padding: '0 2px 2px',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: T.font,
            fontSize: 22,
            lineHeight: '26px',
            fontWeight: 800,
            letterSpacing: 0,
            color: C.ink,
          }}>Live bots</div>
          <div style={{
            marginTop: 3,
            fontFamily: T.font,
            fontSize: 13,
            lineHeight: '18px',
            color: C.muted,
          }}>
            {loading ? 'Loading Telegram bots' : bots.length ? `${bots.length} bots ready to try in Telegram` : 'Public bots appear here after launch'}
          </div>
        </div>

        <div style={{
          minWidth: 42,
          height: 34,
          padding: '0 11px',
          borderRadius: 12,
          background: C.panel,
          border: `1px solid ${C.edge}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: T.mono,
          fontSize: 15,
          fontWeight: 850,
          color: C.ink,
        }}>{loading ? '-' : bots.length}</div>
      </section>

      {loading && <LoadingRows T={T} C={C} />}
      {!loading && visibleBots.length === 0 && <EmptyDiscovery T={T} C={C} />}

      {!loading && visibleBots.length > 0 && (
        <div style={{
          background: C.panel,
          border: `1px solid ${C.edgeStrong}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          {visibleBots.map((bot, index) => (
            <DiscoveryRow
              key={bot.id}
              T={T}
              C={C}
              bot={bot}
              last={index === visibleBots.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DiscoveryRow({ T, C, bot, last }: {
  T: Theme; C: DiscoveryPalette; bot: DiscoverBot; last: boolean;
}) {
  const queue = typeof bot.openTasks === 'number' ? bot.openTasks : 0;
  const age = timeAgo(bot.publishedAt || bot.createdAt);

  return (
    <button
      onClick={() => openTgLink(`https://t.me/${bot.username}`)}
      style={{
        ...btnReset,
        width: '100%',
        minHeight: 104,
        padding: '13px 12px',
        display: 'grid',
        gridTemplateColumns: '48px minmax(0, 1fr) 30px',
        gap: 12,
        alignItems: 'start',
        textAlign: 'left',
        background: C.row,
        borderBottom: last ? 'none' : `1px solid ${C.edge}`,
      }}
    >
      <BotTile T={T} name={bot.name} tone={bot.tone} size={48} radius={12} />

      <div style={{ minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          minWidth: 0,
        }}>
          <div style={{
            minWidth: 0,
            fontFamily: T.font,
            fontSize: 16,
            lineHeight: '20px',
            fontWeight: 800,
            color: C.ink,
            letterSpacing: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>{bot.name}</div>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: C.live, flexShrink: 0 }} />
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

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          <StatusChip T={T} C={C} label="Live" tone="live" />
          {age && <StatusChip T={T} C={C} label={age} />}
          {queue > 0 && <StatusChip T={T} C={C} label={`${queue} queued`} tone="amber" />}
        </div>
      </div>

      <div style={{
        width: 30,
        height: 30,
        borderRadius: 10,
        background: C.blueBg,
        border: `1px solid ${hexA(C.blue, 0.22)}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <TGIcon name="open" size={15} color={C.blue} stroke={2.1} />
      </div>
    </button>
  );
}

function StatusChip({ T, C, label, tone = 'neutral' }: {
  T: Theme; C: DiscoveryPalette; label: string; tone?: 'neutral' | 'live' | 'amber';
}) {
  const bg = tone === 'live' ? C.liveBg : tone === 'amber' ? C.amberBg : C.rowPressed;
  const fg = tone === 'live' ? C.live : tone === 'amber' ? C.amber : C.muted;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: 23,
      padding: '0 8px',
      borderRadius: 999,
      background: bg,
      color: fg,
      fontFamily: T.font,
      fontSize: 11.5,
      fontWeight: 750,
      lineHeight: '23px',
      whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

function EmptyDiscovery({ T, C }: { T: Theme; C: DiscoveryPalette }) {
  return (
    <div style={{
      padding: 16,
      borderRadius: 12,
      background: C.panel,
      border: `1px solid ${C.edgeStrong}`,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{
        width: 42,
        height: 42,
        borderRadius: 12,
        background: C.blueBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <TGIcon name="compass" size={21} color={C.blue} stroke={2} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: 0 }}>No public bots yet</div>
        <div style={{ fontFamily: T.font, fontSize: 13, color: C.muted, marginTop: 2 }}>The list opens when live bots have public handles.</div>
      </div>
    </div>
  );
}

function LoadingRows({ T, C }: { T: Theme; C: DiscoveryPalette }) {
  return (
    <div style={{
      background: C.panel,
      border: `1px solid ${C.edgeStrong}`,
      borderRadius: 12,
      overflow: 'hidden',
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
            <div style={{ width: '76%', height: 42, borderRadius: 12, background: C.rowPressed }} />
          )}
        </div>
      ))}
    </div>
  );
}

function discoveryPalette(T: Theme): DiscoveryPalette {
  if (T.dark) {
    return {
      page: '#0e1621',
      panel: '#151e28',
      row: '#151e28',
      rowPressed: 'rgba(255,255,255,0.055)',
      edge: 'rgba(210,224,238,0.075)',
      edgeStrong: 'rgba(210,224,238,0.12)',
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
    row: '#ffffff',
    rowPressed: 'rgba(13,22,32,0.045)',
    edge: 'rgba(13,22,32,0.075)',
    edgeStrong: 'rgba(13,22,32,0.11)',
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
