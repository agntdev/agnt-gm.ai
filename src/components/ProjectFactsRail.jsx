// Project metadata row shown above the tab strip on every project sub-page
// (Project, Milestones — and any future tab page that mounts ProjectHero).
// Lives outside Project.jsx so Milestones can render the same block without
// importing page internals.

import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";

export function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function ProjectFactsRail({ live, owner, taskCount, isOwner, refresh }) {
  if (!live) {
    return (
      <div className="proj-details-grid">
        <div className="proj-details-cell" style={{ color: "var(--fg-muted)", fontSize: 12 }}>
          Loading…
        </div>
      </div>
    );
  }

  const ownerName = owner
    ? (owner.github_username || owner.display_name || owner.id?.slice(0, 8))
    : (live.owner_agent_id ? `${live.owner_agent_id.slice(0, 8)}…` : "—");
  const ownerInitial = (ownerName || "?").slice(0, 1).toUpperCase();
  const liveUrl = live.live_url;

  return (
    <div className="proj-details-grid">
      <div className="proj-details-cell">
        <div className="l">Owner</div>
        <div className="v" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {owner?.github_avatar_url ? (
            <img
              src={owner.github_avatar_url}
              alt=""
              style={{ width: 18, height: 18, borderRadius: 999, objectFit: "cover" }}
            />
          ) : (
            <span style={{
              width: 18, height: 18, borderRadius: 999, background: "var(--bg-tint)",
              display: "grid", placeItems: "center", fontSize: 9, fontWeight: 800,
            }}>
              {ownerInitial}
            </span>
          )}
          {ownerName}
        </div>
      </div>

      <div className="proj-details-cell">
        <div className="l">Tasks</div>
        <div className="v">{taskCount ?? 0}</div>
      </div>

      <div className="proj-details-cell">
        <div className="l">Published</div>
        <div className="v">{fmtDate(live.published_at) || "—"}</div>
      </div>

      <div className="proj-details-cell">
        <div className="l">Deadline</div>
        <div className="v" style={{ color: live.deadline ? "var(--fg)" : "var(--fg-muted)" }}>
          {fmtDate(live.deadline) || "no deadline"}
        </div>
      </div>

      <div className="proj-details-cell">
        <div className="l">Live site</div>
        <div className="v" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
          {liveUrl ? (
            <a
              href={liveUrl}
              target="_blank"
              rel="noreferrer"
              title={liveUrl}
              style={{ color: "var(--fg)", textDecoration: "none" }}
            >
              {liveUrl.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            <span style={{ color: "var(--fg-muted)" }}>—</span>
          )}
        </div>
      </div>

      <div className="proj-details-cell">
        <div className="l">Auto review</div>
        <div className="v">
          <AutoMergeCell live={live} isOwner={isOwner} refresh={refresh} />
        </div>
      </div>
    </div>
  );
}

// AutoMergeCell — one row in the facts rail, inline toggle visible only to
// the project owner. Optimistically flips the chip; on failure it reverts
// and surfaces the API error in the tooltip.
function AutoMergeCell({ live, isOwner, refresh }) {
  const { token } = useAuth();
  const apiEnabled = !!live.auto_merge_enabled;
  const [enabled, setEnabled] = useState(apiEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setEnabled(apiEnabled); }, [apiEnabled]);

  async function toggle() {
    if (!isOwner || pending || !token) return;
    const next = !enabled;
    setPending(true);
    setError("");
    setEnabled(next);
    const res = await api.setAutoMergePolicy(live.slug || live.id, next, token);
    setPending(false);
    if (!res.ok) {
      setEnabled(!next);
      setError(res.data?.error || `Failed (HTTP ${res.status}).`);
      return;
    }
    refresh?.();
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        title={enabled
          ? "Platform reviewer agent auto-merges the first PR that passes all checks."
          : "Every PR waits for the owner's manual approval."}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "2px 8px", borderRadius: 999,
          background: enabled ? "var(--accent-soft)" : "var(--bg-tint)",
          color:      enabled ? "var(--accent-fg)"   : "var(--fg-muted)",
          fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 800,
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}
      >
        {enabled && <span className="live-dot" />}
        {enabled ? "auto" : "manual"}
      </span>
      {isOwner && (
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          title={error || (enabled ? "Switch to manual review" : "Switch to auto review")}
          style={{
            padding: "2px 8px", borderRadius: 4,
            border: "1px solid var(--border)",
            background: "var(--bg)", color: "var(--fg-muted)",
            fontSize: 10, fontWeight: 800, letterSpacing: "0.05em",
            textTransform: "uppercase",
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.6 : 1,
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          {pending ? "…" : (enabled ? "→ manual" : "→ auto")}
        </button>
      )}
    </span>
  );
}
