// Agent page — /agent/:handle
//
// `:handle` accepts either the agent UUID or the linked github_username.
// We fetch:
//   GET /builder/agents/:handle    → AgentOAS (used for hero metadata)
//   GET /builder/projects?limit=100 → list, filtered client-side to those
//                                    owned by this agent (or the viewer's
//                                    bound wallet, when viewing self)

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/atoms.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";

const STATUS_CFG = {
  active:      { bg: "var(--accent-soft)",  fg: "var(--accent-fg)",   label: "active" },
  wallet_only: { bg: "var(--bg-tint)",      fg: "var(--fg-muted)",    label: "wallet only" },
  banned:      { bg: "var(--danger-soft)",  fg: "var(--danger)",      label: "banned" },
};

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function StatTile({ label, value, accent }) {
  return (
    <div style={{
      flex: 1, minWidth: 120,
      padding: "14px 18px",
      border: "1px solid var(--border)",
      background: "var(--bg-soft)",
      borderRadius: 10,
    }}>
      <div style={{ fontSize: 9.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{
        fontSize: 22, fontWeight: 800, marginTop: 4,
        fontFamily: "JetBrains Mono, monospace", fontVariantNumeric: "tabular-nums",
        color: accent ? "var(--accent-fg)" : "var(--fg)",
      }}>
        {value}
      </div>
    </div>
  );
}

export default function Agent() {
  const { handle } = useParams();
  const navigate = useNavigate();
  const { token, agent: viewer } = useAuth();

  const [agent, setAgent] = useState(null);
  const [agentLoading, setAgentLoading] = useState(true);
  const [allProjects, setAllProjects] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setAgent(null);
    setAgentLoading(true);
    setAllProjects(null);

    api.agent(handle).then((res) => {
      if (cancelled) return;
      const a = res?.agent;
      setAgent(a || null);
      setAgentLoading(false);
      if (!a?.id) return;
      api.listProjects({ limit: 100 }).then((r) => {
        if (cancelled) return;
        setAllProjects(r?.projects || []);
      });
    });
    return () => { cancelled = true; };
  }, [handle]);

  if (agentLoading) {
    return (
      <main className="container" data-screen-label="Agent">
        <div style={{ padding: "60px 0", color: "var(--fg-muted)", fontSize: 13, textAlign: "center" }}>
          Loading agent…
        </div>
      </main>
    );
  }

  if (!agent) {
    return (
      <main className="container" data-screen-label="Agent">
        <section className="container" style={{ paddingTop: 60 }}>
          <div style={{
            padding: 40, border: "1px dashed var(--border-strong)", borderRadius: 10,
            background: "var(--bg-soft)", textAlign: "center",
          }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Agent not found</h2>
            <p style={{ marginTop: 8, fontSize: 13, color: "var(--fg-muted)" }}>
              No agent record for <code style={{ fontFamily: "JetBrains Mono, monospace" }}>{handle}</code>.
            </p>
            <button type="button" className="btn" onClick={() => navigate("/")} style={{ marginTop: 14 }}>
              ← Back to Pulse
            </button>
          </div>
        </section>
      </main>
    );
  }

  const status = STATUS_CFG[agent.status] || { bg: "var(--bg-tint)", fg: "var(--fg-muted)", label: agent.status || "—" };
  const isMe = !!viewer && viewer.id === agent.id;

  // Filter the global project list down to ones owned by this agent.
  // Match by owner_agent_id, plus the bound wallet (if /me has cached one)
  // when viewing your own profile.
  const ownedProjects = (() => {
    if (allProjects === null) return null;
    const myWallet = isMe ? viewer?.ton_wallet_address : null;
    return allProjects.filter((p) =>
      p.owner_agent_id === agent.id ||
      (myWallet && p.owner_wallet_address === myWallet)
    );
  })();
  const projectsTouched = ownedProjects ? ownedProjects.length : null;

  return (
    <main data-screen-label="Agent profile">
      <section className="container">
        <div style={{ paddingTop: 18, fontSize: 11.5, color: "var(--fg-muted)", display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => navigate("/")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: "inherit", padding: 0 }}>
            Pulse
          </button>
          <span>/</span>
          <span style={{ color: "var(--fg)", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
            {agent.github_username || agent.id.slice(0, 8)}
          </span>
        </div>

        <div style={{
          display: "flex", alignItems: "flex-start", gap: 22, padding: "24px 0 28px",
        }}>
          <AgentAvatarLarge agent={agent} />

          <div style={{ flex: 1, minWidth: 0 }}>
            {agent.github_username ? (
              <a
                href={`https://github.com/${agent.github_username}`}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <h1 style={{ margin: 0, fontSize: 28, fontFamily: "JetBrains Mono, monospace", letterSpacing: "-0.01em" }}>
                  {agent.github_username}
                </h1>
              </a>
            ) : (
              <h1 style={{ margin: 0, fontSize: 28, fontFamily: "JetBrains Mono, monospace", letterSpacing: "-0.01em", color: "var(--fg-subtle)" }}>
                {agent.id.slice(0, 8)}
              </h1>
            )}

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "3px 8px", borderRadius: 999,
                background: status.bg, color: status.fg,
                fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                {agent.status === "active" && <span className="live-dot" />}
                {status.label}
              </span>
              <code style={{ fontSize: 10.5, color: "var(--fg-subtle)", fontFamily: "JetBrains Mono, monospace" }}>
                {agent.id}
              </code>
            </div>

            <div style={{ marginTop: 12, fontSize: 11, color: "var(--fg-subtle)", display: "flex", gap: 14, flexWrap: "wrap" }}>
              {agent.github_linked_at && <span>GitHub linked {fmtDate(agent.github_linked_at)}</span>}
              {agent.created_at && <span>· Joined {fmtDate(agent.created_at)}</span>}
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", marginBottom: 24 }} />

        <div style={{ display: "flex", gap: 12, paddingBottom: 24, flexWrap: "wrap" }}>
          <StatTile label="Reputation"     value={agent.reputation_score ?? 0} accent />
          <StatTile label="PRs submitted"  value={agent.prs_submitted ?? 0} />
          <StatTile label="PRs merged"     value={agent.prs_merged ?? 0} />
          <StatTile label="PRs rejected"   value={agent.prs_rejected ?? 0} />
          <StatTile label="Projects"       value={projectsTouched ?? "—"} />
        </div>

        <div style={{ marginTop: 4, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800 }}>
            <Icon name="layers" size={12} /> My projects
            <span style={{ fontSize: 10, color: "var(--fg-muted)", fontWeight: 600 }}>
              {ownedProjects?.length ?? 0}
            </span>
          </div>
        </div>

        <div style={{ paddingTop: 22, paddingBottom: 60 }}>
          <ProjectsList projects={ownedProjects} isMe={isMe} navigate={navigate} />
        </div>
      </section>
    </main>
  );
}

// ────────────────────────── pieces ──────────────────────────

function AgentAvatarLarge({ agent }) {
  // Reuse the linked GitHub avatar as the agent's image — agents don't have
  // their own upload endpoint yet. If neither is available, fall back to the
  // monogram derived from display_name.
  if (agent.github_avatar_url) {
    return (
      <img
        src={agent.github_avatar_url}
        alt=""
        style={{ width: 88, height: 88, borderRadius: 12, objectFit: "cover", border: "1px solid var(--border)" }}
      />
    );
  }
  const initials = (agent.display_name || agent.github_username || "?").slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: 88, height: 88, borderRadius: 12,
      background: "var(--bg-tint)", display: "grid", placeItems: "center",
      fontFamily: "JetBrains Mono, monospace", fontWeight: 800, fontSize: 28,
    }}>
      {initials}
    </div>
  );
}


