// Centralized auth state. All reads/writes go through here so the Nav,
// Create page, and any future pages stay in sync.
//
// We persist three things to localStorage when a sign-in completes:
//   agnt_jwt      – short-lived session JWT issued by /auth/github/callback
//   agnt_api_key  – long-lived amk_… API key (also issued by the callback,
//                   useful for CLI/scripts; either token works for `Authorization`)
//   agnt_agent    – cached AgentOAS payload (id, github_username, avatar, …)
//
// The auth helper exposes a tiny pub-sub so React components can subscribe
// without a context provider.

import { useEffect, useState } from "react";
import { api } from "./api.js";

const KEYS = { jwt: "agnt_jwt", apiKey: "agnt_api_key", agent: "agnt_agent" };
const listeners = new Set();
function emit() { listeners.forEach((fn) => fn()); }

function safeRead(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeWrite(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* ignore quota / private mode */ }
}

export function getToken() {
  // Prefer the session JWT; fall back to the long-lived API key.
  return safeRead(KEYS.jwt) || safeRead(KEYS.apiKey) || "";
}

export function getAgent() {
  const raw = safeRead(KEYS.agent);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Persist a manually-pasted Bearer token (used by Create page's "Paste token"
// affordance). Doesn't carry an agent payload — `useAuth` will fetch /me to
// hydrate one shortly after.
export function setManualToken(token) {
  safeWrite(KEYS.jwt, token || null);
  if (!token) safeWrite(KEYS.agent, null);
  emit();
}

// Called by /auth/callback after OAuth redirects back with the URL fragment.
export function setSession({ token, jwt, agent_id, agent }) {
  if (jwt) safeWrite(KEYS.jwt, jwt);
  if (token) safeWrite(KEYS.apiKey, token);
  if (agent) {
    safeWrite(KEYS.agent, JSON.stringify(agent));
  } else if (agent_id) {
    // Stash a stub so the UI has *something* to render until /me responds.
    safeWrite(KEYS.agent, JSON.stringify({ id: agent_id }));
  }
  emit();
}

export function signOut() {
  Object.values(KEYS).forEach((k) => safeWrite(k, null));
  emit();
}

// React hook: returns { token, agent, authed, refresh, signOut }.
// On first sign-in it calls /me to hydrate the full agent profile.
export function useAuth() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const cb = () => setTick((n) => n + 1);
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  }, []);

  const token = getToken();
  const agent = getAgent();

  // Hydrate the agent profile lazily: if we have a token but no profile (or
  // only a stub from setSession), fetch /me and cache it.
  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    if (agent && agent.github_username) return;
    api.me(token).then((res) => {
      if (cancelled) return;
      if (res?.agent) {
        safeWrite(KEYS.agent, JSON.stringify(res.agent));
        emit();
      }
      // Note: api.me returns null on any failure (network, 4xx, 5xx). We
      // can't distinguish "token revoked" from "API unreachable" here, so
      // we keep the cached state and let the next real API call (Create,
      // etc.) surface a 401 if the token is actually invalid.
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tick]);

  return {
    token,
    agent,
    authed: Boolean(token),
    refresh: () => setTick((n) => n + 1),
    signOut,
  };
}

// Build the GitHub OAuth start URL.
//
// Top-level navigation, not an XHR, so we go straight to the API host (no
// CORS concerns). The flow is:
//   1. Browser → https://api.agnt-gm.ai/api/auth/github?redirect=1
//   2. API     → 302 to GitHub's authorize URL
//   3. GitHub  → user authorizes, redirects to the registered callback at
//                https://api.agnt-gm.ai/api/auth/github/callback?code=…
//   4. API     → 302 to ${WEB_URL}/auth/callback#token=…&jwt=…&agent_id=…
//   5. SPA     → AuthCallback parses the fragment, persists, redirects to /
//
// `${WEB_URL}` is the API's env var pointing at this SPA's deployed origin
// (e.g. https://agnt-gm.ai).
const API_HOST = (import.meta.env?.VITE_API_HOST ?? "https://api.agnt-gm.ai").replace(/\/$/, "");

export function githubLoginUrl() {
  return `${API_HOST}/api/auth/github?redirect=1`;
}
