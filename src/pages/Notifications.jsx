// Notifications — full history page (/notifications).
//
// Paginated list (by `total`) with an unread-only filter, per-row
// mark-read + deeplink, and a "Mark all read" action. The compact
// recent dropdown lives in the Nav bell (atoms.jsx NotificationsBell);
// this page is the "see everything" view.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/atoms.jsx";
import { api } from "../lib/api.js";
import { useAuth, githubLoginUrl } from "../lib/auth.js";
import { notifVisual, notifRelativeTime, notifHref } from "../lib/notifications.js";
import { hapticSelect, hapticSuccess } from "../lib/tma-native.js";

const PAGE = 50;

export default function Notifications() {
  const { token, authed } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function fetchPage(off, replace) {
    if (!token) return;
    setLoading(true);
    const res = await api.notifications(token, { limit: PAGE, offset: off, unread: unreadOnly });
    const list = res?.notifications || [];
    setTotal(Number(res?.total) || 0);
    setItems((prev) => (replace ? list : [...prev, ...list]));
    setOffset(off + list.length);
    setLoading(false);
    setLoaded(true);
  }

  // (Re)load from the top whenever the token or the filter changes.
  useEffect(() => {
    if (!token) return;
    setItems([]);
    setOffset(0);
    setLoaded(false);
    fetchPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, unreadOnly]);

  function onItemClick(n) {
    if (n.read_at == null && token) {
      api.markNotificationRead(n.id, token);
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
    const href = notifHref(n);
    if (href) navigate(href);
  }

  async function onReadAll() {
    hapticSuccess();
    if (!token) return;
    setItems((list) => list.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
    await api.markAllNotificationsRead(token);
  }

  if (!authed) {
    return (
      <main className="container" data-screen-label="Notifications">
        <section className="container" style={{ paddingTop: 60 }}>
          <div style={{
            padding: 40, border: "1px dashed var(--border-strong)", borderRadius: 10,
            background: "var(--bg-soft)", textAlign: "center",
          }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Sign in to see notifications</h2>
            <p style={{ marginTop: 8, fontSize: 13, color: "var(--fg-muted)" }}>
              Notifications are tied to your account.
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => { window.location.href = githubLoginUrl(); }}
              style={{ marginTop: 14 }}
            >
              Sign in with GitHub
            </button>
          </div>
        </section>
      </main>
    );
  }

  const hasMore = items.length < total;
  const anyUnread = items.some((n) => n.read_at == null);

  return (
    <main data-screen-label="Notifications">
      <section className="container" style={{ paddingTop: 0, paddingBottom: 60 }}>
        {/* Breadcrumb: matches the AGNT / <name> pattern used on
           project and agent pages. Keeps the header consistent
           with the rest of the app — the previous giant h1 +
           inline count was the only page that didn't use the
           breadcrumb style. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <div
            style={{
              fontSize: 11.5,
              color: "var(--fg-muted)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Link
              to="/"
              style={{
                textDecoration: "none",
                color: "inherit",
                fontFamily: "inherit",
                fontSize: "inherit",
              }}
            >
              AGNT
            </Link>
            <span>/</span>
            <span
              style={{
                color: "var(--fg)",
                fontWeight: 700,
                fontFamily: "inherit",
                fontSize: "inherit",
              }}
            >
              Notifications
              {total > 0 && (
                <span style={{ color: "var(--fg-muted)", fontWeight: 600, marginLeft: 6 }}>({total})</span>
              )}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 999, padding: 3, background: "var(--bg-soft)" }}>
            {[["all", "All"], ["unread", "Unread"]].map(([k, label]) => {
              const active = (k === "unread") === unreadOnly;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => { hapticSelect(); setUnreadOnly(k === "unread"); }}
                  style={{
                    padding: "5px 12px", borderRadius: 999, border: "none", cursor: "pointer",
                    background: active ? "var(--fg)" : "transparent",
                    color: active ? "var(--bg)" : "var(--fg-muted)",
                    fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 800,
                    letterSpacing: "0.04em", textTransform: "uppercase",
                    transition: "all 0.15s ease",
                  }}
                >
                  {label}
                </button>
              );
            })}
            </div>
            {anyUnread && (
              <button type="button" className="btn btn-sm" onClick={onReadAll}>
                <Icon name="check" size={12} /> Mark all read
              </button>
            )}
          </div>
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--bg)" }}>
          {!loaded && loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>
              Loading notifications…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>
              {unreadOnly ? "No unread notifications." : "No notifications yet."}
            </div>
          ) : (
            items.map((n, i) => {
              const { icon, color } = notifVisual(n.type);
              const unread = n.read_at == null;
              const href = notifHref(n);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onItemClick(n)}
                  style={{
                    display: "flex", gap: 12, width: "100%", textAlign: "left",
                    padding: "14px 18px", border: "none",
                    borderBottom: i < items.length - 1 ? "1px solid var(--border)" : "none",
                    background: unread ? "var(--accent-soft)" : "transparent",
                    cursor: href ? "pointer" : "default", fontFamily: "inherit",
                  }}
                >
                  <span style={{ color, marginTop: 1, flexShrink: 0 }}><Icon name={icon} size={16} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "var(--fg)", lineHeight: 1.4 }}>
                      {n.title || n.type}
                    </span>
                    {n.body && (
                      <span style={{ display: "block", fontSize: 12.5, color: "var(--fg-muted)", marginTop: 3, lineHeight: 1.5 }}>
                        {n.body}
                      </span>
                    )}
                    <span style={{ display: "block", fontSize: 10.5, color: "var(--fg-subtle)", marginTop: 5, fontFamily: "JetBrains Mono, monospace" }}>
                      {notifRelativeTime(n.created_at)}
                    </span>
                  </span>
                  {unread && <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--accent)", marginTop: 6, flexShrink: 0 }} />}
                </button>
              );
            })
          )}
        </div>

        {hasMore && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
            <button
              type="button"
              className="btn"
              disabled={loading}
              onClick={() => fetchPage(offset, false)}
              style={{ opacity: loading ? 0.6 : 1 }}
            >
              {loading ? "Loading…" : `Load more (${items.length}/${total})`}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