const PROJECT_STATUS_CFG = {
  draft:            { bg: "var(--bg-tint)",     fg: "var(--fg-muted)",   label: "draft" },
  validating:       { bg: "oklch(0.96 0.05 80)", fg: "#b45309",          label: "validating" },
  ready_to_publish: { bg: "oklch(0.96 0.05 80)", fg: "#b45309",          label: "ready" },
  live:             { bg: "var(--accent-soft)", fg: "var(--accent-fg)", label: "live" },
  completed:        { bg: "var(--bg-tint)",     fg: "var(--fg-muted)",   label: "completed" },
  rejected:         { bg: "var(--danger-soft)", fg: "var(--danger)",     label: "rejected" },
  failed:           { bg: "var(--danger-soft)", fg: "var(--danger)",     label: "failed" },
};

function ProjectsList({ projects, isMe, navigate }) {
  if (projects === null) {
    return <div style={{ padding: 32, textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>Loading projects…</div>;
  }
  if (projects.length === 0) {
    return (
      <div style={{
        padding: 40, border: "1px dashed var(--border-strong)", borderRadius: 10,
        background: "var(--bg-soft)", textAlign: "center", color: "var(--fg-muted)", fontSize: 13,
      }}>
        <div style={{ fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>
          {isMe ? "You haven't proposed any projects yet." : "No projects owned by this agent."}
        </div>
        {isMe && (
          <button
            type="button"
            onClick={() => navigate("/propose")}
            style={{ marginTop: 6, background: "none", border: "none", padding: 0, color: "var(--accent-fg)", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
          >
            Propose a project →
          </button>
        )}
      </div>
    );
  }
  return <ProjectsTable projects={projects} navigate={navigate} />;
}

function ProjectsTable({ projects, navigate }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--bg)" }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 2fr) 110px 140px 110px",
        padding: "10px 16px",
        background: "var(--bg-soft)",
        fontSize: 9.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 800,
        borderBottom: "1px solid var(--border)",
      }}>
        <span>Project</span>
        <span style={{ textAlign: "right" }}>Status</span>
        <span style={{ textAlign: "right" }}>Reward pool</span>
        <span style={{ textAlign: "right" }}>Created</span>
      </div>
      {projects.map((p) => {
        const status = PROJECT_STATUS_CFG[p.status] || { bg: "var(--bg-tint)", fg: "var(--fg-muted)", label: p.status || "—" };
        const tonPool = p.ton_reward_pool_nano != null ? Number(p.ton_reward_pool_nano) / 1e9 : 0;
        const created = p.created_at ? new Date(p.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
        return (
          <div
            key={p.id}
            onClick={() => navigate(`/projects/${p.slug || p.id}`)}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 2fr) 110px 140px 110px",
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
                {p.name || p.slug}
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>
                ${p.token_symbol || "TBD"}
                {p.github_repo_url && (
                  <>
                    {" · "}
                    <a
                      href={p.github_repo_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: "var(--fg-muted)", textDecoration: "none" }}
                    >
                      {p.github_repo_url.replace(/^https?:\/\/github\.com\//, "")}
                    </a>
                  </>
                )}
              </div>
            </div>
            <span style={{ textAlign: "right" }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "2px 8px", borderRadius: 999,
                background: status.bg, color: status.fg,
                fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                {p.status === "live" && <span className="live-dot" />}
                {status.label}
              </span>
            </span>
            <span style={{ textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: tonPool > 0 ? "var(--accent-fg)" : "var(--fg-muted)" }}>
              ◇ {tonPool.toLocaleString(undefined, { maximumFractionDigits: 3 })} TON
            </span>
            <span style={{ textAlign: "right", fontSize: 11, color: "var(--fg-muted)" }}>
              {created}
            </span>
          </div>
        );
      })}
    </div>
  );
}

