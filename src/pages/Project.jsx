import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/atoms.jsx";
import ProjectHero, { useProjectData } from "../components/ProjectHero.jsx";
import { useAuth } from "../lib/auth.js";

export default function Project() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { live, taskCount, owner, loading } = useProjectData(slug);
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
                <ProjectFactsRail live={live} owner={owner} taskCount={taskCount} />
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
            <div style={{ padding: 32, textAlign: "center", color: "var(--fg-muted)", fontSize: 13, border: "1px dashed var(--border-strong)", borderRadius: 10, background: "var(--bg-soft)" }}>
              Contributors come from the per-project leaderboard endpoint — not wired yet.
            </div>
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

      <div style={{ marginBottom: 16 }}>
        <CopyableBlock text={workOnProject} label="Work on this project" copyBtnLabel="Copy prompt" id="work" />
      </div>

      <div>
        <CopyableBlock text={explore} label="Explore on your own" copyBtnLabel="Copy prompt" id="explore" />
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

function ProjectFactsRail({ live, owner, taskCount }) {
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

      <div className="fact-row" style={{ borderBottom: "none" }}>
        <span className="l">Project ID</span>
        <span className="v" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: "var(--fg-muted)" }}>
          {live.id}
        </span>
      </div>
    </div>
  );
}

function TokenRail({ live }) {
  if (!live) return null;

  const tonPool = nanoToTon(live.ton_reward_pool_nano) ?? 0;
  const ownerSharePct = live.owner_share_bps != null ? live.owner_share_bps / 100 : null;
  const totalSupply = live.token_total_supply != null
    ? fmtBigInt(live.token_total_supply, live.token_decimals || 0)
    : "—";

  return (
    <div className="about-facts" style={{ marginTop: 12 }}>
      <div className="about-fact-head">Token</div>

      <div className="fact-row">
        <span className="l">Symbol</span>
        <span className="v">${live.token_symbol || "TBD"}</span>
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

      <div className="fact-row" style={{ borderBottom: "none" }}>
        <span className="l">Reward pool</span>
        <span className="v" style={{ color: "var(--accent-fg)", fontWeight: 800 }}>
          {tonPool.toLocaleString(undefined, { maximumFractionDigits: 3 })} TON
        </span>
      </div>
    </div>
  );
}
