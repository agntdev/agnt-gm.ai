import { Routes, Route, useLocation } from "react-router-dom";
import { Nav, Footer } from "./components/atoms.jsx";
import { useAuth, githubLoginUrl } from "./lib/auth.js";
import Home from "./pages/Home.jsx";
import Project from "./pages/Project.jsx";
import Agent from "./pages/Agent.jsx";
import Create from "./pages/Create.jsx";
import Milestones from "./pages/Milestones.jsx";
import Trading from "./pages/Trading.jsx";
import Token from "./pages/Token.jsx";
import Launched from "./pages/Launched.jsx";
import Auth from "./pages/Auth.jsx";
import AuthCallback from "./pages/AuthCallback.jsx";

// Mobile overrides for the heavier inline-styled grids in /propose,
// /projects/:slug and /agent/:handle. Plain inline styles can't carry
// media queries, so we stamp class hooks onto the offending containers
// and override them once here.
const RESPONSIVE_CSS = `
  /* Safety net: never let the body scroll horizontally even if some
     overlooked grid still tries to overflow. */
  html, body { max-width: 100%; overflow-x: hidden; }
  .app { max-width: 100%; }

  /* Nav (atoms.jsx Nav + WalletButton + MyAgentMenu + Sign-in button)
     was wrapping its labels onto a second line on phones because the
     viewport couldn't fit the full row. Lock buttons to nowrap, and
     hide the text labels under 640px so just the icon + short address
     stays. The text is wrapped in <span class="nav-resp-label"> in
     each clickable, so a single rule covers all of them. */
  .nav-link, .btn-myagent, .btn-signin { white-space: nowrap; }
  @media (max-width: 640px) {
    .nav-inner { gap: 8px !important; }
    .nav-links { gap: 6px !important; }
    .nav-link, .btn-myagent, .btn-signin {
      padding-left: 8px !important;
      padding-right: 8px !important;
    }
    .nav-resp-label { display: none !important; }
    /* Logo wordmark shrinks to leave room for the icon-only nav links
       and the wallet chip. The diamond stays the same so the brand
       mark still reads. */
    .logo > span:last-child { font-size: 14px !important; }
  }
  @media (max-width: 380px) {
    /* Hide the logo wordmark entirely on the smallest phones — only
       the diamond stays. */
    .logo > span:last-child { display: none !important; }
  }

  /* Two-column form sections collapse to a single column on tablet
     and below. Covers Create.jsx (AI form's 1fr+sidebar; ManualForm's
     identity + reward pool grids) and CreateStageForm's pool/mint pair. */
  @media (max-width: 880px) {
    .agnt-resp-form-grid,
    .agnt-resp-2col {
      grid-template-columns: 1fr !important;
    }
  }

  /* TasksEditor per-task meta row (weight · difficulty · tags) stacks. */
  @media (max-width: 640px) {
    .agnt-resp-task-meta {
      grid-template-columns: 1fr !important;
      gap: 8px !important;
    }
    /* Task header row keeps slug + title side-by-side but shrinks the
       slug column so the title input keeps its breathing room. */
    .agnt-resp-task-head {
      grid-template-columns: 72px minmax(0, 1fr) auto !important;
    }
  }

  /* PayoutsList — restack the fixed 4-column grid into a two-row card on
     phones so it never needs horizontal scrolling. Cells are tagged with
     grid-area names so the same DOM renders top/bottom on mobile and
     left-to-right on desktop. */
  @media (max-width: 640px) {
    .agnt-resp-payouts-row,
    .agnt-resp-payouts-head {
      grid-template-columns: minmax(0, 1fr) auto !important;
      grid-template-areas:
        "primary amount"
        "status  when" !important;
      row-gap: 6px;
      padding: 10px 14px !important;
    }
    .agnt-resp-cell-primary { grid-area: primary; min-width: 0; }
    .agnt-resp-cell-status  { grid-area: status; justify-self: start; text-align: left !important; }
    .agnt-resp-cell-amount  { grid-area: amount; }
    .agnt-resp-cell-when    { grid-area: when; }
  }

  /* My-projects table on the Agent page — horizontal scroll within
     the table card rather than the whole viewport. The !important is
     needed to defeat the inline overflow:hidden that the card uses
     to clip border-radius corners on desktop. */
  @media (max-width: 640px) {
    .agnt-resp-h-scroll {
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch;
    }
    .agnt-resp-h-scroll-inner {
      min-width: 560px;
    }
  }

  /* AutoMergeToggle: pill switch drops below the description copy. */
  @media (max-width: 520px) {
    .agnt-resp-auto-toggle {
      flex-direction: column !important;
      align-items: flex-start !important;
    }
  }

  /* Stage card head — TON price label drops below the title row on tiny
     viewports, keeping the round number badge and the status pill on
     line 1. */
  @media (max-width: 520px) {
    .agnt-resp-stage-head {
      align-items: flex-start !important;
    }
    .agnt-resp-stage-head > :last-child {
      text-align: left !important;
      width: 100%;
    }
  }

  /* FundPoolBanner + StageFundCTA — the "Pay X TON" button drops below
     the copy on phones, full-width. */
  @media (max-width: 520px) {
    .agnt-resp-banner > :last-child {
      width: 100%;
    }
    .agnt-resp-banner > :last-child button {
      width: 100%;
      justify-content: center;
    }
  }

  /* AGENT page wallet bind card — title + button stack vertically. */
  @media (max-width: 520px) {
    .agnt-resp-wallet-row {
      flex-direction: column !important;
      align-items: stretch !important;
    }
    .agnt-resp-wallet-row > button {
      width: 100%;
      justify-content: center;
    }
  }

  /* ─────────── Global mobile spacing pass ───────────
     Goal: more breathing room around blocks AND inside them, plus
     less wasted vertical gap. Same visual language, just less crowded.

     Owner feedback: CSS-default 28px container padding felt too tight
     on phones — blocks "in your face" against the screen edge with
     text also touching card borders. We bump the container slightly
     (28 → 32px) and pad card interiors more so content has visible
     margin both from the screen and from each card edge. */
  @media (max-width: 640px) {
    .container { padding-left: 32px !important; padding-right: 32px !important; }
  }
  @media (max-width: 380px) {
    /* Tiny phones (iPhone SE class): drop back to the CSS default 28px
       so cards keep enough internal content width. */
    .container { padding-left: 28px !important; padding-right: 28px !important; }
  }
  /* Nav is chrome, not content — keep it tight regardless of the
     container bump above. */
  @media (max-width: 640px) {
    .nav .container { padding-left: 14px !important; padding-right: 14px !important; }
  }

  /* Card interiors get more horizontal breathing on phones so text
     no longer kisses the card border. */
  @media (max-width: 640px) {
    .project-body  { padding: 14px 18px !important; }
    .claim-card    { padding: 14px 18px !important; }
  }

  /* Section blocks: 28px top/bottom → 18px. The dashed underline still
     reads, but the page stops feeling padded-out. */
  @media (max-width: 640px) {
    .section { padding: 18px 0 !important; }
  }

  /* Intro hero: tighten the margins under the headline and the
     paragraph so the CTAs land sooner on a phone viewport. */
  @media (max-width: 640px) {
    .intro-h { margin: 0 0 10px !important; }
    .intro-sub { margin: 0 0 14px !important; font-size: 14px !important; }
    .intro-foot { padding-top: 14px !important; }
    .intro-stats .is-v { font-size: 18px !important; }
    .intro-stats .is-l { font-size: 9.5px !important; }
  }

  /* Section heads on phones: stack title and the tab-row, kill the
     wide flexbox gap so tabs don't dangle on a second indented line. */
  @media (max-width: 640px) {
    .section-head { flex-direction: column !important; align-items: stretch !important; gap: 10px !important; }
    .section-head .tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; flex-wrap: nowrap !important; }
  }

  /* Project cards on the Pulse grid: the 120px preview frame eats half
     the card on a stacked phone view. Halve it. The body padding
     stays at the desktop 14px 16px — squeezing it made text feel
     glued to the card edge. */
  @media (max-width: 640px) {
    .project-preview { height: 88px !important; }
    .project-stats-row { gap: 10px !important; }
  }

  /* Project page hero on mobile: smaller h1 + tighter avatar gap so the
     name doesn't squeeze the live-site card off-screen. Card interior
     padding stays generous. */
  @media (max-width: 640px) {
    .proj-h1 { font-size: 24px !important; }
    .proj-title-row { gap: 12px !important; }
    .proj-title-row > :first-child { width: 48px !important; height: 48px !important; }
    .proj-pitch { font-size: 13px !important; }
  }

  /* Project tabs: scroll horizontally instead of wrapping (mono labels
     in two rows look broken). Bottom underline still reads. */
  @media (max-width: 640px) {
    .tabs-underline {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      flex-wrap: nowrap !important;
      scrollbar-width: none;
    }
    .tabs-underline::-webkit-scrollbar { display: none; }
  }

  /* Footer: stack the "Built on TON" and the GitHub link so neither
     gets cut off on the smallest phones. */
  @media (max-width: 380px) {
    .footer .container { flex-direction: column !important; gap: 10px !important; }
  }

  /* ─────────── Generic responsive grid hooks ───────────
     Plain inline-style grids can't carry media queries, so we tag the
     worst offenders with these class names and override here. */

  /* 4-up stat / preset grids → 2 columns ≤640px, 1 column ≤380px. */
  @media (max-width: 640px) {
    .agnt-resp-grid-4 { grid-template-columns: 1fr 1fr !important; }
    /* Internal cell borders that used borderRight on all-but-last look
       weird on a 2-column reflow — drop the right border on every cell
       and let the row-gap handle separation visually. */
    .agnt-resp-grid-4 > * { border-right: none !important; border-bottom: 1px solid var(--border) !important; }
    .agnt-resp-grid-4 > *:last-child { border-bottom: none !important; }
  }
  @media (max-width: 380px) {
    .agnt-resp-grid-4 { grid-template-columns: 1fr !important; }
  }

  /* 2-up grids that aren't tagged with the form-grid class (e.g. token
     "agents trading" cards) → 1 column ≤520px. */
  @media (max-width: 520px) {
    .agnt-resp-grid-2 { grid-template-columns: 1fr !important; }
  }

  /* 4-pill preset rows (deadline 1 day / 3 days / …) — keep all four
     buttons on row 1 on phones but let them wrap on really narrow
     viewports so the text doesn't get clipped. */
  @media (max-width: 380px) {
    .agnt-resp-preset-4 { grid-template-columns: 1fr 1fr !important; }
  }

  /* Review-panel key-value rows ("180px 1fr") flatten on phones so the
     value text isn't squeezed into ~150px of remaining width. Label
     drops above the value, in small caps. */
  @media (max-width: 640px) {
    .agnt-resp-kv-row {
      grid-template-columns: 1fr !important;
      row-gap: 2px;
    }
    .agnt-resp-kv-row > :first-child { font-size: 9.5px !important; }
    .agnt-resp-kv-row > :last-child {
      word-break: break-word;
      overflow-wrap: anywhere;
    }
  }

  /* Agent profile stat tiles — 5 tiles in a flex row with minWidth:120
     forced them onto two awkward rows on phones (3+2 with the last
     wrapping). Shrink the minWidth so we get a cleaner 2×… layout, and
     drop the inner padding a touch so the numbers still fit. */
  @media (max-width: 640px) {
    .agnt-resp-stat-tile {
      min-width: 0 !important;
      flex-basis: calc(50% - 6px) !important;
      padding: 12px 14px !important;
    }
  }

  /* Project page "Contribute" share cards — minWidth:300 was forcing
     horizontal overflow on phones < 360px. Let the cards shrink to
     fit the container instead. */
  @media (max-width: 640px) {
    .agnt-resp-share-card { min-width: 0 !important; flex-basis: 100% !important; }
  }

  /* EditTasksPanel collapsed header — minWidth:240 + button forced
     the button onto a second indented line on narrow phones. Let the
     copy block shrink and the button drop full-width below it. */
  @media (max-width: 520px) {
    .agnt-resp-edit-tasks-head { min-width: 0 !important; flex-basis: 100% !important; }
    .agnt-resp-edit-tasks-head + button { width: 100%; justify-content: center; }
  }

  /* Token page detail-grid — already CSS-driven, but the tokenomics row
     above still needs the .agnt-resp-grid-4 override (handled). The
     "agents trading" card row gets .agnt-resp-grid-2 (handled). */

  /* Trading page market-strip — gap:28 between metric items is too wide
     on phones, leaves single items dangling. Reduce gap so all metrics
     stay legible without overflow. */
  @media (max-width: 640px) {
    .market-strip { gap: 14px !important; padding: 10px 14px !important; }
    .market-strip .ms-value { font-size: 12.5px !important; }
    .market-strip .ms-divider { display: none !important; }
  }

  /* Launched table — already wraps in a card; the table itself can
     scroll horizontally on phones since the 9-column DOM doesn't reflow
     well into a card. */
  @media (max-width: 640px) {
    .launched-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  }

  /* WeeklyBars 12-column grid: bars stay legible at 12 cols on a 320px
     viewport (≈22px per bar incl. gap), but on iPhone SE the gap eats
     too much. Drop gap to 2px on very narrow viewports. */
  @media (max-width: 380px) {
    .agnt-resp-weekly-bars { gap: 2px !important; }
  }

  /* Milestones (project Tasks tab) stats grid — 5-col fixed layout
     (Total / Open / In flight / Merged …) at minmax(82px,1fr) totals
     ~410px, which overflows phones. Drop to 2 cols on phones, 4 cols
     on very narrow tablet widths. Also: align values to bottom so
     wrapped labels ("In flight") line up with single-line ones. */
  @media (max-width: 700px) {
    .ms-hero-stats { grid-template-columns: 1fr 1fr !important; }
    .ms-stat {
      border-right: none !important;
      border-bottom: 1px solid var(--border);
      display: flex !important;
      flex-direction: column;
      justify-content: flex-end;
      min-height: 72px;
    }
    .ms-stat:nth-last-child(-n+2) { border-bottom: none; }
  }

  /* Milestones tasks table — 80px / 1fr / 160px / 140px / 90px grid is
     ~470px minimum and overflows on phones. Horizontal scroll was
     confusing (first paint hid hash/title behind the right columns),
     so on phones the row reflows into a self-contained 2-row card
     (hash + title + status on top, claim + reward below) and the
     head row hides — card titles are self-explanatory. */
  @media (max-width: 640px) {
    .ms-task-head { display: none !important; }
    .ms-task-row {
      grid-template-columns: auto minmax(0, 1fr) auto !important;
      grid-template-areas:
        "hash title status"
        "claim reward reward" !important;
      column-gap: 10px !important;
      row-gap: 8px !important;
      padding: 12px 14px !important;
    }
    .ms-task-hash   { grid-area: hash;   align-self: start; padding-top: 2px; }
    .ms-task-title  { grid-area: title;  min-width: 0; }
    .ms-task-status { grid-area: status; align-self: start; }
    .ms-task-claim  { grid-area: claim; }
    .ms-task-reward { grid-area: reward; text-align: right; align-items: flex-end; }
  }

  /* Create form — .field-row (1fr 1fr) puts the reward-pool input
     next to the 4-pill deadline grid. On phones that right column
     can't fit "1 day / 3 days / 7 days / 14 days" labels and pushes
     the form wider than the viewport. Collapse to single column. */
  @media (max-width: 640px) {
    .field-row { grid-template-columns: 1fr !important; }
    /* Reduce inner padding so the form-card content area stays usable
       at narrow widths (default 24px 28px → cuts ~56px from row width). */
    .create-form-card { padding: 18px 16px !important; }
  }
`;

export default function App() {
  const { pathname } = useLocation();
  const auth = useAuth();
  // Auth pages own the full viewport (no Nav, no Footer chrome).
  const isAuthRoute = pathname === "/auth" || pathname === "/auth/callback";

  return (
    <div className="app">
      <style>{RESPONSIVE_CSS}</style>
      {!isAuthRoute && (
        <Nav
          authed={auth.authed}
          agent={auth.agent}
          onSignIn={() => { window.location.href = githubLoginUrl(); }}
          onSignOut={auth.signOut}
        />
      )}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/projects/:slug" element={<Project />} />
        <Route path="/projects/:slug/milestones" element={<Milestones />} />
        <Route path="/projects/:slug/trading" element={<Trading />} />
        <Route path="/projects/:slug/token" element={<Token />} />
        <Route path="/projects/:slug/launched" element={<Launched />} />
        <Route path="/agent/:handle" element={<Agent />} />
        <Route path="/propose" element={<Create />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<Home />} />
      </Routes>

      {!isAuthRoute && <Footer />}
    </div>
  );
}
