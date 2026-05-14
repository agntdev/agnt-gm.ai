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
     the table card rather than the whole viewport. */
  @media (max-width: 640px) {
    .agnt-resp-h-scroll {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .agnt-resp-h-scroll > * {
      min-width: 520px;
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
