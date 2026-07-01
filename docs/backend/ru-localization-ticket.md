# Backend ticket — localize dynamic strings by the user's language

**Context.** The mini-app now ships a Russian locale. If the Telegram user's
`language_code` is `ru*` (or they pick RU in the in-app switcher), the **static
UI chrome** — nav, buttons, section labels, status pills, stat labels, empty
states — renders in Russian (frontend `src/i18n.tsx`, inline `t(en, ru)`).

**What the frontend CANNOT localize.** A large share of on-screen text is
**backend-supplied English** delivered verbatim in API responses. The mini-app
only renders these — it has no dictionary for runtime server strings. So today a
RU user sees Russian chrome wrapped around English content. To finish the job the
backend needs to localize the strings below **to the caller's language**.

## 1. How the frontend signals locale

The mini-app will send the active locale on every builder API request (pick one,
tell us which you prefer — we'll implement it):

- **`Accept-Language: ru`** header (default assumption), or
- **`?lang=ru`** query param.

The value is `en` or `ru`. Absent → treat as `en`. The user's Telegram
`language_code` is also available to you from `initData` if you'd rather derive
it server-side, but the **explicit signal must win** (the in-app switcher lets a
user override their Telegram language, e.g. choose EN inside a RU client).

## 2. Strings to localize (in priority order)

These are the runtime-supplied fields the FE renders as-is today:

1. **Build progress** (`GET /projects/{id}`, `build_progress`) — the single
   most visible surface:
   - `stage_label` — e.g. `"🔨 Building your bot — pass 2"` → RU
   - per-pass `label` — `"tests failed · fixing"`, `"merged · complete ✓"` → RU
   - `phase` / `stage` stay as-is (they're enums the FE maps to its own localized
     words — do **not** translate the enum values, only the human `*_label`s).
2. **Task failure reason** (`failure_reason`, per the failure-reason ticket) —
   owner-facing cause; localize the human sentence.
3. **Activity / system chat messages** (`chat/messages` with `role:"system"`,
   and the activity feed) — build-started, deploy, version-bump, gate lines like
   `"Tests gate could not evaluate: …"`.
4. **Cloud-agent chat** (`role:"assistant"` turns + `data.kind:"action"` labels)
   — the agent should reply in the user's language and localize action `label`s
   (`"Marked \"…\" complete"`).
5. **Card descriptions** — `short_description` / `goal_of_project` shown on
   Discovery and My Bots. Lower priority (user-authored content), but if you
   generate them, generate in the user's language.

## 3. Contract notes

- **Don't change field names or enum values** — only the human-readable text
  inside `*_label`, `failure_reason`, and message `content`. The typed client
  maps fields 1:1 and keys its own logic on the enums.
- **Fallback:** if a string isn't translated yet, return English — the FE renders
  whatever it gets. No error, no empty string.
- **Emojis / numbers / PR refs** (`#6`, `pass 2`, counts) stay as-is inside the
  localized string.
- Ship incrementally and in any order — §1 (the locale signal) + §2.1
  (`build_progress` labels) give the biggest visible win first.

## 4. Frontend side (already done / will do)

- Static chrome localized via `src/i18n.tsx` (`en`/`ru`, inline `t(en, ru)`).
- Locale detection: localStorage override → Telegram `language_code` (`ru*`) →
  browser language → `en` (`detectLang()`).
- In-app EN/RU switcher (next to the theme toggle).
- Once you confirm the locale signal in §1, we'll attach it to the API client so
  every request carries the active locale.
