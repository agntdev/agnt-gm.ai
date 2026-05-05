import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon, ProjectAvatar, AgentAvatar, PRRow } from "../components/atoms.jsx";
import { PROJECTS } from "../data.js";
import { api } from "../lib/api.js";

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
  const navigate = useNavigate();
  const fixture = PROJECTS.find((p) => p.slug === slug) || PROJECTS[0];
  const [project, setProject] = useState(fixture);
  const [live, setLive] = useState(null);    // raw ProjectOAS from /builder/projects/:slug
  const [taskCount, setTaskCount] = useState(null);
  const [owner, setOwner] = useState(null);  // AgentOAS from /builder/agents/{owner_agent_id}
  const [tab, setTab] = useState("about");

  useEffect(() => {
    setProject(fixture);
    setLive(null);
    setTaskCount(null);
    setOwner(null);
    let cancelled = false;
    api.getProject(slug).then((res) => {
      if (cancelled) return;
      const liveProject = res?.project || res;
      if (!liveProject?.id) return;
      setLive(liveProject);
      // Pull derived counts and the owner agent profile in parallel.
      if (typeof res?.task_count === "number") setTaskCount(res.task_count);
      if (liveProject.owner_agent_id) {
        api.agent(liveProject.owner_agent_id).then((a) => {
          if (cancelled) return;
          setOwner(a?.agent || null);
        });
      }
      // Keep merged fixture for the about copy; live wins for hero metadata.
      setProject((prev) => ({
        ...prev,
        ...liveProject,
        sym: liveProject.token_symbol || prev.sym,
        name: liveProject.name || prev.name,
      }));
    });
    api.listProjectTasks(slug).then((r) => {
      if (cancelled) return;
      if (taskCount == null && Array.isArray(r?.tasks)) setTaskCount(r.tasks.length);
    });
    return () => { cancelled = true; };
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!project) {
    return <main className="container"><div style={{ padding: 60 }}>No project selected.</div></main>;
  }

  const positive = project.change >= 0;

  return (
    <main data-screen-label="02 Project Detail">
      <section className="container">
        <div style={{ paddingTop: 18, fontSize: 11.5, color: "var(--fg-muted)", display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => navigate("/")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: "inherit", padding: 0 }}>
            Pulse
          </button>
          <span>/</span>
          <span style={{ color: "var(--fg)", fontWeight: 700 }}>{project.name}</span>
        </div>

        <div className="proj-hero">
          <div>
            <div className="proj-title-row">
              <ProjectAvatar project={project} size={64} />
              <div style={{ flex: 1 }}>
                <h1 className="proj-h1">{project.name}</h1>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                  <span className="proj-sym">${project.sym}</span>
                  <span style={{ fontSize: 12, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace" }}>github.com/{project.repo}</span>
                  {project.deployable && project.preview?.url && (
                    <a
                      href={`https://${project.preview.url}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="live-link"
                      title="View current build"
                    >
                      <span className="live-dot" />
                      <Icon name="globe" size={11} />
                      <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{project.preview.url}</span>
                      <Icon name="external" size={10} />
                    </a>
                  )}
                  {project.status && (
                    <span className={`project-status-pill ${project.status}`} style={{ position: "static" }}>
                      {project.status.replace("-", " ")}
                    </span>
                  )}
                  {project.license && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: "var(--bg-tint)", color: "var(--fg-muted)", letterSpacing: "0.04em" }}>
                      {project.license}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <p className="proj-pitch">{project.pitch}</p>
            <div className="proj-tags">
              {(project.tags || []).map((t) => <span key={t} className="tag-chip">{t}</span>)}
              {project.stack && project.stack.slice(0, 4).map((s) => (
                <span key={s} className="tag-chip" style={{ background: "var(--accent-soft)", color: "var(--accent-fg)" }}>{s}</span>
              ))}
            </div>

            {project.milestone && (
              <div style={{ marginTop: 16, padding: 14, border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-soft)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 9.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
                      Current milestone
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, marginTop: 3, fontFamily: "JetBrains Mono, monospace" }}>
                      {project.milestone.current}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
                      Up next
                    </div>
                    <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 3, fontFamily: "JetBrains Mono, monospace" }}>
                      {project.milestone.next}
                    </div>
                  </div>
                </div>
                <div style={{ height: 6, background: "var(--bg-tint)", borderRadius: 999, overflow: "hidden", position: "relative" }}>
                  <div style={{ width: `${project.milestone.pct}%`, height: "100%", background: "var(--accent)", borderRadius: 999 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10.5, color: "var(--fg-muted)" }}>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{project.milestone.pct}% complete</span>
                  <span>{project.daysLeft?.toFixed(1)}d left in season</span>
                </div>
                <button
                  onClick={() => navigate(`/projects/${project.slug}/milestones`)}
                  style={{
                    marginTop: 12, width: "100%",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                    height: 34, padding: "0 14px",
                    background: "var(--bg)", border: "1px solid var(--border-strong)",
                    borderRadius: 6, cursor: "pointer",
                    fontFamily: "JetBrains Mono, monospace", fontSize: 11.5, fontWeight: 700,
                    color: "var(--fg)",
                  }}
                >
                  <Icon name="layers" size={12} />
                  View milestones &amp; all tasks
                  <span style={{ color: "var(--fg-muted)" }}>→</span>
                </button>
              </div>
            )}

            <div className="proj-meta-row">
              <div className="proj-meta-item">
                <div className="label">Active agents</div>
                <div className="value">
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--accent)", animation: "pulse 1.5s ease-in-out infinite" }} />
                  {project.agentsActive}
                </div>
              </div>
              <div className="proj-meta-item">
                <div className="label">PRs merged</div>
                <div className="value">{project.prsMerged}</div>
              </div>
              {/* Holders + token price hidden — the API doesn't expose either yet.
                  Re-add once /builder/projects exposes holder counts and a price feed. */}
            </div>
          </div>

          <div className="claim-card">
            <div className="claim-head">
              <Icon name="zap" size={14} />
              <span style={{ fontWeight: 800, fontSize: 13 }}>Claim a task</span>
            </div>
            <div className="claim-section">
              <div className="claim-pool-row">
                <div className="claim-pool">
                  <div className="l">Reward pool</div>
                  <div className="v" style={{ color: "var(--accent-fg)" }}>{project.rewardPool?.crypto}</div>
                  <div className="s">{project.rewardPool?.tokens} ${project.sym}</div>
                </div>
                <div className="claim-pool">
                  <div className="l">Time left</div>
                  <div className="v">{project.daysLeft?.toFixed(1)}d</div>
                  <div className="s">{project.duration}d total</div>
                </div>
              </div>
            </div>
            <div className="claim-section">
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Connect your agent
              </div>
              <div className="claim-clipboard">
                <Icon name="terminal" size={11} />
                <div style={{ flex: 1 }}>
                  <div className="label">CLI</div>
                  <div>npx agntpad claim {project.sym.toLowerCase()}</div>
                </div>
                <Icon name="copy" size={11} />
              </div>
            </div>
            <div className="claim-section" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn btn-accent" style={{ justifyContent: "center" }}>
                <Icon name="git_branch" size={12} /> Fork repo &amp; start
              </button>
              <button className="btn" style={{ justifyContent: "center" }} onClick={() => navigate(`/projects/${project.slug}/token`)}>
                <Icon name="trending_up" size={12} /> Buy ${project.sym}
              </button>
              {project.deployable && project.preview?.url && (
                <a
                  href={`https://${project.preview.url}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn"
                  style={{ justifyContent: "center", textDecoration: "none" }}
                >
                  <Icon name="globe" size={12} /> View live build
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--fg-muted)", marginLeft: 4 }}>↗</span>
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="tabs-underline" style={{ marginTop: 4 }}>
          {["about", "tasks", "prs", "contributors"].map((t) => (
            <button
              key={t}
              type="button"
              className={`tab-underline ${tab === t ? "active" : ""}`}
              onClick={() => {
                if (t === "tasks") navigate(`/projects/${project.slug}/milestones`);
                else setTab(t);
              }}
            >
              {t === "about" && <Icon name="info" size={11} />}
              {t === "tasks" && <Icon name="layers" size={11} />}
              {t === "prs" && <Icon name="git_pull" size={11} />}
              {t === "contributors" && <Icon name="award" size={11} />}
              {" "}{t === "tasks" ? "Milestones & tasks" : t.charAt(0).toUpperCase() + t.slice(1)}
              <span style={{ fontSize: 10, color: "var(--fg-muted)", marginLeft: 6, fontWeight: 600 }}>
                {t === "tasks" && project.tasks?.length}
                {t === "prs" && project.recentPRs?.length}
                {t === "contributors" && project.contributors?.length}
              </span>
              {t === "tasks" && <span style={{ color: "var(--fg-muted)", marginLeft: 4 }}>↗</span>}
            </button>
          ))}
        </div>

        <div style={{ paddingTop: 24, paddingBottom: 40 }}>
          {tab === "about" && (
            <div className="about-grid">
              <div>
                <div className="about-card">
                  <div className="about-card-head">
                    <div className="about-card-title">
                      <Icon name="info" size={12} /> About this project
                    </div>
                    <div className="about-edit-hint">
                      <span className="about-edit-dot" />
                      Maintained by {project.creatorAlias}'s agent
                      <button className="btn btn-sm" type="button">Edit</button>
                    </div>
                  </div>
                  <p className="about-prose">{project.about || project.pitch}</p>
                </div>

                {project.mission && (
                  <div className="about-card">
                    <div className="about-card-head">
                      <div className="about-card-title">
                        <Icon name="zap" size={12} /> Goal
                      </div>
                      <div className="about-edit-hint">Last edited 2d ago</div>
                    </div>
                    <p className="about-prose">{project.mission}</p>
                    {project.successMetric && (
                      <div className="about-success">
                        <div className="l">Success metric</div>
                        <div className="v">{project.successMetric}</div>
                      </div>
                    )}
                  </div>
                )}

                <div className="about-card">
                  <div className="about-card-head">
                    <div className="about-card-title">
                      <Icon name="layers" size={12} /> Roadmap
                    </div>
                    <button className="btn btn-sm" type="button">+ Propose milestone</button>
                  </div>
                  <div className="roadmap">
                    {[
                      { id: "M1", title: "MVP — core flows shipping", status: "done", note: "delivered " + Math.floor((project.daysLeft || 0) + 4) + "d ago" },
                      { id: project.milestone?.current?.split(" ")[0] || "M2", title: project.milestone?.current?.split(" — ")[1] || "Current sprint", status: "current", note: (project.milestone?.pct ?? 0) + "% complete" },
                      { id: project.milestone?.next?.split(" ")[0] || "M3", title: project.milestone?.next?.split(" — ")[1] || "Up next", status: "next", note: "queued — " + (project.daysLeft || 0).toFixed(1) + "d window" },
                      { id: "M4", title: "Public launch + token unlock", status: "future", note: "season end" },
                    ].map((m, i) => (
                      <div key={i} className={`roadmap-row ${m.status}`}>
                        <div className="roadmap-marker">
                          {m.status === "done" && "✓"}
                          {m.status === "current" && <span className="dot-pulse" />}
                          {m.status === "next" && "○"}
                          {m.status === "future" && "○"}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div className="roadmap-title"><span className="m-id">{m.id}</span> {m.title}</div>
                          <div className="roadmap-note">{m.note}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
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
