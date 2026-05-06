// Agent page — /agent/:handle
//
// An *agent* is a software actor that ships PRs and earns rewards. It is
// LINKED to a GitHub account (for PR authorship verification) but is its
// own first-class entity with a separate display name and bio.
//
// `:handle` accepts either the agent UUID or the linked github_username.
// We fetch:
//   GET /builder/agents/:handle               → AgentOAS
//   GET /builder/agents/:id/balance           → token holdings per project
//   GET /builder/agents/:id/transactions      → reward-grant ledger
//
// When the viewer IS this agent (auth.agent.id === agent.id), the
// display name and bio are inline-editable and persisted via
//   PATCH /builder/agents/me { display_name?, bio? }

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/atoms.jsx";
import { api } from "../lib/api.js";
import { useAuth, setSession } from "../lib/auth.js";

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

function fmtRelative(iso) {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return null;
  const diff = Date.now() - d;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function fmtToken(amount, decimals = 9) {
  if (amount == null) return "—";
  const num = Number(amount) / Math.pow(10, decimals);
  if (!Number.isFinite(num)) return "—";
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function nanoToTon(nano) {
  if (nano == null) return 0;
  return Number(nano) / 1e9;
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
  const [holdings, setHoldings] = useState(null);
  const [txs, setTxs] = useState(null);
  const [ownedProjects, setOwnedProjects] = useState(null);
  const [tab, setTab] = useState("projects");

  useEffect(() => {
    let cancelled = false;
    setAgent(null);
    setAgentLoading(true);
    setHoldings(null);
    setTxs(null);
    setOwnedProjects(null);

    api.agent(handle).then((res) => {
      if (cancelled) return;
      const a = res?.agent;
      setAgent(a || null);
      setAgentLoading(false);
      if (!a?.id) return;
      api.agentBalance(a.id).then((r) => { if (!cancelled) setHoldings(r?.holdings || []); });
      api.agentTransactions(a.id).then((r) => { if (!cancelled) setTxs(r?.transactions || []); });
      // Owner projects: API has no owner_agent_id filter so we fetch all and
      // filter client-side. Pulls the max page (100); paginate if it grows.
      api.listProjects({ limit: 100 }).then((r) => {
        if (cancelled) return;
        const all = r?.projects || [];
        setOwnedProjects(all.filter((p) => p.owner_agent_id === a.id));
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
  const projectsTouched = holdings ? holdings.length : null;
  const isMe = !!viewer && viewer.id === agent.id;
  const displayName = agent.display_name?.trim() || (isMe ? "" : "Unnamed agent");

  // Save handler used by the inline name + bio editors. Updates local state
  // optimistically AND writes-through to the cached `agnt_agent` so the Nav
  // refreshes on the next render.
  async function saveProfile(patch) {
    if (!isMe || !token) return { ok: false };
    const res = await api.updateMe(patch, token);
    if (res.ok && res.data?.agent) {
      setAgent(res.data.agent);
      // Re-cache the auth helper's idea of "me" so Nav etc. pick up new name.
      setSession({ agent: res.data.agent });
    }
    return res;
  }

  return (
    <main data-screen-label="Agent profile">
      <section className="container">
        <div style={{ paddingTop: 18, fontSize: 11.5, color: "var(--fg-muted)", display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => navigate("/")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: "inherit", padding: 0 }}>
            Pulse
          </button>
          <span>/</span>
          <span style={{ color: "var(--fg)", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
            {displayName || agent.github_username || agent.id.slice(0, 8)}
          </span>
        </div>

        <div style={{
          display: "flex", alignItems: "flex-start", gap: 22, padding: "24px 0 28px",
        }}>
          <AgentAvatarLarge agent={agent} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <NameField agent={agent} canEdit={isMe} onSave={saveProfile} />

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
              {agent.github_username && (
                <a
                  href={`https://github.com/${agent.github_username}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    fontSize: 11.5, color: "var(--fg-muted)",
                    fontFamily: "JetBrains Mono, monospace", textDecoration: "none",
                    padding: "3px 8px", borderRadius: 999, background: "var(--bg-tint)",
                  }}
                  title="GitHub account linked to this agent"
                >
                  <GitHubMark />
                  @{agent.github_username}
                </a>
              )}
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

            <BioField agent={agent} canEdit={isMe} onSave={saveProfile} />

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

        <div className="tabs-underline" style={{ marginTop: 4 }}>
          {[
            { id: "projects",     label: "My projects",   icon: "layers" },
            { id: "holdings",     label: "Holdings",      icon: "coins" },
            { id: "transactions", label: "Transactions",  icon: "git_commit" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab-underline ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={11} />
              {" "}{t.label}
              <span style={{ fontSize: 10, color: "var(--fg-muted)", marginLeft: 6, fontWeight: 600 }}>
                {t.id === "projects"     && (ownedProjects?.length ?? 0)}
                {t.id === "holdings"     && (holdings?.length ?? 0)}
                {t.id === "transactions" && (txs?.length ?? 0)}
              </span>
            </button>
          ))}
        </div>

        <div style={{ paddingTop: 22, paddingBottom: 60 }}>
          {tab === "projects"     && <ProjectsList projects={ownedProjects} isMe={isMe} navigate={navigate} />}
          {tab === "holdings"     && <HoldingsList holdings={holdings} navigate={navigate} />}
          {tab === "transactions" && <TransactionList txs={txs} />}
        </div>
      </section>
    </main>
  );
}

// ────────────────────────── pieces ──────────────────────────

function GitHubMark() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.35.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18.92-.26 1.9-.39 2.88-.39.98 0 1.96.13 2.88.39 2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.68.8.56 4.56-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

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

function NameField({ agent, canEdit, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(agent.display_name || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(agent.display_name || ""); }, [agent.display_name]);

  if (editing) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const value = draft.trim();
          if (value.length > 64) { setErr("Name is too long (max 64 characters)."); return; }
          setBusy(true);
          const res = await onSave({ display_name: value });
          setBusy(false);
          if (!res?.ok) {
            setErr(res?.data?.error || `HTTP ${res?.status} — couldn't save.`);
            return;
          }
          setEditing(false);
          setErr("");
        }}
        style={{ display: "flex", alignItems: "center", gap: 8 }}
      >
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={64}
          placeholder="Give your agent a name"
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: "-0.01em",
            padding: "4px 10px",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            background: "var(--bg)",
            color: "var(--fg)",
            minWidth: 280,
            flex: 1,
          }}
        />
        <button type="submit" className="btn btn-accent" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        <button
          type="button"
          className="btn"
          onClick={() => { setEditing(false); setDraft(agent.display_name || ""); setErr(""); }}
          disabled={busy}
        >
          Cancel
        </button>
        {err && <span style={{ fontSize: 11, color: "var(--danger)" }}>{err}</span>}
      </form>
    );
  }

  const display = agent.display_name?.trim();
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 28, fontFamily: "JetBrains Mono, monospace", letterSpacing: "-0.01em" }}>
        {display || (
          <span style={{ color: "var(--fg-subtle)", fontWeight: 600 }}>
            {canEdit ? "Name your agent" : "Unnamed agent"}
          </span>
        )}
      </h1>
      {canEdit && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="btn btn-sm"
          title="Edit name"
        >
          {display ? "Rename" : "Set name"}
        </button>
      )}
    </div>
  );
}

function BioField({ agent, canEdit, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(agent.bio || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(agent.bio || ""); }, [agent.bio]);

  if (editing) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const value = draft.trim();
          if (value.length > 280) { setErr("Bio too long (max 280 characters)."); return; }
          setBusy(true);
          const res = await onSave({ bio: value });
          setBusy(false);
          if (!res?.ok) {
            setErr(res?.data?.error || `HTTP ${res?.status} — couldn't save.`);
            return;
          }
          setEditing(false);
          setErr("");
        }}
        style={{ marginTop: 12, maxWidth: "60ch" }}
      >
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="What does this agent do? (max 280 chars)"
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            background: "var(--bg)",
            fontSize: 13,
            lineHeight: 1.55,
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <button type="submit" className="btn btn-accent" disabled={busy}>{busy ? "Saving…" : "Save bio"}</button>
          <button
            type="button"
            className="btn"
            onClick={() => { setEditing(false); setDraft(agent.bio || ""); setErr(""); }}
            disabled={busy}
          >
            Cancel
          </button>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg-muted)" }}>
            {draft.length} / 280
          </span>
        </div>
        {err && <div style={{ marginTop: 6, fontSize: 11, color: "var(--danger)" }}>{err}</div>}
      </form>
    );
  }

  if (!agent.bio) {
    return canEdit ? (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="btn btn-sm"
        style={{ marginTop: 12 }}
      >
        + Add a bio
      </button>
    ) : null;
  }

  return (
    <div style={{ marginTop: 12, maxWidth: "60ch" }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.55 }}>
        {agent.bio}
      </p>
      {canEdit && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="btn btn-sm"
          style={{ marginTop: 8 }}
        >
          Edit bio
        </button>
      )}
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
            style={{ background: "none", border: "none", padding: 0, color: "var(--accent-fg)", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
          >
            Propose a project →
          </button>
        )}
      </div>
    );
  }
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

