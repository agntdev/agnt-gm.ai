// TaskManagerBoard — the primary living-DAG board for task_manager bots.
//
// The board engine (epic-grouped kanban: Needs-you · Failed · Building · In
// review · Ready · Backlog · Done, with a cancelled lane; node_kind rendered
// distinctly — epic headers, amber question cards, review badges, fix chips;
// claimers + Ready/Backlog split off /dag.claimable) already lives in DagBoard.
// The only task_manager-specific addition is the tap-through: a card opens the
// TaskDetail panel (owner actions) instead of inline-expanding. So this wraps
// DagBoard with the onOpenTask seam rather than duplicating ~400 lines.
//
// BoardView is the per-project discriminator App renders: it probes /dag once
// for node_kind and routes task_manager → this board, phase → plain DagBoard.
import { useEffect, useState } from 'react';
import { Theme } from '../theme';
import { getProjectPipeline } from '../api/client';
import { Spinner } from '../ui';
import { DagBoard } from './DagBoard';
import { MyBot } from './MyBots';

export function TaskManagerBoard({ T, bot, onOpenTask }: {
  T: Theme; bot: MyBot; onOpenTask: (slug: string) => void;
}) {
  return <DagBoard T={T} bot={bot} onOpenTask={onOpenTask} />;
}

// Discriminating board: task_manager → tap-through TaskManagerBoard; phase →
// the inline-expand DagBoard. Probes /dag once for node_kind (the gap #1
// workaround); accept the one extra fetch rather than threading tasks down. If
// the caller already knows (build_pipeline once it ships) it can pass `known`.
export function BoardView({ T, bot, onOpenTask, known }: {
  T: Theme; bot: MyBot; onOpenTask: (slug: string) => void;
  known?: 'task_manager' | 'phase';
}) {
  const [kind, setKind] = useState<'task_manager' | 'phase' | null>(known ?? null);

  useEffect(() => {
    if (known) { setKind(known); return; }
    let cancelled = false;
    setKind(null);
    void getProjectPipeline(bot.id).then(p => { if (!cancelled) setKind(p); });
    return () => { cancelled = true; };
  }, [bot.id, known]);

  if (kind === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '60px 24px', minHeight: 240 }}>
        <Spinner color={T.accent} size={22} />
        <span style={{ fontFamily: T.font, fontSize: 14, color: T.hint }}>Loading the board…</span>
      </div>
    );
  }
  return kind === 'task_manager'
    ? <TaskManagerBoard T={T} bot={bot} onOpenTask={onOpenTask} />
    : <DagBoard T={T} bot={bot} />;
}
