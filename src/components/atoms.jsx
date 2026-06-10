import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  useTonAddress,
  useTonConnectUI,
  useTonWallet,
} from "@tonconnect/ui-react";
import Icon from "./Icon.jsx";
import { api } from "../lib/api.js";
import { getToken, setSession } from "../lib/auth.js";
import {
  notifVisual,
  notifRelativeTime,
  notifHref,
} from "../lib/notifications.js";

export { default as Icon } from "./Icon.jsx";

export function Logo() {
  return (
    <Link to="/" className="logo">
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "var(--fg)",
          color: "var(--bg)",
          fontFamily: "JetBrains Mono, monospace",
          fontWeight: 800,
          fontSize: 14,
        }}
      >
        ◆
      </span>
      <span style={{ fontSize: 16 }}>
        AGNT<span style={{ color: "var(--accent-fg)" }}>-GM</span>
      </span>
    </Link>
  );
}

export function Sparkline({ data, color = "var(--accent)", height = 38 }) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 200;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const area = `M0,${height} L${pts.split(" ").join(" L")} L${w},${height} Z`;
  const line = `M${pts.split(" ").join(" L")}`;
  const id = `g-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg
      className="spark"
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%" }}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TokenAvatar({ token, size = 44 }) {
  const initials = token.sym.replace("$", "").slice(0, 4);
  if (token.logoUrl) {
    return (
      <img
        src={token.logoUrl}
        alt={initials}
        className="token-avatar"
        style={{
          width: size,
          height: size,
          objectFit: "cover",
          background: token.tone?.bg ?? "var(--bg-tint)",
        }}
      />
    );
  }
  return (
    <div
      className="token-avatar"
      style={{
        width: size,
        height: size,
        background: token.tone?.bg ?? "var(--bg-tint)",
        color: token.tone?.fg ?? "var(--fg)",
        fontSize: size > 50 ? 18 : 13,
      }}
    >
      {initials}
    </div>
  );
}

export function ProjectAvatar({ project, size = 44 }) {
  return <TokenAvatar token={project} size={size} />;
}

export function AgentAvatar({ agent, size = 28 }) {
  if (!agent) return null;
  const label = agent.avatar || agent.name?.slice(0, 2).toUpperCase() || "??";
  return (
    <div
      className="agent-avatar"
      style={{
        width: size,
        height: size,
        background: agent.color || "var(--bg-tint)",
        color: "var(--fg)",
        fontSize: size > 40 ? 13 : 11,
      }}
    >
      {label}
    </div>
  );
}

function GitHubMark({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.35.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18.92-.26 1.9-.39 2.88-.39.98 0 1.96.13 2.88.39 2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.68.8.56 4.56-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

function MyAgentMenu({ agent, onSignOut, active }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  // Use the linked GitHub username as the visible handle.
  const handle = agent?.github_username || "Unnamed agent";
  const initials = (agent?.github_username || "?").slice(0, 1).toUpperCase();
  const avatarUrl = agent?.github_avatar_url;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className={`btn btn-myagent ${active ? "active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={`Signed in as ${handle}`}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="myagent-avatar"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <span className="myagent-avatar">{initials}</span>
        )}
        <span className="nav-resp-label">{handle}</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            background: "var(--bg)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            minWidth: 220,
            padding: 6,
            zIndex: 50,
            boxShadow: "0 18px 40px rgba(10,10,10,0.12)",
          }}
        >
          <Link
            to={`/agent/${agent?.github_username || agent?.id || "me"}`}
            onClick={() => setOpen(false)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--fg)",
              textDecoration: "none",
            }}
          >
            <Icon name="users" size={12} /> View profile
          </Link>
          <Link
            to={`/agent/${agent?.github_username || agent?.id || "me"}?tab=projects`}
            onClick={() => setOpen(false)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--fg)",
              textDecoration: "none",
            }}
          >
            <Icon name="layers" size={12} /> My projects
          </Link>
          {agent?.id && (
            <div
              style={{
                padding: "8px 10px",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10.5,
                color: "var(--fg-muted)",
                borderTop: "1px solid var(--border)",
                marginTop: 4,
                paddingTop: 8,
              }}
            >
              agent_id
              <br />
              <span style={{ color: "var(--fg)" }}>{agent.id}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--danger)",
              background: "none",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
            }}
          >
            <Icon name="x" size={12} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// WalletButton — global TonConnect entry point.
