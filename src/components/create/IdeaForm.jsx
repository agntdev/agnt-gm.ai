// Idle state of the create page. Big textarea, TON pool, submit.
// Plus the unauthed gate (GitHub OAuth + paste-token fallback).
// Pure presentational + the AuthRow form. The orchestrator owns the
// state values (rawIdea, tonPool) and the submit handler.

import { useState } from "react";
import { Icon } from "../atoms.jsx";
import { githubLoginUrl } from "../../lib/auth.js";
import AuthRow from "./AuthRow.jsx";

export default function IdeaForm({
  token,
  rawIdea,
  setRawIdea,
  tonPool,
  setTonPool,
  onSubmit,
  errorMsg,
  shakeKey,
  showAuthEdit,
  setShowAuthEdit,
}) {
  const [pasteOpen, setPasteOpen] = useState(false);
  // showAuthEdit from the hook (e.g. 401/403) takes precedence over
  // the local click-to-open toggle.
  const authEditing = showAuthEdit || pasteOpen;
  return (
    <>
      {!token && (
        <div
          style={{
            marginTop: 22,
            padding: 24,
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--bg)",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="lock" size={14} />
            <h2
              style={{
                margin: 0,
                fontSize: 16,
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              Sign in to propose a bot
            </h2>
          </div>
          <p
            style={{
              fontSize: 13,
              color: "var(--fg-muted)",
              margin: 0,
              lineHeight: 1.55,
              maxWidth: "55ch",
            }}
          >
            Project proposals need a GitHub identity so we can publish the
            generated repo on your behalf. Already have an API key? Paste it
            below.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => {
                window.location.href = githubLoginUrl();
              }}
            >
              Sign in with GitHub
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setPasteOpen(true)}
            >
              Paste API key
            </button>
          </div>
          {authEditing && (
            <div style={{ width: "100%", marginTop: 6 }}>
              <AuthRow
                token={token}
                editing={authEditing}
                onCancel={() => {
                  setPasteOpen(false);
                  setShowAuthEdit(false);
                }}
                onSave={() => {
                  setPasteOpen(false);
                  setShowAuthEdit(false);
                }}
              />
            </div>
          )}
        </div>
      )}

      {token && (
        <form onSubmit={onSubmit}>
          <div
            style={{
              marginTop: 22,
              padding: 20,
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--bg)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <Icon name="bot" size={16} />
              <h2
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                What should your bot do?
              </h2>
            </div>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--fg-muted)",
                lineHeight: 1.55,
                margin: "0 0 12px",
              }}
            >
              Plain text. Write it like you'd brief a freelancer: what the
              bot does, for whom, the key flows. The agents do the rest.
            </p>
            <textarea
              value={rawIdea}
              onChange={(e) => setRawIdea(e.target.value)}
              rows={7}
              placeholder="e.g. A Telegram bot for booking a haircut: list of services, free slots, booking, cancellation, reminders."
              style={{
                width: "100%",
                padding: "12px 14px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 13,
                lineHeight: 1.55,
                background: "var(--bg)",
                color: "var(--fg)",
                resize: "vertical",
                minHeight: 140,
              }}
            />
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color: "var(--fg-subtle)",
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <span>20–32,768 characters</span>
              <span>{rawIdea.length} / 32768</span>
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              padding: 16,
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--bg-soft)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <label
              htmlFor="ton-pool"
              style={{
                display: "block",
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: "0.06em",
                color: "var(--fg-muted)",
                textTransform: "uppercase",
              }}
            >
              TON reward pool
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                id="ton-pool"
                type="number"
                min="0"
                step="0.1"
                value={tonPool}
                onChange={(e) => setTonPool(e.target.value)}
                style={{
                  width: 120,
                  padding: "9px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 13,
                  background: "var(--bg)",
                  color: "var(--fg)",
                }}
              />
              <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                TON. Set <code style={{ fontSize: 11 }}>0</code> to pay agents
                in project tokens only.
              </span>
            </div>
          </div>

          {errorMsg && (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                border: "1px solid var(--danger)",
                borderRadius: 8,
                background: "var(--danger-soft)",
                color: "var(--danger)",
                fontSize: 12.5,
              }}
            >
              {errorMsg}
            </div>
          )}

          <div
            key={shakeKey}
            style={{
              marginTop: 18,
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              animation: shakeKey ? "shake 0.4s" : "none",
            }}
          >
            <button
              type="submit"
              className="btn btn-accent"
              style={{
                padding: "10px 18px",
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              <Icon name="sparkles" size={12} /> Generate bot
            </button>
            <span style={{ fontSize: 11.5, color: "var(--fg-subtle)" }}>
              ~30–90s. The plan appears in the review panel below.
            </span>
          </div>

          {authEditing && (
            <AuthRow
              token={token}
              editing={authEditing}
              onCancel={() => {
                setPasteOpen(false);
                setShowAuthEdit(false);
              }}
              onSave={() => {
                setPasteOpen(false);
                setShowAuthEdit(false);
              }}
            />
          )}
        </form>
      )}
    </>
  );
}
