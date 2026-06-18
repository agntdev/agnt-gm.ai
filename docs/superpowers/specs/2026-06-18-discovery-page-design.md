# Discovery page + "Show on Discovery" flag — Design

> Status: approved 2026-06-18. Next step: implementation plan.

## Goal

Add a third bottom-tab, **Discover**, to the teleagent mini-app: a feed of
**live** bots built on the platform — everyone's, including the viewer's own —
that the user can tap to **open the live bot in Telegram** (`t.me/<username>`).
Give each bot's owner a **"Show on Discovery"** toggle on the bot overview to opt
any of their bots out of the feed.

This is the teleagent mini-app (`src/api/client.ts` + the `src/manage/*`
surfaces), not the agnt-gm.ai web frontend. The API briefs target the web app;
we map onto the mini-app and write a backend ticket for the gap.

## Scope decisions (locked)

- **Primary action:** browse → open the live bot in Telegram. No public detail
  page, no remix/clone.
- **What's listed:** all `live`/published bots, the viewer's own included.
  No drafts or in-progress builds.
- **Default visibility:** discoverable by default (opt-out). An owner flips the
  flag to remove a bot from the feed.
- **Data source:** a new public listing endpoint, shipped behind a backend
  ticket. The frontend ships ahead, feature-detects, and shows an empty state
  until the endpoint lands. This matches the codebase pattern used for
  build-mode, pause, and analytics (`docs/backend/build-mode-ticket.md`).

## Honest shipping caveat

Unlike `paused`/`hidden`/`cloud` — which have a real localStorage fallback —
Discovery has **no client-side fallback for the listing**: you cannot enumerate
*other users'* bots locally. So until the backend endpoint exists:

- Discovery renders an empty **"Discover is coming soon"** shell. Feature-detect:
  the listing call 404/405s → empty state (not an error).
- The "Show on Discovery" toggle is **optimistic/cosmetic** — localStorage opt-out
  set + a fire-and-forget `PUT` that 404s today. It persists the owner's intent
  and lights up when the backend honors `discoverable`.

Both surfaces activate automatically when the ticket below ships; no frontend
rewiring is needed then.

## The critical data point

`MyBot.handle` is a **derivation**, not the real bot username
(`src/manage/MyBots.tsx:41`: `${slug.replace(/-/g,'_')}_bot`). The working
`t.me` link on the overview uses the **real** `bot_username` from
`getProjectBot()` (`src/api/client.ts`), not that guess.

Therefore the discover listing endpoint **must return the real `bot_username`**
per bot — a discover card cannot build a correct Telegram link from `Project`
alone. The card link is `https://t.me/<bot_username>`; a bot with no username is
omitted from the feed (it cannot be opened).

## Components

### 1. `src/manage/Discovery.tsx` (new)

- `DiscoverBot` view-model: `{ id, name, username, tone, preview, logoUrl?, stats }`.
- `DiscoveryPage` — header ("Discover" + one-line sub) and a vertical feed of
  cards, mirroring `MyBotsList` card styling (`BotTile`/logo, name, one-line
  description, optional stat chips, no chevron — tapping opens Telegram).
- Owns its own fetch / loading / empty states. Empty state uses the existing
  `EmptyAction`-style card with the `compass` icon and "Discover is coming soon"
  copy when the endpoint isn't available or returns nothing.

### 2. `src/api/client.ts`

- `Project` gains `discoverable?: boolean` and `bot_username?: string`.
- `listDiscoverBots(limit?)` → `GET /builder/projects/discover` → `ProjectList`
  (reuses the existing shape). Tolerates 404/405 → caller shows empty state.
- `setDiscoverable(idOrSlug, on)` → `PUT /builder/projects/{id}/discoverable`
  `{ discoverable: boolean }`. Fire-and-forget; caller `.catch()`es.

### 3. `src/ui.tsx`

- `Tab` type: `'build' | 'discover' | 'manage'`.
- Un-hide the TabBar item (it is already noted as hidden at `ui.tsx:261`).
  Order: Build · Discover · My Bots. Icon: `compass` (already defined in
  `TGIcon`). Label: "Discover".

