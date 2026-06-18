# Discovery Page + Show-on-Discovery Flag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third bottom-tab "Discover" that lists live bots (everyone's, including the viewer's) and opens them in Telegram, plus an owner opt-out toggle ("Show on Discovery") on the bot overview.

**Architecture:** Ship the frontend ahead of the backend, matching the repo's established pattern (build-mode, pause, analytics): typed client functions that tolerate 404/405, an empty "coming soon" state until the listing endpoint exists, and an optimistic localStorage opt-out for the flag. A backend ticket specs the two endpoints.

**Tech Stack:** React 18 + TypeScript, Vite. No test runner is wired — `npm run lint` (`tsc -b`) is the verification gate, plus manual behavior checks in the running mini-app. Do **not** add a test framework; it would violate the repo's conventions and YAGNI.

## Global Constraints

- Verification gate per task: `npm run lint` must pass (it runs `tsc -b`). There are no unit tests.
- Feature-detect by **polarity**: `discoverable === false` → hidden; `undefined`/`true` → shown. Never `if (!discoverable)`.
- The opt-out localStorage key is **new** (`agentbot-discover-optout`). Do **not** reuse `HIDDEN_KEY` (`agentbot-hidden`) — that tracks *deleted* bots.
- All API field names map 1:1 to the typed client. Keep them exact: `bot_username`, `discoverable`.
- A discover card's Telegram link is `https://t.me/<bot_username>` using the **real** `bot_username` from the endpoint — never the derived `MyBot.handle` (which is a guess: `${slug}_bot`).
- Tab order: Build · Discover · My Bots.
- Match surrounding code style: inline-style objects, `T` theme tokens, `btnReset`, `TGIcon`, no new dependencies.

---

### Task 1: API client — types + discover/discoverable functions

**Files:**
- Modify: `src/api/client.ts` (the `Project` interface ~64-100; add functions near `listProjectsByAgent` ~248 and `setBotPaused` ~549)

**Interfaces:**
- Consumes: existing `request<T>(method, path, body?)`, `ProjectList`.
- Produces:
  - `Project.discoverable?: boolean`, `Project.bot_username?: string`
  - `listDiscoverBots(limit?: number): Promise<ProjectList>`
  - `setDiscoverable(idOrSlug: string, on: boolean): Promise<unknown>`

- [ ] **Step 1: Add the two fields to `Project`**

In `src/api/client.ts`, inside the `Project` interface (after `live_url?: string;` ~line 80), add:

```ts
  bot_username?: string;   // the real managed-bot @username (for t.me links on Discovery)
  discoverable?: boolean;  // listed on the Discover page; absent/true = shown, false = opted out
```

- [ ] **Step 2: Add `listDiscoverBots`**

Immediately after the `listProjectsByAgent` function (~line 250), add:

```ts
// ── Discovery: public feed of live bots (gap — backend ticket pending) ──
// Lists LIVE, discoverable bots (everyone's). The UI feature-detects: a
// 404/405 (endpoint not shipped) surfaces as an empty "coming soon" state.
export function listDiscoverBots(limit = 50): Promise<ProjectList> {
  return request('GET', `/builder/projects/discover?limit=${limit}`);
}
```

- [ ] **Step 3: Add `setDiscoverable`**

Immediately after the `setBotPaused` function (~line 551), add:

