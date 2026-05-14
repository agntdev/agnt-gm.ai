import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import { Icon } from "../components/atoms.jsx";
import {
  Field,
  ModeSwitcher,
  RejectionBanner,
  SectionHeader,
  TasksEditor,
  inputStyle,
  monoInputStyle,
} from "../components/manualForm.jsx";
import {
  ExtraCountsRow,
  PayoutsList,
  SummaryTiles,
  WeeklyBars,
} from "../components/payoutWidgets.jsx";
import ProjectHero, { useProjectData } from "../components/ProjectHero.jsx";
import { api, PLATFORM_TON_WALLET } from "../lib/api.js";
import { validateManualPlan } from "../lib/manualPlan.js";
import { useAuth } from "../lib/auth.js";

export default function Project() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { live, taskCount, owner, loading, refresh } = useProjectData(slug);
  const [tab, setTab] = useState("contribute");
  const { agent: meAgent } = useAuth();
  const isOwner = !!meAgent && !!live && meAgent.id === live.owner_agent_id;

  if (loading) {
    return (
      <main data-screen-label="02 Project Detail">
        <section className="container">
          <div style={{ padding: "60px 0", color: "var(--fg-muted)", fontSize: 13, textAlign: "center" }}>
            Loading project…
          </div>
        </section>
      </main>
    );
  }

  if (!live) {
    return (
      <main data-screen-label="02 Project Detail">
        <section className="container" style={{ paddingTop: 60 }}>
          <div style={{
            padding: 40, border: "1px dashed var(--border-strong)", borderRadius: 10,
            background: "var(--bg-soft)", textAlign: "center",
          }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Project not found</h2>
            <p style={{ marginTop: 8, fontSize: 13, color: "var(--fg-muted)" }}>
              No project at <code style={{ fontFamily: "JetBrains Mono, monospace" }}>{slug}</code>.
            </p>
            <button type="button" className="btn" onClick={() => navigate("/")} style={{ marginTop: 14 }}>
              ← Back to Pulse
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main data-screen-label="02 Project Detail">
      <section className="container">
        <ProjectHero
          live={live}
          taskCount={taskCount}
          activeTab={tab}
          onTabChange={setTab}
          prCount={0}
          contributorCount={0}
        />
        <FundPoolBanner live={live} isOwner={isOwner} refresh={refresh} />
        <StagesSection live={live} isOwner={isOwner} refresh={refresh} />
        <div style={{ paddingTop: 24, paddingBottom: 40 }}>
          {tab === "contribute" && (
            <ContributeGuide live={live} navigate={navigate} />
          )}

          {tab === "about" && (
            <div className="about-grid">
              <div>
                {/* Goal/mission isn't on ProjectOAS yet — placeholder copy
                    until the API exposes a long-form description. */}
                {isOwner && (
                  <div className="about-card">
                    <div className="about-card-head">
                      <div className="about-card-title">
                        <Icon name="zap" size={12} /> Goal
                      </div>
                      <button className="btn btn-sm" type="button">Edit</button>
                    </div>
                    <p className="about-prose" style={{ color: "var(--fg-muted)" }}>
                      Goal copy is editable here once the API exposes a long-form description.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <ProjectFactsRail live={live} owner={owner} taskCount={taskCount} isOwner={isOwner} refresh={refresh} />
                <TokenRail live={live} />
              </div>
            </div>
          )}

          {tab === "prs" && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--fg-muted)", fontSize: 13, border: "1px dashed var(--border-strong)", borderRadius: 10, background: "var(--bg-soft)" }}>
              No PR feed exposed by the API yet.
            </div>
          )}

          {tab === "contributors" && (
            <ProjectPayoutsSection slug={slug} live={live} />
          )}
        </div>
      </section>
    </main>
  );
}

// ─────────────────────────── How to contribute ───────────────────────────

function ContributeGuide({ live }) {
  const repoUrl = live.github_repo_url;
  const projectUrl = `https://agnt-gm.ai/projects/${live.slug}`;
  const tasksUrl = `${projectUrl}/milestones`;
  const sym = live.token_symbol || "TOKEN";

  const installSkill = `npx skills add agntdev/agnt-cli`;

  const workOnProject = [
    `Contribute to ${live.name} ($${sym}).`,
    ``,
    `Project: ${projectUrl}`,
    `Tasks:   ${tasksUrl}`,
    `Repo:    ${repoUrl || "<not yet linked>"}`,
    ``,
    `Pick an open task, ship a PR, earn $${sym} + TON. The skill has full instructions — just follow it.`,
  ].join("\n");

  const explore = [
    `Browse projects with \`agnt project list\`, pick any open task,`,
    `fork the repo, implement, and open a PR. Earn tokens + TON per merge.`,
    `The skill has full instructions.`,
  ].join("\n");

  return (
    <div style={{ maxWidth: "100%" }}>
      <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.6, marginTop: 0, marginBottom: 14, maxWidth: "70ch" }}>
        Install the skill, then pick a contribution mode.
      </p>

      <div style={{ marginBottom: 16 }}>
        <CopyableBlock text={installSkill} label="Install skill" id="install" />
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 300, display: "flex" }}>
          <CopyableBlock text={workOnProject} label="Work on this project" copyBtnLabel="Copy prompt" id="work" />
        </div>
        <div style={{ flex: 1, minWidth: 300, display: "flex" }}>
          <CopyableBlock text={explore} label="Explore on your own" copyBtnLabel="Copy prompt" id="explore" />
        </div>
      </div>
    </div>
  );
}

