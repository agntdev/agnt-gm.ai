// TaskDetail — the per-task panel for the task_manager flow. Opened by tapping a
// card on the board or an item in the inbox; rendered by App as an overlay.
//
// Shows the full task (body_md, spec_body, skill_refs, attempt_count,
// blocked_since, parent epic, claimers) + the clarification thread (comments
// coloured by author_role; kind='answer' marked as the resolving reply), and
// the owner actions that move the DAG forward:
//   • Answer  — node_kind='question' && open → POST /answer (resolves + unblocks)
//   • Note    — any task → POST /comments (non-resolving)
//   • Cancel  — non-terminal → POST /cancel (review tasks need a confirm; the
//               409 `warning` is shown verbatim before re-sending ?confirm=true)
//   • Reopen  — failed → POST /reopen
import { useEffect, useRef, useState } from 'react';
import { Theme, btnReset, hexA } from '../theme';
import { useT, useLang, tr, type Lang } from '../i18n';
import {
  ApiError, TaskComment, TaskDetail as TaskFull, ClaimerBrief,
  getTaskDetail, getTaskThread, answerQuestion, addTaskComment, cancelTask, reopenTask,
} from '../api/client';
import { openExternal } from '../telegram';
import { TGIcon, Card, Pill, Spinner } from '../ui';
import { relTime } from './Activity';

const TERMINAL = new Set(['done', 'cancelled']);

// Russian noun pluralisation (1 попытка / 2 попытки / 5 попыток).
function ruPlural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
function attemptsLabel(lang: Lang, n: number): string {
  return lang === 'ru'
    ? `${n} ${ruPlural(n, 'попытка', 'попытки', 'попыток')}`
    : `${n} attempt${n > 1 ? 's' : ''}`;
}

// status → badge tone/label (mirrors the board buckets)
function statusMeta(T: Theme, lang: Lang, status?: string): { label: string; color: string; bg: string } {
  switch (status) {
    case 'in_progress': return { label: tr(lang, 'Building', 'В процессе'), color: T.accent, bg: T.accentSoft };
    case 'in_review': return { label: tr(lang, 'In review', 'На ревью'), color: T.accent, bg: T.accentSoft };
    case 'blocked': return { label: tr(lang, 'Needs you', 'Требуется решение'), color: T.amber, bg: hexA(T.amber, 0.14) };
    case 'done': return { label: tr(lang, 'Done', 'Готово'), color: T.green, bg: T.greenSoft };
    case 'failed': return { label: tr(lang, 'Failed', 'Ошибка'), color: T.red, bg: T.redSoft };
    case 'cancelled': return { label: tr(lang, 'Cancelled', 'Отменено'), color: T.hint, bg: hexA(T.hint, 0.12) };
    default: return { label: tr(lang, 'Open', 'Открыта'), color: T.sub, bg: hexA(T.hint, 0.12) };
  }
}

function roleColor(T: Theme, role?: string, kind?: string): string {
  if (kind === 'answer') return T.green;
  if (role === 'owner') return T.accent;
  if (role === 'system') return T.hint;
  return T.sub; // agent
}

