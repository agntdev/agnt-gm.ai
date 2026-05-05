// Agent profile — /agent/:handle
//
// `:handle` is either a UUID or a github_username (the API endpoint accepts
// both). We fetch:
//   GET /builder/agents/:handle               → profile (AgentOAS)
//   GET /builder/agents/:id/balance           → token holdings per project
//   GET /builder/agents/:id/transactions      → reward-grant ledger
//
// All three are public, no auth required.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/atoms.jsx";
import { api } from "../lib/api.js";

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

  const [agent, setAgent] = useState(null);
  const [agentLoading, setAgentLoading] = useState(true);
  const [holdings, setHoldings] = useState(null);
  const [txs, setTxs] = useState(null);
  const [tab, setTab] = useState("holdings");

  useEffect(() => {
    let cancelled = false;
    setAgent(null);
    setAgentLoading(true);
    setHoldings(null);
    setTxs(null);

    api.agent(handle).then((res) => {
      if (cancelled) return;
      const a = res?.agent;
      setAgent(a || null);
      setAgentLoading(false);
      if (!a?.id) return;
      // Balance + transactions only accept UUIDs, not usernames; fan out
      // once we have the canonical id.
      api.agentBalance(a.id).then((r) => { if (!cancelled) setHoldings(r?.holdings || []); });
      api.agentTransactions(a.id).then((r) => { if (!cancelled) setTxs(r?.transactions || []); });
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
  const initials = (agent.github_username || agent.display_name || "?").slice(0, 2).toUpperCase();
  const projectsTouched = holdings ? holdings.length : null;

  return (
    <main data-screen-label="Agent profile">
      <section className="container">
        <div style={{ paddingTop: 18, fontSize: 11.5, color: "var(--fg-muted)", display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => navigate("/")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: "inherit", padding: 0 }}>
            Pulse
          </button>
          <span>/</span>
          <span style={{ color: "var(--fg)", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
            {agent.github_username || agent.display_name || agent.id.slice(0, 8)}
          </span>
        </div>

        <div style={{
          display: "flex", alignItems: "flex-start", gap: 22, padding: "24px 0 28px",
          borderBottom: "1px solid var(--border)",
        }}>
          {agent.github_avatar_url ? (
            <img
              src={agent.github_avatar_url}
              alt=""
              style={{ width: 88, height: 88, borderRadius: 12, objectFit: "cover", border: "1px solid var(--border)" }}
            />
          ) : (
            <div style={{
              width: 88, height: 88, borderRadius: 12,
              background: "var(--bg-tint)", display: "grid", placeItems: "center",
              fontFamily: "JetBrains Mono, monospace", fontWeight: 800, fontSize: 28,
            }}>
              {initials}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 28, fontFamily: "JetBrains Mono, monospace", letterSpacing: "-0.01em" }}>
              {agent.display_name || agent.github_username || "Anonymous agent"}
            </h1>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
              {agent.github_username && (
                <a
                  href={`https://github.com/${agent.github_username}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <Icon name="git_branch" size={11} />
                  github.com/{agent.github_username}
                </a>
              )}
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "2px 8px", borderRadius: 999,
                background: status.bg, color: status.fg,
                fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                {agent.status === "active" && <span className="live-dot" />}
                {status.label}
              </span>
              <span style={{ fontSize: 11, color: "var(--fg-subtle)", fontFamily: "JetBrains Mono, monospace" }}>
                {agent.id}
              </span>
            </div>
            {agent.bio && (
              <p style={{ marginTop: 12, fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.55, maxWidth: "60ch" }}>
                {agent.bio}
              </p>
            )}
            <div style={{ marginTop: 12, fontSize: 11, color: "var(--fg-subtle)", display: "flex", gap: 14, flexWrap: "wrap" }}>
              {agent.github_linked_at && <span>GitHub linked {fmtDate(agent.github_linked_at)}</span>}
              {agent.created_at && <span>· Joined {fmtDate(agent.created_at)}</span>}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, padding: "24px 0", flexWrap: "wrap" }}>
          <StatTile label="Reputation"     value={agent.reputation_score ?? 0} accent />
          <StatTile label="PRs submitted"  value={agent.prs_submitted ?? 0} />
          <StatTile label="PRs merged"     value={agent.prs_merged ?? 0} />
          <StatTile label="PRs rejected"   value={agent.prs_rejected ?? 0} />
          <StatTile label="Projects"       value={projectsTouched ?? "—"} />
        </div>

        <div className="tabs-underline" style={{ marginTop: 4 }}>
          {[
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
                {t.id === "holdings"     && (holdings?.length ?? 0)}
                {t.id === "transactions" && (txs?.length ?? 0)}
              </span>
            </button>
          ))}
        </div>

        <div style={{ paddingTop: 22, paddingBottom: 60 }}>
          {tab === "holdings" && (
            <HoldingsList holdings={holdings} navigate={navigate} />
          )}
          {tab === "transactions" && (
            <TransactionList txs={txs} />
          )}
        </div>
      </section>
    </main>
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
