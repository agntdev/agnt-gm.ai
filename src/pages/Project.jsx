import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import { CopyableBlock, Icon } from "../components/atoms.jsx";
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
import ProjectFactsRail, { fmtDate } from "../components/ProjectFactsRail.jsx";
import OwnerPaymentScreen, {
  buildCommentPayload,
} from "../components/ownerPayment.jsx";
import { api, PLATFORM_TON_WALLET } from "../lib/api.js";
import {
  emptyAddTask,
  validateAddTasks,
  validateManualPlan,
  validateDescriptions,
} from "../lib/manualPlan.js";
import { useAuth } from "../lib/auth.js";

export default function Project() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { live, taskCount, owner, loading, refresh } = useProjectData(slug);
  // Honor `state.tab` set by ProjectTabs when bouncing back from the
  // /milestones page so clicking "How to contribute" while on Tasks
  // lands on that tab, not the default Details one.
  const [tab, setTab] = useState(() => location.state?.tab || "about");
  const { agent: meAgent } = useAuth();
  const isOwner = !!meAgent && !!live && meAgent.id === live.owner_agent_id;

  if (loading) {
    return (
      <main data-screen-label="02 Project Detail">
        <section className="container">
          <div
            style={{
              padding: "60px 0",
              color: "var(--fg-muted)",
              fontSize: 13,
              textAlign: "center",
            }}
          >
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
          <div
            style={{
              padding: 40,
              border: "1px dashed var(--border-strong)",
              borderRadius: 10,
              background: "var(--bg-soft)",
              textAlign: "center",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>Project not found</h2>
            <p style={{ marginTop: 8, fontSize: 13, color: "var(--fg-muted)" }}>
              No project at{" "}
              <code style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {slug}
              </code>
              .
            </p>
            <Link
              to="/"
              className="btn"
              style={{
                marginTop: 14,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              ← Back to Pulse
            </Link>
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
        >
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <ProjectFactsRail
              live={live}
              owner={owner}
              taskCount={taskCount}
              isOwner={isOwner}
              refresh={refresh}
            />
          </div>
        </ProjectHero>
        {/* FundPoolBanner used to live here as a top-level CTA for the
            project-level pool. Stage 1 is now created automatically at
            publish time and its pending deposit IS the project pool
            (backend mirrors stage_1.ton_pool_funded_at into the legacy
            builder_projects.ton_pool_funded_at column). The duplicate
            "Pay X TON" buttons on screen confused owners — kept the
            stage-card one inside <StagesSection> as the single source. */}
        <EditTasksPanel live={live} isOwner={isOwner} refresh={refresh} />
        <PublishPanel live={live} isOwner={isOwner} refresh={refresh} />
        <div style={{ paddingTop: 24, paddingBottom: 40 }}>
          {tab === "contribute" && (
            <ContributeGuide live={live} navigate={navigate} />
          )}

          {tab === "about" && (
            <div className="about-grid">
              <div>
                <AboutDetails live={live} owner={owner} isOwner={isOwner} />
                <ProjectPayoutsSection slug={slug} live={live} />
                <StagesSection
                  live={live}
                  isOwner={isOwner}
                  refresh={refresh}
                />
              </div>

              <div>
                <TokenRail live={live} isOwner={isOwner} refresh={refresh} />
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

// ─────────────────────────── How to contribute ───────────────────────────

function ContributeGuide({ live }) {
  const sym = live.token_symbol || "TOKEN";

  const installSkill = `npx skills add agntdev/agnt-cli --all`;

  const workOnProject = [
    `Contribute to ${live.name} ($${sym}).`,
    `Use the CLI to get project data: agnt project get ${live.slug}`,
    ``,
    `Pick an open task, implement it, submit a PR with the task slug in the title.`,
  ].join("\n");

  return (
    <div style={{ maxWidth: "100%" }}>
      <p
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: "var(--fg)",
          lineHeight: 1.6,
          marginTop: 0,
          marginBottom: 14,
        }}
      >
        <Icon name="bot" size={14} /> Work on this project with an AI agent
      </p>

      <div style={{ marginBottom: 16 }}>
        <CopyableBlock
          text={installSkill}
          label="1. Install skill"
          id="install"
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <CopyableBlock
          text={workOnProject}
          label="2. Work on this project"
          copyBtnLabel="Copy prompt"
          id="work"
        />
      </div>
    </div>
  );
}

// ────────────────────────── API-driven sidebars ──────────────────────────

const STATUS_COPY = {
  draft: { label: "Draft", tone: "muted" },
  validating: { label: "Validating", tone: "amber" },
  ready_to_publish: { label: "Ready to publish", tone: "amber" },
  live: { label: "Live", tone: "accent" },
  completed: { label: "Completed", tone: "muted" },
  rejected: { label: "Rejected", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
};

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

function AboutDetails({ live, owner, isOwner }) {
  const about = live.about_of_project?.trim() || live.short_description?.trim();
  const goal = live.goal_of_project?.trim();
  const repoUrl = live.github_repo_url;
  const liveUrl = live.live_url;
  const ownerName = owner
    ? owner.github_username || owner.display_name || owner.id?.slice(0, 8)
    : live.owner_agent_id
      ? `${live.owner_agent_id.slice(0, 8)}…`
      : "—";
  const ownerHandle = owner?.github_username
    ? `@${owner.github_username}`
    : null;
  const ownerProfile = owner?.github_username
    ? `https://github.com/${owner.github_username}`
    : null;

  return (
    <>
      <div className="about-card">
        <div className="about-card-head">
          <div className="about-card-title">
            <Icon name="info" size={12} /> About this project
          </div>
          {isOwner && (
            <button
              className="btn btn-sm"
              type="button"
              disabled
              title="Coming soon"
            >
              Edit
            </button>
          )}
        </div>
        {about ? (
          <p className="about-prose">{about}</p>
        ) : (
          <p className="about-prose" style={{ color: "var(--fg-muted)" }}>
            No description yet. The owner hasn't published a longer write-up for
            this project.
          </p>
        )}

        {goal && (
          <div
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: "1px dashed var(--border)",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 800,
                color: "var(--accent-fg)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              <Icon name="zap" size={11} /> Goal
            </div>
            <p className="about-prose" style={{ margin: 0 }}>
              {goal}
            </p>
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: "1px dashed var(--border)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 14,
          }}
        >
          {/* Each cell wrapper carries minWidth:0 so the 1fr track is
              actually allowed to shrink below the (possibly long) URL
              text. Without it, a long repository / live-site URL forces
              the column wider than its track and visually overlaps the
              next cell. The URL anchors below also ellipsis-truncate. */}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                color: "var(--fg-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 4,
              }}
            >
              Owner
            </div>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {owner?.github_avatar_url && (
                <img
                  src={owner.github_avatar_url}
                  alt=""
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    objectFit: "cover",
                  }}
                />
              )}
              {ownerProfile ? (
                <a
                  href={ownerProfile}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "var(--fg)",
                    textDecoration: "none",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                  }}
                >
                  {ownerHandle || ownerName}
                </a>
              ) : (
                <span>{ownerName}</span>
              )}
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                color: "var(--fg-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 4,
              }}
            >
              Created
            </div>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: live.created_at ? "var(--fg)" : "var(--fg-muted)",
              }}
            >
              {fmtDate(live.created_at) || "—"}
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                color: "var(--fg-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 4,
              }}
            >
              Published
            </div>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: live.published_at ? "var(--fg)" : "var(--fg-muted)",
              }}
            >
              {fmtDate(live.published_at) || "—"}
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                color: "var(--fg-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 4,
              }}
            >
              Deadline
            </div>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: live.deadline ? "var(--fg)" : "var(--fg-muted)",
              }}
            >
              {fmtDate(live.deadline) || "no deadline"}
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                color: "var(--fg-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 4,
              }}
            >
              Repository
            </div>
            <div
              style={{
                fontSize: 12.5,
                fontFamily: "JetBrains Mono, monospace",
                fontWeight: 600,
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              {repoUrl ? (
                <a
                  href={repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={repoUrl}
                  style={{
                    color: "var(--fg)",
                    textDecoration: "none",
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {repoUrl.replace(/^https?:\/\//, "")}
                </a>
              ) : (
                <span style={{ color: "var(--fg-muted)" }}>—</span>
              )}
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                color: "var(--fg-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 4,
              }}
            >
              Live site
            </div>
            <div
              style={{
                fontSize: 12.5,
                fontFamily: "JetBrains Mono, monospace",
                fontWeight: 600,
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              {liveUrl ? (
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={liveUrl}
                  style={{
                    color: "var(--fg)",
                    textDecoration: "none",
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {liveUrl.replace(/^https?:\/\//, "")}
                </a>
              ) : (
                <span style={{ color: "var(--fg-muted)" }}>—</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
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
  const ownerSharePct =
    live.owner_share_bps != null ? live.owner_share_bps / 100 : null;
  const totalSupply =
    live.token_total_supply != null
      ? fmtBigInt(live.token_total_supply, live.token_decimals || 0)
      : "—";
  const minter = live.onchain_jetton_minter_address;
  const sym = live.token_symbol || "TBD";

  return (
    <div className="about-facts" style={{ marginTop: 12 }}>
      <div className="about-fact-head">Token</div>

      <div className="fact-row" style={{ alignItems: "center" }}>
        <span className="l">Symbol</span>
        <span
          className="v"
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          {live.logo_url && (
            <img
              src={live.logo_url}
              alt={sym}
              style={{
                width: 20,
                height: 20,
                borderRadius: 999,
                objectFit: "cover",
                background: "var(--bg-tint)",
              }}
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
        <span
          className="v"
          style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}
        >
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
        <span
          className="v"
          style={{ color: "var(--accent-fg)", fontWeight: 800 }}
        >
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
    if (!token) {
      setError("Sign in as the project owner.");
      return;
    }
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
        <span
          className="v"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            title={
              locked
                ? `Admin renounced ${new Date(live.jetton_admin_locked_at).toLocaleString()} — no further minting possible.`
                : "Admin slot is still held by the platform — new tasks can mint more supply."
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "2px 8px",
              borderRadius: 999,
              background: locked ? "var(--bg-tint)" : "var(--accent-soft)",
              color: locked ? "var(--fg)" : "var(--accent-fg)",
              border: locked
                ? "1px solid var(--border-strong)"
                : "1px solid var(--accent)",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {locked ? "🔒 frozen" : "🔓 mintable"}
          </span>
          {isOwner && !locked && (
            <button
              type="button"
              onClick={() => {
                setError("");
                setConfirmOpen(true);
              }}
              title="Renounce admin slot — one-way action."
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--fg-muted)",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                cursor: "pointer",
                fontFamily: "JetBrains Mono, monospace",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--danger)";
                e.currentTarget.style.borderColor = "var(--danger)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--fg-muted)";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
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
        onCancel={() => {
          if (!pending) setConfirmOpen(false);
        }}
        onConfirm={onConfirm}
        body={
          <>
            After this fires you will <strong>not</strong> be able to mint any
            more{" "}
            <code style={{ fontFamily: "JetBrains Mono, monospace" }}>
              ${live.token_symbol}
            </code>{" "}
            for this project, including in future stage activations or add-tasks
            calls. <strong>This is a one-way action.</strong>
          </>
        }
      />
    </>
  );
}
// Multi-round funding (2026-05-13). Renders the project's stage timeline,
// lets the owner start the next stage when the previous one closes, and
// surfaces a TonConnect "Fund this stage" CTA when a freshly-created
// stage is in `pending` state (waiting for the deposit watcher).

const STAGE_STATUS = {
  pending: { label: "Awaiting funding", tone: "amber" },
  funded: { label: "Funded · awaiting activation", tone: "amber" },
  active: { label: "Active", tone: "accent" },
  closed: { label: "Closed", tone: "muted" },
};

function StagesSection({ live, isOwner, refresh }) {
  // `stages === null` means "haven't fetched yet" — the section is
  // hidden during that first paint. On reloads we DON'T reset to null;
  // the previous list stays on screen until the new one lands, then
  // swaps in atomically. Stops the millisecond-flicker where the
  // whole stages block unmounts → remounts on every refresh tick
  // (which happens on focus, after Pay, after every poll, etc.).
  const [stages, setStages] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);
  const idOrSlug = live?.slug || live?.id;

  useEffect(() => {
    if (!idOrSlug) return;
    let cancelled = false;
    api.projectStages(idOrSlug).then((res) => {
      if (cancelled) return;
      setStages(res?.stages || []);
    });
    return () => {
      cancelled = true;
    };
  }, [idOrSlug, reloadTick]);

  const reloadStages = () => setReloadTick((n) => n + 1);

  // Background poll while any stage is mid-flight, so the UI flips
  // pending → funded → active without manual refresh.
  useEffect(() => {
    if (!stages) return undefined;
    const inFlight = stages.some(
      (s) =>
        s.status === "pending" || (s.status === "funded" && !s.activated_at),
    );
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

  if (stages == null) return null;
  if (stages.length === 0) return null;

  const last = stages[stages.length - 1];
  const canStartNext =
    isOwner && live.status === "live" && last.status === "closed";

  return (
    <section style={{ marginTop: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 10,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          <Icon name="layers" size={12} /> Stages
          <span
            style={{ fontSize: 10, color: "var(--fg-muted)", fontWeight: 600 }}
          >
            {stages.length}
          </span>
        </div>
        {canStartNext && (
          <span style={{ fontSize: 11, color: "var(--accent-fg)" }}>
            Stage {last.stage_number} closed — start the next round below
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginTop: 14,
        }}
      >
        {stages.map((s, i) => (
          <StageCard
            key={s.id}
            stage={s}
            isLast={i === stages.length - 1}
            isOwner={isOwner}
            live={live}
            refresh={() => {
              reloadStages();
              refresh();
            }}
          />
        ))}
      </div>

      {canStartNext && (
        <CreateStageForm
          projectIdOrSlug={idOrSlug}
          nextStageNumber={last.stage_number + 1}
          onCreated={() => {
            reloadStages();
            refresh();
          }}
        />
      )}
    </section>
  );
}

function StageCard({ stage, isLast, isOwner, refresh, live }) {
  const cfg = STAGE_STATUS[stage.status] || {
    label: stage.status,
    tone: "muted",
  };
  const tonPool = (Number(stage.ton_reward_pool_nano) || 0) / 1e9;
  const totalTasks = stage.tasks_count ?? 0;
  const mergedTasks = stage.tasks_merged ?? 0;
  const progressPct =
    totalTasks > 0 ? Math.round((mergedTasks / totalTasks) * 100) : 0;

  const toneBg =
    cfg.tone === "accent"
      ? "var(--accent-soft)"
      : cfg.tone === "amber"
        ? "oklch(0.96 0.05 80)"
        : "var(--bg-tint)";
  const toneFg =
    cfg.tone === "accent"
      ? "var(--accent-fg)"
      : cfg.tone === "amber"
        ? "#b45309"
        : "var(--fg-muted)";

  return (
    <div
      style={{
        border: `1px solid ${isLast && cfg.tone !== "muted" ? "var(--border-strong)" : "var(--border)"}`,
        borderRadius: 10,
        background: "var(--bg)",
        overflow: "hidden",
      }}
    >
      <div
        className="agnt-resp-stage-head"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          padding: "14px 18px",
          borderBottom: totalTasks > 0 ? "1px solid var(--border)" : "none",
        }}
      >
        <div
          style={{
            display: "grid",
            placeItems: "center",
            width: 40,
            height: 40,
            borderRadius: 10,
            background: toneBg,
            color: toneFg,
            fontFamily: "JetBrains Mono, monospace",
            fontWeight: 800,
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          {stage.stage_number}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 800,
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              Stage {stage.stage_number}
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 8px",
                borderRadius: 999,
                background: toneBg,
                color: toneFg,
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {(stage.status === "active" || stage.status === "funded") && (
                <span className="live-dot" />
              )}
              {cfg.label}
            </span>
          </div>
          {stage.plan_md && (
            <div
              style={{
                marginTop: 6,
                fontSize: 12.5,
                color: "var(--fg-muted)",
                lineHeight: 1.5,
                maxWidth: "70ch",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {stage.plan_md.slice(0, 220)}
              {stage.plan_md.length > 220 ? "…" : ""}
            </div>
          )}
        </div>
        <div
          style={{
            textAlign: "right",
            fontFamily: "JetBrains Mono, monospace",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: tonPool > 0 ? "var(--accent-fg)" : "var(--fg-muted)",
            }}
          >
            ◇ {tonPool.toLocaleString(undefined, { maximumFractionDigits: 3 })}{" "}
            TON
          </div>
          {stage.jetton_mint_amount > 0 && (
            <div
              style={{ fontSize: 10.5, color: "var(--fg-muted)", marginTop: 2 }}
            >
              +{" "}
              {(
                Number(stage.jetton_mint_amount) /
                Math.pow(10, live?.token_decimals ?? 0)
              ).toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
              ${live?.token_symbol || "TBD"}
            </div>
          )}
        </div>
      </div>

      {totalTasks > 0 && (
        <div
          style={{
            padding: "10px 18px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 11.5,
            color: "var(--fg-muted)",
          }}
        >
          <div
            style={{
              flex: 1,
              height: 6,
              background: "var(--bg-tint)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPct}%`,
                background:
                  progressPct === 100 ? "var(--accent)" : "var(--accent)",
                transition: "width 0.2s ease",
              }}
            />
          </div>
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {mergedTasks}/{totalTasks} merged
          </div>
        </div>
      )}

      {stage.status === "pending" && isOwner && tonPool > 0 && (
        <StageFundCTA stage={stage} live={live} refresh={refresh} />
      )}

      {stage.status === "active" && isOwner && (
        <AddTasksCTA stage={stage} refresh={refresh} live={live} />
      )}

      {isOwner &&
        live.status === "live" &&
        (stage.status === "active" || stage.status === "funded") && (
          <CloseStageEarly live={live} stage={stage} refresh={refresh} />
        )}
    </div>
  );
}

// CloseStageEarly — owner-only "finish this stage before its deadline"
// action. Shown only on a live project's active/funded stage. This does
// NOT finish the project, refund budget, or lock supply — the project
// stays live and a new stage can be started afterwards.
function CloseStageEarly({ live, stage, refresh }) {
  const { token } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onClose() {
    setError("");
    setPending(true);
    const res = await api.closeProjectStage(
      live.slug || live.id,
      stage.stage_number,
      token,
    );
    setPending(false);
    if (res.ok) {
      setConfirmOpen(false);
      refresh?.();
      return;
    }
    const data = res.data || {};
    if (res.status === 409)
      setError(
        data.error || "This stage can't be finished in its current state.",
      );
    else if (res.status === 403)
      setError("Only the project owner can finish a stage.");
    else if (res.status === 404)
      setError("Project or stage not found. Refresh the page.");
    else if (res.status === 401)
      setError("Your session expired. Sign in again, then retry.");
    else
      setError(
        data.error ||
          `Couldn't finish the stage (HTTP ${res.status}). Try again.`,
      );
  }

  return (
    <div
      style={{
        padding: "12px 18px",
        borderTop: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          fontSize: 11.5,
          color: "var(--fg-muted)",
          lineHeight: 1.5,
          flex: 1,
          minWidth: 220,
        }}
      >
        Finish this stage before its deadline. The project stays live — you can
        open the next stage afterwards.
        {error && (
          <div style={{ marginTop: 6, color: "var(--danger)" }}>{error}</div>
        )}
      </div>
      <button
        type="button"
        className="btn"
        onClick={() => {
          setError("");
          setConfirmOpen(true);
        }}
      >
        Finish stage early
      </button>

      <ConfirmModal
        open={confirmOpen}
        title="Finish this stage early?"
        confirmLabel="Finish stage"
        loading={pending}
        body={
          <>
            Close the current stage before its deadline? New tasks for it won't
            be accepted. The project stays active — you can open the next stage
            later.
          </>
        }
        onCancel={() => {
          if (!pending) setConfirmOpen(false);
        }}
        onConfirm={onClose}
      />
    </div>
  );
}

function StageFundCTA({ stage, live, refresh }) {
  const tonAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const { token } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [txSubmitted, setTxSubmitted] = useState(false);
  const [error, setError] = useState("");

  const dest = stage.funding_address || PLATFORM_TON_WALLET;
  const amount =
    stage.funding_amount_nano != null
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
        if (!tonConnectUI.connected) {
          setSubmitting(false);
          return;
        }
      }
      // Preferred path: mint a comment-marker intent so the deposit
      // matches on the marker — works even when the paying wallet differs
      // from the bound owner wallet. Fall back to the legacy bare transfer
      // (sender+amount matching) if the endpoint isn't available yet.
      let message = { address: dest, amount };
      const idOrSlug = live?.slug || live?.id || stage.project_id;
      if (idOrSlug && token) {
        const res = await api.stageFundingIntent(
          idOrSlug,
          stage.stage_number,
          token,
        );
        if (res?.ok && res.data?.comment_marker) {
          message = {
            address: res.data.target_wallet || dest,
            amount: String(res.data.expected_nano ?? amount),
            payload: buildCommentPayload(res.data.comment_marker),
          };
        }
      }
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 360,
        messages: [message],
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
    <div
      className="agnt-resp-banner"
      style={{
        padding: "12px 18px",
        borderTop: "1px solid var(--border)",
        background: "oklch(0.98 0.025 80)",
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 220,
          fontSize: 12,
          color: "var(--fg)",
          lineHeight: 1.5,
        }}
      >
        {txSubmitted ? (
          <>
            Transaction submitted. Waiting for the deposit watcher to confirm —
            this stage will flip to <strong>funded</strong> within ~10–60s.
          </>
        ) : (
          <>
            Send{" "}
            <strong>
              {tonAmount.toLocaleString(undefined, {
                maximumFractionDigits: 3,
              })}{" "}
              TON
            </strong>{" "}
            from the project's owner wallet to fund this stage. Auto-confirms
            on-chain — no admin needed.
          </>
        )}
        {error && (
          <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--danger)" }}>
            {error}
          </div>
        )}
      </div>
      {!txSubmitted && (
        <button
          type="button"
          className="btn-primary-big"
          style={{ background: "var(--accent)", opacity: submitting ? 0.6 : 1 }}
          disabled={submitting || !dest}
          onClick={onPay}
        >
          <Icon name="zap" size={12} />{" "}
          {submitting
            ? "Submitting…"
            : `Pay ${tonAmount.toLocaleString(undefined, { maximumFractionDigits: 3 })} TON`}
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
  function triggerShake() {
    setShakeKey((n) => n + 1);
  }

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
      setError(
        "Set the reward pool above before generating tasks — the planner uses it to balance the weights.",
      );
      triggerShake();
      return;
    }

    setPhase("generating");
    const res = await api.previewNewStageTasks(
      projectIdOrSlug,
      {
        brief: brief.trim(),
        approx_count: approxCount,
        stage_ton_nano: poolNano,
        nextStageNumber,
      },
      token,
    );

    if (!res.ok) {
      setPhase("input");
      if (res.data?.rejection_reason) {
        setModerationReason(res.data.rejection_reason);
      } else if (res.status === 429) {
        const retry = Number(res.data?.retry_after_seconds);
        setError(
          Number.isFinite(retry) && retry > 0
            ? `Rate limit hit (10 drafts per hour). Try again in ${Math.ceil(retry / 60)} min.`
            : "Rate limit hit (10 drafts per hour). Try again later.",
        );
      } else if (res.status === 502) {
        setError(
          "The LLM planner is unreachable right now. Try again in a moment.",
        );
      } else {
        setError(
          res.data?.error || `Could not draft tasks (HTTP ${res.status}).`,
        );
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
    if (poolNano <= 0) {
      setError("Reward pool must be > 0 TON.");
      triggerShake();
      return;
    }
    const mintAmount = Math.round((parseFloat(mint) || 0) * 1e9);
    if (!token) {
      setError("Sign in as the project owner first.");
      triggerShake();
      return;
    }

    const errs = validateManualPlan({ tasks }, "stage");
    if (errs.length > 0) {
      setError(errs[0]);
      triggerShake();
      return;
    }

    const body = {
      ton_reward_pool_nano: poolNano,
      jetton_mint_amount: mintAmount,
      manual_tasks: tasks.map((t) => ({
        slug: (t.slug || "").trim().toUpperCase() || undefined,
        title: t.title.trim(),
        body_md: t.body_md,
        difficulty: t.difficulty || undefined,
        weight: Number(t.weight),
        tags: t.tags && t.tags.length ? t.tags : undefined,
      })),
    };

    setSubmitting(true);
    const res = await api.createProjectStage(projectIdOrSlug, body, token);
    setSubmitting(false);
    if (res.status === 401 || res.status === 403) {
      setError("Only the project owner can start a new stage.");
      triggerShake();
      return;
    }
    if (res.status === 409) {
      const prevN = res.data?.previous_stage;
      const prevS = res.data?.previous_status;
      const hint =
        prevN != null && prevS
          ? `Stage ${prevN} is still ${prevS} — wait for it to close before starting stage ${nextStageNumber}.`
          : res.data?.error || "Previous stage is not closed yet.";
      setError(hint);
      triggerShake();
      return;
    }
    if (res.status === 400 && res.data?.rejection_reason) {
      setModerationReason(res.data.rejection_reason);
      triggerShake();
      return;
    }
    if (!res.ok) {
      setError(res.data?.error || `Request failed (HTTP ${res.status}).`);
      triggerShake();
      return;
    }

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
        marginTop: 14,
        padding: 18,
        border: "1px solid var(--border-strong)",
        borderRadius: 10,
        background: "var(--bg-soft)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 4,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          Start stage {nextStageNumber}
        </div>
        <span
          style={{
            fontSize: 10.5,
            color: "var(--fg-muted)",
            fontFamily: "JetBrains Mono, monospace",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          AI drafts → you edit → pay
        </span>
      </div>

      <RejectionBanner
        reason={moderationReason}
        onDismiss={() => setModerationReason("")}
      />

      <div
        className="agnt-resp-2col"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginTop: 10,
        }}
      >
        <Field label="Reward pool (TON)" hint="Auto-confirms via TonConnect.">
          <input
            type="number"
            min={0}
            step={0.001}
            value={pool}
            onChange={(e) => setPool(e.target.value)}
            style={monoInputStyle}
          />
        </Field>
        <Field
          label="Extra mint (jettons, optional)"
          hint="Additional supply minted on stage activation."
        >
          <input
            type="number"
            min={0}
            step={1}
            value={mint}
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
            style={{
              ...inputStyle,
              fontSize: 13,
              lineHeight: 1.5,
              resize: "vertical",
            }}
          />
        </Field>
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 11.5,
          color: "var(--fg-muted)",
          lineHeight: 1.5,
          padding: "8px 12px",
          borderRadius: 6,
          background: "var(--bg)",
        }}
      >
        ⓘ The validator agent drafts ~{approxCount} tasks from your brief.{" "}
        <strong>
          You'll be able to add, remove or fully rewrite any of them
        </strong>{" "}
        before the deposit is sent.
      </div>

      {phase === "input" && (
        <div
          style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}
        >
          <button
            key={shakeKey}
            type="button"
            onClick={onGenerate}
            disabled={phase === "generating"}
            className={
              shakeKey > 0 ? "agnt-shake btn-primary-big" : "btn-primary-big"
            }
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
        <div
          style={{
            marginTop: 14,
            padding: 14,
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--bg)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span className="live-dot" />
          <span style={{ fontSize: 12.5, color: "var(--fg)" }}>
            Drafting tasks from your brief…
          </span>
        </div>
      )}

      {phase === "edit" && (
        <>
          <SectionHeader
            hint={`${tasks.length} task${tasks.length === 1 ? "" : "s"} drafted · weights must sum to 1.00 · feel free to edit, add or remove`}
          >
            Draft tasks
          </SectionHeader>
          {cachedAt && (
            <div
              style={{
                marginTop: 8,
                fontSize: 10.5,
                color: "var(--fg-muted)",
                fontFamily: "JetBrains Mono, monospace",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
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
            <div
              className="agnt-fade-in"
              style={{
                marginTop: 10,
                padding: 10,
                border: "1px solid var(--danger)",
                borderRadius: 6,
                background: "var(--danger-soft)",
                color: "var(--danger)",
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}
          >
            <button
              key={shakeKey}
              type="submit"
              disabled={submitting || tasks.length === 0}
              className={
                shakeKey > 0 ? "agnt-shake btn-primary-big" : "btn-primary-big"
              }
              style={{
                background: "var(--accent)",
                opacity: submitting ? 0.6 : 1,
              }}
            >
              <Icon name="zap" size={12} />{" "}
              {submitting ? "Creating…" : `Submit & pay`}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPhase("input");
                setTasks([]);
              }}
            >
              ← Back to brief
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setOpen(false)}
              style={{ marginLeft: "auto" }}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {phase === "input" && error && (
        <div
          className="agnt-fade-in"
          style={{
            marginTop: 10,
            padding: 10,
            border: "1px solid var(--danger)",
            borderRadius: 6,
            background: "var(--danger-soft)",
            color: "var(--danger)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}
    </form>
  );
}

// ─────────────────────── Project payouts section ───────────────────────
// Lives inside the About tab. Pulls:
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
    return () => {
      cancelled = true;
    };
  }, [idOrSlug]);

  if (loading) {
    return (
      <div
        style={{
          padding: "28px 0",
          color: "var(--fg-muted)",
          fontSize: 12.5,
          textAlign: "center",
        }}
      >
        Loading payouts…
      </div>
    );
  }
  if (!summary) {
    return (
      <div
        style={{
          marginTop: 18,
          padding: 24,
          border: "1px dashed var(--border)",
          borderRadius: 10,
          background: "var(--bg-soft)",
          textAlign: "center",
          color: "var(--fg-muted)",
          fontSize: 12.5,
        }}
      >
        No payout data yet for this project.
      </div>
    );
  }

  return (
    <section
      style={{
        marginTop: 18,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          fontWeight: 800,
          paddingBottom: 4,
        }}
      >
        <Icon name="coins" size={12} /> Payouts
      </div>
      <SummaryTiles summary={summary} />
      <ExtraCountsRow
        items={[
          { label: "agents paid", value: summary.agents_paid, icon: "users" },
          { label: "tasks paid", value: summary.tasks_paid, icon: "layers" },
        ]}
      />
      {summary.weekly && summary.weekly.length > 0 && (
        <WeeklyBars weekly={summary.weekly} />
      )}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            padding: "8px 0 12px",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="users" size={12} /> Who got paid
            <span
              style={{
                fontSize: 10,
                color: "var(--fg-muted)",
                fontWeight: 600,
              }}
            >
              {rows?.length ?? 0}
            </span>
          </div>
          {summary.lifetime?.payout_count > (rows?.length || 0) && (
            <span
              style={{
                fontSize: 10.5,
                color: "var(--fg-muted)",
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
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
      <div
        style={{ padding: "10px 18px", borderTop: "1px solid var(--border)" }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px dashed var(--border-strong)",
            background: "transparent",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--fg-muted)",
            cursor: "pointer",
            transition:
              "color 0.15s ease, border-color 0.15s ease, background 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--fg)";
            e.currentTarget.style.borderColor = "var(--fg)";
            e.currentTarget.style.background = "var(--bg-soft)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--fg-muted)";
            e.currentTarget.style.borderColor = "var(--border-strong)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          + Add tasks to stage
        </button>
      </div>
    );
  }
  return (
    <AddTasksForm
      stage={stage}
      live={live}
      onCancel={() => setOpen(false)}
      onDone={() => {
        setOpen(false);
        refresh();
      }}
    />
  );
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
  const [deltaTon, setDeltaTon] = useState("1"); // human TON, → ×1e9
  const [deltaJetton, setDeltaJetton] = useState("0"); // whole jetton units
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [layer1Errors, setLayer1Errors] = useState([]); // [{field, message}]
  const [llmReasons, setLlmReasons] = useState(null); // string[] | null
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
      setErrorMsg(
        "Brief too short — describe what should ship (min 20 chars).",
      );
      return;
    }
    if (deltaTonNum <= 0) {
      setErrorMsg(
        "Set the TON top-up above before generating — the planner uses it to balance weights.",
      );
      return;
    }
    setPhase("generating");
    const res = await api.previewAddTasks(
      live.slug || live.id,
      stage.stage_number,
      {
        brief: brief.trim(),
        approx_count: approxCount,
        delta_ton_nano: Math.round(deltaTonNum * 1e9),
      },
      token,
    );
    if (!res.ok) {
      setPhase("input");
      if (res.data?.rejection_reason) {
        setErrorMsg(
          `Moderation rejected the brief: ${res.data.rejection_reason}`,
        );
      } else if (res.status === 429) {
        const retry = Number(res.data?.retry_after_seconds);
        setErrorMsg(
          Number.isFinite(retry) && retry > 0
            ? `Rate limit hit (10 drafts per hour). Try again in ${Math.ceil(retry / 60)} min.`
            : "Rate limit hit (10 drafts per hour). Try again later.",
        );
      } else if (res.status === 502) {
        setErrorMsg(
          "The LLM planner is unreachable right now. Try again in a moment.",
        );
      } else {
        setErrorMsg(
          res.data?.error || `Could not draft tasks (HTTP ${res.status}).`,
        );
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
    if (errs.length > 0) {
      setErrorMsg(errs[0]);
      return;
    }

    setSubmitting(true);
    const res = await api.addTasksToStage(
      live.slug || live.id,
      stage.stage_number,
      buildBody(skipCoherence),
      token,
    );
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
    if (res.status === 401 || res.status === 403) {
      setErrorMsg("Only the project owner can add tasks.");
      return;
    }
    if (res.status === 409) {
      setErrorMsg(res.data?.error || "Stage is no longer active.");
      return;
    }
    if (!res.ok) {
      setErrorMsg(res.data?.error || `Failed (HTTP ${res.status}).`);
      return;
    }

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
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--bg-soft)",
        border: "1px solid var(--border)",
        fontSize: 11.5,
        color: "var(--fg)",
        lineHeight: 1.55,
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 800,
          color: "var(--fg-muted)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        Preview
      </div>
      Stage will go from{" "}
      <strong>
        {existingCount} → {existingCount + tasks.length}
      </strong>{" "}
      tasks. Pool will go from{" "}
      <strong>
        {existingTon.toFixed(3)} → {newPoolTon.toFixed(3)} TON
      </strong>
      .
      {!supplyLocked && parseInt(deltaJetton, 10) > 0 && (
        <>
          {" "}
          Supply will mint another{" "}
          <strong>
            {Number(deltaJetton).toLocaleString()} ${live.token_symbol}
          </strong>
          .
        </>
      )}
      <div style={{ marginTop: 6, fontSize: 11, color: "var(--fg-muted)" }}>
        Existing {existingCount} task{existingCount === 1 ? "" : "s"} keep their
        TON shares — only the new {tasks.length}{" "}
        {tasks.length === 1 ? "task" : "tasks"} split the{" "}
        {deltaTonNum.toFixed(3)} TON top-up.
      </div>
    </div>
  );

  return (
    <>
      <div
        style={{
          padding: "16px 18px",
          borderTop: "1px solid var(--border)",
          background: "oklch(0.99 0.01 240)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 4,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            Add tasks to Stage {stage.stage_number}
          </div>
          <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>
            existing {existingCount} task{existingCount === 1 ? "" : "s"} —
            their TON shares stay unchanged
          </span>
        </div>

        {/* Top-up + supply controls live above the brief — the LLM
            uses delta_ton to balance weights, so the owner has to pick
            it BEFORE generating. */}
        <div
          className="agnt-resp-2col"
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <Field
            label="TON top-up"
            hint="Required > 0. Splits across the new tasks by weight."
          >
            <input
              type="number"
              min={0}
              step={0.001}
              value={deltaTon}
              onChange={(e) => setDeltaTon(e.target.value)}
              style={monoInputStyle}
            />
          </Field>
          <Field
            label="Extra jetton mint (optional)"
            hint={
              supplyLocked
                ? "Supply is frozen — must stay 0."
                : "Whole units. Leave 0 to keep current supply."
            }
          >
            <input
              type="number"
              min={0}
              step={1}
              value={supplyLocked ? "0" : deltaJetton}
              disabled={supplyLocked}
              onChange={(e) => setDeltaJetton(e.target.value)}
              style={{ ...monoInputStyle, opacity: supplyLocked ? 0.5 : 1 }}
            />
          </Field>
        </div>

        {phase === "input" && (
          <>
            <div style={{ marginTop: 12 }}>
              <Field
                label="What ships in these new tasks?"
                hint="One paragraph is enough — the validator agent expands it."
              >
                <textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="e.g. confetti animation on score increase + sound toggle"
                  style={{
                    ...inputStyle,
                    fontSize: 13,
                    lineHeight: 1.5,
                    resize: "vertical",
                  }}
                />
              </Field>
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 11.5,
                color: "var(--fg-muted)",
                lineHeight: 1.5,
                padding: "8px 12px",
                borderRadius: 6,
                background: "var(--bg)",
              }}
            >
              ⓘ The validator agent drafts ~{approxCount} tasks from your brief.{" "}
              <strong>
                You'll be able to add, remove or fully rewrite any of them
              </strong>{" "}
              before paying.
            </div>
            {errorMsg && (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  fontSize: 12,
                  border: "1px solid var(--danger)",
                  borderRadius: 6,
                  background: "var(--danger-soft)",
                  color: "var(--danger)",
                }}
              >
                {errorMsg}
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 14,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={onGenerate}
                className="btn-primary-big"
                style={{ background: "var(--accent)" }}
              >
                <Icon name="zap" size={12} /> Generate tasks
              </button>
              <button type="button" className="btn" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </>
        )}

        {phase === "generating" && (
          <div
            style={{
              marginTop: 14,
              padding: 14,
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span className="live-dot" />
            <span style={{ fontSize: 12.5, color: "var(--fg)" }}>
              Drafting tasks from your brief…
            </span>
          </div>
        )}

        {phase === "edit" && (
          <>
            <div
              style={{
                marginTop: 14,
                fontSize: 11,
                fontFamily: "JetBrains Mono, monospace",
                color: "var(--fg-muted)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontWeight: 800,
              }}
            >
              Draft tasks — edit, add or remove
            </div>
            {cachedAt && (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 10.5,
                  color: "var(--fg-muted)",
                  fontFamily: "JetBrains Mono, monospace",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                ⓘ served from cache — free regenerate
              </div>
            )}

            <TasksEditor
              tasks={tasks}
              onChange={setTasks}
              isStage
              stageNumber={stage.stage_number}
              weightField="weight_within_new"
              newTaskFactory={({ tasks: ts, stageNumber }) =>
                emptyAddTask({ tasks: ts, stageNumber })
              }
            />

            {llmReasons && (
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 8,
                  background: "var(--danger-soft)",
                  border: "1px solid var(--danger)",
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    color: "var(--danger)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 6,
                  }}
                >
                  Coherence check rejected the batch
                </div>
                {llmReasons.map((r, i) =>
                  r ? (
                    <div
                      key={i}
                      style={{
                        fontSize: 12,
                        color: "var(--fg)",
                        lineHeight: 1.5,
                        marginTop: 4,
                      }}
                    >
                      <strong>Task #{i + 1}</strong>: {r}
                    </div>
                  ) : null,
                )}
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: "var(--fg-muted)",
                  }}
                >
                  Edit the rejected tasks, or override the check if you're sure.
                </div>
              </div>
            )}

            {layer1Errors.length > 0 && (
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 8,
                  background: "var(--danger-soft)",
                  border: "1px solid var(--danger)",
                  fontSize: 12,
                  color: "var(--danger)",
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 6 }}>
                  Fix these before retrying:
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                  {layer1Errors.map((e, i) => (
                    <li key={i}>
                      <code
                        style={{
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: 11,
                        }}
                      >
                        {e.field}
                      </code>{" "}
                      — {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ marginTop: 12 }}>{existingPreview}</div>

            {errorMsg && (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  fontSize: 12,
                  border: "1px solid var(--danger)",
                  borderRadius: 6,
                  background: "var(--danger-soft)",
                  color: "var(--danger)",
                }}
              >
                {errorMsg}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 14,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => submit(false)}
                disabled={submitting || tasks.length === 0}
                className="btn-primary-big"
                style={{
                  background: "var(--accent)",
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                <Icon name="zap" size={12} />{" "}
                {submitting ? "Validating…" : "Submit & Pay"}
              </button>
              {llmReasons && (
                <button
                  type="button"
                  onClick={() => setConfirmSkip(true)}
                  className="btn"
                  style={{
                    borderColor: "var(--danger)",
                    color: "var(--danger)",
                  }}
                >
                  Submit anyway
                </button>
              )}
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPhase("input");
                  setTasks([]);
                }}
              >
                ← Back to brief
              </button>
              <button
                type="button"
                className="btn"
                onClick={onCancel}
                style={{ marginLeft: "auto" }}
              >
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
            coherent unit of software work. Skipping forwards the batch straight
            to activation — agents may still ignore unclear tasks. Proceed only
            if you're sure the descriptions are good enough.
          </>
        }
        onCancel={() => setConfirmSkip(false)}
        onConfirm={() => {
          setConfirmSkip(false);
          submit(true);
        }}
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

// ─────────────────────── PublishPanel ───────────────────────
//
// Manual "Publish project" CTA for the owner of a `ready_to_publish`
// project. Publishing deploys the jetton and creates the GitHub repo
// (~10–60s), flipping the project to `live`.
//
// When to show the button (owner + status === ready_to_publish):
//   - pool === 0                       → publish available immediately
//                                        (there's no deposit to wait on;
//                                        without this the project would
//                                        hang in ready_to_publish forever)
//   - pool > 0 && funded_at == null    → NOT here — the stage-card
//                                        "Pay X TON" CTA handles funding,
//                                        which auto-publishes on confirm
//   - pool > 0 && funded_at != null    → publish available (manual
//                                        fallback if the auto-publish
//                                        watcher didn't fire)
function PublishPanel({ live, isOwner, refresh }) {
  const { token } = useAuth();
  const [phase, setPhase] = useState("idle"); // idle | publishing | done | error
  const [errorMsg, setErrorMsg] = useState("");
  const [repoUrl, setRepoUrl] = useState(null);

  // Success card persists even after `refresh` flips the project to
  // `live` (which would otherwise drop this panel via the guard below),
  // so the owner still sees the confirmation + repo link.
  if (phase === "done") {
    return (
      <div
        style={{
          marginTop: 16,
          padding: 16,
          border: "1px solid var(--accent)",
          borderRadius: 10,
          background: "var(--accent-soft)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <Icon name="check" size={16} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              fontFamily: "JetBrains Mono, monospace",
              color: "var(--accent-fg)",
            }}
          >
            Project published — it's live
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 12.5,
              color: "var(--fg)",
              lineHeight: 1.5,
            }}
          >
            The jetton is deployed and the GitHub repository is created. Agents
            can pick up tasks now.
          </div>
        </div>
        {repoUrl && (
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-primary-big"
            style={{
              background: "var(--accent)",
              color: "white",
              textDecoration: "none",
            }}
          >
            <Icon name="external" size={12} /> View repository
          </a>
        )}
      </div>
    );
  }

  if (!live || !isOwner || live.status !== "ready_to_publish") return null;

  const pool = Number(live.ton_reward_pool_nano) || 0;
  const funded = live.ton_pool_funded_at != null;
  // pool>0 && not-funded → funding (and its auto-publish) is owned by the
  // stage-card "Pay X TON" CTA; don't show a second publish path here.
  if (pool > 0 && !funded) return null;

  const publishing = phase === "publishing";

  async function onPublish() {
    setErrorMsg("");
    setPhase("publishing");
    const res = await api.publishProject(live.slug || live.id, token);
    if (res.ok) {
      const data = res.data || {};
      setRepoUrl(
        data.repo_url ||
          data.project?.github_repo_url ||
          live.github_repo_url ||
          null,
      );
      setPhase("done");
      refresh?.();
      return;
    }
    const data = res.data || {};
    if (res.status === 409) {
      setErrorMsg(
        `Status changed to ${data.status || "not ready_to_publish"} — someone may have published already. Refreshing…`,
      );
      refresh?.();
    } else if (res.status === 412) {
      setErrorMsg(
        data.hint ||
          data.error ||
          "The TON reward pool isn't funded yet — send the deposit first.",
      );
    } else if (res.status === 403) {
      setErrorMsg("Only the project owner can publish.");
    } else if (res.status === 404) {
      setErrorMsg("Project not found. Refresh the page.");
    } else if (res.status === 401) {
      setErrorMsg("Your session expired. Sign in again, then retry.");
    } else {
      setErrorMsg(
        data.details ||
          data.error ||
          `Publish failed (HTTP ${res.status}). Try again.`,
      );
    }
    setPhase("error");
  }

  return (
    <div
      className="agnt-resp-banner"
      style={{
        marginTop: 16,
        padding: 16,
        border: "1px solid var(--border-strong)",
        borderRadius: 10,
        background: "var(--bg-soft)",
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="rocket" size={14} />
          <h3
            style={{
              margin: 0,
              fontSize: 14,
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            Publish project
          </h3>
        </div>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 12.5,
            color: "var(--fg-muted)",
            lineHeight: 1.5,
          }}
        >
          {funded
            ? "The reward pool is funded. Publishing deploys the jetton and creates the GitHub repository — one issue per task. Takes ~10–60s."
            : "This project has no TON reward pool, so there's no deposit to wait on. Publish now to deploy the jetton and create the GitHub repository (one issue per task). Takes ~10–60s."}
        </p>
        {errorMsg && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--danger)" }}>
            {errorMsg}
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn-primary-big"
        style={{ background: "var(--accent)", opacity: publishing ? 0.6 : 1 }}
        disabled={publishing}
        onClick={onPublish}
      >
        <Icon name="rocket" size={12} />
        {publishing
          ? " Publishing…"
          : phase === "error"
            ? " Retry publish"
            : " Publish"}
      </button>
    </div>
  );
}

// ─────────────────────── EditTasksPanel ───────────────────────
//
// Visible only when the project is in `ready_to_publish` AND the
// viewer is the owner. Lets the owner rewrite the AI-drafted task
// list before paying the pool (and triggering auto-publish).
//
// Descriptions-only contract (2026-05-21): the owner edits ONLY the
// description of each task and can add / delete tasks. The LLM assigns
// title / slug / weight / difficulty / tags on save. So:
//   - load preserves each task's `id` (existing) for the diff;
//   - save sends { tasks: [{ id?, body_md }] } — no weight/slug/etc;
//   - the 200 response is authoritative and we re-hydrate the chips.
// Requires the matching backend update to PUT /projects/:id/tasks.
//
// Lifecycle:
//   collapsed → click "Edit tasks" → loading → editing →
//     submit → saving → done (panel collapses, refresh fires)
function EditTasksPanel({ live, isOwner, refresh }) {
  const { token } = useAuth();
  const [phase, setPhase] = useState("idle"); // idle | loading | editing | saving | enriching | done
  const [tasks, setTasks] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [layer1Errors, setLayer1Errors] = useState([]);
  const [llmReasons, setLlmReasons] = useState(null);
  const [confirmSkip, setConfirmSkip] = useState(false);
  // Last successful response counters — drives the brief "Saved: N
  // updated · M added · K removed" toast under the panel header.
  const [lastSaved, setLastSaved] = useState(null);

  const idOrSlug = live?.slug || live?.id;

  // Save is async: PUT /tasks returns 202 (descriptions stored) while the
  // LLM assigns title/weight/difficulty/slug in the background. Poll the
  // project every ~2s until tasks_enrich_status flips to idle (done) or
  // failed, then re-hydrate the chips from the canonical list. Declared
  // before the early-return below to keep hook order stable.
  useEffect(() => {
    if (phase !== "enriching" || !idOrSlug) return undefined;
    let cancelled = false;
    let timer;
    const poll = async () => {
      const res = await api.getProject(idOrSlug);
      if (cancelled) return;
      const proj = res?.project || res;
      const st = proj?.tasks_enrich_status;
      if (st === "updating") {
        timer = setTimeout(poll, 2000);
        return;
      }
      if (st === "failed") {
        setErrorMsg(
          "The AI step that titles & weights the tasks failed. Your descriptions are saved — click Save again to re-run it.",
        );
        setPhase("editing");
        return;
      }
      // idle (or a backend that doesn't report the field) → done.
      const listRes = await api.listProjectTasks(idOrSlug, { full: true });
      if (cancelled) return;
      setTasks(
        (listRes?.tasks || []).map((t) => ({
          id: t.id,
          slug: t.slug,
          title: t.title || "",
          body_md: t.body_md || "",
          difficulty: t.difficulty || undefined,
          weight: typeof t.weight === "number" ? t.weight : undefined,
        })),
      );
      setPhase("done");
      refresh?.();
      setTimeout(() => {
        if (!cancelled) setPhase("idle");
      }, 1800);
    };
    timer = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idOrSlug]);

  if (!live || !isOwner || live.status !== "ready_to_publish") return null;

  async function onOpen() {
    setErrorMsg("");
    setLayer1Errors([]);
    setLlmReasons(null);
    setPhase("loading");

    // Two-step load: first list (cheap), then a full per-task fetch for
    // body_md that the trimmed list doesn't carry today. We keep the
    // server-assigned slug/title/weight/difficulty around as read-only
    // CONTEXT (the descriptions-only editor surfaces them as chips), and
    // crucially preserve each task's immutable `id` so the save can tell
    // the backend which rows are existing (re-describe) vs new (insert).
    const listRes = await api.listProjectTasks(live.slug || live.id, {
      full: true,
    });
    const rough = listRes?.tasks || [];
    let full = rough;
    const needsBackfill = rough.some((t) => t.body_md == null);
    if (needsBackfill) {
      const fulls = await Promise.all(
        rough.map((t) => api.getTask(live.slug || live.id, t.slug)),
      );
      full = fulls.map((envelope, i) => {
        const detail = envelope?.task || envelope || {};
        return {
          id: detail.id ?? rough[i].id,
          slug: detail.slug ?? rough[i].slug,
          title: detail.title ?? rough[i].title ?? "",
          body_md: detail.body_md ?? "",
          difficulty: detail.difficulty || undefined,
          weight: typeof detail.weight === "number" ? detail.weight : undefined,
        };
      });
    } else {
      full = rough.map((t) => ({
        id: t.id,
        slug: t.slug,
        title: t.title || "",
        body_md: t.body_md || "",
        difficulty: t.difficulty || undefined,
        weight: typeof t.weight === "number" ? t.weight : undefined,
      }));
    }

    setTasks(full);
    setPhase("editing");
  }

  async function onSave(skipCoherence = false) {
    setErrorMsg("");
    setLayer1Errors([]);
    setLlmReasons(null);

    // Descriptions-only flow: the owner edits only body_md; the LLM
    // assigns title / slug / weight / difficulty / tags on save. So the
    // client-side check is just the description text + the 1..50 count —
    // no weight budget, no supply, no name/symbol (those are immutable
    // on an existing project and never part of task editing).
    const errs = validateDescriptions(tasks);
    if (errs.length > 0) {
      setErrorMsg(errs[0]);
      return;
    }

    setPhase("saving");
    // Per task we send only an identity handle + the description:
    //   - existing task → { id, body_md } (server keeps/reassigns slug etc)
    //   - new task      → { body_md }      (server + LLM generate the rest)
    // Array order = display order.
    const body = {
      tasks: tasks.map((t) =>
        t.id
          ? { id: t.id, body_md: t.body_md || "" }
          : { body_md: t.body_md || "" },
      ),
    };
    if (skipCoherence) body.skip_coherence = true;

    const res = await api.updateProjectTasks(live.slug || live.id, body, token);
    if (!res.ok) {
      setPhase("editing");
      const data = res.data || {};
      if (data.llm_reject) {
        setLlmReasons(data.llm_reasons || []);
        return;
      }
      if (Array.isArray(data.layer1_errors) && data.layer1_errors.length) {
        setLayer1Errors(data.layer1_errors);
        return;
      }
      if (res.status === 429) {
        const retry = Number(data.retry_after_seconds);
        setErrorMsg(
          Number.isFinite(retry) && retry > 0
            ? `Rate limit hit (30 edits per hour). Try again in ${Math.ceil(retry / 60)} min.`
            : "Rate limit hit (30 edits per hour). Try again later.",
        );
        return;
      }
      if (res.status === 409) {
        setErrorMsg(
          `Project status is now ${data.current_status || "not ready_to_publish"}. Refresh the page.`,
        );
        return;
      }
      if (res.status === 401 || res.status === 403) {
        setErrorMsg("Only the project owner can edit tasks.");
        return;
      }
      if (res.status === 502) {
        setErrorMsg(
          "LLM coherence check is unreachable right now. Try again in a moment, or use Save anyway to bypass.",
        );
        return;
      }
      setErrorMsg(data.error || `Save failed (HTTP ${res.status}).`);
      return;
    }

    // 202 Accepted — descriptions are stored, but the LLM is still
    // assigning title/weight/difficulty/slug. Surface the counters and
    // hand off to the enrich-poll effect, which watches
    // tasks_enrich_status and re-hydrates the chips when it lands.
    const data = res.data || {};
    setLastSaved({
      replaced: Number(data.tasks_replaced) || tasks.length,
      inserted: Number(data.tasks_inserted) || 0,
      updated: Number(data.tasks_updated) || 0,
      deleted: Number(data.tasks_deleted) || 0,
    });
    setPhase("enriching");
  }

  // ──────────────────────── render ────────────────────────

  if (phase === "idle" || phase === "done") {
    return (
      <div
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid var(--border)",
          borderRadius: 10,
          background: "var(--bg-soft)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div
          className="agnt-resp-edit-tasks-head"
          style={{ flex: 1, minWidth: 240 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="layers" size={14} />
            <h3
              style={{
                margin: 0,
                fontSize: 14,
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              Edit tasks before publish
            </h3>
          </div>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 12.5,
              color: "var(--fg-muted)",
              lineHeight: 1.5,
            }}
          >
            {phase === "done" && lastSaved ? (
              <>
                Saved. <strong>{lastSaved.updated}</strong> kept
                {lastSaved.inserted ? (
                  <>
                    , <strong>+{lastSaved.inserted}</strong> added
                  </>
                ) : null}
                {lastSaved.deleted ? (
                  <>
                    , <strong>−{lastSaved.deleted}</strong> removed
                  </>
                ) : null}
                .
              </>
            ) : (
              "The validator agent drafted a task list. You can rewrite, add or remove any of them before the pool deposit triggers auto-publish."
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn-primary-big"
          style={{
            background:
              phase === "done" ? "var(--accent-soft)" : "var(--accent)",
            color: phase === "done" ? "var(--accent-fg)" : "white",
          }}
          onClick={onOpen}
        >
          <Icon name={phase === "done" ? "check" : "layers"} size={12} />{" "}
          {phase === "done" ? "Saved ✓" : "Edit tasks"}
        </button>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid var(--border)",
          borderRadius: 10,
          background: "var(--bg-soft)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span className="live-dot" />
        <span style={{ fontSize: 12.5, color: "var(--fg)" }}>
          Loading current task list…
        </span>
      </div>
    );
  }

  if (phase === "enriching") {
    return (
      <div
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
          background: "var(--bg-soft)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span className="live-dot" />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            Updating tasks…
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              color: "var(--fg-muted)",
              lineHeight: 1.5,
            }}
          >
            Descriptions saved. The AI is assigning titles, weights and
            difficulty — this takes a few seconds.
          </div>
        </div>
      </div>
    );
  }

  // phase === "editing" | "saving"
  const saving = phase === "saving";

  return (
    <>
      <div
        style={{
          marginTop: 16,
          padding: 16,
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
          background: "var(--bg-soft)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            Edit tasks
          </div>
          <span
            style={{
              fontSize: 10.5,
              color: "var(--fg-muted)",
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            {tasks.length} task{tasks.length === 1 ? "" : "s"} · AI sets titles
            & weights on save
          </span>
        </div>

        <TasksEditor
          tasks={tasks}
          onChange={setTasks}
          isStage={false}
          descriptionsOnly
        />

        {llmReasons && (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 8,
              background: "var(--danger-soft)",
              border: "1px solid var(--danger)",
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: "var(--danger)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 6,
              }}
            >
              Coherence check rejected the batch
            </div>
            {llmReasons.map((r, i) =>
              r ? (
                <div
                  key={i}
                  style={{
                    fontSize: 12,
                    color: "var(--fg)",
                    lineHeight: 1.5,
                    marginTop: 4,
                  }}
                >
                  <strong>Task #{i + 1}</strong>: {r}
                </div>
              ) : null,
            )}
          </div>
        )}

        {layer1Errors.length > 0 && (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 8,
              background: "var(--danger-soft)",
              border: "1px solid var(--danger)",
              fontSize: 12,
              color: "var(--danger)",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              Fix these before saving:
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
              {layer1Errors.map((e, i) => (
                <li key={i}>
                  <code
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 11,
                    }}
                  >
                    {e.field}
                  </code>{" "}
                  — {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {errorMsg && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              fontSize: 12,
              border: "1px solid var(--danger)",
              borderRadius: 6,
              background: "var(--danger-soft)",
              color: "var(--danger)",
            }}
          >
            {errorMsg}
          </div>
        )}

        <div
          style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}
        >
          <button
            type="button"
            onClick={() => onSave(false)}
            disabled={saving || tasks.length === 0}
            className="btn-primary-big"
            style={{ background: "var(--accent)", opacity: saving ? 0.6 : 1 }}
          >
            <Icon name="zap" size={12} /> {saving ? "Saving…" : "Save tasks"}
          </button>
          {llmReasons && (
            <button
              type="button"
              onClick={() => setConfirmSkip(true)}
              className="btn"
              style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
            >
              Save anyway
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => setPhase("idle")}
            style={{ marginLeft: "auto" }}
          >
            Cancel
          </button>
        </div>
      </div>

      <ConfirmModal
        open={confirmSkip}
        danger
        title="Skip the coherence check?"
        confirmLabel="Yes, save anyway"
        body={
          <>
            The platform's LLM thinks at least one task isn't a coherent unit of
            software work. Skipping forwards the list straight to the project —
            agents may still ignore unclear tasks. Proceed only if you're sure
            the descriptions are good enough.
          </>
        }
        onCancel={() => setConfirmSkip(false)}
        onConfirm={() => {
          setConfirmSkip(false);
          onSave(true);
        }}
      />
    </>
  );
}
