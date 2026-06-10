// Pretty label for a phase key — used by the hint line so the user
// can see "Current phase is Dev" without having to count circles.
// Falls back to the raw key capitalized if the stage is unknown.
function labelFor(key) {
  const found = STAGES.find((s) => s.key === key);
  return found ? found.label : (key || "general").replace(/_/g, " ");
}

// AGNTDEV build-pipeline visual.
//
// Shows the 5 sequential stages (General → Design → Details → Dev → Tests)
// with a "Fix Bugs" side-loop annotation for failed reviews. Pure
// presentational — no fetching, no side effects; the caller passes the
// phase payload from `api.getProjectPhase(id)` and decides how to refresh.
//
// `phase` shape (from GET /api/builder/projects/:id/phase):
//   {
//     current_phase:    "general"|"design"|"details"|"dev"|"tests"
//                     | "fix_bugs"|"published"|"failed",
//     phase_status:     "active"|"in_review"|"passed"|"failed",
//     phase_runs:       [ { phase, attempt, status, review_kind,
//                           opened_at, closed_at }, ... ],
//     next_action:      string,   // orchestrator's next move (read-only)
//     next_action_reason: string,
//   }
//
// `compact` — TMA-friendly: smaller chips, shorter labels.
// `showNextAction` — render the next_action hint under the pipeline (default true).

import { useEffect, useRef } from "react";
import { Icon } from "./atoms.jsx";

const STAGES = [
  { key: "general", label: "General", hint: "Product spec" },
  { key: "design", label: "Design", hint: "UX & flows" },
  { key: "details", label: "Details", hint: "Specs & tasks" },
  { key: "dev", label: "Dev", hint: "Implementation" },
  { key: "tests", label: "Tests", hint: "Harness run" },
];

const TERMINAL = {
  published: { label: "Published", tone: "accent" },
  failed: { label: "Failed", tone: "danger" },
};

// Compute the visual state of each stage from the phase payload.
// Stages before current → "passed" (the DAG only moves forward).
// Stages after current → "pending".
// current stage → "active" / "in_review" / "passed" / "failed"
//   depending on phase_status + whether the project advanced past it.
// fix_bugs → the originating stage gets "failed", the project shows a
//   "Fix" badge on that stage; the pipeline otherwise reflects where
//   the side-loop attaches.
function stageStates(phase) {
  const current = phase?.current_phase || "general";
  const status = phase?.phase_status || "active";
  const isFixBugs = current === "fix_bugs";
  const isPublished = current === "published";
  const isFailed = current === "failed";

  return STAGES.map((s, i) => {
    const stageKey = isFixBugs ? deriveFixBugsOrigin(phase) : current;
    const stageIdx = STAGES.findIndex((x) => x.key === stageKey);
    if (isPublished) {
      return { ...s, state: "passed", isFix: false };
    }
    if (isFailed) {
      // Failed is terminal: mark the failing stage (or current) as failed,
      // leave the rest as pending. We don't have the origin in the payload
      // here, so we use current as the failed marker.
      if (i === stageIdx) {
        return { ...s, state: "failed", isFix: false };
      }
      if (i < stageIdx) return { ...s, state: "passed", isFix: false };
      return { ...s, state: "pending", isFix: false };
    }
    if (i < stageIdx) return { ...s, state: "passed", isFix: false };
    if (i > stageIdx) return { ...s, state: "pending", isFix: false };
    // i === stageIdx
    if (isFixBugs) {
      return { ...s, state: "failed", isFix: true };
    }
    if (status === "in_review") return { ...s, state: "in_review", isFix: false };
    if (status === "passed") return { ...s, state: "passed", isFix: false };
    if (status === "failed") return { ...s, state: "failed", isFix: false };
    return { ...s, state: "active", isFix: false };
  });
}

// When current_phase=fix_bugs, the failing stage is the most recent
// phase_run entry with status='failed' (or 'active' for an in-progress
// fix). We look at the audit trail, not the current key, because
// fix_bugs is a side-loop — it remembers which stage it was opened on.
function deriveFixBugsOrigin(phase) {
  const runs = phase?.phase_runs || [];
  // Walk backwards; the first run that isn't a fix_bugs itself is the
  // stage the side-loop is attached to.
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    if (r.phase && r.phase !== "fix_bugs") return r.phase;
  }
  // No runs recorded yet — fall back to the most recent non-fix stage
  // in the canonical order, so the UI still renders something sane.
  return "design";
}

function StateIcon({ state, size = 14 }) {
  if (state === "passed") {
    return <Icon name="check" size={size} />;
  }
  if (state === "failed") {
    return <Icon name="x" size={size} />;
  }
  if (state === "in_review") {
    return <span className="phase-state-ring" />;
  }
  if (state === "active") {
    return <span className="phase-state-dot phase-state-dot--active" />;
  }
  return <span className="phase-state-dot" />;
}

