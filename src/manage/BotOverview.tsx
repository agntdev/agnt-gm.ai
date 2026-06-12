// BotOverview — per-bot overview page (My Bots → bot). Everything real:
// agent-link status, task/PR stats from the project, Test bot via the managed
// bot's @username, Recent Activity + Logs from the chat's system events.
// "Request an update" (App footer) opens the chat view.
import { useEffect, useState } from 'react';
import { Theme, btnReset } from '../theme';
import {
  Project, TaskItem, ChatMessage, AgentLinkStatus, Deployment, DagInfo, TaskDetail,
  getProject, fetchProjectTasks, getProjectBot, getAgentLink, listDeployments, getTaskDetail,
} from '../api/client';
import { openTgLink, openExternal } from '../telegram';
import { TGIcon, Card, Pill, Dot, BotTile, Spinner } from '../ui';
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

// active work first, queued next, done last — the collapsed view shows
// what matters now
function orderTasks(tasks: TaskItem[]): TaskItem[] {
  const rank: Record<string, number> = { in_progress: 0, open: 1, done: 2 };
  return [...tasks].sort((a, b) => (rank[a.status] ?? 1) - (rank[b.status] ?? 1));
}

// the build pipeline's phases with the current one highlighted
const PHASES = ['general', 'design', 'details', 'dev', 'tests'];

