// /projects/:slug/milestones
//
// Reuses <ProjectHero> so the breadcrumb, hero block, and tab strip match
// the project root exactly. The body below the tab strip swaps for a
// roadmap timeline + per-milestone task tables driven by the live
// /builder/projects/:slug/tasks payload.

import { Fragment, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon, AgentAvatar } from "../components/atoms.jsx";
import ProjectHero from "../components/ProjectHero.jsx";
import { useProjectData } from "../components/ProjectHero.jsx";
import { PROJECTS } from "../data.js";

// Until the API returns explicit milestones, we slot every task into one of
// four synthetic phases (M1..M4) by hashing its slug. The rendering layer
// stays the same; once /builder/projects/:slug/milestones ships we can drop
// this and feed real milestone IDs through.
function taskMilestoneId(task, milestoneIds) {
  const key = (task.slug || task.id || "").toString();
  let n = 0;
  for (let i = 0; i < key.length; i++) n = (n * 31 + key.charCodeAt(i)) >>> 0;
  return milestoneIds[n % milestoneIds.length];
}

function buildMilestones(tasks) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const inProg = tasks.filter((t) => t.status === "in_progress" || t.status === "in_review").length;
  const open = tasks.filter((t) => t.status === "open").length;

  // Distribute completion across four phases so the timeline still reads
  // even when there are only a handful of tasks.
  return [
    { id: "M1", title: "MVP — core flows", status: done >= total / 4 ? "done"    : "current", pct: total === 0 ? 0 : Math.min(100, Math.round((done / Math.max(1, total)) * 400)) },
    { id: "M2", title: "Hardening",        status: done >= total / 2 ? "done"    : inProg > 0 ? "current" : "next",   pct: total === 0 ? 0 : Math.min(100, Math.max(0, Math.round(((done * 4 - total) / Math.max(1, total)) * 100))) },
    { id: "M3", title: "Polish",           status: done >= (total * 3) / 4 ? "done" : open > 0 ? "next" : "future", pct: 0 },
    { id: "M4", title: "Launch",           status: done === total && total > 0 ? "done" : "future",                  pct: 0 },
  ];
}

const TASK_STATUS_CFG = {
  open:        { bg: "var(--bg-tint)",       fg: "var(--fg)",            label: "open" },
  in_progress: { bg: "oklch(0.95 0.06 240)", fg: "oklch(0.42 0.14 240)", label: "claimed" },
  in_review:   { bg: "oklch(0.95 0.06 60)",  fg: "oklch(0.42 0.13 60)",  label: "in review" },
  done:        { bg: "oklch(0.94 0.08 145)", fg: "oklch(0.32 0.12 150)", label: "merged" },
  cancelled:   { bg: "var(--danger-soft)",   fg: "var(--danger)",        label: "cancelled" },
};

function MilestoneStatusBadge({ status }) {
  const cfg = {
    done:    { bg: "oklch(0.94 0.08 145)", fg: "oklch(0.32 0.12 150)", label: "shipped" },
    current: { bg: "var(--accent-soft)",   fg: "var(--accent-fg)",     label: "in progress" },
    next:    { bg: "var(--bg-tint)",       fg: "var(--fg)",            label: "up next" },
    future:  { bg: "transparent",          fg: "var(--fg-muted)",      label: "future" },
  }[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 8px",
      background: cfg.bg, color: cfg.fg,
      border: status === "future" ? "1px dashed var(--border-strong)" : "1px solid transparent",
      borderRadius: 4,
      fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
      fontFamily: "JetBrains Mono, monospace",
    }}>
      {status === "current" && <span className="dot-pulse" />}
      {cfg.label}
    </span>
  );
}

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

function MilestoneTaskRow({ task, decimals, sym }) {
  const cfg = TASK_STATUS_CFG[task.status] || TASK_STATUS_CFG.open;
  const claimedAgent = task.solved_by_agent_id ? { name: task.solved_by_agent_id.slice(0, 8), avatar: task.solved_by_agent_id.slice(0, 2).toUpperCase(), color: "var(--bg-tint)" } : null;

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
        {claimedAgent ? (
          <>
            <AgentAvatar agent={claimedAgent} size={18} />
            <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{claimedAgent.name}</span>
          </>
        ) : (
          <span style={{ color: "var(--fg-muted)" }}>—</span>
        )}
      </div>
      <div className="ms-task-reward">
        <span className="est">{fmtReward(task.reward_amount, decimals, sym)}</span>
      </div>
      <span className="ms-task-status" style={{ background: cfg.bg, color: cfg.fg }}>
        {cfg.label}
      </span>
    </div>
  );
}

