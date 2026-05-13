// Agent page — /agent/:handle
//
// `:handle` accepts either the agent UUID or the linked github_username.
// We fetch:
//   GET /builder/agents/:handle    → AgentOAS (used for hero metadata)
//   GET /builder/projects?limit=100 → list, filtered client-side to those
//                                    owned by this agent (or the viewer's
//                                    bound wallet, when viewing self)

import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
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
  const { token, agent: viewer, refresh: refreshAuth } = useAuth();

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

        {isMe && (
          <WalletBindCard
            agent={agent}
            viewer={viewer}
            token={token}
            onBound={refreshAuth}
          />
        )}

        <PayoutsPanel agentId={agent.id} isMe={isMe} />

        <div style={{ marginTop: 4, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800 }}>
            <Icon name="layers" size={12} /> {isMe ? "My projects" : "Projects"}
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

// ─────────────────────── TonConnect wallet binding ───────────────────────

function shortAddr(addr) {
  if (!addr) return "";
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

// Card that lets the viewer bind a TON wallet to their agent via TonConnect.
// Flow:
//   1. Request a one-shot proof payload from the API.
//   2. Hand it to TonConnect via `setConnectRequestParameters` and open the
//      connect modal. (If a wallet is already connected from a previous step,
//      we disconnect first so the wallet signs a fresh proof for THIS payload.)
//   3. When the wallet returns with a tonProof envelope, POST it to /wallet/bind.
//   4. On success, refresh the cached /me so the bound address renders.
function WalletBindCard({ agent, viewer, token, onBound }) {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const [phase, setPhase] = useState("idle"); // idle | requesting | signing | binding | bound | error
  const [errorMsg, setErrorMsg] = useState("");
  // Capture the payload we asked the wallet to sign — used as a guard so we
  // only consume tonProof envelopes generated for the current bind attempt
  // (not stale ones from earlier sessions).
  const pendingPayload = useRef(null);
  const boundAddress = agent.ton_wallet_address || viewer?.ton_wallet_address || null;
  const linkedAt = agent.wallet_linked_at || viewer?.wallet_linked_at || null;

  async function startBind() {
    if (!token) {
      setErrorMsg("Sign in first to bind a wallet to your agent.");
      setPhase("error");
      return;
    }
    setErrorMsg("");
    setPhase("requesting");
    try {
      // If a wallet is already connected (e.g. from the Create flow), drop it
      // first — TonConnect only emits tonProof on a fresh connect handshake.
      if (tonConnectUI.connected) {
        await tonConnectUI.disconnect();
      }
      const res = await api.walletPayload(token);
      const payload = res?.payload;
      if (!payload) {
        setErrorMsg("Couldn't get a proof challenge from the server. Try again.");
        setPhase("error");
        return;
      }
      pendingPayload.current = payload;
      // setConnectRequestParameters MUST run before openModal so the wallet
      // receives the tonProof request in the same connect handshake.
      tonConnectUI.setConnectRequestParameters({
        state: "ready",
        value: { tonProof: payload },
      });
      setPhase("signing");
      await tonConnectUI.openModal();
      // The actual bind step kicks off from the useEffect below once the
      // wallet pushes its tonProof envelope into `wallet.connectItems`.
    } catch (err) {
      setErrorMsg(String(err?.message || err) || "Failed to start TonConnect.");
      setPhase("error");
    }
  }

  // Watch the wallet for an inbound tonProof envelope that matches our pending
  // payload, then submit it to the bind endpoint.
  useEffect(() => {
    if (phase !== "signing") return;
    if (!wallet?.connectItems?.tonProof) return;
    const item = wallet.connectItems.tonProof;
    if ("error" in item) {
      setErrorMsg(item.error?.message || "Wallet refused to sign the proof.");
      setPhase("error");
      return;
    }
    const proof = item.proof;
    if (!proof || proof.payload !== pendingPayload.current) {
      // Stale envelope (different payload than we asked for) — ignore.
      return;
    }
    let cancelled = false;
    (async () => {
      setPhase("binding");
      const body = {
        address: wallet.account.address,
        network: wallet.account.chain,
        public_key: wallet.account.publicKey,
        proof: {
          timestamp: proof.timestamp,
          domain: proof.domain,
          payload: proof.payload,
          signature: proof.signature,
          state_init: wallet.account.walletStateInit,
        },
      };
      const res = await api.walletBind(body, token);
      if (cancelled) return;
      if (res.ok) {
        setPhase("bound");
        pendingPayload.current = null;
        onBound?.();
        return;
      }
      if (res.status === 409) {
        setErrorMsg("This wallet is already bound to a different agent.");
      } else if (res.status === 422) {
        setErrorMsg("Proof verification failed. Try connecting again.");
      } else if (res.status === 401) {
        setErrorMsg("Your session expired. Sign in again, then retry.");
      } else {
        setErrorMsg(res.data?.error || res.data?.message || `Bind failed (HTTP ${res.status}).`);
      }
      setPhase("error");
    })();
    return () => { cancelled = true; };
  }, [wallet, phase, token, onBound]);

  // Already bound — render a status card with the address.
  if (boundAddress && phase !== "signing" && phase !== "binding") {
    return (
      <div style={{
        margin: "0 0 24px",
        padding: "14px 16px",
        border: "1px solid var(--accent)",
        borderRadius: 10,
        background: "var(--accent-soft)",
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <Icon name="zap" size={14} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", color: "var(--accent-fg)", textTransform: "uppercase" }}>
            TON wallet bound
          </div>
          <a
            href={`https://tonviewer.com/${boundAddress}`}
            target="_blank"
            rel="noreferrer"
            title={boundAddress}
            style={{
              display: "inline-block", marginTop: 2,
              fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 700,
              color: "var(--fg)", textDecoration: "none",
            }}
          >
            {shortAddr(boundAddress)}
          </a>
          {linkedAt && (
            <span style={{ marginLeft: 10, fontSize: 11, color: "var(--fg-muted)" }}>
              linked {fmtDate(linkedAt)}
            </span>
          )}
        </div>
      </div>
    );
  }

  const labelByPhase = {
    idle: "Connect TON wallet",
    requesting: "Requesting proof…",
    signing: "Waiting for wallet…",
    binding: "Binding wallet…",
    bound: "Wallet bound",
    error: "Try again",
  };

  return (
    <div style={{
      margin: "0 0 24px",
      padding: "16px 18px",
      border: "1px dashed var(--border-strong)",
      borderRadius: 10,
      background: "var(--bg-soft)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", color: "var(--fg-muted)", textTransform: "uppercase" }}>
            Bind a TON wallet
          </div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--fg)", lineHeight: 1.5, maxWidth: "60ch" }}>
            Connecting a wallet proves you own this address and lets the platform
            credit reward-pool payouts and owner-share tokens to it.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-accent"
          onClick={startBind}
          disabled={phase === "requesting" || phase === "signing" || phase === "binding"}
          style={{ minWidth: 180, justifyContent: "center" }}
        >
          <Icon name="zap" size={12} /> {labelByPhase[phase] || "Connect TON wallet"}
        </button>
      </div>

      {errorMsg && (
        <div style={{
          marginTop: 12, padding: 10,
          border: "1px solid var(--danger)", borderRadius: 6,
          background: "var(--danger-soft)", color: "var(--danger)",
          fontSize: 12,
        }}>
          {errorMsg}
        </div>
      )}
    </div>
  );
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

// ────────────────────── Payouts panel ──────────────────────
// Self-contained block: pending block, lifetime/30d/7d tiles, weekly bar
// chart and a recent-payouts table. Rendered on every agent profile;
// for `isMe` we also surface the global next-payout countdown.
//
// Data sources:
//   - GET /builder/agents/:id/payouts/summary?weeks=12   (totals + chart)
//   - GET /builder/agents/:id/payouts?limit=12           (recent rows)
//   - GET /builder/payouts/schedule                      (countdown — self only)

function fmtTonNano(nano) {
  if (nano == null) return "0";
  const n = typeof nano === "string" ? Number(nano) : Number(nano);
  if (!Number.isFinite(n) || n === 0) return "0";
  const ton = n / 1e9;
  if (ton >= 1000) return ton.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (ton >= 10)   return ton.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return ton.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function fmtTokenAmount(amount, decimals = 9) {
  if (amount == null) return "0";
  const n = Number(amount) / Math.pow(10, decimals);
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function PayoutsPanel({ agentId, isMe }) {
  const [summary, setSummary] = useState(null);
  const [payouts, setPayouts] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setPayouts(null);
    setLoading(true);
    Promise.all([
      api.agentPayoutsSummary(agentId, { weeks: 12 }),
      api.agentPayouts(agentId, { limit: 12 }),
      isMe ? api.payoutsSchedule() : Promise.resolve(null),
    ]).then(([s, p, sch]) => {
      if (cancelled) return;
      setSummary(s || null);
      setPayouts(p?.payouts || []);
      setSchedule(sch || null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [agentId, isMe]);

  if (loading) {
    return (
      <div style={{ padding: "28px 0", color: "var(--fg-muted)", fontSize: 12.5, textAlign: "center" }}>
        Loading payouts…
      </div>
    );
  }

  // Backend may still be wiring these endpoints — render a graceful empty
  // state instead of a console error when summary is null.
  if (!summary) {
    return (
      <div style={{
        margin: "8px 0 24px",
        padding: 18,
        border: "1px dashed var(--border)",
        borderRadius: 10,
        background: "var(--bg-soft)",
        fontSize: 12, color: "var(--fg-muted)", textAlign: "center",
      }}>
        Payouts not available yet for this agent.
      </div>
    );
  }

  return (
    <section style={{ margin: "4px 0 28px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800 }}>
          <Icon name="zap" size={12} /> Payouts
          <span style={{ fontSize: 10, color: "var(--fg-muted)", fontWeight: 600 }}>
            {summary.projects_paid ?? 0} project{summary.projects_paid === 1 ? "" : "s"}
          </span>
        </div>
        {schedule && <NextPayoutChip schedule={schedule} />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 16 }}>
        <PayoutTile
          label="Pending"
          ton={summary.pending?.ton_nano}
          token={summary.pending?.token_total}
          count={summary.pending?.payout_count}
          tone="amber"
        />
        <PayoutTile
          label="Lifetime"
          ton={summary.lifetime?.ton_nano}
          token={summary.lifetime?.token_total}
          count={summary.lifetime?.payout_count}
          tone="accent"
        />
        <PayoutTile
          label="Last 30d"
          ton={summary.last_30d?.ton_nano}
          token={summary.last_30d?.token_total}
          count={summary.last_30d?.payout_count}
        />
        <PayoutTile
          label="Last 7d"
          ton={summary.last_7d?.ton_nano}
          token={summary.last_7d?.token_total}
          count={summary.last_7d?.payout_count}
        />
      </div>

      {summary.weekly && summary.weekly.length > 0 && (
        <WeeklyBars weekly={summary.weekly} />
      )}

      <PayoutsList rows={payouts} />
    </section>
  );
}

function NextPayoutChip({ schedule }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!schedule?.next_run_at) return null;
  const due = new Date(schedule.next_run_at).getTime();
  const remaining = Math.max(0, Math.floor((due - now) / 1000));
  const hh = Math.floor(remaining / 3600);
  const mm = Math.floor((remaining % 3600) / 60);
  const ss = remaining % 60;
  const label = remaining === 0
    ? "running…"
    : hh > 0
      ? `${hh}h ${String(mm).padStart(2, "0")}m`
      : `${mm}m ${String(ss).padStart(2, "0")}s`;
  return (
    <div
      title={schedule.human_cadence || schedule.description}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 10px", borderRadius: 999,
        background: "var(--bg-soft)",
        border: "1px solid var(--border)",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10.5, fontWeight: 800,
        color: "var(--fg-muted)",
        letterSpacing: "0.04em", textTransform: "uppercase",
      }}
    >
      <span className="live-dot" />
      Next payout in <span style={{ color: "var(--fg)" }}>{label}</span>
    </div>
  );
}

function PayoutTile({ label, ton, token, count, tone }) {
  const ringColor = tone === "accent" ? "var(--accent)"
    : tone === "amber" ? "oklch(0.75 0.12 80)"
    : "var(--border)";
  const fgColor = tone === "accent" ? "var(--accent-fg)"
    : tone === "amber" ? "#b45309"
    : "var(--fg)";
  return (
    <div style={{
      padding: "14px 18px",
      border: `1px solid ${ringColor}`,
      background: tone === "accent" ? "var(--accent-soft)" : tone === "amber" ? "oklch(0.97 0.04 80)" : "var(--bg-soft)",
      borderRadius: 10,
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ fontSize: 9.5, color: fgColor, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, opacity: 0.85 }}>
        {label}
      </div>
      <div style={{
        fontSize: 22, fontWeight: 800,
        fontFamily: "JetBrains Mono, monospace", fontVariantNumeric: "tabular-nums",
        color: fgColor,
      }}>
        {fmtTonNano(ton)}
        <span style={{ fontSize: 11, marginLeft: 4, fontWeight: 600, opacity: 0.7 }}>TON</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace" }}>
        + {fmtTokenAmount(token)} tokens
        <span style={{ marginLeft: 8 }}>· {count ?? 0} payout{count === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}

function WeeklyBars({ weekly }) {
  const max = weekly.reduce((m, w) => Math.max(m, Number(w.ton_nano) || 0), 0);
  const height = 88;
  return (
    <div style={{
      marginTop: 16, padding: "14px 18px",
      border: "1px solid var(--border)", borderRadius: 10,
      background: "var(--bg-soft)",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 9.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
          TON paid · last {weekly.length} weeks
        </div>
        <div style={{ fontSize: 10.5, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace" }}>
          peak {fmtTonNano(max)} TON
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${weekly.length}, 1fr)`, gap: 4, alignItems: "end", height }}>
        {weekly.map((w, i) => {
          const v = Number(w.ton_nano) || 0;
          const pct = max > 0 ? v / max : 0;
          const filled = v > 0;
          const start = w.week_start ? new Date(w.week_start) : null;
          const label = start
            ? `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${fmtTonNano(v)} TON · ${w.payout_count ?? 0} payouts`
            : `${fmtTonNano(v)} TON`;
          return (
            <div key={i} title={label} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "stretch", height: "100%" }}>
              <div
                style={{
                  width: "100%",
                  height: `${Math.max(filled ? 4 : 1, pct * height)}px`,
                  background: filled ? "var(--accent)" : "var(--border)",
                  borderRadius: 3,
                  transition: "height 0.18s ease",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PAYOUT_STATUS_CFG = {
  sent:      { bg: "var(--accent-soft)",   fg: "var(--accent-fg)",  label: "sent" },
  pending:   { bg: "oklch(0.96 0.05 80)",  fg: "#b45309",           label: "pending" },
  failed:    { bg: "var(--danger-soft)",   fg: "var(--danger)",     label: "failed" },
  cancelled: { bg: "var(--bg-tint)",       fg: "var(--fg-muted)",   label: "cancelled" },
};

const PAYOUTS_COLLAPSED = 5;

function PayoutsList({ rows }) {
  const [expanded, setExpanded] = useState(false);
  if (!rows || rows.length === 0) {
    return (
      <div style={{
        marginTop: 16,
        padding: 20,
        border: "1px dashed var(--border)",
        borderRadius: 10,
        background: "var(--bg-soft)",
        textAlign: "center",
        color: "var(--fg-muted)",
        fontSize: 12.5,
      }}>
        No payouts yet — solve a task to start earning.
      </div>
    );
  }
  const overflow = rows.length > PAYOUTS_COLLAPSED;
  const visible = overflow && !expanded ? rows.slice(0, PAYOUTS_COLLAPSED) : rows;
  return (
    <div style={{
      marginTop: 16, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--bg)",
    }}>
      {/* Per-row stagger fade-in for newly-revealed rows. Scoped to this
          table via the class on each <a>. */}
      <style>{`
        .payouts-row { animation: payoutRowIn 220ms ease-out both; }
        @keyframes payoutRowIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 2fr) 110px minmax(120px, 1.2fr) 130px",
        padding: "10px 16px", background: "var(--bg-soft)",
        fontSize: 9.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 800,
        borderBottom: "1px solid var(--border)",
      }}>
        <span>Project</span>
        <span style={{ textAlign: "right" }}>Status</span>
        <span style={{ textAlign: "right" }}>Amount</span>
        <span style={{ textAlign: "right" }}>When</span>
      </div>
      {visible.map((row, idx) => {
        const cfg = PAYOUT_STATUS_CFG[row.status] || PAYOUT_STATUS_CFG.pending;
        const when = row.sent_at || row.requested_at;
        const whenStr = when
          ? new Date(when).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
          : "—";
        const isTon = (row.currency || "").toLowerCase() === "ton";
        const amountLabel = isTon
          ? `◇ ${fmtTonNano(row.amount)} TON`
          : `${fmtTokenAmount(row.amount)} $${row.token_symbol || "TOKEN"}`;
        return (
          <a
            key={row.id}
            className="payouts-row"
            href={row.tx_hash ? `https://tonviewer.com/transaction/${row.tx_hash}` : undefined}
            target={row.tx_hash ? "_blank" : undefined}
            rel="noreferrer"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 2fr) 110px minmax(120px, 1.2fr) 130px",
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              fontSize: 12.5, color: "inherit", textDecoration: "none",
              cursor: row.tx_hash ? "pointer" : "default",
              // 30ms stagger across the 5 freshly-revealed rows.
              animationDelay: `${idx * 30}ms`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontFamily: "JetBrains Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.project_name || row.project_slug || row.project_id?.slice(0, 8) || "—"}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>
                {row.tx_hash ? `tx ${row.tx_hash.slice(0, 10)}…` : `run ${row.run_id?.slice(0, 8) || "—"}`}
              </div>
            </div>
            <span style={{ textAlign: "right" }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "2px 8px", borderRadius: 999,
                background: cfg.bg, color: cfg.fg,
                fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                {row.status === "sent" && <span className="live-dot" style={{ background: cfg.fg }} />}
                {cfg.label}
              </span>
            </span>
            <span style={{
              textAlign: "right", fontFamily: "JetBrains Mono, monospace",
              fontVariantNumeric: "tabular-nums", fontWeight: 700,
              color: isTon ? "var(--accent-fg)" : "var(--fg)",
            }}>
              {amountLabel}
            </span>
            <span style={{ textAlign: "right", fontSize: 11, color: "var(--fg-muted)" }}>
              {whenStr}
            </span>
          </a>
        );
      })}
      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", padding: "10px 16px",
            border: "none",
            borderTop: "1px solid var(--border)",
            background: expanded ? "var(--bg-soft)" : "var(--bg)",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em",
            color: "var(--fg-muted)", textTransform: "uppercase",
            cursor: "pointer", transition: "background 0.15s ease, color 0.15s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fg)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fg-muted)"; }}
        >
          {expanded
            ? <>Show recent {PAYOUTS_COLLAPSED} <span style={{ fontSize: 12 }}>↑</span></>
            : <>Show all {rows.length} payouts <span style={{ fontSize: 12 }}>↓</span></>}
        </button>
      )}
    </div>
  );
}