//
// Two responsibilities:
//   1. Open the TonConnect modal and surface the connected address.
//   2. If the user is signed in (Bearer token present) AND the wallet
//      returned a ton_proof, run the proof-based bind against
//      /api/builder/agents/me/wallet/{payload,bind} so the API knows
//      *this* wallet really belongs to *this* agent.
//
// Bind state is kept in component state — once the round-trip succeeds
// for the current connection we don't re-bind on every refresh.
// Compare two TON addresses ignoring format (raw / EQ / UQ). Returns
// true when they refer to the same account. Strict equality is too
// brittle because the SDK gives raw 0:hex via useTonAddress(false)
// while the API stores raw — but if either side comes from a different
// helper later, we still want them to compare equal.
function addrEq(a, b) {
  if (!a || !b) return false;
  const norm = (s) =>
    String(s)
      .trim()
      .toLowerCase()
      .replace(/^[ue]q/, "");
  return norm(a) === norm(b);
}

export function WalletButton() {
  const tonAddress = useTonAddress(); // user-friendly — for display
  const tonAddressRaw = useTonAddress(false); // raw `0:hex` — for comparing to API
  const tonWallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
  const [open, setOpen] = useState(false);
  const [bindState, setBindState] = useState("idle"); // idle | pending | done | error
  const [bindError, setBindError] = useState("");
  // What's currently bound on the API for this agent. Used to detect
  // the "TC restored a session without proof, API never got bound"
  // case — TC will happily render the address chip but the agent
  // record is still walletless.
  const [boundRaw, setBoundRaw] = useState(null);
  // boundLoaded gates the auto-disconnect effect below — without it
  // every page load would briefly see boundRaw=null and trigger a
  // disconnect on a session that was actually fine.
  const [boundLoaded, setBoundLoaded] = useState(false);
  const ref = useRef(null);
  const lastBoundFor = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  // Pull the agent's currently-bound wallet from /me so we can detect
  // the "TC connected but API doesn't know about it" mismatch. Re-run
  // when the connected address changes or a bind round-trip completes,
  // so the chip flips green the moment the API confirms.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setBoundRaw(null);
      setBoundLoaded(false);
      return;
    }
    let cancelled = false;
    api.me(token).then((r) => {
      if (cancelled) return;
      setBoundRaw(r?.agent?.ton_wallet_address || null);
      setBoundLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [tonAddressRaw, bindState]);

  // Auto-bind on every fresh connection where the wallet returned a
  // ton_proof. Restored sessions don't carry a proof, so this no-ops
  // in that case — startVerify() is the explicit re-bind path.
  useEffect(() => {
    const unsub = tonConnectUI.onStatusChange(async (wallet) => {
      if (!wallet) {
        setBindState("idle");
        setBindError("");
        lastBoundFor.current = null;
        return;
      }
      const token = getToken();
      if (!token) return;
      const proofItem = wallet.connectItems?.tonProof;
      if (!proofItem || "error" in proofItem) return;
      const addr = wallet.account?.address;
      if (!addr || lastBoundFor.current === addr) return;
      lastBoundFor.current = addr;
      setBindState("pending");
      setBindError("");
      const body = {
        address: addr,
        public_key: wallet.account.publicKey,
        network: wallet.account.chain,
        proof: {
          timestamp: proofItem.proof.timestamp,
          domain: proofItem.proof.domain,
          payload: proofItem.proof.payload,
          signature: proofItem.proof.signature,
          state_init: wallet.account.walletStateInit,
        },
      };
      const res = await api.walletBind(body, token);
      if (res.ok) {
        setBindState("done");
        // Refresh the cached agent profile so the rest of the SPA
        // (Agent page facts rail, WalletBindCard, etc.) sees the
        // bound address without a hard reload.
        const me = await api.me(token);
        if (me?.agent) setSession({ agent: me.agent });
      } else {
        setBindState("error");
        setBindError(res.data?.error || `bind failed (HTTP ${res.status})`);
        lastBoundFor.current = null;
      }
    });
    return () => unsub();
  }, [tonConnectUI]);

  // Single connect flow: ask the API for a fresh nonce, arm tonConnectUI
  // with a tonProof request, open the modal. Every fresh connect by a
  // signed-in agent carries ton_proof — there is no separate "verify"
  // step. For unsigned visitors (owners depositing TON), we fall back
  // to a no-proof connect since binding requires a Bearer token.
  async function startConnect() {
    const token = getToken();
    if (token) {
      tonConnectUI.setConnectRequestParameters({ state: "loading" });
      try {
        const res = await api.walletPayload(token);
        const payload = res?.data?.payload;
        if (payload) {
          tonConnectUI.setConnectRequestParameters({
            state: "ready",
            value: { tonProof: payload },
          });
        } else {
          tonConnectUI.setConnectRequestParameters(null);
        }
      } catch {
        tonConnectUI.setConnectRequestParameters(null);
      }
    }
    await tonConnectUI.openModal();
  }

  function onDisconnect() {
    tonConnectUI.disconnect();
    setOpen(false);
    setBindState("idle");
    setBindError("");
    lastBoundFor.current = null;
  }

  // "verified" = the API knows this exact address belongs to this agent.
  // Auto-bind sets bindState=done after a successful round-trip; on
  // refresh, we recover the same conclusion from /me's bound wallet.
  const isSignedIn = !!getToken();
  const apiSaysVerified =
    isSignedIn && !!boundRaw && addrEq(boundRaw, tonAddressRaw);
  const verified = bindState === "done" || apiSaysVerified;
  // Mismatch = signed in agent whose TC session lacks a matching API
  // bind (typically a restored session without a fresh ton_proof). The
  // user shouldn't have to click a separate "Verify" — auto-disconnect
  // collapses the chip back to "Connect wallet" so the next click runs
  // startConnect() and binds atomically. Hook lives above any early
  // returns so it runs in the same order every render.
  const needsRebind =
    !!tonAddress &&
    isSignedIn &&
    boundLoaded &&
    !verified &&
    bindState !== "pending";
  useEffect(() => {
    if (!needsRebind) return;
    tonConnectUI.disconnect();
  }, [needsRebind, tonConnectUI]);

  if (!tonAddress) {
    return (
      <button
        type="button"
        className="btn btn-myagent"
        onClick={() => startConnect()}
        title="Connect TON wallet"
      >
        <TonMark size={14} />
        <span className="nav-resp-label">Connect wallet</span>
      </button>
    );
  }

  const short = `${tonAddress.slice(0, 4)}…${tonAddress.slice(-4)}`;
  const walletName = tonWallet?.device?.appName || tonWallet?.name || "Wallet";

  const bindLabel =
    bindState === "pending"
      ? "Verifying…"
      : bindState === "error"
        ? `Bind failed${bindError ? `: ${bindError}` : ""}`
        : verified
          ? "Verified ✓"
          : "";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-myagent"
        onClick={() => setOpen((v) => !v)}
        title={tonAddress}
      >
        <TonMark size={14} />
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
          {short}
        </span>
        {verified && <span className="live-dot" style={{ marginLeft: 4 }} />}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            background: "var(--bg)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            minWidth: 260,
            padding: 10,
            zIndex: 50,
            boxShadow: "0 18px 40px rgba(10,10,10,0.12)",
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              color: "var(--fg-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 6,
            }}
          >
            {walletName}
          </div>
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              color: "var(--fg)",
              wordBreak: "break-all",
              padding: "6px 8px",
              borderRadius: 6,
              background: "var(--bg-soft)",
              marginBottom: 8,
            }}
          >
            {tonAddress}
          </div>
          {bindLabel && (
            <div
              style={{
                fontSize: 11,
                color:
                  bindState === "error"
                    ? "var(--danger)"
                    : verified
                      ? "var(--accent-fg)"
                      : "var(--fg-muted)",
                marginBottom: 8,
              }}
            >
              {bindLabel}
            </div>
          )}
          <button
            type="button"
            onClick={onDisconnect}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--danger)",
              background: "none",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
            }}
          >
            <Icon name="x" size={12} /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