export default function PhasePipeline({ phase, compact = false, showNextAction = true }) {
  const scrollerRef = useRef(null);
  if (!phase) return null;
  const states = stageStates(phase);
  const terminalKey = phase.current_phase;
  const terminal = TERMINAL[terminalKey];

  // Center the current/active stage in the horizontal scroller on
  // mount and whenever the current phase changes. Without this, the
  // pipeline always opens with stage 1 (General) on the left and the
  // user has to manually scroll right to see the active one — bad UX
  // on a phone where most projects are mid-pipeline.
  //
  // We find the .phase-stage--active (or in_review, fix, etc.) and
  // compute scrollLeft = elementCenter - viewportCenter. The setTimeout
  // is 0 because the scroll container's clientWidth is 0 until after
  // the first paint, so we wait one frame. Re-runs on every phase
  // change (e.g. dev → tests) so the active stage stays centered as
  // the project advances.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const findActive = () => {
      const active = el.querySelector(
        ".phase-stage--active, .phase-stage--in_review, .phase-stage--fix_bugs",
      );
      if (!active) return;
      const elRect = el.getBoundingClientRect();
      const aRect = active.getBoundingClientRect();
      const elCenter = elRect.left + elRect.width / 2;
      const aCenter = aRect.left + aRect.width / 2;
      const delta = aCenter - elCenter;
      el.scrollBy({ left: delta, behavior: "smooth" });
    };
    // Two RAFs to make sure the layout is settled (the inner stage
    // widths depend on the container, which depends on the parent's
    // own width — which is still 0 the very first frame after mount).
    const id = requestAnimationFrame(() => requestAnimationFrame(findActive));
    return () => cancelAnimationFrame(id);
  }, [phase?.current_phase, phase?.phase_status, compact]);

  return (
    <div className="phase-pipeline-wrap">
      {/* Hint line — sits ABOVE the phase chips, inside the same
          bordered block, so it doesn't get squashed by the
          horizontal scroll. The hint is a sibling of the scroll
          container, not a child, otherwise flexbox would lay it
          out next to the chips instead of above them. */}
      <div className="phase-pipeline-hint">
        <span className="phase-pipeline-hint-dot" />
        <span>
          Bots move through 5 phases. Current phase is{" "}
          <strong>
            {labelFor(
              states.find(
                (s) => s.state === "active" || s.state === "in_review",
              )?.key ||
                states.find((s) => s.state === "passed")?.key ||
                "general",
            )}
          </strong>
          .
        </span>
      </div>
      <div
        ref={scrollerRef}
        className={`phase-pipeline${compact ? " phase-pipeline--compact" : ""}`}
        role="list"
        aria-label="Build pipeline"
      >
        {states.map((s, i) => {
          const prev = i > 0 ? states[i - 1] : null;
          // Connector sits BEFORE the stage it links to, not after the
          // previous one — with `display: contents` on the wrap, "before
          // stage N" = "after stage N-1" in the flat flex flow, but the
          // className decision belongs to the gap between N-1 and N.
          const connectorCls = prev
            ? `phase-connector${prev.state === "passed" ? " phase-connector--passed" : ""}`
            : null;
          return (
            <div className="phase-stage-wrap" role="listitem" key={s.key}>
              {connectorCls && (
                <div className={connectorCls} aria-hidden="true" />
              )}
              <div className={`phase-stage phase-stage--${s.state}`}>
                <div className="phase-stage-icon" aria-hidden="true">
                  <StateIcon state={s.state} size={compact ? 12 : 14} />
                </div>
                <div className="phase-stage-text">
                  <div className="phase-stage-label">{s.label}</div>
                  {!compact && s.hint && (
                    <div className="phase-stage-hint">{s.hint}</div>
                  )}
                </div>
                {s.isFix && <span className="phase-fix-badge">Fix</span>}
              </div>
            </div>
          );
        })}

        {terminal && (
          <div
            className={`phase-stage phase-stage--${terminal.tone} phase-stage--terminal`}
            role="listitem"
            key="__terminal__"
          >
            <div className="phase-stage-icon" aria-hidden="true">
              <StateIcon
                state={terminal.tone === "accent" ? "passed" : "failed"}
                size={compact ? 12 : 14}
              />
            </div>
            <div className="phase-stage-text">
              <div className="phase-stage-label">{terminal.label}</div>
              {!compact && (
                <div className="phase-stage-hint">
                  {terminal.tone === "accent" ? "Bot is live" : "Halted"}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showNextAction && phase.next_action && phase.next_action !== "none" && (
        <div className="phase-next">
          <span className="phase-next-label">Next:</span>{" "}
          <code className="phase-next-code">{phase.next_action}</code>
          {phase.next_action_reason && (
            <span className="phase-next-reason">
              {" "}
              — {phase.next_action_reason}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Helpers exported for tests / debugging.
export { STAGES, stageStates, deriveFixBugsOrigin };
