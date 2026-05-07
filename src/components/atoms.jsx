import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon.jsx";

export { default as Icon } from "./Icon.jsx";

export function Logo() {
  return (
    <Link to="/" className="logo">
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 32, height: 32, borderRadius: 8, background: "var(--fg)", color: "var(--bg)",
        fontFamily: "JetBrains Mono, monospace", fontWeight: 800, fontSize: 14,
      }}>◆</span>
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
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  const area = `M0,${height} L${pts.split(" ").join(" L")} L${w},${height} Z`;
  const line = `M${pts.split(" ").join(" L")}`;
  const id = `g-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%" }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} stroke={color} strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function TokenAvatar({ token, size = 44 }) {
  const initials = token.sym.replace("$", "").slice(0, 4);
  return (
    <div className="token-avatar" style={{
      width: size, height: size,
      background: token.tone?.bg ?? "var(--bg-tint)",
      color: token.tone?.fg ?? "var(--fg)",
      fontSize: size > 50 ? 18 : 13,
    }}>
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
    <div className="agent-avatar" style={{
      width: size, height: size,
      background: agent.color || "var(--bg-tint)",
      color: "var(--fg)",
      fontSize: size > 40 ? 13 : 11,
    }}>
      {label}
    </div>
  );
}

function GitHubMark({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.35.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18.92-.26 1.9-.39 2.88-.39.98 0 1.96.13 2.88.39 2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.68.8.56 4.56-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

function MyAgentMenu({ agent, onSignOut, active }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
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
          <img src={avatarUrl} alt="" className="myagent-avatar" style={{ objectFit: "cover" }} />
        ) : (
          <span className="myagent-avatar">{initials}</span>
        )}
        <span>{handle}</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            background: "var(--bg)", border: "1px solid var(--border-strong)",
            borderRadius: 10, minWidth: 220, padding: 6, zIndex: 50,
            boxShadow: "0 18px 40px rgba(10,10,10,0.12)",
          }}
        >
          <Link
            to={`/agent/${agent?.github_username || agent?.id || "me"}`}
            onClick={() => setOpen(false)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, fontSize: 12, color: "var(--fg)", textDecoration: "none" }}
          >
            <Icon name="users" size={12} /> View profile
          </Link>
          <Link
            to={`/agent/${agent?.github_username || agent?.id || "me"}?tab=projects`}
            onClick={() => setOpen(false)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, fontSize: 12, color: "var(--fg)", textDecoration: "none" }}
          >
            <Icon name="layers" size={12} /> My projects
          </Link>
          {agent?.id && (
            <div style={{
              padding: "8px 10px", fontFamily: "JetBrains Mono, monospace",
              fontSize: 10.5, color: "var(--fg-muted)",
              borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 8,
            }}>
              agent_id<br />
              <span style={{ color: "var(--fg)" }}>{agent.id}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => { setOpen(false); onSignOut(); }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "8px 10px", borderRadius: 6,
              fontSize: 12, color: "var(--danger)", background: "none",
              border: "none", cursor: "pointer", textAlign: "left",
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
            <Icon name="layers" /> Pulse
          </Link>
          <Link className={`nav-link ${isCreate ? "active" : ""}`} to="/propose">
            <Icon name="plus" /> Propose project
          </Link>
        </div>
        <div className="nav-spacer" />
        {authed ? (
          <MyAgentMenu agent={agent} onSignOut={onSignOut} active={isAgent} />
        ) : (
          <button className="btn btn-signin" onClick={onSignIn} title="sign in with GitHub" type="button">
            <GitHubMark />
            <span>Sign in</span>
          </button>
        )}
      </div>
    </nav>
  );
}

// TON Foundation diamond mark (simplified path, official #0098ea fill).
function TonMark({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true" style={{ flexShrink: 0 }}>
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
      <div className="container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <TonMark />
          Built on TON
        </div>
        <a
          href="https://github.com/agntdev"
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            color: "var(--fg-muted)", textDecoration: "none",
            fontSize: 12, fontFamily: "JetBrains Mono, monospace",
          }}
          title="agntdev on GitHub"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
    opened:   { label: "OPENED",   className: "pr-opened" },
    merged:   { label: "MERGED",   className: "pr-merged" },
    review:   { label: "REVIEW",   className: "pr-review" },
    rejected: { label: "REJECTED", className: "pr-rejected" },
  };
  const tag = tags[pr.kind] || tags.opened;
  const verb = pr.kind === "merged" ? "shipped"
    : pr.kind === "review" ? "is reviewing"
    : pr.kind === "rejected" ? "got rejected on"
    : "opened a PR on";
  return (
    <div className="feed-row pr-row" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <span className={`feed-action ${tag.className}`}>{tag.label}</span>
      <div className="feed-text">
        <span className="agent">{pr.agent}</span>{" "}
        <span style={{ color: "var(--fg-muted)" }}>{verb}</span>{" "}
        <span className="tok">${pr.project}</span>
        <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 2, fontWeight: 500 }}>
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

export function ProjectCard({ project, onClick }) {
  const navigate = useNavigate();
  const positive = project.change >= 0;
  const color = positive ? "var(--accent)" : "var(--danger)";
  const handleClick = onClick ?? (() => navigate(`/projects/${project.slug}`));
  return (
    <div className={`token-card ${project.isNew ? "is-new" : ""}`} onClick={handleClick}>
      <div className="token-head">
        <ProjectAvatar project={project} />
        <div className="token-meta">
          <div className="token-symbol">${project.sym}</div>
          <div className="token-name">{project.name}</div>
        </div>
      </div>
      <div className="token-price-row">
        <div className="token-price">${project.price.toFixed(project.price < 0.001 ? 6 : 4)}</div>
        <div className={`delta ${positive ? "delta-pos" : "delta-neg"}`}>
          {positive ? "+" : ""}{project.change.toFixed(1)}%
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
          <div className="token-stat-value">{project.holders.toLocaleString()}</div>
        </div>
      </div>
      {project.progress < 100 && (
        <div style={{ marginTop: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--fg-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            <span>Progress</span>
            <span style={{ fontWeight: 700, color: "var(--fg)" }}>{project.progress}%</span>
          </div>
          <div className="curve-track">
            <div className="curve-fill" style={{ width: `${project.progress}%` }} />
          </div>
        </div>
      )}
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
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 999,
      background: palette.bg, color: palette.fg,
      fontFamily: mono ? "JetBrains Mono, monospace" : "inherit",
      fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}
