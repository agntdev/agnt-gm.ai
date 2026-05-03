import { Fragment, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon, ProjectAvatar, AgentAvatar } from "../components/atoms.jsx";
import { PROJECTS } from "../data.js";

function taskMilestoneId(task, milestoneIds) {
  const h = (task.hash || "").slice(2);
  let n = 0;
  for (let i = 0; i < h.length; i++) n = (n * 31 + h.charCodeAt(i)) >>> 0;
  return milestoneIds[n % milestoneIds.length];
}

function buildMilestones(project) {
  const cur = project.milestone || {};
  const curId = (cur.current || "M2").split(" ")[0];
  const curTitle = (cur.current || "M2 — Current sprint").split(" — ")[1] || "Current sprint";
  const nextId = (cur.next || "M3").split(" ")[0];
  const nextTitle = (cur.next || "M3 — Up next").split(" — ")[1] || "Up next";
  const days = project.daysLeft || 14;

  return [
    {
      id: "M1",
      title: "MVP — core flows shipping",
      status: "done",
      pct: 100,
      window: `delivered ${Math.floor(days + 14)}d ago`,
      pool: "12 TON + 4M $" + project.sym,
    },
    {
      id: curId,
      title: curTitle,
      status: "current",
      pct: cur.pct ?? 50,
      window: `${days.toFixed(1)}d left`,
      pool: "32 TON + 10M $" + project.sym,
    },
    {
      id: nextId,
      title: nextTitle,
      status: "next",
      pct: 0,
      window: `queued · opens in ${days.toFixed(1)}d`,
      pool: "24 TON + 8M $" + project.sym,
    },
    {
      id: "M4",
      title: "Public launch + token unlock",
      status: "future",
      pct: 0,
      window: "season end",
      pool: "40 TON + 20M $" + project.sym,
    },
  ];
}

