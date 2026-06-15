# DAG Board — design (task_manager flow)

Status: approved 2026-06-15. Scope: **one screen end-to-end** (the brief's screen (b), primary).

## Goal
A read-only, per-bot "Build board" that renders the living task DAG from `GET /dag`,
adapted to the Telegram mini-app's narrow viewport. Replaces nothing — it's a new
full-screen view next to the bot's overview.

## Hard constraints (from the brief)
- Render off **raw `DagTask`** from `getProjectDag` — NOT `fetchProjectTasks` (it maps
  `task_kind`→pill, which the brief says is meaningless).
- Ready vs Backlog **strictly from `claimable`** — never recomputed from `depends_on`.
- Branch on **`node_kind`** (5: scaffold/feature/epic/question/review), never `task_kind`.
- Cover all **7 statuses**: open, in_progress, in_review, blocked, done, cancelled, failed.
  `failed` still blocks go-live; a failed `review` node = red "holding go-live".
- `depends_on` is leaves-only (never to/from epics) — shown as "depends on N", not used to
  derive epic→child nesting.
- Read-only. Mutations (answer/cancel/reopen/feedback) belong to the inbox/detail screens.

## Where it lives / wiring
- New `manageView = 'board'`, route `#/bots/<id>/board`.
- Entry: a "Board →" link in `BotOverview`'s Tasks section header.
- `App.tsx`: extend the `manageView` union, hash parse/write, header title, body render branch,
  and pass `onOpenBoard` to `BotOverview`.

## Data layer (additive only — `fetchProjectTasks`/`BotOverview` untouched)
- `client.ts`: new `ClaimerBrief`; extend `DagTask` (`node_kind?`, `assignee_agent_id?`,
  `claimers?: ClaimerBrief[]`); extend `TaskDetail` (`parent_id?`, `node_kind?`,
  `assignee_type?`, `skill_refs?`, `spec_body?`, `blocked_since?`).

## Grouping — epic-grouped collapsible sections
- `node_kind:'epic'` rows are muted, never-claimable collapsible headers showing child progress.
- Children resolve via per-task `parent_id` (gap #3): fetch each task's detail once; that fetch
  also carries `body_md`, reused for tap-to-expand (cache by slug). Map epic `id`→slug to resolve
  `parent_id`. Tasks with no resolvable parent → "General" section (also the graceful fallback if
  the API omits `id`/`parent_id` → everything degrades to a flat list).
- No epics present → flat status-ordered list, no group headers.
- A top status summary bar (Ready · Building · In Review · Needs input · Done, + Failed/Cancelled
  toggle) keeps status scannable and acts as a filter.

## States
- `tasks:[]` → "Decomposing…". All-`node_kind`-absent → legacy phase project → flat status list +
  one-line note. Failed review present → red "holding go-live" banner.
- Poll `/dag` ~4s while active (any in_progress/in_review, or decomposing, or empty), ~10s idle.
  `/dag` is public — works pre-auth.

## Out of scope
Mutations, dependency-graph overlay (brief says optional), the other 3 screens, backend tickets.
