// Chat — shared owner↔AI chat plumbing + renderer, used by the clarify step
// (Build tab) and the per-bot chat (My Bots). Backed by the real chat API:
// cursor polling, optimistic owner messages, ai_thinking typing indicator,
// quick-reply options, role=system deploy/build logs.
import { useEffect, useRef, useState } from 'react';
import { Theme } from '../theme';
import { ChatMessage, getChatMessages, sendChatMessage } from '../api/client';
import { TGIcon, Bubble, TypingBubble, Chip, Spinner } from '../ui';

// adaptive polling: tight while an AI turn is running (the answer can land
// any moment), relaxed when the chat is idle.
const POLL_FAST_MS = 700;
const POLL_IDLE_MS = 2500;

export interface ChatState {
  messages: ChatMessage[];
  thinking: boolean;
  send: (text: string) => void;
}

export function useChat(projectId: string | null, active: boolean): ChatState {
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
      timer = setTimeout(tick, busy ? POLL_FAST_MS : POLL_IDLE_MS);
    };
    pollNow.current = () => { if (timer) clearTimeout(timer); void tick(); };
    tick();
    return () => { cancelled = true; pollNow.current = () => {}; if (timer) clearTimeout(timer); };
  }, [projectId, active]);

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

// one system log line (build started, deploys, version bumps…).
// The backend sends no severity field, so derive it from the content/data:
// failures get the red treatment, everything else reads as progress.
function systemSeverity(m: ChatMessage): 'ok' | 'fail' {
  const probe = `${m.content || ''} ${JSON.stringify(m.data ?? '')}`.toLowerCase();
  return /fail|error|crash|broken|🔴|❌|⛔|✗/.test(probe) ? 'fail' : 'ok';
}

function SystemLog({ T, msg }: { T: Theme; msg: ChatMessage }) {
  const fail = systemSeverity(msg) === 'fail';
  const fg = fail ? T.red : T.green;
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', animation: 'tgbubble .32s cubic-bezier(.2,.8,.2,1)' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 13,
        background: fail ? T.redSoft : T.greenSoft, maxWidth: '88%',
      }}>
        <TGIcon name={fail ? 'close' : 'check'} size={15} color={fg} stroke={2.6} />
        <span style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: fg, lineHeight: '17px' }}>{msg.content}</span>
      </div>
    </div>
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
        if (m.role === 'system') return <SystemLog key={m.id} T={T} msg={m} />;
        const own = m.role === 'owner';
        return (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Bubble T={T} from={own ? 'user' : 'bot'} animateIn={m.id < 0}>
              <span style={{ whiteSpace: 'pre-line' }}>{m.content}</span>
            </Bubble>
            {!own && opts?.msgId === m.id && !thinking && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {opts.options.map(o => (
                  <Chip key={o} T={T} onClick={() => onOption!(o)}>{o}</Chip>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {thinking && <TypingBubble T={T} />}
      {pendingNote && !thinking && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, alignSelf: 'center', padding: '4px 0' }}>
          <Spinner color={T.hint} size={14} />
          <span style={{ fontFamily: T.font, fontSize: 13, color: T.hint }}>{pendingNote}</span>
        </div>
      )}
    </>
  );
}