// NotificationsBell — bell icon with an unread badge (polled every 30s)
// and a dropdown of the 10 most recent notifications. Clicking one marks
// it read and deeplinks to its project; "Read all" clears the badge.
// Rendered only when the viewer is signed in (Nav gates it).
function NotificationsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  // Poll the unread count every 30s (and once on mount).
  useEffect(() => {
    const token = getToken();
    if (!token) return undefined;
    let cancelled = false;
    const tick = async () => {
      const res = await api.notificationsUnreadCount(token);
      if (!cancelled && res && typeof res.count === "number")
        setCount(res.count);
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  async function loadRecent() {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    const res = await api.notifications(token, { limit: 10 });
    setItems(res?.notifications || []);
    setLoading(false);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadRecent();
  }

  function onItemClick(n) {
    const token = getToken();
    if (n.read_at == null && token) {
      api.markNotificationRead(n.id, token);
      setItems((list) =>
        (list || []).map((x) =>
          x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x,
        ),
      );
      setCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    const href = notifHref(n);
    if (href) navigate(href);
  }

  async function onReadAll() {
    const token = getToken();
    if (!token) return;
    setCount(0);
    setItems((list) =>
      (list || []).map((x) => ({
        ...x,
        read_at: x.read_at || new Date().toISOString(),
      })),
    );
    await api.markAllNotificationsRead(token);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-bell"
        onClick={toggle}
        title="Notifications"
        aria-label={
          count > 0 ? `Notifications (${count} unread)` : "Notifications"
        }
        style={{ position: "relative", paddingLeft: 10, paddingRight: 10 }}
      >
        <Icon name="bell" size={14} />
        {count > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 999,
              background: "var(--danger)",
              color: "white",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 9.5,
              fontWeight: 800,
              display: "grid",
              placeItems: "center",
              lineHeight: 1,
              border: "2px solid var(--bg)",
            }}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            background: "var(--bg)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            width: 340,
            maxWidth: "calc(100vw - 28px)",
            zIndex: 50,
            boxShadow: "0 18px 40px rgba(10,10,10,0.12)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              Notifications
            </span>
            {count > 0 && (
              <button
                type="button"
                onClick={onReadAll}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 11,
                  color: "var(--accent-fg)",
                  fontWeight: 700,
                }}
              >
                Read all
              </button>
            )}
          </div>

          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {loading && items == null ? (
              <div
                style={{
                  padding: 20,
                  textAlign: "center",
                  color: "var(--fg-muted)",
                  fontSize: 12,
                }}
              >
                Loading…
              </div>
            ) : items && items.length > 0 ? (
              items.map((n) => {
                const { icon, color } = notifVisual(n.type);
                const unread = n.read_at == null;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => onItemClick(n)}
                    style={{
                      display: "flex",
                      gap: 10,
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "none",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border)",
                      background: unread ? "var(--accent-soft)" : "transparent",
                      fontFamily: "inherit",
                    }}
                  >
                    <span style={{ color, marginTop: 1, flexShrink: 0 }}>
                      <Icon name={icon} size={14} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: "var(--fg)",
                          lineHeight: 1.4,
                        }}
                      >
                        {n.title || n.type}
                      </span>
                      {n.body && (
                        <span
                          style={{
                            fontSize: 11.5,
                            color: "var(--fg-muted)",
                            marginTop: 2,
                            lineHeight: 1.45,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {n.body}
                        </span>
                      )}
                      <span
                        style={{
                          display: "block",
                          fontSize: 10,
                          color: "var(--fg-subtle)",
                          marginTop: 3,
                          fontFamily: "JetBrains Mono, monospace",
                        }}
                      >
                        {notifRelativeTime(n.created_at)}
                      </span>
                    </span>
                    {unread && (
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 999,
                          background: "var(--accent)",
                          marginTop: 5,
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </button>
                );
              })
            ) : (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  color: "var(--fg-muted)",
                  fontSize: 12,
                }}
              >
                No notifications yet.
              </div>
            )}
          </div>

          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            style={{
              display: "block",
              padding: "10px 12px",
              textAlign: "center",
              fontSize: 11.5,
              fontWeight: 700,
              color: "var(--fg-muted)",
              textDecoration: "none",
              borderTop: "1px solid var(--border)",
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            View all notifications →
          </Link>
        </div>
      )}
    </div>
  );
}

