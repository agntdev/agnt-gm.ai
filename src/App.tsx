// App.tsx — pipeline state machine + Telegram chrome wiring.
// Flow: prompt → clarify (real owner↔AI chat on a draft project) → spec
//       → agent (skills + first prompt) → tasks (real queue, publish on
//       approve) → dev → testing.
import { useEffect, useRef, useState } from 'react';
import { tgTheme, Theme } from './theme';
import {
  telegramColorScheme, onThemeChanged, syncChrome, telegramInitData, telegramUser,
  insideTelegram, backButtonOnClick, backButtonVisible, openTgLink,
} from './telegram';
import {
  ApiError, Project, TaskItem, Deployment,
  startChat, getProject, publishProject, listProjectTasks, listDeployments,
  listProjectsByAgent, authTelegram, setAuthToken,
  initiateBot, getProjectBot, BotInitiate,
} from './api/client';
import { useChat } from './chat/Chat';
import { TGHeader, MainButton, TabBar, Tab } from './ui';
import { PromptScreen } from './screens/Prompt';
import { ClarifyScreen, GenPhase } from './screens/Clarify';
import { SpecScreen } from './screens/Spec';
import { AgentScreen } from './screens/Agent';
import { TasksScreen } from './screens/Tasks';
import { DevScreen, devStats } from './screens/Dev';
import { TestingScreen } from './screens/Testing';
import { MyBotsList, BotChat, Composer, MyBot, botFromProject } from './manage/MyBots';

const STEPS = ['prompt', 'clarify', 'spec', 'agent', 'tasks', 'dev', 'testing'] as const;
type StepId = typeof STEPS[number];

const STAGE_SUB: Record<StepId, string> = {
  prompt: 'New bot', clarify: 'Tell me more', spec: 'Spec · 1 of 5',
  agent: 'Connect · 2 of 5', tasks: 'Plan · 3 of 5', dev: 'Building · 4 of 5',
  testing: 'Review · 5 of 5',
};

