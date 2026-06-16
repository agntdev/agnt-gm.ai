// App.tsx — pipeline state machine + Telegram chrome wiring.
// Flow: prompt → clarify (owner↔AI chat on a draft project) → spec (create
//       the managed bot) → agent (choose builder + connect). "Start building"
//       publishes the repo and lands on the bot's overview, where the real
//       build (phases, tasks, deploys, logs) is watched — no separate
//       build/review pipeline.
import { useEffect, useRef, useState } from 'react';
import { tgTheme, Theme } from './theme';
import {
  telegramColorScheme, onThemeChanged, syncChrome, telegramInitData, telegramUser,
  insideTelegram, backButtonOnClick, backButtonVisible, openTgLink,
} from './telegram';
import {
  ApiError, Project,
  startChat, getProject, getProjectPipeline, publishProject, deleteProject,
  BuildMode, setBuildModeApi,
  listProjectsByAgent, authTelegram, setAuthToken,
  initiateBot, getProjectBot, BotInitiate,
  setBotPaused,
} from './api/client';
import { useChat } from './chat/Chat';
import { TGHeader, MainButton, TabBar, Tab } from './ui';
import { PromptScreen } from './screens/Prompt';
import { ClarifyScreen, GenPhase } from './screens/Clarify';
import { SpecScreen } from './screens/Spec';
import { AgentScreen } from './screens/Agent';
import { MyBotsList, BotChat, Composer, MyBot, botFromProject } from './manage/MyBots';
import { BotOverview } from './manage/BotOverview';
import { DagBoard } from './manage/DagBoard';
import { BoardView } from './manage/TaskManagerBoard';
import { TaskManagerInbox } from './manage/TaskManagerInbox';
import { TaskDetail } from './manage/TaskDetail';
import { ActivityPage } from './manage/Activity';
import { AgentManager } from './manage/AgentManager';
import { ConnectAgent } from './manage/ConnectAgent';

const STEPS = ['prompt', 'clarify', 'spec', 'agent'] as const;
type StepId = typeof STEPS[number];

const STAGE_SUB: Record<StepId, string> = {
  prompt: 'New bot', clarify: 'Tell me more',
  spec: 'Spec · 1 of 2', agent: 'Connect · 2 of 2',
};

const THEME_KEY = 'agentbot-theme';
const PIPELINE_KEY = 'agentbot-pipeline';
const HIDDEN_KEY = 'agentbot-hidden'; // deleted-bot ids (local fallback until the API has DELETE)
const MODE_KEY = 'agentbot-buildmode'; // per-project build mode (until the API carries build_mode)

function loadModes(): Record<string, BuildMode> {
  try { return JSON.parse(localStorage.getItem(MODE_KEY) || '{}'); } catch { return {}; }
}
function modeFor(p: { id: string; build_mode?: string } | null): BuildMode {
  if (p?.build_mode) return p.build_mode === 'local_agent' ? 'local' : 'platform';
  return (p && loadModes()[p.id]) || 'platform';
}

function loadHidden(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]') as string[]); }
  catch { return new Set(); }
}

const PAUSED_KEY = 'agentbot-paused'; // optimistic pause state per bot (until the API carries `paused`)
function loadPaused(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(PAUSED_KEY) || '[]') as string[]); }
  catch { return new Set(); }
}

const CLOUD_KEY = 'agentbot-cloud'; // bots with a cloud agent deployed (max one per bot)
function loadCloud(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CLOUD_KEY) || '[]') as string[]); }
  catch { return new Set(); }
}

// pipeline snapshot persisted across mini-app closes, keyed to the project
interface PipelineSnap {
  projectId: string;
  step: StepId;
  idea: string;
  botCreated: boolean;
  botUsername: string | null;
  connected: boolean;
  agentName: string | null;
}

function loadSnap(): PipelineSnap | null {
  try {
    const raw = localStorage.getItem(PIPELINE_KEY);
    return raw ? JSON.parse(raw) as PipelineSnap : null;
  } catch { return null; }
}

// auto-detected mode (Telegram colorScheme → OS preference), with a manual
// override toggled from the prompt screen. The override remembers which auto
// scheme it was made AGAINST — if Telegram's scheme changes (or the app opens
// on a device with the other scheme), the override is discarded so the app
// never sits light inside a dark Telegram (or vice versa).
interface ThemeOverride { mode: 'light' | 'dark'; base: 'light' | 'dark' }

