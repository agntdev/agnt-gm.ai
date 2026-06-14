# Backend API request — bot controls, cloud agent & analytics

**Hand this to the API agent.** These endpoints back the redesigned **bot overview**
page and its **"Add an agent"** sheet in the mini-app. The frontend already calls
them and degrades gracefully when they 404/405 (see `src/api/client.ts`), so you
can ship them independently and in any order.

Base path: `/api/builder` (same auth as the rest of the builder API — owner
derived from the Telegram session JWT). `{id}` is a project id or slug.

The agent model is deliberately simple: a bot gets **one cloud agent** (we
deploy and run it) **or a local agent** (the owner's Claude/Codex, connected
with a code). The local path reuses the **existing** agent-link endpoints
(`POST/GET .../agent-link`) — nothing new needed there. What's new is below.

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

## 2. Cloud agent — deploy one (max one per bot)

The "Add an agent" sheet's **Cloud agent** option deploys a single managed agent
that picks up and builds the project's tasks. **At most one cloud agent per
bot** — the deploy call must reject a second one (409), and the UI should be
able to tell whether one already exists.

```
POST /api/builder/projects/{id}/cloud-agent
Response: { "id": "ca_abc", "status": "deploying" }   // 202 also accepted
          409 if a cloud agent is already deployed for this bot
```

Status (so the overview can show "running" and the sheet can show "deployed"):
```
GET /api/builder/projects/{id}/cloud-agent
Response: { "deployed": true, "status": "running", "id": "ca_abc",
            "deployed_at": "2026-06-14T09:41:00Z" }
          // { "deployed": false } when none
```

Optional — let the owner remove it (frees the single slot):
```
DELETE /api/builder/projects/{id}/cloud-agent   -> 200 { "deployed": false }
```

Frontend: `runCloudAgent()` (the POST). On error the sheet shows "Couldn't
deploy — tap to retry"; on success "Deployed — running" and the slot is locked.
The deployed/running state is currently tracked client-side until the GET ships.

---

## 3. Deployed-bot analytics

The overview stat card currently shows real **build** stats (tasks/deploys/
commits). The same 3-up card swaps to **end-user** analytics for the deployed
bot once this exists (matching the mock's "active users / today / vs. yest.").

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
  silently. Return other 4xx/5xx only for genuine failures (e.g. **409** when a
  second cloud agent is requested — that's expected and the UI handles it).
- Keep response field names exactly as above — the typed client maps them 1:1.
- **Local agents** need no new endpoints: the sheet's "Local agent" option mints
  a one-time code via the existing `POST /api/builder/projects/{id}/agent-link`
  and polls `GET .../agent-link` until the CLI claims it.
