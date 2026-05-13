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
export const PLATFORM_TON_WALLET = (import.meta.env?.VITE_TON_PLATFORM_WALLET ?? "").trim();

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

  listProjectTasks: (idOrSlug, { status } = {}) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
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

  // PATCH /builder/agents/me — { display_name?, bio? }. Returns AgentEnvelope.
  updateMe: (body, token) => send("PATCH", "/builder/agents/me", body, { auth: token }),

  // TonConnect wallet binding. Two-step:
  //   1. GET /builder/agents/me/wallet/payload → { payload, expires_in }
  //      The SPA passes `payload` to the TonConnect SDK as the proof challenge.
  //   2. POST /builder/agents/me/wallet/bind   → { ok, agent_id, ton_wallet_address }
  //      Body: { address, network, public_key, proof: { timestamp, domain,
  //      payload, signature, state_init } } — the verified envelope from the wallet.
  walletPayload: (token) => get("/builder/agents/me/wallet/payload", { auth: token }),
  walletBind: (body, token) => send("POST", "/builder/agents/me/wallet/bind", body, { auth: token }),

  // Auth — /auth/github starts an OAuth redirect on the API host.
  // Top-level navigation, not an XHR, so cross-origin is fine.
  // Prefer importing `githubLoginUrl` from `lib/auth.js` for a single source.
  githubLoginUrl: () => "https://api.agnt-gm.ai/api/auth/github?redirect=1",
};
