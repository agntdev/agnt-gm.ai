// Shared helpers for the manual project-plan / manual stage-tasks flows.
// Mirrors the server-side validation in `builder_projects.go` and
// `builder_stages.go` so the user gets immediate feedback rather than a
// round-trip rejection.

export const DIFFICULTIES = ["easy", "medium", "hard"];
export const MAX_TASKS = 50;
// Universal cap on task body_md, matched server-side across manual-project
// creation, manual-stage creation and add-tasks. 16384 chars is the
// backend's hard ceiling — we cap input here so users don't lose work on
// a long paste only to get a 400 from the API.
export const BODY_MD_MAX = 16384;
export const BODY_MD_WARN = Math.floor(BODY_MD_MAX * 0.8);
export const BODY_MD_MIN = 50;
export const TITLE_MAX = 200;
export const SYMBOL_RE = /^[A-Z0-9]{3,10}$/;
export const SUPPLY_MIN = 1_000_000;
export const SUPPLY_MAX = 1_000_000_000_000;
export const SHARE_MIN_BPS = 0;
// Client-side cap at 10% even though the server accepts up to 50%.
// 10% is the platform's product policy — keeps projects attractive to
// agents who otherwise see most of the mint disappear to the owner.
export const SHARE_MAX_BPS = 1000;

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
  // Default missing share to 0 (full pool to agents). Capped at 10%
  // (SHARE_MAX_BPS) — see validateManualPlan for the matching error.
  return 1 - (Number.isFinite(share) ? share : 0) / 10_000;
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

    const share = Number(plan.owner_share_bps ?? 0);
    if (!Number.isFinite(share) || share < SHARE_MIN_BPS || share > SHARE_MAX_BPS) {
      errs.push("Owner share must be 0–10% (0–1000 bps).");
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

// ───────────────────────── add-tasks validation ─────────────────────────
// Mirrors the Layer-1 server validation for POST /add-tasks. Same shape
// as validateManualPlan but stricter: weights must sum to EXACTLY 1.0
// (these split the NEW deposit, not the total pool), and the per-task
// (0.01, 0.85) range only applies when there's more than one task.
//
// `existingSlugs` is a Set of slugs already on the stage — duplicates
// against existing tasks must also fail client-side.
export function validateAddTasks(tasks, { existingSlugs = new Set(), deltaTonNano = 0, deltaJettonUnits = 0, supplyLocked = false } = {}) {
  const errs = [];

  if (!(Number(deltaTonNano) > 0)) errs.push("TON top-up is required (delta_ton_nano > 0).");
  if (Number(deltaJettonUnits) > 0 && supplyLocked) {
    errs.push("Supply is frozen — set jetton mint to 0.");
  }
  if (Number(deltaJettonUnits) < 0) errs.push("Jetton mint cannot be negative.");

  if (!tasks?.length) errs.push("Add at least one task.");
  if (tasks?.length > MAX_TASKS) errs.push(`Too many tasks (max ${MAX_TASKS}).`);

  const slugs = new Set();
  let sum = 0;
  const multi = tasks.length > 1;
  tasks.forEach((t, i) => {
    const slug = String(t.slug || "").trim();
    if (slug) {
      if (!/^[A-Za-z0-9_-]+$/.test(slug)) errs.push(`Task #${i + 1}: slug must match [A-Za-z0-9_-].`);
      if (slug.length > 20) errs.push(`Task #${i + 1}: slug too long (max 20 chars).`);
      const slugU = slug.toUpperCase();
      if (slugs.has(slugU)) errs.push(`Task #${i + 1}: duplicate slug "${slug}".`);
      if (existingSlugs.has(slugU)) errs.push(`Task #${i + 1}: slug "${slug}" collides with an existing task in this stage.`);
      slugs.add(slugU);
    }

    const title = String(t.title || "").trim();
    if (!title || title.length < 5) errs.push(`Task #${i + 1}: title too short (min 5 chars).`);
    if (title.length > TITLE_MAX) errs.push(`Task #${i + 1}: title too long (max ${TITLE_MAX}).`);

    const body = String(t.body_md || "").trim();
    if (body.length < BODY_MD_MIN) errs.push(`Task #${i + 1}: body too short (min ${BODY_MD_MIN} chars).`);
    if (body.length > BODY_MD_MAX) errs.push(`Task #${i + 1}: body too long (max ${BODY_MD_MAX}).`);

    if (t.difficulty && !["trivial", ...DIFFICULTIES].includes(t.difficulty)) {
      errs.push(`Task #${i + 1}: difficulty must be one of trivial|easy|medium|hard.`);
    }

    const w = Number(t.weight_within_new);
    if (!Number.isFinite(w)) errs.push(`Task #${i + 1}: weight required.`);
    else if (multi && w <= 0.01) errs.push(`Task #${i + 1}: weight too small (need > 0.01 when adding multiple tasks).`);
    else if (multi && w >= 0.85) errs.push(`Task #${i + 1}: weight too large (need < 0.85 — split into multiple smaller tasks).`);
    else if (!multi && (w <= 0 || w > 1)) errs.push(`Task #${i + 1}: weight must be (0, 1].`);
    sum += w || 0;
  });

  if (tasks?.length && Math.abs(sum - 1.0) > 0.001) {
    errs.push(`Weight sum is ${sum.toFixed(3)} — must equal 1.00 (weights split the NEW deposit, not the existing pool).`);
  }

  return errs;
}

// Default for a new "add tasks" row: blank slug (server auto-fills),
// title, body, default weight that balances out the rest of the batch.
export function emptyAddTask({ tasks = [], stageNumber } = {}) {
  return {
    slug: nextSlug(tasks, stageNumber),
    title: "",
    body_md: "",
    difficulty: "medium",
    weight_within_new: 0,
    tags: [],
  };
}
