// DagBoard — the task_manager "Build board": the living task DAG for a bot,
// adapted from the brief's primary screen to the mini-app's narrow viewport.
// Read-only. Renders straight off the raw /dag (node_kind + claimable), NOT the
// flattened fetchProjectTasks (which maps the meaningless task_kind). Owner
// actions (answer/cancel/reopen) live in the inbox/detail screens, not here.
//
// Grouping: epics (node_kind:'epic') are collapsible headers; children resolve
// via each task's parent_id, fetched per-task (gap #3) — that same fetch carries
// body_md, reused for tap-to-expand. Tasks with no resolvable epic fall under
// "General", so a missing id/parent_id degrades gracefully to a flat list.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Theme, btnReset, hexA } from '../theme';
import {
  DagTask, TaskDetail, ClaimerBrief, getProjectDag, getTaskDetail,
} from '../api/client';
import { openExternal } from '../telegram';
import { useT, useLang, tr, type Lang } from '../i18n';
import { TGIcon, Card, Pill, Dot, Spinner } from '../ui';
import { MyBot } from './MyBots';
import { relTime } from './Activity';

// ── status buckets — derived ONLY from status + claimable (never depends_on) ──
type Bucket = 'needsInput' | 'failed' | 'building' | 'review' | 'ready' | 'backlog' | 'done' | 'cancelled';

function bucketOf(t: DagTask): Bucket {
  switch (t.status) {
    case 'in_progress': return 'building';
    case 'in_review': return 'review';
    case 'blocked': return 'needsInput';
    case 'done': return 'done';
    case 'failed': return 'failed';
    case 'cancelled': return 'cancelled';
    case 'open':
    default:
      if (t.node_kind === 'question') return 'needsInput'; // owner-action card
      return t.claimable ? 'ready' : 'backlog'; // strictly the live gate verdict
  }
}

// active-work-first ordering inside a group
const RANK: Record<Bucket, number> = {
  needsInput: 0, failed: 1, building: 2, review: 3, ready: 4, backlog: 5, done: 6, cancelled: 7,
};

function bucketLabel(lang: Lang, b: Bucket): string {
  switch (b) {
    case 'needsInput': return tr(lang, 'Needs you', 'Требуется решение');
    case 'failed': return tr(lang, 'Failed', 'Ошибка');
    case 'building': return tr(lang, 'Building', 'В процессе');
    case 'review': return tr(lang, 'In review', 'На ревью');
    case 'ready': return tr(lang, 'Ready', 'Свободна');
    case 'backlog': return tr(lang, 'Backlog', 'Очередь');
    case 'done': return tr(lang, 'Done', 'Готово');
    case 'cancelled': return tr(lang, 'Cancelled', 'Отменено');
  }
}

// summary-bar order (cancelled excluded — it has its own collapsed lane)
const BAR_ORDER: Bucket[] = ['needsInput', 'failed', 'building', 'review', 'ready', 'backlog', 'done'];

function bucketColor(T: Theme, b: Bucket): string {
  if (b === 'needsInput') return T.amber;
  if (b === 'failed') return T.red;
  if (b === 'done') return T.green;
  if (b === 'building' || b === 'review' || b === 'ready') return T.accent;
  return T.hint; // backlog, cancelled
}

const isEpic = (t: DagTask) => t.node_kind === 'epic';
const isFix = (t: DagTask) => /^fix[-:]/i.test(t.slug);

