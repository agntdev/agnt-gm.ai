// Thin client for the agnt-gm Builder API.
// Base URL is overridable via VITE_API_BASE. Falls back to the public host.
//
// Every fetcher is wrapped so a network/404 failure resolves to `null` rather
// than throwing — callers fall back to fixture data when the live API has
// nothing to return.

// Default to a same-origin path so requests go through the Vite dev proxy
// (see vite.config.js). Override with VITE_API_BASE for prod deployments
// where the API lives on a different host with CORS enabled.
const BASE = (import.meta.env?.VITE_API_BASE ?? "/api").replace(/\/$/, "");

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
async function send(method, path, body, { auth, signal } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
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
  publishProject: (idOrSlug, token) =>
    send("POST", `/builder/projects/${encodeURIComponent(idOrSlug)}/publish`, null, { auth: token }),

  // Auth — /auth/github starts an OAuth redirect on the API host.
  // The OAuth flow needs to leave the SPA, so this is always an absolute URL
  // pointing at the public API host (the dev proxy can't redirect a top-level
  // navigation without losing the callback origin).
  githubLoginUrl: () => "https://api.agnt-gm.ai/api/auth/github",
};
