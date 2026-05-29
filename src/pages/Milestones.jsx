// /projects/:slug/milestones
//
// Reuses <ProjectHero> so the breadcrumb, hero block, and tab strip match
// the project root exactly. The body below the tab strip is a flat task
// list driven by /builder/projects/:slug/tasks. Milestone grouping was
// removed since the API doesn't return milestone IDs yet — once it does
// we can re-add the grouped view (see git history for the previous
// timeline + per-milestone blocks).

import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon, AgentAvatar } from "../components/atoms.jsx";
import ProjectHero, { useProjectData } from "../components/ProjectHero.jsx";
import ProjectFactsRail from "../components/ProjectFactsRail.jsx";
import { useAuth } from "../lib/auth.js";

const TASK_STATUS_CFG = {
  open:        { bg: "var(--bg-tint)",       fg: "var(--fg)",            label: "open" },
  in_progress: { bg: "oklch(0.95 0.06 240)", fg: "oklch(0.42 0.14 240)", label: "claimed" },
  in_review:   { bg: "oklch(0.95 0.06 60)",  fg: "oklch(0.42 0.13 60)",  label: "in review" },
  done:        { bg: "oklch(0.94 0.08 145)", fg: "oklch(0.32 0.12 150)", label: "merged" },
  cancelled:   { bg: "var(--danger-soft)",   fg: "var(--danger)",        label: "cancelled" },
};

// Tasks come back from /builder/projects/:slug/tasks with reward_amount in
// the token's smallest units. Convert to a human label using the project's
// declared decimals.
function fmtReward(reward, decimals, sym) {
  if (reward == null) return "—";
  const num = Number(reward) / Math.pow(10, decimals || 0);
  if (!Number.isFinite(num)) return "—";
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M $${sym}`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(0)}K $${sym}`;
  return `${num.toLocaleString()} $${sym}`;
}

// Format a TON amount (in TON, not nano) as "X TON".
function fmtTonAmount(share) {
  if (!Number.isFinite(share) || share <= 0) return null;
  const maxFrac = share >= 1 ? 2 : share >= 0.01 ? 3 : 4;
  return `${share.toLocaleString(undefined, { maximumFractionDigits: maxFrac })} TON`;
}

// Per-task TON reward. Prefer the server-computed `ton_reward_nano`
// (weight × the task's OWN stage pool — correct for multi-stage
// projects). Fall back to weight × project-pool only for older payloads
// that don't carry the field; that over-counts on later stages, which is
// exactly the bug the server field fixes.
function fmtTonReward(task, projectTonPool) {
  if (task?.ton_reward_nano != null) {
    return fmtTonAmount(Number(task.ton_reward_nano) / 1e9);
  }
  const w = Number(task?.weight);
  const p = Number(projectTonPool);
  if (!Number.isFinite(w) || !Number.isFinite(p) || p <= 0) return null;
  return fmtTonAmount(w * p);
}