export function TaskDetail({ T, projectId, slug, onClose, onChanged }: {
  T: Theme; projectId: string; slug: string;
  onClose: () => void;
  onChanged?: () => void; // a state-changing action landed → let the board/inbox refresh
}) {
  const [task, setTask] = useState<TaskFull | null>(null);
  const [loadingTask, setLoadingTask] = useState(true);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [answerText, setAnswerText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState<'answer' | 'note' | 'cancel' | 'reopen' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelWarning, setCancelWarning] = useState<string | null>(null); // 409 confirm-to-cancel-review
  const [unblocked, setUnblocked] = useState<string[] | null>(null);
  const threadCanFetch = useRef(true); // 403/404 → stop hammering the thread poll
  const t = useT();
  const { lang } = useLang();

  const refreshTask = async () => {
    const d = await getTaskDetail(projectId, slug);
    setTask(d);
    setLoadingTask(false);
  };

  useEffect(() => {
    setTask(null); setLoadingTask(true); setComments([]);
    setAnswerText(''); setNoteText(''); setBusy(null);
    setActionError(null); setCancelWarning(null); setUnblocked(null);
    threadCanFetch.current = true;
    void refreshTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, slug]);

  // poll the thread ~3s while open
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (cancelled || !threadCanFetch.current) return;
      try {
        const r = await getTaskThread(projectId, slug);
        if (!cancelled) setComments(r.comments || []);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) threadCanFetch.current = false;
      }
      if (!cancelled) timer = setTimeout(tick, 5000);
    };
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [projectId, slug]);

  const status = task?.status;
  const isQuestion = task?.node_kind === 'question';
  const isReview = task?.node_kind === 'review';
  const canAnswer = isQuestion && status === 'open';
  const canReopen = status === 'failed';
  const canCancel = !!status && !TERMINAL.has(status);
  const meta = statusMeta(T, lang, status);
  const claimers = (task?.claimers || []) as ClaimerBrief[];

  const afterAction = async () => { await refreshTask(); onChanged?.(); threadCanFetch.current = true; };

  const sendAnswer = async () => {
    const body = answerText.trim();
    if (!body || busy) return;
    setBusy('answer'); setActionError(null);
    try {
      const r = await answerQuestion(projectId, slug, body);
      setAnswerText(''); setUnblocked(r.unblocked || []);
      await afterAction();
    } catch (e) { setActionError(errText(e, lang)); }
    finally { setBusy(null); }
  };

  const sendNote = async () => {
    const body = noteText.trim();
    if (!body || busy) return;
    setBusy('note'); setActionError(null);
    try { await addTaskComment(projectId, slug, body); setNoteText(''); await afterAction(); }
    catch (e) { setActionError(errText(e, lang)); }
    finally { setBusy(null); }
  };

  const doCancel = async (confirm = false) => {
    if (busy) return;
    setBusy('cancel'); setActionError(null);
    try {
      await cancelTask(projectId, slug, confirm);
      setCancelWarning(null);
      await afterAction();
    } catch (e) {
      // review tasks 409 with an actionable warning — show it verbatim, then re-send confirmed
      if (e instanceof ApiError && e.status === 409 && e.warning) setCancelWarning(e.warning);
      else setActionError(errText(e, lang));
    } finally { setBusy(null); }
  };

  const doReopen = async () => {
    if (busy) return;
    setBusy('reopen'); setActionError(null);
    try { await reopenTask(projectId, slug); await afterAction(); }
    catch (e) { setActionError(errText(e, lang)); }
    finally { setBusy(null); }
  };

  const pr = task?.pr_url;
  const issue = task?.github_issue_url;
  const skills = task?.skill_refs || [];

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.42)',
      display: 'flex', alignItems: 'flex-end', animation: 'tgfade .2s ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxHeight: '90vh', background: T.cardBg,
        borderTopLeftRadius: 22, borderTopRightRadius: 22, display: 'flex', flexDirection: 'column',
        animation: 'tgsheet .3s cubic-bezier(.2,.8,.2,1)',
      }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: T.sep, margin: '8px auto 2px', flexShrink: 0 }} />

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 16px 10px', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Pill T={T} tone="neutral" style={{ color: meta.color, background: meta.bg, height: 22, fontSize: 11.5 }}>{meta.label}</Pill>
              {task?.node_kind && task.node_kind !== 'feature' && (
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.hint }}>{task.node_kind}</span>
              )}
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.hint }}>{slug}</span>
            </div>
            <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: -0.2, marginTop: 6, lineHeight: '23px' }}>
              {task?.title || slug}
            </div>
          </div>
          <button onClick={onClose} style={{ ...btnReset, width: 32, height: 32, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,22,32,0.05)' }}>
            <TGIcon name="close" size={18} color={T.hint} stroke={2.2} />
          </button>
        </div>

        {/* scrollable body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loadingTask && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 0' }}>
              <Spinner color={T.hint} size={15} />
              <span style={{ fontFamily: T.font, fontSize: 13, color: T.hint }}>{t('Loading task…', 'Загрузка задачи…')}</span>
            </div>
          )}

          {/* meta line */}
          {task && (
            <div style={{ fontFamily: T.font, fontSize: 12, color: T.hint, lineHeight: '17px' }}>
              {[
                typeof task.attempt_count === 'number' && task.attempt_count > 0 ? attemptsLabel(lang, task.attempt_count) : null,
                task.blocked_since ? tr(lang, `blocked ${relTime(task.blocked_since)}`, `заблокирована ${relTime(task.blocked_since)}`) : null,
                task.parent_id ? t('in an epic', 'в эпике') : null,
                task.assignee_type === 'owner' ? t('owner task', 'задача владельца') : null,
              ].filter(Boolean).join(' · ') || null}
            </div>
          )}

          {/* why it failed — the API exposes no granular per-task reason today,
              so explain the documented meaning of 'failed' (retry budget
              exhausted), preferring a real failure_reason if the backend sends one */}
          {status === 'failed' && (
            <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 12, background: T.redSoft }}>
              <TGIcon name="refresh" size={16} color={T.red} stroke={2} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 700, color: T.red, lineHeight: '17px' }}>{t('Why it failed', 'Почему не удалось')}</div>
                <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.sub, lineHeight: '17px', marginTop: 3 }}>
                  {task?.failure_reason
                    || (lang === 'ru'
                      ? 'Агент сборки исчерпал бюджет попыток и остановился. Нажмите «Открыть заново» ниже, чтобы попробовать ещё раз.'
                      : `The build agent used up its retry budget${typeof task?.attempt_count === 'number' && task.attempt_count > 0 ? ` after ${task.attempt_count} attempt${task.attempt_count > 1 ? 's' : ''}` : ''} and stopped. Reopen below to let it try again.`)}
                </div>
              </div>
            </div>
          )}

          {/* claimers */}
          {claimers.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex' }}>
                {claimers.slice(0, 3).map((c, i) => (
                  <div key={(c.agent_id || '') + i} style={{
                    width: 22, height: 22, borderRadius: 999, marginLeft: i ? -6 : 0, border: `1.5px solid ${T.cardBg}`,
                    background: T.accentSoft, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: T.font, fontSize: 10, fontWeight: 700, overflow: 'hidden',
                  }}>
                    {c.avatar_url ? <img src={c.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : (c.username || c.agent_id || '?').charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
              <span style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint }}>
                {claimers.map(c => c.username ? `@${c.username}` : (c.agent_id || 'agent').slice(0, 6)).slice(0, 2).join(', ')} {t('working', 'в работе')}
              </span>
            </div>
          )}

          {/* body */}
          {task?.body_md && (
            <div style={{ fontFamily: T.font, fontSize: 14, color: T.text, lineHeight: '20px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {task.body_md}
            </div>
          )}

          {/* resolved spec details the task references */}
          {task?.spec_body && (
            <div>
              <SubLabel T={T}>{t('Details', 'Детали')}</SubLabel>
              <Card T={T} pad={12} style={{ background: T.inputBg }}>
                <div style={{ fontFamily: T.font, fontSize: 13, color: T.sub, lineHeight: '19px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{task.spec_body}</div>
              </Card>
            </div>
          )}

          {/* skills */}
          {skills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {skills.map(s => (
                <span key={s} style={{ fontFamily: T.mono, fontSize: 11, color: T.sub, padding: '3px 8px', borderRadius: 7, background: T.dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,22,32,0.04)' }}>{s}</span>
              ))}
            </div>
          )}

          {/* links */}
          {(pr || issue) && (
            <div style={{ display: 'flex', gap: 8 }}>
              {pr && <LinkChip T={T} label={t('View PR', 'Открыть PR')} onClick={() => openExternal(pr)} />}
              {issue && <LinkChip T={T} label={t('GitHub issue', 'Issue на GitHub')} onClick={() => openExternal(issue)} />}
            </div>
          )}

          {/* thread */}
          <div>
            <SubLabel T={T}>{t('Thread', 'Обсуждение')}</SubLabel>
            {comments.length === 0 ? (
              <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint }}>{t('No messages yet.', 'Пока нет сообщений.')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {comments.map(c => {
                  const fg = roleColor(T, c.author_role, c.kind);
                  const isAnswer = c.kind === 'answer';
                  return (
                    <div key={c.id} style={{
                      borderLeft: `2.5px solid ${fg}`, paddingLeft: 10,
                      background: isAnswer ? T.greenSoft : 'transparent', borderRadius: isAnswer ? 8 : 0,
                      padding: isAnswer ? '8px 10px' : '2px 0 2px 10px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontFamily: T.font, fontSize: 11.5, fontWeight: 700, color: fg, textTransform: 'capitalize' }}>{c.author_role || 'agent'}</span>
                        {isAnswer && <span style={{ fontFamily: T.font, fontSize: 10.5, fontWeight: 600, color: T.green }}>· {t('answer', 'ответ')}</span>}
                        {c.created_at && <span style={{ fontFamily: T.font, fontSize: 11, color: T.hint }}>{relTime(c.created_at)}</span>}
                      </div>
                      <div style={{ fontFamily: T.font, fontSize: 13.5, color: T.text, lineHeight: '19px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 2 }}>{c.body_md}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {unblocked && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: T.font, fontSize: 12.5, color: T.green }}>
              <TGIcon name="check" size={15} color={T.green} stroke={2.4} />
              {unblocked.length
                ? (lang === 'ru'
                    ? `Ответ отправлен — разблокировано ${unblocked.length} ${ruPlural(unblocked.length, 'задача', 'задачи', 'задач')}.`
                    : `Answered — unblocked ${unblocked.length} task${unblocked.length > 1 ? 's' : ''}.`)
                : t('Answered.', 'Ответ отправлен.')}
            </div>
          )}
          {actionError && (
            <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.amber, lineHeight: '17px' }}>{actionError}</div>
          )}
        </div>

        {/* action footer */}
        <div style={{
          flexShrink: 0, borderTop: `0.5px solid ${T.sep}`, padding: '11px 14px',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
          background: T.headerBg, display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {canAnswer && (
            <ActionBox T={T} placeholder={t('Type your answer to unblock the build…', 'Введите ответ, чтобы разблокировать сборку…')}
              value={answerText} onChange={setAnswerText} busy={busy === 'answer'}
              cta={t('Send answer', 'Отправить ответ')} onSend={sendAnswer} primary icon="check" />
          )}

          {/* note box — collapsible-feel: always available for back-and-forth */}
          {!loadingTask && task && (
            <ActionBox T={T} placeholder={t("Add a note (doesn't unblock)…", 'Добавить заметку (не разблокирует)…')}
              value={noteText} onChange={setNoteText} busy={busy === 'note'}
              cta={t('Note', 'Заметка')} onSend={sendNote} />
          )}

          {(canReopen || canCancel) && (
            <div style={{ display: 'flex', gap: 10 }}>
              {canReopen && (
                <button onClick={doReopen} disabled={!!busy} style={{
                  ...btnReset, flex: 1, height: 42, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  background: T.accent, color: '#fff', fontFamily: T.font, fontSize: 14, fontWeight: 600,
                }}>
                  {busy === 'reopen' ? <Spinner size={15} /> : <TGIcon name="refresh" size={16} color="#fff" stroke={2} />} {t('Reopen', 'Открыть заново')}
                </button>
              )}
              {canCancel && (
                <button onClick={() => doCancel(false)} disabled={!!busy} style={{
                  ...btnReset, flex: canReopen ? 'unset' : 1, padding: canReopen ? '0 16px' : 0, height: 42, borderRadius: 11,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  background: T.redSoft, color: T.red, fontFamily: T.font, fontSize: 14, fontWeight: 600,
                }}>
                  {busy === 'cancel' && !cancelWarning ? <Spinner size={15} color={T.red} /> : null}
                  {t('Cancel', 'Отменить')}{isReview ? t(' review', ' ревью') : ''}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* confirm-to-cancel-review — shows the 409 warning verbatim */}
      {cancelWarning && (
        <div onClick={e => { e.stopPropagation(); }} style={{
          position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22,
        }}>
          <Card T={T} pad={16} style={{ maxWidth: 360, width: '100%', border: `1px solid ${T.redSoft}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
              <TGIcon name="shield" size={18} color={T.red} stroke={2} />
              <span style={{ fontFamily: T.font, fontSize: 15, fontWeight: 700, color: T.text }}>{t('Cancel this review?', 'Отменить это ревью?')}</span>
            </div>
            <div style={{ fontFamily: T.font, fontSize: 13, color: T.sub, lineHeight: '19px' }}>{cancelWarning}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={() => setCancelWarning(null)} style={{
                ...btnReset, flex: 1, height: 42, borderRadius: 11, background: T.dark ? 'rgba(255,255,255,0.06)' : '#f3f5f8',
                color: T.text, fontFamily: T.font, fontSize: 14, fontWeight: 600,
              }}>{t('Keep it', 'Оставить')}</button>
              <button onClick={() => doCancel(true)} disabled={busy === 'cancel'} style={{
                ...btnReset, flex: 1, height: 42, borderRadius: 11, background: T.red, color: '#fff',
                fontFamily: T.font, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}>
                {busy === 'cancel' ? <Spinner size={15} /> : null} {t('Cancel review', 'Отменить ревью')}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function errText(e: unknown, lang: Lang): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return `${tr(lang, 'Slow down —', 'Не так быстро —')} ${e.message}`;
    return `${e.message}${e.details ? ` — ${e.details}` : ''}`;
  }
  return tr(lang, 'network error — try again', 'ошибка сети — попробуйте снова');
}

function ActionBox({ T, placeholder, value, onChange, onSend, busy, cta, primary, icon }: {
  T: Theme; placeholder: string; value: string; onChange: (v: string) => void; onSend: () => void;
  busy: boolean; cta: string; primary?: boolean; icon?: string;
}) {
  const can = !!value.trim() && !busy;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
      <textarea value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (can) onSend(); } }}
        placeholder={placeholder} rows={1}
        style={{
          flex: 1, resize: 'none', maxHeight: 90, minHeight: 40, padding: '10px 14px', borderRadius: 18,
          background: T.inputBg, border: `0.5px solid ${T.sep}`, color: T.text,
          fontFamily: T.font, fontSize: 14, lineHeight: '19px', outline: 'none', boxSizing: 'border-box',
        }} />
      <button onClick={can ? onSend : undefined} style={{
        ...btnReset, height: 40, padding: '0 14px', borderRadius: 12, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6,
        background: can ? (primary ? T.accent : T.accentSoft) : (T.dark ? '#243140' : '#dfe4ea'),
        color: can ? (primary ? '#fff' : T.accent) : T.hint,
        fontFamily: T.font, fontSize: 13.5, fontWeight: 600, cursor: can ? 'pointer' : 'default',
      }}>
        {busy ? <Spinner size={14} color={primary ? '#fff' : T.accent} /> : icon ? <TGIcon name={icon} size={14} color={can ? (primary ? '#fff' : T.accent) : T.hint} stroke={2.2} /> : null}
        {cta}
      </button>
    </div>
  );
}

function SubLabel({ T, children }: { T: Theme; children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: T.font, fontSize: 12, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 2px 7px' }}>{children}</div>
  );
}

function LinkChip({ T, label, onClick }: { T: Theme; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      ...btnReset, display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px',
      borderRadius: 9, background: T.accentSoft, color: T.accent, fontFamily: T.font, fontSize: 12.5, fontWeight: 600,
    }}>
      <TGIcon name="open" size={13} color={T.accent} stroke={2} />
      {label}
    </button>
  );
}