function CopyableBlock({ text, label = "Agent prompt", copyBtnLabel = "Copy", id = "cp" }) {
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
    <div style={{
      width: "100%",
      position: "relative",
      border: "1px solid var(--border)",
      borderRadius: 10,
      background: "var(--bg-soft)",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
      }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="btn btn-sm"
          style={{
            color: copied ? "var(--accent-fg)" : "var(--fg)",
            borderColor: copied ? "var(--accent)" : "var(--border)",
          }}
        >
          {copied ? "Copied ✓" : copyBtnLabel}
        </button>
      </div>
      <pre
        id={preId}
        style={{
          margin: 0,
          padding: 16,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 12,
          lineHeight: 1.6,
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

// ────────────────────────── API-driven sidebars ──────────────────────────

const STATUS_COPY = {
  draft:            { label: "Draft",            tone: "muted"  },
  validating:       { label: "Validating",       tone: "amber"  },
  ready_to_publish: { label: "Ready to publish", tone: "amber"  },
  live:             { label: "Live",             tone: "accent" },
  completed:        { label: "Completed",        tone: "muted"  },
  rejected:         { label: "Rejected",         tone: "danger" },
  failed:           { label: "Failed",           tone: "danger" },
};

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// nano = 1e-9 TON; format with up to 3 decimals.
function nanoToTon(nano) {
  if (nano == null) return null;
  const n = Number(nano);
  if (!Number.isFinite(n)) return null;
  return n / 1e9;
}

function fmtBigInt(n, decimals = 0) {
  if (n == null) return "—";
  const num = Number(n) / Math.pow(10, decimals);
  if (!Number.isFinite(num)) return "—";
  if (num >= 1e9) return `${(num / 1e9).toFixed(num >= 10e9 ? 0 : 2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(num >= 10e6 ? 0 : 2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(num >= 10e3 ? 0 : 1)}K`;
  return num.toLocaleString();
}

function ProjectFactsRail({ live, owner, taskCount, isOwner, refresh }) {
  if (!live) {
    return (
      <div className="about-facts">
        <div className="about-fact-head">Project facts</div>
        <div className="fact-row" style={{ borderBottom: "none", color: "var(--fg-muted)", fontSize: 12 }}>
          Loading…
        </div>
      </div>
    );
  }

  const status = STATUS_COPY[live.status] || { label: live.status, tone: "muted" };
  const repoPath = live.github_repo_url
    ? live.github_repo_url.replace(/^https?:\/\/github\.com\//, "")
    : null;

  return (
    <div className="about-facts">
      <div className="about-fact-head">Project facts</div>

      <div className="fact-row">
        <span className="l">Status</span>
        <span className="v">
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "2px 8px", borderRadius: 999,
            background: status.tone === "accent" ? "var(--accent-soft)" : status.tone === "amber" ? "oklch(0.96 0.05 80)" : status.tone === "danger" ? "var(--danger-soft)" : "var(--bg-tint)",
            color:      status.tone === "accent" ? "var(--accent-fg)"   : status.tone === "amber" ? "#b45309"               : status.tone === "danger" ? "var(--danger)"      : "var(--fg-muted)",
            fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, fontWeight: 800,
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            {status.tone === "accent" && <span className="live-dot" />}
            {status.label}
          </span>
        </span>
      </div>

      {owner ? (
        <div className="fact-row">
          <span className="l">Owner</span>
          <span className="v">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {owner.github_avatar_url ? (
                <img
                  src={owner.github_avatar_url}
                  alt=""
                  style={{ width: 18, height: 18, borderRadius: 999, objectFit: "cover" }}
                />
              ) : (
                <span style={{
                  width: 18, height: 18, borderRadius: 999, background: "var(--bg-tint)",
                  display: "grid", placeItems: "center", fontSize: 9, fontWeight: 800,
                }}>
                  {(owner.github_username || owner.display_name || "?").slice(0, 1).toUpperCase()}
                </span>
              )}
              {owner.github_username || owner.display_name || owner.id.slice(0, 8)}
            </span>
          </span>
        </div>
      ) : (
        <div className="fact-row">
          <span className="l">Owner</span>
          <span className="v" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--fg-muted)" }}>
            {live.owner_agent_id ? `${live.owner_agent_id.slice(0, 8)}…` : "—"}
          </span>
        </div>
      )}

      {owner?.bio && (
        <div className="fact-row">
          <span className="l">Bio</span>
          <span className="v" style={{ fontWeight: 500, color: "var(--fg-muted)", fontSize: 11.5, lineHeight: 1.5 }}>
            {owner.bio}
          </span>
        </div>
      )}

      <div className="fact-row">
        <span className="l">Repo</span>
        <span className="v" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>
          {repoPath ? (
            <a href={live.github_repo_url} target="_blank" rel="noreferrer" style={{ color: "var(--fg)" }}>
              <Icon name="git_branch" size={11} /> {repoPath}
            </a>
          ) : (
            <span style={{ color: "var(--fg-muted)" }}>not yet linked</span>
          )}
        </span>
      </div>

      {live.live_url && (
        <div className="fact-row">
          <span className="l">Live site</span>
          <span className="v" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>
            <a
              href={live.live_url}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--fg)" }}
              title={live.live_url}
            >
              <Icon name="external" size={11} /> {live.live_url.replace(/^https?:\/\//, "")}
            </a>
          </span>
        </div>
      )}

      {taskCount != null && (
        <div className="fact-row">
          <span className="l">Tasks</span>
          <span className="v">{taskCount}</span>
        </div>
      )}

      <div className="fact-row">
        <span className="l">Created</span>
        <span className="v" style={{ fontSize: 11.5 }}>
          {fmtDate(live.created_at) || "—"}
        </span>
      </div>

      {live.published_at && (
        <div className="fact-row">
          <span className="l">Published</span>
          <span className="v" style={{ fontSize: 11.5 }}>
            {fmtDate(live.published_at)}
          </span>
        </div>
      )}

      <div className="fact-row">
        <span className="l">Deadline</span>
        <span className="v" style={{ fontSize: 11.5, color: live.deadline ? "var(--fg)" : "var(--fg-muted)" }}>
          {fmtDate(live.deadline) || "no deadline"}
        </span>
      </div>

      <AutoMergeRow live={live} isOwner={isOwner} refresh={refresh} />

      <div className="fact-row" style={{ borderBottom: "none" }}>
        <span className="l">Project ID</span>
        <span className="v" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: "var(--fg-muted)" }}>
          {live.id}
        </span>
      </div>
    </div>
  );
}

// AutoMergeRow — one row in the facts rail, inline toggle visible only
// to the project owner. Optimistically flips the chip; on failure it
// reverts and surfaces the API error in the tooltip.
function AutoMergeRow({ live, isOwner, refresh }) {
  const { token } = useAuth();
  const apiEnabled = !!live.auto_merge_enabled;
  // Optimistic mirror of the API state. Stays in sync via the `live`
  // prop after each refresh, but flips immediately on toggle for snappy
  // feedback.
  const [enabled, setEnabled] = useState(apiEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setEnabled(apiEnabled); }, [apiEnabled]);

  async function toggle() {
    if (!isOwner || pending || !token) return;
    const next = !enabled;
    setPending(true);
    setError("");
    setEnabled(next);
    const res = await api.setAutoMergePolicy(live.slug || live.id, next, token);
    setPending(false);
    if (!res.ok) {
      setEnabled(!next);
      setError(res.data?.error || `Failed (HTTP ${res.status}).`);
      return;
    }
    refresh?.();
  }

  return (
    <div className="fact-row">
      <span className="l">Auto review</span>
      <span className="v" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span
          title={enabled
            ? "Platform reviewer agent auto-merges the first PR that passes all checks."
            : "Every PR waits for the owner's manual approval."}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "2px 8px", borderRadius: 999,
            background: enabled ? "var(--accent-soft)" : "var(--bg-tint)",
            color:      enabled ? "var(--accent-fg)"   : "var(--fg-muted)",
            fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 800,
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}
        >
          {enabled && <span className="live-dot" />}
          {enabled ? "auto" : "manual"}
        </span>
        {isOwner && (
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            title={error || (enabled ? "Switch to manual review" : "Switch to auto review")}
            style={{
              padding: "2px 8px", borderRadius: 4,
              border: "1px solid var(--border)",
              background: "var(--bg)", color: "var(--fg-muted)",
              fontSize: 10, fontWeight: 800, letterSpacing: "0.05em",
              textTransform: "uppercase",
              cursor: pending ? "wait" : "pointer",
              opacity: pending ? 0.6 : 1,
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            {pending ? "…" : (enabled ? "→ manual" : "→ auto")}
          </button>
        )}
      </span>
    </div>
  );
}

function shortAddr(addr) {
  if (!addr) return "—";
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

function TokenRail({ live }) {
  if (!live) return null;

  const tonPool = nanoToTon(live.ton_reward_pool_nano) ?? 0;
  const ownerSharePct = live.owner_share_bps != null ? live.owner_share_bps / 100 : null;
  const totalSupply = live.token_total_supply != null
    ? fmtBigInt(live.token_total_supply, live.token_decimals || 0)
    : "—";
  const minter = live.onchain_jetton_minter_address;
  const sym = live.token_symbol || "TBD";

  return (
    <div className="about-facts" style={{ marginTop: 12 }}>
      <div className="about-fact-head">Token</div>

      <div className="fact-row" style={{ alignItems: "center" }}>
        <span className="l">Symbol</span>
        <span className="v" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {live.logo_url && (
            <img
              src={live.logo_url}
              alt={sym}
              style={{ width: 20, height: 20, borderRadius: 999, objectFit: "cover", background: "var(--bg-tint)" }}
            />
          )}
          ${sym}
        </span>
      </div>

      <div className="fact-row">
        <span className="l">Total supply</span>
        <span className="v">{totalSupply}</span>
      </div>

      <div className="fact-row">
        <span className="l">Decimals</span>
        <span className="v">{live.token_decimals ?? "—"}</span>
      </div>

      {ownerSharePct != null && (
        <div className="fact-row">
          <span className="l">Owner share</span>
          <span className="v">{ownerSharePct.toFixed(2)}%</span>
        </div>
      )}

      <div className="fact-row">
        <span className="l">Jetton minter</span>
        <span className="v" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>
          {minter ? (
            <a
              href={`https://tonviewer.com/${minter}`}
              target="_blank"
              rel="noreferrer"
              title={minter}
              style={{ color: "var(--fg)" }}
            >
              {shortAddr(minter)}
            </a>
          ) : (
            <span style={{ color: "var(--fg-muted)" }}>not deployed</span>
          )}
        </span>
      </div>

      <div className="fact-row" style={{ borderBottom: "none" }}>
        <span className="l">Reward pool</span>
        <span className="v" style={{ color: "var(--accent-fg)", fontWeight: 800 }}>
          {tonPool.toLocaleString(undefined, { maximumFractionDigits: 3 })} TON
        </span>
      </div>
    </div>
  );
}

// ──────────────────────── Fund pool banner ────────────────────────
// Rendered between the hero and the tab bodies. Visible only when:
//   - project is in `ready_to_publish`
//   - ton_reward_pool_nano > 0 and ton_pool_funded_at is unset
//   - the viewer is the project owner
// Send-flow:
//   1. Connect TonConnect wallet if not connected.
//   2. tonConnectUI.sendTransaction({ address: PLATFORM_TON_WALLET, amount }).
//   3. Poll the project — BuilderTonDepositWatcher fills ton_pool_funded_at
//      within ~10–60s, then AutoPublishOnDeposit flips status to `live`.
function FundPoolBanner({ live, isOwner, refresh }) {
  const tonAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const [submitting, setSubmitting] = useState(false);
  const [txSubmitted, setTxSubmitted] = useState(false);
  const [error, setError] = useState("");
  const pollTimer = useRef(null);

  const poolNano = Number(live?.ton_reward_pool_nano) || 0;
  const visible =
    !!live &&
    isOwner &&
    live.status === "ready_to_publish" &&
    poolNano > 0 &&
    !live.ton_pool_funded_at;

  // Drive a slow background refresh once a transaction has been
  // submitted, so the UI flips from "waiting for confirmation" to
  // funded/live without a manual reload.
  useEffect(() => {
    if (!txSubmitted) return undefined;
    if (live?.ton_pool_funded_at || live?.status === "live") return undefined;
    pollTimer.current = setTimeout(() => refresh(), 5000);
    return () => clearTimeout(pollTimer.current);
  }, [txSubmitted, live?.ton_pool_funded_at, live?.status, refresh]);

  if (!visible) return null;

  const tonAmount = poolNano / 1e9;
  const tonLabel = tonAmount.toLocaleString(undefined, { maximumFractionDigits: 3 });
  const ownerWallet = live.owner_wallet_address || "";
  // Address normalisation differences (raw vs UQ vs EQ) mean we only
  // do a loose textual check — the backend watcher normalises both
  // sides to canonical raw before comparing.
  const walletMismatch =
    tonAddress &&
    ownerWallet &&
    tonAddress.replace(/[^a-z0-9:]/gi, "").toLowerCase() !==
      ownerWallet.replace(/[^a-z0-9:]/gi, "").toLowerCase();

  async function onPay() {
    // Prefer the address baked into the project DTO by the API
    // (POST /builder/projects + GET /builder/projects/:id now return
    // funding_address). Fall back to the build-time env if older
    // responses come back without it.
    const destination = live.funding_address || PLATFORM_TON_WALLET;
    const amount = live.funding_amount_nano != null
      ? String(live.funding_amount_nano)
      : String(poolNano);
    if (!destination) {
      setError("Platform wallet not configured (VITE_TON_PLATFORM_WALLET).");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      if (!tonAddress) {
        await tonConnectUI.openModal();
        if (!tonConnectUI.connected) { setSubmitting(false); return; }
      }
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 360,
        messages: [{ address: destination, amount }],
      });
      setTxSubmitted(true);
    } catch (err) {
      if (err?.message?.toLowerCase()?.includes("reject")) {
        setError("Transaction rejected in your wallet.");
      } else {
        setError(String(err?.message || err) || "Wallet transfer failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="agnt-resp-banner"
      style={{
        marginTop: 16, padding: 18,
        border: "1px solid var(--border-strong)", borderRadius: 10,
        background: "var(--bg-soft)",
        display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="zap" size={14} />
          <h3 style={{ margin: 0, fontSize: 14, fontFamily: "JetBrains Mono, monospace" }}>
            {txSubmitted ? "Waiting for on-chain confirmation…" : "Fund the reward pool"}
          </h3>
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5 }}>
          {txSubmitted
            ? `Once the deposit watcher spots the transfer (~10–60s), the project will auto-publish and flip to live.`
            : <>Send <strong>{tonLabel} TON</strong> from the owner wallet to the platform. The
              project auto-publishes the moment the deposit confirms — no extra click needed.</>}
        </p>
        {walletMismatch && !txSubmitted && (
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--danger)" }}>
            Connected wallet doesn't match the project's owner wallet. The deposit watcher matches by
            sender — sending from this address won't auto-confirm.
          </p>
        )}
        {error && (
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--danger)" }}>{error}</p>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {txSubmitted ? (
          <button type="button" className="btn" onClick={refresh}>
            <Icon name="zap" size={12} /> Refresh status
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary-big"
            style={{ background: "var(--accent)", opacity: submitting ? 0.6 : 1 }}
            disabled={submitting}
            onClick={onPay}
          >
            <Icon name="zap" size={12} /> {submitting ? "Submitting…" : `Pay ${tonLabel} TON`}
          </button>
        )}
      </div>
    </div>
  );
}

// ────────────────────────── Stages section ──────────────────────────
// Multi-round funding (2026-05-13). Renders the project's stage timeline,
// lets the owner start the next stage when the previous one closes, and
// surfaces a TonConnect "Fund this stage" CTA when a freshly-created
// stage is in `pending` state (waiting for the deposit watcher).

const STAGE_STATUS = {
  pending:  { label: "Awaiting funding",            tone: "amber"  },
  funded:   { label: "Funded · awaiting activation", tone: "amber"  },
  active:   { label: "Active",                       tone: "accent" },
  closed:   { label: "Closed",                       tone: "muted"  },
};

function StagesSection({ live, isOwner, refresh }) {
  const [stages, setStages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);
  const idOrSlug = live?.slug || live?.id;

  useEffect(() => {
    if (!idOrSlug) return;
    let cancelled = false;
    setLoading(true);
    api.projectStages(idOrSlug).then((res) => {
      if (cancelled) return;
      setStages(res?.stages || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [idOrSlug, reloadTick]);

  const reloadStages = () => setReloadTick((n) => n + 1);

  // Background poll while any stage is mid-flight, so the UI flips
  // pending → funded → active without manual refresh.
  useEffect(() => {
    if (!stages) return undefined;
    const inFlight = stages.some((s) => s.status === "pending" || (s.status === "funded" && !s.activated_at));
    if (!inFlight) return undefined;
    const t = setTimeout(reloadStages, 6000);
    return () => clearTimeout(t);
  }, [stages]);

  if (loading || stages == null) return null;
  if (stages.length === 0) return null;

  const last = stages[stages.length - 1];
  const canStartNext = isOwner && live.status === "live" && last.status === "closed";

  return (
    <section style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800 }}>
          <Icon name="layers" size={12} /> Stages
          <span style={{ fontSize: 10, color: "var(--fg-muted)", fontWeight: 600 }}>
            {stages.length}
          </span>
        </div>
        {canStartNext && <span style={{ fontSize: 11, color: "var(--accent-fg)" }}>Stage {last.stage_number} closed — start the next round below</span>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        {stages.map((s, i) => (
          <StageCard
            key={s.id}
            stage={s}
            isLast={i === stages.length - 1}
            isOwner={isOwner}
            refresh={() => { reloadStages(); refresh(); }}
          />
        ))}
      </div>

      {canStartNext && (
        <CreateStageForm
          projectIdOrSlug={idOrSlug}
          nextStageNumber={last.stage_number + 1}
          onCreated={() => { reloadStages(); refresh(); }}
        />
      )}
    </section>
  );
}

function StageCard({ stage, isLast, isOwner, refresh }) {
  const cfg = STAGE_STATUS[stage.status] || { label: stage.status, tone: "muted" };
  const tonPool = (Number(stage.ton_reward_pool_nano) || 0) / 1e9;
  const totalTasks = stage.tasks_count ?? 0;
  const mergedTasks = stage.tasks_merged ?? 0;
  const progressPct = totalTasks > 0 ? Math.round((mergedTasks / totalTasks) * 100) : 0;

  const toneBg = cfg.tone === "accent" ? "var(--accent-soft)"
    : cfg.tone === "amber" ? "oklch(0.96 0.05 80)"
    : "var(--bg-tint)";
  const toneFg = cfg.tone === "accent" ? "var(--accent-fg)"
    : cfg.tone === "amber" ? "#b45309"
    : "var(--fg-muted)";

  return (
    <div style={{
      border: `1px solid ${isLast && cfg.tone !== "muted" ? "var(--border-strong)" : "var(--border)"}`,
      borderRadius: 10,
      background: "var(--bg)",
      overflow: "hidden",
    }}>
      <div className="agnt-resp-stage-head" style={{
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        padding: "14px 18px",
        borderBottom: totalTasks > 0 ? "1px solid var(--border)" : "none",
      }}>
        <div style={{
          display: "grid", placeItems: "center",
          width: 40, height: 40, borderRadius: 10,
          background: toneBg, color: toneFg,
          fontFamily: "JetBrains Mono, monospace", fontWeight: 800, fontSize: 16,
          flexShrink: 0,
        }}>
          {stage.stage_number}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>
              Stage {stage.stage_number}
            </span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "2px 8px", borderRadius: 999,
              background: toneBg, color: toneFg,
              fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 800,
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              {(stage.status === "active" || stage.status === "funded") && <span className="live-dot" />}
              {cfg.label}
            </span>
          </div>
          {stage.plan_md && (
            <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5, maxWidth: "70ch", overflow: "hidden", textOverflow: "ellipsis" }}>
              {stage.plan_md.slice(0, 220)}{stage.plan_md.length > 220 ? "…" : ""}
            </div>
          )}
        </div>
        <div style={{
          textAlign: "right",
          fontFamily: "JetBrains Mono, monospace",
          fontVariantNumeric: "tabular-nums",
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: tonPool > 0 ? "var(--accent-fg)" : "var(--fg-muted)" }}>
            ◇ {tonPool.toLocaleString(undefined, { maximumFractionDigits: 3 })} TON
          </div>
          {stage.jetton_mint_amount > 0 && (
            <div style={{ fontSize: 10.5, color: "var(--fg-muted)", marginTop: 2 }}>
              + {Number(stage.jetton_mint_amount).toLocaleString()} jetton units
            </div>
          )}
        </div>
      </div>

      {totalTasks > 0 && (
        <div style={{ padding: "10px 18px", display: "flex", alignItems: "center", gap: 14, fontSize: 11.5, color: "var(--fg-muted)" }}>
          <div style={{ flex: 1, height: 6, background: "var(--bg-tint)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: progressPct === 100 ? "var(--accent)" : "var(--accent)", transition: "width 0.2s ease" }} />
          </div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontVariantNumeric: "tabular-nums" }}>
            {mergedTasks}/{totalTasks} merged
          </div>
        </div>
      )}

      {stage.status === "pending" && isOwner && (
        <StageFundCTA stage={stage} refresh={refresh} />
      )}
    </div>
  );
}

function StageFundCTA({ stage, refresh }) {
  const tonAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const [submitting, setSubmitting] = useState(false);
  const [txSubmitted, setTxSubmitted] = useState(false);
  const [error, setError] = useState("");

  const dest = stage.funding_address || PLATFORM_TON_WALLET;
  const amount = stage.funding_amount_nano != null
    ? String(stage.funding_amount_nano)
    : String(stage.ton_reward_pool_nano || 0);
  const tonAmount = (Number(amount) || 0) / 1e9;

  async function onPay() {
    if (!dest) {
      setError("Funding destination unknown for this stage.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      if (!tonAddress) {
        await tonConnectUI.openModal();
        if (!tonConnectUI.connected) { setSubmitting(false); return; }
      }
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 360,
        messages: [{ address: dest, amount }],
      });
      setTxSubmitted(true);
      // Bump the parent stage list quickly — watcher takes ~10-60s.
      setTimeout(refresh, 6000);
    } catch (err) {
      if (err?.message?.toLowerCase()?.includes("reject")) {
        setError("Transaction rejected in your wallet.");
      } else {
        setError(String(err?.message || err) || "Wallet transfer failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="agnt-resp-banner" style={{
      padding: "12px 18px",
      borderTop: "1px solid var(--border)",
      background: "oklch(0.98 0.025 80)",
      display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
    }}>
      <div style={{ flex: 1, minWidth: 220, fontSize: 12, color: "var(--fg)", lineHeight: 1.5 }}>
        {txSubmitted
          ? <>Transaction submitted. Waiting for the deposit watcher to confirm — this stage will flip to <strong>funded</strong> within ~10–60s.</>
          : <>Send <strong>{tonAmount.toLocaleString(undefined, { maximumFractionDigits: 3 })} TON</strong> from the project's owner wallet to fund this stage. Auto-confirms on-chain — no admin needed.</>}
        {error && <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--danger)" }}>{error}</div>}
      </div>
      {!txSubmitted && (
        <button
          type="button"
          className="btn-primary-big"
          style={{ background: "var(--accent)", opacity: submitting ? 0.6 : 1 }}
          disabled={submitting || !dest}
          onClick={onPay}
        >
          <Icon name="zap" size={12} /> {submitting ? "Submitting…" : `Pay ${tonAmount.toLocaleString(undefined, { maximumFractionDigits: 3 })} TON`}
        </button>
      )}
    </div>
  );
}

function CreateStageForm({ projectIdOrSlug, nextStageNumber, onCreated }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("ai"); // "ai" | "manual"
  const [pool, setPool] = useState("5");
  const [mint, setMint] = useState("0");
  const [brief, setBrief] = useState("");
  const [tasks, setTasks] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [moderationReason, setModerationReason] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  function triggerShake() { setShakeKey((n) => n + 1); }

  async function onSubmit(e) {
    e?.preventDefault();
    setError("");
    setModerationReason("");
    const poolNano = Math.round((parseFloat(pool) || 0) * 1e9);
    if (poolNano <= 0) { setError("Reward pool must be > 0 TON."); triggerShake(); return; }
    const mintAmount = Math.round((parseFloat(mint) || 0) * 1e9);
    if (!token) { setError("Sign in as the project owner first."); triggerShake(); return; }

    const body = {
      ton_reward_pool_nano: poolNano,
      jetton_mint_amount: mintAmount,
    };
    if (mode === "manual") {
      const errs = validateManualPlan({ tasks }, "stage");
      if (errs.length > 0) { setError(errs[0]); triggerShake(); return; }
      body.manual_tasks = tasks.map((t) => ({
        slug: t.slug.trim().toUpperCase(),
        title: t.title.trim(),
        body_md: t.body_md,
        difficulty: t.difficulty || undefined,
        weight: Number(t.weight),
        tags: (t.tags && t.tags.length) ? t.tags : undefined,
      }));
    } else {
      if (!brief.trim()) { setError("Tell agents what ships in this stage."); triggerShake(); return; }
      body.plan_brief = brief.trim();
    }

    setSubmitting(true);
    const res = await api.createProjectStage(projectIdOrSlug, body, token);
    setSubmitting(false);
    if (res.status === 401 || res.status === 403) { setError("Only the project owner can start a new stage."); triggerShake(); return; }
    if (res.status === 409) {
      // The API surfaces `previous_stage` + `previous_status` for the
      // "stage N is still open" path. Show them so the owner knows which
      // stage is blocking and what state it's currently in.
      const prevN = res.data?.previous_stage;
      const prevS = res.data?.previous_status;
      const hint  = prevN != null && prevS
        ? `Stage ${prevN} is still ${prevS} — wait for it to close before starting stage ${nextStageNumber}.`
        : (res.data?.error || "Previous stage is not closed yet.");
      setError(hint);
      triggerShake();
      return;
    }
    if (res.status === 400 && res.data?.rejection_reason) {
      setModerationReason(res.data.rejection_reason); triggerShake(); return;
    }
    if (!res.ok) { setError(res.data?.error || `Request failed (HTTP ${res.status}).`); triggerShake(); return; }
    setOpen(false);
    setBrief("");
    setTasks([]);
    onCreated?.();
  }

  if (!open) {
    return (
      <div style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn-primary-big"
          style={{ background: "var(--accent)" }}
          onClick={() => setOpen(true)}
        >
          <Icon name="plus" size={12} /> Start stage {nextStageNumber}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        marginTop: 14, padding: 18,
        border: "1px solid var(--border-strong)", borderRadius: 10,
        background: "var(--bg-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>
          Start stage {nextStageNumber}
        </div>
        <ModeSwitcher
          value={mode}
          onChange={(m) => { setMode(m); setError(""); setModerationReason(""); }}
          options={[
            { value: "ai",     label: "AI from brief",  icon: "zap" },
            { value: "manual", label: "I'll write tasks", icon: "layers" },
          ]}
        />
      </div>
      <p style={{ margin: "2px 0 14px", fontSize: 11.5, color: "var(--fg-muted)", lineHeight: 1.5, maxWidth: "70ch" }}>
        {mode === "ai"
          ? <>Describe what ships and the validator agent generates the task list once your deposit confirms.</>
          : <>Author each task yourself. The full mint goes to agents — weights must sum to <strong>1.00</strong>.</>}
      </p>

      <RejectionBanner reason={moderationReason} onDismiss={() => setModerationReason("")} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Field label="Reward pool (TON)" hint="Funded after creation; auto-confirms via TonConnect.">
          <input
            type="number" min={0} step={0.001} value={pool}
            onChange={(e) => setPool(e.target.value)}
            style={monoInputStyle}
          />
        </Field>
        <Field label="Extra mint (jettons, optional)" hint="Additional supply minted on stage activation.">
          <input
            type="number" min={0} step={1} value={mint}
            onChange={(e) => setMint(e.target.value)}
            style={monoInputStyle}
          />
        </Field>
      </div>

      {mode === "ai" ? (
        <div style={{ marginTop: 12 }}>
          <Field label="What ships in this stage?" hint="One paragraph is enough — the planner expands it into tasks.">
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={3}
              placeholder="e.g. dark mode, mobile sheet, replace REST polling with SSE"
              style={{ ...inputStyle, fontSize: 13, lineHeight: 1.5, resize: "vertical" }}
            />
          </Field>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <SectionHeader first hint={`${tasks.length} task${tasks.length === 1 ? "" : "s"} · weights must sum to 1.00`}>
            Tasks
          </SectionHeader>
          <TasksEditor
            tasks={tasks}
            onChange={setTasks}
            isStage
            stageNumber={nextStageNumber}
          />
        </div>
      )}

      {error && (
        <div className="agnt-fade-in" style={{ marginTop: 10, padding: 10, border: "1px solid var(--danger)", borderRadius: 6, background: "var(--danger-soft)", color: "var(--danger)", fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button
          key={shakeKey}
          type="submit"
          className={shakeKey > 0 ? "agnt-shake btn-primary-big" : "btn-primary-big"}
          style={{ background: "var(--accent)", opacity: submitting ? 0.6 : 1 }}
          disabled={submitting}
        >
          <Icon name="zap" size={12} /> {submitting ? "Creating…" : `Create stage ${nextStageNumber}`}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─────────────────────── Project payouts section ───────────────────────
// Renders on the project page's Contributors tab. Pulls:
//   GET /builder/projects/:id/payouts/summary?weeks=12  (tiles + chart)
//   GET /builder/projects/:id/payouts?limit=50          (who got paid)
// Empty state encourages the first contributor.
function ProjectPayoutsSection({ slug, live }) {
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const idOrSlug = slug || live?.id;

  useEffect(() => {
    if (!idOrSlug) return;
    let cancelled = false;
    setLoading(true);
    setSummary(null);
    setRows(null);
    Promise.all([
      api.projectPayoutsSummary(idOrSlug, { weeks: 12 }),
      api.projectPayouts(idOrSlug, { limit: 50 }),
    ]).then(([s, p]) => {
      if (cancelled) return;
      setSummary(s || null);
      setRows(p?.payouts || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [idOrSlug]);

  if (loading) {
    return (
      <div style={{ padding: "28px 0", color: "var(--fg-muted)", fontSize: 12.5, textAlign: "center" }}>
        Loading payouts…
      </div>
    );
  }
  if (!summary) {
    return (
      <div style={{
        padding: 28, border: "1px dashed var(--border)", borderRadius: 10,
        background: "var(--bg-soft)", textAlign: "center", color: "var(--fg-muted)", fontSize: 12.5,
      }}>
        No payout data yet for this project.
      </div>
    );
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SummaryTiles summary={summary} />
      <ExtraCountsRow
        items={[
          { label: "agents paid", value: summary.agents_paid, icon: "users" },
          { label: "tasks paid", value: summary.tasks_paid, icon: "layers" },
        ]}
      />
      {summary.weekly && summary.weekly.length > 0 && <WeeklyBars weekly={summary.weekly} />}
      <div>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          padding: "8px 0 12px",
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon name="users" size={12} /> Who got paid
            <span style={{ fontSize: 10, color: "var(--fg-muted)", fontWeight: 600 }}>
              {rows?.length ?? 0}
            </span>
          </div>
          {summary.lifetime?.payout_count > (rows?.length || 0) && (
            <span style={{ fontSize: 10.5, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace" }}>
              showing most-recent 50 of {summary.lifetime.payout_count}
            </span>
          )}
        </div>
        <PayoutsList
          rows={rows}
          mode="project"
          collapseAt={10}
          emptyText="No one has been paid on this project yet — be the first to ship a PR."
        />
      </div>
    </section>
  );
}
