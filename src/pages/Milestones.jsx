// /projects/:slug/milestones
//
// AGNTDEV TMA task browser. The read-only companion to the project
// page — shows the full task DAG (foundation / feature / integration
// / doc / fix) with `claimable` verdicts, dependency chips, and a
// "Claim via CLI" copy line for every claimable task.
//
// No claim button on purpose: per role split, builders claim work
// in the CLI (`agnt task claim <slug> <task-slug>`), the TMA only
// shows the work. The CLI is the muscle, the TMA is the picture.

import { Link, useParams } from "react-router-dom";
import ProjectHero, { useProjectData } from "../components/ProjectHero.jsx";
import PhasePipeline from "../components/PhasePipeline.jsx";
import { useProjectDag } from "../hooks/useProjectDag.js";
import { useProjectPhase } from "../hooks/useProjectPhase.js";

// task_kind → chip styling. Each kind has a distinct accent so the
// eye can pick out the DAG shape (foundation → feature → integration)
// at a glance.
const KIND_CFG = {
  foundation: {
    bg: "oklch(0.94 0.07 25)",
    fg: "oklch(0.42 0.16 25)",
    label: "foundation",
  },
  feature: {
    bg: "oklch(0.94 0.07 240)",
    fg: "oklch(0.42 0.14 240)",
    label: "feature",
  },
  integration: {
    bg: "oklch(0.94 0.08 145)",
    fg: "oklch(0.32 0.12 150)",
    label: "integration",
  },
  doc: {
    bg: "oklch(0.95 0.04 60)",
    fg: "oklch(0.4 0.1 60)",
    label: "doc",
  },
  fix: {
    bg: "var(--danger-soft)",
    fg: "var(--danger)",
    label: "fix",
  },
};

// Status pills. Priority: merged (green) > in_review (amber) >
// claimed (blue) > claimable (accent) > blocked (muted) > open (default).
// `claimable` is computed from the backend's verdict, not from
// `status === "open"` — the backend's gate is authoritative.
function statusPill(task) {
  if (task.status === "done") {
    return { bg: "oklch(0.94 0.08 145)", fg: "oklch(0.32 0.12 150)", label: "merged" };
  }
  if (task.status === "in_review") {
    return { bg: "oklch(0.95 0.06 60)", fg: "oklch(0.42 0.13 60)", label: "in review" };
  }
  if (task.status === "claimed" || task.status === "in_progress") {
    return { bg: "oklch(0.95 0.06 240)", fg: "oklch(0.42 0.14 240)", label: "claimed" };
  }
  if (task.status === "cancelled") {
    return { bg: "var(--danger-soft)", fg: "var(--danger)", label: "cancelled" };
  }
  // status === "open" — defer to the backend's claimable verdict.
  if (task.claimable) {
    return { bg: "var(--accent-soft)", fg: "var(--accent-fg)", label: "ready to claim" };
  }
  return {
    bg: "var(--bg-tint)",
    fg: "var(--fg-muted)",
    label: task.claim_reason ? `blocked` : "open",
  };
}

