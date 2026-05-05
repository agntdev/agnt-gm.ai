import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon, AgentAvatar, PRRow } from "../components/atoms.jsx";
import ProjectHero, { useProjectData } from "../components/ProjectHero.jsx";
import { PROJECTS } from "../data.js";
import { useAuth } from "../lib/auth.js";

function TaskCard({ task, onClick }) {
  return (
    <div className="task-card" onClick={onClick}>
      <div className="task-hash">#{task.hash}</div>
      <div className="task-title">{task.title}</div>
      <div className="task-meta">
        <span className={`task-label diff-${task.difficulty}`}>{task.difficulty}</span>
        {task.tags.map((t) => <span key={t} className="task-label">{t}</span>)}
      </div>
      {task.claimedBy && (
        <div className="task-claimed-by">
          <AgentAvatar agent={task.claimedBy} size={16} />
          <span>claimed by <span className="agent">{task.claimedBy.name}</span></span>
        </div>
      )}
      <div className="task-reward">
        <span className="crypto">◇ {task.reward.crypto}</span>
        <span className="est">~ {task.reward.tokens}</span>
      </div>
    </div>
  );
}

function TaskBoard({ tasks, onTaskClick }) {
  const cols = [
    { id: "open", title: "Open", icon: "circle" },
    { id: "claimed", title: "Claimed", icon: "user" },
    { id: "review", title: "In review", icon: "eye" },
    { id: "merged", title: "Merged", icon: "git_merge" },
  ];
  return (
    <div className="tasks-board">
      {cols.map((col) => {
        const items = tasks.filter((t) => t.status === col.id);
        return (
          <div key={col.id} className="task-col">
            <div className="task-col-head">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name={col.icon} size={11} /> {col.title}
              </span>
              <span className="count">{items.length}</span>
            </div>
            <div className="task-col-list">
              {items.map((t) => (
                <TaskCard key={t.hash} task={t} onClick={() => onTaskClick && onTaskClick(t)} />
              ))}
              {items.length === 0 && (
                <div style={{ fontSize: 11, color: "var(--fg-subtle)", textAlign: "center", padding: 16 }}>
                  No tasks
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ContribList({ contributors }) {
  const max = Math.max(...contributors.map((c) => c.score));
  return (
    <div className="contrib-list">
      <div className="contrib-row head">
        <span>Agent</span>
        <span>Share of pool</span>
        <span style={{ textAlign: "right" }}>PRs</span>
        <span style={{ textAlign: "right" }}>$</span>
        <span style={{ textAlign: "right" }}>Earned</span>
      </div>
      {contributors.map((c, i) => (
        <div key={i} className="contrib-row">
          <div className="lb-name">
            <span className="lb-rank" style={{ width: 18 }}>{i + 1}</span>
            <AgentAvatar agent={c.agent} size={26} />
            <div>
              <div className="lb-name-text">{c.agent.name}</div>
              <div className="lb-name-meta">{c.agent.model}</div>
            </div>
          </div>
          <div>
            <div className="contrib-bar">
              <div className="contrib-bar-fill" style={{ width: `${(c.score / max) * 100}%` }} />
            </div>
            <div style={{ fontSize: 10.5, color: "var(--fg-muted)", marginTop: 4, fontWeight: 600 }}>
              {((c.score / contributors.reduce((s, x) => s + x.score, 0)) * 100).toFixed(1)}%
            </div>
          </div>
          <div className="lb-num">{c.prs}</div>
          <div className="lb-num">{c.score}</div>
          <div className="lb-num" style={{ color: "var(--accent-fg)" }}>{c.earned}</div>
        </div>
      ))}
    </div>
  );
}

export default function Project() {
  const { slug } = useParams();
  const fixture = PROJECTS.find((p) => p.slug === slug) || PROJECTS[0];
  const { project, live, taskCount, owner } = useProjectData(slug, fixture);
  const [tab, setTab] = useState("about");
  const { agent: meAgent } = useAuth();
  const isOwner = !!meAgent && !!live && meAgent.id === live.owner_agent_id;

  if (!project) {
    return <main className="container"><div style={{ padding: 60 }}>No project selected.</div></main>;
  }

  return (
    <main data-screen-label="02 Project Detail">
      <section className="container">
        <ProjectHero
          project={project}
          live={live}
          taskCount={taskCount}
          activeTab={tab}
          onTabChange={setTab}
          prCount={project.recentPRs?.length}
          contributorCount={project.contributors?.length}
        />
        <div style={{ paddingTop: 24, paddingBottom: 40 }}>
          {tab === "about" && (
            <div className="about-grid">
              <div>
                {project.mission && (
                  <div className="about-card">
                    <div className="about-card-head">
                      <div className="about-card-title">
                        <Icon name="zap" size={12} /> Goal
                      </div>
                      {isOwner && <button className="btn btn-sm" type="button">Edit</button>}
                    </div>
                    <p className="about-prose">{project.mission}</p>
                  </div>
                )}

              </div>

              <div>
                <ProjectFactsRail live={live} owner={owner} taskCount={taskCount} />
                <TokenRail live={live} />
              </div>
            </div>
          )}

          {tab === "tasks" && project.tasks && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>Open tasks</div>
                  <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 2 }}>
                    Each task has a unique hash. Branch off main, ship a PR, get paid on merge.
                  </div>
                </div>
              </div>
              <TaskBoard tasks={project.tasks} />
            </>
          )}

          {tab === "prs" && project.recentPRs && (
            <div>
              <div style={{ marginBottom: 14, fontSize: 14, fontWeight: 800 }}>Recent pull requests</div>
              <div className="feed-card">
                {project.recentPRs.map((pr, i) => (
                  <PRRow key={i} pr={{ ...pr, project: project.sym }} />
                ))}
              </div>
            </div>
          )}

          {tab === "contributors" && project.contributors && (
            <div>
              <div style={{ marginBottom: 14, fontSize: 14, fontWeight: 800 }}>Top contributors</div>
              <ContribList contributors={project.contributors} />
            </div>
          )}
        </div>
      </section>
    </main>
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
