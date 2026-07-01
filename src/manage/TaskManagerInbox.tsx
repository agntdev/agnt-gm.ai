// TaskManagerInbox — the "Needs your input" attention surface.
//
// Source: GET /projects/:id/blocked (owner) — open question tasks + blocked
// build tasks + failed tasks, oldest first. Drives both the overview badge
// (useBlocked + BlockedBadge) and the full inbox screen:
//   • question → open TaskDetail's answer box (onOpenTask)
//   • failed   → inline Reopen (POST /reopen)
//   • warning  → a systemically-failed review holding the go-live gate; inline
//                Cancel review escape (POST /cancel?confirm=true), warning shown verbatim
import { useEffect, useRef, useState } from 'react';
import { Theme, btnReset, hexA } from '../theme';
import { ApiError, BlockedItem, getBlockedItems, reopenTask, cancelTask } from '../api/client';
import { TGIcon, Card, Pill, Spinner } from '../ui';
import { MyBot } from './MyBots';
import { relTime } from './Activity';

// ── hook: poll /blocked while active; 404 ⇒ a phase project (stop, hide) ──
export interface BlockedState {
  items: BlockedItem[];
  failed: number;
  questions: number;
  reachable: boolean; // false once a 404 tells us this isn't a task_manager project
  reload: () => void;
}

export function useBlocked(botId: string | null, active: boolean): BlockedState {
  const [items, setItems] = useState<BlockedItem[]>([]);
  const [reachable, setReachable] = useState(true);
  const pollNow = useRef<() => void>(() => {});

  useEffect(() => {
    setItems([]); setReachable(true);
    if (!botId || !active) { pollNow.current = () => {}; return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (cancelled) return;
      let next = 12000; // error/back-off default
      try {
        const r = await getBlockedItems(botId);
        if (cancelled) return;
        const list = r.items || [];
        setItems(list); setReachable(true);
        next = list.length ? 9000 : 20000; // nothing blocked ⇒ check far less often
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) { if (!cancelled) { setItems([]); setReachable(false); } return; }
        // 401/403/429/network — keep the last snapshot, keep trying (relaxed)
      }
      if (!cancelled) timer = setTimeout(tick, next);
    };
    pollNow.current = () => { if (timer) clearTimeout(timer); void tick(); };
    void tick();
    return () => { cancelled = true; pollNow.current = () => {}; if (timer) clearTimeout(timer); };
  }, [botId, active]);

  const failed = items.filter(i => i.status === 'failed').length;
  const questions = items.filter(i => i.node_kind === 'question' || i.status === 'blocked').length;
  return { items, failed, questions, reachable, reload: () => pollNow.current() };
}

// ── badge: "Needs your input (N) / M failed" — tappable, hidden when empty ──
export function BlockedBadge({ T, state, onClick }: { T: Theme; state: BlockedState; onClick: () => void }) {
  if (!state.reachable || state.items.length === 0) return null;
  const anyFailed = state.failed > 0;
  const color = anyFailed ? T.red : T.amber;
  const needsCount = state.items.length - state.failed;
  return (
    <button onClick={onClick} style={{
      ...btnReset, width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px',
      borderRadius: 14, background: hexA(color, 0.1), border: `1px solid ${hexA(color, 0.4)}`,
    }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: hexA(color, 0.18), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <TGIcon name={anyFailed ? 'shield' : 'chat'} size={18} color={color} stroke={2} />
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: T.text }}>
          {needsCount > 0 ? `Needs your input (${needsCount})` : `${state.failed} failed task${state.failed > 1 ? 's' : ''}`}
        </div>
        <div style={{ fontFamily: T.font, fontSize: 12.5, color, marginTop: 1 }}>
          {[needsCount > 0 && anyFailed ? `${state.failed} failed` : null,
            needsCount > 0 ? 'tap to resolve' : 'reopen or cancel'].filter(Boolean).join(' · ')}
        </div>
      </div>
      <TGIcon name="chevRight" size={18} color={color} stroke={2} />
    </button>
  );
}