function PhaseStrip({ T, dag }: { T: Theme; dag: DagInfo }) {
  const idx = PHASES.indexOf(dag.current_phase || '');
  const failed = dag.phase_status === 'failed';
  return (
    <div style={{ padding: '12px 14px 11px' }}>
      <div style={{ display: 'flex', gap: 5 }}>
        {PHASES.map((p, i) => (
          <div key={p} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i < idx ? T.accent
              : i === idx ? (failed ? T.red : T.accent)
              : (T.dark ? 'rgba(255,255,255,0.1)' : 'rgba(15,22,32,0.08)'),
            opacity: i < idx ? 0.55 : 1,
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7 }}>
        <span style={{ fontFamily: T.font, fontSize: 12, fontWeight: 600, color: failed ? T.red : T.accent }}>
          {dag.current_phase} phase{failed ? ' · fixing issues' : dag.phase_status && dag.phase_status !== 'open' ? ` · ${dag.phase_status}` : ''}
        </span>
        {idx >= 0 && (
          <span style={{ fontFamily: T.font, fontSize: 12, color: T.hint }}>{idx + 1} of {PHASES.length}</span>
        )}
      </div>
    </div>
  );
}

export function BotOverview({ T, bot, messages, onConnectAgent, onOpenChat, onDelete }: {
  T: Theme; bot: MyBot; messages: ChatMessage[]; onConnectAgent: () => void;
  onOpenChat: () => void; onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detail, setDetail] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [dag, setDag] = useState<DagInfo | null>(null);
  const [deploys, setDeploys] = useState<Deployment[]>([]);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [link, setLink] = useState<AgentLinkStatus | null>(null);
  const [commits7d, setCommits7d] = useState<number | null>(null);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [taskDetails, setTaskDetails] = useState<Record<string, TaskDetail | 'loading' | 'none'>>({});

  // tap a task → expand with the full title + body fetched from the API
  const toggleTask = (slug: string) => {
    setExpandedTask(prev => (prev === slug ? null : slug));
    if (!taskDetails[slug]) {
      setTaskDetails(prev => ({ ...prev, [slug]: 'loading' }));
      getTaskDetail(bot.id, slug).then(d =>
        setTaskDetails(prev => ({ ...prev, [slug]: d ?? 'none' })));
    }
  };

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const [d, t, dep, b, l] = await Promise.all([
        getProject(bot.id).catch(() => null),
        fetchProjectTasks(bot.id).catch(() => null),
        listDeployments(bot.id).catch(() => null),
        getProjectBot(bot.id).catch(() => null),
        getAgentLink(bot.id).catch(() => null),
      ]);
      if (cancelled) return;
      if (d) setDetail(d.project);
      if (t) { setTasks(t.tasks); setDag(t.dag ?? null); }
      if (dep) setDeploys(dep.deployments || []);
      if (b?.bot_username) setBotUsername(b.bot_username);
      if (l) setLink(l);
      timer = setTimeout(tick, 12000);
    };
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [bot.id]);

  // commits over the last 7 days, straight from the public GitHub repo.
  // Fetched once per repo (not on the 12s tick) — unauthenticated GitHub
  // calls are rate-limited per client IP.
  const repoUrl = detail?.github_repo_url;
  useEffect(() => {
    if (!repoUrl) return;
    const m = /github\.com\/([^/]+)\/([^/#?]+)/.exec(repoUrl);
    if (!m) return;
    let cancelled = false;
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/commits?since=${since}&per_page=100`)
      .then(r => (r.ok ? r.json() : null))
      .then((arr) => { if (!cancelled && Array.isArray(arr)) setCommits7d(arr.length); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [repoUrl]);

  const sys = messages.filter(m => m.role === 'system');
  const activity = [...sys].reverse().slice(0, 4);
  const done = tasks.filter(t => t.status === 'done').length;
  const prodDeploys = deploys.filter(d => d.kind !== 'preview' && !d.failure_reason).length;
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

      {/* stats — real platform + repo numbers */}
      <div style={{ display: 'flex', gap: 10 }}>
        <StatTile T={T} value={tasks.length ? `${done}/${tasks.length}` : '—'} label="Tasks done" good={tasks.length > 0 && done >= tasks.length} />
        <StatTile T={T} value={String(prodDeploys)} label={prodDeploys === 1 ? 'Deploy' : 'Deploys'} />
        <StatTile T={T} value={commits7d != null ? String(commits7d) : '—'} label="Commits · 7d" />
      </div>

      {/* actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <ActionBtn T={T} icon="open" label="Test bot" disabled={!botUsername}
          onClick={() => botUsername && openTgLink(`https://t.me/${botUsername}`)} />
        <ActionBtn T={T} icon="chat" label="Chat" onClick={onOpenChat} />
      </div>

      {/* tasks — compact: phase stepper + one-line rows, expandable */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 4px 9px' }}>
          <span style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3 }}>Tasks</span>
          {tasks.length > 0 && (
            <span style={{ fontFamily: T.font, fontSize: 12, color: T.hint }}>{done}/{tasks.length} done</span>
          )}
        </div>
        <Card T={T} pad={0}>
          {dag?.current_phase && <PhaseStrip T={T} dag={dag} />}
          {tasks.length === 0 && (
            <div style={{ padding: 14, fontFamily: T.font, fontSize: 13.5, color: T.hint }}>
              No tasks yet — they appear once the plan is approved.
            </div>
          )}
          {orderTasks(tasks).slice(0, showAllTasks ? undefined : 4).map((t, i) => {
            const tone = TASK_DOT[t.status] || 'hint';
            const color = tone === 'green' ? T.green : tone === 'accent' ? T.accent : T.hint;
            const slug = t.slug || t.id;
            const open = expandedTask === slug;
            const detail = taskDetails[slug];
            return (
              <div key={slug} style={{ borderTop: i || dag?.current_phase ? `0.5px solid ${T.sep}` : 'none' }}>
                <button onClick={() => toggleTask(slug)} style={{
                  ...btnReset, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', opacity: !open && t.status === 'done' ? 0.72 : 1,
                }}>
                  {t.status === 'done'
                    ? <TGIcon name="check" size={15} color={T.green} stroke={2.6} />
                    : <Dot color={color} size={7} pulse={t.status === 'in_progress'} />}
                  <span style={{
                    flex: 1, fontFamily: T.font, fontSize: 13.5, color: T.text, lineHeight: '18px',
                    ...(open ? {} : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
                  }}>{open ? t.title : t.title.replace(/^Fix:\s*/i, '')}</span>
                  <Pill T={T} tone={t.status === 'done' ? 'neutral' : 'accent'} style={{ height: 19, fontSize: 10, padding: '0 7px' }}>
                    {t.difficulty || 'task'}
                  </Pill>
                  <TGIcon name="chevDown" size={14} color={T.hint} stroke={2}
                    {...(open ? {} : {})} />
                </button>

                {open && (
                  <div style={{ padding: '0 14px 13px 39px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {/* meta line */}
                    <div style={{ fontFamily: T.font, fontSize: 12, color: T.hint }}>
                      {[t.phase && `${t.phase} phase`, t.status,
                        (t.claimers_count || 0) > 0 && `${t.claimers_count} agent${t.claimers_count! > 1 ? 's' : ''} on it`,
                        t.depends_on?.length ? `depends on ${t.depends_on.length}` : null,
                      ].filter(Boolean).join(' · ')}
                    </div>

                    {/* full description */}
                    {detail === 'loading' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Spinner color={T.hint} size={13} />
                        <span style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint }}>Loading description…</span>
                      </div>
                    )}
                    {detail && detail !== 'loading' && detail !== 'none' && detail.body_md && (
                      <div style={{
                        fontFamily: T.font, fontSize: 13, color: T.sub, lineHeight: '19px',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 180, overflowY: 'auto',
                      }}>{detail.body_md}</div>
                    )}
                    {(detail === 'none' || (typeof detail === 'object' && !detail.body_md)) && !t.claim_reason && (
                      <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint }}>No further details for this task.</div>
                    )}
                    {t.claim_reason && t.status !== 'done' && (
                      <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.amber, lineHeight: '17px' }}>{t.claim_reason}</div>
                    )}

                    {/* links */}
                    {(() => {
                      const d = detail && detail !== 'loading' && detail !== 'none' ? detail : null;
                      const pr = t.pr_url || d?.pr_url;
                      const issue = t.github_issue_url || d?.github_issue_url;
                      if (!pr && !issue) return null;
                      return (
                        <div style={{ display: 'flex', gap: 8 }}>
                          {pr && <LinkChip T={T} label="View PR" onClick={() => openExternal(pr)} />}
                          {issue && <LinkChip T={T} label="GitHub issue" onClick={() => openExternal(issue)} />}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
          {tasks.length > 4 && (
            <button onClick={() => setShowAllTasks(v => !v)} style={{
              ...btnReset, width: '100%', padding: '10px 14px', borderTop: `0.5px solid ${T.sep}`,
              fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.accent, textAlign: 'center',
            }}>
              {showAllTasks ? 'Show less' : `Show all ${tasks.length} tasks`}
            </button>
          )}
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

      {/* delete — two-step inline confirm; the Telegram bot itself is the
          owner's and must be removed via @BotFather separately */}
      {!confirmDelete ? (
        <button onClick={() => setConfirmDelete(true)} style={{
          ...btnReset, alignSelf: 'center', marginTop: 4, padding: '9px 16px', borderRadius: 999,
          color: T.red, fontFamily: T.font, fontSize: 13.5, fontWeight: 600,
        }}>
          Delete this bot
        </button>
      ) : (
        <Card T={T} pad={14} style={{ border: `1px solid ${T.redSoft}` }}>
          <div style={{ fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: T.text }}>
            Delete {bot.name}?
          </div>
          <div style={{ fontFamily: T.font, fontSize: 13, color: T.sub, lineHeight: '18px', marginTop: 5 }}>
            Removes this project from your AgentBot list.
          </div>
          <div style={{
            display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 10, padding: '9px 11px',
            borderRadius: 10, background: T.dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,22,32,0.04)',
          }}>
            <TGIcon name="shield" size={15} color={T.amber} stroke={1.9} />
            <span style={{ fontFamily: T.font, fontSize: 12.5, color: T.sub, lineHeight: '17px' }}>
              The Telegram bot @{handle} keeps running — to delete it completely, open{' '}
              <span onClick={() => openTgLink('https://t.me/BotFather')} style={{ color: T.accent, fontWeight: 600, cursor: 'pointer' }}>@BotFather</span>
              {' '}and send <span style={{ fontFamily: T.mono }}>/deletebot</span>.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button onClick={() => setConfirmDelete(false)} style={{
              ...btnReset, flex: 1, height: 42, borderRadius: 11,
              background: T.dark ? 'rgba(255,255,255,0.06)' : '#f3f5f8',
              color: T.text, fontFamily: T.font, fontSize: 14, fontWeight: 600,
            }}>
              Cancel
            </button>
            <button onClick={onDelete} style={{
              ...btnReset, flex: 1, height: 42, borderRadius: 11,
              background: T.red, color: '#fff', fontFamily: T.font, fontSize: 14, fontWeight: 600,
            }}>
              Delete
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

function LinkChip({ T, label, onClick }: { T: Theme; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      ...btnReset, display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px',
      borderRadius: 9, background: T.accentSoft, color: T.accent,
      fontFamily: T.font, fontSize: 12.5, fontWeight: 600,
    }}>
      <TGIcon name="open" size={13} color={T.accent} stroke={2} />
      {label}
    </button>
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
