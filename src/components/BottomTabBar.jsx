import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTonAddress } from "@tonconnect/ui-react";
import Icon from "./Icon.jsx";
import { getToken } from "../lib/auth.js";
import { useEffect, useState } from "react";
import { hapticClick, hapticSelect } from "../lib/tma-native.js";

/**
 * Bottom tab bar — the primary navigation surface on phones / TMA.
 *
 * Layout: 4 tabs (Pulse, Propose, Notifs, Me) with the + Propose tab
 * visually raised as a FAB so the primary action stands out. Hidden on
 * desktop ≥640px AND outside Telegram, where the top Nav still owns
 * navigation.
 *
 * Active tab matches the current route. The Propose tab always navigates
 * to /propose — it never opens in place.
 *
 * Notifs and Me are gated on auth state; the buttons still render for
 * signed-out users but route to /auth (sign in). This avoids a layout
 * shift when the user signs in.
 */
export default function BottomTabBar({ authed, agent }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const _tonAddress = useTonAddress();
  const [unread, setUnread] = useState(0);

  // Poll the unread notification count for the badge. Skipped when
  // signed out (api.notificationsUnreadCount would 401). TMA users
  // get the same poll, but the bell in the top nav is hidden on phones
  // to avoid duplication, so this is the only place the count renders.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setUnread(0);
      return undefined;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/notifications/unread-count", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data?.count === "number") setUnread(data.count);
      } catch {
        // Network blip — try again on the next interval.
      }
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pathname]);

  const meHandle = agent?.github_username || agent?.id || "me";
  const mePath = authed ? `/agent/${meHandle}` : "/auth";

  const tabs = [
    {
      key: "pulse",
      to: "/",
      label: "AGNT",
      icon: "layers",
      active: pathname === "/" || pathname.startsWith("/projects"),
    },
    {
      key: "propose",
      to: "/propose",
      label: "Propose",
      icon: "plus",
      primary: true,
      active: pathname.startsWith("/propose"),
    },
    {
      key: "notifs",
      to: authed ? "/notifications" : "/auth",
      label: "Notifs",
      icon: "bell",
      badge: unread,
      active: pathname.startsWith("/notifications"),
    },
    {
      key: "me",
      to: mePath,
      label: "Me",
      icon: "user",
      active: pathname.startsWith("/agent"),
    },
  ];

  return (
    <nav className="bottom-tabbar" aria-label="Primary">
      <div className="bottom-tabbar-inner">
        {tabs.map((t) => {
          const className = [
            "bottom-tab",
            t.active ? "active" : "",
            t.primary ? "primary" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const content = (
            <>
              <span className="bottom-tab-icon">
                <Icon name={t.icon} size={t.primary ? 18 : 16} />
                {t.badge > 0 && (
                  <span className="bottom-tab-badge">
                    {t.badge > 99 ? "99+" : t.badge}
                  </span>
                )}
              </span>
              <span className="bottom-tab-label">{t.label}</span>
            </>
          );

          // The primary tab is a div, not a Link, because we don't want
          // the active-route styling to override the FAB look.
          if (t.primary) {
            return (
              <button
                key={t.key}
                type="button"
                className={className}
                onClick={() => { hapticClick(); navigate(t.to); }}
                aria-label={t.label}
              >
                {content}
              </button>
            );
          }
          return (
            <Link
              key={t.key}
              to={t.to}
              onClick={() => hapticSelect()}
              className={className}
              aria-label={t.label}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
