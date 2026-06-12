// BotOverview — per-bot overview page (My Bots → bot). Everything real:
// agent-link status, task/PR stats from the project, Test bot via the managed
// bot's @username, Recent Activity + Logs from the chat's system events.
// "Request an update" (App footer) opens the chat view.
import { useEffect, useState } from 'react';
import { Theme, btnReset } from '../theme';
import {
  Project, TaskItem, ChatMessage, AgentLinkStatus,
  getProject, listProjectTasks, getProjectBot, getAgentLink,
} from '../api/client';
import { openTgLink } from '../telegram';
import { TGIcon, Card, Pill, Dot, BotTile } from '../ui';
import { MyBot } from './MyBots';

function relTime(iso?: string): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const isFail = (m: ChatMessage) => /fail|error|crash|🔴|❌|✗/i.test(m.content);

// latest test results — structured (data.kind=test) or parsed from a system
// message like "38/38 passing · 94% cov"; null until CI results exist.
function latestTests(sys: ChatMessage[]): { passed: number; total: number; coverage?: number } | null {
  for (let i = sys.length - 1; i >= 0; i--) {
    const m = sys[i];
    const d = m.data as { kind?: string; passed?: number; failed?: number; coverage_pct?: number } | undefined;
    if (d?.kind === 'test' && typeof d.passed === 'number') {
      return { passed: d.passed, total: d.passed + (d.failed || 0), coverage: d.coverage_pct };
    }
    const t = /(\d+)\s*\/\s*(\d+)\s*(?:tests?|cases?|passing)/i.exec(m.content);
    if (t) {
      const cov = /(\d+)\s*%\s*cov/i.exec(m.content);
      return { passed: +t[1], total: +t[2], coverage: cov ? +cov[1] : undefined };
    }
  }
  return null;
}

const TASK_DOT: Record<string, 'green' | 'accent' | 'hint'> = {
  done: 'green', in_progress: 'accent', open: 'hint',
};

