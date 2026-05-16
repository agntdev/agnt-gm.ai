import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import { Icon } from "../components/atoms.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
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
import OwnerPaymentScreen from "../components/ownerPayment.jsx";
import { api, PLATFORM_TON_WALLET } from "../lib/api.js";
import { emptyAddTask, validateAddTasks, validateManualPlan } from "../lib/manualPlan.js";
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
        >
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <ProjectFactsRail live={live} owner={owner} taskCount={taskCount} isOwner={isOwner} refresh={refresh} />
          </div>
        </ProjectHero>
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
                <TokenRail live={live} isOwner={isOwner} refresh={refresh} />
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
      <div className="proj-details-grid">
        <div className="proj-details-cell" style={{ color: "var(--fg-muted)", fontSize: 12 }}>
          Loading…
        </div>
      </div>
    );
  }

  const ownerName = owner
    ? (owner.github_username || owner.display_name || owner.id?.slice(0, 8))
    : (live.owner_agent_id ? `${live.owner_agent_id.slice(0, 8)}…` : "—");
  const ownerInitial = (ownerName || "?").slice(0, 1).toUpperCase();
  const liveUrl = live.live_url;

  return (
    <div className="proj-details-grid">
      <div className="proj-details-cell">
        <div className="l">Owner</div>
        <div className="v" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {owner?.github_avatar_url ? (
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
              {ownerInitial}
            </span>
          )}
          {ownerName}
        </div>
      </div>

      <div className="proj-details-cell">
        <div className="l">Tasks</div>
        <div className="v">{taskCount ?? 0}</div>
      </div>

      <div className="proj-details-cell">
        <div className="l">Published</div>
        <div className="v">{fmtDate(live.published_at) || "—"}</div>
      </div>

      <div className="proj-details-cell">
        <div className="l">Deadline</div>
        <div className="v" style={{ color: live.deadline ? "var(--fg)" : "var(--fg-muted)" }}>
          {fmtDate(live.deadline) || "no deadline"}
        </div>
      </div>

      <div className="proj-details-cell">
        <div className="l">Live site</div>
        <div className="v" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
          {liveUrl ? (
            <a
              href={liveUrl}
              target="_blank"
              rel="noreferrer"
              title={liveUrl}
              style={{ color: "var(--fg)", textDecoration: "none" }}
            >
              {liveUrl.replace(/^https?:\/\//, "")}
            </a>
          ) : (
            <span style={{ color: "var(--fg-muted)" }}>—</span>
          )}
        </div>
      </div>

      <div className="proj-details-cell">
        <div className="l">Auto review</div>
        <div className="v">
          <AutoMergeCell live={live} isOwner={isOwner} refresh={refresh} />
        </div>
      </div>
    </div>
  );
}

// AutoMergeRow — one row in the facts rail, inline toggle visible only
// to the project owner. Optimistically flips the chip; on failure it
// reverts and surfaces the API error in the tooltip.
function AutoMergeCell({ live, isOwner, refresh }) {
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
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
  );
}