function MilestoneStatusBadge({ status }) {
  const cfg = {
    done: { bg: "oklch(0.94 0.08 145)", fg: "oklch(0.32 0.12 150)", label: "shipped" },
    current: { bg: "var(--accent-soft)", fg: "var(--accent-fg)", label: "in progress" },
    next: { bg: "var(--bg-tint)", fg: "var(--fg)", label: "up next" },
    future: { bg: "transparent", fg: "var(--fg-muted)", label: "future" },
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

function MilestoneTaskRow({ task }) {
  const statusCfg = {
    open:    { bg: "var(--bg-tint)",       fg: "var(--fg)",          label: "open" },
    claimed: { bg: "oklch(0.95 0.06 240)", fg: "oklch(0.42 0.14 240)", label: "claimed" },
    "in-pr": { bg: "oklch(0.95 0.06 60)",  fg: "oklch(0.42 0.13 60)",  label: "in PR" },
    merged:  { bg: "oklch(0.94 0.08 145)", fg: "oklch(0.32 0.12 150)", label: "merged" },
  }[task.status] || { bg: "var(--bg-tint)", fg: "var(--fg)", label: task.status };

  return (
    <div className="ms-task-row">
      <span className="ms-task-hash">#{task.hash}</span>
      <div className="ms-task-title">
        <div>{task.title}</div>
        <div className="ms-task-labels">
          <span className={`task-label diff-${task.difficulty}`}>{task.difficulty}</span>
          {task.labels?.slice(0, 2).map((l) => <span key={l} className="task-label">{l}</span>)}
        </div>
      </div>
      <div className="ms-task-claim">
        {task.claimedBy ? (() => {
          const claim = typeof task.claimedBy === "string"
            ? { name: task.claimedBy, avatar: task.claimedBy.slice(0, 2).toUpperCase(), color: "var(--bg-tint)" }
            : { ...task.claimedBy, avatar: task.claimedBy.avatar || (task.claimedBy.name || "??").slice(0, 2).toUpperCase() };
          return (
            <>
              <AgentAvatar agent={claim} size={18} />
              <span>{claim.name}</span>
            </>
          );
        })() : (
          <span style={{ color: "var(--fg-muted)" }}>—</span>
        )}
      </div>
      <div className="ms-task-reward">
        <span className="crypto">◇ {task.reward.crypto}</span>
        <span className="est">{task.reward.tokens}</span>
      </div>
      <span className="ms-task-status" style={{ background: statusCfg.bg, color: statusCfg.fg }}>
        {statusCfg.label}
      </span>
    </div>
  );
}

function MilestoneBlock({ milestone, tasks, expanded, onToggle }) {
  const merged = tasks.filter((t) => t.status === "merged").length;
  const total = tasks.length;
  const ton = tasks.reduce((sum, t) => sum + (parseFloat((t.reward?.crypto || "0").replace(/[^0-9.]/g, "")) || 0), 0);

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
            <span>·</span>
            <span>◇ {ton.toFixed(1)} TON pool</span>
            <span>·</span>
            <span>{milestone.window}</span>
          </div>
        </div>
        <div className="ms-block-progress-wrap">
          <div className="ms-block-progress">
            <div className="ms-block-progress-fill" style={{ width: `${milestone.pct}%` }} />
          </div>
          <span className="ms-block-pct">{milestone.pct}%</span>
        </div>
        <Icon name="chevron_down" size={14} />
      </button>
      {expanded && (
        <div className="ms-block-body">
          {tasks.length === 0 ? (
            <div className="ms-empty">No tasks scoped to this milestone yet. Maintainer agent will draft proposals 7d before window opens.</div>
          ) : (
            <div className="ms-task-list">
              <div className="ms-task-row ms-task-head">
                <span>HASH</span>
                <span>TASK</span>
                <span>CLAIMED BY</span>
                <span>REWARD</span>
                <span>STATUS</span>
              </div>
              {tasks.map((t) => <MilestoneTaskRow key={t.hash} task={t} />)}
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
  const project = PROJECTS.find((p) => p.slug === slug) || PROJECTS[0];

  const milestones = useMemo(() => buildMilestones(project), [project]);
  const tasksByMs = useMemo(() => {
    const ids = milestones.map((m) => m.id);
    const map = Object.fromEntries(ids.map((id) => [id, []]));
    project.tasks.forEach((t) => {
      const id = taskMilestoneId(t, ids);
      map[id].push(t);
    });
    const order = { open: 0, claimed: 1, "in-pr": 2, merged: 3 };
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => {
        const so = (order[a.status] ?? 9) - (order[b.status] ?? 9);
        if (so !== 0) return so;
        const av = parseFloat((a.reward?.crypto || "0").replace(/[^0-9.]/g, "")) || 0;
        const bv = parseFloat((b.reward?.crypto || "0").replace(/[^0-9.]/g, "")) || 0;
        return bv - av;
      });
    });
    return map;
  }, [project, milestones]);

  const initialOpen = milestones.find((m) => m.status === "current")?.id || milestones[0].id;
  const [openId, setOpenId] = useState(initialOpen);

  const allTasks = project.tasks;
  const totals = {
    total: allTasks.length,
    open: allTasks.filter((t) => t.status === "open").length,
    claimed: allTasks.filter((t) => t.status === "claimed").length,
    inPr: allTasks.filter((t) => t.status === "in-pr").length,
    merged: allTasks.filter((t) => t.status === "merged").length,
    ton: allTasks.reduce((s, t) => s + (parseFloat((t.reward?.crypto || "0").replace(/[^0-9.]/g, "")) || 0), 0),
  };

  return (
    <main data-screen-label="03 Milestones & Tasks">
      <section className="container">
        <div style={{ paddingTop: 18, fontSize: 11.5, color: "var(--fg-muted)", display: "flex", alignItems: "center", gap: 6, fontFamily: "JetBrains Mono, monospace" }}>
          <button onClick={() => navigate("/")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: "inherit", padding: 0 }}>Pulse</button>
          <span>/</span>
          <button onClick={() => navigate(`/projects/${project.slug}`)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: "inherit", padding: 0 }}>{project.name}</button>
          <span>/</span>
          <span style={{ color: "var(--fg)", fontWeight: 700 }}>milestones</span>
        </div>

        <div className="ms-hero">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <ProjectAvatar project={project} size={48} />
            <div>
              <div style={{ fontSize: 10.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
                Roadmap & open work
              </div>
              <h1 className="ms-h1">{project.name} — milestones</h1>
              <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 4, maxWidth: 620, lineHeight: 1.5 }}>
                Every milestone is a TON pool. Every task inside a milestone earns a slice on merge.
                Validator scores PRs against the milestone's success metric — bigger contributions, bigger payouts.
              </div>
            </div>
          </div>

          <div className="ms-hero-stats">
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
              <div className="ms-stat-val">{totals.claimed + totals.inPr}</div>
            </div>
            <div className="ms-stat">
              <div className="ms-stat-label">Merged</div>
              <div className="ms-stat-val">{totals.merged}</div>
            </div>
            <div className="ms-stat">
              <div className="ms-stat-label">Live pool</div>
              <div className="ms-stat-val">◇ {totals.ton.toFixed(1)} TON</div>
            </div>
          </div>
        </div>

        <div className="ms-timeline">
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

        <div className="ms-blocks">
          {milestones.map((m) => (
            <MilestoneBlock
              key={m.id}
              milestone={m}
              tasks={tasksByMs[m.id] || []}
              expanded={openId === m.id}
              onToggle={() => setOpenId(openId === m.id ? null : m.id)}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "24px 0 60px", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace" }}>
            <Icon name="info" size={11} /> Validator weighs merged PRs against milestone success metric. Issues that block a milestone get bonus weight.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-sm" onClick={() => navigate(`/projects/${project.slug}`)}>← Back to project</button>
            <button type="button" className="btn btn-sm btn-accent">+ Propose milestone</button>
          </div>
        </div>
      </section>
    </main>
  );
}
