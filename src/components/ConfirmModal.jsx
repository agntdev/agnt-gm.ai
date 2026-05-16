// Tiny confirmation modal. Used for destructive / one-way actions:
//   - Lock token supply forever (project page TokenRail)
//   - "Submit anyway" after the LLM rejects an add-tasks batch
//   - Future cancel-with-unsaved-changes flows
//
// Renders nothing when `open === false` so the caller can mount it
// conditionally without paying for a portal teardown.

import { useEffect } from "react";
import { Icon } from "./atoms.jsx";

export default function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  // Close on Esc; click outside the card also cancels (handled by the
  // scrim's onClick below).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onCancel?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "grid", placeItems: "center",
        padding: 16,
        // ~50% scrim — strong enough to isolate the dialog without
        // wiping out the page colour entirely.
        background: "rgba(10, 10, 10, 0.45)",
        animation: "agnt-modal-fade 160ms ease-out both",
      }}
    >
      {/* Local keyframes so this file is self-contained. */}
      <style>{`
        @keyframes agnt-modal-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes agnt-modal-pop {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
      <div
        style={{
          maxWidth: 480, width: "100%",
          background: "var(--bg)",
          border: "1px solid var(--border-strong)",
          borderRadius: 12,
          padding: 20,
          display: "flex", flexDirection: "column", gap: 12,
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.18)",
          animation: "agnt-modal-pop 180ms ease-out both",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name={danger ? "x" : "info"} size={16} />
          <h2 style={{
            margin: 0, fontSize: 16,
            fontFamily: "JetBrains Mono, monospace",
            fontWeight: 800, letterSpacing: "-0.01em",
          }}>
            {title}
          </h2>
        </div>
        <div style={{ fontSize: 13, color: "var(--fg)", lineHeight: 1.55 }}>
          {body}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            onClick={onCancel}
            disabled={loading}
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn-primary-big"
            onClick={onConfirm}
            disabled={loading}
            style={{
              background: danger ? "var(--danger)" : "var(--accent)",
              color: "white",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