### 4. `src/manage/BotOverview.tsx`

- New props `discoverable: boolean` and `onToggleDiscoverable: () => void`.
- A "Show on Discovery" row near the existing Pause / secondary actions
  (reusing the file's `Switch`), with a one-line hint ("Listed on the Discover
  page for everyone"). Owner-only surface, same as Pause/Delete.

### 5. `src/App.tsx`

- New `DISCOVER_OPTOUT_KEY` localStorage set (the bot ids the owner has opted
  out), mirroring `pausedBots`/`loadPaused`. **Not** `HIDDEN_KEY` — that tracks
  *deleted* bots, a different concept.
- Default = discoverable. Feature-detect **by polarity**:
  `discoverable === false` → hidden; `undefined`/`true` → shown. Never
  `if (!discoverable)` (which would read the absent-field default as hidden).
- Pass `discoverable={!discoverOptOut.has(bot.id) && bot.discoverable !== false}`
  and `onToggleDiscoverable` (optimistic set + `setDiscoverable` PUT) into
  `BotOverview`.

## Three-tab wiring checklist (App.tsx)

Adding a third `Tab` value breaks several two-way ternaries. Every touch point:

- `Tab` type + un-hidden TabBar item (`ui.tsx`).
- `body` render: add the `tab === 'discover'` branch → `<DiscoveryPage>`.
- `header` (≈712): currently `tab === 'manage' ? … : <build header>`. Discover
  needs its **own** header, else it renders the build (AgentBot) header.
- `backAction` (≈669): currently `tab === 'manage' ? … : onBack`. On the discover
  root `backAction` must be **`null`**, else it drives the build wizard's back
  navigation.
- `onTab` (≈819): handle `'discover'` (no manage-specific reset needed).
- `animKey` (≈793): give discover a stable key (e.g. `d-discover`).
- refresh-on-tab effect (≈552): trigger the discover fetch when
  `tab === 'discover'`.
- hash routes: read `#/discover` (≈368) and write it (≈387).

## Data flow

1. User taps **Discover** → `tab='discover'` → effect fires `listDiscoverBots()`.
2. Success → map to `DiscoverBot[]`, render the feed. 404/405/empty → empty
   "coming soon" state.
3. Tap a card → `openTgLink('https://t.me/' + username)` (same helper the
   overview uses).
4. On the overview, owner flips "Show on Discovery" → optimistic localStorage
   opt-out toggle + `setDiscoverable()` PUT (404-tolerant). The backend, once
   shipped, filters the feed by `discoverable`.

## Error handling

- Listing endpoint absent/erroring → empty state, never a crash or error banner.
- Toggle PUT failing → swallowed (optimistic), consistent with `setBotPaused`.
- Bot with no `bot_username` → omitted from the feed (uncluttered, and avoids a
  dead Telegram link).

## Backend ticket — `docs/backend/discovery-ticket.md`

Same house style as `build-mode-ticket.md`. Specs:

```
GET /api/builder/projects/discover?limit=50
  -> ProjectList of LIVE bots with discoverable !== false.
     Each project MUST include the real bot_username (for the t.me link),
     plus name, logo_url, short_description, and card stats
     (active_agents, prs_merged_7d as available).

PUT /api/builder/projects/{id}/discoverable
  Request:  { "discoverable": true | false }
  Response: { "discoverable": false }
  Owner-only (401/403 otherwise).

GET /api/builder/projects/{id}  (addition)
  Response: { ..., "discoverable": true }
```

Default `discoverable = true` for live bots. Frontend already tolerates 404/405.

## Testing

- `tsc` typecheck is the bar (consistent with the repo — no test runner wired).
- Manual: tab switches and back-nav behave correctly on all three tabs; the
  discover empty state renders when the endpoint 404s; the overview toggle flips
  optimistically and persists across reopen via localStorage.

## Out of scope

- Public per-bot detail page, remix/clone, search/filter/sort, pagination beyond
  a single `limit`, ranking/curation. The feed is a flat list for now.
