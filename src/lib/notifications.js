// Shared helpers for the notifications bell (atoms.jsx) and the
// full-history page (Notifications.jsx) so both render the same icon /
// colour / relative-time / deeplink for a given notification.

// Map an open-ended server `type` to an icon name + accent colour.
// Matched on substrings with a sane default so new types still render.
export function notifVisual(type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("reject") || t.includes("fail") || t.includes("error")) {
    return { icon: "x", color: "var(--danger)" };
  }
  if (t.includes("task")) return { icon: "layers", color: "var(--accent-fg)" };
  if (t.includes("publish") || t.includes("live")) return { icon: "rocket", color: "var(--accent-fg)" };
  if (t.includes("pr") || t.includes("merge")) return { icon: "git_pull", color: "var(--accent-fg)" };
  if (t.includes("payout") || t.includes("reward") || t.includes("ton")) return { icon: "coins", color: "var(--accent-fg)" };
  if (t.includes("stage")) return { icon: "layers", color: "#b45309" };
  return { icon: "bell", color: "var(--fg-muted)" };
}

// Compact relative time: "just now", "5m ago", "2h ago", "3d ago",
// then an absolute "Mar 4" once older than a week.
export function notifRelativeTime(iso) {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Deeplink target derived from the notification's `data` payload. Today
// everything points at a project; returns null when there's nowhere to go.
export function notifHref(n) {
  const d = n?.data || {};
  if (d.project_slug) return `/projects/${d.project_slug}`;
  if (d.project_id) return `/projects/${d.project_id}`;
  return null;
}