function useColorMode(): ['light' | 'dark', () => void] {
  const get = (): 'light' | 'dark' =>
    telegramColorScheme()
    ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const [auto, setAuto] = useState<'light' | 'dark'>(get);
  const [override, setOverride] = useState<ThemeOverride | null>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(THEME_KEY) || 'null');
      return v && (v.mode === 'light' || v.mode === 'dark') ? v as ThemeOverride : null;
    } catch { return null; }
  });
  useEffect(() => {
    const offTg = onThemeChanged(() => setAuto(get()));
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onMq = () => setAuto(get());
    mq?.addEventListener?.('change', onMq);
    return () => { offTg(); mq?.removeEventListener?.('change', onMq); };
  }, []);

  const valid = override !== null && override.base === auto;
  const mode = valid ? override!.mode : auto;
  useEffect(() => {
    // stale override (made against the other scheme) — drop it
    if (override && override.base !== auto) {
      setOverride(null);
      localStorage.removeItem(THEME_KEY);
    }
  }, [auto, override]);

  const toggle = () => {
    const next: ThemeOverride = { mode: mode === 'dark' ? 'light' : 'dark', base: auto };
    if (next.mode === auto) {
      // toggled back to what Telegram says anyway — no override needed
      setOverride(null);
      localStorage.removeItem(THEME_KEY);
    } else {
      setOverride(next);
      localStorage.setItem(THEME_KEY, JSON.stringify(next));
    }
  };
  return [mode, toggle];
}