```ts
// opt a bot in/out of the Discover feed — optimistic (real PUT when the API ships)
export function setDiscoverable(idOrSlug: string, on: boolean): Promise<unknown> {
  return request('PUT', `/builder/projects/${encodeURIComponent(idOrSlug)}/discoverable`, { discoverable: on });
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run lint`
Expected: PASS (no errors). The new exports are unused for now — that's fine; `tsc` does not flag unused exports.

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts
git commit -m "Discovery: client fns (listDiscoverBots, setDiscoverable) + Project fields"
```

---

### Task 2: Discovery page component

**Files:**
- Create: `src/manage/Discovery.tsx`

**Interfaces:**
- Consumes: `Project`, `ProjectList`, `listDiscoverBots` (Task 1); `openTgLink` from `../telegram`; `Theme`, `btnReset`, `toneFor` from `../theme`; `TGIcon`, `BotTile` from `../ui`.
- Produces:
  - `interface DiscoverBot { id: string; name: string; username: string; tone: string; preview: string }`
  - `discoverBotFromProject(p: Project): DiscoverBot | null` (null when no `bot_username` — un-openable, omitted)
  - `DiscoveryPage({ T, bots, loading })` — presentational; fetch lives in `App.tsx` (Task 3), mirroring how `MyBotsList` receives `bots`/`loading`.

- [ ] **Step 1: Create the file**

Create `src/manage/Discovery.tsx` with:

```tsx
// Discovery — third tab: a feed of LIVE bots built on the platform (everyone's,
// including the viewer's). Tapping a card opens the live bot in Telegram. The
// listing is server-side (GET /builder/projects/discover); until that endpoint
// ships the feed is empty and we show a "coming soon" card. There is no
// client-side fallback — other users' bots can't be enumerated locally.
import { Theme, btnReset, toneFor } from '../theme';
import { Project } from '../api/client';
import { openTgLink } from '../telegram';
import { TGIcon, BotTile } from '../ui';

export interface DiscoverBot {
  id: string;
  name: string;
  username: string; // real managed-bot @username — drives the t.me link
  tone: string;
  preview: string;
}

// A bot with no username can't be opened — omit it from the feed.
export function discoverBotFromProject(p: Project): DiscoverBot | null {
  if (!p.bot_username) return null;
  return {
    id: p.id,
    name: p.name,
    username: p.bot_username,
    tone: toneFor(p.slug),
    preview: p.short_description || p.goal_of_project || 'A bot built on AgentBot.',
  };
}

