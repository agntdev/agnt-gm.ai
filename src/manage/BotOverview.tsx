// BotOverview — per-bot overview page (My Bots → bot). Everything real:
// agent-link status, task/PR stats from the project, Test bot via the managed
// bot's @username, Recent Activity from the chat's system events (full feed on
// the "View all" page). "Open chat" opens the owner ↔ build-agent chat; the
// agent card's "Manage" opens the add-an-agent sheet.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Theme, btnReset, hexA } from '../theme';
import {
  ApiError, Project, TaskItem, ChatMessage, AgentLinkStatus, Deployment, DagInfo, TaskDetail, BotAnalytics, ProjectBot, BotInitiate, BuildProgress as BuildProgressDTO,
  getProject, fetchProjectTasks, getProjectBot, getAgentLink, listDeployments, getTaskDetail, getBotAnalytics,
  botIsLive, retryDeploy, setAutoMerge, getCloudAgent, initiateBot, postFeedback,
} from '../api/client';
import { openTgLink, openExternal } from '../telegram';
import { TGIcon, Card, Pill, Dot, BotTile, Spinner } from '../ui';
import { MyBot } from './MyBots';
import { ActivityTimeline, relTime, withDeployments } from './Activity';
import { useBlocked, BlockedBadge } from './TaskManagerInbox';

// human-readable count: 3100 → "3.1k", 12000 → "12k"
function human(n?: number): string {
  if (n == null) return '—';
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(n);
}

// hoisted so they aren't rebuilt on each scan iteration (js-hoist-regexp)
const RE_TEST_COUNT = /(\d+)\s*\/\s*(\d+)\s*(?:tests?|cases?|passing)/i;
const RE_COVERAGE = /(\d+)\s*%\s*cov/i;

// latest test results — structured (data.kind=test) or parsed from a system
// message like "38/38 passing · 94% cov"; null until CI results exist.
function latestTests(sys: ChatMessage[]): { passed: number; total: number; coverage?: number } | null {
  for (let i = sys.length - 1; i >= 0; i--) {
    const m = sys[i];
    const d = m.data as { kind?: string; passed?: number; failed?: number; coverage_pct?: number } | undefined;
    if (d?.kind === 'test' && typeof d.passed === 'number') {
      return { passed: d.passed, total: d.passed + (d.failed || 0), coverage: d.coverage_pct };
    }
    const t = RE_TEST_COUNT.exec(m.content);
    if (t) {
      const cov = RE_COVERAGE.exec(m.content);
      return { passed: +t[1], total: +t[2], coverage: cov ? +cov[1] : undefined };
    }
  }
  return null;
}

