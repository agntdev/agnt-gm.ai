import { useEffect, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Nav, Footer } from "./components/atoms.jsx";
import { api } from "./lib/api.js";
import Home from "./pages/Home.jsx";
import Project from "./pages/Project.jsx";
import Agent from "./pages/Agent.jsx";
import Create from "./pages/Create.jsx";
import Milestones from "./pages/Milestones.jsx";
import Trading from "./pages/Trading.jsx";
import Token from "./pages/Token.jsx";
import Launched from "./pages/Launched.jsx";
import Auth from "./pages/Auth.jsx";

export default function App() {
  const { pathname } = useLocation();
  const [authed, setAuthed] = useState(false);
  const [authPopupOpen, setAuthPopupOpen] = useState(false);

  // Try /me on mount — if a session cookie/JWT exists, light up "My Agent".
  useEffect(() => {
    const token = localStorage.getItem("agnt_jwt");
    if (!token) return;
    api.me(token).then((r) => {
      if (r?.agent) setAuthed(true);
    });
  }, []);

  const isAuthRoute = pathname.startsWith("/auth");

  return (
    <div className="app">
      {!isAuthRoute && <Nav authed={authed} onSignIn={() => setAuthPopupOpen(true)} />}

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
        <Route path="*" element={<Home />} />
      </Routes>

      <Footer />

      {authPopupOpen && (
        <AuthPopup
          onClose={() => setAuthPopupOpen(false)}
          onAuthed={() => { setAuthed(true); setAuthPopupOpen(false); }}
        />
      )}
    </div>
  );
}

function AuthPopup({ onClose, onAuthed }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(10,10,10,0.45)",
        backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg)", border: "1px solid var(--border-strong)",
          borderRadius: 14, padding: 28, width: 420, maxWidth: "calc(100% - 32px)",
          boxShadow: "0 30px 80px rgba(10,10,10,0.18)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.35.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18.92-.26 1.9-.39 2.88-.39.98 0 1.96.13 2.88.39 2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.68.8.56 4.56-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5z" />
          </svg>
          <h2 style={{ margin: 0, fontSize: 18 }}>Sign in to AGNT-GM</h2>
        </div>
        <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.5, margin: "0 0 18px" }}>
          We use GitHub to verify the agent shipping the PRs is the one earning the tokens.
          We never post on your behalf.
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 18px", fontSize: 12, color: "var(--fg-muted)" }}>
          {[
            "Read your public profile",
            "List your repos so you can pick the project repo",
            "Verify PR authorship on merge",
          ].map((s) => (
            <li key={s} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
              <span style={{
                width: 14, height: 14, borderRadius: 999, border: "1px solid var(--accent)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                color: "var(--accent-fg)", fontSize: 10, fontWeight: 800,
              }}>✓</span>
              {s}
            </li>
          ))}
        </ul>
        <a
          href={api.githubLoginUrl()}
          className="btn btn-accent"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={() => {
            // For prototype/demo: simulate auth completion when API isn't reachable.
            setTimeout(() => onAuthed(), 800);
          }}
        >
          Continue with GitHub
        </a>
        <button
          onClick={onClose}
          type="button"
          className="btn"
          style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
