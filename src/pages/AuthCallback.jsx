import { useEffect, useRef, useState } from "react";
import { setSession } from "../lib/auth.js";

// Lands here after GitHub OAuth round-trips through the API.
// The API redirects to:
//   ${WEB_URL}/auth/callback#token=amk_…&jwt=…&agent_id=…
//
// We parse the URL fragment, persist the credentials, then immediately wipe
// the fragment from the address bar (so the token doesn't sit in browser
// history). On error (missing fragment, missing token), surface the message
// and let the user retry.
//
// The fragment must be parsed at module-evaluation/render time (BEFORE the
// useEffect runs), because in StrictMode dev the effect fires twice and the
// second pass would see an already-cleared hash. Using a useRef guard plus
// snapshotting the hash up-front makes the side effect idempotent.
function parseFragment() {
  const hash = window.location.hash;
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!fragment) return { kind: "empty" };
  const params = new URLSearchParams(fragment);
  const errMsg = params.get("error");
  if (errMsg) return { kind: "error", message: errMsg };
  const token = params.get("token");
  const jwt = params.get("jwt");
  const agent_id = params.get("agent_id");
  if (!token && !jwt) return { kind: "error", message: "Sign-in completed but no credentials were returned." };
  return { kind: "ok", token, jwt, agent_id };
}

export default function AuthCallback() {
  const ranRef = useRef(false);
  // Snapshot the parsed fragment synchronously on first render so a possible
  // StrictMode re-mount doesn't see an already-cleared hash.
  const [parsed] = useState(parseFragment);
  const [error, setError] = useState(() =>
    parsed.kind === "error" ? parsed.message : ""
  );

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (parsed.kind === "empty") {
      setError("Missing OAuth fragment. Try signing in again.");
      return;
    }
    if (parsed.kind === "error") {
      // Already surfaced via the initial setState above.
      return;
    }

    setSession({
      token: parsed.token,
      jwt: parsed.jwt,
      agent_id: parsed.agent_id,
    });

    // Hard-replace to '/' so:
    //   1. The URL bar updates (some setups don't propagate React Router
    //      history changes after a manual fragment).
    //   2. The fragment carrying the token is wiped from browser history.
    //   3. The Home route boots with a fresh component tree that picks up
    //      the just-persisted localStorage values via useAuth.
    window.location.replace("/");
  }, [parsed]);

  return (
    <main>
      <section className="container" style={{ paddingTop: 80, maxWidth: 540 }}>
        <div style={{
          padding: 28, border: "1px solid var(--border)", borderRadius: 10,
          background: "var(--bg-soft)", textAlign: "center",
        }}>
          {error ? (
            <>
              <h2 style={{ margin: 0, fontSize: 18, color: "var(--danger)" }}>Sign-in failed</h2>
              <p style={{ marginTop: 8, fontSize: 13, color: "var(--fg-muted)" }}>{error}</p>
              <button
                type="button"
                className="btn-primary-big"
                onClick={() => { window.location.href = "/api/auth/github?redirect=1"; }}
                style={{ marginTop: 14 }}
              >
                Try again with GitHub
              </button>
            </>
          ) : (
            <>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span className="live-dot" />
                <h2 style={{ margin: 0, fontSize: 18 }}>Signing you in…</h2>
              </div>
              <p style={{ marginTop: 8, fontSize: 13, color: "var(--fg-muted)" }}>
                Persisting your session and redirecting.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
