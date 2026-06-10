import { useEffect, useRef } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { Nav, Footer } from "./components/atoms.jsx";
import BottomTabBar from "./components/BottomTabBar.jsx";
import { useAuth, githubLoginUrl } from "./lib/auth.js";
import {
  isTMA,
  backButton,
  viewport,
  miniApp,
  useSignal,
} from "@tma.js/sdk-react";
import Home from "./pages/Home.jsx";
import Project from "./pages/Project.jsx";
import Agent from "./pages/Agent.jsx";
import Create from "./pages/Create.jsx";
import Milestones from "./pages/Milestones.jsx";
import Trading from "./pages/Trading.jsx";
import Token from "./pages/Token.jsx";
import Launched from "./pages/Launched.jsx";
import Notifications from "./pages/Notifications.jsx";
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

  /* ── Bottom tab bar ──
     Sticky 4-tab bar at the bottom of phones and the TMA. Hidden on
     desktop ≥640px (the top Nav still owns navigation there). The
     4th tab "+ Propose" is the primary CTA — visually a FAB-style
     raised button with an accent color. The bar itself respects the
     Telegram safe-area-inset-bottom + iOS home indicator. */
  .bottom-tabbar {
    display: none;
  }
  @media (max-width: 640px) {
    .bottom-tabbar {
      display: block;
      position: fixed;
      left: 0; right: 0; bottom: 0;
      z-index: 60;
      background: var(--bg);
      border-top: 1px solid var(--border);
      padding-bottom: var(--sab, 0px);
    }
    /* Make room at the end of the scrollable area so the last row
       of a long project list never sits under the bar. 56px bar +
       safe area. */
    .app { padding-bottom: calc(56px + var(--sab, 0px)); }
  }
  [data-tg] .bottom-tabbar {
    display: block;
    position: fixed;
    left: 0; right: 0; bottom: 0;
    z-index: 60;
    background: var(--bg);
    border-top: 1px solid var(--border);
    padding-bottom: var(--sab, 0px);
  }
  [data-tg] .app { padding-bottom: calc(56px + var(--sab, 0px)); }

  .bottom-tabbar-inner {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    align-items: center;
    height: 56px;
    max-width: 640px;
    margin: 0 auto;
  }
  .bottom-tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    height: 100%;
    color: var(--fg-muted);
    text-decoration: none;
    font-family: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    position: relative;
  }
  .bottom-tab:active { opacity: 0.7; }
  .bottom-tab.active { color: var(--fg); }
  .bottom-tab-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .bottom-tab-icon {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
  }
  .bottom-tab-badge {
    position: absolute;
    top: -4px;
    right: -8px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--danger);
    color: white;
    font-family: "JetBrains Mono", monospace;
    font-size: 9px;
    font-weight: 800;
    display: grid;
    place-items: center;
    line-height: 1;
    border: 2px solid var(--bg);
  }
  /* ── Mobile / TMA project card row header ──
     Compact one-line identity for list mode: avatar + name + ticker
     + status pill. Same DOM as the desktop card body, but styled to
     look like a row title. Hidden on desktop. */
  .project-card-row-head {
    display: none;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .project-card-row-id {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }
  .project-card-row-name {
    font-size: 13px;
    font-weight: 800;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.2;
  }
  .project-card-row-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .project-card-row-ticker {
    font-family: "JetBrains Mono", monospace;
    font-size: 10.5px;
    font-weight: 800;
    color: var(--accent-fg);
    flex-shrink: 0;
  }
  .project-card-row-repo {
    font-family: "JetBrains Mono", monospace;
    font-size: 9.5px;
    color: var(--fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  /* Deadline lives on the same meta line in mobile list mode, after
     the repo. Slightly de-emphasized. */
  .project-card-row-deadline {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: "JetBrains Mono", monospace;
    font-size: 9.5px;
    color: var(--fg-muted);
    flex-shrink: 0;
  }
  .project-card-row-status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 999px;
    font-family: "JetBrains Mono", monospace;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    background: var(--bg-tint);
    color: var(--fg-muted);
    flex-shrink: 0;
  }
  .project-card-row-status .dot {
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: var(--accent);
  }
  .project-card-row-status.shipping .dot { background: var(--accent); }
  .project-card-row-status.live .dot { background: var(--accent); }
  .project-card-row-status.ending-soon { color: var(--warn); }
  .project-card-row-status.ending-soon .dot { background: var(--warn); }

  /* Primary "+" tab — looks like a FAB, raised above the bar. */
  .bottom-tab.primary {
    margin-top: -14px;
  }
  .bottom-tab.primary .bottom-tab-icon {
    width: 48px;
    height: 48px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--tg-theme-button-text-color, white);
    box-shadow: 0 6px 16px -4px color-mix(in oklch, var(--accent) 60%, transparent);
  }
  .bottom-tab.primary .bottom-tab-label {
    margin-top: 2px;
    color: var(--accent-fg);
  }
  .bottom-tab.primary.active .bottom-tab-label {
    color: var(--accent-fg);
  }
  @media (max-width: 640px) {
    .nav-inner { gap: 8px !important; }
    .nav-link, .btn-myagent, .btn-signin {
      padding-left: 8px !important;
      padding-right: 8px !important;
    }
    .nav-resp-label { display: none !important; }
    /* Logo wordmark shrinks to leave room for the icon-only nav links
       and the wallet chip. The diamond stays the same so the brand
       mark still reads. */
    .logo > span:last-child { font-size: 14px !important; }
    /* The Pulse/Propose nav links live in the bottom tab bar on
       phones, so the duplicated top bar links go away. */
    .nav-links { display: none !important; }
    /* The notifications bell is in the bottom tab bar too. */
    .nav-inner .btn-bell { display: none !important; }
  }
  /* In Telegram the same squeeze applies: nav-links and bell move to
     the bottom tab bar, the top bar keeps only logo + wallet + avatar. */
  [data-tg] .nav-links { display: none !important; }
  [data-tg] .nav-inner .btn-bell { display: none !important; }
  [data-tg] .footer { display: none !important; }
  @media (max-width: 640px) {
    .footer { display: none !important; }
  }

  /* ── Drop the entire top Nav on phones and inside TMA ──
     Telegram Mini App convention: no web header. Telegram supplies
     the native back button (wired in App.jsx via the TMA SDK), the
     app's bottom tab bar owns navigation, and the wallet connection
     moves into the Me tab as a settings row. The top Nav still owns
     navigation on desktop ≥641px where there's no bottom tab bar. */
  @media (max-width: 640px) {
    .nav { display: none !important; }
  }
  [data-tg] .nav { display: none !important; }
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

  /* Project title pills row: sits BELOW the h1 (not next to it).
     Holds the LIVE status pill and the MY ownership pill. The two
     pills are visually distinct — LIVE is filled accent-soft, MY is
     an outlined accent chip — so they read as separate things. */
  .proj-title-pills {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  /* Ticker + repo row — sits between the pills and the description.
     Ticker is the project token ($BBK), repo is the GitHub URL. */
  .proj-ticker-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 8px;
    font-family: "JetBrains Mono", monospace;
  }
  .proj-repo-link {
    font-size: 12px;
    color: var(--fg-muted);
    text-decoration: none;
  }
  .proj-repo-link:hover { color: var(--fg); }
  /* Repo link sits on its own line, just below the pitch. Mono font
     matches the rest of the metadata cluster. Small icon arrow makes
     it scan as an external link, not part of the description body. */
  .proj-repo-link--after-pitch {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 6px;
    font-family: "JetBrains Mono", monospace;
    font-size: 11.5px;
    color: var(--fg-muted);
    word-break: break-all;
  }
  .proj-repo-link--after-pitch::after {
    content: "↗";
    font-size: 10px;
    color: var(--fg-subtle);
  }
  /* Status pill — same visual language as the .project-card-row-status
     chip on the Pulse list, just a hair bigger because it's the page
     hero. */
  .proj-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 4px;
    font-family: "JetBrains Mono", monospace;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .proj-pill-live {
    background: var(--accent-soft);
    color: var(--accent-fg);
  }
  .proj-pill-ready_to_publish {
    background: oklch(0.96 0.05 80);
    color: #b45309;
  }
  .proj-pill-default {
    background: var(--bg-tint);
    color: var(--fg-muted);
  }
  /* MY pill — shows the viewer owns this project. Uses the accent
     outline so it stands out from the LIVE pill next to it without
     competing visually. */
  .proj-pill-my {
    background: var(--bg);
    color: var(--accent-fg);
    border: 1px solid var(--accent);
  }
  /* Ticker pill ($BBK, $TNF) — same size and shape as the status
     pills, mono font to keep the token symbol readable, neutral
     tint so it doesn't compete with the LIVE / MY color signal. */
  .proj-pill-ticker {
    background: var(--bg-tint);
    color: var(--fg);
    font-family: "JetBrains Mono", monospace;
    letter-spacing: 0.02em;
  }

  /* Phase pipeline — 5 stage cards + connectors. On desktop the flex
     row fits and connectors draw between the cards. On phones the
     whole thing becomes a horizontal scroller so the 5 stages stay
     a single line — the previous 3+2 wrap was unreadable (the
     connectors broke between rows and the "active" stage floated
     in the middle of the wrap).

     The pipeline is wrapped in .phase-pipeline-wrap (added in the
     JSX) so the "Next: ..." hint and the scroll row share one
     bordered card on phones — the hint is part of the same info
     block as the stage chips, not a separate line floating below. */
  .phase-pipeline-wrap {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  /* Override the .phase-pipeline border when it's inside the wrap
     — the wrap already has the border, doubling it would look heavy
     and break the radius. */
  .phase-pipeline-wrap > .phase-pipeline {
    border: none;
    border-radius: 0;
    background: transparent;
  }
  .phase-pipeline-wrap > .phase-next {
    border-top: 1px dashed var(--border);
    padding: 10px 12px;
    margin: 0;
  }
  /* Hint line that sits above the phase chips and tells the user
     what they're looking at. Tiny dot, one short line, lower
     contrast. The "Current phase is X" naming answers the first
     question every new user has: "what do these circles mean?" */
  .phase-pipeline-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px 6px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--fg-muted);
  }
  .phase-pipeline-hint strong {
    color: var(--fg);
    font-weight: 700;
  }
  .phase-pipeline-hint-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--accent);
    flex-shrink: 0;
  }
  /* Repository chip in the project's About card — small GitHub
     mark + the org/repo short form. The full URL stays in the
     title tooltip on hover. The chip itself never wraps, just
     ellipsis-truncates if the org/repo is unusually long. */
  .proj-repo-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--fg);
    text-decoration: none;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }
  .proj-repo-chip:hover { color: var(--accent-fg); }
  .proj-repo-chip-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  /* Collapsible chevron used by the "Goal" disclosure and the
     "View token details" disclosure on the project page. Rotates
     180° when the parent <details> is open. Hides the default
     browser disclosure triangle (we render our own). */
  .about-collapsible-chevron {
    display: inline-block;
    transition: transform 0.15s ease;
    font-size: 9px;
    color: var(--fg-muted);
  }
  .about-collapsible[open] > summary .about-collapsible-chevron,
  .about-collapsible--token[open] > summary .about-collapsible-chevron {
    transform: rotate(180deg);
  }
  .about-collapsible > summary::-webkit-details-marker,
  .about-collapsible--token > summary::-webkit-details-marker {
    display: none;
  }
  .about-collapsible > summary,
  .about-collapsible--token > summary {
    list-style: none;
  }
  /* Goal disclosure: a one-line preview of the goal text with a
     fade-to-background gradient below it, so the user sees a
     teaser of the content and a visual hint that more is hidden.
     When the disclosure opens, the peek + fade are hidden and
     the full <p> below takes over. */
  .about-collapsible-peek {
    position: relative;
    margin-bottom: 0;
  }
  .about-collapsible-preview {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    /* Mask the bottom of the peek so the text fades into the
       background instead of stopping on a hard line. This is
       the visual "more below" affordance. */
    mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  }
  .about-collapsible-fade {
    /* The fade sits below the peek as a separate 24px tall block
       with its own gradient — a second visual cue. The mask above
       is the primary affordance; this is the backup that reads
       even when CSS masks aren't supported (e.g. older Telegram
       WebView on Android). */
    position: absolute;
    left: 0;
    right: 0;
    bottom: -8px;
    height: 24px;
    background: linear-gradient(
      to bottom,
      transparent,
      var(--bg)
    );
    pointer-events: none;
  }
  /* When the Goal disclosure opens, the peek + fade are no longer
     needed (the full text shows below) — hide them so they don't
     repeat the same content. The peek lives INSIDE the <summary>
     so it stays visible when collapsed; this rule hides it when
     the disclosure opens. */
  .about-collapsible--goal[open] .about-collapsible-peek {
    display: none;
  }
  @media (max-width: 640px) {
    .phase-pipeline {
      flex-wrap: nowrap;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      padding: 10px;
      gap: 0;
    }
    .phase-pipeline .phase-stage {
      flex: 0 0 auto;
    }
    /* Drop the secondary "hint" line ("Product spec", "UX & flows")
       to save horizontal space — the label alone is enough on phone. */
    .phase-pipeline .phase-stage-hint { display: none; }
    .phase-pipeline .phase-stage-label { font-size: 11px; }
    .phase-pipeline .phase-stage { padding: 6px 8px; gap: 5px; }
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
    .container { padding-left: 12px !important; padding-right: 12px !important; }
  }
  @media (max-width: 380px) {
    /* Tiny phones (iPhone SE class): drop back to the CSS default 28px
       so cards keep enough internal content width. */
    .container { padding-left: 10px !important; padding-right: 10px !important; }
  }
  /* Nav is chrome, not content — keep it tight regardless of the
     container bump above. */
  @media (max-width: 640px) {
    .nav .container { padding-left: 12px !important; padding-right: 12px !important; }
  }

  /* Card interiors get more horizontal breathing on phones so text
     no longer kisses the card border. */
  @media (max-width: 640px) {
    .project-body  { padding: 14px 18px !important; }
  }

  /* Section blocks: 28px top/bottom → 12px. The dashed underline still
     reads, but the page stops feeling padded-out. */
  @media (max-width: 640px) {
    .section { padding-top: 12px !important; padding-bottom: 12px !important; }
  }

  /* Intro hero: tighten the margins under the headline and the
     paragraph so the CTAs land sooner on a phone viewport.

     The hero on phones is still 2-col: h1+sub on the left, the
     install + agent-prompt code blocks on the right (builders
     onboarding to the platform need to see and copy those — they're
     the single most important content on the home page for an
     AI-agent browser). We just cap the headline at a sane size so it
     doesn't overflow the narrow column, and trim the code-block
     padding so the two side-by-side panels actually fit. */
  @media (max-width: 640px) {
    .intro-h { margin: 0 0 8px !important; font-size: 24px !important; line-height: 1.05 !important; letter-spacing: -0.025em !important; }
    .intro-h-l2::after { display: none; }
    .intro-sub { margin: 0 0 12px !important; font-size: 12.5px !important; }
    .intro-foot { padding-top: 12px !important; gap: 12px !important; }
    .intro-stat-v { font-size: 14px !important; }
    .intro-stat-l { font-size: 8.5px !important; }
    .intro-stat { padding: 5px 10px !important; }
    /* Stack the code column below the headline on phones — the
       280px right column won't fit beside a 360px viewport. */
    .intro-code-col { flex-basis: 100% !important; min-width: 0 !important; }
  }

  /* Section heads on phones: keep the title + sort on one row,
     vertically centered. The sort trigger is a tiny icon-only
     button (see the SortMenu CSS). Tabs are gone on mobile — the
     default filter is Live, and the user can change sort via the
     icon button. */
  @media (max-width: 640px) {
    .section-head { flex-direction: row !important; align-items: center !important; gap: 10px !important; }
    .section-head > div:first-child { min-width: 0; flex: 1; }
    .section-head-actions { gap: 0 !important; flex-shrink: 0; }
    /* Tabs are removed from the mobile UI entirely. The sort
       menu is the only control; the default filter is Live. */
    .section-head .tabs { display: none !important; }
  }

  /* Same on TMA: keep the section head as title + small icon
     button. No tabs. */
  [data-tg] .section-head { flex-direction: row !important; align-items: center !important; gap: 10px !important; }
  [data-tg] .section-head > div:first-child { min-width: 0; flex: 1; }
  [data-tg] .section-head-actions { gap: 0 !important; flex-shrink: 0; }
  [data-tg] .section-head .tabs { display: none !important; }

  /* Project cards on the Pulse grid: the hero eats too much vertical
     space on a stacked phone view. Switch the 3-col grid into a
     row-oriented list layout so each card becomes a one-line
     tappable row. Same applies inside Telegram — TMA users get the
     list view by default.

     Mobile row anatomy:
       [hero avatar (left)]  [name + ticker + repo]  [reward + deadline]
                              [1-line pitch]
       (stats row hidden, big hero hidden, bottom hidden) */
  @media (max-width: 640px) {
    .project-grid { display: flex !important; flex-direction: column; gap: 8px; }
    /* Row direction with the hero on the left. */
    .project-grid .project-card { flex-direction: row; }
    /* Drop the heavy decorative hero entirely. The row header in
       the body carries the token avatar + status. */
    .project-grid .project-hero,
    .project-grid .hero-cover { display: none !important; }
    /* Body fills the rest, single column. */
    .project-grid .project-body {
      padding: 10px 12px;
      gap: 4px;
      min-width: 0;
      flex: 1;
    }
    /* The .project-card-row-head we added in Home.jsx is the row
       identity (avatar + name + ticker + status). Hidden on desktop
       where the hero already covers this. */
    .project-grid .project-card-row-head { display: flex; }
    .project-grid .project-pitch {
      font-size: 11.5px;
      -webkit-line-clamp: 1;
      color: var(--fg-muted);
    }
    /* Stats collapse to 1 line: tasks open + reward (the two that
       matter for "should I claim this?"). Active agents hidden. */
    .project-grid .project-stats-row {
      display: flex !important;
      grid-template-columns: none !important;
      gap: 12px !important;
      padding-top: 6px !important;
      border-top: none !important;
    }
    .project-grid .project-stats-row > :nth-child(2) {
      flex: 1;
    }
    .project-grid .project-stats-row > :last-child { display: none; }
    .project-grid .project-stat-label { font-size: 9px !important; }
    .project-grid .project-stat-value { font-size: 12px !important; }
    /* Deadline moved inline into .project-card-row-meta on mobile,
       so the dedicated right column is now empty real estate. Hide
       it entirely in list mode. The .project-bottom element still
       exists in the DOM for desktop layout. */
    .project-grid .project-bottom { display: none; }
  }
  /* On desktop the row header is hidden — the hero covers it. */
  @media (min-width: 641px) {
    .project-card-row-head { display: none; }
  }
  /* Same list layout for TMA, regardless of viewport. */
  [data-tg] .project-grid { display: flex !important; flex-direction: column; gap: 8px; }
  [data-tg] .project-grid .project-card { flex-direction: row; }
  [data-tg] .project-grid .project-hero,
  [data-tg] .project-grid .hero-cover { display: none !important; }
  [data-tg] .project-grid .project-body { padding: 10px 12px; gap: 4px; min-width: 0; flex: 1; }
  [data-tg] .project-grid .project-card-row-head { display: flex; }
  [data-tg] .project-grid .project-pitch { font-size: 11.5px; -webkit-line-clamp: 1; color: var(--fg-muted); }
  [data-tg] .project-grid .project-stats-row {
    display: flex !important;
    grid-template-columns: none !important;
    gap: 12px !important;
    padding-top: 6px !important;
    border-top: none !important;
  }
  [data-tg] .project-grid .project-stats-row > :nth-child(2) { flex: 1; }
  [data-tg] .project-grid .project-stats-row > :last-child { display: none; }
  [data-tg] .project-grid .project-bottom {
    width: auto;
    padding: 0 12px 0 0;
    background: none;
    border: none;
    display: flex;
    align-items: flex-end;
    flex-shrink: 0;
  }
  [data-tg] .project-grid .project-bottom { display: none; }

  /* Project page hero on mobile: smaller h1 + tighter avatar gap so the
     name doesn't squeeze the live-site card off-screen. Card interior
     padding stays generous. */
  @media (max-width: 640px) {
    .proj-h1 { font-size: 24px !important; }
    .proj-title-row { gap: 12px !important; }
    .proj-title-row > :first-child { width: 48px !important; height: 48px !important; }
    .proj-pitch { font-size: 13px !important; }
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
  const navigate = useNavigate();
  const auth = useAuth();
  // Auth pages own the full viewport (no Nav, no Footer chrome).
  const isAuthRoute = pathname === "/auth" || pathname === "/auth/callback";

  // ── Telegram back button ──
  // Save the listener in a ref so cleanup can pass the SAME reference
  // to offClick. (The SDK matches listeners by reference, so a new
  // arrow in cleanup would silently leave the old listener attached.)
  const backClickRef = useRef(null);
  useEffect(() => {
    if (!isTMA()) return;
    if (pathname === "/" || isAuthRoute) {
      backButton.hide.ifAvailable();
    } else {
      backButton.show.ifAvailable();
      const handler = () => navigate(-1);
      backClickRef.current = handler;
      backButton.onClick.ifAvailable(handler);
    }
    return () => {
      if (backClickRef.current) {
        backButton.offClick.ifAvailable(backClickRef.current);
        backClickRef.current = null;
      }
    };
  }, [pathname, navigate, isAuthRoute]);

  // ── Keep viewport expanded in Telegram ──
  useEffect(() => {
    if (!isTMA()) return;
    viewport.expand.ifAvailable();
    document.documentElement.setAttribute("data-tg", "");
    return () => document.documentElement.removeAttribute("data-tg");
  }, [pathname]);

  // ── Telegram safe-area insets → CSS vars ──
  // viewport.bindCssVars() only emits width/height/stableHeight, NOT
  // safe-area-insets, so we wire those manually via signals.
  const safeTop = useSignal(viewport.safeAreaInsetTop);
  const safeBottom = useSignal(viewport.safeAreaInsetBottom);
  const safeLeft = useSignal(viewport.safeAreaInsetLeft);
  const safeRight = useSignal(viewport.safeAreaInsetRight);
  const contentSafeTop = useSignal(viewport.contentSafeAreaInsetTop);
  const contentSafeBottom = useSignal(viewport.contentSafeAreaInsetBottom);
  useEffect(() => {
    if (!isTMA()) return;
    const root = document.documentElement.style;
    root.setProperty("--sat", `${safeTop() || 0}px`);
    root.setProperty("--sab", `${safeBottom() || 0}px`);
    root.setProperty("--sal", `${safeLeft() || 0}px`);
    root.setProperty("--sar", `${safeRight() || 0}px`);
    root.setProperty("--csat", `${contentSafeTop() || 0}px`);
    root.setProperty("--csab", `${contentSafeBottom() || 0}px`);
  }, [safeTop, safeBottom, safeLeft, safeRight, contentSafeTop, contentSafeBottom]);

  // ── Telegram dark scheme → .is-dark on <html> ──
  const isDark = useSignal(miniApp.isDark);
  useEffect(() => {
    if (!isTMA()) return;
    document.documentElement.classList.toggle("is-dark", !!isDark());
  }, [isDark]);

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

      {/* Bottom tab bar — primary nav on phones and inside TMA.
          Hidden ≥640px where the top Nav still rules. Renders a
          56px sticky bar + safe-area-inset-bottom so the iOS home
          indicator never sits on top of a tab. */}
      {!isAuthRoute && <BottomTabBar authed={auth.authed} agent={auth.agent} />}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/projects/:slug" element={<Project />} />
        <Route path="/projects/:slug/milestones" element={<Milestones />} />
        <Route path="/projects/:slug/trading" element={<Trading />} />
        <Route path="/projects/:slug/token" element={<Token />} />
        <Route path="/projects/:slug/launched" element={<Launched />} />
        <Route path="/agent/:handle" element={<Agent />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/propose" element={<Create />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<Home />} />
      </Routes>

      {!isAuthRoute && <Footer />}
      {/* Spacer at the very bottom so the last bit of scrollable
          content (e.g. a long payout table) never sits under the
          fixed bottom tab bar. The CSS only applies padding when
          .bottom-tabbar is actually displayed. */}
    </div>
  );
}