const TASK_DOT: Record<string, 'green' | 'accent' | 'hint'> = {
  done: 'green', in_progress: 'accent', in_review: 'accent', blocked: 'accent', failed: 'hint', open: 'hint',
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

type ProgressState = 'done' | 'active' | 'todo' | 'failed';
type ProgressStep = { label: string; state: ProgressState };

function BuildProgress({ T, steps }: { T: Theme; steps: ProgressStep[] }) {
  const colorFor = (state: ProgressState) =>
    state === 'done' ? T.green : state === 'failed' ? T.red : state === 'active' ? T.accent : T.hint;
  return (
    <Card T={T} pad={13}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, gap: 8 }}>
        {steps.map((s, i) => {
          const color = colorFor(s.state);
          return (
            <div key={s.label} style={{ minWidth: 0 }}>
              <div style={{
                height: 4, borderRadius: 999,
                background: s.state === 'todo' ? (T.dark ? 'rgba(255,255,255,0.1)' : 'rgba(15,22,32,0.08)') : color,
                opacity: s.state === 'done' ? 0.72 : 1,
              }} />
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                {s.state === 'done'
                  ? <TGIcon name="check" size={13} color={T.green} stroke={2.7} />
                  : <Dot color={color} size={6} pulse={s.state === 'active'} />}
                <span style={{
                  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontFamily: T.font, fontSize: 11.5, fontWeight: i === 0 || s.state !== 'todo' ? 600 : 500,
                  color: s.state === 'todo' ? T.hint : color,
                }}>{s.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// whole_bot 4-step mapping for the top stepper (blueprint→Plan, building→Build,
// tests→Test, published→Live).
function wholeBotSteps(bp: BuildProgressDTO | null, live: boolean): ProgressStep[] {
  const ph = bp?.phase || (live ? 'published' : 'building');
  const failed = ph === 'failed';
  const done = live || ph === 'published';
  return [
    { label: 'Plan', state: 'done' },
    { label: 'Build', state: failed ? 'failed' : done || ph === 'tests' ? 'done' : 'active' },
    { label: 'Test', state: ph === 'tests' ? 'active' : done ? 'done' : 'todo' },
    { label: 'Live', state: done ? 'done' : failed ? 'failed' : 'todo' },
  ];
}

// approximate "~N min" from seconds (≈ — the pass count is variable).
function fmtEta(sec: number): string {
  if (!sec || sec <= 0) return '';
  const m = Math.round(sec / 60);
  if (m < 1) return '<1 min';
  if (m < 60) return `~${m} min`;
  return `~${Math.floor(m / 60)}h ${m % 60}m`;
}

const PASS_TONE: Record<string, 'green' | 'accent' | 'hint' | 'red'> = {
  building: 'accent', merged: 'accent', reviewed: 'green', failed: 'red',
};

// whole_bot build card: stage label + approx ETA + progress bar + per-pass
// timeline — the build screen's centerpiece while a whole_bot bot builds.
function WholeBotBuildCard({ T, bp }: { T: Theme; bp: BuildProgressDTO }) {
  const eta = fmtEta(bp.eta_seconds);
  const pct = Math.max(3, Math.min(100, bp.percent));
  return (
    <Card T={T} pad={0}>
      <div style={{ padding: '14px 16px 13px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontFamily: T.font, fontSize: 14.5, fontWeight: 650, color: T.text, lineHeight: '19px' }}>{bp.stage_label}</span>
          {eta && <span style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, whiteSpace: 'nowrap' }}>{eta} left</span>}
        </div>
        <div style={{ marginTop: 11, height: 7, borderRadius: 999, background: T.dark ? 'rgba(255,255,255,0.1)' : 'rgba(15,22,32,0.08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: bp.stage === 'failed' ? T.red : T.accent, transition: 'width .5s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7 }}>
          <span style={{ fontFamily: T.font, fontSize: 12, color: T.hint }}>≈ {bp.percent}%</span>
          {bp.pass_current > 0 && (
            <span style={{ fontFamily: T.font, fontSize: 12, color: T.hint }}>
              {bp.merged_passes >= bp.pass_floor
                ? `${bp.merged_passes} pass${bp.merged_passes === 1 ? '' : 'es'} accepted`
                : `${bp.merged_passes} of ${bp.pass_floor} passes`}
            </span>
          )}
        </div>
      </div>
      {(bp.passes?.length ?? 0) > 0 && (
        <div style={{ borderTop: `0.5px solid ${T.sep}` }}>
          {(bp.passes ?? []).map((p, i) => {
            const tone = PASS_TONE[p.status] || 'hint';
            const color = tone === 'green' ? T.green : tone === 'red' ? T.red : tone === 'accent' ? T.accent : T.hint;
            return (
              <div key={p.pass_no} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderTop: i ? `0.5px solid ${T.sep}` : 'none' }}>
                {p.status === 'reviewed' && p.complete
                  ? <TGIcon name="check" size={14} color={T.green} stroke={2.6} />
                  : <Dot color={color} size={7} pulse={p.status === 'building'} />}
                <span style={{ flex: 1, fontFamily: T.font, fontSize: 13, color: T.text }}>Pass {p.pass_no}</span>
                <span style={{ fontFamily: T.font, fontSize: 12, color: T.hint }}>{p.label}</span>
                {p.pr_number != null && <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.accent }}>#{p.pr_number}</span>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function deployFailed(d?: Deployment | null): boolean {
  if (!d) return false;
  return !!d.failure_reason || /fail|error|cancel/i.test(d.status || '');
}

function deployActive(d?: Deployment | null): boolean {
  if (!d) return false;
  return /queue|pending|build|deploy|progress|running|started/i.test(d.status || '');
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

// Last overview snapshot per bot. Re-opening a bot paints instantly from this
// cache, then the tick refreshes it — instead of six cold fetches every visit.
interface OvSnap {
  detail: Project | null; tasks: TaskItem[]; dag: DagInfo | null; deploys: Deployment[];
  botRow: ProjectBot | null; botUsername: string | null; link: AgentLinkStatus | null;
  analytics: BotAnalytics | null; isTaskManager: boolean;
}
const OV_CACHE = new Map<string, OvSnap>();

export function BotOverview({ T, bot, messages, onOpenChat, onOpenBoard, onOpenInbox, onDelete, onViewActivity, onManageAgents, onCloudDetected, onCloudGone, cloudDeployed, paused, onTogglePause, discoverable, onToggleDiscoverable }: {
  T: Theme; bot: MyBot; messages: ChatMessage[];
  onOpenChat: () => void; onOpenBoard: () => void; onOpenInbox?: () => void; onDelete: () => void;
  onViewActivity: () => void; onManageAgents: () => void;
  onCloudDetected?: () => void; // API revealed a cloud agent this client hadn't recorded
  onCloudGone?: () => void;     // API says no cloud agent — clear a stale local mark
  cloudDeployed: boolean; paused: boolean; onTogglePause: () => void;
  discoverable: boolean; onToggleDiscoverable: () => void;
}) {
  const seed = OV_CACHE.get(bot.id); // instant re-open from the last snapshot
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detail, setDetail] = useState<Project | null>(seed?.detail ?? null);
  const [tasks, setTasks] = useState<TaskItem[]>(seed?.tasks ?? []);
  const [dag, setDag] = useState<DagInfo | null>(seed?.dag ?? null);
  const [deploys, setDeploys] = useState<Deployment[]>(seed?.deploys ?? []);
  const [botUsername, setBotUsername] = useState<string | null>(seed?.botUsername ?? null);
  const [botRow, setBotRow] = useState<ProjectBot | null>(seed?.botRow ?? null);
  const [link, setLink] = useState<AgentLinkStatus | null>(seed?.link ?? null);
  const [analytics, setAnalytics] = useState<BotAnalytics | null>(seed?.analytics ?? null);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [taskDetails, setTaskDetails] = useState<Record<string, TaskDetail | 'loading' | 'none'>>({});
  const [isTaskManager, setIsTaskManager] = useState(seed?.isTaskManager ?? bot.isTaskManager ?? false); // verdict from cache → bot prop → /dag node_kind
  const blocked = useBlocked(bot.id, isTaskManager); // attention badge (owner /blocked)
  const [cloudApi, setCloudApi] = useState<boolean | null>(null); // GET /cloud-agent → deployed?
  const cloudNotified = useRef(false);
  const [creatingBot, setCreatingBot] = useState(false);
  const [botInit, setBotInit] = useState<BotInitiate | null>(null); // deep link issued, waiting for Telegram
  const [createBotErr, setCreateBotErr] = useState<string | null>(null);
  const [addingTask, setAddingTask] = useState(false); // "Add new task" input open
  const [taskDraft, setTaskDraft] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const addTaskRef = useRef<HTMLTextAreaElement>(null);

  // grow the add-task input to fit the text (descriptions can be long), up to a
  // cap, then scroll within it
  useEffect(() => {
    const el = addTaskRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(200, Math.max(38, el.scrollHeight)) + 'px';
  }, [taskDraft, addingTask]);

  // add a task: the owner's path into the living DAG is feedback (POST /feedback),
  // which the analyzer turns into task(s). The new task shows on the next poll.
  const submitNewTask = async () => {
    const text = taskDraft.trim();
    if (!text || addBusy) return;
    setAddBusy(true); setAddErr(null);
    try {
      await postFeedback(bot.id, text);
      setTaskDraft(''); setAddingTask(false);
      // nudge a refresh shortly after so the new task appears promptly
      setTimeout(() => {
        void fetchProjectTasks(bot.id).then(t => { setTasks(t.tasks); setDag(t.dag ?? null); }).catch(() => {});
      }, 3000);
    } catch (e) {
      setAddErr(e instanceof ApiError ? (e.status === 429 ? 'Too many requests — try again shortly.' : e.message) : 'network error — try again');
    } finally { setAddBusy(false); }
  };

  // tap a task → expand with the full title + body fetched from the API
  const toggleTask = (slug: string) => {
    setExpandedTask(prev => (prev === slug ? null : slug));
    if (!taskDetails[slug]) {
      setTaskDetails(prev => ({ ...prev, [slug]: 'loading' }));
      getTaskDetail(bot.id, slug).then(d =>
        setTaskDetails(prev => ({ ...prev, [slug]: d ?? 'none' })));
    }
  };

  // provision the managed Telegram bot (the step the task_manager flow used to
  // reach via the spec wizard) — reserve a username + open the manager-bot deep
  // link; the poll below picks the bot up once it's created in Telegram.
  const createBot = async () => {
    if (creatingBot || botUsername) return;
    setCreatingBot(true); setCreateBotErr(null);
    try {
      const init = await initiateBot(bot.id);
      setBotInit(init);
      if (init.deep_link) openTgLink(init.deep_link);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setBotInit({}); // already exists — just poll
      else setCreateBotErr(e instanceof ApiError ? `Couldn't start — ${e.message}` : 'network error — try again');
    } finally { setCreatingBot(false); }
  };

  // after initiate, poll quickly until the managed-bot poller lands the row
  useEffect(() => {
    if (!botInit || botUsername) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const b = await getProjectBot(bot.id).catch(() => null);
      if (cancelled) return;
      if (b?.bot_username) { setBotRow(b); setBotUsername(b.bot_username); return; }
      timer = setTimeout(tick, 5000);
    };
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [botInit, botUsername, bot.id]);

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
      // upgrade-only: don't flip a known task_manager verdict back to false off an
      // empty DAG mid-decompose (which would nuke the create-bot CTA + loader).
      if (d?.project.build_pipeline) setIsTaskManager(d.project.build_pipeline === 'task_manager');
      else if (t?.isTaskManager) setIsTaskManager(true);
      // refresh the snapshot cache (keep prior values where a fetch failed)
      const prev = OV_CACHE.get(bot.id);
      OV_CACHE.set(bot.id, {
        detail: d?.project ?? prev?.detail ?? null,
        tasks: t?.tasks ?? prev?.tasks ?? [],
        dag: t?.dag ?? prev?.dag ?? null,
        deploys: dep?.deployments ?? prev?.deploys ?? [],
        botRow: b ?? prev?.botRow ?? null,
        botUsername: b?.bot_username ?? prev?.botUsername ?? null,
        link: l ?? prev?.link ?? null,
        analytics: an ?? prev?.analytics ?? null,
        isTaskManager: d?.project.build_pipeline ? d.project.build_pipeline === 'task_manager' : (t?.isTaskManager || prev?.isTaskManager || bot.isTaskManager || false),
      });
      // while a task_manager bot is still decomposing (no tasks) or its managed
      // bot hasn't landed, poll quickly so the overview fills in fast; relax once settled
      const tmHint = bot.isTaskManager === true || t?.isTaskManager === true || isTaskManager;
      const settling = tmHint && ((t?.tasks?.length ?? 0) === 0 || !b?.bot_username);
      timer = setTimeout(tick, settling ? 6000 : 20000);
    };
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [bot.id]);

  // cloud-agent status from the API — the source of truth for "is a cloud agent
  // running", so a server-side deploy (or one made on another device) reflects
  // even if this client never recorded it locally. Re-fetched whenever a deploy
  // is recorded (e.g. right after paying) so the verdict catches up instead of
  // lagging until the page is reloaded. Reset to null first so a stale 'false'
  // can't trip onCloudGone (below) and wipe the fresh deploy before we re-confirm.
  useEffect(() => {
    let cancelled = false;
    setCloudApi(null);
    void getCloudAgent(bot.id)
      .then(c => { if (!cancelled) setCloudApi(c?.deployed ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [bot.id, cloudDeployed]);

  // sync the app/local cloud state to the API verdict: a real deployed agent
  // (cloudApi true) records it once; the API saying NO agent (false) clears a
  // stale local mark. build_mode is intentionally NOT a trigger.
  useEffect(() => {
    if (cloudApi === true && !cloudNotified.current && !cloudDeployed) {
      cloudNotified.current = true;
      onCloudDetected?.();
    } else if (cloudApi === false && cloudDeployed) {
      onCloudGone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudApi, cloudDeployed]);

  const repoUrl = detail?.github_repo_url;
  // the bot's blueprint (build brief) lives in the repo; the "Spec" action links it
  const blueprintUrl = repoUrl ? `${repoUrl.replace(/\/$/, '')}/blob/main/docs/blueprint.md` : null;

  const sys = messages.filter(m => m.role === 'system');
  const activity = [...withDeployments(sys, deploys)].reverse().slice(0, 4);
  // count only real work tasks (exclude epics = display-only containers, and
  // cancelled) so the overview total matches the board. Phase projects: count all.
  const countable = isTaskManager ? tasks.filter(t => t.node_kind !== 'epic' && t.status !== 'cancelled') : tasks;
  const done = countable.filter(t => t.status === 'done').length;
  const total = countable.length;
  const allDone = total > 0 && done >= total;
  const prodDeploys = deploys.filter(d => d.kind !== 'preview' && !d.failure_reason).length;
  const latestDeploy = deploys[0] ?? null;
  const latestDeployFailed = deployFailed(latestDeploy);
  const latestDeployActive = deployActive(latestDeploy);
  const connected = link?.status === 'connected';
  // Show "Cloud agent" when the API confirms a deployed agent (GET /cloud-agent
  // → deployed:true) OR this client just recorded a payment-confirmed deploy
  // (cloudDeployed). The optimistic flag avoids the lag where the card stayed on
  // "no agent" until refresh; the re-fetch above reconciles it to the API verdict.
  // (build_mode is still NOT a trigger — that produced a fake "running" agent.)
  const cloudActive = cloudApi === true || cloudDeployed;
  const agentClient = (link?.connected_client || '').split('/')[0];
  const handle = botUsername || bot.handle;
  const since = detail?.published_at || detail?.created_at;
  const uptime = since ? relTime(since) : null;
  // the real go-live signal (NOT project.status): current_phase==='published'
  // OR the managed bot's container_state. Drives the feedback channel.
  const live = dag?.current_phase === 'published' || detail?.current_phase === 'published' || botIsLive(botRow);
  // whole_bot N-pass build: no tasks/DAG — the build screen shows a stage/%/ETA
  // card + pass timeline (from project.build_progress) instead of the task list.
  const wholeBot = detail?.build_pipeline === 'whole_bot' || !!detail?.build_progress;
  const bp = detail?.build_progress ?? null;
  // whole_bot build that failed to converge — must override the stale "Live"
  // label inherited from the My Bots list (which keys off project.status and
  // can't see build_progress, a detail-only field).
  const buildFailed = bp?.phase === 'failed' || bp?.stage === 'failed';
  const wholeBotBuilding = wholeBot && !live;
  // a whole_bot build/redeploy is actively in flight — the initial build, or a
  // rebuild on a still-live bot (bp.phase building/tests). The backend rejects a
  // new change until it's live again, so the "Ask for change" CTA is paused while
  // this is true rather than letting the tap fail in chat.
  const buildRunning = wholeBot && (wholeBotBuilding || bp?.phase === 'building' || bp?.phase === 'tests');
  const pausedEffective = paused || !!botRow?.paused;
  const needsBot = isTaskManager && !botUsername;          // managed bot not provisioned yet
  // non-task_manager bot with no Telegram bot connected yet and not live — suggest
  // wiring it up. `!!detail` gates the flash before the first poll lands; task_manager
  // bots keep their own (stronger) "Create your bot" card above instead.
  const suggestConnect = !isTaskManager && !!detail && !live && !botUsername;
  const decomposing = isTaskManager && tasks.length === 0; // DAG still being built
  const testResult = latestTests(sys);
  const testsFailed = !!testResult && testResult.passed < testResult.total;
  const hasUsageAnalytics = !!analytics && (
    typeof analytics.active_users === 'number'
    || typeof analytics.messages_today === 'number'
    || typeof analytics.delta_pct === 'number'
  );
  const statusState = (() => {
    if (pausedEffective) return { label: `Paused · ${bot.version}`, tone: 'neutral' as const, color: T.hint, pulse: false };
    if (live) return { label: `Live${uptime ? ` · up ${uptime}` : ''} · ${bot.version}`, tone: 'green' as const, color: T.green, pulse: false };
    if (needsBot) return { label: 'Create bot to continue', tone: 'accent' as const, color: T.accent, pulse: true };
    if (latestDeployFailed || testsFailed || buildFailed) return { label: 'Needs a fix', tone: 'neutral' as const, color: T.red, pulse: false };
    if (blocked.items.length > 0) return { label: 'Needs you', tone: 'accent' as const, color: T.accent, pulse: true };
    if (latestDeployActive) return { label: 'Deploying', tone: 'accent' as const, color: T.accent, pulse: true };
    if (allDone && botUsername) return { label: 'Testing & deploy', tone: 'accent' as const, color: T.accent, pulse: true };
    if (decomposing) return { label: 'Planning build', tone: 'accent' as const, color: T.accent, pulse: true };
    return { label: bot.statusLabel || 'Building', tone: 'accent' as const, color: T.accent, pulse: true };
  })();
  const progressSteps: ProgressStep[] = wholeBot ? wholeBotSteps(bp, live) : [
    { label: 'Plan', state: total > 0 || !decomposing ? 'done' : 'active' },
    { label: 'Build', state: latestDeployFailed ? 'failed' : allDone ? 'done' : (total > 0 || decomposing ? 'active' : 'todo') },
    { label: 'Test', state: testsFailed ? 'failed' : testResult ? 'done' : allDone ? 'active' : 'todo' },
    { label: 'Live', state: live ? 'done' : latestDeployFailed ? 'failed' : latestDeployActive ? 'active' : 'todo' },
  ];

  // Deployed-bot analytics (active users / today / vs. yest.) sit on top only
  // when those usage fields exist; build stats stay visible either way.
  // Both render in one compact 3-up grid — 1 row when there's no analytics yet,
  // 2 rows once it does.
  type Stat = { value: string; label: string; tone?: 'green' };
  const buildStats: Stat[] = [
    wholeBot
      ? { value: bp ? (bp.merged_passes >= bp.pass_floor ? String(bp.merged_passes) : `${bp.merged_passes}/${bp.pass_floor}`) : '—', label: 'Passes', tone: bp && bp.merged_passes >= bp.pass_floor ? 'green' : undefined }
      : { value: total ? `${done}/${total}` : '—', label: 'Tasks done', tone: allDone ? 'green' : undefined },
    { value: prodDeploys > 0 ? String(prodDeploys) : '—', label: prodDeploys === 1 ? 'Deploy' : 'Deploys' },
    {
      value: latestDeploy?.deployed_at ? relTime(latestDeploy.deployed_at) : latestDeploy?.status || '—',
      label: latestDeployFailed ? 'Deploy failed' : 'Last deploy',
    },
  ];
  const analyticsStats: Stat[] = hasUsageAnalytics ? [
    { value: human(analytics?.active_users), label: 'active users' },
    { value: analytics?.messages_today != null ? human(analytics.messages_today) : '—', label: 'today' },
    {
      value: analytics?.delta_pct != null ? `${analytics.delta_pct > 0 ? '+' : ''}${analytics.delta_pct}%` : '—',
      label: 'vs. yest.', tone: (analytics?.delta_pct ?? 0) >= 0 ? 'green' : undefined,
    },
  ] : [];
  const stats: Stat[] = [...analyticsStats, ...buildStats];

  return (
    <div style={{ padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* identity — centered */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '6px 0 0' }}>
        <BotTile T={T} name={bot.name} tone={bot.tone} size={72} radius={22} fontSize={30} />
        <div style={{ fontFamily: T.font, fontSize: 25, fontWeight: 700, color: T.text, letterSpacing: -0.4, marginTop: 4 }}>{bot.name}</div>
        <div style={{ fontFamily: T.mono, fontSize: 14, color: T.accent }}>@{handle}</div>
        <div style={{ marginTop: 3 }}>
          <Pill T={T} tone={statusState.tone}>
            <Dot color={statusState.color} size={6} pulse={statusState.pulse} /> {statusState.label}
          </Pill>
        </div>

        {/* Show on Discovery — owner opt-out of the public Discover feed */}
        {live && botUsername && (
          <div style={{
            marginTop: 5,
            height: 34,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 8px 0 11px',
            borderRadius: 999,
            background: T.dark ? 'rgba(255,255,255,0.045)' : 'rgba(15,22,32,0.035)',
            border: `0.5px solid ${T.sep}`,
          }}>
            <TGIcon name="compass" size={14} color={discoverable ? T.accent : T.hint} stroke={2} />
            <span style={{ fontFamily: T.font, fontSize: 12.5, fontWeight: 650, color: T.sub }}>Discovery</span>
            <span style={{ fontFamily: T.font, fontSize: 12, fontWeight: 600, color: discoverable ? T.accent : T.hint }}>
              {discoverable ? 'Visible' : 'Hidden'}
            </span>
            <Switch T={T} on={discoverable} onClick={onToggleDiscoverable} size="compact" />
          </div>
        )}
      </div>

      {/* task_manager: create the managed Telegram bot (the step that used to live
          in the spec wizard) — shown until the bot is provisioned, so the owner
          can set it up while the DAG decomposes in the background */}
      {needsBot && (
        <Card T={T} pad={0} style={{ border: `1px solid ${T.accentBorder}` }}>
          {botInit ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px' }}>
              <Spinner color={T.accent} size={18} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: T.text }}>Finishing in Telegram…</div>
                <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, marginTop: 1, lineHeight: '16px' }}>Create the bot in the window that opened — it'll appear here once it's set up.</div>
              </div>
            </div>
          ) : (
            <button onClick={() => void createBot()} style={{ ...btnReset, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px' }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {creatingBot ? <Spinner color={T.accent} size={18} /> : <TGIcon name="send" size={19} color={T.accent} stroke={1.9} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text }}>Create your bot</div>
                <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, marginTop: 1 }}>Set up the Telegram bot while your tasks build</div>
              </div>
              <TGIcon name="chevRight" size={16} color={T.accent} stroke={2} />
            </button>
          )}
          {createBotErr && (
            <div style={{ padding: '0 16px 12px', fontFamily: T.font, fontSize: 12.5, color: T.amber, lineHeight: '17px' }}>{createBotErr}</div>
          )}
        </Card>
      )}

      {/* non-task_manager bot with no Telegram bot connected yet — suggest hooking
          it up so it can go live. Same managed-bot provisioning flow as the
          task_manager card above (POST /bot/initiate → manager-bot deep link).
          Gated on `detail` so it can't flash before we know the live state, and on
          `!live` so a published/serving bot never sees it. */}
      {suggestConnect && (
        <Card T={T} pad={0} style={{ border: `1px solid ${T.accentBorder}` }}>
          {botInit ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px' }}>
              <Spinner color={T.accent} size={18} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: T.text }}>Finishing in Telegram…</div>
                <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, marginTop: 1, lineHeight: '16px' }}>Create the bot in the window that opened — it'll appear here once it's set up.</div>
              </div>
            </div>
          ) : (
            <button onClick={() => void createBot()} style={{ ...btnReset, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px' }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {creatingBot ? <Spinner color={T.accent} size={18} /> : <TGIcon name="send" size={19} color={T.accent} stroke={1.9} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text }}>Connect your bot</div>
                <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, marginTop: 1 }}>Set it up on Telegram so it can go live</div>
              </div>
              <TGIcon name="chevRight" size={16} color={T.accent} stroke={2} />
            </button>
          )}
          {createBotErr && (
            <div style={{ padding: '0 16px 12px', fontFamily: T.font, fontSize: 12.5, color: T.amber, lineHeight: '17px' }}>{createBotErr}</div>
          )}
        </Card>
      )}

      {/* primary action — the Lovable-style feedback loop. While a build is in
          flight the change CTA is paused (the backend rejects changes mid-build);
          it returns the moment the bot is live again. */}
      {buildRunning ? (
        <div style={{
          width: '100%', minHeight: 54, borderRadius: 15, padding: '0 16px',
          background: T.dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,22,32,0.04)',
          border: `1px solid ${T.sep}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          fontFamily: T.font, fontSize: 15.5, fontWeight: 600, color: T.sub, textAlign: 'center', lineHeight: '20px',
        }}>
          <Spinner color={T.hint} size={17} /> Building — you can ask for changes once it’s live
        </div>
      ) : (() => {
        const label = live ? 'Ask for change' : latestDeployFailed || testsFailed || buildFailed ? 'Fix with agent' : 'Message agent';
        return (
        <button onClick={onOpenChat} style={{
          ...btnReset, width: '100%', height: 54, borderRadius: 15, background: T.accent, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          fontFamily: T.font, fontSize: 17, fontWeight: 600, boxShadow: `0 6px 18px ${hexA(T.accent, 0.32)}`,
        }}>
          <TGIcon name="chat" size={20} color="#fff" stroke={2} /> {label}
        </button>
        );
      })()}

      {/* secondary actions — Test bot · Spec · Code */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '8px 28px', marginTop: -4 }}>
        {(() => {
          const canTest = !!botUsername && live && !pausedEffective;
          return (
        <button disabled={!canTest} onClick={() => canTest && openTgLink(`https://t.me/${botUsername}`)} style={{
          ...btnReset, display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: T.font, fontSize: 15, fontWeight: 600,
          color: canTest ? T.accent : T.hint, cursor: canTest ? 'pointer' : 'default',
        }}>
          <TGIcon name="open" size={17} color={canTest ? T.accent : T.hint} stroke={2} /> Test bot
        </button>
          );
        })()}
        {blueprintUrl && (
          <button onClick={() => openExternal(blueprintUrl)} style={{
            ...btnReset, display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.accent,
          }}>
            <TGIcon name="link" size={17} color={T.accent} stroke={2} /> Spec
          </button>
        )}
        {repoUrl && (
          <button onClick={() => openExternal(repoUrl)} style={{
            ...btnReset, display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.accent,
          }}>
            <TGIcon name="code" size={17} color={T.accent} stroke={2} /> Code
          </button>
        )}
      </div>

      {/* task_manager: attention inbox — amber/red badge when something needs the
          owner, else a neutral "all clear" entry point */}
      {isTaskManager && onOpenInbox && (
        blocked.items.length > 0
          ? <BlockedBadge T={T} state={blocked} onClick={onOpenInbox} />
          : (
            <button onClick={onOpenInbox} style={{
              ...btnReset, width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              borderRadius: 13, background: T.cardBg, border: `0.5px solid ${T.sep}`, boxShadow: T.shadow,
            }}>
              <div style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: T.dark ? 'rgba(255,255,255,0.055)' : 'rgba(15,22,32,0.045)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <TGIcon name="check" size={15} color={T.green} stroke={2.2} />
              </div>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 650, color: T.text }}>Inbox clear</div>
                <div style={{ fontFamily: T.font, fontSize: 12.2, color: T.hint, marginTop: 1 }}>No questions or failed tasks</div>
              </div>
              <TGIcon name="chevRight" size={16} color={T.hint} stroke={2} />
            </button>
          )
      )}

      <div>
        <SectionLabel T={T}>Build progress</SectionLabel>
        <BuildProgress T={T} steps={progressSteps} />
        {buildRunning && bp && (
          <div style={{ marginTop: 10 }}>
            <WholeBotBuildCard T={T} bp={bp} />
          </div>
        )}
      </div>

      {/* shipping a change lives in the chat (the "Ask for change" button above),
          same as task_manager bots — no separate composer here. A live chat
          message routes to the build/feedback flow and the bot rebuilds. */}

      {/* stats — compact 3-up grid; wraps to a 2nd row when analytics is live.
          Hidden while a whole_bot is building (the build card above carries the
          live status), shown once it's live (analytics + deploy stats). */}
      {!wholeBotBuilding && (
      <Card T={T} pad={0}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {stats.map((s, i) => (
            <div key={i} style={{
              padding: '11px 8px', textAlign: 'center',
              borderLeft: i % 3 ? `0.5px solid ${T.sep}` : 'none',
              borderTop: i >= 3 ? `0.5px solid ${T.sep}` : 'none',
            }}>
              <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, letterSpacing: -0.4, color: s.tone === 'green' ? T.green : T.text }}>{s.value}</div>
              <div style={{ fontFamily: T.font, fontSize: 11, color: T.hint, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </Card>
      )}

      {/* assigned builder agent summary → add-an-agent sheet (cloud or local) */}
      <div>
        <SectionLabel T={T}>Builder</SectionLabel>
        <button onClick={onManageAgents} style={{ ...btnReset, width: '100%', textAlign: 'left' }}>
          <Card T={T} pad={0}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TGIcon name={cloudActive ? 'cloud' : connected ? 'code' : 'plus'} size={19} color={T.accent} stroke={1.9} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text }}>
                  {cloudActive ? 'Cloud agent' : connected ? 'Local agent' : 'Builder agents'}
                </div>
                <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {cloudActive
                    ? <><Dot color={T.green} size={6} /> running</>
                    : connected
                      ? <><Dot color={T.green} size={6} /> {agentClient || 'Claude'} · online</>
                      : 'Optional cloud/local builder controls'}
                </div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: T.accent }}>
                Manage <TGIcon name="chevRight" size={16} color={T.accent} stroke={2} />
              </span>
            </div>
          </Card>
        </button>
      </div>

      {/* blueprint is reachable via the "Spec" action under the message button */}

      {/* task_manager: owner-safe retry deploy control. */}
      {isTaskManager && (
        <TaskManagerControls T={T} projectId={bot.id} live={live}
          autoMergeEnabled={detail?.auto_merge_enabled} hasBot={!!botRow} specOnly />
      )}

      {/* tasks — compact: phase stepper + one-line rows, expandable.
          Hidden for whole_bot (no tasks — the build card above shows progress). */}
      {!wholeBot && (
      <div>
        <SectionLabel T={T} right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {total > 0 && <span style={{ fontFamily: T.font, fontSize: 12, color: T.hint }}>{done}/{total} done</span>}
            <button onClick={onOpenBoard} style={{ ...btnReset, display: 'inline-flex', alignItems: 'center', gap: 1, fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.accent }}>
              Board <TGIcon name="chevRight" size={15} color={T.accent} stroke={2} />
            </button>
          </div>
        }>Tasks</SectionLabel>
        <Card T={T} pad={0}>
          {/* phases are a phase-pipeline concept — task_manager is epics + tasks, no phase strip */}
          {dag?.current_phase && !isTaskManager && <PhaseStrip T={T} dag={dag} />}
          {tasks.length === 0 && (
            decomposing ? (
              <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Spinner color={T.accent} size={15} />
                <span style={{ fontFamily: T.font, fontSize: 13.5, color: T.sub, lineHeight: '18px' }}>
                  Decomposing your idea into tasks — this can take a minute. They'll stream in here as they're built.
                </span>
              </div>
            ) : (
              <div style={{ padding: 14, fontFamily: T.font, fontSize: 13.5, color: T.hint }}>
                Build starting — your plan and tasks will appear here in a moment.
              </div>
            )
          )}
          {orderTasks(tasks).slice(0, showAllTasks ? undefined : 4).map((t, i) => {
            const tone = TASK_DOT[t.status] || 'hint';
            const color = tone === 'green' ? T.green : tone === 'accent' ? T.accent : T.hint;
            const slug = t.slug || t.id;
            const open = expandedTask === slug;
            const detail = taskDetails[slug];
            return (
              <div key={slug} style={{ borderTop: i || (dag?.current_phase && !isTaskManager) ? `0.5px solid ${T.sep}` : 'none' }}>
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
                    {t.node_kind || t.difficulty || 'task'}
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
          {isTaskManager ? (
            addingTask ? (
              <div style={{ borderTop: `0.5px solid ${T.sep}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <textarea ref={addTaskRef} autoFocus value={taskDraft} onChange={e => setTaskDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submitNewTask(); } }}
                    placeholder="Describe a task to add…" rows={1}
                    style={{ flex: 1, resize: 'none', maxHeight: 200, minHeight: 38, overflowY: 'auto', padding: '9px 12px', borderRadius: 12, background: T.inputBg, border: `0.5px solid ${T.sep}`, color: T.text, fontFamily: T.font, fontSize: 14, lineHeight: '19px', outline: 'none', boxSizing: 'border-box' }} />
                  <button onClick={() => void submitNewTask()} style={{ ...btnReset, width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: taskDraft.trim() && !addBusy ? T.accent : (T.dark ? '#243140' : '#dfe4ea') }}>
                    {addBusy ? <Spinner color="#fff" size={16} /> : <TGIcon name="send" size={17} color={taskDraft.trim() ? '#fff' : T.hint} stroke={2} />}
                  </button>
                </div>
                {addErr && <span style={{ fontFamily: T.font, fontSize: 12, color: T.amber, lineHeight: '16px' }}>{addErr}</span>}
                <button onClick={() => { setAddingTask(false); setTaskDraft(''); setAddErr(null); }} style={{ ...btnReset, alignSelf: 'flex-start', fontFamily: T.font, fontSize: 12.5, fontWeight: 600, color: T.hint }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setAddingTask(true)} style={{
                ...btnReset, width: '100%', padding: '10px 14px', borderTop: `0.5px solid ${T.sep}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.accent,
              }}>
                <TGIcon name="plus" size={15} color={T.accent} stroke={2.2} /> Add new task
              </button>
            )
          ) : (
            tasks.length > 4 && (
              <button onClick={() => setShowAllTasks(v => !v)} style={{
                ...btnReset, width: '100%', padding: '10px 14px', borderTop: `0.5px solid ${T.sep}`,
                fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.accent, textAlign: 'center',
              }}>
                {showAllTasks ? 'Show less' : `Show all ${tasks.length} tasks`}
              </button>
            )
          )}
        </Card>
      </div>
      )}

      {/* feedback now lives in the chat: once LIVE, a chat message routes to the
          feedback analyzer and the new tasks come back as tool-call messages
          (agent conversation behavior) — no separate composer here */}

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

// ── task_manager owner controls (auto-merge · retry deploy) ──
// Only rendered for task_manager bots. Reuses the file's Card/Switch
// + the client helpers; all owner-only POST/PATCH, optimistic with verbatim
// error text (409/503 are actionable — surfaced as-is).
function TaskManagerControls({ T, projectId, live, autoMergeEnabled, hasBot, specOnly }: {
  T: Theme; projectId: string; live: boolean;
  autoMergeEnabled?: boolean; hasBot: boolean; specOnly?: boolean;
}) {
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
      {/* retry deploy stays owner-facing; auto-merge is reserved for full controls */}
      {specOnly && hasBot && !live && (
        <Card T={T} pad={0}>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <button onClick={() => void onRetryDeploy()} disabled={dpBusy} style={{
              ...btnReset, width: '100%', height: 42, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: T.accentSoft, color: T.accent, fontFamily: T.font, fontSize: 14, fontWeight: 600,
            }}>
              {dpBusy ? <Spinner color={T.accent} size={15} /> : <TGIcon name="refresh" size={16} color={T.accent} stroke={2} />}
              Retry deploy
            </button>
            {dpPending && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: T.font, fontSize: 12.5, color: T.accent, lineHeight: '17px' }}>
                <Spinner color={T.accent} size={13} /> Deploy started - watching for it to come online...
              </div>
            )}
            {dpError && (
              <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.red, lineHeight: '17px' }}>{dpError}</div>
            )}
          </div>
        </Card>
      )}

      {/* auto-merge + full deploy controls — hidden unless full controls are requested */}
      {!specOnly && (
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
      )}
    </div>
  );
}

function Switch({ T, on, onClick, busy, size = 'regular' }: {
  T: Theme; on: boolean; onClick: () => void; busy?: boolean; size?: 'regular' | 'compact';
}) {
  const compact = size === 'compact';
  const trackW = compact ? 36 : 46;
  const trackH = compact ? 22 : 28;
  const knob = compact ? 16 : 22;
  const inset = compact ? 3 : 3;
  return (
    <button onClick={busy ? undefined : onClick} aria-pressed={on} style={{
      ...btnReset, width: trackW, height: trackH, borderRadius: 999, flexShrink: 0, position: 'relative',
      background: on ? T.accent : (T.dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,22,32,0.16)'),
      transition: 'background .2s', opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer',
    }}>
      <span style={{
        position: 'absolute', top: inset, left: on ? trackW - knob - inset : inset, width: knob, height: knob, borderRadius: 999,
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
