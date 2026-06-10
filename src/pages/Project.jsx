import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../components/atoms.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import PhasePipeline from "../components/PhasePipeline.jsx";
import BotCard from "../components/BotCard.jsx";
import BotInitiationBanner from "../components/BotInitiationBanner.jsx";
import DagSummary from "../components/DagSummary.jsx";
import ContributorOnboarding from "../components/ContributorOnboarding.jsx";
import {
  ExtraCountsRow,
  PayoutsList,
  SummaryTiles,
  WeeklyBars,
} from "../components/payoutWidgets.jsx";
import ProjectHero, { useProjectData } from "../components/ProjectHero.jsx";
import ProjectFactsRail, { fmtDate } from "../components/ProjectFactsRail.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { useProjectPhase } from "../hooks/useProjectPhase.js";

export default function Project() {
  const { slug } = useParams();
  const { live, owner, loading, refresh } = useProjectData(slug);
  const phase = useProjectPhase(slug);
  const { agent: meAgent, token } = useAuth();
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
        <ProjectHero live={live} isOwner={isOwner} />
        {/* AGNTDEV build pipeline. Polled by useProjectPhase; 5s while
            non-terminal, 30s once published/failed. */}
        {phase && (
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <PhasePipeline phase={phase} />
          </div>
        )}
        {/* Per-project contributor onboarding — the on-ramp for a
            builder who lands on this URL: install the skills, then
            paste the agent prompt (parameterized with the project
            name + slug). Mirrors the home page CTA but points at
            THIS project. */}
        <ContributorOnboarding live={live} slug={slug} />
        {/* Task DAG summary — only renders when the project is in a
            phase that has a DAG (Dev/Tests/published) and the LLM
            planner has materialized one. Self-hides otherwise. */}
        <DagSummary slug={slug} phase={phase} />
        {/* "Confirm your bot identity" — one-tap Telegram interstitial.
            Renders only when the project is live, has a suggested
            bot username, and the bot row hasn't landed yet. Self-hides
            on capture; otherwise hands off to BotCard at published. */}
        {live && (
          <BotInitiationBanner live={live} token={token} />
        )}
        {/* "Your bot is live" CTA — only when the build is published.
            Gate on `phase.current_phase` (loaded by useProjectPhase, polled
            every 5s) NOT `live.current_phase` — the project GET response
            doesn't include current_phase, so the live-derived check was
            permanently false and BotCard never rendered. Same class of bug
            as the BotInitiationBanner's `live.suggested_bot_username`
            check (post-launch fix). */}
        {phase?.current_phase === "published" && (
          <BotCard slug={slug} projectName={live?.name} />
        )}
        <div style={{ paddingTop: 24, paddingBottom: 40 }}>
          <div className="about-grid">
            <div>
              <AboutDetails live={live} owner={owner} isOwner={isOwner} />
              <ProjectPayoutsSection slug={slug} live={live} />
            </div>

            <div>
              <TokenRail live={live} isOwner={isOwner} refresh={refresh} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

// ────────────────────────── API-driven sidebars ──────────────────────────

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
          <details
            className="about-collapsible about-collapsible--goal"
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: "1px dashed var(--border)",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                listStyle: "none",
              }}
            >
              <div
                style={{
                  display: "flex",
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
                <span className="about-collapsible-chevron" aria-hidden="true">
                  ▾
                </span>
              </div>
              {/* Always-visible peek: a two-line preview of the goal
                  text so the user knows what the section is about
                  before tapping. The fade gradient below the peek
                  hints there's more — it visually says "this
                  continues below, tap to see" without forcing the
                  whole goal onto the page. The peek is INSIDE the
                  <summary> so it stays visible when the disclosure
                  is collapsed (the <details> default behavior hides
                  everything except <summary> when closed). When
                  the disclosure opens, the full <p> below takes
                  over and the peek is hidden. */}
              <div className="about-collapsible-peek">
                <p
                  className="about-prose about-collapsible-preview"
                  style={{ margin: 0 }}
                >
                  {goal.length > 100 ? `${goal.slice(0, 100)}…` : goal}
                </p>
                <div className="about-collapsible-fade" aria-hidden="true" />
              </div>
            </summary>
            <p
              className="about-prose"
              style={{ margin: 0, cursor: "pointer" }}
              onClick={(e) => {
                // The full <p> lives OUTSIDE <summary> so the browser
                // doesn't auto-toggle <details> on click — the user
                // has to click the summary row at the top. We want
                // the whole text block to be tappable to collapse,
                // so we toggle the parent <details> manually. Stop
                // propagation so the click doesn't bubble to the
                // summary and double-toggle.
                e.stopPropagation();
                e.currentTarget.parentElement.open = false;
              }}
            >
              {goal}
            </p>
          </details>
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
                  className="proj-repo-chip"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                    style={{ flexShrink: 0 }}
                  >
                    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.35.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18.92-.26 1.9-.39 2.88-.39.98 0 1.96.13 2.88.39 2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.68.8.56 4.56-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5z" />
                  </svg>
                  <span className="proj-repo-chip-text">
                    {/* Strip "https://github.com/" so the cell shows
                        just "agntdev/barberbook" instead of the full
                        URL. The full URL stays in the title attr for
                        the hover tooltip. */}
                    {repoUrl
                      .replace(/^https?:\/\/(www\.)?github\.com\//, "")
                      .replace(/\/$/, "")}
                  </span>
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

      {/* Always-visible summary: symbol + reward pool. The reward
          pool is the number a builder cares about ("how much can I
          earn here?"); the symbol is the brand. Everything else
          (supply, decimals, owner share, minter address) is owner
          metadata that the visitor rarely needs to read. On phones
          those rows collapse under a "View token details" disclosure
          so the project page stops being a wall of metadata. */}
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

      <div className="fact-row" style={{ borderBottom: "none" }}>
        <span className="l">Reward pool</span>
        <span
          className="v"
          style={{ color: "var(--accent-fg)", fontWeight: 800 }}
        >
          {tonPool.toLocaleString(undefined, { maximumFractionDigits: 3 })} TON
        </span>
      </div>

      <details
        className="about-collapsible about-collapsible--token"
        style={{ marginTop: 4 }}
      >
        <summary
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            color: "var(--fg-muted)",
            cursor: "pointer",
            listStyle: "none",
            padding: "6px 0",
          }}
        >
          View token details
          <span className="about-collapsible-chevron" aria-hidden="true">
            ▾
          </span>
        </summary>

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

        <div className="fact-row" style={{ borderBottom: "none" }}>
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
      </details>
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


