# Backend ticket — make the cloud/local build-mode switch real

> **Confirmed broken in prod (2026-06-17).** Repro: owner opens a bot → "Add an
> agent" → **Cloud agent**. The FE deploys it (`POST .../cloud-agent`) and sets
> platform mode (`PUT .../build-mode {mode:"platform_agent"}`). That PUT returns
> **404 Not Found** (e.g. `PUT /api/builder/projects/18f5ecb0-1e51-47dc-84e6-f9ceaf4914ee/build-mode`).
> Net effect for the owner: the overview shows **"Cloud agent · running"** but the
> bot builds **0 tasks** — because the mode never persists (§1), so the pickup
> gate (§3) never sees platform mode, and the agent never picks up work. All three
> sections below are required for a deployed cloud agent to actually build.

**Problem.** The mini-app lets the owner choose who builds a bot — **cloud agent**
(platform builds) or **local agent** (owner's Claude/Codex). The frontend already
sends the choice, but the two endpoints behind it aren't implemented, so the
switch is currently UI/localStorage-only and the platform doesn't honor it. The
local-agent path (`agent-link`) already works and needs nothing new.

Base path: `/api/builder`, owner derived from the Telegram session JWT, `{id}` is
a project id or slug. Frontend tolerates 404/405 today, so these can ship in any
order.

## 1. Persist the build mode

```
PUT /api/builder/projects/{id}/build-mode
Request:  { "mode": "platform_agent" | "local_agent" }
Response: { "build_mode": "platform_agent" }
```

Also return the stored value on the existing project endpoint so the UI reflects
the real mode on load (not just localStorage):

```
GET /api/builder/projects/{id}
Response (addition): { ..., "build_mode": "platform_agent" }
```

Frontend already calls `setBuildModeApi()` and reads `Project.build_mode`.

## 2. Cloud agent — deploy / status (max one per bot)

```
POST   /api/builder/projects/{id}/cloud-agent   -> { "id": "ca_…", "status": "deploying" }   (202 ok)
                                                   409 if one already exists
GET    /api/builder/projects/{id}/cloud-agent   -> { "deployed": true, "status": "running", "id": "ca_…" }
                                                   { "deployed": false } when none
DELETE /api/builder/projects/{id}/cloud-agent   -> { "deployed": false }   (optional — frees the slot)
```

Frontend already calls `runCloudAgent()` (the POST); the GET lets the UI stop
tracking deployed state client-side.

## 3. The actual behavior gate (the point of this ticket)

Task pickup must follow `build_mode`:

- **`platform_agent`** → the platform's cloud agent picks up and builds the
  project's tasks (writes code, opens PRs).
- **`local_agent`** → the platform does **not** pick up tasks; it only runs gates
  (CI checks) and deploys, leaving the work to the owner's connected agent.

Switching mode at any time must flip this behavior accordingly.

## Notes

- Local agents need no new endpoints — the sheet's "Local agent" option uses the
  existing `POST/GET .../agent-link`.
- Keep field names exactly as above; the typed client maps them 1:1.
- Return 401/403 for non-owners; reserve 409 for the second-cloud-agent case
  (the UI handles it). Everything else 404/405 = "not shipped" fallback.
