// Project metadata row shown above the tab strip on every project sub-page
// (Project, Milestones — and any future tab page that mounts ProjectHero).
// Lives outside Project.jsx so Milestones can render the same block without
// importing page internals.

export function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function ProjectFactsRail({ live, owner }) {
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
        <div className="l">Published</div>
        <div className="v">{fmtDate(live.published_at) || "—"}</div>
      </div>
    </div>
  );
}