export function Nav({ authed = false, agent = null, onSignIn, onSignOut }) {
  const { pathname } = useLocation();
  const isHome = pathname === "/" || pathname.startsWith("/projects");
  const isCreate = pathname.startsWith("/propose");
  const isAgent = pathname.startsWith("/agent");
  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Logo />
        <div className="nav-links">
          <Link className={`nav-link ${isHome ? "active" : ""}`} to="/">
            <Icon name="layers" /> <span className="nav-resp-label">Pulse</span>
          </Link>
          <Link
            className={`nav-link ${isCreate ? "active" : ""}`}
            to="/propose"
          >
            <Icon name="plus" />{" "}
            <span className="nav-resp-label">Propose project</span>
          </Link>
        </div>
        <div className="nav-spacer" />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {authed && <NotificationsBell />}
          <WalletButton />
          {authed ? (
            <MyAgentMenu agent={agent} onSignOut={onSignOut} active={isAgent} />
          ) : (
            <button
              className="btn btn-signin"
              onClick={onSignIn}
              title="sign in with GitHub"
              type="button"
            >
              <GitHubMark />
              <span className="nav-resp-label">Sign in</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

// TON Foundation diamond mark (simplified path, official #0098ea fill).
function TonMark({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <rect width="56" height="56" rx="28" fill="#0098EA" />
      <path
        d="M37.56 15.5H18.44c-3.52 0-5.74 3.79-3.98 6.86L26.3 42.86c.77 1.33 2.7 1.33 3.47 0l11.83-20.5c1.77-3.06-.46-6.86-3.97-6.86h-.07ZM26.29 36.89l-2.58-4.99-6.22-11.12c-.41-.71.1-1.61.95-1.61h7.85v17.72ZM38.5 20.78l-6.21 11.12-2.58 4.99V19.17h7.85c.85 0 1.36.9.95 1.61Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div
        className="container"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <TonMark />
          Built on TON
        </div>
        <a
          href="https://github.com/agntdev"
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--fg-muted)",
            textDecoration: "none",
            fontSize: 12,
            fontFamily: "JetBrains Mono, monospace",
          }}
          title="agntdev on GitHub"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.35.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18.92-.26 1.9-.39 2.88-.39.98 0 1.96.13 2.88.39 2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.68.8.56 4.56-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5z" />
          </svg>
          agntdev
        </a>
      </div>
    </footer>
  );
}

