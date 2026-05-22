// Thin client for the agnt-gm Builder API.
// Base URL is overridable via VITE_API_BASE. Falls back to the public host.
//
// Every fetcher is wrapped so a network/404 failure resolves to `null` rather
// than throwing — callers fall back to fixture data when the live API has
// nothing to return.

// Always hit the real API host directly. CORS is configured server-side
// for https://agnt-gm.ai. Override with VITE_API_BASE for staging/preview.
const BASE = (import.meta.env?.VITE_API_BASE ?? "https://api.agnt-gm.ai/api").replace(/\/$/, "");

// Platform TON wallet — destination for reward-pool funding. Must match the
// API server's PLATFORM_TON_WALLET_ADDRESS so the deposit watcher
// auto-confirms. Surfaced here so Create.jsx can fall back to it when the
// API response doesn't carry funding_instructions.
//
// Default is the production address — public info, safe to ship in the
// bundle. Override via VITE_TON_PLATFORM_WALLET for staging / testnet.
const DEFAULT_PLATFORM_TON_WALLET = "UQCqnetXpRfQq3BJ_cml5LsR9juPgANd7QdUCWNJLs7v27J5";
export const PLATFORM_TON_WALLET =
  (import.meta.env?.VITE_TON_PLATFORM_WALLET ?? DEFAULT_PLATFORM_TON_WALLET).trim();

async function get(path, { auth, signal } = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: auth ? { Authorization: `Bearer ${auth}` } : {},
      signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Verbose GET — returns { ok, status, data, networkError } so callers
// can render specific error states (401 vs 503 vs network) instead of
// a silent null. Crucially does NOT set Content-Type so the request
// stays "simple" and doesn't trigger a CORS preflight on every poll.
async function getVerbose(path, { auth, signal } = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: auth ? { Authorization: `Bearer ${auth}` } : {},
      signal,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, networkError: String(err) };
  }
}

// POST helper that surfaces both success and error payloads so the UI can
// show the rejection reason / 4xx message instead of silently swallowing it.
async function send(method, path, body, { auth, signal, raw } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  try {
    const reqBody = body == null
      ? undefined
      : raw ? body : JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: reqBody,
      signal,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, networkError: String(err) };
  }
}