export function BotOverview({ T, bot, messages, onConnectAgent }: {
  T: Theme; bot: MyBot; messages: ChatMessage[]; onConnectAgent: () => void;
}) {
  const [detail, setDetail] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [link, setLink] = useState<AgentLinkStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const [d, t, b, l] = await Promise.all([
        getProject(bot.id).catch(() => null),
        listProjectTasks(bot.id).catch(() => null),
        getProjectBot(bot.id).catch(() => null),
        getAgentLink(bot.id).catch(() => null),
      ]);
      if (cancelled) return;
      if (d) setDetail(d.project);
      if (t) setTasks(t.tasks || []);
      if (b?.bot_username) setBotUsername(b.bot_username);
      if (l) setLink(l);
      timer = setTimeout(tick, 12000);
    };
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [bot.id]);

  const sys = messages.filter(m => m.role === 'system');
  const activity = [...sys].reverse().slice(0, 4);
  const done = tasks.filter(t => t.status === 'done').length;
  const agents = detail?.active_agents ?? tasks.reduce((n, t) => n + (t.claimers_count || 0), 0);
  const connected = link?.status === 'connected';
  const agentClient = (link?.connected_client || '').split('/')[0];
  const handle = botUsername || bot.handle;

  return (
    <div style={{ padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '2px 2px 0' }}>
        <BotTile T={T} name={bot.name} tone={bot.tone} size={52} radius={16} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.font, fontSize: 19, fontWeight: 700, color: T.text, letterSpacing: -0.3 }}>{bot.name}</div>
          <div style={{ fontFamily: T.mono, fontSize: 13, color: T.accent, marginTop: 1 }}>@{handle}</div>
        </div>
        {bot.status === 'live'
          ? <Pill T={T} tone="green"><Dot color={T.green} size={6} /> Live</Pill>
          : <Pill T={T} tone="neutral">{bot.statusLabel}</Pill>}
      </div>

      {/* agent */}
      <button onClick={connected ? undefined : onConnectAgent} style={{
        ...btnReset, display: 'flex', alignItems: 'center', gap: 12, padding: 14, textAlign: 'left',
        borderRadius: T.cardRadius, background: T.cardBg, border: `0.5px solid ${T.sep}`, boxShadow: T.shadow,
        cursor: connected ? 'default' : 'pointer',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 11, flexShrink: 0,
          background: connected ? T.greenSoft : T.accentSoft,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <TGIcon name="link" size={18} color={connected ? T.green : T.accent} stroke={1.9} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text }}>
            {connected ? `Agent · ${agentClient || 'connected'}` : 'No agent connected'}
          </div>
          <div style={{ fontFamily: T.font, fontSize: 12.5, color: connected ? T.green : T.hint, marginTop: 1 }}>
            {connected ? 'Connected' : 'Tap to connect your Claude or Codex'}
          </div>
        </div>
        {!connected && <TGIcon name="chevRight" size={18} color={T.hint} stroke={2} />}
      </button>

      {/* stats — real platform numbers */}
      <div style={{ display: 'flex', gap: 10 }}>
        <StatTile T={T} value={tasks.length ? `${done}/${tasks.length}` : '—'} label="Tasks done" good={tasks.length > 0 && done >= tasks.length} />
        <StatTile T={T} value={String(agents)} label={agents === 1 ? 'Agent active' : 'Agents active'} />
        <StatTile T={T} value={String(detail?.prs_merged_7d ?? 0)} label="PRs · 7d" />
      </div>

      {/* actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <ActionBtn T={T} icon="open" label="Test bot" disabled={!botUsername}
          onClick={() => botUsername && openTgLink(`https://t.me/${botUsername}`)} />
        <ActionBtn T={T} icon="link" label="Share" disabled={!botUsername}
          onClick={() => botUsername && openTgLink(`https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${botUsername}`)}&text=${encodeURIComponent(`Try my bot @${botUsername}`)}`)} />
      </div>

      {/* tasks — full queue with live statuses, PR links when present */}
      <div>
        <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 4px 9px' }}>
          Tasks
        </div>
        <Card T={T} pad={0}>
          {tasks.length === 0 && (
            <div style={{ padding: 14, fontFamily: T.font, fontSize: 13.5, color: T.hint }}>
              No tasks yet — they appear once the plan is approved.
            </div>
          )}
          {tasks.map((t, i) => {
            const tone = TASK_DOT[t.status] || 'hint';
            const color = tone === 'green' ? T.green : tone === 'accent' ? T.accent : T.hint;
            return (
              <button key={t.id || t.slug}
                onClick={t.pr_url ? () => openTgLink(t.pr_url!) : undefined}
                style={{
                  ...btnReset, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11,
                  padding: '11px 14px', borderTop: i ? `0.5px solid ${T.sep}` : 'none',
                  cursor: t.pr_url ? 'pointer' : 'default',
                }}>
                {t.status === 'done'
                  ? <div style={{ width: 20, height: 20, borderRadius: 999, background: T.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <TGIcon name="check" size={13} color={T.green} stroke={2.6} />
                    </div>
                  : <Dot color={color} size={8} pulse={t.status === 'in_progress'} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 600, color: T.text, lineHeight: '18px' }}>{t.title}</div>
                  <div style={{ fontFamily: T.font, fontSize: 11.5, color: t.status === 'done' ? T.green : T.hint, marginTop: 1 }}>
                    {t.status === 'done' ? 'done' : t.status === 'in_progress' ? `building${t.claimers_count ? ` · ${t.claimers_count} agent${t.claimers_count > 1 ? 's' : ''}` : ''}` : 'queued'}
                    {t.pr_url ? ' · PR ↗' : ''}
                  </div>
                </div>
                <Pill T={T} tone={t.difficulty === 'easy' ? 'green' : 'accent'} style={{ height: 20, fontSize: 10.5, padding: '0 7px' }}>
                  {t.difficulty || 'medium'}
                </Pill>
              </button>
            );
          })}
        </Card>
      </div>

      {/* tests — real when CI results land; honest placeholder until then */}
      <div>
        <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 4px 9px' }}>
          Tests
        </div>
        {(() => {
          const tr = latestTests(sys);
          if (!tr) return (
            <Card T={T} pad={14} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <TGIcon name="beaker" size={19} color={T.hint} stroke={1.8} />
              <span style={{ fontFamily: T.font, fontSize: 13.5, color: T.hint, lineHeight: '18px' }}>
                No test results yet — they appear when CI runs land on the build.
              </span>
            </Card>
          );
          const allPass = tr.passed >= tr.total;
          return (
            <div style={{ display: 'flex', gap: 10 }}>
              <StatTile T={T} value={`${tr.passed}/${tr.total}`} label="Tests passing" good={allPass} />
              <StatTile T={T} value={tr.coverage != null ? `${tr.coverage}%` : '—'} label="Coverage" />
            </div>
          );
        })()}
      </div>

      {/* recent activity — latest build/deploy events */}
      <div>
        <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 4px 9px' }}>
          Recent activity
        </div>
        <Card T={T} pad={0}>
          {activity.length === 0 && (
            <div style={{ padding: 14, fontFamily: T.font, fontSize: 13.5, color: T.hint }}>
              No events yet — they appear as the build progresses.
            </div>
          )}
          {activity.map((m, i) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: i ? `0.5px solid ${T.sep}` : 'none' }}>
              <Dot color={isFail(m) ? T.red : T.green} size={7} />
              <span style={{
                flex: 1, fontFamily: T.font, fontSize: 13.5, color: T.text, lineHeight: '18px',
                overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>{m.content}</span>
              <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.hint, flexShrink: 0 }}>{relTime(m.created_at)}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* full build log — after activity, replacing the mock's commands block */}
      <div>
        <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 4px 9px' }}>
          Logs
        </div>
        <div style={{ background: T.dark ? '#0a1119' : '#0d1620', borderRadius: 14, padding: 14, maxHeight: 180, overflow: 'auto' }}>
          {sys.length === 0 && (
            <span style={{ fontFamily: T.mono, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>no build events yet…</span>
          )}
          {sys.map(m => (
            <div key={m.id} style={{
              fontFamily: T.mono, fontSize: 12, lineHeight: '19px',
              color: isFail(m) ? '#ff9b8a' : '#b9f6ca',
            }}>
              <span style={{ color: 'rgba(255,255,255,0.35)' }}>[{relTime(m.created_at) || 'log'}] </span>{m.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatTile({ T, value, label, good }: { T: Theme; value: string; label: string; good?: boolean }) {
  return (
    <Card T={T} pad={13} style={{ flex: 1 }}>
      <div style={{ fontFamily: T.font, fontSize: 22, fontWeight: 700, color: good ? T.green : T.text, letterSpacing: -0.4 }}>{value}</div>
      <div style={{ fontFamily: T.font, fontSize: 12, color: T.hint, marginTop: 2, lineHeight: '15px' }}>{label}</div>
    </Card>
  );
}

function ActionBtn({ T, icon, label, onClick, disabled }: {
  T: Theme; icon: string; label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button onClick={disabled ? undefined : onClick} style={{
      ...btnReset, flex: 1, height: 46, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      background: T.cardBg, border: `0.5px solid ${T.sep}`, boxShadow: T.shadow,
      color: disabled ? T.hint : T.accent, fontFamily: T.font, fontSize: 14.5, fontWeight: 600,
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
    }}>
      <TGIcon name={icon} size={17} color={disabled ? T.hint : T.accent} stroke={2} />
      {label}
    </button>
  );
}
