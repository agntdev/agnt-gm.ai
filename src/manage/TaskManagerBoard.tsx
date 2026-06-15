// TaskManagerBoard / BoardView — the per-project board entry App renders.
//
// The board engine (epic-grouped kanban: Needs-you · Failed · Building · In
// review · Ready · Backlog · Done, with a cancelled lane; node_kind rendered
// distinctly — epic headers, amber question cards, review badges, fix chips;
// claimers + Ready/Backlog split off /dag.claimable) lives in DagBoard. The
// only task_manager-specific addition is the tap-through: a card opens the
// TaskDetail panel (owner actions) instead of inline-expanding — DagBoard does
// that when handed an `onOpenTask`.
//
// BoardView discriminates task_manager vs phase WITHOUT a separate /dag probe:
// it renders ONE DagBoard (so the board never double-fetches or shows two
// spinners) and gates tap-through on a `tm` flag. `tm` is seeded from `known`
// (build_pipeline once it ships) and otherwise SELF-HEALS off DagBoard's own
// poll via onKind — so a board opened mid-decompose (empty /dag ⇒ looks phase)
// upgrades to tap-through the moment node_kind tasks land, not next visit.
import { useEffect, useState } from 'react';
import { Theme } from '../theme';
import { DagBoard } from './DagBoard';
import { MyBot } from './MyBots';

export function BoardView({ T, bot, onOpenTask, known }: {
  T: Theme; bot: MyBot; onOpenTask: (slug: string) => void;
  known?: 'task_manager' | 'phase';
}) {
  const [tm, setTm] = useState(known === 'task_manager');
  // re-seed when the caller's verdict or the bot changes; an unknown verdict
  // falls back to DagBoard's onKind self-heal below.
  useEffect(() => { setTm(known === 'task_manager'); }, [known, bot.id]);

  return (
    <DagBoard T={T} bot={bot}
      onOpenTask={tm ? onOpenTask : undefined}
      onKind={known ? undefined : (k) => { if (k === 'task_manager') setTm(true); }} />
  );
}