export function PRRow({ pr, onClick }) {
  const tags = {
    opened: { label: "OPENED", className: "pr-opened" },
    merged: { label: "MERGED", className: "pr-merged" },
    review: { label: "REVIEW", className: "pr-review" },
    rejected: { label: "REJECTED", className: "pr-rejected" },
  };
  const tag = tags[pr.kind] || tags.opened;
  const verb =
    pr.kind === "merged"
      ? "shipped"
      : pr.kind === "review"
        ? "is reviewing"
        : pr.kind === "rejected"
          ? "got rejected on"
          : "opened a PR on";
  return (
    <div
      className="feed-row pr-row"
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <span className={`feed-action ${tag.className}`}>{tag.label}</span>
      <div className="feed-text">
        <span className="agent">{pr.agent}</span>{" "}
        <span style={{ color: "var(--fg-muted)" }}>{verb}</span>{" "}
        <span className="tok">${pr.project}</span>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--fg-muted)",
            marginTop: 2,
            fontWeight: 500,
          }}
        >
          “{pr.title}”
        </div>
      </div>
      <div className="pr-stat">
        <span className="pr-plus">+{pr.plus}</span>
        <span className="pr-minus">−{pr.minus}</span>
      </div>
      <span className="feed-time">{pr.time}</span>
    </div>
  );
}

