# Backend ticket — Discover feed + per-bot discoverability

**Problem.** The mini-app has a new **Discover** tab: a public feed of live bots
built on the platform, that anyone can browse and open in Telegram. The frontend
ships ahead and feature-detects — until these endpoints exist the tab shows an
empty "coming soon" state and the per-bot toggle is localStorage-only. Unlike
other flags there is **no client-side fallback for the listing**: other users'
bots cannot be enumerated from the client.

Base path: `/api/builder`, owner derived from the Telegram session JWT, `{id}` is
a project id or slug. Frontend tolerates 404/405 today, so these can ship in any
order.

## 1. The discover listing

```
GET /api/builder/projects/discover?limit=50
Response: { "projects": [Project], "total": n, "limit": 50, "offset": 0 }
```

Returns **live/published** bots only, where `discoverable !== false`. Everyone's
bots (not scoped to the caller). Each project **MUST** include the real
`bot_username` — the card links to `https://t.me/<bot_username>`, and a bot with
no username must be omitted (it can't be opened). Also include `name`,
`short_description`, `logo_url`, and the card stats already on the DTO
(`active_agents`, `prs_merged_7d`) where available.

## 2. Per-bot discoverability

```
PUT /api/builder/projects/{id}/discoverable
Request:  { "discoverable": true | false }
Response: { "discoverable": false }
```

Owner-only (401/403 for non-owners). Live bots default to `discoverable = true`.

Also return the stored value on the existing project endpoint so the overview
toggle reflects the real state on load (not just localStorage):

```
GET /api/builder/projects/{id}
Response (addition): { ..., "discoverable": true }
```

## Notes

- Keep field names exactly as above; the typed client maps them 1:1
  (`bot_username`, `discoverable`).
- Frontend already calls `listDiscoverBots()` (the GET) and `setDiscoverable()`
  (the PUT). Everything else 404/405 = "not shipped" fallback.