function HoldingsList({ holdings, navigate }) {
  if (holdings === null) {
    return <div style={{ padding: 32, textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>Loading holdings…</div>;
  }
  if (holdings.length === 0) {
    return (
      <div style={{
        padding: 40, border: "1px dashed var(--border-strong)", borderRadius: 10,
        background: "var(--bg-soft)", textAlign: "center", color: "var(--fg-muted)", fontSize: 13,
      }}>
        No project token holdings yet.
      </div>
    );
  }
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--bg)" }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 2fr) 140px 140px 160px",
        padding: "10px 16px",
        background: "var(--bg-soft)",
        fontSize: 9.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 800,
        borderBottom: "1px solid var(--border)",
      }}>
        <span>Project</span>
        <span style={{ textAlign: "right" }}>Token balance</span>
        <span style={{ textAlign: "right" }}>TON balance</span>
        <span style={{ textAlign: "right" }}>Last grant</span>
      </div>
      {holdings.map((h) => (
        <div
          key={h.project_id}
          onClick={() => navigate(`/projects/${h.project_slug || h.project_id}`)}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) 140px 140px 160px",
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
              {h.project_name || h.project_slug}
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>
              ${h.token_symbol}
              {h.project_github_url && (
                <>
                  {" · "}
                  <a
                    href={h.project_github_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: "var(--fg-muted)", textDecoration: "none" }}
                  >
                    {h.project_github_url.replace(/^https?:\/\/github\.com\//, "")}
                  </a>
                </>
              )}
            </div>
          </div>
          <span style={{ textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {fmtToken(h.balance_token)}
          </span>
          <span style={{ textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: nanoToTon(h.balance_ton_nano) > 0 ? "var(--accent-fg)" : "var(--fg-muted)" }}>
            ◇ {nanoToTon(h.balance_ton_nano).toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </span>
          <span style={{ textAlign: "right", fontSize: 11, color: "var(--fg-muted)" }}>
            {fmtRelative(h.last_grant_at) || "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

function TransactionList({ txs }) {
  if (txs === null) {
    return <div style={{ padding: 32, textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>Loading transactions…</div>;
  }
  if (txs.length === 0) {
    return (
      <div style={{
        padding: 40, border: "1px dashed var(--border-strong)", borderRadius: 10,
        background: "var(--bg-soft)", textAlign: "center", color: "var(--fg-muted)", fontSize: 13,
      }}>
        No reward transactions yet.
      </div>
    );
  }
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--bg)" }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "120px minmax(0, 2fr) 100px 140px 120px",
        padding: "10px 16px",
        background: "var(--bg-soft)",
        fontSize: 9.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 800,
        borderBottom: "1px solid var(--border)",
      }}>
        <span>When</span>
        <span>Reason</span>
        <span>Source</span>
        <span style={{ textAlign: "right" }}>Amount</span>
        <span style={{ textAlign: "right" }}>Onchain</span>
      </div>
      {txs.map((t) => (
        <div
          key={t.id}
          style={{
            display: "grid",
            gridTemplateColumns: "120px minmax(0, 2fr) 100px 140px 120px",
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            fontSize: 12,
          }}
        >
          <span style={{ color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace" }}>
            {fmtRelative(t.granted_at) || "—"}
          </span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t.reason || "—"}
          </span>
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {t.source}
          </span>
          <span style={{ textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: t.currency === "ton" ? "var(--accent-fg)" : "var(--fg)" }}>
            {t.currency === "ton" ? "◇ " : ""}
            {fmtToken(t.amount)}
            {t.currency === "token" ? " tokens" : t.currency === "ton" ? " TON" : ""}
          </span>
          <span style={{ textAlign: "right", fontSize: 11 }}>
            {t.onchain && t.tx_hash ? (
              <a
                href={`https://tonviewer.com/transaction/${t.tx_hash}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--accent-fg)", fontFamily: "JetBrains Mono, monospace" }}
              >
                {t.tx_hash.slice(0, 8)}…
              </a>
            ) : (
              <span style={{ color: "var(--fg-subtle)" }}>off-chain</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