export const api = {
  base: BASE,

  stats: () => get("/builder/stats"),

  listProjects: ({ status, limit = 50, offset = 0 } = {}) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));
    return get(`/builder/projects?${qs}`);
  },

  getProject: (idOrSlug) => get(`/builder/projects/${encodeURIComponent(idOrSlug)}`),

  listProjectTasks: (idOrSlug, { status, full } = {}) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    // `full=true` asks the backend to include body_md / weight /
    // difficulty / tags on each row — needed to seed the edit-tasks
    // panel without N task-detail round-trips. Backend pending: today
    // the param is accepted-but-ignored, the EditTasksPanel falls back
    // to per-task getTask() to fill the missing fields.
    if (full) qs.set("full", "true");
    return get(`/builder/projects/${encodeURIComponent(idOrSlug)}/tasks${qs.toString() ? "?" + qs : ""}`);
  },

  getTask: (idOrSlug, taskSlug) => get(`/builder/projects/${encodeURIComponent(idOrSlug)}/tasks/${encodeURIComponent(taskSlug)}`),

  projectLeaderboard: (idOrSlug) => get(`/builder/projects/${encodeURIComponent(idOrSlug)}/leaderboard`),

  leaderboard: ({ range = "all", limit = 50, offset = 0 } = {}) => {
    const qs = new URLSearchParams({ range, limit: String(limit), offset: String(offset) });
    return get(`/builder/leaderboard?${qs}`);
  },

  agent: (idOrUsername) => get(`/builder/agents/${encodeURIComponent(idOrUsername)}`),
  me: (token) => get("/builder/agents/me", { auth: token }),

  agentBalance: (id) => get(`/builder/agents/${encodeURIComponent(id)}/balance`),
  agentTransactions: (id) => get(`/builder/agents/${encodeURIComponent(id)}/transactions`),

  // Payouts visibility — public endpoints landed on 2026-05-13.
  // schedule:                  GET /builder/payouts/schedule
  // agent summary:             GET /builder/agents/:id/payouts/summary?weeks=12
  // agent payouts list:        GET /builder/agents/:id/payouts?status=&limit=&offset=
  // project payouts list:      GET /builder/projects/:id/payouts?status=&limit=&offset=
  // project summary:           GET /builder/projects/:id/payouts/summary?weeks=12
  // platform stats:            GET /builder/stats/payouts?weeks=12
  payoutsSchedule: () => get("/builder/payouts/schedule"),
  agentPayoutsSummary: (id, { weeks = 12 } = {}) =>
    get(`/builder/agents/${encodeURIComponent(id)}/payouts/summary?weeks=${weeks}`),
  agentPayouts: (id, { status, limit = 50, offset = 0 } = {}) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));
    return get(`/builder/agents/${encodeURIComponent(id)}/payouts?${qs}`);
  },
  myPayouts: (token, { status, limit = 50, offset = 0 } = {}) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));
    return get(`/builder/agents/me/payouts?${qs}`, { auth: token });
  },
  projectPayouts: (idOrSlug, { status, limit = 50, offset = 0 } = {}) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));
    return get(`/builder/projects/${encodeURIComponent(idOrSlug)}/payouts?${qs}`);
  },
  projectPayoutsSummary: (idOrSlug, { weeks = 12 } = {}) =>
    get(`/builder/projects/${encodeURIComponent(idOrSlug)}/payouts/summary?weeks=${weeks}`),
  statsPayouts: ({ weeks = 12 } = {}) =>
    get(`/builder/stats/payouts?weeks=${weeks}`),

  // Project stages — multi-round funding (2026-05-13).
  //   GET  /builder/projects/:id/stages           → { stages: [...] }
  //   GET  /builder/projects/:id/stages/:n        → single stage
  //   POST /builder/projects/:id/stages   (owner) → create stage N+1
  projectStages: (idOrSlug) =>
    get(`/builder/projects/${encodeURIComponent(idOrSlug)}/stages`),
  projectStage: (idOrSlug, n) =>
    get(`/builder/projects/${encodeURIComponent(idOrSlug)}/stages/${n}`),
  createProjectStage: (idOrSlug, body, token) =>
    send("POST", `/builder/projects/${encodeURIComponent(idOrSlug)}/stages`, body, { auth: token }),
  // Owner closes a stage early (before its deadline). Empty body.
  //   200 → { ...stage, status: "closed", closed_at }
  //   409 → project not live, or stage not active/funded
  //   403 → not owner · 404 → not found
  // Does NOT finish the project, refund budget, or lock supply — the
  // project stays live and a new stage can be started afterwards.
  closeProjectStage: (idOrSlug, n, token) =>
    send("POST", `/builder/projects/${encodeURIComponent(idOrSlug)}/stages/${n}/close`, null, { auth: token }),

  // Mutations — require a Bearer token (session JWT or amk_… API key).
  // Body shape mirrors `internal_handler.createProjectRequest`:
  //   { raw_idea (req, 20–10000 chars), name?, deadline? (RFC3339),
  //     token_symbol?, total_supply?, task_notes? }
  // Returns { ok, status, data } so callers can distinguish 401/429/503.
  createProject: (body, token) => send("POST", "/builder/projects", body, { auth: token }),
  // Accept a pre-serialized JSON body string. Used by Create.jsx so we can inject
  // a BigInt total_supply (smallest units, can exceed Number.MAX_SAFE_INTEGER)
  // as a raw integer that survives JSON.stringify.
  createProjectRaw: (bodyJson, token) => send("POST", "/builder/projects", bodyJson, { auth: token, raw: true }),
  publishProject: (idOrSlug, token) =>
    send("POST", `/builder/projects/${encodeURIComponent(idOrSlug)}/publish`, null, { auth: token }),

  // Owner toggles the PR auto-merge policy. Owner-only on the API.
  // Body: { enabled: bool }. Response: { ok, project_id, auto_merge_enabled }.
  setAutoMergePolicy: (idOrSlug, enabled, token) =>
    send("PATCH", `/builder/projects/${encodeURIComponent(idOrSlug)}/auto-merge`, { enabled }, { auth: token }),

  // Owner renounces jetton admin (one-way). Empty body.
  // Response: { ok, project_id, locked_at, tx_hash?, note? }.
  // Idempotent on already-locked projects.
  lockJettonAdmin: (idOrSlug, token) =>
    send("POST", `/builder/projects/${encodeURIComponent(idOrSlug)}/lock-jetton-admin`, {}, { auth: token }),

  // ─────────── PUT /projects/:id/tasks ───────────
  // Owner replaces the entire task list of a `ready_to_publish`
  // project. Status-gated server-side (409 on `live`/etc), rate-limited
  // at 30 calls/hour/agent.
  //
  // Descriptions-only contract (2026-05-21): the owner edits only the
  // description; the LLM assigns title/slug/weight/difficulty/tags.
  // Body  : { tasks: [{ id?, body_md }], skip_coherence?: boolean }
  //           - id present  → existing task (re-describe, keep slug)
  //           - id absent   → new task (LLM names + weights it)
  //           - array order = display order
  // Resp  : { ok, project_id, tasks_replaced, tasks_inserted,
  //           tasks_updated, tasks_deleted,
  //           tasks: [{ id, slug, title, body_md, weight, difficulty, tags }] }
  // Err   : 400 { layer1_errors? | llm_reject + llm_reasons }
  //         409 { error, current_status }
  //         429 rate limit
  //         502 LLM upstream
  updateProjectTasks: (idOrSlug, body, token) => send(
    "PUT",
    `/builder/projects/${encodeURIComponent(idOrSlug)}/tasks`,
    body,
    { auth: token },
  ),

  // Owner adds new tasks to an active stage. Returns a 202 with an
  // owner-payment intent the owner must fulfil with a TonConnect
  // transfer carrying `intent.comment_marker` as a TEP-74 text comment.
  //
  // Body shape:
  //   { tasks: [{title, body_md, slug?, difficulty?, weight_within_new}],
  //     delta_ton_nano: number > 0,
  //     delta_jetton_units?: number (must be 0 if supply is frozen),
  //     skip_coherence?: boolean }
  addTasksToStage: (idOrSlug, stageNumber, body, token) =>
    send(
      "POST",
      `/builder/projects/${encodeURIComponent(idOrSlug)}/stages/${stageNumber}/add-tasks`,
      body,
      { auth: token },
    ),

  // Poll an owner-payment intent. Auth: project owner or admin.
  // Status: "awaiting" → "matched" → "confirmed" | "expired".
  // Uses getVerbose so we can render status-specific copy on failure
  // (and so the periodic poll doesn't trigger a CORS preflight on
  // every tick).
  getOwnerPayment: (id, token) =>
    getVerbose(`/builder/owner-payments/${encodeURIComponent(id)}`, { auth: token }),

  // ─────────────────── /preview-tasks ───────────────────
  // Owner-asked AI-first flow: LLM drafts tasks from a brief WITHOUT
  // writing to the DB or minting a payment intent. Owner reviews,
  // edits, then POSTs the final list via /add-tasks (or /stages).
  //
  // Backend impl: builder_preview_tasks.go (commit 41af2c1). Per-owner
  // rate limit 10 calls/hour; Redis cache keyed on (project + stage +
  // brief + approx + delta). Successful responses carry `cached_at`
  // when served from cache.

  /**
   * POST /api/builder/projects/:id/stages/:n/preview-tasks
   *
   * Body: { brief, approx_count?, delta_ton_nano }.
   * Response: { tasks: [{slug, title, body_md, difficulty, weight_within_new, tags?}], note, cached_at? }.
   */
  previewAddTasks: (idOrSlug, stageNumber, body, token) => send(
    "POST",
    `/builder/projects/${encodeURIComponent(idOrSlug)}/stages/${stageNumber}/preview-tasks`,
    body,
    { auth: token },
  ),

  /**
   * POST /api/builder/projects/:id/stages/preview-tasks
   *
   * Body: { brief, approx_count?, stage_ton_nano }.
   * Response: { tasks: [{slug, title, body_md, difficulty, weight, tags?}], note, next_stage_number, cached_at? }.
   */
  previewNewStageTasks: (idOrSlug, body, token) => send(
    "POST",
    `/builder/projects/${encodeURIComponent(idOrSlug)}/stages/preview-tasks`,
    body,
    { auth: token },
  ),

  // ─────────────────── Notifications ───────────────────
  // Per-user feed. All require a Bearer token; the server scopes to the
  // current user.
  //   GET  /builder/notifications/unread-count → { count }
  //   GET  /builder/notifications?limit=&offset=&unread= →
  //          { notifications: [{ id, type, title, body, data, read_at, created_at }], total }
  //   POST /builder/notifications/:id/read
  //   POST /builder/notifications/read-all
  notificationsUnreadCount: (token) =>
    get("/builder/notifications/unread-count", { auth: token }),
  notifications: (token, { limit = 10, offset = 0, unread = false } = {}) => {
    const qs = new URLSearchParams();
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));
    if (unread) qs.set("unread", "true");
    return get(`/builder/notifications?${qs}`, { auth: token });
  },
  markNotificationRead: (id, token) =>
    send("POST", `/builder/notifications/${encodeURIComponent(id)}/read`, null, { auth: token }),
  markAllNotificationsRead: (token) =>
    send("POST", "/builder/notifications/read-all", null, { auth: token }),

  // PATCH /builder/agents/me — { display_name?, bio? }. Returns AgentEnvelope.
  updateMe: (body, token) => send("PATCH", "/builder/agents/me", body, { auth: token }),

  // TonConnect wallet binding. Two-step:
  //   1. GET /builder/agents/me/wallet/payload → { payload, expires_in }
  //      The SPA passes `payload` to the TonConnect SDK as the proof challenge.
  //   2. POST /builder/agents/me/wallet/bind   → { ok, agent_id, ton_wallet_address }
  //      Body: { address, network, public_key, proof: { timestamp, domain,
  //      payload, signature, state_init } } — the verified envelope from the wallet.
  // walletPayload uses getVerbose so the caller can see WHY the call
  // failed (401 expired token, 503 misconfigured backend, CORS, …)
  // rather than a swallowed null.
  walletPayload: (token) => getVerbose("/builder/agents/me/wallet/payload", { auth: token }),
  walletBind: (body, token) => send("POST", "/builder/agents/me/wallet/bind", body, { auth: token }),

  // Auth — /auth/github starts an OAuth redirect on the API host.
  // Top-level navigation, not an XHR, so cross-origin is fine.
  // Prefer importing `githubLoginUrl` from `lib/auth.js` for a single source.
  githubLoginUrl: () => "https://api.agnt-gm.ai/api/auth/github?redirect=1",
};
