// Shared helpers for the manual project-plan / manual stage-tasks flows.
// Mirrors the server-side validation in `builder_projects.go` and
// `builder_stages.go` so the user gets immediate feedback rather than a
// round-trip rejection.

export const DIFFICULTIES = ["easy", "medium", "hard"];
export const MAX_TASKS = 50;
export const SYMBOL_RE = /^[A-Z0-9]{3,10}$/;
export const SUPPLY_MIN = 1_000_000;
export const SUPPLY_MAX = 1_000_000_000_000;
export const SHARE_MIN_BPS = 0;
export const SHARE_MAX_BPS = 5000;

// Generate the next default slug for a tasks list. Pattern: T01, T02, …
// (or S{N}T01, S{N}T02, … for stages where caller passes stageNumber).
export function nextSlug(tasks, stageNumber) {
  const prefix = stageNumber ? `S${stageNumber}T` : "T";
  const used = new Set(tasks.map((t) => t.slug?.toUpperCase()));
  for (let i = 1; i <= 999; i++) {
    const candidate = `${prefix}${String(i).padStart(2, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${prefix}${tasks.length + 1}`;
}

export function emptyTask({ tasks = [], stageNumber } = {}) {
  return {
    slug: nextSlug(tasks, stageNumber),
    title: "",
    body_md: "",
    difficulty: "medium",
    weight: 0,
    tags: [],
  };
}

// Sum of weights as a number (NaN-safe).
export function weightSum(tasks) {
  return (tasks || []).reduce((s, t) => s + (Number(t.weight) || 0), 0);
}

// Max allowable weight sum for this form context.
//   - project creation: 1 - owner_share_bps/10_000
//   - stage creation:   1.0 (full mint goes to agents)
export function maxWeightSum({ isStage, ownerShareBps }) {
  if (isStage) return 1.0;
  const share = Number(ownerShareBps);
  return 1 - (Number.isFinite(share) ? share : 1000) / 10_000;
}

// Validate a manual plan body against the same rules the server enforces.
// Returns an array of human-readable error strings (empty on success).
//
// `mode` is "project" (full plan) or "stage" (just the tasks list).
export function validateManualPlan(plan, mode = "project") {
  const errs = [];
  const isStage = mode === "stage";

  if (!isStage) {
    const name = String(plan.name || "").trim();
    if (!name) errs.push("Name is required.");
    else if (name.length > 200) errs.push("Name is too long (max 200 chars).");

    const sym = String(plan.token_symbol || "").trim().toUpperCase();
    if (!SYMBOL_RE.test(sym)) errs.push("Token symbol must be 3–10 chars, A–Z and 0–9 only.");

    const supply = Number(plan.total_supply);
    if (!Number.isFinite(supply) || supply < SUPPLY_MIN || supply > SUPPLY_MAX) {
      errs.push(`Total supply must be ${SUPPLY_MIN.toLocaleString()}…${SUPPLY_MAX.toLocaleString()} whole tokens.`);
    }

    const share = Number(plan.owner_share_bps ?? 1000);
    if (!Number.isFinite(share) || share < SHARE_MIN_BPS || share > SHARE_MAX_BPS) {
      errs.push("Owner share must be 0–50% (0–5000 bps).");
    }
  }

  const tasks = plan.tasks || [];
  if (tasks.length === 0) errs.push("Add at least one task.");
  if (tasks.length > MAX_TASKS) errs.push(`Too many tasks (max ${MAX_TASKS}).`);

  const slugs = new Set();
  let sum = 0;
  tasks.forEach((t, i) => {
    const slug = String(t.slug || "").trim();
    if (!slug) errs.push(`Task #${i + 1}: slug is required.`);
    else if (slugs.has(slug.toUpperCase())) errs.push(`Task #${i + 1}: duplicate slug "${slug}".`);
    slugs.add(slug.toUpperCase());

    if (!String(t.title || "").trim()) errs.push(`Task #${i + 1}: title is required.`);
    if (!String(t.body_md || "").trim()) errs.push(`Task #${i + 1}: description is required.`);

    const w = Number(t.weight);
    if (!Number.isFinite(w) || w <= 0 || w > 1) errs.push(`Task #${i + 1}: weight must be (0, 1].`);
    else sum += w;

    if (t.difficulty && !DIFFICULTIES.includes(t.difficulty)) {
      errs.push(`Task #${i + 1}: difficulty must be ${DIFFICULTIES.join("|")}.`);
    }
  });

  const max = maxWeightSum({ isStage, ownerShareBps: plan.owner_share_bps });
  if (sum > max + 1e-3) {
    errs.push(`Weight sum ${sum.toFixed(3)} exceeds the budget ${max.toFixed(3)}.`);
  }
  if (sum < max * 0.7 - 1e-3) {
    errs.push(`Weight sum ${sum.toFixed(3)} is too low — distribute at least ${(max * 0.7).toFixed(3)} (ideally ${max.toFixed(3)}).`);
  }

  return errs;
}

// Compute the budget meter state for a tasks list. Used by both forms
// to render the same coloured progress bar.
export function budgetState({ tasks, isStage, ownerShareBps }) {
  const sum = weightSum(tasks);
  const max = maxWeightSum({ isStage, ownerShareBps });
  const ratio = max > 0 ? sum / max : 0;
  let tone = "danger";       // < 70% or > 100%
  if (ratio >= 0.7 && ratio <= 1.001) tone = "amber";
  if (Math.abs(ratio - 1) <= 0.001) tone = "ok";
  if (ratio > 1.001) tone = "over";
  return { sum, max, ratio, tone, remaining: Math.max(0, max - sum) };
}
