// AGNTDEV task DAG summary — the "what's the swarm working on" view
// for the project page. Hits `GET /builder/projects/:id/dag` and renders
// 4 compact metrics: Foundation X/Y, Features X/Y, Integration X/Y,
// Ready to claim N. Renders null when the project isn't in a phase
// that has a DAG yet (or when the LLM planner hasn't materialized one).
//
// Self-contained: owns its own poll (30s cadence while the page is
// open; the DAG rarely changes once a phase is in motion). 404s are
// expected pre-design-phase and treated as "no DAG yet" — no error UI.

import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

// Phases where a task DAG is expected. General runs first and the
// planner only spawns task DAGs starting at Design. We render the
// summary as soon as the project is in Dev or beyond (the common
// case the owner actually wants to see); the design-phase task list
// is too thin to be worth surfacing.
const DAG_PHASES = new Set(["dev", "tests", "fix_bugs", "published"]);

const POLL_INTERVAL_MS = 30000;

function countByKind(tasks) {
  const out = {
    foundation: { done: 0, total: 0 },
    feature: { done: 0, total: 0 },
    integration: { done: 0, total: 0 },
  };
  let claimable = 0;
  for (const t of tasks) {
    const bucket = out[t.task_kind];
    if (!bucket) continue; // skip 'doc' / 'fix' — counted separately if ever needed
    bucket.total += 1;
    if (t.status === "done") bucket.done += 1;
    if (t.claimable) claimable += 1;
  }
  return { byKind: out, claimable };
}

function MetricCell({ label, done, total }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="dag-summary-cell">
      <div className="dag-summary-label">{label}</div>
      <div className="dag-summary-value">
        {done}
        <span className="dag-summary-of"> / {total}</span>
      </div>
      <div className="dag-summary-bar" aria-hidden="true">
        <div
          className="dag-summary-bar-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="dag-summary-sub">done</div>
    </div>
  );
}

export default function DagSummary({ slug, phase }) {
  const [tasks, setTasks] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!slug) return undefined;
    const currentPhase = phase?.current_phase;
    if (!currentPhase || !DAG_PHASES.has(currentPhase)) return undefined;
    let cancelled = false;
    let timer = null;
    const tick = async () => {
      const res = await api.getProjectDag(slug);
      if (cancelled) return;
      if (res && Array.isArray(res.tasks)) {
        setTasks(res.tasks);
        setMissing(false);
      } else {
        // 404 (no DAG yet) or shape mismatch — stay quiet.
        setTasks([]);
        setMissing(true);
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [slug, phase]);

  // Hide on phases that don't have a DAG, while we're still fetching, or
  // when the LLM planner genuinely hasn't materialized one.
  if (!phase || !DAG_PHASES.has(phase.current_phase)) return null;
  if (tasks === null) {
    return (
      <div className="dag-summary dag-summary--loading" aria-busy="true">
        <div className="dag-summary-head">DAG</div>
        <div className="dag-summary-skeleton">Loading task graph…</div>
      </div>
    );
  }
  if (missing || tasks.length === 0) return null;

  const { byKind, claimable } = countByKind(tasks);

  return (
    <div className="dag-summary">
      <div className="dag-summary-head">
        <span className="dag-summary-title">DAG</span>
        <span className="dag-summary-sub">
          {tasks.length} {tasks.length === 1 ? "task" : "tasks"} in this phase
        </span>
      </div>
      <div className="dag-summary-grid">
        <MetricCell
          label="Foundation"
          done={byKind.foundation.done}
          total={byKind.foundation.total}
        />
        <MetricCell
          label="Features"
          done={byKind.feature.done}
          total={byKind.feature.total}
        />
        <MetricCell
          label="Integration"
          done={byKind.integration.done}
          total={byKind.integration.total}
        />
        <div
          className={
            "dag-summary-cell dag-summary-cell--claimable" +
            (claimable > 0 ? " dag-summary-cell--ready" : "")
          }
        >
          <div className="dag-summary-label">Ready to claim</div>
          <div className="dag-summary-value dag-summary-value--accent">
            {claimable}
          </div>
          <div className="dag-summary-sub">
            {claimable > 0 ? "agents can start now" : "waiting on deps"}
          </div>
        </div>
      </div>
    </div>
  );
}
