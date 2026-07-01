// Chat — shared owner↔AI chat plumbing + renderer, used by the clarify step
// (Build tab) and the per-bot chat (My Bots). Backed by the real chat API:
// cursor polling, optimistic owner messages, ai_thinking typing indicator,
// quick-reply options, role=system deploy/build logs.
import { useEffect, useRef, useState } from 'react';
import { Theme } from '../theme';
import { ChatMessage, getChatMessages, sendChatMessage } from '../api/client';
import { Bubble, TypingBubble, Spinner, EventCard, QuickReplies } from '../ui';

// adaptive polling: tight while an AI turn is running (the answer can land
// any moment), relaxed when the chat is idle, and much slower when the chat
// isn't the focused view (it's only feeding the overview's activity strip).
const POLL_FAST_MS = 1200;
const POLL_IDLE_MS = 4000;
const POLL_BG_MS = 12000;

export interface ChatState {
  messages: ChatMessage[];
  thinking: boolean;
  send: (text: string) => void;
}

export function useChat(projectId: string | null, active: boolean, focused = true): ChatState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const cursor = useRef(0);
  const seen = useRef<Set<number>>(new Set());
  const pollNow = useRef<() => void>(() => {});

  // fresh thread per project
  useEffect(() => {
    setMessages([]); setThinking(false);
    cursor.current = 0; seen.current = new Set();
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (cancelled) return;
      let busy = false;
      try {
        const r = await getChatMessages(projectId, cursor.current);
        if (cancelled) return;
        const incoming = (r.messages || []).filter(m => !seen.current.has(m.id));
        if (incoming.length) {
          incoming.forEach(m => seen.current.add(m.id));
          cursor.current = Math.max(cursor.current, ...incoming.map(m => m.id));
          setMessages(prev => {
            // drop optimistic copies (negative ids) the server has now echoed
            const echoed = new Set(incoming.filter(m => m.role === 'owner').map(m => m.content));
            return [...prev.filter(m => !(m.id < 0 && echoed.has(m.content))), ...incoming];
          });
        }
        busy = !!r.ai_thinking;
        setThinking(busy);
      } catch { /* transient — next tick retries */ }
      timer = setTimeout(tick, !focused ? POLL_BG_MS : busy ? POLL_FAST_MS : POLL_IDLE_MS);
    };
    pollNow.current = () => { if (timer) clearTimeout(timer); void tick(); };
    tick();
    return () => { cancelled = true; pollNow.current = () => {}; if (timer) clearTimeout(timer); };
  }, [projectId, active, focused]);

  const send = (text: string) => {
    const t = text.trim();
    if (!projectId || !t) return;
    setMessages(prev => [...prev, { id: -Date.now(), role: 'owner', content: t }]); // optimistic
    setThinking(true);
    // poll immediately once the server accepts — don't wait out the interval
    sendChatMessage(projectId, t)
      .then(() => pollNow.current())
      .catch(() => {});
  };

  return { messages, thinking, send };
}

// quick replies belong to the LAST assistant message with no owner reply after it
export function activeOptions(messages: ChatMessage[]): { msgId: number; options: string[] } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'owner') return null;
    if (m.role === 'assistant') {
      return m.options?.length ? { msgId: m.id, options: m.options } : null;
    }
  }
  return null;
}

// Map a system/action event to a Bold stage palette + icon. `data.kind`
// (README event kinds) drives it; otherwise fall back to content severity.
type Pal = 'amber' | 'green' | 'terracotta' | 'neutral';
const EVENT_KIND: Record<string, { palette: Pal; icon: string }> = {
  build_started: { palette: 'terracotta', icon: 'bolt' },
  spec_progress: { palette: 'amber', icon: 'beaker' },
  spec_ready: { palette: 'green', icon: 'check' },
  spec_failed: { palette: 'terracotta', icon: 'close' },
  phase: { palette: 'amber', icon: 'server' },
  bot_preview: { palette: 'green', icon: 'spark' },
  bot_deploy: { palette: 'green', icon: 'arrowUp' },
  app_deploy: { palette: 'green', icon: 'arrowUp' },
  ai_error: { palette: 'terracotta', icon: 'close' },
  test: { palette: 'amber', icon: 'beaker' },
  feedback: { palette: 'neutral', icon: 'refresh' },
  log_only: { palette: 'neutral', icon: 'code' },
  task_update: { palette: 'neutral', icon: 'check' },
  task_run: { palette: 'amber', icon: 'bolt' },
  task_create: { palette: 'neutral', icon: 'plus' },
  retry_task: { palette: 'amber', icon: 'refresh' },
  pr_opened: { palette: 'amber', icon: 'code' },
  task_done: { palette: 'green', icon: 'check' },
  build: { palette: 'terracotta', icon: 'bolt' },
  deploy: { palette: 'green', icon: 'arrowUp' },
  pause: { palette: 'neutral', icon: 'pause' },
  resume: { palette: 'green', icon: 'play' },
};

interface EventData { kind?: string; action?: string; label?: string; title?: string; sub?: string; detail?: string; status?: string; }

function eventLook(msg: ChatMessage): { palette: Pal; icon: string } {
  const d = (msg.data || {}) as EventData;
  const key = d.kind && d.kind !== 'action' ? d.kind : (d.action || '');
  if (EVENT_KIND[key]) return EVENT_KIND[key];
  const probe = `${msg.content || ''} ${JSON.stringify(msg.data ?? '')} ${d.status || ''}`.toLowerCase();
  return /fail|error|crash|broken|🔴|❌|⛔|✗/.test(probe)
    ? { palette: 'terracotta', icon: 'close' }
    : { palette: 'green', icon: 'check' };
}

// A system/agent event → full-width stage-coloured event card (Bold 1c).
function EventRow({ T, msg }: { T: Theme; msg: ChatMessage }) {
  const d = (msg.data || {}) as EventData;
  const look = eventLook(msg);
  return (
    <EventCard
      T={T} palette={look.palette} icon={look.icon}
      title={d.title || d.label || msg.content}
      sub={d.sub || d.detail || undefined}
    />
  );
}

export function ChatThread({ T, messages, thinking, onOption, pendingNote }: {
  T: Theme; messages: ChatMessage[]; thinking: boolean;
  onOption?: (label: string) => void;
  pendingNote?: string | null; // e.g. "Generating your spec…" once the chat hands off
}) {
  const opts = onOption ? activeOptions(messages) : null;
  return (
    <>
      {messages.map(m => {
        const data = m.data as { kind?: string } | undefined;
        if (data?.kind === 'action' || m.role === 'system') return <EventRow key={m.id} T={T} msg={m} />;
        const own = m.role === 'owner';
        return (
          <Bubble key={m.id} T={T} from={own ? 'user' : 'bot'} animateIn={m.id < 0}>
            <span style={{ whiteSpace: 'pre-line' }}>{m.content}</span>
          </Bubble>
        );
      })}
      {thinking && <TypingBubble T={T} />}
      {/* quick replies live at the foot of the feed, terracotta bordered chips */}
      {opts && !thinking && onOption && (
        <QuickReplies T={T} options={opts.options} onPick={onOption} />
      )}
      {pendingNote && !thinking && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, alignSelf: 'center', padding: '4px 0' }}>
          <Spinner color={T.hint} size={14} />
          <span style={{ fontFamily: T.font, fontSize: 13, color: T.hint }}>{pendingNote}</span>
        </div>
      )}
    </>
  );
}
