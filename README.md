# AgentBot — Telegram Mini-App

A Telegram Mini-App where an owner describes a bot idea in plain words and the
platform designs, builds, tests and deploys it. Implemented from the
*BotForge Mini-App* design handoff (claude.ai/design), wired to the
[agnt API](https://api.agnt-gm.ai/swagger/index.html).

## The flow

| Stage | Screen | Backed by |
|---|---|---|
| - | **Prompt** - describe your bot | Telegram auth via `POST /auth/telegram`, then `POST /builder/chat` |
| - | **Clarify** - quick owner/AI chat | real project chat via `GET/POST /builder/projects/{id}/chat/messages` |
| 1 | **Review** - generated bot review + *Create bot* | real project fields, `POST /builder/projects/{id}/bot/initiate`, poll `GET /builder/projects/{id}/bot` |
| 2 | **Cloud build** - starts automatically from the review footer | task-manager projects auto-build; legacy projects call `POST /builder/projects/{id}/publish` |
| - | **Bot overview** - production status and change loop | `GET /builder/projects/{id}`, `/dag`, `/deployments`, `/bot`, `/blocked`, and project chat |
| - | **Advanced agents** - optional cloud/local builder controls | `/cloud-agent`, `/agent-link`, and build-mode endpoints |
| - | **Discover** - live bots with real Telegram usernames | `GET /builder/projects/discover` |

The default creator path is cloud-first: describe the bot, answer only needed
clarifying questions, create the Telegram bot, then watch the build from the
overview. Local/Codex/Claude agent setup stays behind the advanced agent sheet.

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

## Inside Telegram

The app detects the Telegram container (theme follows `colorScheme`, header /
background colors are synced, viewport expanded). In a plain browser it falls
back to `prefers-color-scheme`.

## Notes

- `npm run build` type-checks and produces `dist/`.
- Starting generation, creating the managed Telegram bot, changing build mode,
  and deploy actions perform real writes on the agnt platform.
