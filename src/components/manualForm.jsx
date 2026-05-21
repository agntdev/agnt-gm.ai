// Shared building blocks for the manual project-plan / manual stage-tasks
// flows. Both forms (Create page for projects, CreateStageForm in the
// project page for stages) plug these in so the UI feels identical.

import { useState } from "react";
import { Icon } from "./atoms.jsx";
import {
  BODY_MD_MAX,
  BODY_MD_WARN,
  BODY_MD_MIN,
  DIFFICULTIES,
  MAX_TASKS,
  TITLE_MAX,
  budgetState,
  emptyTask,
  emptyDescriptionTask,
} from "../lib/manualPlan.js";

// Tiny global stylesheet — keyframes can't live in inline `style={}`.
// Lazy-injected on first use so we don't ship them when manual mode
// isn't visible. Both forms import this file → the side effect runs.
let injected = false;
function ensureKeyframes() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const el = document.createElement("style");
  el.setAttribute("data-agnt", "manual-form");
  el.textContent = `
    @keyframes agnt-shake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-3px); }
      40%, 80% { transform: translateX(3px); }
    }
    @keyframes agnt-budget-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
      50%      { box-shadow: 0 0 0 4px var(--accent-soft); }
    }
    @keyframes agnt-fade-in {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .agnt-shake    { animation: agnt-shake 250ms ease-in-out 1; }
    .agnt-pulse    { animation: agnt-budget-pulse 1.4s ease-in-out infinite; }
    .agnt-fade-in  { animation: agnt-fade-in 220ms ease-out both; }
  `;
  document.head.appendChild(el);
}
ensureKeyframes();

