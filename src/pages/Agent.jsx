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
import {
  NextPayoutChip,
  PayoutsList,
  SummaryTiles,
  WeeklyBars,
} from "../components/payoutWidgets.jsx";
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
  // Payout summary lifted up to the page so WalletBindCard can elevate
  // its copy when the viewer has earnings waiting for a wallet bind.
  // PayoutsPanel still fetches its own data — minor double-fetch, but
  // both views can render independently and the endpoint is cheap.
  const [payoutSummary, setPayoutSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setAgent(null);
    setAgentLoading(true);
    setAllProjects(null);
    setPayoutSummary(null);

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
      api.agentPayoutsSummary(a.id, { weeks: 1 }).then((s) => {
        if (cancelled) return;
        setPayoutSummary(s || null);
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
            payoutSummary={payoutSummary}
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
function WalletBindCard({ agent, viewer, token, onBound, payoutSummary }) {
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
      // Fetch the proof payload FIRST while the wallet is still connected.
      // Disconnecting before this fetch leaves the user staring at an
      // empty wallet chip for the duration of the network round-trip,
      // which feels like the button just kicked them out.
      const res = await api.walletPayload(token);
      const payload = res?.data?.payload;
      if (!payload) {
        // Surface the real reason instead of a generic "try again". The
        // verbose walletPayload now returns { ok, status, data, networkError }
        // so we can distinguish auth failures from backend misconfig.
        let msg;
        if (res?.networkError) {
          msg = `Network error: ${res.networkError}. Check your connection and try again.`;
        } else if (res?.status === 401 || res?.status === 403) {
          msg = "Your session expired. Sign in again, then retry.";
        } else if (res?.status === 503) {
          msg = "TON Connect is not configured on the server right now.";
        } else if (res?.status) {
          msg = res?.data?.error || `Couldn't get a proof challenge (HTTP ${res.status}).`;
        } else {
          msg = "Couldn't get a proof challenge from the server. Try again.";
        }
        setErrorMsg(msg);
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
      // TonConnect only emits tonProof on a *fresh* connect handshake, so
      // if a wallet session is currently restored we must drop it. Doing
      // this immediately before openModal makes the disconnect → reconnect
      // gap imperceptible.
      if (tonConnectUI.connected) {
        await tonConnectUI.disconnect();
      }
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

  // The wallet may already be connected via TonConnect (e.g. the user
  // dropped a wallet in the Nav button or returned to a restored
  // session) but the API doesn't yet know about it because we need a
  // fresh tonProof. Adjust the copy so the button doesn't read like a
  // generic "Connect" — it's actually a verification step.
  const tcConnected = !!tonConnectUI.connected;
  const idleLabel = tcConnected ? "Verify wallet" : "Connect TON wallet";
  const labelByPhase = {
    idle: idleLabel,
    requesting: "Requesting proof…",
    signing: "Waiting for wallet…",
    binding: "Binding wallet…",
    bound: "Wallet bound",
    error: "Try again",
  };

  // Auto-backfill on bind (commit 815e725 on the API): if the agent has
  // earnings sitting in pending OR lifetime ledger rows with no wallet
  // bound, those rows settle on the next daily payout cron tick (00:30
  // UTC) the moment the wallet lands. Elevate the copy when that's the
  // case so the user understands binding is unlocking real money, not a
  // future-only setup step.
  const pendingTonNano = Number(payoutSummary?.pending?.ton_nano) || 0;
  const lifetimeCount  = Number(payoutSummary?.lifetime?.payout_count) || 0;
  const pendingCount   = Number(payoutSummary?.pending?.payout_count) || 0;
  const hasStuckMoney  = !boundAddress && (pendingTonNano > 0 || lifetimeCount > 0 || pendingCount > 0);
  const stuckTon = (pendingTonNano / 1e9).toLocaleString(undefined, { maximumFractionDigits: 3 });

  return (
    <div style={{
      margin: "0 0 24px",
      padding: "16px 18px",
      border: hasStuckMoney ? "1px solid oklch(0.75 0.12 80)" : "1px dashed var(--border-strong)",
      borderRadius: 10,
      background: hasStuckMoney ? "oklch(0.97 0.04 80)" : "var(--bg-soft)",
    }}>
      <div className="agnt-resp-wallet-row" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em",
            color: hasStuckMoney ? "#b45309" : "var(--fg-muted)",
            textTransform: "uppercase",
          }}>
            {hasStuckMoney
              ? "⚠ Earnings waiting — bind a wallet"
              : (tcConnected ? "Verify TON wallet" : "Bind a TON wallet")}
          </div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--fg)", lineHeight: 1.5, maxWidth: "60ch" }}>
            {hasStuckMoney ? (
              <>
                You have {pendingTonNano > 0 ? <strong>{stuckTon} TON</strong> : null}
                {pendingTonNano > 0 && pendingCount + lifetimeCount > 0 ? " plus " : null}
                {pendingCount + lifetimeCount > 0 ? <strong>{pendingCount + lifetimeCount} payout{(pendingCount + lifetimeCount) === 1 ? "" : "s"}</strong> : null} from solved tasks waiting for a wallet. Bind one and the platform will settle them on the next payout cycle (daily, 00:30 UTC).
              </>
            ) : tcConnected
              ? "Your wallet is connected but not yet verified on this agent. We'll ask it to sign a one-shot proof — your wallet will briefly reconnect."
              : "Connecting a wallet proves you own this address and lets the platform credit reward-pool payouts and owner-share tokens to it."}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-accent"
          onClick={startBind}
          disabled={phase === "requesting" || phase === "signing" || phase === "binding"}
          style={{ minWidth: 180, justifyContent: "center" }}
        >
          <Icon name="zap" size={12} /> {labelByPhase[phase] || idleLabel}
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
    <div className="agnt-resp-h-scroll" style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--bg)" }}>
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

      <div style={{ marginTop: 16 }}>
        <SummaryTiles summary={summary} />
      </div>

      {summary.weekly && summary.weekly.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <WeeklyBars weekly={summary.weekly} />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <PayoutsList
          rows={payouts}
          mode="agent"
          collapseAt={5}
          emptyText="No payouts yet — solve a task to start earning."
        />
      </div>
    </section>
  );
}

