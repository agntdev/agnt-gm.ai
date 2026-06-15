// BotOverview — per-bot overview page (My Bots → bot). Everything real:
// agent-link status, task/PR stats from the project, Test bot via the managed
// bot's @username, Recent Activity from the chat's system events (full feed on
// the "View all" page). "Open chat" opens the owner ↔ build-agent chat; the
// agent card's "Manage" opens the add-an-agent sheet.
import { useEffect, useState, type ReactNode } from 'react';
import { Theme, btnReset, hexA } from '../theme';
import {
  ApiError, Project, TaskItem, ChatMessage, AgentLinkStatus, Deployment, DagInfo, TaskDetail, BotAnalytics, ProjectBot, ProjectSpec,
  getProject, fetchProjectTasks, getProjectBot, getAgentLink, listDeployments, getTaskDetail, getBotAnalytics,
  botIsLive, retryDeploy, setAutoMerge, getProjectSpec,
} from '../api/client';
import { openTgLink, openExternal } from '../telegram';
import { TGIcon, Card, Pill, Dot, BotTile, Spinner } from '../ui';
import { MyBot } from './MyBots';
import { ActivityTimeline, relTime } from './Activity';
import { useBlocked, BlockedBadge } from './TaskManagerInbox';
import { FeedbackComposer } from './FeedbackComposer';

// human-readable count: 3100 → "3.1k", 12000 → "12k"
function human(n?: number): string {
  if (n == null) return '—';
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(n);
}

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

// uppercase section label, reused across sections
function SectionLabel({ T, children, right }: { T: Theme; children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 4px 11px' }}>
      <span style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3 }}>{children}</span>
      {right}
    </div>
  );
}

