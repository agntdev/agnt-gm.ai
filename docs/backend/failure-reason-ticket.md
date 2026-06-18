# Backend ticket — expose a real per-task `failure_reason`

**Problem.** When a task_manager task ends in `status:"failed"`, the mini-app has
no idea *why*. The owner sees a "Failed" task with no explanation, so the UI
falls back to a generic, hardcoded line — "The build agent used up its retry
budget … Reopen to try again." That's only sometimes true (a task can fail for a
specific reason: the last reviewer's reject, a build/test error, a missing
secret, etc.), and the owner can't tell what to fix before reopening.

We need the terminal cause carried on the task so the detail panel and the
"Needs your input" inbox can show it verbatim.

Base path: `/api/builder`, owner derived from the Telegram session JWT, `{id}` is
a project id or slug, `{slug}` is the task slug. **The frontend already
feature-detects this field and renders it when present** (falling back to the
generic copy otherwise), so it can ship in any order with no FE coordination.

## 1. Add `failure_reason` to the per-task DTO

```
GET /api/builder/projects/{id}/tasks/{slug}
Response (addition):
{
  "task": {
    ...,
    "status": "failed",
    "attempt_count": 3,
    "failure_reason": "Reviewer rejected 3x: /price handler never calls answerCallbackQuery, so the inline button spins. Last error: tests/specs.json missing the price-now case."
  }
}
```

- Type: `string`, `omitempty`. Present **only** when `status == "failed"` (empty/absent
  otherwise).
- Content: short, human-readable, **owner-facing** — what actually caused the give-up.
  Order of preference for what to put there:
  1. the **last reviewer's reject summary** (why it kept getting rejected — most actionable),
  2. else the **build/test/CI error** that blocked it,
  3. else the literal systemic cause (e.g. `"Retry budget exhausted after 3 attempts"`)
     — only when that's genuinely all we know.
- This is **distinct from `warning`** (below), which is the review-holding-go-live
  cancel escape, not a failure cause. Don't overload one onto the other.

Frontend already reads `task.failure_reason` in `src/manage/TaskDetail.tsx` (the
"Why it failed" banner) and renders it ahead of the generic fallback.

## 2. (Optional but wanted) Add it to `/blocked` items too

So the inbox can show the reason without a second per-task round-trip:

```
GET /api/builder/projects/{id}/blocked
Response (per item, addition):
{
  "items": [
    { "slug": "E2T4", "title": "...", "node_kind": "feature", "status": "failed",
      "blocked_since": "2026-06-16T08:30:00Z",
      "failure_reason": "Reviewer rejected 3x: ..." }
  ]
}
```

- Same semantics as §1 (`omitempty`, only on failed items). Lets
  `src/manage/TaskManagerInbox.tsx` replace its hardcoded "Retry budget
  exhausted — reopen to try again" line with the real reason.

## Notes

- Keep field names exactly as above; the typed client maps them 1:1
  (`TaskDetail.failure_reason` already exists in `src/api/client.ts` as an
  optimistic field; add `BlockedItem.failure_reason` for §2).
- Return 401/403 for non-owners as today. Absent field = "not shipped" → the FE
  shows the generic explanation, no error.
- Tie-in with `reopen`: `POST .../tasks/{slug}/reopen` should clear/blank
  `failure_reason` along with resetting `attempt_count`, so a reopened task
  doesn't carry a stale reason.
- Length: keep it to a sentence or two; the panel renders it inline. If the full
  log is useful, link it via the existing PR/issue URLs rather than dumping it
  into this field.