function shortAddr(addr) {
  if (!addr) return "—";
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

function TokenRail({ live, isOwner, refresh }) {
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

      <SupplyLockRow live={live} isOwner={isOwner} refresh={refresh} />

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

// SupplyLockRow — "Supply: 🔓 mintable / 🔒 frozen" with an inline
// owner-only "Lock forever" CTA. One-way action, ConfirmModal gate.
function SupplyLockRow({ live, isOwner, refresh }) {
  const { token } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const locked = !!live.jetton_admin_locked_at;

  async function onConfirm() {
    if (!token) { setError("Sign in as the project owner."); return; }
    setPending(true);
    setError("");
    const res = await api.lockJettonAdmin(live.slug || live.id, token);
    setPending(false);
    if (!res.ok) {
      setError(res.data?.error || `Failed (HTTP ${res.status}).`);
      return;
    }
    setConfirmOpen(false);
    refresh?.();
  }

  return (
    <>
      <div className="fact-row">
        <span className="l">Supply</span>
        <span className="v" style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            title={locked
              ? `Admin renounced ${new Date(live.jetton_admin_locked_at).toLocaleString()} — no further minting possible.`
              : "Admin slot is still held by the platform — new tasks can mint more supply."}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "2px 8px", borderRadius: 999,
              background: locked ? "var(--bg-tint)" : "var(--accent-soft)",
              color:      locked ? "var(--fg)"      : "var(--accent-fg)",
              border: locked ? "1px solid var(--border-strong)" : "1px solid var(--accent)",
              fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 800,
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}
          >
            {locked ? "🔒 frozen" : "🔓 mintable"}
          </span>
          {isOwner && !locked && (
            <button
              type="button"
              onClick={() => { setError(""); setConfirmOpen(true); }}
              title="Renounce admin slot — one-way action."
              style={{
                padding: "2px 8px", borderRadius: 4,
                border: "1px solid var(--border)",
                background: "var(--bg)", color: "var(--fg-muted)",
                fontSize: 10, fontWeight: 800, letterSpacing: "0.05em",
                textTransform: "uppercase",
                cursor: "pointer",
                fontFamily: "JetBrains Mono, monospace",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.borderColor = "var(--danger)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fg-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
            >
              Lock forever
            </button>
          )}
        </span>
      </div>
      {error && (
        <div className="fact-row" style={{ padding: "6px 16px" }}>
          <span className="l" />
          <span style={{ fontSize: 11, color: "var(--danger)" }}>{error}</span>
        </div>
      )}
      <ConfirmModal
        open={confirmOpen}
        danger
        title="Lock token supply forever?"
        confirmLabel="Yes, lock supply forever"
        cancelLabel="Cancel"
        loading={pending}
        onCancel={() => { if (!pending) setConfirmOpen(false); }}
        onConfirm={onConfirm}
        body={
          <>
            After this fires you will <strong>not</strong> be able to mint
            any more <code style={{ fontFamily: "JetBrains Mono, monospace" }}>${live.token_symbol}</code>
            {" "}for this project, including in future stage activations or
            add-tasks calls. <strong>This is a one-way action.</strong>
          </>
        }
      />
    </>
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

  // BuilderStageCloser worker flips active → closed automatically
  // every 10 min once all tasks merged + payouts settled. The owner
  // may be looking at an `active` stage when that flip happens —
  // refetch when the tab regains focus so the UI doesn't show stale
  // status (and the Add-tasks CTA doesn't dangle on a closed stage).
  useEffect(() => {
    const onFocus = () => reloadStages();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

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
            live={live}
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

function StageCard({ stage, isLast, isOwner, refresh, live }) {
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

      {stage.status === "active" && isOwner && (
        <AddTasksCTA stage={stage} refresh={refresh} live={live} />
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

// CreateStageForm — unified AI-first flow (per owner request 2026-05-15):
//   1. Owner enters a brief + pool + mint.
//   2. Clicks "Generate tasks" → server-side LLM drafts a task list.
//   3. Tasks appear in TasksEditor; owner edits / adds / removes freely.
//   4. Clicks "Submit & pay" → POST /stages with the (edited) manual_tasks
//      list → returns pending stage + intent → owner pays.
// The old "I'll write tasks" mode-switcher is gone — flexibility now
// comes from editing the AI draft, including deleting everything and
// writing from scratch.
function CreateStageForm({ projectIdOrSlug, nextStageNumber, onCreated }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [pool, setPool] = useState("5");
  const [mint, setMint] = useState("0");
  const [brief, setBrief] = useState("");
  const [tasks, setTasks] = useState([]);
  const [phase, setPhase] = useState("input"); // input | generating | edit
  // approx_count is a hint to the LLM; ~3 tasks per stage is the sweet
  // spot for a single round of contributions. Hardcoded for now; can
  // be exposed as a number stepper later if owners ask.
  const approxCount = 3;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [moderationReason, setModerationReason] = useState("");
  // Set when the LLM response came from Redis cache (cached_at on the
  // payload). Lets us render a small "served from cache" hint above
  // the draft so the owner knows a regenerate was free.
  const [cachedAt, setCachedAt] = useState(null);
  const [shakeKey, setShakeKey] = useState(0);
  function triggerShake() { setShakeKey((n) => n + 1); }

  async function onGenerate() {
    setError("");
    setModerationReason("");
    if (brief.trim().length < 20) {
      setError("Brief too short — describe what should ship (min 20 chars).");
      triggerShake();
      return;
    }
    const poolNano = Math.round((parseFloat(pool) || 0) * 1e9);
    if (poolNano <= 0) {
      setError("Set the reward pool above before generating tasks — the planner uses it to balance the weights.");
      triggerShake();
      return;
    }

    setPhase("generating");
    const res = await api.previewNewStageTasks(projectIdOrSlug, {
      brief: brief.trim(),
      approx_count: approxCount,
      stage_ton_nano: poolNano,
      nextStageNumber,
    }, token);

    if (!res.ok) {
      setPhase("input");
      if (res.data?.rejection_reason) {
        setModerationReason(res.data.rejection_reason);
      } else if (res.status === 429) {
        const retry = Number(res.data?.retry_after_seconds);
        setError(Number.isFinite(retry) && retry > 0
          ? `Rate limit hit (10 drafts per hour). Try again in ${Math.ceil(retry / 60)} min.`
          : "Rate limit hit (10 drafts per hour). Try again later.");
      } else if (res.status === 502) {
        setError("The LLM planner is unreachable right now. Try again in a moment.");
      } else {
        setError(res.data?.error || `Could not draft tasks (HTTP ${res.status}).`);
      }
      triggerShake();
      return;
    }
    setCachedAt(res.data?.cached_at || null);
    setTasks(res.data.tasks || []);
    setPhase("edit");
  }

  async function onSubmit(e) {
    e?.preventDefault();
    setError("");
    setModerationReason("");
    const poolNano = Math.round((parseFloat(pool) || 0) * 1e9);
    if (poolNano <= 0) { setError("Reward pool must be > 0 TON."); triggerShake(); return; }
    const mintAmount = Math.round((parseFloat(mint) || 0) * 1e9);
    if (!token) { setError("Sign in as the project owner first."); triggerShake(); return; }

    const errs = validateManualPlan({ tasks }, "stage");
    if (errs.length > 0) { setError(errs[0]); triggerShake(); return; }

    const body = {
      ton_reward_pool_nano: poolNano,
      jetton_mint_amount: mintAmount,
      manual_tasks: tasks.map((t) => ({
        slug: (t.slug || "").trim().toUpperCase() || undefined,
        title: t.title.trim(),
        body_md: t.body_md,
        difficulty: t.difficulty || undefined,
        weight: Number(t.weight),
        tags: (t.tags && t.tags.length) ? t.tags : undefined,
      })),
    };

    setSubmitting(true);
    const res = await api.createProjectStage(projectIdOrSlug, body, token);
    setSubmitting(false);
    if (res.status === 401 || res.status === 403) { setError("Only the project owner can start a new stage."); triggerShake(); return; }
    if (res.status === 409) {
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
    setPhase("input");
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>
          Start stage {nextStageNumber}
        </div>
        <span style={{ fontSize: 10.5, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          AI drafts → you edit → pay
        </span>
      </div>

      <RejectionBanner reason={moderationReason} onDismiss={() => setModerationReason("")} />

      <div className="agnt-resp-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
        <Field label="Reward pool (TON)" hint="Auto-confirms via TonConnect.">
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

      <div style={{ marginTop: 12 }}>
        <Field
          label="What ships in this stage?"
          hint="One paragraph is enough — the validator agent expands it into tasks."
        >
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="e.g. dark mode toggle, mobile sheet, replace REST polling with SSE"
            style={{ ...inputStyle, fontSize: 13, lineHeight: 1.5, resize: "vertical" }}
          />
        </Field>
      </div>

      <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--fg-muted)", lineHeight: 1.5, padding: "8px 12px", borderRadius: 6, background: "var(--bg)" }}>
        ⓘ The validator agent drafts ~{approxCount} tasks from your brief. <strong>You'll be able to add, remove or fully rewrite any of them</strong> before the deposit is sent.
      </div>

      {phase === "input" && (
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button
            key={shakeKey}
            type="button"
            onClick={onGenerate}
            disabled={phase === "generating"}
            className={shakeKey > 0 ? "agnt-shake btn-primary-big" : "btn-primary-big"}
            style={{ background: "var(--accent)" }}
          >
            <Icon name="zap" size={12} /> Generate tasks
          </button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      )}

      {phase === "generating" && (
        <div style={{ marginTop: 14, padding: 14, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="live-dot" />
          <span style={{ fontSize: 12.5, color: "var(--fg)" }}>Drafting tasks from your brief…</span>
        </div>
      )}

      {phase === "edit" && (
        <>
          <SectionHeader hint={`${tasks.length} task${tasks.length === 1 ? "" : "s"} drafted · weights must sum to 1.00 · feel free to edit, add or remove`}>
            Draft tasks
          </SectionHeader>
          {cachedAt && (
            <div style={{
              marginTop: 8, fontSize: 10.5, color: "var(--fg-muted)",
              fontFamily: "JetBrains Mono, monospace",
              letterSpacing: "0.04em", textTransform: "uppercase",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              ⓘ served from cache — free regenerate
            </div>
          )}
          <TasksEditor
            tasks={tasks}
            onChange={setTasks}
            isStage
            stageNumber={nextStageNumber}
          />

          {error && (
            <div className="agnt-fade-in" style={{ marginTop: 10, padding: 10, border: "1px solid var(--danger)", borderRadius: 6, background: "var(--danger-soft)", color: "var(--danger)", fontSize: 12 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button
              key={shakeKey}
              type="submit"
              disabled={submitting || tasks.length === 0}
              className={shakeKey > 0 ? "agnt-shake btn-primary-big" : "btn-primary-big"}
              style={{ background: "var(--accent)", opacity: submitting ? 0.6 : 1 }}
            >
              <Icon name="zap" size={12} /> {submitting ? "Creating…" : `Submit & pay`}
            </button>
            <button type="button" className="btn" onClick={() => { setPhase("input"); setTasks([]); }}>
              ← Back to brief
            </button>
            <button type="button" className="btn" onClick={() => setOpen(false)} style={{ marginLeft: "auto" }}>
              Cancel
            </button>
          </div>
        </>
      )}

      {phase === "input" && error && (
        <div className="agnt-fade-in" style={{ marginTop: 10, padding: 10, border: "1px solid var(--danger)", borderRadius: 6, background: "var(--danger-soft)", color: "var(--danger)", fontSize: 12 }}>
          {error}
        </div>
      )}
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

// ─────────────── AddTasksCTA + AddTasksForm ───────────────
//
// On an active stage, owner can add new tasks via the new add-tasks
// endpoint. Flow:
//   1. Click "+ Add tasks" → AddTasksForm expands inline on the card.
//   2. Owner fills the multi-row form; live BudgetMeter enforces sum=1.
//   3. Submit → POST /stages/:n/add-tasks
//        - 400 with layer1_errors → highlight per-field
//        - 400 with llm_reject    → "Submit anyway" path (skip_coherence)
//        - 202 with intent        → open OwnerPaymentScreen modal
//   4. Modal polls /owner-payments/:id until confirmed (or expired).
//   5. On confirmed → refetch stage + tasks (executor mutated both).

function AddTasksCTA({ stage, refresh, live }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div style={{ padding: "10px 18px", borderTop: "1px solid var(--border)" }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            padding: "8px 14px", borderRadius: 8,
            border: "1px dashed var(--border-strong)",
            background: "transparent",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase",
            color: "var(--fg-muted)", cursor: "pointer",
            transition: "color 0.15s ease, border-color 0.15s ease, background 0.15s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fg)"; e.currentTarget.style.borderColor = "var(--fg)"; e.currentTarget.style.background = "var(--bg-soft)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fg-muted)"; e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.background = "transparent"; }}
        >
          + Add tasks to stage
        </button>
      </div>
    );
  }
  return <AddTasksForm stage={stage} live={live} onCancel={() => setOpen(false)} onDone={() => { setOpen(false); refresh(); }} />;
}

function AddTasksForm({ stage, live, onCancel, onDone }) {
  const { token } = useAuth();
  // AI-first flow (per owner request 2026-05-15):
  //   phase=input    → owner writes a brief + top-up
  //   phase=generating → /preview-tasks LLM call in flight
  //   phase=edit     → tasks rendered in TasksEditor, owner can edit/add/delete
  //   submit → /add-tasks → owner-payment intent → OwnerPaymentScreen
  const [phase, setPhase] = useState("input");
  const [brief, setBrief] = useState("");
  const [tasks, setTasks] = useState([]);
  const [deltaTon, setDeltaTon] = useState("1");          // human TON, → ×1e9
  const [deltaJetton, setDeltaJetton] = useState("0");    // whole jetton units
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [layer1Errors, setLayer1Errors] = useState([]);   // [{field, message}]
  const [llmReasons, setLlmReasons] = useState(null);     // string[] | null
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [intent, setIntent] = useState(null);
  const [cachedAt, setCachedAt] = useState(null);
  const approxCount = 3;

  const supplyLocked = !!live?.jetton_admin_locked_at;
  const existingTon = (Number(stage.ton_reward_pool_nano) || 0) / 1e9;
  const existingCount = stage.tasks_count || 0;

  // Preview math: existing tasks keep their absolute TON shares
  // (server rescales weights, but `weight × pool` stays put). New
  // tasks get the FULL delta_ton split by their weight_within_new.
  const deltaTonNum = Math.max(0, parseFloat(deltaTon) || 0);
  const newPoolTon = existingTon + deltaTonNum;

  async function onGenerate() {
    setErrorMsg("");
    setLayer1Errors([]);
    setLlmReasons(null);
    if (brief.trim().length < 20) {
      setErrorMsg("Brief too short — describe what should ship (min 20 chars).");
      return;
    }
    if (deltaTonNum <= 0) {
      setErrorMsg("Set the TON top-up above before generating — the planner uses it to balance weights.");
      return;
    }
    setPhase("generating");
    const res = await api.previewAddTasks(live.slug || live.id, stage.stage_number, {
      brief: brief.trim(),
      approx_count: approxCount,
      delta_ton_nano: Math.round(deltaTonNum * 1e9),
    }, token);
    if (!res.ok) {
      setPhase("input");
      if (res.data?.rejection_reason) {
        setErrorMsg(`Moderation rejected the brief: ${res.data.rejection_reason}`);
      } else if (res.status === 429) {
        const retry = Number(res.data?.retry_after_seconds);
        setErrorMsg(Number.isFinite(retry) && retry > 0
          ? `Rate limit hit (10 drafts per hour). Try again in ${Math.ceil(retry / 60)} min.`
          : "Rate limit hit (10 drafts per hour). Try again later.");
      } else if (res.status === 502) {
        setErrorMsg("The LLM planner is unreachable right now. Try again in a moment.");
      } else {
        setErrorMsg(res.data?.error || `Could not draft tasks (HTTP ${res.status}).`);
      }
      return;
    }
    setCachedAt(res.data?.cached_at || null);
    setTasks(res.data.tasks || []);
    setPhase("edit");
  }

  function buildBody(skipCoherence = false) {
    const body = {
      tasks: tasks.map((t) => ({
        title: String(t.title || "").trim(),
        body_md: t.body_md || "",
        slug: String(t.slug || "").trim() || undefined,
        difficulty: t.difficulty || undefined,
        weight_within_new: Number(t.weight_within_new) || 0,
      })),
      delta_ton_nano: Math.round(deltaTonNum * 1e9),
    };
    if (!supplyLocked) {
      const jet = parseInt(deltaJetton, 10);
      body.delta_jetton_units = Number.isFinite(jet) && jet > 0 ? jet : 0;
    } else {
      body.delta_jetton_units = 0;
    }
    if (skipCoherence) body.skip_coherence = true;
    return body;
  }

  async function submit(skipCoherence = false) {
    setErrorMsg("");
    setLayer1Errors([]);
    setLlmReasons(null);

    const existingSlugs = new Set(); // we don't have task slugs on stage here; let the server check
    const errs = validateAddTasks(tasks, {
      existingSlugs,
      deltaTonNano: Math.round(deltaTonNum * 1e9),
      deltaJettonUnits: parseInt(deltaJetton, 10) || 0,
      supplyLocked,
    });
    if (errs.length > 0) { setErrorMsg(errs[0]); return; }

    setSubmitting(true);
    const res = await api.addTasksToStage(live.slug || live.id, stage.stage_number, buildBody(skipCoherence), token);
    setSubmitting(false);

    if (res.status === 400) {
      const data = res.data || {};
      if (data.llm_reject) {
        setLlmReasons(data.llm_reasons || []);
        return;
      }
      if (Array.isArray(data.layer1_errors) && data.layer1_errors.length) {
        setLayer1Errors(data.layer1_errors);
        return;
      }
      setErrorMsg(data.error || "Validation failed.");
      return;
    }
    if (res.status === 401 || res.status === 403) { setErrorMsg("Only the project owner can add tasks."); return; }
    if (res.status === 409) { setErrorMsg(res.data?.error || "Stage is no longer active."); return; }
    if (!res.ok) { setErrorMsg(res.data?.error || `Failed (HTTP ${res.status}).`); return; }

    // 202 with intent.
    if (res.data?.intent) {
      setIntent(res.data.intent);
    } else {
      setErrorMsg("Unexpected server response — no payment intent returned.");
    }
  }

  function onConfirmed() {
    // executor mutated stage + tasks — caller refetches both via onDone.
    setIntent(null);
    onDone();
  }

  // Convenience: live preview of existing rewards staying unchanged.
  const existingPreview = (
    <div style={{
      padding: "10px 14px",
      borderRadius: 8,
      background: "var(--bg-soft)",
      border: "1px solid var(--border)",
      fontSize: 11.5, color: "var(--fg)", lineHeight: 1.55,
    }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: "var(--fg-muted)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
        Preview
      </div>
      Stage will go from <strong>{existingCount} → {existingCount + tasks.length}</strong> tasks.
      Pool will go from <strong>{existingTon.toFixed(3)} → {newPoolTon.toFixed(3)} TON</strong>.
      {!supplyLocked && parseInt(deltaJetton, 10) > 0 && (
        <> Supply will mint another <strong>{Number(deltaJetton).toLocaleString()} ${live.token_symbol}</strong>.</>
      )}
      <div style={{ marginTop: 6, fontSize: 11, color: "var(--fg-muted)" }}>
        Existing {existingCount} task{existingCount === 1 ? "" : "s"} keep their TON shares — only the new {tasks.length} {tasks.length === 1 ? "task" : "tasks"} split the {deltaTonNum.toFixed(3)} TON top-up.
      </div>
    </div>
  );

  return (
    <>
      <div style={{ padding: "16px 18px", borderTop: "1px solid var(--border)", background: "oklch(0.99 0.01 240)" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>
            Add tasks to Stage {stage.stage_number}
          </div>
          <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>
            existing {existingCount} task{existingCount === 1 ? "" : "s"} — their TON shares stay unchanged
          </span>
        </div>

        {/* Top-up + supply controls live above the brief — the LLM
            uses delta_ton to balance weights, so the owner has to pick
            it BEFORE generating. */}
        <div className="agnt-resp-2col" style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="TON top-up" hint="Required > 0. Splits across the new tasks by weight.">
            <input
              type="number" min={0} step={0.001} value={deltaTon}
              onChange={(e) => setDeltaTon(e.target.value)}
              style={monoInputStyle}
            />
          </Field>
          <Field
            label="Extra jetton mint (optional)"
            hint={supplyLocked ? "Supply is frozen — must stay 0." : "Whole units. Leave 0 to keep current supply."}
          >
            <input
              type="number" min={0} step={1} value={supplyLocked ? "0" : deltaJetton}
              disabled={supplyLocked}
              onChange={(e) => setDeltaJetton(e.target.value)}
              style={{ ...monoInputStyle, opacity: supplyLocked ? 0.5 : 1 }}
            />
          </Field>
        </div>

        {phase === "input" && (
          <>
            <div style={{ marginTop: 12 }}>
              <Field label="What ships in these new tasks?" hint="One paragraph is enough — the validator agent expands it.">
                <textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="e.g. confetti animation on score increase + sound toggle"
                  style={{ ...inputStyle, fontSize: 13, lineHeight: 1.5, resize: "vertical" }}
                />
              </Field>
            </div>
            <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--fg-muted)", lineHeight: 1.5, padding: "8px 12px", borderRadius: 6, background: "var(--bg)" }}>
              ⓘ The validator agent drafts ~{approxCount} tasks from your brief. <strong>You'll be able to add, remove or fully rewrite any of them</strong> before paying.
            </div>
            {errorMsg && (
              <div style={{ marginTop: 10, padding: 10, fontSize: 12, border: "1px solid var(--danger)", borderRadius: 6, background: "var(--danger-soft)", color: "var(--danger)" }}>
                {errorMsg}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={onGenerate}
                className="btn-primary-big"
                style={{ background: "var(--accent)" }}
              >
                <Icon name="zap" size={12} /> Generate tasks
              </button>
              <button type="button" className="btn" onClick={onCancel}>Cancel</button>
            </div>
          </>
        )}

        {phase === "generating" && (
          <div style={{ marginTop: 14, padding: 14, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", display: "flex", alignItems: "center", gap: 10 }}>
            <span className="live-dot" />
            <span style={{ fontSize: 12.5, color: "var(--fg)" }}>Drafting tasks from your brief…</span>
          </div>
        )}

        {phase === "edit" && (
          <>
            <div style={{ marginTop: 14, fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--fg-muted)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 800 }}>
              Draft tasks — edit, add or remove
            </div>
            {cachedAt && (
              <div style={{
                marginTop: 4, fontSize: 10.5, color: "var(--fg-muted)",
                fontFamily: "JetBrains Mono, monospace",
                letterSpacing: "0.04em", textTransform: "uppercase",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                ⓘ served from cache — free regenerate
              </div>
            )}

            <TasksEditor
              tasks={tasks}
              onChange={setTasks}
              isStage
              stageNumber={stage.stage_number}
              weightField="weight_within_new"
              newTaskFactory={({ tasks: ts, stageNumber }) => emptyAddTask({ tasks: ts, stageNumber })}
            />

            {llmReasons && (
              <div style={{
                marginTop: 10, padding: 12, borderRadius: 8,
                background: "var(--danger-soft)", border: "1px solid var(--danger)",
              }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--danger)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                  Coherence check rejected the batch
                </div>
                {llmReasons.map((r, i) => r ? (
                  <div key={i} style={{ fontSize: 12, color: "var(--fg)", lineHeight: 1.5, marginTop: 4 }}>
                    <strong>Task #{i + 1}</strong>: {r}
                  </div>
                ) : null)}
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--fg-muted)" }}>
                  Edit the rejected tasks, or override the check if you're sure.
                </div>
              </div>
            )}

            {layer1Errors.length > 0 && (
              <div style={{
                marginTop: 10, padding: 12, borderRadius: 8,
                background: "var(--danger-soft)", border: "1px solid var(--danger)",
                fontSize: 12, color: "var(--danger)",
              }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Fix these before retrying:</div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                  {layer1Errors.map((e, i) => (
                    <li key={i}><code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>{e.field}</code> — {e.message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              {existingPreview}
            </div>

            {errorMsg && (
              <div style={{
                marginTop: 10, padding: 10, fontSize: 12,
                border: "1px solid var(--danger)", borderRadius: 6,
                background: "var(--danger-soft)", color: "var(--danger)",
              }}>
                {errorMsg}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => submit(false)}
                disabled={submitting || tasks.length === 0}
                className="btn-primary-big"
                style={{ background: "var(--accent)", opacity: submitting ? 0.6 : 1 }}
              >
                <Icon name="zap" size={12} /> {submitting ? "Validating…" : "Submit & Pay"}
              </button>
              {llmReasons && (
                <button
                  type="button"
                  onClick={() => setConfirmSkip(true)}
                  className="btn"
                  style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                >
                  Submit anyway
                </button>
              )}
              <button type="button" className="btn" onClick={() => { setPhase("input"); setTasks([]); }}>
                ← Back to brief
              </button>
              <button type="button" className="btn" onClick={onCancel} style={{ marginLeft: "auto" }}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>

      <ConfirmModal
        open={confirmSkip}
        danger
        title="Skip the coherence check?"
        confirmLabel="Yes, submit anyway"
        body={
          <>
            The platform's LLM thinks at least one task in this batch isn't a
            coherent unit of software work. Skipping forwards the batch
            straight to activation — agents may still ignore unclear tasks.
            Proceed only if you're sure the descriptions are good enough.
          </>
        }
        onCancel={() => setConfirmSkip(false)}
        onConfirm={() => { setConfirmSkip(false); submit(true); }}
      />

      {intent && (
        <OwnerPaymentScreen
          intent={intent}
          token={token}
          purposeLabel="add the new tasks"
          onConfirmed={onConfirmed}
          onExpired={() => setIntent(null)}
          onClose={() => setIntent(null)}
        />
      )}
    </>
  );
}
