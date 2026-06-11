# AgentBot — Telegram Mini-App

A Telegram Mini-App where an owner describes a bot idea in plain words and the
platform designs, builds, tests and deploys it. Implemented from the
*BotForge Mini-App* design handoff (claude.ai/design), wired to the
[agnt API](https://api.agnt-gm.ai/swagger/index.html).

## The flow

| Stage | Screen | Backed by |
|---|---|---|
| — | **Prompt** (hero) — describe your bot | local |
| — | **Clarify** — 3 quick questions in chat | local → `POST /builder/projects` (idea + answers), poll `GET /builder/projects/{id}` until the LLM plan is ready (~30–90s) |
| 1 | **Spec** — generated spec + *Create the bot* | real plan fields; create = `POST /builder/projects/{id}/publish` |
| 2 | **Connect agent** — `npx agentbot connect` | real CLI device-flow: `POST /auth/cli-session` + poll (in-app GitHub sign-in shortcut included; simulated fallback if the API is unreachable) |
| 3 | **Build plan** — task queue for the agent | real `GET /builder/projects/{id}/tasks` |
| 4 | **Building** — 3 parallel tracks + live log | simulated animation (no live-progress API); log seeded with real task titles |
| 5 | **Testing & review** — final sign-off | simulated checks; real repo / live-url links |
| — | **My Bots** tab — post-launch feedback loop | real `GET /builder/projects?owner_wallet=…`; per-bot update chat is simulated (no update API yet) |

The Discover tab from the design exists but is hidden, matching the design's
final state.

## Wallet

Project creation is wallet-first (`owner_wallet_address`). The design has no
wallet screen, so the standard TON Connect modal opens lazily when you tap
**Start generating** without a connected wallet. A small pill on the Prompt
screen shows the connected address.

## Run

```sh
npm install
npm run dev
```

The dev server proxies `/api` → `https://api.agnt-gm.ai` (the API does not
allow cross-origin browser calls). In production, host the app behind the same
domain or a reverse proxy that forwards `/api`.

### Environment (optional, see `.env.example`)

- `VITE_API_BASE` — API base URL (default `/api`, i.e. the proxy)
- `VITE_OWNER_WALLET` — skip TON Connect and use this wallet address (dev convenience)
- `VITE_TONCONNECT_MANIFEST` — your own TON Connect manifest URL
  (defaults to the platform's `https://api.agnt-gm.ai/tonconnect-manifest.json`)

## Inside Telegram

The app detects the Telegram container (theme follows `colorScheme`, header /
background colors are synced, viewport expanded). In a plain browser it falls
back to `prefers-color-scheme`.

## Notes

- `npm run build` type-checks and produces `dist/`.
- Creating a project (**Start generating** past the clarify chat) and
  **Create the bot** (publish) perform real writes on the agnt platform —
  a project record, then a GitHub repo with one issue per task.