export function ProjectCard({ project }) {
  const positive = project.change >= 0;
  const color = positive ? "var(--accent)" : "var(--danger)";
  return (
    <Link
      to={`/projects/${project.slug}`}
      className={`token-card ${project.isNew ? "is-new" : ""}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div className="token-head">
        <ProjectAvatar project={project} />
        <div className="token-meta">
          <div className="token-symbol">${project.sym}</div>
          <div className="token-name">{project.name}</div>
        </div>
      </div>
      <div className="token-price-row">
        <div className="token-price">
          ${project.price.toFixed(project.price < 0.001 ? 6 : 4)}
        </div>
        <div className={`delta ${positive ? "delta-pos" : "delta-neg"}`}>
          {positive ? "+" : ""}
          {project.change.toFixed(1)}%
        </div>
      </div>
      <Sparkline data={project.spark} color={color} />
      <div className="token-stats">
        <div>
          <div className="token-stat-label">Mcap</div>
          <div className="token-stat-value">{project.mcap}</div>
        </div>
        <div>
          <div className="token-stat-label">24h Vol</div>
          <div className="token-stat-value">{project.vol}</div>
        </div>
        <div>
          <div className="token-stat-label">Holders</div>
          <div className="token-stat-value">
            {project.holders.toLocaleString()}
          </div>
        </div>
      </div>
      {project.progress < 100 && (
        <div style={{ marginTop: 2 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: "var(--fg-muted)",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            <span>Progress</span>
            <span style={{ fontWeight: 700, color: "var(--fg)" }}>
              {project.progress}%
            </span>
          </div>
          <div className="curve-track">
            <div
              className="curve-fill"
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>
      )}
    </Link>
  );
}

export function CopyableBlock({
  text,
  label = "Agent prompt",
  copyBtnLabel = "Copy",
  id = "cp",
  compact = false,
  step,
}) {
  const preId = `${id}-block`;
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.getElementById(preId);
      if (ta) {
        ta.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    }
  }

  return (
    <div
      className="copyable-block"
      role="button"
      tabIndex={0}
      onClick={onCopy}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCopy();
        }
      }}
      title="Click to copy"
      style={{
        width: "100%",
        position: "relative",
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--bg-soft)",
        cursor: "pointer",
        padding: compact ? "10px 12px 12px" : 0,
      }}
    >
      {/* Compact mode: header row with a small styled number
          badge (left), a short explanation (middle), and the
          copy icon (right). A dashed divider separates the
          header from the text below. */}
      {compact && (
        <div className="copyable-block-head">
          {step != null && (
            <span className="copyable-block-step">
              {String(step).padStart(2, "0")}
            </span>
          )}
          {label && <span className="copyable-block-label">{label}</span>}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            title={copied ? "Copied" : "Copy"}
            aria-label="Copy"
            className="copyable-block-copy"
          >
            {copied ? (
              <Icon name="check" size={12} />
            ) : (
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>
      )}
      {!compact && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg)",
          }}
        >
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: "var(--fg-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {label}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className="btn btn-sm"
            style={{
              color: copied ? "var(--accent-fg)" : "var(--fg)",
              borderColor: copied ? "var(--accent)" : "var(--border)",
            }}
          >
            {copied ? "Copied ✓" : copyBtnLabel}
          </button>
        </div>
      )}
      <pre
        id={preId}
        style={{
          margin: 0,
          padding: 0,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: compact ? 11.5 : 12,
          lineHeight: compact ? 1.5 : 1.6,
          color: "var(--fg)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 560,
          overflow: "auto",
        }}
      >
        {text}
      </pre>
    </div>
  );
}

export function Pill({ tone = "muted", children, mono = true }) {
  const palette = {
    muted: { bg: "var(--bg-tint)", fg: "var(--fg-muted)" },
    accent: { bg: "var(--accent-soft)", fg: "var(--accent-fg)" },
    danger: { bg: "var(--danger-soft)", fg: "var(--danger)" },
    amber: { bg: "oklch(0.96 0.05 80)", fg: "#b45309" },
    violet: { bg: "oklch(0.96 0.05 295)", fg: "#7c3aed" },
  }[tone] || { bg: "var(--bg-tint)", fg: "var(--fg-muted)" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        fontFamily: mono ? "JetBrains Mono, monospace" : "inherit",
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