// ─────────────────────────────────────────────────────────────────────
// ModeSwitcher — pill segmented control. Used at the top of both
// Create-project and Create-stage forms.
// ─────────────────────────────────────────────────────────────────────
export function ModeSwitcher({ value, onChange, options }) {
  return (
    <div
      role="tablist"
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 4,
        border: "1px solid var(--border)",
        borderRadius: 999,
        background: "var(--bg-soft)",
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              padding: "7px 14px",
              borderRadius: 999,
              border: "none",
              background: active ? "var(--fg)" : "transparent",
              color: active ? "var(--bg)" : "var(--fg-muted)",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              cursor: "pointer",
              transition: "background 0.18s ease, color 0.18s ease",
            }}
          >
            {opt.icon && <Icon name={opt.icon} size={11} />} {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SectionHeader — tiny uppercase mono label with a thin top divider,
// used to break up the long manual form into scannable groups.
// ─────────────────────────────────────────────────────────────────────
export function SectionHeader({ children, hint, first = false }) {
  return (
    <div style={{
      marginTop: first ? 0 : 22,
      paddingTop: first ? 0 : 16,
      borderTop: first ? "none" : "1px solid var(--border)",
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      gap: 12,
    }}>
      <h3 style={{
        margin: 0,
        fontSize: 10.5, fontFamily: "JetBrains Mono, monospace",
        fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
        color: "var(--fg-muted)",
      }}>
        {children}
      </h3>
      {hint && (
        <span style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}>{hint}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Field — labelled wrapper. Compact, mono label, optional hint, optional
// error message below.
// ─────────────────────────────────────────────────────────────────────
export function Field({ label, hint, error, children, span }) {
  return (
    <label style={{
      display: "flex", flexDirection: "column", gap: 4,
      gridColumn: span ? `span ${span}` : undefined,
      minWidth: 0,
    }}>
      <span style={{
        fontSize: 9.5, fontFamily: "JetBrains Mono, monospace",
        fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
        color: error ? "var(--danger)" : "var(--fg-muted)",
      }}>
        {label}
      </span>
      {children}
      {hint && !error && (
        <span style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}>{hint}</span>
      )}
      {error && (
        <span style={{ fontSize: 10.5, color: "var(--danger)" }}>{error}</span>
      )}
    </label>
  );
}

export const inputStyle = {
  padding: "8px 12px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "inherit",
  background: "var(--bg)",
  color: "var(--fg)",
  width: "100%",
};

export const monoInputStyle = { ...inputStyle, fontFamily: "JetBrains Mono, monospace" };

// ─────────────────────────────────────────────────────────────────────
// BudgetMeter — running weight sum with a colour-shifting bar.
// Sticks visually under the tasks list; visible on every form view.
//
//   red    — invalid (below 70% of max or over max)
//   amber  — valid but suboptimal (70%-99% of max)
//   green  — exactly at max ± 0.001 (pulses)
// ─────────────────────────────────────────────────────────────────────
export function BudgetMeter({ tasks, isStage, ownerShareBps, weightField = "weight" }) {
  // Read the weight off whichever field the caller is using. The two
  // shapes today are:
  //   - manual project / manual stage → task.weight
  //   - add-tasks-to-stage           → task.weight_within_new
  // budgetState() doesn't know about field names — pre-normalise.
  const normalised = (tasks || []).map((t) => ({ weight: Number(t[weightField]) || 0 }));
  const { sum, max, ratio, tone, remaining } = budgetState({ tasks: normalised, isStage, ownerShareBps });

  const palette = {
    danger: { fg: "var(--danger)",     bg: "var(--danger-soft)", bar: "var(--danger)" },
    amber:  { fg: "#b45309",           bg: "oklch(0.96 0.05 80)", bar: "oklch(0.75 0.12 80)" },
    ok:     { fg: "var(--accent-fg)",  bg: "var(--accent-soft)",  bar: "var(--accent)" },
    over:   { fg: "var(--danger)",     bg: "var(--danger-soft)",  bar: "var(--danger)" },
  }[tone];

  const fillPct = Math.min(100, Math.max(0, ratio * 100));
  const minMarkerPct = 70;
  const note =
    tone === "ok"     ? "Perfect — balanced budget."
    : tone === "amber" ? `${remaining.toFixed(3)} weight unallocated — consider distributing the rest.`
    : tone === "over"  ? `Over budget by ${(sum - max).toFixed(3)}. Reduce weights.`
    :                    `Need at least ${(max * 0.7).toFixed(3)} (ideally ${max.toFixed(3)}). Add more tasks or raise weights.`;

  return (
    <div
      className={tone === "ok" ? "agnt-pulse" : undefined}
      style={{
        marginTop: 10, padding: "10px 14px",
        border: `1px solid ${palette.bar}`,
        borderRadius: 8,
        background: palette.bg,
        display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: palette.fg }}>
          Weight budget
          <span style={{ marginLeft: 8, fontFamily: "JetBrains Mono, monospace", fontVariantNumeric: "tabular-nums" }}>
            {sum.toFixed(3)} / {max.toFixed(3)}
          </span>
        </div>
        <div style={{ fontSize: 10.5, color: palette.fg, opacity: 0.75 }}>
          {note}
        </div>
      </div>
      <div style={{
        position: "relative",
        height: 8, borderRadius: 999,
        background: "var(--bg-tint)", overflow: "hidden",
      }}>
        <div
          style={{
            position: "absolute", inset: 0,
            width: `${fillPct}%`,
            background: palette.bar,
            transition: "width 0.25s ease, background 0.2s ease",
            borderRadius: 999,
          }}
        />
        {/* 70% floor marker — only visible when below 100%. */}
        {ratio < 1.001 && (
          <div
            title={`Minimum floor: ${(max * 0.7).toFixed(3)}`}
            style={{
              position: "absolute", top: -2, bottom: -2,
              left: `${minMarkerPct}%`,
              width: 2, background: "var(--fg-muted)",
              opacity: 0.5,
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TaskRow — single repeating task. Slug-mono on the left, full-width
// title, body_md textarea (expands on focus), weight + difficulty +
// tags + delete.
// ─────────────────────────────────────────────────────────────────────
function TaskRow({ task, index, onChange, onRemove, weightField = "weight" }) {
  const [bodyFocused, setBodyFocused] = useState(false);
  // Per-row "advanced" toggle. Slug / difficulty / tags live here —
  // most owners never touch them (slug auto-fills, difficulty is a
  // hint, tags are metadata). Auto-expand when any of those fields
  // is non-default so re-opening an edited task doesn't hide the
  // pre-existing values.
  const hasNonDefaultAdvanced =
    (task.slug && !/^S?\d*T\d{2}$/.test(task.slug)) ||
    (task.difficulty && task.difficulty !== "medium") ||
    (task.tags && task.tags.length > 0);
  const [showAdv, setShowAdv] = useState(hasNonDefaultAdvanced);
  const tagsInput = (task.tags || []).join(", ");
  const weightVal = Number.isFinite(task[weightField]) ? task[weightField] : 0;

  function patch(p) { onChange({ ...task, ...p }); }

  return (
    <div
      className="agnt-fade-in"
      style={{
        padding: "12px 14px",
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg)",
        display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center" }}>
        <input
          value={task.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="What ships in this task?"
          aria-label={`Task ${index + 1} title`}
          maxLength={TITLE_MAX}
          style={{
            ...inputStyle,
            padding: "7px 12px",
            fontWeight: 700,
            border: "1px solid transparent",
            background: "transparent",
            fontSize: 14,
          }}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove task ${index + 1}`}
          title="Remove task"
          style={{
            display: "grid", placeItems: "center",
            width: 30, height: 30, padding: 0,
            border: "1px solid var(--border)", background: "var(--bg-soft)",
            borderRadius: 6,
            color: "var(--fg-muted)", cursor: "pointer",
            transition: "color 0.15s ease, border-color 0.15s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.borderColor = "var(--danger)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fg-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
        >
          <Icon name="x" size={12} />
        </button>
      </div>

      <div style={{ position: "relative" }}>
        <textarea
          value={task.body_md}
          onChange={(e) => patch({ body_md: e.target.value })}
          onFocus={() => setBodyFocused(true)}
          onBlur={() => setBodyFocused(false)}
          placeholder="## Acceptance&#10;- testable bullet&#10;- testable bullet"
          rows={bodyFocused || task.body_md.length > 60 ? 5 : 2}
          maxLength={BODY_MD_MAX}
          style={{
            ...inputStyle,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12,
            lineHeight: 1.55,
            resize: "vertical",
            transition: "min-height 0.18s ease",
            paddingBottom: 22, // leave room for the absolute-positioned counter
          }}
        />
        {(bodyFocused || task.body_md.length > BODY_MD_WARN) && (
          <span
            style={{
              position: "absolute", right: 10, bottom: 8,
              fontFamily: "JetBrains Mono, monospace", fontSize: 10,
              color: task.body_md.length >= BODY_MD_MAX ? "var(--danger)"
                : task.body_md.length > BODY_MD_WARN ? "#b45309"
                : "var(--fg-muted)",
              background: "var(--bg)",
              padding: "1px 6px",
              borderRadius: 4,
              pointerEvents: "none",
              fontWeight: 700,
            }}
          >
            {task.body_md.length.toLocaleString()} / {(BODY_MD_MAX / 1024).toFixed(0)}k
          </span>
        )}
      </div>

      {/* Default row: just weight + advanced toggle. Stays on a single
          line on phones thanks to the wrap. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={weightVal}
            onChange={(e) => patch({ [weightField]: clamp01(parseFloat(e.target.value)) })}
            aria-label={`Task ${index + 1} weight`}
            style={{
              ...monoInputStyle,
              padding: "6px 10px",
              fontVariantNumeric: "tabular-nums",
              fontWeight: 700,
              textAlign: "right",
              width: 88,
            }}
          />
          <span style={{ fontSize: 10.5, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>weight</span>
        </div>

        {/* Slug shows as a compact mono pill once non-default OR when
            the row is expanded. Keeps the auto-generated slug visible
            but doesn't beg for attention. */}
        {task.slug && (
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em",
              padding: "3px 8px", borderRadius: 4,
              background: "var(--bg-soft)", color: "var(--fg-muted)",
              border: "1px solid var(--border)",
            }}
            title="Task slug — referenced in PR titles. Edit under Advanced."
          >
            {task.slug}
          </span>
        )}

        <button
          type="button"
          onClick={() => setShowAdv((v) => !v)}
          style={{
            marginLeft: "auto",
            padding: "4px 8px", border: "none", background: "transparent",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
            color: "var(--fg-muted)", textTransform: "uppercase",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fg)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fg-muted)"; }}
        >
          {showAdv ? "▾ Hide advanced" : "▸ Advanced (slug · difficulty · tags)"}
        </button>
      </div>

      {showAdv && (
        <div className="agnt-resp-task-meta agnt-fade-in" style={{ display: "grid", gridTemplateColumns: "150px 1fr 1fr", gap: 10, alignItems: "center" }}>
          <input
            value={task.slug || ""}
            onChange={(e) => patch({ slug: e.target.value.toUpperCase().replace(/\s+/g, "") })}
            placeholder="T01"
            aria-label={`Task ${index + 1} slug`}
            style={{
              ...monoInputStyle,
              padding: "6px 10px",
              fontWeight: 800,
              fontSize: 11,
              textAlign: "center",
              background: "var(--bg-soft)",
            }}
          />
          <div style={{ display: "flex", gap: 4 }}>
            {DIFFICULTIES.map((d) => {
              const active = task.difficulty === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => patch({ difficulty: d })}
                  style={{
                    flex: 1,
                    height: 28,
                    padding: "0 6px",
                    border: `1px solid ${active ? "var(--fg)" : "var(--border)"}`,
                    background: active ? "var(--fg)" : "var(--bg)",
                    color:      active ? "var(--bg)" : "var(--fg-muted)",
                    borderRadius: 6,
                    fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 800,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <input
            value={tagsInput}
            onChange={(e) => patch({ tags: parseTags(e.target.value) })}
            placeholder="tags: frontend, infra"
            aria-label={`Task ${index + 1} tags`}
            style={{
              ...inputStyle,
              padding: "6px 10px",
              fontSize: 11,
              fontFamily: "JetBrains Mono, monospace",
            }}
          />
        </div>
      )}
    </div>
  );
}

function parseTags(raw) {
  return String(raw || "")
    .split(/[,\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 6);
}
function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// ─────────────────────────────────────────────────────────────────────
// DescTaskRow — the lean, descriptions-only task row. Used by the
// pre-publish edit-tasks panel and the manual create form. The owner
// edits ONLY the description; the LLM assigns title / slug / weight /
// difficulty / tags on save. For existing tasks (carry an `id` or
// `slug`) we surface those server-assigned values as read-only chips so
// the owner has context for what they're re-describing.
// ─────────────────────────────────────────────────────────────────────
function DescTaskRow({ task, index, onChange, onRemove }) {
  const [bodyFocused, setBodyFocused] = useState(false);
  const isExisting = !!(task.id || task.slug);
  const weightPct = Number.isFinite(Number(task.weight)) && Number(task.weight) > 0
    ? `${(Number(task.weight) * 100).toFixed(0)}%`
    : null;

  const chip = (text, title) => (
    <span
      title={title}
      style={{
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10, fontWeight: 800, letterSpacing: "0.04em",
        padding: "3px 8px", borderRadius: 4,
        background: "var(--bg-soft)", color: "var(--fg-muted)",
        border: "1px solid var(--border)", whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );

  return (
    <div
      className="agnt-fade-in"
      style={{
        padding: "12px 14px",
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg)",
        display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
          {isExisting ? (
            <>
              {task.slug && chip(task.slug, "Task slug — assigned by the platform")}
              {weightPct && chip(weightPct, "Reward weight — assigned by the AI")}
              {task.difficulty && chip(String(task.difficulty).toUpperCase(), "Difficulty — assigned by the AI")}
              {task.title && (
                <span style={{
                  fontSize: 12.5, fontWeight: 700, color: "var(--fg)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
                }}>
                  {task.title}
                </span>
              )}
            </>
          ) : (
            chip("NEW · AI names it", "Title, weight and difficulty are assigned by the AI on save")
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove task ${index + 1}`}
          title="Remove task"
          style={{
            display: "grid", placeItems: "center",
            width: 30, height: 30, padding: 0, flexShrink: 0,
            border: "1px solid var(--border)", background: "var(--bg-soft)",
            borderRadius: 6, color: "var(--fg-muted)", cursor: "pointer",
            transition: "color 0.15s ease, border-color 0.15s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.borderColor = "var(--danger)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fg-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
        >
          <Icon name="x" size={12} />
        </button>
      </div>

      <div style={{ position: "relative" }}>
        <textarea
          value={task.body_md || ""}
          onChange={(e) => onChange({ ...task, body_md: e.target.value })}
          onFocus={() => setBodyFocused(true)}
          onBlur={() => setBodyFocused(false)}
          placeholder="Describe what ships in this task — scope, acceptance criteria, constraints. The AI turns this into a titled, weighted task."
          rows={bodyFocused || (task.body_md || "").length > 60 ? 5 : 3}
          maxLength={BODY_MD_MAX}
          style={{
            ...inputStyle,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12, lineHeight: 1.55, resize: "vertical",
            transition: "min-height 0.18s ease", paddingBottom: 22,
          }}
        />
        {(bodyFocused || (task.body_md || "").length > BODY_MD_WARN || (task.body_md || "").length < BODY_MD_MIN) && (
          <span
            style={{
              position: "absolute", right: 10, bottom: 8,
              fontFamily: "JetBrains Mono, monospace", fontSize: 10,
              color: (task.body_md || "").length >= BODY_MD_MAX ? "var(--danger)"
                : (task.body_md || "").length < BODY_MD_MIN ? "#b45309"
                : "var(--fg-muted)",
              background: "var(--bg)", padding: "1px 6px", borderRadius: 4,
              pointerEvents: "none", fontWeight: 700,
            }}
          >
            {(task.body_md || "").length < BODY_MD_MIN
              ? `${(task.body_md || "").length} / ${BODY_MD_MIN} min`
              : `${(task.body_md || "").length.toLocaleString()} / ${(BODY_MD_MAX / 1024).toFixed(0)}k`}
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TasksEditor — the full repeating-tasks UX. Used in both the project
// form (project mode) and the stage form (stage mode).
//
// Props:
//   tasks         — current array
//   onChange      — replacement array setter
//   isStage       — toggles budget cap (1.0 vs 1 - share/10000)
//   ownerShareBps — only used for project mode
//   stageNumber   — only used for stage mode to pick slug prefix
// ─────────────────────────────────────────────────────────────────────
export function TasksEditor({
  tasks, onChange,
  isStage, ownerShareBps, stageNumber,
  // `weightField` lets the add-tasks form drive the same component
  // off a different shape (`weight_within_new`). For project/stage
  // manual forms it defaults to `weight`.
  weightField = "weight",
  // `newTaskFactory` overrides the default emptyTask shape — used by
  // the add-tasks form to mint rows with `weight_within_new` zeroed.
  newTaskFactory,
  // `descriptionsOnly` switches to the lean editor: the owner edits only
  // the description; the LLM assigns title/slug/weight/difficulty/tags
  // on save. Hides the per-task weight/advanced fields, the weight
  // budget meter and auto-balance. Used by the pre-publish edit-tasks
  // panel and the manual create form.
  descriptionsOnly = false,
}) {
  function add() {
    if (tasks.length >= MAX_TASKS) return;
    const next = descriptionsOnly
      ? emptyDescriptionTask()
      : newTaskFactory
        ? newTaskFactory({ tasks, stageNumber })
        : emptyTask({ tasks, stageNumber });
    onChange([...tasks, next]);
  }
  function patchAt(i, next) {
    onChange(tasks.map((t, idx) => (idx === i ? next : t)));
  }
  function removeAt(i) {
    onChange(tasks.filter((_, idx) => idx !== i));
  }

  // Quick-add helper: distribute remaining weight evenly across tasks
  // that don't yet have a weight set. Lovely little time saver.
  function autoBalance() {
    const max = isStage ? 1.0 : (1 - (Number(ownerShareBps ?? 1000) || 0) / 10_000);
    if (tasks.length === 0) return;
    const even = Number((max / tasks.length).toFixed(3));
    onChange(tasks.map((t) => ({ ...t, [weightField]: even })));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
      {tasks.length === 0 ? (
        <div style={{
          padding: 20, border: "1px dashed var(--border-strong)", borderRadius: 8,
          background: "var(--bg-soft)", textAlign: "center", color: "var(--fg-muted)", fontSize: 12.5,
        }}>
          No tasks yet. Add at least one — start with a small, testable scope.
        </div>
      ) : (
        tasks.map((t, i) => (
          descriptionsOnly ? (
            <DescTaskRow
              key={i}
              task={t}
              index={i}
              onChange={(next) => patchAt(i, next)}
              onRemove={() => removeAt(i)}
            />
          ) : (
            <TaskRow
              key={i}
              task={t}
              index={i}
              onChange={(next) => patchAt(i, next)}
              onRemove={() => removeAt(i)}
              weightField={weightField}
            />
          )
        ))
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={add}
          disabled={tasks.length >= MAX_TASKS}
          style={{
            flex: 1, minWidth: 200,
            padding: "10px 14px",
            border: "1px dashed var(--border-strong)",
            background: "transparent",
            borderRadius: 8,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase",
            color: "var(--fg-muted)", cursor: tasks.length >= MAX_TASKS ? "not-allowed" : "pointer",
            opacity: tasks.length >= MAX_TASKS ? 0.5 : 1,
            transition: "color 0.15s ease, border-color 0.15s ease, background 0.15s ease",
          }}
          onMouseEnter={(e) => {
            if (tasks.length >= MAX_TASKS) return;
            e.currentTarget.style.color = "var(--fg)";
            e.currentTarget.style.borderColor = "var(--fg)";
            e.currentTarget.style.background = "var(--bg-soft)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--fg-muted)";
            e.currentTarget.style.borderColor = "var(--border-strong)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          + Add task {tasks.length > 0 && <span style={{ opacity: 0.6 }}>({tasks.length}/{MAX_TASKS})</span>}
        </button>
        {!descriptionsOnly && tasks.length >= 2 && (
          <button
            type="button"
            onClick={autoBalance}
            title="Distribute the remaining weight evenly across every task"
            style={{
              padding: "10px 14px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg)",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase",
              color: "var(--fg-muted)", cursor: "pointer",
              transition: "color 0.15s ease, border-color 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fg)"; e.currentTarget.style.borderColor = "var(--fg)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fg-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
          >
            ⚖ Auto-balance
          </button>
        )}
      </div>

      {!descriptionsOnly && (
        <BudgetMeter
          tasks={tasks}
          isStage={isStage}
          ownerShareBps={ownerShareBps}
          weightField={weightField}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// RejectionBanner — top-of-form banner for moderation rejections.
// ─────────────────────────────────────────────────────────────────────
export function RejectionBanner({ reason, onDismiss }) {
  if (!reason) return null;
  return (
    <div
      role="alert"
      className="agnt-fade-in"
      style={{
        marginBottom: 14,
        padding: 14,
        border: "1px solid var(--danger)",
        background: "var(--danger-soft)",
        borderRadius: 10,
        display: "flex", alignItems: "flex-start", gap: 10,
      }}
    >
      <Icon name="x" size={14} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 800, color: "var(--danger)",
          textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4,
        }}>
          Moderation rejected the plan
        </div>
        <div style={{ fontSize: 12.5, color: "var(--fg)", lineHeight: 1.5 }}>
          {reason}
        </div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: "none", border: "none", padding: 4, cursor: "pointer",
            color: "var(--danger)",
          }}
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}
