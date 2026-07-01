// FeedbackComposer — post-go-live "request a change" box for a LIVE
// task_manager bot. POSTs /feedback (async 202; rate limit 20/hr) which
// materializes NEW tasks into the living DAG. Optimistic pending chip while we
// poll /dag for the task count to grow, then marks the request as picked up.
//
// "Live" is decided by the caller off current_phase==='published' OR the bot's
// container_state — never project.status (the go-live trap).
import { useEffect, useRef, useState } from 'react';
import { Theme, btnReset, hexA } from '../theme';
import { ApiError, postFeedback, getProjectDag } from '../api/client';
import { TGIcon, Spinner } from '../ui';
import { MyBot } from './MyBots';

interface Pending { id: number; text: string; baseline: number; done: boolean }

export function FeedbackComposer({ T, bot, live, onGrown }: {
  T: Theme; bot: MyBot; live: boolean; onGrown?: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dagCount, setDagCount] = useState<number | null>(null);
  const grownFired = useRef(false);

  const unresolved = pending.some(p => !p.done);

  // poll /dag while a request is in flight; growth ⇒ the request was picked up
  useEffect(() => {
    if (!unresolved) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const d = await getProjectDag(bot.id);
        if (cancelled) return;
        const n = d.tasks?.length ?? 0;
        setDagCount(n);
        setPending(prev => prev.map(p => (!p.done && n > p.baseline ? { ...p, done: true } : p)));
      } catch { /* transient */ }
      if (!cancelled) timer = setTimeout(tick, 8000);
    };
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [unresolved, bot.id]);

  useEffect(() => {
    if (pending.some(p => p.done) && !grownFired.current) { grownFired.current = true; onGrown?.(); }
  }, [pending, onGrown]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || !live) return;
    setSending(true); setError(null);
    // baseline: best-known task count right now (the request must push it higher)
    let baseline = dagCount ?? 0;
    if (dagCount === null) {
      baseline = await getProjectDag(bot.id).then(d => d.tasks?.length ?? 0).catch(() => 0);
      setDagCount(baseline);
    }
    try {
      await postFeedback(bot.id, text);
      setDraft('');
      setPending(prev => [...prev, { id: Date.now(), text, baseline, done: false }]);
    } catch (e) {
      setError(e instanceof ApiError
        ? (e.status === 429 ? `Slow down — ${e.message} (20/hr).` : `${e.message}${e.details ? ` — ${e.details}` : ''}`)
        : 'network error — try again');
    } finally { setSending(false); }
  };

  const can = !!draft.trim() && !sending && live;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 2px' }}>
        Request a change
      </div>

      {/* pending requests — optimistic until the DAG grows */}
      {pending.map(p => (
        <div key={p.id} style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 12,
          background: p.done ? T.greenSoft : T.accentSoft,
        }}>
          {p.done ? <TGIcon name="check" size={15} color={T.green} stroke={2.4} /> : <Spinner color={T.accent} size={14} />}
          <span style={{ flex: 1, minWidth: 0, fontFamily: T.font, fontSize: 12.5, color: p.done ? T.green : T.accent, lineHeight: '17px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.done ? 'Added to the build' : 'Adding tasks…'} · "{p.text}"
          </span>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <textarea value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (can) void send(); } }}
          placeholder={live ? 'Describe a change or new feature…' : 'Available once your bot is live'}
          rows={1} disabled={!live}
          style={{
            flex: 1, resize: 'none', maxHeight: 96, minHeight: 42, padding: '11px 15px', borderRadius: 21,
            background: T.inputBg, border: `0.5px solid ${T.sep}`, color: live ? T.text : T.hint,
            fontFamily: T.font, fontSize: 15, lineHeight: '20px', outline: 'none', boxSizing: 'border-box',
            cursor: live ? 'text' : 'not-allowed',
          }} />
        <button onClick={can ? () => void send() : undefined} style={{
          ...btnReset, width: 42, height: 42, borderRadius: 999, flexShrink: 0,
          background: can ? T.accent : T.nestedBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: can ? 'pointer' : 'default',
        }}>
          {sending ? <Spinner color="#fff" size={18} /> : <TGIcon name="send" size={20} color={can ? '#fff' : T.hint} stroke={2} />}
        </button>
      </div>

      {error && <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.amber, lineHeight: '17px', padding: '0 2px' }}>{error}</div>}
      {live && !error && (
        <div style={{ fontFamily: T.font, fontSize: 11.5, color: T.hint, padding: '0 2px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <TGIcon name="spark" size={12} color={hexA(T.hint, 0.9)} /> Feedback becomes new tasks in your bot's living build.
        </div>
      )}
    </div>
  );
}