function TaskRow({ task }) {
  const kind = KIND_CFG[task.task_kind] || {
    bg: "var(--bg-tint)",
    fg: "var(--fg-muted)",
    label: task.task_kind || "?",
  };
  const pill = statusPill(task);

  return (
    <div className="ms-task-row">
      <div className="ms-task-row-top">
        <span className="ms-task-hash">#{task.slug}</span>
        <span
          className="ms-task-status"
          style={{ background: pill.bg, color: pill.fg }}
        >
          {pill.label}
        </span>
      </div>
      <div className="ms-task-title">{task.title || task.slug}</div>
      <div className="ms-task-labels">
        <span
          className="task-label"
          style={{ background: kind.bg, color: kind.fg, fontWeight: 700 }}
        >
          {kind.label}
        </span>
        {task.depends_on && task.depends_on.length > 0 && (
          <span
            className="task-label"
            title={task.depends_on.join(", ")}
            style={{ background: "var(--bg-tint)", color: "var(--fg-muted)" }}
          >
            {task.depends_on.length} dep{task.depends_on.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {/* Inline "why not claimable" note when the task is closed
          for claiming (in_review, blocked, etc.). Replaces the
          old CLI claim column — nobody pasted CLI commands off
          a card, but a one-line reason for the block is useful
          context. Hidden when the task is claimable or done. */}
      {!task.claimable && task.claim_reason && task.status !== "done" && (
        <div className="ms-task-note" title={task.claim_reason}>
          {task.claim_reason}
        </div>
      )}
    </div>
  );
}

export default function Milestones() {
  const { slug } = useParams();
  const { live, loading } = useProjectData(slug);
  const dag = useProjectDag(slug);
  const phase = useProjectPhase(slug);

  if (loading) {
    return (
      <main data-screen-label="03 Tasks">
        <section className="container">
          <div
            style={{
              padding: "60px 0",
              color: "var(--fg-muted)",
              fontSize: 13,
              textAlign: "center",
            }}
          >
            Loading project…
          </div>
        </section>
      </main>
    );
  }

  if (!live) {
    return (
      <main data-screen-label="03 Tasks">
        <section className="container" style={{ paddingTop: 60 }}>
          <div
            style={{
              padding: 40,
              border: "1px dashed var(--border-strong)",
              borderRadius: 10,
              background: "var(--bg-soft)",
              textAlign: "center",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>Project not found</h2>
            <p style={{ marginTop: 8, fontSize: 13, color: "var(--fg-muted)" }}>
              No project at{" "}
              <code style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {slug}
              </code>
              .
            </p>
            <Link
              to="/"
              className="btn"
              style={{
                marginTop: 14,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              ← Back to Pulse
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const tasks = dag?.tasks || [];
  const totals = {
    total: tasks.length,
    ready: tasks.filter((t) => t.claimable).length,
    inFlight: tasks.filter(
      (t) => t.status === "claimed" || t.status === "in_progress" || t.status === "in_review",
    ).length,
    merged: tasks.filter((t) => t.status === "done").length,
  };

  // Sort: ready-to-claim first (the most actionable), then in-flight,
  // then blocked, then merged. Within each group, group by task_kind
  // (foundation first) so the DAG shape is visible.
  const kindOrder = { foundation: 0, feature: 1, integration: 2, doc: 3, fix: 4 };
  const sortKey = (t) => {
    let group;
    if (t.status === "done") group = 4;
    else if (t.claimable) group = 0;
    else if (t.status === "in_review") group = 1;
    else if (t.status === "claimed" || t.status === "in_progress") group = 1;
    else group = 3; // blocked
    return [group, kindOrder[t.task_kind] ?? 9, t.slug];
  };
  const sortedTasks = [...tasks].sort((a, b) => {
    const [ga, ka, sa] = sortKey(a);
    const [gb, kb, sb] = sortKey(b);
    if (ga !== gb) return ga - gb;
    if (ka !== kb) return ka - kb;
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });

  return (
    <main data-screen-label="03 Tasks">
      <section className="container">
        <ProjectHero
          live={live}
          crumbsExtra={
            <>
              <span>/</span>
              <span style={{ color: "var(--fg)", fontWeight: 700 }}>Tasks</span>
            </>
          }
        />

        <div>
          {/* Phase pipeline strip — same as the project page so the
              user knows which phase these tasks belong to. */}
          {phase && (
            <div style={{ marginTop: 8, marginBottom: 8 }}>
              <PhasePipeline phase={phase} />
            </div>
          )}

          <div className="ms-hero-stats" style={{ marginTop: 12 }}>
            <div className="ms-stat">
              <div className="ms-stat-label">Total tasks</div>
              <div className="ms-stat-val">{totals.total}</div>
            </div>
            <div className="ms-stat">
              <div className="ms-stat-label">Ready to claim</div>
              <div
                className="ms-stat-val"
                style={{ color: "var(--accent-fg)" }}
              >
                {totals.ready}
              </div>
            </div>
            <div className="ms-stat">
              <div className="ms-stat-label">In flight</div>
              <div className="ms-stat-val">{totals.inFlight}</div>
            </div>
            <div className="ms-stat">
              <div className="ms-stat-label">Merged</div>
              <div className="ms-stat-val">{totals.merged}</div>
            </div>
          </div>

          <div
            className="ms-tasks-scroll"
            style={{
              marginTop: 16,
              border: "1px solid var(--border)",
              borderRadius: 10,
              overflow: "hidden",
              background: "var(--bg)",
            }}
          >
            {dag === null ? (
              <div
                style={{
                  padding: 32,
                  textAlign: "center",
                  color: "var(--fg-muted)",
                  fontSize: 13,
                }}
              >
                Loading DAG…
              </div>
            ) : sortedTasks.length === 0 ? (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  color: "var(--fg-muted)",
                  fontSize: 13,
                }}
              >
                {phase && phase.current_phase
                  ? `No tasks yet — the LLM planner is materializing the ${phase.current_phase} DAG.`
                  : "No tasks yet for this project."}
              </div>
            ) : (
              <div className="ms-task-list">
                {sortedTasks.map((t) => (
                  <TaskRow key={t.slug} task={t} slug={slug} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