export function DiscoveryPage({ T, bots, loading }: {
  T: Theme; bots: DiscoverBot[]; loading: boolean;
}) {
  return (
    <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ fontFamily: T.font, fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: -0.3, padding: '2px 2px 0' }}>
        Discover
      </div>
      <div style={{ fontFamily: T.font, fontSize: 14, color: T.sub, lineHeight: '20px', padding: '5px 2px 0' }}>
        {loading ? 'Loading bots…' : bots.length ? 'Live bots built on AgentBot. Tap one to try it in Telegram.' : ''}
      </div>

      {!loading && bots.length === 0 && (
        <div style={{
          marginTop: 18, display: 'flex', alignItems: 'center', gap: 13, padding: 16, textAlign: 'left',
          borderRadius: T.cardRadius, background: T.cardBg, border: `0.5px solid ${T.sep}`, boxShadow: T.shadow,
        }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TGIcon name="compass" size={20} color={T.accent} stroke={1.9} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 600, color: T.text }}>Discover is coming soon</div>
            <div style={{ fontFamily: T.font, fontSize: 13, color: T.hint, marginTop: 1 }}>Bots others build will show up here</div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bots.map(bot => (
          <button key={bot.id} onClick={() => openTgLink(`https://t.me/${bot.username}`)} style={{
            ...btnReset, textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', gap: 13,
            padding: 13, borderRadius: T.cardRadius, background: T.cardBg,
            border: `0.5px solid ${T.sep}`, boxShadow: T.shadow,
          }}>
            <BotTile T={T} name={bot.name} tone={bot.tone} size={46} radius={14} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>{bot.name}</div>
              <div style={{
                fontFamily: T.font, fontSize: 13, color: T.sub, lineHeight: '17px', marginTop: 3,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
              }}>{bot.preview}</div>
            </div>
            <TGIcon name="open" size={18} color={T.accent} stroke={2} />
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: PASS. (Component is unused until Task 3 — `tsc` won't flag it.)

- [ ] **Step 3: Commit**

```bash
git add src/manage/Discovery.tsx
git commit -m "Discovery: DiscoveryPage component + DiscoverBot view-model"
```

---

### Task 3: Wire the third tab (ui.tsx + App.tsx)

**Files:**
- Modify: `src/ui.tsx` (`Tab` type ~256, `TabBar` items ~259-263)
- Modify: `src/App.tsx` (import; discover state + fetch; body; header ~712; backAction ~669; animKey ~793; route read ~368-385 and write ~387-394; refresh effect ~552)

**Interfaces:**
- Consumes: `DiscoveryPage`, `DiscoverBot`, `discoverBotFromProject` (Task 2); `listDiscoverBots` (Task 1).
- Produces: a working Discover tab. The opt-out localStorage state for the flag is added in Task 4.

- [ ] **Step 1: Extend the `Tab` type and un-hide the TabBar item**

In `src/ui.tsx`, change line 256:

```ts
export type Tab = 'build' | 'discover' | 'manage';
```

And replace the `items` array (lines 259-263) — un-hide Discover, order Build · Discover · My Bots:

```ts
  const items: { id: Tab; icon: string; label: string }[] = [
    { id: 'build', icon: 'bolt', label: 'Build' },
    { id: 'discover', icon: 'compass', label: 'Discover' },
    { id: 'manage', icon: 'chat', label: 'My Bots' },
  ];
```

- [ ] **Step 2: Import the Discovery page in App.tsx**

In `src/App.tsx`, after the `MyBotsList` import (line 27) add:

```ts
import { DiscoveryPage, DiscoverBot, discoverBotFromProject } from './manage/Discovery';
```

And add `listDiscoverBots` to the existing `./api/client` import block (around lines 13-20), e.g. append it to the import list:

```ts
  listDiscoverBots,
```

- [ ] **Step 3: Add discover state + fetch**

In `App.tsx`, near the other "My Bots tab" state (after line 206, `const [draft, setDraft] = useState('');`), add:

```ts
  // Discover tab — server-side feed of live bots (everyone's). Empty until the
  // listing endpoint ships (no client-side fallback — can't list others locally).
  const [discoverBots, setDiscoverBots] = useState<DiscoverBot[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
```

Then add a fetch function near `refreshMyBots` (after it ends ~line 550):

```ts
  // load the public discover feed; tolerate a missing endpoint (empty state)
  const refreshDiscover = async () => {
    setDiscoverLoading(true);
    try {
      const list = await listDiscoverBots();
      setDiscoverBots((list.projects || []).map(discoverBotFromProject).filter((b): b is DiscoverBot => b !== null));
    } catch { setDiscoverBots([]); } // 404/405/429 → empty "coming soon"
    setDiscoverLoading(false);
  };
```

- [ ] **Step 4: Fetch when the discover tab opens**

Replace the refresh-on-tab effect (lines 552-555):

```ts
  useEffect(() => {
    if (tab === 'manage') void refreshMyBots();
    if (tab === 'discover') void refreshDiscover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, tgAuthed]);
```

- [ ] **Step 5: Render the discover body**

In `App.tsx`, the `body` is `tab === 'manage' ? (…) : screen`. Change the tail so discover renders its page (find the `: screen;` that closes the `body` const ~line 775):

```ts
    : tab === 'discover'
      ? <DiscoveryPage T={T} bots={discoverBots} loading={discoverLoading} />
    : screen;
```

- [ ] **Step 6: Give discover its own header**

Replace the `header` const (lines 712-719). Add a discover branch so it does **not** fall through to the build header:

```tsx
  const header = insideTelegram ? null : (tab === 'manage'
    ? (activeBot
      ? <TGHeader T={T}
          title={manageView === 'activity' ? 'Activity' : manageView === 'connect' ? 'Connect agent' : manageView === 'board' || manageView === 'taskboard' ? 'Build board' : manageView === 'inbox' ? 'Needs you' : activeBot.name}
          subtitle={manageView === 'overview' || manageView === 'chat' ? '@' + activeBot.handle + ' · ' + activeBot.version : '@' + activeBot.handle}
          onBack={closeChat} />
      : <TGHeader T={T} title="My Bots" subtitle="Deployed on AgentBot" />)
    : tab === 'discover'
    ? <TGHeader T={T} title="Discover" subtitle="Bots built on AgentBot" />
    : <TGHeader T={T} title="AgentBot" subtitle={STAGE_SUB[id]} onBack={onBack} />);
```

- [ ] **Step 7: Null out backAction on the discover tab**

Replace the `backAction` line (669):

```ts
  const backAction: (() => void) | null =
    tab === 'discover' ? null : tab === 'manage' ? (activeBot ? closeChat : null) : onBack;
```

- [ ] **Step 8: Give discover a stable animKey**

Replace line 793:

```ts
  const animKey = tab === 'manage' ? `m-${manageBot || 'list'}-${manageView}` : tab === 'discover' ? 'd-discover' : `b-${step}`;
```

- [ ] **Step 9: Hash route — read `#/discover`**

In the restore effect (lines 371-383), add a `discover` branch. After the `if (parts[0] === 'bots') { … }` block and before `else if (parts[0] === 'build' …)`, insert:

```ts
    } else if (parts[0] === 'discover') {
      setTab('discover');
      routeReady.current = true;
```

(So the chain reads: `if bots {…} else if discover {…} else if build {…} else {…}`. Adjust the `} else if` joins so it stays one chain.)

- [ ] **Step 10: Hash route — write `#/discover`**

Replace the route-write effect body (lines 388-393) so discover writes its own hash:

```ts
    const sub = manageView === 'chat' ? '/chat' : manageView === 'activity' ? '/activity' : manageView === 'connect' ? '/connect' : manageView === 'taskboard' ? '/taskboard' : manageView === 'inbox' ? '/inbox' : manageView === 'board' ? '/board' : '';
    const h = tab === 'manage'
      ? (manageBot ? `#/bots/${manageBot}${sub}` : '#/bots')
      : tab === 'discover' ? '#/discover'
      : project ? `#/build/${project.id}` : '#/';
    history.replaceState(null, '', h);
```

- [ ] **Step 11: Typecheck**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 12: Manual behavior check**

Run: `npm run dev`, open the app. Verify:
- Three tabs show: Build · Discover · My Bots.
- Tapping Discover shows the "Discover is coming soon" card (the endpoint 404s in dev) and the header reads "Discover" (no build-wizard header).
- On Discover, the browser back-button / header has no back arrow driving the build wizard.
- Switching Build ↔ Discover ↔ My Bots works; the URL hash becomes `#/discover` on the Discover tab; reloading on `#/discover` reopens that tab.

- [ ] **Step 13: Commit**

```bash
git add src/ui.tsx src/App.tsx
git commit -m "Discovery: wire the third tab (TabBar, body, header, back-nav, routes, fetch)"
```

---

### Task 4: Show-on-Discovery toggle (BotOverview + App)

**Files:**
- Modify: `src/manage/BotOverview.tsx` (props ~108-115; a toggle row after the secondary actions ~420; reuses the file-local `Switch` ~846)
- Modify: `src/App.tsx` (opt-out localStorage state + `toggleDiscoverable`; pass the two new props into `<BotOverview>` ~751-767)

**Interfaces:**
- Consumes: `setDiscoverable` (Task 1); the file-local `Switch` component.
- Produces: `BotOverview` props `discoverable: boolean` and `onToggleDiscoverable: () => void`.

- [ ] **Step 1: Add the two props to BotOverview's signature**

In `src/manage/BotOverview.tsx`, extend the destructure (line 108) and the prop types (line 114). Add `onToggleDiscoverable` to the destructure list and these to the type block:

```ts
  cloudDeployed: boolean; paused: boolean; onTogglePause: () => void;
  discoverable: boolean; onToggleDiscoverable: () => void;
```

(Add `discoverable, onToggleDiscoverable` to the destructured params on line 108 as well.)

- [ ] **Step 2: Render the toggle row**

In `BotOverview`, immediately after the secondary-actions `</div>` (the block ending ~line 420, the one containing Test bot / Pause / Code), insert a labeled toggle row:

```tsx
      {/* Show on Discovery — owner opt-out of the public Discover feed */}
      <Card T={T} pad={14} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: T.text }}>Show on Discovery</div>
          <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, marginTop: 2, lineHeight: '17px' }}>
            Listed on the Discover page for everyone to find
          </div>
        </div>
        <Switch T={T} on={discoverable} onClick={onToggleDiscoverable} />
      </Card>
```

(`Card` and `Switch` are already in scope in this file.)

- [ ] **Step 3: Add opt-out state + toggle in App.tsx**

In `src/App.tsx`, near `loadPaused`/`PAUSED_KEY` (after line 67), add:

```ts
const DISCOVER_OPTOUT_KEY = 'agentbot-discover-optout'; // bots the owner hid from Discovery (until the API carries `discoverable`)
function loadDiscoverOptOut(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DISCOVER_OPTOUT_KEY) || '[]') as string[]); }
  catch { return new Set(); }
}
```

Add `setDiscoverable` to the `./api/client` import block (alongside `listDiscoverBots` from Task 3).

Add state near `pausedBots` (after line 203):

```ts
  const [discoverOptOut, setDiscoverOptOut] = useState<Set<string>>(loadDiscoverOptOut);
```

Add the toggle handler near `togglePause` (after it ends ~line 598):

```ts
  // show/hide a bot on Discovery — optimistic (real PUT when the API ships)
  const toggleDiscoverable = (botId: string) => {
    setDiscoverOptOut(prev => {
      const next = new Set(prev);
      const willHide = !next.has(botId); // currently shown → hide it
      if (willHide) next.add(botId); else next.delete(botId);
      localStorage.setItem(DISCOVER_OPTOUT_KEY, JSON.stringify([...next]));
      setDiscoverable(botId, !willHide).catch(() => { /* endpoint not shipped yet */ });
      return next;
    });
  };
```

- [ ] **Step 4: Pass the props into `<BotOverview>`**

In the `<BotOverview … />` JSX (~751-767), add (next to `paused`/`onTogglePause`):

```tsx
            discoverable={!discoverOptOut.has(activeBot.id)}
            onToggleDiscoverable={() => toggleDiscoverable(activeBot.id)}
```

- [ ] **Step 5: Typecheck**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Manual behavior check**

Run: `npm run dev`. Open My Bots → a live bot → overview. Verify:
- A "Show on Discovery" row with a toggle appears, on by default.
- Tapping the toggle flips it; reopening the bot keeps the flipped state (localStorage persists). The PUT 404s silently in dev — no error surfaces.

- [ ] **Step 7: Commit**

```bash
git add src/manage/BotOverview.tsx src/App.tsx
git commit -m "Discovery: Show-on-Discovery toggle on the bot overview (optimistic opt-out)"
```

---

### Task 5: Backend ticket

**Files:**
- Create: `docs/backend/discovery-ticket.md`

**Interfaces:** none (documentation). Mirrors the house style of `docs/backend/build-mode-ticket.md`.

- [ ] **Step 1: Write the ticket**

Create `docs/backend/discovery-ticket.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/backend/discovery-ticket.md
git commit -m "Discovery: backend ticket (discover listing + discoverable flag)"
```

---

## Self-Review

**Spec coverage:**
- Third "Discover" tab, order Build·Discover·My Bots → Task 3 (ui.tsx + App.tsx). ✓
- Feed of live bots, open in Telegram → Task 2 (`DiscoveryPage`, t.me link) + Task 3 (fetch). ✓
- Real `bot_username` requirement → Task 2 (`discoverBotFromProject` omits when missing) + Task 5 (ticket mandates it). ✓
- Empty "coming soon" state → Task 2 (empty branch) + Task 3 (catch → empty). ✓
- Show-on-Discovery toggle on overview → Task 4. ✓
- Optimistic opt-out, new key, polarity feature-detect → Task 4 (`DISCOVER_OPTOUT_KEY`, default-on) + Task 1 (`discoverable` field doc). ✓
- Three-tab wiring bug traps (backAction null, own header) → Task 3 Steps 6-7. ✓
- Backend ticket → Task 5. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step has concrete code. ✓

**Type consistency:** `DiscoverBot` shape, `discoverBotFromProject` return (`DiscoverBot | null`), `listDiscoverBots(): Promise<ProjectList>`, `setDiscoverable(id, on)`, and the `BotOverview` props (`discoverable`/`onToggleDiscoverable`) are used identically across Tasks 1-4. ✓

**Note on line numbers:** all line references are from the 2026-06-18 state of the files; if they've drifted, locate by the quoted surrounding code, not the number.
