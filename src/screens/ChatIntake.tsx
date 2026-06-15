// ChatIntake — chat-driven project intake for the task_manager flow.
// The owner describes the bot in plain words; the AI clarifies (quick-reply
// options when the answer space is enumerable). There is NO explicit
// "confirm/build" button — when the idea is clear the project auto-advances
// out of 'draft' and decomposition starts; we detect that by polling
// GET /projects/:id and hand off to the board via onReady().
//
// Reuses the shared useChat hook (cursor polling, ai_thinking typing, system
// log lines) + ChatThread renderer + the Composer primitive.
import { useEffect, useRef, useState } from 'react';
import { Theme } from '../theme';
import { ApiError, startChat, getProject } from '../api/client';
import { useChat, ChatThread } from '../chat/Chat';
import { Composer } from '../manage/MyBots';
import { Bubble, Mark, Spinner, TGIcon } from '../ui';

export function ChatIntake({ T, projectId, onProjectCreated, onReady }: {
  T: Theme;
  projectId: string | null;          // existing draft to drive; null ⇒ first message creates it
  onProjectCreated?: (id: string) => void;
  onReady: (id: string) => void;     // status left 'draft' → decomposition started; switch to the board
}) {
  const [pid, setPid] = useState<string | null>(projectId);
  const [draft, setDraft] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const firedReady = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setPid(projectId); }, [projectId]);

  const chat = useChat(pid, !!pid);

  // keep pinned to the newest message
  useEffect(() => {
    const sc = scrollRef.current?.parentElement;
    if (sc) sc.scrollTop = sc.scrollHeight;
  });

  // poll the lifecycle: while drafting we own the pace; once status leaves
  // 'draft' (or a system message locks the brief) decomposition has started.
  const lockedIn = chat.messages.some(m => m.role === 'system');
  useEffect(() => {
    if (!pid) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (cancelled) return;
      try {
        const d = await getProject(pid);
        if (cancelled) return;
        setStatus(d.project.status);
      } catch { /* transient — keep polling */ }
      timer = setTimeout(tick, 3000);
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [pid]);

  const handedOff = (status !== null && status !== 'draft') || lockedIn;
  useEffect(() => {
    if (handedOff && pid && !firedReady.current) {
      firedReady.current = true;
      onReady(pid);
    }
  }, [handedOff, pid, onReady]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || starting) return;
    if (pid) { chat.send(t); return; }
    // first message creates the draft project (POST /chat) then drives it
    setStarting(true); setError(null);
    startChat(t)
      .then(r => { setPid(r.project_id); setStatus(r.status || 'draft'); onProjectCreated?.(r.project_id); })
      .catch(e => setError(e instanceof ApiError
        ? `${e.message}${e.details ? ` — ${e.details}` : ''}`
        : 'network error — tap send to retry'))
      .finally(() => setStarting(false));
  };

  const empty = !!pid && chat.messages.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* intro */}
        <div style={{
          alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 999,
          background: T.dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,22,32,0.04)', marginBottom: 2,
        }}>
          <Mark T={T} size={17} radius={5} />
          <span style={{ fontFamily: T.font, fontSize: 12, color: T.hint, fontWeight: 500 }}>
            Describe your bot — I'll ask a few questions, then build it
          </span>
        </div>

        {!pid && chat.messages.length === 0 && !starting && (
          <Bubble T={T} from="bot">
            <span style={{ whiteSpace: 'pre-line' }}>
              What should your bot do? Tell me the idea in plain words — who it's for and what it should handle.
            </span>
          </Bubble>
        )}

        {(starting || empty) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, alignSelf: 'center', padding: '8px 0' }}>
            <Spinner color={T.hint} size={15} />
            <span style={{ fontFamily: T.font, fontSize: 13, color: T.hint }}>
              {starting ? 'Starting…' : 'Loading the conversation…'}
            </span>
          </div>
        )}

        <ChatThread T={T} messages={chat.messages} thinking={chat.thinking}
          onOption={handedOff ? undefined : (label) => send(label)}
          pendingNote={handedOff ? 'Brief accepted — decomposing your idea into tasks…' : null} />

        {error && (
          <Bubble T={T} from="bot" animateIn>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <TGIcon name="refresh" size={17} color={T.amber} stroke={2} />
              <span>{error}</span>
            </div>
          </Bubble>
        )}
      </div>

      {!handedOff && (
        <Composer T={T} draft={draft} disabled={starting}
          onChange={setDraft}
          onSend={() => { const t = draft.trim(); if (t) { send(t); setDraft(''); } }}
          placeholder="Describe your bot…" />
      )}
    </div>
  );
}