export default function App() {
  const [mode, toggleTheme] = useColorMode();
  const T: Theme = tgTheme(mode);
  useEffect(() => { syncChrome(T.headerBg, T.pageBg); document.body.style.background = T.pageBg; }, [mode]);

  // ── owner identity: silent Telegram auth ──
  // POST /auth/telegram with WebApp initData → JWT; the owner is derived from
  // the session on every API call. No wallet needed — bind one later to fund.
  const [tgAgentId, setTgAgentId] = useState<string | null>(null);
  const [tgAuthed, setTgAuthed] = useState(false);
  const tryTgAuth = async (): Promise<boolean> => {
    const initData = telegramInitData();
    if (!initData) return false;
    try {
      const r = await authTelegram(initData);
      const token = r.jwt || r.token;
      if (!token) return false;
      setAuthToken(token);
      setTgAgentId(r.agent?.id ?? null);
      setTgAuthed(true);
      return true;
    } catch {
      return false;
    }
  };
  useEffect(() => { void tryTgAuth(); }, []);

  // ── pipeline state ──
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [tab, setTab] = useState<Tab>('build');
  const [idea, setIdea] = useState('');
  const [changed, setChanged] = useState(false);
  const [starting, setStarting] = useState(false); // POST /builder/chat in flight
  const [startError, setStartError] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState(''); // clarify-chat composer

  // real platform state
  const [project, setProject] = useState<Project | null>(null);
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [gen, setGen] = useState<GenPhase>('idle');
  const [genError, setGenError] = useState<string | null>(null);
  const [botCreated, setBotCreated] = useState(false);
  const [creatingBot, setCreatingBot] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [botInit, setBotInit] = useState<BotInitiate | null>(null); // deep link issued, waiting for Telegram
  const [botUsername, setBotUsername] = useState<string | null>(null); // the real managed bot
  const [connected, setConnected] = useState(false);
  const [buildMode, setBuildMode] = useState<BuildMode>('platform');
  const [agentName, setAgentName] = useState<string | null>(null);
  const [building, setBuilding] = useState(false); // "Start building" → publish in flight
  const [buildError, setBuildError] = useState<string | null>(null);

  // My Bots tab
  const [myBots, setMyBots] = useState<MyBot[]>([]);
  const [botsLoading, setBotsLoading] = useState(false);
  const [manageBot, setManageBot] = useState<string | null>(null);
  const [manageView, setManageView] = useState<'overview' | 'board' | 'taskboard' | 'inbox' | 'chat' | 'activity' | 'connect'>('overview');
  const [detailTask, setDetailTask] = useState<string | null>(null); // task_manager TaskDetail overlay (slug)
  const [hiddenBots, setHiddenBots] = useState<Set<string>>(loadHidden);
  const [pausedBots, setPausedBots] = useState<Set<string>>(loadPaused);
  const [cloudBots, setCloudBots] = useState<Set<string>>(loadCloud);
  const [agentSheet, setAgentSheet] = useState(false); // "Add an agent" bottom sheet
  const [draft, setDraft] = useState('');

  const id: StepId = STEPS[step];
  const cancelPoll = useRef<() => void>(() => {});

  const goTo = (i: number, d = 1) => { setDir(d); setStep(i); };
  const next = () => goTo(Math.min(STEPS.length - 1, step + 1), 1);
  const back = () => goTo(Math.max(0, step - 1), -1);

  // a stale "couldn't start the build" error shouldn't linger when you leave
  // (or re-enter) the agent step
  useEffect(() => { if (id !== 'agent') setBuildError(null); }, [id]);

  // close the TaskDetail overlay whenever the open bot or view changes, so a
  // stale slug never bleeds across bots/screens
  useEffect(() => { setDetailTask(null); }, [manageBot, manageView]);

  // ── the clarify chat (real, on the draft project) ──
  const clarifyChat = useChat(project?.id ?? null, tab === 'build' && id === 'clarify', true);
  // active across all bot views (the overview reads its activity feed), but only
  // FAST-polls when the chat is the focused view — elsewhere it ticks slowly.
  const manageChat = useChat(manageBot, tab === 'manage' && !!manageBot, manageView === 'chat');

  // "Start generating": create the draft project from the idea and enter the chat
  const startChatFlow = async () => {
    if (starting || !idea.trim()) return;
    if (!tgAuthed && !(await tryTgAuth())) return; // auth raced the tap — retry once
    setStarting(true); setStartError(null);
    try {
      const r = await startChat(idea.trim());
      resetPipeline();
      const d = await getProject(r.project_id).catch(() => null);
      setProject(d?.project ?? ({ id: r.project_id, slug: '', name: 'New bot', status: r.status || 'draft' } as Project));
      setGen('generating');
      setBuildMode('platform');
      pollPlan(r.project_id);
      goTo(STEPS.indexOf('clarify'), 1);
    } catch (e) {
      setStartError(e instanceof ApiError ? `${e.message}${e.details ? ` (${e.details})` : ''}` : 'network error');
    } finally {
      setStarting(false);
    }
  };

  // task_manager handoff (§7a): once the chat-created project leaves 'draft'
  // decomposition has begun. Unlike the phase pipeline (spec → create bot →
  // agent → publish), a task_manager project auto-decomposes and the owner just
  // watches the living board — so drop them straight onto #/bots/:id/taskboard.
  const handoffToBoard = (p: Project) => {
    cancelPoll.current();
    const bot = { ...botFromProject(p), isTaskManager: true }; // verdict known — board renders tap-through immediately
    setMyBots(prev => prev.some(b => b.id === p.id) ? prev : [bot, ...prev]);
    resetPipeline();
    localStorage.removeItem(PIPELINE_KEY);
    setIdea(''); setChanged(false); setStep(0);
    setManageBot(p.id); setManageView('taskboard'); setDir(1); setTab('manage');
    void refreshMyBots(p.id);
  };

  // status poll: draft (chatting) → validating (plan-gen) → ready_to_publish.
  // No timeout while drafting — the owner chats at their own pace.
  const pollPlan = (projectId: string) => {
    let cancelled = false;
    cancelPoll.current = () => { cancelled = true; };
    let genSince: number | null = null;
    const tick = async () => {
      if (cancelled) return;
      try {
        const d = await getProject(projectId);
        if (cancelled) return;
        setProject(d.project);
        const st = d.project.status;
        // task_manager vs phase: once status leaves 'draft', discriminate by
        // build_pipeline (when present), else status 'generating' (the
        // task_manager-only decomposing state — phase uses validating→
        // ready_to_publish), else probe /dag for node_kind. Probe every tick —
        // the DAG may still be empty the instant decomposition starts; phase
        // projects keep falling through unchanged below. This MUST precede both
        // the live→'ready' branch (so a populated task_manager DAG hands off
        // before the phase publish UI shows) and the 4-min plan-gen timeout (so
        // a slow decomposition isn't killed before the board handoff fires).
        if (st !== 'draft') {
          const tm = d.project.build_pipeline
            ? d.project.build_pipeline === 'task_manager'
            : st === 'generating' || (await getProjectPipeline(projectId)) === 'task_manager';
          if (cancelled) return;
          if (tm) { handoffToBoard(d.project); return; }
        }
        if (st === 'ready_to_publish' || st === 'publishing' || st === 'live') { setGen('ready'); return; }
        if (st === 'rejected' || st === 'failed') {
          setGenError(d.project.rejection_reason || `plan ${st}`); setGen('error'); return;
        }
        if (st === 'draft') genSince = null;
        else genSince = genSince ?? Date.now();
      } catch { /* transient — keep polling */ }
      if (genSince && Date.now() - genSince > 4 * 60_000) { setGenError('timed out'); setGen('error'); return; }
      setTimeout(tick, 3000);
    };
    setTimeout(tick, 3000);
  };

  // who builds: persisted per project; API informed when the endpoint exists
  const chooseBuildMode = (m: BuildMode) => {
    setBuildMode(m);
    if (project) {
      const all = loadModes(); all[project.id] = m;
      localStorage.setItem(MODE_KEY, JSON.stringify(all));
      setBuildModeApi(project.id, m).catch(() => { /* endpoint not shipped yet */ });
    }
  };

  // ── Stage 1: "Create the bot" = managed-bot creation, nothing else ──
  // POST /bot/initiate reserves the username, then we immediately open the
  // manager-bot deep link — Telegram's own pre-filled bot-creation window.
  // The platform's poller captures the created bot; we poll /bot until it
  // lands. (Publishing the repo happens at "Start building" on the agent step.)
  const createBot = async () => {
    if (!project || creatingBot || botCreated || botInit) return;
    setCreatingBot(true); setCreateError(null);
    try {
      const init = await initiateBot(project.id);
      setBotInit(init);
      if (init.deep_link) openTgLink(init.deep_link); // system Telegram window
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setBotInit({}); // bot already exists — just poll for the row
      } else {
        setCreateError(e instanceof ApiError
          ? `Couldn't create the bot — ${e.message}${e.details ? ` (${e.details})` : ''}`
          : "Couldn't create the bot — network error. Tap to retry.");
      }
    } finally {
      setCreatingBot(false);
    }
  };

  // poll until the managed-bot poller captures the bot created in Telegram
  useEffect(() => {
    if (!botInit || botUsername || !project) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (cancelled) return;
      try {
        const b = await getProjectBot(project.id);
        if (cancelled) return;
        if (b?.bot_username) { setBotUsername(b.bot_username); setBotCreated(true); return; }
      } catch { /* transient — keep polling */ }
      timer = setTimeout(tick, 5000);
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botInit, botUsername, project?.id]);

  // ── hash routes: memorize the current page across refreshes ──
  // #/ (build entry) · #/build/<projectId> · #/bots · #/bots/<id>[/chat]
  // routeReady gates the rewrite effect so an async restore (resumeBuild) can't
  // be clobbered with an intermediate '#/' before the tab/project settle.
  const restored = useRef(false);
  const routeReady = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (parts[0] === 'bots') {
      setTab('manage');
      if (parts[1]) {
        setManageBot(parts[1]);
        setManageView(parts[2] === 'chat' ? 'chat' : parts[2] === 'activity' ? 'activity' : parts[2] === 'connect' ? 'connect' : parts[2] === 'taskboard' ? 'taskboard' : parts[2] === 'inbox' ? 'inbox' : parts[2] === 'board' ? 'board' : 'overview');
      }
      routeReady.current = true;
    } else if (parts[0] === 'build' && parts[1]) {
      void resumeBuild(parts[1]); // restores the step; sets routeReady when settled
    } else {
      routeReady.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!routeReady.current) return;
    const sub = manageView === 'chat' ? '/chat' : manageView === 'activity' ? '/activity' : manageView === 'connect' ? '/connect' : manageView === 'taskboard' ? '/taskboard' : manageView === 'inbox' ? '/inbox' : manageView === 'board' ? '/board' : '';
    const h = tab === 'manage'
      ? (manageBot ? `#/bots/${manageBot}${sub}` : '#/bots')
      : project ? `#/build/${project.id}` : '#/';
    history.replaceState(null, '', h);
  }, [tab, manageBot, manageView, project?.id]);

  // ── persist the pipeline so closing the mini-app doesn't lose progress ──
  useEffect(() => {
    if (!project) return; // cleared explicitly on restart / edit-idea
    const snap: PipelineSnap = {
      projectId: project.id, step: id, idea,
      botCreated, botUsername, connected, agentName,
    };
    localStorage.setItem(PIPELINE_KEY, JSON.stringify(snap));
  }, [project?.id, id, idea, botCreated, botUsername, connected, agentName]);

  // resume an in-progress bot from My Bots. A published bot opens its
  // overview; an unfinished one re-enters the build pipeline at the right
  // step. `target` forces a build step (e.g. "Connect agent" from the
  // overview), bypassing the published→overview shortcut.
  const resumeBuild = async (projectId: string, target?: StepId) => {
    const d = await getProject(projectId).catch(() => null);
    if (!d) return;
    const p = d.project;
    const published = p.status === 'live' || p.status === 'completed' || p.status === 'publishing';
    if (published && !target) {
      cancelPoll.current();
      setManageBot(p.id); setManageView('overview'); setDir(1); setTab('manage');
      routeReady.current = true;
      void refreshMyBots(p.id);
      return;
    }
    // re-enter the build pipeline
    setDir(1); setTab('build');
    cancelPoll.current();
    resetPipeline();
    setProject(p);
    setBuildMode(modeFor(p));
    routeReady.current = true;
    const snap = loadSnap();
    const inFlight = p.status === 'draft' || p.status === 'validating';
    if (inFlight) { setGen('generating'); pollPlan(p.id); }
    else setGen('ready');

    if (target) {
      setIdea(snap?.projectId === p.id ? snap.idea : p.name);
      if (snap && snap.projectId === p.id) { setConnected(snap.connected); setAgentName(snap.agentName); }
      const bot = await getProjectBot(p.id).catch(() => null);
      if (bot?.bot_username) { setBotUsername(bot.bot_username); setBotCreated(true); setBotInit({}); }
      goTo(STEPS.indexOf(target), 1);
    } else if (p.status === 'draft') {
      // still clarifying — the chat history reloads from the server
      setIdea(snap?.projectId === p.id ? snap.idea : p.name);
      goTo(STEPS.indexOf('clarify'), 1);
    } else if (snap && snap.projectId === p.id) {
      // same device — restore the exact state
      setIdea(snap.idea);
      setBotUsername(snap.botUsername); setBotCreated(snap.botCreated || !!snap.botUsername);
      setConnected(snap.connected); setAgentName(snap.agentName);
      const idx = STEPS.indexOf(snap.step);
      goTo(idx >= 0 ? idx : (snap.botUsername ? STEPS.indexOf('agent') : STEPS.indexOf('spec')), 1);
    } else {
      // no local snapshot — derive the furthest known step from the server
      setIdea(p.name);
      const bot = await getProjectBot(p.id).catch(() => null);
      if (bot?.bot_username) {
        setBotUsername(bot.bot_username); setBotCreated(true); setBotInit({});
        goTo(STEPS.indexOf('agent'), 1);
      } else if (p.status === 'validating') {
        goTo(STEPS.indexOf('clarify'), 1);
      } else {
        goTo(STEPS.indexOf('spec'), 1);
      }
    }
  };

  // ── "Start building": publish the repo, then land on the bot's overview ──
  // Publishing creates the GitHub repo + the plan/tasks the platform (or the
  // owner's agent) builds. Everything after is watched on the overview page.
  const startBuild = async () => {
    if (!project || building) return;
    setBuilding(true); setBuildError(null);
    setBuildModeApi(project.id, buildMode).catch(() => { /* endpoint not shipped yet */ });
    try {
      let pub: Project = project;
      if (project.status !== 'live' && project.status !== 'publishing' && project.status !== 'completed') {
        try {
          const r = await publishProject(project.id);
          pub = r.project ?? { ...project, status: 'live', github_repo_url: r.github_repo_url };
        } catch (e) {
          const d = await getProject(project.id).catch(() => null);
          if (d && (d.project.status === 'live' || d.project.status === 'publishing' || d.project.status === 'completed')) {
            pub = d.project;
          } else { throw e; }
        }
      }
      const pid = pub.id;
      // a cloud (platform) build means the platform's cloud agent already owns
      // this bot — register it so the overview shows "Cloud agent" instead of
      // prompting "Add an agent" for a builder the owner already chose
      if (buildMode === 'platform') markCloudDeployed(pid);
      // surface the bot on the overview immediately (before the list refresh lands)
      setMyBots(prev => prev.some(b => b.id === pid) ? prev : [botFromProject(pub), ...prev]);
      // reset the build tab and jump to the bot's overview
      resetPipeline();
      localStorage.removeItem(PIPELINE_KEY);
      setIdea(''); setChanged(false); setStep(0);
      setManageBot(pid); setManageView('overview'); setDir(1); setTab('manage');
      void refreshMyBots(pid);
    } catch (e) {
      setBuildError(e instanceof ApiError
        ? `Couldn't start the build — ${e.message}${e.details ? ` (${e.details})` : ''}`
        : "Couldn't start the build — network error. Tap to retry.");
    } finally {
      setBuilding(false);
    }
  };

  // ── My Bots: real deployed + in-progress projects of this owner ──
  // keepId preserves a just-created bot through replication lag (the API list
  // may not include it on the first refresh right after publish).
  const refreshMyBots = async (keepId?: string) => {
    if (!tgAuthed || !tgAgentId) { setMyBots([]); return; }
    setBotsLoading(true);
    try {
      const list = await listProjectsByAgent(tgAgentId);
      const mine = (list.projects || []).filter(p => p.status !== 'rejected' && p.status !== 'failed' && !hiddenBots.has(p.id));
      setMyBots(prev => {
        const mapped = mine.map(p => {
          const existing = prev.find(b => b.id === p.id);
          const fresh = botFromProject(p);
          return existing ? { ...existing, status: fresh.status, inProgress: fresh.inProgress, statusLabel: fresh.statusLabel, name: p.name } : fresh;
        });
        const keep = keepId || manageBot;
        if (keep && !mapped.some(b => b.id === keep)) {
          const kept = prev.find(b => b.id === keep);
          if (kept) return [kept, ...mapped];
        }
        return mapped;
      });
    } catch { /* keep whatever we had */ }
    setBotsLoading(false);
  };

  useEffect(() => {
    if (tab === 'manage') void refreshMyBots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, tgAuthed]);

  // keep the open chat pinned to the latest message
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeBot = manageBot ? myBots.find(b => b.id === manageBot) ?? null : null;
  useEffect(() => {
    if (tab === 'manage' && manageBot && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [tab, manageBot, manageChat.messages.length, manageChat.thinking]);

  // delete: real DELETE when the API grows it; local hide as the fallback
  const deleteBot = async (botId: string) => {
    try { await deleteProject(botId); } catch { /* endpoint not shipped yet — hide locally */ }
    setHiddenBots(prev => {
      const next = new Set(prev); next.add(botId);
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
      return next;
    });
    setMyBots(bs => bs.filter(b => b.id !== botId));
    setManageBot(null); setDir(-1);
  };

  const sendUpdate = () => {
    const text = draft.trim();
    if (!manageBot || !text) return;
    setDraft('');
    manageChat.send(text); // real chat — deploy/version logs come back as system messages
  };

  // pause / resume the managed bot — optimistic (real PUT when the API ships)
  const togglePause = (botId: string) => {
    setPausedBots(prev => {
      const next = new Set(prev);
      const willPause = !next.has(botId);
      if (willPause) next.add(botId); else next.delete(botId);
      localStorage.setItem(PAUSED_KEY, JSON.stringify([...next]));
      setBotPaused(botId, willPause).catch(() => { /* endpoint not shipped yet */ });
      return next;
    });
  };

  // remember a deployed cloud agent so the sheet enforces max one per bot
  const markCloudDeployed = (botId: string) => {
    setCloudBots(prev => {
      const next = new Set(prev); next.add(botId);
      localStorage.setItem(CLOUD_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  // ── restart / edit loops ──
  const resetPipeline = () => {
    cancelPoll.current();
    setProject(null); setTaskCount(null); setGen('idle'); setGenError(null); setChatDraft('');
    setBotCreated(false); setCreatingBot(false); setCreateError(null);
    setBotInit(null); setBotUsername(null);
    setBuilding(false); setBuildError(null);
    setConnected(false); setAgentName(null);
  };
  const editIdea = () => { resetPipeline(); localStorage.removeItem(PIPELINE_KEY); setChanged(true); goTo(0, -1); };

  // ── MainButton config per step ──
  const mainBtn = ((): { label: string; disabled?: boolean; busy?: boolean; onClick?: () => void } | null => {
    switch (id) {
      case 'prompt': return {
        // outside Telegram there is no initData to authorize with — say so
        label: idea.trim() && !tgAuthed && !insideTelegram ? 'Open in Telegram to build' : 'Start generating',
        disabled: !idea.trim() || (!tgAuthed && !insideTelegram) || starting,
        busy: starting,
        onClick: () => void startChatFlow(),
      };
      case 'clarify': return {
        // while drafting the footer is the chat composer (see below), so this
        // only renders once the brief is accepted
        label: gen === 'ready' ? 'Review spec' : 'Generating spec…',
        disabled: gen !== 'ready', busy: gen === 'generating' && project?.status !== 'draft',
        onClick: next,
      };
      case 'spec':
        // while the bot is being created in Telegram, the waiting state lives in
        // the spec card (with its own spinner) — don't duplicate it in the footer
        if (botInit && !botCreated) return null;
        return {
          label: botCreated ? 'Connect agent' : 'Create the bot to continue',
          disabled: !botCreated, onClick: next,
        };
      case 'agent': {
        const ready = buildMode === 'platform' || connected;
        return {
          label: building ? 'Starting…' : ready ? 'Start building' : 'Connecting…',
          disabled: !ready || building,
          busy: building || (buildMode === 'local' && !connected),
          onClick: () => void startBuild(),
        };
      }
    }
  })();

  // ── back behavior (in-app header in the browser, native BackButton in Telegram) ──
  const onBack = ((): (() => void) | null => {
    if (id === 'prompt') return null;
    return back;
  })();
  const closeChat = () => {
    setDir(-1);
    if (detailTask) { setDetailTask(null); return; } // close the TaskDetail overlay first
    if (agentSheet) { setAgentSheet(false); return; }
    if (manageView !== 'overview') setManageView('overview');
    else setManageBot(null);
  };
  const backAction: (() => void) | null = tab === 'manage' ? (activeBot ? closeChat : null) : onBack;

  // Telegram's own header already exists inside the mini-app — drive its
  // native BackButton instead of rendering our mocked chrome.
  const backRef = useRef<(() => void) | null>(null);
  backRef.current = backAction;
  useEffect(() => backButtonOnClick(() => backRef.current?.()), []);
  useEffect(() => { backButtonVisible(!!backAction); }, [!!backAction]);

  // ── screen body (build tab) ──
  const screen = (() => {
    switch (id) {
      case 'prompt': return (
        <PromptScreen T={T} idea={idea} setIdea={setIdea} changed={changed}
          user={telegramUser()} onToggleTheme={toggleTheme} error={startError} />
      );
      case 'clarify': return (
        <ClarifyScreen T={T} messages={clarifyChat.messages} thinking={clarifyChat.thinking}
          status={project?.status ?? null} gen={gen} genError={genError}
          onOption={(label) => clarifyChat.send(label)}
          onRetry={() => { if (project) { setGen('generating'); setGenError(null); pollPlan(project.id); } }} />
      );
      case 'spec': return project ? (
        <SpecScreen T={T} project={project} taskCount={taskCount}
          created={botCreated} creating={creatingBot} createError={createError}
          botInit={botInit} botUsername={botUsername}
          onCreate={createBot} onEdit={editIdea} />
      ) : null;
      case 'agent': return (
        <AgentScreen T={T} connected={connected} agentName={agentName} project={project}
          mode={buildMode} onMode={chooseBuildMode} error={buildError}
          onConnected={(client) => {
            setAgentName((client || 'Claude').split('/')[0]);
            setConnected(true);
            // agent is live — no extra tap: publish and go straight to the overview
            // (on failure startBuild surfaces the error and the manual button returns)
            void startBuild();
          }} />
      );
    }
  })();

  // ── header per tab (mocked chrome — browser only; Telegram draws its own) ──
  const header = insideTelegram ? null : (tab === 'manage'
    ? (activeBot
      ? <TGHeader T={T}
          title={manageView === 'activity' ? 'Activity' : manageView === 'connect' ? 'Connect agent' : manageView === 'board' || manageView === 'taskboard' ? 'Build board' : manageView === 'inbox' ? 'Needs you' : activeBot.name}
          subtitle={manageView === 'overview' || manageView === 'chat' ? '@' + activeBot.handle + ' · ' + activeBot.version : '@' + activeBot.handle}
          onBack={closeChat} />
      : <TGHeader T={T} title="My Bots" subtitle="Deployed on AgentBot" />)
    : <TGHeader T={T} title="AgentBot" subtitle={STAGE_SUB[id]} onBack={onBack} />);

  // ── body per tab ──
  const body = tab === 'manage'
    ? (activeBot
      ? (manageView === 'chat'
        ? <BotChat T={T} bot={activeBot} messages={manageChat.messages} thinking={manageChat.thinking}
            showIdentity={insideTelegram} onOption={(label) => manageChat.send(label)}
            cloudAgent={cloudBots.has(activeBot.id)} />
        : manageView === 'activity'
        ? <ActivityPage T={T} bot={activeBot} events={manageChat.messages.filter(m => m.role === 'system')} />
        : manageView === 'board'
        ? <DagBoard T={T} bot={activeBot} />
        : manageView === 'taskboard'
        // task_manager → tap-through TaskManagerBoard; phase → DagBoard (BoardView discriminates)
        ? <BoardView T={T} bot={activeBot}
            known={activeBot.isTaskManager === true ? 'task_manager' : activeBot.isTaskManager === false ? 'phase' : undefined}
            onOpenTask={(slug) => { setDir(1); setDetailTask(slug); }} />
        : manageView === 'inbox'
        ? <TaskManagerInbox T={T} bot={activeBot}
            onOpenTask={(slug) => { setDir(1); setDetailTask(slug); }} />
        : manageView === 'connect'
        ? <ConnectAgent T={T} bot={activeBot} onConnected={() => {
            // a local agent now owns the bot — it supersedes any cloud agent
            setCloudBots(prev => {
              if (!prev.has(activeBot.id)) return prev;
              const next = new Set(prev); next.delete(activeBot.id);
              localStorage.setItem(CLOUD_KEY, JSON.stringify([...next]));
              return next;
            });
            setDir(-1); setManageView('overview');
          }} />
        : <BotOverview T={T} bot={activeBot} messages={manageChat.messages}
            onOpenChat={() => { setDir(1); setManageView('chat'); }}
            onOpenBoard={() => { setDir(1); setManageView('taskboard'); }}
            onOpenInbox={() => { setDir(1); setManageView('inbox'); }}
            onViewActivity={() => { setDir(1); setManageView('activity'); }}
            onManageAgents={() => setAgentSheet(true)}
            onCloudDetected={() => markCloudDeployed(activeBot.id)}
            cloudDeployed={cloudBots.has(activeBot.id)}
            paused={pausedBots.has(activeBot.id)}
            onTogglePause={() => togglePause(activeBot.id)}
            onDelete={() => void deleteBot(activeBot.id)} />)
      : <MyBotsList T={T} bots={myBots} loading={botsLoading} authed={tgAuthed}
          onOpen={(bid) => {
            const b = myBots.find(x => x.id === bid);
            if (b?.inProgress) void resumeBuild(bid); // back to the step it was closed on
            else { setManageBot(bid); setManageView('overview'); setDir(1); }
          }}
          onBuildFirst={() => { setDir(1); setTab('build'); }} />)
    : screen;

  // ── footer (above the tab bar) ──
  // clarify-while-drafting uses the chat composer; once the brief is accepted
  // (status leaves draft) the MainButton takes over.
  const drafting = id === 'clarify' && project?.status === 'draft' && gen !== 'error'
    && !clarifyChat.messages.some(m => m.role === 'system'); // system msg = brief locked, even before the status poll catches up
  const footer = tab === 'manage'
    ? (activeBot && manageView === 'chat'
      ? <Composer T={T} draft={draft} onChange={setDraft} onSend={sendUpdate} disabled={false}
          placeholder={cloudBots.has(activeBot.id) ? 'Ask your cloud agent…' : undefined} />
      : null)
    : drafting
    ? <Composer T={T} draft={chatDraft} onChange={setChatDraft}
        onSend={() => { const t = chatDraft.trim(); if (t) { clarifyChat.send(t); setChatDraft(''); } }}
        disabled={false} placeholder="Type your answer…" />
    : (mainBtn ? <MainButton T={T} {...mainBtn} /> : null);

  const animKey = tab === 'manage' ? `m-${manageBot || 'list'}-${manageView}` : `b-${step}`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.pageBg, transition: 'background .3s' }}>
      <style>{`
        @keyframes tgspin { to { transform: rotate(360deg); } }
        @keyframes tgpulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        @keyframes tgtype { 0%,60%,100% { transform: translateY(0); opacity:.5; } 30% { transform: translateY(-4px); opacity:1; } }
        @keyframes tgbubble { from { opacity:0; transform: translateY(8px) scale(.97); } to { opacity:1; transform:none; } }
        @keyframes tgline { from { opacity:0; transform: translateX(-4px); } to { opacity:1; transform:none; } }
        @keyframes tgpop { 0% { transform: scale(.5); opacity:0; } 100% { transform: scale(1); opacity:1; } }
        @keyframes scrIn { from { opacity:0; transform: translateX(var(--scr-dx)); } to { opacity:1; transform:none; } }
        @keyframes tgfade { from { opacity:0; } to { opacity:1; } }
        @keyframes tgsheet { from { transform: translateY(100%); } to { transform: none; } }
        textarea::placeholder { color: ${T.hint}; }
        ::-webkit-scrollbar { width: 0; height: 0; }
      `}</style>

      {header}
      <div ref={scrollRef} key={animKey} style={{
        flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', position: 'relative',
        ['--scr-dx' as string]: dir > 0 ? '22px' : '-22px', animation: 'scrIn .32s cubic-bezier(.2,.8,.2,1)',
      }}>
        {body}
      </div>
      {footer}
      <TabBar T={T} tab={tab} onTab={(tb) => {
        setDir(1);
        setAgentSheet(false); // never leave the sheet hanging over another tab
        // tapping My Bots pops to its root (the list), not the last-open bot
        if (tb === 'manage') { setManageBot(null); setManageView('overview'); }
        setTab(tb);
      }} />

      {/* "Add an agent" sheet — overlays everything, closed by scrim/back */}
      {agentSheet && activeBot && (
        <AgentManager T={T} project={{ id: activeBot.id, name: activeBot.name }}
          cloudDeployed={cloudBots.has(activeBot.id)}
          onCloudDeployed={() => markCloudDeployed(activeBot.id)}
          onConnectNew={() => {
            setAgentSheet(false); setDir(1);
            // local agent ⇒ mark the project LOCAL so the platform defers to it
            const all = loadModes(); all[activeBot.id] = 'local';
            localStorage.setItem(MODE_KEY, JSON.stringify(all));
            setBuildModeApi(activeBot.id, 'local').catch(() => { /* endpoint not shipped yet */ });
            // focused connect screen — just the code + CLI command
            setManageView('connect');
          }}
          onClose={() => setAgentSheet(false)} />
      )}

      {/* task_manager: per-task detail panel — overlay opened from the board/inbox */}
      {detailTask && manageBot && (
        <TaskDetail T={T} projectId={manageBot} slug={detailTask}
          onClose={() => setDetailTask(null)} />
      )}
    </div>
  );
}