function MilestoneBlock({ milestone, tasks, decimals, sym, expanded, onToggle }) {
  const merged = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  return (
    <div className={`ms-block status-${milestone.status} ${expanded ? "open" : ""}`}>
      <button className="ms-block-head" onClick={onToggle} type="button">
        <div className="ms-block-marker">
          {milestone.status === "done" && <Icon name="check" size={14} />}
          {milestone.status === "current" && <span className="dot-pulse" />}
          {(milestone.status === "next" || milestone.status === "future") && <span className="ms-marker-ring" />}
        </div>
        <div className="ms-block-id">{milestone.id}</div>
        <div className="ms-block-title">
          <div className="ms-block-title-line">{milestone.title}</div>
          <div className="ms-block-meta">
            <MilestoneStatusBadge status={milestone.status} />
            <span>{merged}/{total} tasks merged</span>
          </div>
        </div>
        <div className="ms-block-progress-wrap">
          <div className="ms-block-progress">
            <div className="ms-block-progress-fill" style={{ width: `${milestone.pct}%` }} />
          </div>
          <span className="ms-block-pct">{milestone.pct}%</span>
        </div>
      </button>
      {expanded && (
        <div className="ms-block-body">
          {tasks.length === 0 ? (
            <div className="ms-empty">
              No tasks scoped to this milestone yet.
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
              {tasks.map((t) => <MilestoneTaskRow key={t.id || t.slug} task={t} decimals={decimals} sym={sym} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Milestones() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const fixture = PROJECTS.find((p) => p.slug === slug) || PROJECTS[0];
  const { project, live, liveTasks, taskCount } = useProjectData(slug, fixture);

  const tasks = liveTasks || [];
  const decimals = live?.token_decimals ?? 0;
  const sym = live?.token_symbol || project.sym;

  const milestones = useMemo(() => buildMilestones(tasks), [tasks]);
  const tasksByMs = useMemo(() => {
    const ids = milestones.map((m) => m.id);
    const map = Object.fromEntries(ids.map((id) => [id, []]));
    tasks.forEach((t) => {
      const id = taskMilestoneId(t, ids);
      map[id].push(t);
    });
    const order = { open: 0, in_progress: 1, in_review: 2, done: 3, cancelled: 4 };
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
    });
    return map;
  }, [tasks, milestones]);

  const initialOpen = milestones.find((m) => m.status === "current")?.id || milestones[0].id;
  const [openId, setOpenId] = useState(initialOpen);

  const totals = {
    total: tasks.length,
    open: tasks.filter((t) => t.status === "open").length,
    inFlight: tasks.filter((t) => t.status === "in_progress" || t.status === "in_review").length,
    merged: tasks.filter((t) => t.status === "done").length,
  };
  const tonPool = live?.ton_reward_pool_nano != null
    ? Number(live.ton_reward_pool_nano) / 1e9
    : 0;

  return (
    <main data-screen-label="03 Milestones & Tasks">
      <section className="container">
        <ProjectHero
          project={project}
          live={live}
          taskCount={taskCount}
          activeTab="tasks-page"
          prCount={0}
          contributorCount={0}
        />

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
            <div className="ms-stat">
              <div className="ms-stat-label">Live pool</div>
              <div className="ms-stat-val">◇ {tonPool.toLocaleString(undefined, { maximumFractionDigits: 3 })} TON</div>
            </div>
          </div>

          <div className="ms-timeline" style={{ marginTop: 24 }}>
            {milestones.map((m, i) => (
              <Fragment key={m.id}>
                <button
                  type="button"
                  className={`ms-tl-node status-${m.status} ${openId === m.id ? "active" : ""}`}
                  onClick={() => setOpenId(m.id)}
                >
                  <div className="ms-tl-dot">
                    {m.status === "done" && "✓"}
                    {m.status === "current" && <span className="dot-pulse" />}
                  </div>
                  <div className="ms-tl-id">{m.id}</div>
                  <div className="ms-tl-title">{m.title}</div>
                  <div className="ms-tl-pct">{m.pct}%</div>
                </button>
                {i < milestones.length - 1 && <div className={`ms-tl-bar ${milestones[i].status === "done" ? "done" : ""}`} />}
              </Fragment>
            ))}
          </div>

          <div className="ms-blocks" style={{ marginTop: 24 }}>
            {liveTasks === null ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>
                Loading tasks…
              </div>
            ) : (
              milestones.map((m) => (
                <MilestoneBlock
                  key={m.id}
                  milestone={m}
                  tasks={tasksByMs[m.id] || []}
                  decimals={decimals}
                  sym={sym}
                  expanded={openId === m.id}
                  onToggle={() => setOpenId(openId === m.id ? null : m.id)}
                />
              ))
            )}
          </div>

          <div style={{ display: "flex", gap: 8, padding: "24px 0 60px", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 11.5, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace" }}>
              <Icon name="info" size={11} /> Validator weighs merged PRs against milestone success metric.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-sm" onClick={() => navigate(`/projects/${project.slug}`)}>← Back to project</button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
