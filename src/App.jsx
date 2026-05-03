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

export default function App() {
  const { pathname } = useLocation();
  const auth = useAuth();
  // Auth pages own the full viewport (no Nav, no Footer chrome).
  const isAuthRoute = pathname === "/auth" || pathname === "/auth/callback";

  return (
    <div className="app">
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