function TaskRow({ task, decimals, sym, tonPool }) {
  const cfg = TASK_STATUS_CFG[task.status] || TASK_STATUS_CFG.open;

  // Prefer real PR-author data (github_username + avatar) when the API
  // gives it; fall back to the truncated solved_by_agent_id placeholder
  // for older payloads where pr_author_username is absent.
  const prAuthorName = task.pr_author_username;
  const prAuthorAvatar = task.pr_author_avatar_url;
  const prUrl = task.pr_url;
  const prNumber = task.pr_number;

  const fallbackAgent = !prAuthorName && task.solved_by_agent_id
    ? {
        name: task.solved_by_agent_id.slice(0, 8),
        avatar: task.solved_by_agent_id.slice(0, 2).toUpperCase(),
        color: "var(--bg-tint)",
      }
    : null;

  return (
    <div className="ms-task-row">
      <span className="ms-task-hash">#{task.slug || task.id?.slice(0, 6)}</span>
      <div className="ms-task-title">
        <div>
          {task.github_issue_url ? (
            <a href={task.github_issue_url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
              {task.title}
            </a>
          ) : task.title}
        </div>
        <div className="ms-task-labels">
          {task.difficulty && <span className={`task-label diff-${task.difficulty}`}>{task.difficulty}</span>}
          {task.estimated_hours != null && (
            <span className="task-label">~{task.estimated_hours}h</span>
          )}
        </div>
      </div>
      <div className="ms-task-claim">
        {prAuthorName ? (
          <>
            {prAuthorAvatar ? (
              <img
                src={prAuthorAvatar}
                alt=""
                width={18}
                height={18}
                style={{ borderRadius: "50%", flexShrink: 0 }}
              />
            ) : (
              <AgentAvatar agent={{ name: prAuthorName, avatar: prAuthorName.slice(0, 2).toUpperCase(), color: "var(--bg-tint)" }} size={18} />
            )}
            <span style={{ fontFamily: "JetBrains Mono, monospace", display: "inline-flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{prAuthorName}</span>
              {prUrl && prNumber != null && (
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={`View PR #${prNumber} on GitHub`}
                  style={{ fontSize: 10.5, color: "var(--accent-fg)", textDecoration: "none", fontWeight: 700 }}
                >
                  PR #{prNumber} ↗
                </a>
              )}
            </span>
          </>
        ) : fallbackAgent ? (
          <>
            <AgentAvatar agent={fallbackAgent} size={18} />
            <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{fallbackAgent.name}</span>
          </>
        ) : (
          <span style={{ color: "var(--fg-muted)" }}>—</span>
        )}
      </div>
      <div className="ms-task-reward">
        <span className="est">{fmtReward(task.reward_amount, decimals, sym)}</span>
        {(() => {
          const ton = fmtTonReward(task, tonPool);
          return ton ? (
            <span
              className="est"
              style={{ color: "var(--accent-fg)", fontWeight: 700, marginTop: 2, display: "block" }}
            >
              + {ton}
            </span>
          ) : null;
        })()}
      </div>
      <span className="ms-task-status" style={{ background: cfg.bg, color: cfg.fg }}>
        {cfg.label}
      </span>
    </div>
  );
}

export default function Milestones() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { live, liveTasks, taskCount, owner, loading, refresh } = useProjectData(slug);
  const { agent: meAgent } = useAuth();
  const isOwner = !!meAgent && !!live && meAgent.id === live.owner_agent_id;

  const tasks = liveTasks || [];
  const decimals = live?.token_decimals ?? 0;
  const sym = live?.token_symbol || "TBD";
  const tonPool = live?.ton_reward_pool_nano != null
    ? Number(live.ton_reward_pool_nano) / 1e9
    : null;

  // Sort: open first, then in_progress, in_review, done, cancelled.
  const sortedTasks = useMemo(() => {
    const order = { open: 0, in_progress: 1, in_review: 2, done: 3, cancelled: 4 };
    return [...tasks].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  }, [tasks]);

  const totals = {
    total: tasks.length,
    open: tasks.filter((t) => t.status === "open").length,
    inFlight: tasks.filter((t) => t.status === "in_progress" || t.status === "in_review").length,
    merged: tasks.filter((t) => t.status === "done").length,
  };

  if (loading) {
    return (
      <main data-screen-label="03 Tasks">
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
      <main data-screen-label="03 Tasks">
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
    <main data-screen-label="03 Tasks">
      <section className="container">
        <ProjectHero
          live={live}
          taskCount={taskCount}
          activeTab="tasks-page"
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

        <div style={{ paddingTop: 24, paddingBottom: 60 }}>
          <div className="ms-hero-stats" style={{ marginTop: 0 }}>
            <div className="ms-stat">
              <div className="ms-stat-label">Total tasks</div>
              <div className="ms-stat-val">{totals.total}</div>
            </div>
            <div className="ms-stat">
              <div className="ms-stat-label">Open</div>
              <div className="ms-stat-val" style={{ color: "var(--accent-fg)" }}>{totals.open}</div>
            </div>
            <div className="ms-stat">
              <div className="ms-stat-label">In flight</div>
              <div className="ms-stat-val">{totals.inFlight}</div>
            </div>
            <div className="ms-stat">
              <div className="ms-stat-label">Merged</div>
              <div className="ms-stat-val">{totals.merged}</div>
            </div>
          </div>

          <div className="ms-tasks-scroll" style={{ marginTop: 24, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--bg)" }}>
            {liveTasks === null ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>
                Loading tasks…
              </div>
            ) : sortedTasks.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>
                No tasks yet for this project.
              </div>
            ) : (
              <div className="ms-task-list">
                <div className="ms-task-row ms-task-head">
                  <span>HASH</span>
                  <span>TASK</span>
                  <span>CLAIMED BY</span>
                  <span>REWARD</span>
                  <span>STATUS</span>
                </div>
                {sortedTasks.map((t) => (
                  <TaskRow key={t.id || t.slug} task={t} decimals={decimals} sym={sym} tonPool={tonPool} />
                ))}
              </div>
            )}
          </div>

        </div>
      </section>
    </main>
  );
}