export function BotOverview({ T, bot, messages, onOpenChat, onOpenBoard, onOpenInbox, onDelete, onViewActivity, onManageAgents, cloudDeployed, paused, onTogglePause }: {
  T: Theme; bot: MyBot; messages: ChatMessage[];
  onOpenChat: () => void; onOpenBoard: () => void; onOpenInbox?: () => void; onDelete: () => void;
  onViewActivity: () => void; onManageAgents: () => void;
  cloudDeployed: boolean; paused: boolean; onTogglePause: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detail, setDetail] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [dag, setDag] = useState<DagInfo | null>(null);
  const [deploys, setDeploys] = useState<Deployment[]>([]);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [botRow, setBotRow] = useState<ProjectBot | null>(null);
  const [link, setLink] = useState<AgentLinkStatus | null>(null);
  const [analytics, setAnalytics] = useState<BotAnalytics | null>(null);
  const [commits7d, setCommits7d] = useState<number | null>(null);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [taskDetails, setTaskDetails] = useState<Record<string, TaskDetail | 'loading' | 'none'>>({});
  const [isTaskManager, setIsTaskManager] = useState(false); // gap #1 — derived from /dag node_kind
  const blocked = useBlocked(bot.id, isTaskManager); // attention badge (owner /blocked)

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
      const [d, t, dep, b, l, an] = await Promise.all([
        getProject(bot.id).catch(() => null),
        fetchProjectTasks(bot.id).catch(() => null),
        listDeployments(bot.id).catch(() => null),
        getProjectBot(bot.id).catch(() => null),
        getAgentLink(bot.id).catch(() => null),
        getBotAnalytics(bot.id).catch(() => null),
      ]);
      if (cancelled) return;
      if (d) setDetail(d.project);
      if (t) { setTasks(t.tasks); setDag(t.dag ?? null); }
      if (dep) setDeploys(dep.deployments || []);
      if (b) { setBotRow(b); if (b.bot_username) setBotUsername(b.bot_username); }
      if (l) setLink(l);
      if (an) setAnalytics(an);
      // route old vs new: build_pipeline (once it ships) else node_kind off the
      // DAG fetchProjectTasks already loaded — no second /dag round-trip.
      if (d?.project.build_pipeline) setIsTaskManager(d.project.build_pipeline === 'task_manager');
      else if (t) setIsTaskManager(t.isTaskManager ?? false);
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
  const allDone = tasks.length > 0 && done >= tasks.length;
  const prodDeploys = deploys.filter(d => d.kind !== 'preview' && !d.failure_reason).length;
  const connected = link?.status === 'connected';
  const agentClient = (link?.connected_client || '').split('/')[0];
  const handle = botUsername || bot.handle;
  const since = detail?.published_at || detail?.created_at;
  const uptime = since ? relTime(since) : null;
  // the real go-live signal (NOT project.status): current_phase==='published'
  // OR the managed bot's container_state. Drives the feedback channel.
  const live = dag?.current_phase === 'published' || detail?.current_phase === 'published' || botIsLive(botRow);

  // real build stats now; the same 3-up card swaps to deployed-bot analytics
  // (active users / today / vs. yest.) once that endpoint lands.
  const stats: { value: string; label: string; tone?: 'green' }[] = analytics ? [
    { value: human(analytics.active_users), label: 'active users' },
    { value: analytics.messages_today != null ? human(analytics.messages_today) : '—', label: 'today' },
    {
      value: analytics.delta_pct != null ? `${analytics.delta_pct > 0 ? '+' : ''}${analytics.delta_pct}%` : '—',
      label: 'vs. yest.', tone: (analytics.delta_pct ?? 0) >= 0 ? 'green' : undefined,
    },
  ] : [
    { value: tasks.length ? `${done}/${tasks.length}` : '—', label: 'Tasks done', tone: allDone ? 'green' : undefined },
    { value: prodDeploys > 0 ? String(prodDeploys) : '—', label: prodDeploys === 1 ? 'Deploy' : 'Deploys' },
    { value: commits7d ? String(commits7d) : '—', label: 'Commits · 7d' },
  ];

  return (
    <div style={{ padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* identity — centered */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '6px 0 0' }}>
        <BotTile T={T} name={bot.name} tone={bot.tone} size={72} radius={22} fontSize={30} />
        <div style={{ fontFamily: T.font, fontSize: 25, fontWeight: 700, color: T.text, letterSpacing: -0.4, marginTop: 4 }}>{bot.name}</div>
        <div style={{ fontFamily: T.mono, fontSize: 14, color: T.accent }}>@{handle}</div>
        <div style={{ marginTop: 3 }}>
          {paused
            ? <Pill T={T} tone="neutral"><Dot color={T.hint} size={6} /> Paused · {bot.version}</Pill>
            : bot.status === 'live'
              ? <Pill T={T} tone="green"><Dot color={T.green} size={6} /> Live{uptime ? ` · up ${uptime}` : ''} · {bot.version}</Pill>
              : <Pill T={T} tone="neutral">{bot.statusLabel}</Pill>}
        </div>
      </div>

      {/* primary action */}
      <button onClick={onOpenChat} style={{
        ...btnReset, width: '100%', height: 54, borderRadius: 15, background: T.accent, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        fontFamily: T.font, fontSize: 17, fontWeight: 600, boxShadow: `0 6px 18px ${hexA(T.accent, 0.32)}`,
      }}>
        <TGIcon name="chat" size={20} color="#fff" stroke={2} /> Open chat
      </button>

      {/* secondary actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, marginTop: -4 }}>
        <button disabled={!botUsername} onClick={() => botUsername && openTgLink(`https://t.me/${botUsername}`)} style={{
          ...btnReset, display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: T.font, fontSize: 15, fontWeight: 600,
          color: botUsername ? T.accent : T.hint, cursor: botUsername ? 'pointer' : 'default',
        }}>
          <TGIcon name="open" size={17} color={botUsername ? T.accent : T.hint} stroke={2} /> Test bot
        </button>
        <button onClick={onTogglePause} style={{
          ...btnReset, display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text,
        }}>
          <TGIcon name={paused ? 'play' : 'pause'} size={16} color={T.sub} stroke={2} /> {paused ? 'Resume' : 'Pause'}
        </button>
      </div>

      {/* task_manager: attention inbox — amber/red badge when something needs the
          owner, else a neutral "all clear" entry point */}
      {isTaskManager && onOpenInbox && (
        blocked.items.length > 0
          ? <BlockedBadge T={T} state={blocked} onClick={onOpenInbox} />
          : (
            <button onClick={onOpenInbox} style={{
              ...btnReset, width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px',
              borderRadius: 14, background: T.cardBg, border: `0.5px solid ${T.sep}`, boxShadow: T.shadow,
            }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: T.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <TGIcon name="check" size={17} color={T.green} stroke={2.2} />
              </div>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: T.text }}>Inbox</div>
                <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, marginTop: 1 }}>Nothing needs you right now</div>
              </div>
              <TGIcon name="chevRight" size={18} color={T.hint} stroke={2} />
            </button>
          )
      )}

      {/* stats — single 3-up card */}
      <Card T={T} pad={0}>
        <div style={{ display: 'flex' }}>
          {stats.map((s, i) => (
            <div key={i} style={{ flex: 1, padding: '16px 8px', textAlign: 'center', borderLeft: i ? `0.5px solid ${T.sep}` : 'none' }}>
              <div style={{ fontFamily: T.font, fontSize: 23, fontWeight: 700, letterSpacing: -0.4, color: s.tone === 'green' ? T.green : T.text }}>{s.value}</div>
              <div style={{ fontFamily: T.font, fontSize: 12, color: T.hint, marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* agent summary → add-an-agent sheet (cloud or local) */}
      <button onClick={onManageAgents} style={{ ...btnReset, width: '100%', textAlign: 'left' }}>
        <Card T={T} pad={0}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TGIcon name={cloudDeployed ? 'cloud' : connected ? 'code' : 'plus'} size={19} color={T.accent} stroke={1.9} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text }}>
                {cloudDeployed ? 'Cloud agent' : connected ? 'Local agent' : 'Add an agent'}
              </div>
              <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                {cloudDeployed
                  ? <><Dot color={T.green} size={6} /> running</>
                  : connected
                    ? <><Dot color={T.green} size={6} /> {agentClient || 'Claude'} · online</>
                    : 'Cloud or local — your choice'}
              </div>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: T.accent }}>
              {cloudDeployed || connected ? 'Manage' : 'Add'} <TGIcon name="chevRight" size={16} color={T.accent} stroke={2} />
            </span>
          </div>
        </Card>
      </button>

      {/* task_manager owner controls: spec doc · auto-merge · retry deploy */}
      {isTaskManager && (
        <TaskManagerControls T={T} projectId={bot.id} repoUrl={repoUrl} live={live}
          autoMergeEnabled={detail?.auto_merge_enabled} hasBot={!!botRow} />
      )}

      {/* tasks — compact: phase stepper + one-line rows, expandable */}
      <div>
        <SectionLabel T={T} right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {tasks.length > 0 && <span style={{ fontFamily: T.font, fontSize: 12, color: T.hint }}>{done}/{tasks.length} done</span>}
            <button onClick={onOpenBoard} style={{ ...btnReset, display: 'inline-flex', alignItems: 'center', gap: 1, fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.accent }}>
              Board <TGIcon name="chevRight" size={15} color={T.accent} stroke={2} />
            </button>
          </div>
        }>Tasks</SectionLabel>
        <Card T={T} pad={0}>
          {dag?.current_phase && <PhaseStrip T={T} dag={dag} />}
          {tasks.length === 0 && (
            <div style={{ padding: 14, fontFamily: T.font, fontSize: 13.5, color: T.hint }}>
              Build starting — your plan and tasks will appear here in a moment.
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
                  <TGIcon name="chevDown" size={14} color={T.hint} stroke={2} />
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

      {/* task_manager: living-DAG feedback — once live, owner requests grow the DAG */}
      {isTaskManager && live && (
        <Card T={T} pad={14}>
          <FeedbackComposer T={T} bot={bot} live={live} onGrown={onOpenBoard} />
        </Card>
      )}

      {/* tests — real when CI results land; honest placeholder until then */}
      <div>
        <SectionLabel T={T}>Tests</SectionLabel>
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

      {/* recent activity — moved to the bottom; timeline preview + view all */}
      <div>
        <SectionLabel T={T} right={
          <button onClick={onViewActivity} style={{ ...btnReset, fontFamily: T.font, fontSize: 13.5, fontWeight: 600, color: T.accent }}>View all</button>
        }>Recent activity</SectionLabel>
        <div style={{ padding: '2px 4px 0' }}>
          <ActivityTimeline T={T} events={activity} clamp />
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

// ── task_manager owner controls (spec · auto-merge · retry deploy) ──
// Only rendered for task_manager bots. Reuses the file's Card/LinkChip/Switch
// + the client helpers; all owner-only POST/PATCH, optimistic with verbatim
// error text (409/503 are actionable — surfaced as-is).
function TaskManagerControls({ T, projectId, repoUrl, live, autoMergeEnabled, hasBot }: {
  T: Theme; projectId: string; repoUrl?: string; live: boolean;
  autoMergeEnabled?: boolean; hasBot: boolean;
}) {
  // Spec doc (gap #2): real endpoint if it exists, else link docs/spec.md in the repo.
  const [spec, setSpec] = useState<ProjectSpec | null | 'loading'>('loading');
  const [specOpen, setSpecOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSpec('loading');
    getProjectSpec(projectId)
      .then(s => { if (!cancelled) setSpec(s); })
      .catch(() => { if (!cancelled) setSpec(null); });
    return () => { cancelled = true; };
  }, [projectId]);
  const specBody = spec && spec !== 'loading' ? (spec.body_md || spec.content || spec.markdown || '') : '';
  const specLink = (spec && spec !== 'loading' && spec.url)
    || (repoUrl ? `${repoUrl.replace(/\/$/, '')}/blob/main/docs/spec.md` : null);

  // Auto-merge (§6.6): seed from the project DTO; optimistic flip, revert on error.
  const [amOn, setAmOn] = useState(autoMergeEnabled ?? true);
  const [amBusy, setAmBusy] = useState(false);
  const [amError, setAmError] = useState<string | null>(null);
  useEffect(() => { if (autoMergeEnabled !== undefined) setAmOn(autoMergeEnabled); }, [autoMergeEnabled]);
  const toggleAutoMerge = async () => {
    if (amBusy) return;
    const next = !amOn;
    setAmOn(next); setAmBusy(true); setAmError(null);
    try { await setAutoMerge(projectId, next); }
    catch (e) { setAmOn(!next); setAmError(e instanceof ApiError ? e.message : 'network error — try again'); }
    finally { setAmBusy(false); }
  };

  // Retry deploy (§6.7): async 202 → optimistic "started" line; 409/503 verbatim.
  // The button stays tappable while pending so a stalled/failed deploy (narrated
  // into chat, never reaching `live`) is always retriable. Cleared once live.
  const [dpBusy, setDpBusy] = useState(false);
  const [dpPending, setDpPending] = useState(false);
  const [dpError, setDpError] = useState<string | null>(null);
  useEffect(() => { if (live) setDpPending(false); }, [live]);
  const onRetryDeploy = async () => {
    if (dpBusy) return;
    setDpBusy(true); setDpError(null);
    try { await retryDeploy(projectId); setDpPending(true); }
    catch (e) {
      setDpPending(false);
      setDpError(e instanceof ApiError ? (e.warning || `${e.message}${e.details ? ` — ${e.details}` : ''}`) : 'network error — try again');
    } finally { setDpBusy(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* spec */}
      <div>
        <SectionLabel T={T} right={specBody && specLink
          ? <button onClick={() => openExternal(specLink)} style={{ ...btnReset, fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.accent }}>Open</button>
          : undefined
        }>Spec</SectionLabel>
        <Card T={T} pad={0}>
          {spec === 'loading' ? (
            <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 9 }}>
              <Spinner color={T.hint} size={14} />
              <span style={{ fontFamily: T.font, fontSize: 13, color: T.hint }}>Loading spec…</span>
            </div>
          ) : specBody ? (
            <div style={{ padding: '12px 14px' }}>
              <div style={{
                fontFamily: T.font, fontSize: 13, color: T.sub, lineHeight: '19px',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: specOpen ? 420 : 96, overflowY: specOpen ? 'auto' : 'hidden',
              }}>{specBody}</div>
              {specBody.length > 220 && (
                <button onClick={() => setSpecOpen(v => !v)} style={{
                  ...btnReset, marginTop: 8, fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.accent,
                }}>{specOpen ? 'Show less' : 'Read more'}</button>
              )}
            </div>
          ) : specLink ? (
            <div style={{ padding: '12px 14px' }}>
              <LinkChip T={T} label="View spec" onClick={() => openExternal(specLink)} />
            </div>
          ) : (
            <div style={{ padding: 14, fontFamily: T.font, fontSize: 13, color: T.hint, lineHeight: '18px' }}>
              The spec appears here once your idea is decomposed.
            </div>
          )}
        </Card>
      </div>

      {/* auto-merge + retry deploy */}
      <Card T={T} pad={0}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: T.text }}>Auto-merge PRs</div>
            <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, marginTop: 1, lineHeight: '16px' }}>
              {amOn ? 'Approved PRs merge automatically.' : 'Approved PRs stay open — merge them on GitHub.'}
            </div>
          </div>
          <Switch T={T} on={amOn} busy={amBusy} onClick={() => void toggleAutoMerge()} />
        </div>
        {amError && (
          <div style={{ padding: '0 14px 11px', fontFamily: T.font, fontSize: 12, color: T.amber, lineHeight: '16px' }}>{amError}</div>
        )}

        {hasBot && (
          <div style={{ borderTop: `0.5px solid ${T.sep}`, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <button onClick={() => void onRetryDeploy()} disabled={dpBusy} style={{
              ...btnReset, width: '100%', height: 42, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: T.accentSoft, color: T.accent, fontFamily: T.font, fontSize: 14, fontWeight: 600,
            }}>
              {dpBusy ? <Spinner color={T.accent} size={15} /> : <TGIcon name="refresh" size={16} color={T.accent} stroke={2} />}
              {live ? 'Redeploy bot' : 'Retry deploy'}
            </button>
            {dpPending && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: T.font, fontSize: 12.5, color: T.accent, lineHeight: '17px' }}>
                <Spinner color={T.accent} size={13} /> Deploy started — watching for it to come online…
              </div>
            )}
            {dpError && (
              <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.red, lineHeight: '17px' }}>{dpError}</div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function Switch({ T, on, onClick, busy }: { T: Theme; on: boolean; onClick: () => void; busy?: boolean }) {
  return (
    <button onClick={busy ? undefined : onClick} aria-pressed={on} style={{
      ...btnReset, width: 46, height: 28, borderRadius: 999, flexShrink: 0, position: 'relative',
      background: on ? T.accent : (T.dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,22,32,0.16)'),
      transition: 'background .2s', opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer',
    }}>
      <span style={{
        position: 'absolute', top: 3, left: on ? 21 : 3, width: 22, height: 22, borderRadius: 999,
        background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left .2s',
      }} />
    </button>
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
