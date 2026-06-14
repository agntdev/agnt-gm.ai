# Backend API request — bot controls, agent registry & analytics

**Hand this to the API agent.** These endpoints back the redesigned **bot overview**
page in the mini-app. The frontend already calls them and degrades gracefully
when they 404/405 (see `src/api/client.ts`), so you can ship them independently
and in any order — the UI lights up automatically as each lands.

Base path: `/api/builder` (same auth as the rest of the builder API — owner
derived from the Telegram session JWT). `{id}` is a project id or slug.

---

## 1. Pause / resume the managed bot

The overview has a **Pause / Resume** control next to "Test bot". Today the UI
flips the status pill optimistically and persists locally; it needs a real
control that stops/starts the deployed Telegram bot (disable/enable its
webhook or equivalent).

```
PUT /api/builder/projects/{id}/bot/pause
Request:  { "paused": true }            // or false to resume
Response: { "paused": true, "paused_at": "2026-06-14T09:41:00Z" }
```

Also include the current state on the existing bot endpoint so the UI can show
the real status on load:

```
GET /api/builder/projects/{id}/bot
Response (additions): { ..., "paused": false, "paused_at": null }
```

Frontend: `setBotPaused()`, and `ProjectBot.paused` / `paused_at`.

---

## 2. Local-agent registry + per-project assignment

The "Manage" sheet ("Add an agent") lists the owner's **local agents** (their
connected Claude/Codex CLIs across all projects) and lets them assign any one
to a project to pick up its tasks. The connect-code flow
(`POST .../agent-link`) still handles adding a *new* local agent.

### 2a. The owner's local agents (account-scoped)

```
GET /api/builder/agents
Response: { "agents": [
  { "id": "agt_1", "name": "Claude (laptop)", "client": "claude",
    "status": "online", "last_seen_at": "2026-06-14T09:39:00Z" }
] }
```
`status`: `"online"` | `"offline"` (derive from a recent heartbeat / last
delegate-key use). `client`: `"claude"` | `"codex"` | `"cursor"` | …

### 2b. Agents assigned to a project

```
GET /api/builder/projects/{id}/agents
Response: { "agents": [ { "id": "agt_1", ...same shape..., "assigned": true } ] }
```

### 2c. Assign / unassign

```
POST   /api/builder/projects/{id}/agents/{agentId}/assign   -> 200 { "assigned": true }
DELETE /api/builder/projects/{id}/agents/{agentId}          -> 200 { "assigned": false }
```
Assigning means that agent is authorized/expected to work this project's open
tasks (same effect today's connected agent has, but selectable per project).

Frontend: `listMyAgents()`, `listProjectAgents()`, `assignAgent()`,
`unassignAgent()`, type `LocalAgent`. Until this ships, the sheet falls back to
the single agent from `GET .../agent-link` — no invented agents are shown.

---

## 3. One-time cloud agent run

The sheet's **"Cloud agent · one-time"** option triggers a *single* platform
build pass: the platform's agents pick up the project's open tasks once, ship
PRs, then stop. This is distinct from always-on platform mode (`build-mode =
platform_agent`).

```
POST /api/builder/projects/{id}/cloud-run
Response: { "run_id": "run_abc", "status": "queued" }   // 202 also accepted
```

Optional (nice to have) — let the UI report progress:
```
GET /api/builder/projects/{id}/cloud-run/{runId}
Response: { "run_id": "run_abc", "status": "running|done|failed",
            "tasks_picked": 4, "prs_opened": 2 }
```

Frontend: `runCloudAgent()`, type `CloudRun`. On error the UI shows
"Couldn't start — tap to retry"; on success "Run started — building & shipping PRs".

---

## 4. Deployed-bot analytics

The stat card currently shows real **build** stats (tasks/deploys/commits). The
same 3-up card is wired to swap to **end-user** analytics for the deployed bot
once this exists (matching the mock's "active users / today / vs. yest.").

```
GET /api/builder/projects/{id}/analytics
Response: {
  "active_users": 3127,        // distinct users in the window
  "messages_today": 418,       // bot messages handled today
  "delta_pct": 9,              // % change vs. yesterday (can be negative)
  "window": "7d"               // window the active_users count covers
}
```

Frontend: `getBotAnalytics()`, type `BotAnalytics`. 404/405 → the card keeps
showing real build stats (no fake numbers).

---

## Notes for the implementer

- All endpoints are owner-scoped via the existing session JWT; 401/403 on
  non-owners.
- The frontend treats **404 and 405** as "not shipped yet" and falls back
  silently. Any other error (4xx/5xx) surfaces to the user, so return those
  only for genuine failures.
- Keep response field names exactly as above — the typed client maps them 1:1.
