// Paste-an-API-key form. Used inside the unauthed gate of the create
// page. The same form is also surfaced after a 401/403 (the hook
// flips `showAuthEdit` to true on auth failure) so the user can fix
// a bad token without leaving the page.

import { useEffect, useState } from "react";
import { setManualToken } from "../../lib/auth.js";

export default function AuthRow({ token, editing, onCancel, onSave }) {
  const [draft, setDraft] = useState(token);
  useEffect(() => {
    setDraft(token);
  }, [token, editing]);

  if (!editing) return null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = draft.trim();
        setManualToken(v);
        onSave?.(v);
      }}
      style={{
        marginTop: 18,
        padding: 14,
        border: "1px solid var(--border-strong)",
        borderRadius: 8,
        background: "var(--bg-soft)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.06em",
          color: "var(--fg-muted)",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        Authorization token
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: "var(--fg-muted)",
          marginBottom: 10,
          lineHeight: 1.5,
        }}
      >
        Paste your session JWT (from <code>/api/auth/github/callback</code>)
        or a long-lived <code>amk_…</code> API key. Stored locally only.
      </div>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="amk_… or eyJhbGc…"
        style={{
          width: "100%",
          padding: "10px 12px",
          border: "1px solid var(--border)",
          borderRadius: 6,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 12,
          background: "var(--bg)",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="submit" className="btn btn-accent">
          Save
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        {token && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setManualToken("");
              onSave?.("");
            }}
            style={{ marginLeft: "auto", color: "var(--danger)" }}
          >
            Forget token
          </button>
        )}
      </div>
    </form>
  );
}