// ── component ─────────────────────────────────────────────────
// onOpenTask (optional): when provided, tapping a task row opens the TaskDetail
// panel (the task_manager flow) instead of inline-expanding. Absent ⇒ unchanged
// inline-expand behaviour (the phase fallback).
// onKind (optional): reports the pipeline (task_manager once any row carries
// node_kind, else phase) off the board's OWN /dag poll — lets the BoardView
// wrapper discriminate without a second fetch and self-heal mid-decompose.
export function DagBoard({ T, bot, onOpenTask, onKind }: {
  T: Theme; bot: MyBot; onOpenTask?: (slug: string) => void;
  onKind?: (kind: 'task_manager' | 'phase') => void;
}) {
  const [tasks, setTasks] = useState<DagTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<Record<string, TaskDetail | 'loading' | 'none'>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<Bucket | null>(null);
  const [collapsedEpics, setCollapsedEpics] = useState<Record<string, boolean>>({});
  const [showCancelled, setShowCancelled] = useState(false);
  const [errored, setErrored] = useState(false); // /dag failing on first load (no snapshot yet)
  const requested = useRef<Set<string>>(new Set());
  const fails = useRef(0);
  const onKindRef = useRef(onKind);
  onKindRef.current = onKind;
  const t = useT();
  const { lang } = useLang();

  // report the pipeline off our own poll (node_kind ⇒ task_manager) so the
  // BoardView wrapper can route + self-heal without a separate /dag probe.
  useEffect(() => {
    if (tasks.length === 0) return;
    onKindRef.current?.(tasks.some(t => !!t.node_kind) ? 'task_manager' : 'phase');
  }, [tasks]);

  // fresh state per bot
  useEffect(() => {
    setTasks([]); setLoading(true); setDetails({});
    setExpanded(null); setFilter(null); setCollapsedEpics({}); setShowCancelled(false);
    setErrored(false); requested.current = new Set(); fails.current = 0;
  }, [bot.id]);

  // poll /dag — tight while building/decomposing, relaxed when settled. Cadence
  // is computed from the freshly-fetched snapshot (NOT state), so deps stay
  // [bot.id] and the tick doesn't re-fire itself the instant setTasks lands.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      let active = true; // network error ⇒ keep checking at the tight cadence
      try {
        const d = await getProjectDag(bot.id);
        if (cancelled) return;
        const fresh = d.tasks || [];
        setTasks(fresh);
        active = fresh.length === 0
          || fresh.some(t => t.status === 'in_progress' || t.status === 'in_review')
          || /decompos|generat|validat|progress|build/i.test(d.phase_status || '');
        fails.current = 0; setErrored(false);
      } catch {
        // keep the last snapshot; only flag an error after a couple of misses,
        // so a single mid-decompose blip doesn't flip the empty copy
        fails.current += 1;
        if (fails.current >= 2) setErrored(true);
      }
      if (cancelled) return;
      setLoading(false);
      timer = setTimeout(tick, active ? 4000 : 10000);
    };
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [bot.id]);

  // fetch each task's detail once — gives parent_id (grouping) + body_md (expand)
  useEffect(() => {
    tasks.forEach(t => {
      if (requested.current.has(t.slug)) return;
      requested.current.add(t.slug);
      setDetails(prev => ({ ...prev, [t.slug]: 'loading' }));
      void getTaskDetail(bot.id, t.slug).then(d =>
        setDetails(prev => ({ ...prev, [t.slug]: d ?? 'none' })));
    });
  }, [tasks, bot.id]);

  const toggleExpand = (slug: string) => setExpanded(p => (p === slug ? null : slug));

  // map epic id → slug, so a child's parent_id resolves to an epic on the board
  const idToSlug = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [slug, d] of Object.entries(details)) {
      if (d && d !== 'loading' && d !== 'none' && d.id) m[d.id] = slug;
    }
    return m;
  }, [details]);

  const epics = useMemo(() => tasks.filter(isEpic), [tasks]);
  const hasNodeKind = useMemo(() => tasks.some(t => !!t.node_kind), [tasks]);

  // which epic (if any) a leaf belongs to — undefined ⇒ "General"
  const epicSlugFor = (t: DagTask): string | undefined => {
    const d = details[t.slug];
    const pid = d && d !== 'loading' && d !== 'none' ? d.parent_id : undefined;
    if (!pid) return undefined;
    const slug = idToSlug[pid];
    return slug && epics.some(e => e.slug === slug) ? slug : undefined;
  };

  const passesFilter = (t: DagTask) => !filter || bucketOf(t) === filter;
  const sortTasks = (arr: DagTask[]) =>
    [...arr].sort((a, b) => RANK[bucketOf(a)] - RANK[bucketOf(b)]);

  // partition (excluding cancelled, which gets its own lane)
  const leaves = tasks.filter(t => !isEpic(t) && bucketOf(t) !== 'cancelled');
  const cancelled = tasks.filter(t => !isEpic(t) && bucketOf(t) === 'cancelled');
  const general = sortTasks(leaves.filter(t => !epicSlugFor(t)).filter(passesFilter));
  const epicGroups = epics.map(epic => ({
    epic,
    children: sortTasks(leaves.filter(t => epicSlugFor(t) === epic.slug)),
  }));

  // epic membership only resolves once per-task details land — until then a
  // leaf sits in "General" and its epic looks empty. Gate the "empty" copy on
  // this so we never assert "No tasks" / "0/0" before we actually know.
  const detailsPending = tasks.some(t => {
    const d = details[t.slug];
    return d === undefined || d === 'loading';
  });

  // counts for the summary bar (over everything but cancelled)
  const counts = useMemo(() => {
    const c = {} as Record<Bucket, number>;
    tasks.filter(t => !isEpic(t)).forEach(t => {
      const b = bucketOf(t);
      c[b] = (c[b] || 0) + 1;
    });
    return c;
  }, [tasks]);

  const total = leaves.length;
  const done = counts.done || 0;
  const failedReviewHoldingGoLive = tasks.some(t => t.node_kind === 'review' && t.status === 'failed');

  // ── empty / loading / legacy ──
  if (loading && tasks.length === 0) {
    return (
      <Centered T={T}><Spinner color={T.accent} size={22} />
        <span style={{ fontFamily: T.font, fontSize: 14, color: T.hint }}>{t('Loading the board…', 'Загрузка доски…')}</span>
      </Centered>
    );
  }
  if (tasks.length === 0) {
    return (
      <Centered T={T}><Spinner color={T.accent} size={20} />
        <span style={{ fontFamily: T.font, fontSize: 14.5, color: T.hint, textAlign: 'center', maxWidth: 260 }}>
          {errored
            ? t("Couldn't reach the build server — retrying…", 'Не удалось связаться с сервером сборки — повторная попытка…')
            : t('Decomposing your idea into a task graph — tasks will appear here in a moment.', 'Разбиваем вашу идею на граф задач — задачи скоро появятся здесь.')}
        </span>
      </Centered>
    );
  }

  return (
    <div style={{ padding: '14px 16px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* heading + progress */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 2px' }}>
        <div style={{ fontFamily: T.font, fontSize: 21, fontWeight: 700, color: T.text, letterSpacing: -0.3 }}>{t('Build board', 'Доска сборки')}</div>
        <div style={{ fontFamily: T.font, fontSize: 13, color: T.hint }}>{done}/{total} {t('done', 'готово')}</div>
      </div>

      {!hasNodeKind && (
        <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, lineHeight: '17px', padding: '0 2px' }}>
          {t('This bot uses the older phase pipeline — its build is tracked on the overview. Shown below as a flat task list.', 'Этот бот использует старый конвейер фаз — его сборка отслеживается на обзоре. Ниже показан плоский список задач.')}
        </div>
      )}

      {/* failed review holds the go-live gate */}
      {failedReviewHoldingGoLive && (
        <Card T={T} pad={12} style={{ border: `1px solid ${T.redSoft}`, background: T.redSoft }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <TGIcon name="shield" size={16} color={T.red} stroke={2} />
            <span style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.red, lineHeight: '17px' }}>
              {t("A review failed — it's holding the go-live gate until it's resolved.", 'Ревью завершилось ошибкой — оно блокирует запуск, пока не будет решено.')}
            </span>
          </div>
        </Card>
      )}

      {/* status summary bar — filters the board */}
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '0 2px 2px', margin: '0 -2px' }}>
        <FilterChip T={T} label={t('All', 'Все')} count={total} active={filter === null} color={T.accent}
          onClick={() => setFilter(null)} />
        {BAR_ORDER.filter(b => counts[b]).map(b => (
          <FilterChip key={b} T={T} label={bucketLabel(lang, b)} count={counts[b]}
            active={filter === b} color={bucketColor(T, b)} onClick={() => setFilter(f => (f === b ? null : b))} />
        ))}
      </div>

      {/* General (ungrouped) — header only when epics exist */}
      {general.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {epics.length > 0 && <GroupLabel T={T}>{t('General', 'Общие')}</GroupLabel>}
          <Card T={T} pad={0}>
            {general.map((t, i) => (
              <TaskRow key={t.slug} T={T} t={t} first={i === 0}
                detail={details[t.slug]} open={expanded === t.slug} onToggle={() => toggleExpand(t.slug)}
                onOpen={onOpenTask ? () => onOpenTask(t.slug) : undefined} />
            ))}
          </Card>
        </div>
      )}

      {/* epic groups */}
      {epicGroups.map(({ epic, children }) => {
        const collapsed = collapsedEpics[epic.slug] && !filter; // a filter forces epics open so matches stay visible
        const shown = children.filter(passesFilter);
        if (filter && shown.length === 0) return null; // group fully filtered out
        const epicDone = children.filter(c => bucketOf(c) === 'done').length;
        return (
          <div key={epic.slug}>
            <Card T={T} pad={0}>
              <button onClick={() => setCollapsedEpics(p => ({ ...p, [epic.slug]: !p[epic.slug] }))} style={{
                ...btnReset, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px',
              }}>
                <div style={{ width: 28, height: 28, borderRadius: 9, background: T.nestedBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TGIcon name="server" size={15} color={T.hint} stroke={1.9} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{epic.title}</div>
                  <div style={{ fontFamily: T.font, fontSize: 11.5, color: T.hint, marginTop: 1 }}>
                    {t('Epic', 'Эпик')} · {children.length === 0 && detailsPending ? t('loading…', 'загрузка…') : `${epicDone}/${children.length} ${t('done', 'готово')}`}
                  </div>
                </div>
                <TGIcon name={collapsed ? 'chevRight' : 'chevDown'} size={16} color={T.hint} stroke={2} />
              </button>
              {!collapsed && shown.map(t => (
                <TaskRow key={t.slug} T={T} t={t} first={false} nested
                  detail={details[t.slug]} open={expanded === t.slug} onToggle={() => toggleExpand(t.slug)}
                  onOpen={onOpenTask ? () => onOpenTask(t.slug) : undefined} />
              ))}
              {!collapsed && shown.length === 0 && (
                <div style={{ padding: '10px 14px', borderTop: `0.5px solid ${T.sep}`, display: 'flex', alignItems: 'center', gap: 8, fontFamily: T.font, fontSize: 12.5, color: T.hint }}>
                  {detailsPending
                    ? <><Spinner color={T.hint} size={12} /> {t('Loading tasks…', 'Загрузка задач…')}</>
                    : t('No tasks in this epic yet.', 'В этом эпике пока нет задач.')}
                </div>
              )}
            </Card>
          </div>
        );
      })}

      {/* filtered-to-nothing */}
      {filter && general.length === 0 && epicGroups.every(g => g.children.filter(passesFilter).length === 0) && (
        <div style={{ fontFamily: T.font, fontSize: 13.5, color: T.hint, textAlign: 'center', padding: '12px 0' }}>
          {lang === 'ru'
            ? `Нет задач в статусе «${bucketLabel(lang, filter).toLowerCase()}».`
            : `No ${bucketLabel(lang, filter).toLowerCase()} tasks.`}
        </div>
      )}

      {/* cancelled lane — collapsed */}
      {cancelled.length > 0 && (
        <div>
          <button onClick={() => setShowCancelled(v => !v)} style={{
            ...btnReset, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 2px',
            fontFamily: T.font, fontSize: 12.5, fontWeight: 600, color: T.hint,
          }}>
            <TGIcon name={showCancelled ? 'chevDown' : 'chevRight'} size={14} color={T.hint} stroke={2} />
            {t('Cancelled', 'Отменено')} ({cancelled.length})
          </button>
          {showCancelled && (
            <Card T={T} pad={0} style={{ marginTop: 6, opacity: 0.7 }}>
              {sortTasks(cancelled).map((t, i) => (
                <TaskRow key={t.slug} T={T} t={t} first={i === 0}
                  detail={details[t.slug]} open={expanded === t.slug} onToggle={() => toggleExpand(t.slug)}
                  onOpen={onOpenTask ? () => onOpenTask(t.slug) : undefined} />
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ── a single task row (collapsed line + expandable detail) ────
// onOpen (optional): tap navigates to the TaskDetail panel instead of
// inline-expanding (task_manager flow). When set, the inline body is suppressed.
function TaskRow({ T, t, first, nested, detail, open, onToggle, onOpen }: {
  T: Theme; t: DagTask; first: boolean; nested?: boolean;
  detail: TaskDetail | 'loading' | 'none' | undefined; open: boolean; onToggle: () => void;
  onOpen?: () => void;
}) {
  const { lang } = useLang();
  const navigates = !!onOpen;
  const isOpen = navigates ? false : open;
  const b = bucketOf(t);
  const color = bucketColor(T, b);
  const d = detail && detail !== 'loading' && detail !== 'none' ? detail : null;
  const pr = t_pr(t, d);
  const issue = d?.github_issue_url;
  const claimers = (t.claimers || []) as ClaimerBrief[];

  return (
    <div style={{ borderTop: first ? 'none' : `0.5px solid ${T.sep}` }}>
      <button onClick={onOpen || onToggle} style={{
        ...btnReset, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
        padding: nested ? '10px 14px 10px 16px' : '11px 14px',
        opacity: !isOpen && b === 'done' ? 0.7 : 1,
      }}>
        {b === 'done'
          ? <TGIcon name="check" size={15} color={T.green} stroke={2.6} />
          : <Dot color={color} size={7} pulse={b === 'building'} />}
        <span style={{
          flex: 1, fontFamily: T.font, fontSize: 13.5, color: T.text, lineHeight: '18px',
          ...(isOpen ? {} : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
        }}>{t.title}</span>
        <NodeBadges T={T} t={t} b={b} />
        <TGIcon name={navigates ? 'chevRight' : 'chevDown'} size={14} color={T.hint} stroke={2} />
      </button>

      {isOpen && (
        <div style={{ padding: nested ? '0 14px 13px 40px' : '0 14px 13px 31px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {/* meta line */}
          <div style={{ fontFamily: T.font, fontSize: 12, color: T.hint }}>
            {[bucketLabel(lang, b), t.node_kind && t.node_kind !== 'feature' ? t.node_kind : null,
              t.depends_on?.length ? tr(lang, `depends on ${t.depends_on.length}`, `зависит от ${t.depends_on.length}`) : null,
              d?.blocked_since ? tr(lang, `blocked ${relTime(d.blocked_since)}`, `заблокирована ${relTime(d.blocked_since)}`) : null,
            ].filter(Boolean).join(' · ')}
          </div>

          {/* backlog reason — why it isn't claimable yet */}
          {b === 'backlog' && t.claim_reason && (
            <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.amber, lineHeight: '17px' }}>{t.claim_reason}</div>
          )}

          {/* claimers (soft-claims) */}
          {claimers.length > 0 && (
            <ClaimerStack T={T} claimers={claimers} />
          )}

          {/* body */}
          {detail === 'loading' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Spinner color={T.hint} size={13} />
              <span style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint }}>{tr(lang, 'Loading details…', 'Загрузка деталей…')}</span>
            </div>
          )}
          {d?.body_md && (
            <div style={{
              fontFamily: T.font, fontSize: 13, color: T.sub, lineHeight: '19px',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflowY: 'auto',
            }}>{d.body_md}</div>
          )}
          {(detail === 'none' || (d && !d.body_md)) && !t.claim_reason && (
            <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint }}>{tr(lang, 'No further details for this task.', 'Больше деталей по этой задаче нет.')}</div>
          )}

          {/* skills the task references */}
          {d?.skill_refs && d.skill_refs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {d.skill_refs.map(s => (
                <span key={s} style={{
                  fontFamily: T.mono, fontSize: 11, color: T.sub, padding: '2px 8px', borderRadius: 7,
                  background: T.nestedBg,
                }}>{s}</span>
              ))}
            </div>
          )}

          {/* links */}
          {(pr || issue) && (
            <div style={{ display: 'flex', gap: 8 }}>
              {pr && <LinkChip T={T} label={tr(lang, 'View PR', 'Открыть PR')} onClick={() => openExternal(pr)} />}
              {issue && <LinkChip T={T} label={tr(lang, 'GitHub issue', 'Issue на GitHub')} onClick={() => openExternal(issue)} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// PR link can ride on the dag row or the per-task detail
function t_pr(_t: DagTask, d: TaskDetail | null): string | undefined {
  return d?.pr_url;
}

// the right-side badges: Ready/Backlog, node_kind (question/review/fix)
function NodeBadges({ T, t, b }: { T: Theme; t: DagTask; b: Bucket }) {
  const { lang } = useLang();
  if (t.node_kind === 'review') {
    const failed = t.status === 'failed';
    return (
      <Pill T={T} tone={failed ? 'neutral' : 'accent'} style={failed ? { color: T.red, background: T.redSoft, height: 19, fontSize: 10, padding: '0 7px' } : { height: 19, fontSize: 10, padding: '0 7px' }}>
        {failed ? tr(lang, 'go-live', 'запуск') : tr(lang, 'review', 'ревью')}
      </Pill>
    );
  }
  if (t.node_kind === 'question') {
    return <Pill T={T} tone="neutral" style={{ color: T.amber, background: hexA(T.amber, 0.14), height: 19, fontSize: 10, padding: '0 7px' }}>{tr(lang, 'answer', 'ответ')}</Pill>;
  }
  // Ready / Backlog for actionable open tasks; nothing for in-flight/terminal
  if (b === 'ready') return <Pill T={T} tone="accent" style={{ height: 19, fontSize: 10, padding: '0 7px' }}>{tr(lang, 'Ready', 'Свободна')}</Pill>;
  if (b === 'backlog') return <Pill T={T} tone="neutral" style={{ height: 19, fontSize: 10, padding: '0 7px' }}>{tr(lang, 'Backlog', 'Очередь')}</Pill>;
  if (isFix(t)) return <Pill T={T} tone="neutral" style={{ height: 19, fontSize: 10, padding: '0 7px' }}>{tr(lang, 'fix', 'фикс')}</Pill>;
  return null;
}

function ClaimerStack({ T, claimers }: { T: Theme; claimers: ClaimerBrief[] }) {
  const { lang } = useLang();
  const shown = claimers.slice(0, 3);
  const label = claimers
    .map(c => (c.username ? `@${c.username}` : (c.agent_id || 'agent').slice(0, 6)))
    .slice(0, 2)
    .join(', ');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex' }}>
        {shown.map((c, i) => (
          <div key={c.agent_id + i} style={{
            width: 20, height: 20, borderRadius: 999, marginLeft: i ? -6 : 0, border: `1.5px solid ${T.cardBg}`,
            background: T.accentSoft, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: T.font, fontSize: 9, fontWeight: 700, overflow: 'hidden',
          }}>
            {c.avatar_url
              ? <img src={c.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (c.username || c.agent_id || '?').charAt(0).toUpperCase()}
          </div>
        ))}
      </div>
      <span style={{ fontFamily: T.font, fontSize: 12, color: T.hint }}>
        {claimers.length === 1 ? `${label} ${tr(lang, 'working', 'в работе')}` : `${label}${claimers.length > 2 ? ` +${claimers.length - 2}` : ''} ${tr(lang, 'working', 'в работе')}`}
      </span>
    </div>
  );
}

function FilterChip({ T, label, count, active, color, onClick }: {
  T: Theme; label: string; count: number; active: boolean; color: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      ...btnReset, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px',
      borderRadius: 999, fontFamily: T.font, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
      background: active ? hexA(color, 0.12) : T.nestedBg,
      color: active ? color : T.sub,
      border: `1px solid ${active ? hexA(color, 0.4) : 'transparent'}`,
    }}>
      {label}
      <span style={{ fontFamily: T.mono, fontSize: 11, opacity: 0.85 }}>{count}</span>
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

function GroupLabel({ T, children }: { T: Theme; children: ReactNode }) {
  return (
    <div style={{ fontFamily: T.font, fontSize: 12.5, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 4px 8px' }}>{children}</div>
  );
}

function Centered({ T, children }: { T: Theme; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '60px 24px', minHeight: 240 }}>
      {children}
    </div>
  );
}