const THEME_KEY = 'agentbot-theme';
const PIPELINE_KEY = 'agentbot-pipeline';

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
  const [agentName, setAgentName] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tokenSymbol, setTokenSymbol] = useState<string | undefined>(undefined);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [approving, setApproving] = useState(false); // Stage 3 → publish repo + issues
  const [approveError, setApproveError] = useState<string | null>(null);

  // My Bots tab
  const [myBots, setMyBots] = useState<MyBot[]>([]);
  const [botsLoading, setBotsLoading] = useState(false);
  const [manageBot, setManageBot] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const id: StepId = STEPS[step];
  const cancelPoll = useRef<() => void>(() => {});

  const goTo = (i: number, d = 1) => { setDir(d); setStep(i); };
  const next = () => goTo(Math.min(STEPS.length - 1, step + 1), 1);
  const back = () => goTo(Math.max(0, step - 1), -1);

  // ── the clarify chat (real, on the draft project) ──
  const clarifyChat = useChat(project?.id ?? null, tab === 'build' && (id === 'clarify' || id === 'dev'));
  const manageChat = useChat(manageBot, tab === 'manage' && !!manageBot);

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
      pollPlan(r.project_id);
      goTo(STEPS.indexOf('clarify'), 1);
    } catch (e) {
      setStartError(e instanceof ApiError ? `${e.message}${e.details ? ` (${e.details})` : ''}` : 'network error');
    } finally {
      setStarting(false);
    }
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

  // ── Stage 1: "Create the bot" = managed-bot creation, nothing else ──
  // POST /bot/initiate reserves the username, then we immediately open the
  // manager-bot deep link — Telegram's own pre-filled bot-creation window.
  // The platform's poller captures the created bot; we poll /bot until it
  // lands. (Publishing the repo happens later, at "Approve plan & build".)
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

  // ── persist the pipeline so closing the mini-app doesn't lose progress ──
  useEffect(() => {
    if (!project) return; // cleared explicitly on restart / edit-idea
    const snap: PipelineSnap = {
      projectId: project.id, step: id, idea,
      botCreated, botUsername, connected, agentName,
    };
    localStorage.setItem(PIPELINE_KEY, JSON.stringify(snap));
  }, [project?.id, id, idea, botCreated, botUsername, connected, agentName]);

  // resume an in-progress bot from My Bots at the step it was closed on.
  // target forces a step — e.g. "Connect agent" from a live bot's chat.
  const resumeBuild = async (projectId: string, target?: StepId) => {
    setDir(1); setTab('build');
    const d = await getProject(projectId).catch(() => null);
    if (!d) return;
    const p = d.project;
    cancelPoll.current();
    resetPipeline();
    setProject(p);
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
      goTo(idx > 0 ? idx : 2, 1);
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

  // ── Stage 3 approval: publish the project (GitHub repo + one issue per task) ──
  const approvePlan = async () => {
    if (!project || approving) return;
    setApproving(true); setApproveError(null);
    try {
      if (project.status !== 'live' && project.status !== 'publishing') {
        try {
          const r = await publishProject(project.id);
          if (r.project) setProject(r.project);
          else setProject(p => p ? { ...p, status: 'live', github_repo_url: r.github_repo_url } : p);
        } catch (e) {
          // already published (or mid-publish)? re-check the real status
          const d = await getProject(project.id).catch(() => null);
          if (d) setProject(d.project);
          if (!d || (d.project.status !== 'live' && d.project.status !== 'publishing')) throw e;
        }
      }
      next();
    } catch (e) {
      setApproveError(e instanceof ApiError
        ? `Couldn't start the build — ${e.message}${e.details ? ` (${e.details})` : ''}`
        : "Couldn't start the build — network error. Tap to retry.");
    } finally {
      setApproving(false);
    }
  };

  // ── Stage 3: real task queue ──
  useEffect(() => {
    if (id !== 'tasks' || !project || tasks.length > 0) return;
    let cancelled = false;
    setTasksLoading(true);
    listProjectTasks(project.id)
      .then(r => { if (!cancelled) { setTasks(r.tasks || []); setTokenSymbol(r.token_symbol); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTasksLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, project?.id]);

  // ── Stage 4: REAL build status — poll tasks + deploy history while watching ──
  const stats = devStats(tasks);
  const devDone = stats.total > 0 && stats.done >= stats.total;
  useEffect(() => {
    if (id !== 'dev' || !project) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (cancelled) return;
      const [t, d] = await Promise.all([
        listProjectTasks(project.id).catch(() => null),
        listDeployments(project.id).catch(() => null),
      ]);
      if (cancelled) return;
      if (t) { setTasks(t.tasks || []); setTokenSymbol(t.token_symbol); }
      if (d) setDeployments(d.deployments || []);
      timer = setTimeout(tick, 5000);
    };
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, project?.id]);

  // ── My Bots: real deployed projects of this wallet ──
  const refreshMyBots = async () => {
    if (!tgAuthed || !tgAgentId) { setMyBots([]); return; }
    setBotsLoading(true);
    try {
      const list = await listProjectsByAgent(tgAgentId);
      // deployed bots AND in-progress builds (tapping the latter resumes the pipeline)
      const mine = (list.projects || []).filter(p => p.status !== 'rejected' && p.status !== 'failed');
      setMyBots(prev => mine.map(p => {
        const existing = prev.find(b => b.id === p.id);
        const fresh = botFromProject(p);
        return existing ? { ...existing, status: fresh.status, inProgress: fresh.inProgress, statusLabel: fresh.statusLabel, name: p.name } : fresh;
      }));
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

  const sendUpdate = () => {
    const text = draft.trim();
    if (!manageBot || !text) return;
    setDraft('');
    manageChat.send(text); // real chat — deploy/version logs come back as system messages
  };

  // ── restart / edit loops ──
  const resetPipeline = () => {
    cancelPoll.current();
    setProject(null); setTaskCount(null); setGen('idle'); setGenError(null); setChatDraft('');
    setBotCreated(false); setCreatingBot(false); setCreateError(null);
    setBotInit(null); setBotUsername(null);
    setApproving(false); setApproveError(null);
    setConnected(false); setAgentName(null);
    setTasks([]); setTasksLoading(false); setTokenSymbol(undefined);
    setDeployments([]);
  };
  const restart = () => { resetPipeline(); localStorage.removeItem(PIPELINE_KEY); setIdea(''); setChanged(false); goTo(0, -1); };
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
      case 'spec': return {
        label: botCreated ? 'Connect agent' : botInit ? 'Waiting for your bot…' : 'Create the bot to continue',
        disabled: !botCreated, busy: !!botInit && !botCreated, onClick: next,
      };
      case 'agent': return { label: connected ? 'Start building' : 'Connecting…', disabled: !connected, onClick: next };
      case 'tasks': return { label: approving ? 'Starting build…' : 'Approve plan & build', busy: approving, onClick: approvePlan };
      case 'dev': return { label: devDone ? 'Continue to review' : 'Building…', disabled: !devDone, busy: !devDone, onClick: next };
      case 'testing': return {
        label: 'Approve & finish', busy: publishing,
        onClick: () => {
          setPublishing(true);
          setTimeout(() => { setPublishing(false); restart(); void refreshMyBots(); }, 1400);
        },
      };
    }
  })();

  // ── back behavior (in-app header in the browser, native BackButton in Telegram) ──
  const onBack = ((): (() => void) | null => {
    if (id === 'prompt') return null;
    return back;
  })();
  const closeChat = () => { setManageBot(null); setDir(-1); };
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
          onConnected={(client) => { setAgentName((client || 'Claude').split('/')[0]); setConnected(true); }} />
      );
      case 'tasks': return (
        <TasksScreen T={T} tasks={tasks} loading={tasksLoading}
          agentName={agentName || 'Claude'} tokenSymbol={tokenSymbol} error={approveError} />
      );
      case 'dev': return <DevScreen T={T} tasks={tasks} deployments={deployments}
        log={clarifyChat.messages.filter(m => m.role === 'system')} />;
      case 'testing': return <TestingScreen T={T} project={project} />;
    }
  })();

  // ── header per tab (mocked chrome — browser only; Telegram draws its own) ──
  const header = insideTelegram ? null : (tab === 'manage'
    ? (activeBot
      ? <TGHeader T={T} title={activeBot.name} subtitle={'@' + activeBot.handle + ' · ' + activeBot.version}
          onBack={closeChat} />
      : <TGHeader T={T} title="My Bots" subtitle="Deployed on AgentBot" />)
    : <TGHeader T={T} title="AgentBot" subtitle={STAGE_SUB[id]} onBack={onBack} />);

  // ── body per tab ──
  const body = tab === 'manage'
    ? (activeBot
      ? <BotChat T={T} bot={activeBot} messages={manageChat.messages} thinking={manageChat.thinking}
          showIdentity={insideTelegram} onOption={(label) => manageChat.send(label)}
          onConnectAgent={activeBot.status === 'live'
            ? () => { setManageBot(null); void resumeBuild(activeBot.id, 'agent'); }
            : undefined} />
      : <MyBotsList T={T} bots={myBots} loading={botsLoading} authed={tgAuthed}
          onOpen={(bid) => {
            const b = myBots.find(x => x.id === bid);
            if (b?.inProgress) void resumeBuild(bid); // back to the step it was closed on
            else { setManageBot(bid); setDir(1); }
          }}
          onBuildFirst={() => { setDir(1); setTab('build'); }} />)
    : screen;

  // ── footer (above the tab bar) ──
  // clarify-while-drafting uses the chat composer; once the brief is accepted
  // (status leaves draft) the MainButton takes over.
  const drafting = id === 'clarify' && project?.status === 'draft' && gen !== 'error'
    && !clarifyChat.messages.some(m => m.role === 'system'); // system msg = brief locked, even before the status poll catches up
  const footer = tab === 'manage'
    ? (activeBot ? <Composer T={T} draft={draft} onChange={setDraft} onSend={sendUpdate} disabled={false} /> : null)
    : drafting
    ? <Composer T={T} draft={chatDraft} onChange={setChatDraft}
        onSend={() => { const t = chatDraft.trim(); if (t) { clarifyChat.send(t); setChatDraft(''); } }}
        disabled={false} placeholder="Type your answer…" />
    : (mainBtn ? <MainButton T={T} {...mainBtn} /> : null);

  const animKey = tab === 'manage' ? `m-${manageBot || 'list'}` : `b-${step}`;

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
      <TabBar T={T} tab={tab} onTab={(tb) => { setDir(1); setTab(tb); }} />
    </div>
  );
}