// ── the inbox screen ──────────────────────────────────────────
export function TaskManagerInbox({ T, bot, onOpenTask }: {
  T: Theme; bot: MyBot; onOpenTask: (slug: string) => void;
}) {
  const state = useBlocked(bot.id, true);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLoaded(true), 400); return () => clearTimeout(t); }, [bot.id]);

  return (
    <div style={{ padding: '16px 16px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 2px' }}>
        <div style={{ fontFamily: T.font, fontSize: 21, fontWeight: 700, color: T.text, letterSpacing: -0.3 }}>Needs your input</div>
        {state.items.length > 0 && (
          <span style={{ fontFamily: T.font, fontSize: 13, color: T.hint }}>
            {state.items.length} item{state.items.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {!state.reachable && (
        <div style={{ fontFamily: T.font, fontSize: 13.5, color: T.hint, lineHeight: '19px', padding: '0 2px' }}>
          This bot uses the older phase pipeline — there's no task inbox for it.
        </div>
      )}

      {state.reachable && state.items.length === 0 && (
        <Card T={T} pad={0}>
          {loaded
            ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 15px' }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  background: T.nestedBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <TGIcon name="check" size={19} color={T.green} stroke={2.3} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 650, color: T.text }}>Inbox is clear</div>
                  <div style={{ fontFamily: T.font, fontSize: 12.8, color: T.hint, lineHeight: '17px', marginTop: 2 }}>
                    Questions, failed tasks, and review holds will appear here.
                  </div>
                </div>
              </div>
            )
            : (
              <div style={{ minHeight: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spinner color={T.accent} size={20} />
              </div>
            )}
        </Card>
      )}

      {state.items.map(it => (
        <InboxItem key={it.slug} T={T} bot={bot} item={it} onOpen={() => onOpenTask(it.slug)} onChanged={state.reload} />
      ))}
    </div>
  );
}

function kindMeta(T: Theme, it: BlockedItem): { icon: string; color: string; label: string } {
  if (it.status === 'failed') return { icon: 'refresh', color: T.red, label: 'Failed' };
  if (it.node_kind === 'question') return { icon: 'chat', color: T.amber, label: 'Question' };
  if (it.node_kind === 'review') return { icon: 'shield', color: T.red, label: 'Review' };
  return { icon: 'clock', color: T.amber, label: 'Blocked' };
}

function InboxItem({ T, bot, item, onOpen, onChanged }: {
  T: Theme; bot: MyBot; item: BlockedItem; onOpen: () => void; onChanged: () => void;
}) {
  const [busy, setBusy] = useState<'reopen' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const m = kindMeta(T, item);
  const isFailed = item.status === 'failed';
  const isQuestion = item.node_kind === 'question' || item.status === 'blocked';

  const reopen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy('reopen'); setError(null);
    try { await reopenTask(bot.id, item.slug); onChanged(); }
    catch (err) { setError(errText(err)); }
    finally { setBusy(null); }
  };
  const cancelReview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy('cancel'); setError(null);
    try { await cancelTask(bot.id, item.slug, true); setConfirmCancel(false); onChanged(); }
    catch (err) { setError(errText(err)); }
    finally { setBusy(null); }
  };

  return (
    <Card T={T} pad={0} style={item.warning ? { border: `1px solid ${hexA(T.red, 0.4)}` } : undefined}>
      <button onClick={onOpen} style={{ ...btnReset, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 11, padding: '13px 14px' }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: hexA(m.color, 0.16), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <TGIcon name={m.icon} size={17} color={m.color} stroke={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Pill T={T} tone="neutral" style={{ color: m.color, background: hexA(m.color, 0.14), height: 19, fontSize: 10, padding: '0 7px' }}>{m.label}</Pill>
            {item.blocked_since && <span style={{ fontFamily: T.font, fontSize: 11.5, color: T.hint }}>{relTime(item.blocked_since)}</span>}
          </div>
          <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 600, color: T.text, lineHeight: '19px', marginTop: 4 }}>{item.title || item.slug}</div>
          <div style={{ fontFamily: T.font, fontSize: 12, color: T.hint, marginTop: 2 }}>
            {isFailed ? 'Retry budget exhausted — reopen to try again'
              : isQuestion ? 'Tap to answer and unblock the build'
              : 'Waiting on an owner action'}
          </div>
        </div>
        <span style={{ marginTop: 4, display: 'flex' }}><TGIcon name="chevRight" size={18} color={T.hint} stroke={2} /></span>
      </button>

      {/* review holding the go-live gate — warning verbatim + cancel escape */}
      {item.warning && (
        <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 10, background: T.redSoft }}>
            <TGIcon name="shield" size={15} color={T.red} stroke={2} />
            <span style={{ fontFamily: T.font, fontSize: 12.5, color: T.red, lineHeight: '17px' }}>{item.warning}</span>
          </div>
          {!confirmCancel ? (
            <button onClick={e => { e.stopPropagation(); setConfirmCancel(true); }} style={cancelBtn(T)}>Cancel review</button>
          ) : (
            <div style={{ display: 'flex', gap: 9 }}>
              <button onClick={e => { e.stopPropagation(); setConfirmCancel(false); }} style={{
                ...btnReset, flex: 1, height: 38, borderRadius: 10, background: T.nestedBg,
                color: T.text, fontFamily: T.font, fontSize: 13.5, fontWeight: 600,
              }}>Keep it</button>
              <button onClick={cancelReview} disabled={busy === 'cancel'} style={{ ...cancelBtn(T), flex: 1, background: T.red, color: '#fff' }}>
                {busy === 'cancel' ? <Spinner size={14} /> : null} Cancel review
              </button>
            </div>
          )}
        </div>
      )}

      {/* failed → inline reopen */}
      {isFailed && !item.warning && (
        <div style={{ padding: '0 14px 12px' }}>
          <button onClick={reopen} disabled={busy === 'reopen'} style={{
            ...btnReset, width: '100%', height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            background: T.accentSoft, color: T.accent, fontFamily: T.font, fontSize: 14, fontWeight: 600,
          }}>
            {busy === 'reopen' ? <Spinner size={15} color={T.accent} /> : <TGIcon name="refresh" size={16} color={T.accent} stroke={2} />} Reopen task
          </button>
        </div>
      )}

      {error && (
        <div style={{ padding: '0 14px 12px', fontFamily: T.font, fontSize: 12.5, color: T.amber, lineHeight: '17px' }}>{error}</div>
      )}
    </Card>
  );
}

function cancelBtn(T: Theme): React.CSSProperties {
  return {
    ...btnReset, height: 38, padding: '0 14px', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    background: T.redSoft, color: T.red, fontFamily: T.font, fontSize: 13.5, fontWeight: 600,
  };
}

function errText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return `Slow down — ${e.message}`;
    return e.warning || `${e.message}${e.details ? ` — ${e.details}` : ''}`;
  }
  return 'network error — try again';
}
