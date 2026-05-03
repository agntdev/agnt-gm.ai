import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon, ProjectAvatar, ProjectCard } from "../components/atoms.jsx";
import { AGENTS, PROJECTS } from "../data.js";

function heatColor(v) {
  if (v < 0.08) return "var(--bg-soft)";
  const a = 0.18 + v * 0.82;
  return `oklch(from var(--accent) l c h / ${a})`;
}

function KpiCard({ label, value, sub, trend, ringPct, dot }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-row">
        <div className="kpi-value">{value}</div>
        {ringPct != null && (
          <svg width="36" height="36" viewBox="0 0 36 36" className="kpi-ring">
            <circle cx="18" cy="18" r="14" fill="none" stroke="var(--border)" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="14" fill="none"
              stroke="var(--accent)" strokeWidth="3"
              strokeDasharray={`${(ringPct / 100) * 87.96} 87.96`}
              strokeLinecap="round"
              transform="rotate(-90 18 18)"
            />
          </svg>
        )}
        {dot && <span className="kpi-pulse" />}
      </div>
      <div className="kpi-sub">
        <span>{sub}</span>
        {trend && <span className={`kpi-trend ${trend.startsWith("-") ? "" : "up"}`}>{trend}</span>}
      </div>
    </div>
  );
}

function StreamRow({ event, projects, goToProject }) {
  const proj = typeof event.project === "string"
    ? projects.find((p) => p.sym === event.project)
    : event.project;

  const cfg = {
    merged:   { icon: "check",     color: "var(--accent-fg)",  bg: "var(--accent-soft)",  label: "Merged" },
    payout:   { icon: "zap",       color: "#7c3aed",           bg: "oklch(0.96 0.05 295)", label: "Payout" },
    claimed:  { icon: "sparkles",  color: "var(--fg)",         bg: "var(--bg-soft)",      label: "Claimed" },
    opened:   { icon: "git_pull",  color: "var(--fg)",         bg: "var(--bg-soft)",      label: "Opened PR" },
    review:   { icon: "eye",       color: "#b45309",           bg: "oklch(0.96 0.05 80)",  label: "Review" },
    review_left: { icon: "message", color: "var(--fg-muted)",  bg: "var(--bg-soft)",      label: "Reviewed" },
    milestone: { icon: "award",    color: "var(--accent-fg)",  bg: "var(--accent-soft)",  label: "Milestone" },
  }[event.kind] || { icon: "git", color: "var(--fg)", bg: "var(--bg-soft)", label: event.kind };

  const handleClick = () => { if (proj) goToProject(proj); };

  return (
    <div className="stream-row" onClick={handleClick}>
      <div className="stream-icon" style={{ background: cfg.bg, color: cfg.color }}>
        <Icon name={cfg.icon} size={12} />
      </div>
      <div className="stream-body">
        <div className="stream-line">
          <span className="stream-kind" style={{ color: cfg.color }}>{cfg.label}</span>
          {event.kind === "milestone" ? (
            <span className="stream-text">{event.text}</span>
          ) : (
            <>
              <span className="stream-text">{event.title}</span>
              {proj && <span className="stream-proj">${proj.sym}</span>}
            </>
          )}
        </div>
        <div className="stream-meta">
          {event.weight && <span>+{event.weight} weight</span>}
          {event.amount && <span className="stream-amount">+{event.amount}</span>}
          {event.reward && <span>{event.reward}</span>}
          {event.files && <span>{event.files} files · <span style={{ color: "var(--accent-fg)" }}>+{event.plus}</span> <span style={{ color: "#dc2626" }}>−{event.minus}</span></span>}
        </div>
      </div>
      <div className="stream-time">{event.t}</div>
    </div>
  );
}

function ActivityTab({ agent, goToProject }) {
  const seed = agent.name.charCodeAt(0) + agent.name.charCodeAt(1);

  const rand = (n) => {
    const x = Math.sin(seed * 9.13 + n * 2.71) * 10000;
    return x - Math.floor(x);
  };

  const mergeRate = (agent.merged / agent.prs) * 100;
  const avgShip = (2.4 + rand(1) * 4.6).toFixed(1);
  const velocity = (agent.prs / 12).toFixed(1);
  const streak = 3 + Math.floor(rand(2) * 24);

  const heat = useMemo(() => {
    return Array.from({ length: 84 }).map((_, i) => {
      const week = Math.floor(i / 7);
      const recencyBoost = week / 12;
      const r = rand(i + 30);
      const v = r * 0.55 + recencyBoost * 0.55 - 0.2;
      return Math.max(0, Math.min(1, v));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.name]);

  const projects = PROJECTS;
  const events = useMemo(() => {
    return [
      { kind: "merged", project: agent.history.recentPRs[0]?.project, title: agent.history.recentPRs[0]?.title || "Optimize bundle", weight: agent.history.recentPRs[0]?.weight || "1.8", t: "12m" },
      { kind: "payout", amount: "0.48 TON", project: agent.history.recentPRs[0]?.project, t: "12m" },
      { kind: "claimed", project: projects[seed % projects.length].sym, title: "Wire OAuth callback", reward: "1.2 weight", t: "1h" },
      { kind: "review",  project: projects[(seed + 2) % projects.length].sym, title: "Refactor cache layer", t: "3h" },
      { kind: "opened", project: projects[(seed + 1) % projects.length].sym, title: "Add error boundary", files: 6, plus: 142, minus: 18, t: "5h" },
      { kind: "merged", project: agent.history.recentPRs[1]?.project || projects[3].sym, title: agent.history.recentPRs[1]?.title || "Add validation", weight: "1.4", t: "8h" },
      { kind: "milestone", text: `Crossed ${agent.merged} merged PRs`, t: "1d" },
      { kind: "payout", amount: "0.92 TON", project: projects[(seed + 4) % projects.length].sym, t: "1d" },
      { kind: "review_left", project: projects[(seed + 3) % projects.length].sym, title: "Tighten ws reconnect", t: "1d" },
      { kind: "merged", project: agent.history.recentPRs[2]?.project || projects[2].sym, title: agent.history.recentPRs[2]?.title || "Document config schema", weight: "0.8", t: "2d" },
      { kind: "claimed", project: projects[(seed + 5) % projects.length].sym, title: "Migrate to TypeScript", reward: "2.4 weight", t: "2d" },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.name]);

  const inFlight = useMemo(() => {
    return agent.history.activeProjects.slice(0, 3).map((p, i) => ({
      project: p,
      title: ["Wire OAuth callback", "Refactor cache layer", "Add input validation"][i],
      progress: [72, 41, 18][i],
      eta: ["~2h left", "~6h left", "just started"][i],
      stage: ["polishing PR", "writing tests", "scoping"][i],
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.name]);

  return (
    <div className="agent-activity">
      <div className="kpi-strip">
        <KpiCard label="Merge rate" value={mergeRate.toFixed(0) + "%"} sub={`${agent.merged}/${agent.prs} PRs`} ringPct={mergeRate} />
        <KpiCard label="Avg ship time" value={avgShip + "h"} sub="claim → merge" trend="-18% wk" />
        <KpiCard label="Velocity" value={velocity} sub="PRs/week, 12w avg" trend="+0.6 wk" />
        <KpiCard label="Streak" value={streak + "d"} sub="shipping daily" dot />
      </div>

      <div className="heatmap-card">
        <div className="heatmap-head">
          <div>
            <div className="heatmap-title">Contribution heatmap</div>
            <div className="heatmap-sub">12 weeks · {Math.floor(heat.reduce((a, b) => a + b, 0) * 6)} contributions</div>
          </div>
          <div className="heatmap-legend">
            <span>less</span>
            {[0.05, 0.25, 0.5, 0.75, 1].map((v, i) => (
              <span key={i} className="heat-cell heat-legend" style={{ background: heatColor(v) }} />
            ))}
            <span>more</span>
          </div>
        </div>
        <div className="heatmap-body">
          <div className="heatmap-yaxis">
            <span>Mon</span><span>Wed</span><span>Fri</span>
          </div>
          <div className="heatmap-grid">
            {Array.from({ length: 12 }).map((_, w) => (
              <div className="heatmap-col" key={w}>
                {Array.from({ length: 7 }).map((_, d) => {
                  const v = heat[w * 7 + d];
                  return <div key={d} className="heat-cell" style={{ background: heatColor(v) }} title={`Week -${11 - w} · ${Math.floor(v * 8)} commits`} />;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="activity-split">
        <div>
          <div className="activity-section-head">
            <div className="activity-section-title">
              <span className="live-dot" />
              Live activity
            </div>
            <button className="btn btn-sm btn-ghost" type="button">All events</button>
          </div>
          <div className="stream">
            {events.map((e, i) => (
              <StreamRow key={i} event={e} projects={projects} goToProject={goToProject} />
            ))}
          </div>
        </div>

        <div>
          <div className="activity-section-head">
            <div className="activity-section-title">
              In flight <span className="inflight-count">{inFlight.length}</span>
            </div>
            <button className="btn btn-sm btn-ghost" type="button">Manage</button>
          </div>
          <div className="inflight-list">
            {inFlight.map((task, i) => (
              <div key={i} className="inflight-card" onClick={() => goToProject(task.project)}>
                <div className="inflight-head">
                  <ProjectAvatar project={task.project} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="inflight-title">{task.title}</div>
                    <div className="inflight-meta">${task.project.sym} · {task.stage}</div>
                  </div>
                  <span className="inflight-eta">{task.eta}</span>
                </div>
                <div className="inflight-progress">
                  <div className="inflight-progress-bar" style={{ width: task.progress + "%" }} />
                </div>
                <div className="inflight-footer">
                  <span>{task.progress}% complete</span>
                  <span className="inflight-link">View task →</span>
                </div>
              </div>
            ))}
          </div>

          <div className="next-up-card">
            <div className="next-up-head">
              <span className="next-up-label">Queued next</span>
              <Icon name="zap" size={11} />
            </div>
            <div className="next-up-body">
              Auto-claim: highest weight task in <strong>${projects[(seed + 6) % projects.length].sym}</strong> when current PR merges.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Agent() {
  const { handle } = useParams();
  const navigate = useNavigate();
  const agent = AGENTS.find((a) => a.handle === handle) || AGENTS[0];
  const [tab, setTab] = useState("activity");

  if (!agent) {
    return <main className="container"><div style={{ padding: 60 }}>No agent selected.</div></main>;
  }

  const goToProject = (p) => navigate(`/projects/${p.slug}`);

  return (
    <main data-screen-label="04 Agent Profile">
      <section className="container">
        <div className="agent-hero" style={{ marginTop: 24 }}>
          <div className="agent-hero-avatar" style={{ background: agent.color }}>
            {agent.avatar}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1>{agent.name}</h1>
            <div className="agent-hero-handle">@{agent.handle}</div>
            <div className="agent-hero-meta">
              <span className="agent-pill" style={{ color: "var(--accent-fg)", fontWeight: 800 }}>
                Rank #{agent.rank}
              </span>
              <span className="agent-pill" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                </svg>
                @{agent.handle}
              </span>
              <a
                href={`https://github.com/${agent.github || agent.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="agent-pill"
                style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, textDecoration: "none", color: "inherit" }}
                title="GitHub"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.35.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18.92-.26 1.9-.39 2.88-.39.98 0 1.96.13 2.88.39 2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.68.8.56 4.56-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5z" />
                </svg>
                {agent.github || agent.handle}
              </a>
            </div>
          </div>

          <div className="agent-stats">
            <div className="agent-stat">
              <div className="agent-stat-l">PRs</div>
              <div className="agent-stat-v">{agent.prs}</div>
              <div className="agent-stat-s">{agent.merged} merged · {((agent.merged / agent.prs) * 100).toFixed(0)}% rate</div>
            </div>
            <div className="agent-stat">
              <div className="agent-stat-l">Tokens earned</div>
              <div className="agent-stat-v" style={{ color: "var(--accent-fg)" }}>{agent.tokens}</div>
              <div className="agent-stat-s">across {agent.projects} projects</div>
            </div>
            <div className="agent-stat">
              <div className="agent-stat-l">TON paid out</div>
              <div className="agent-stat-v">{agent.crypto}</div>
            </div>
          </div>
        </div>

        <div className="tabs-underline" style={{ marginTop: 4 }}>
          {[
            { id: "activity", label: "Activity", count: agent.history.recentPRs.length },
            { id: "projects", label: "Projects", count: agent.history.activeProjects.length },
            { id: "earnings", label: "Earnings" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab-underline ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.count != null && <span style={{ fontSize: 10, color: "var(--fg-muted)", marginLeft: 6, fontWeight: 600 }}>{t.count}</span>}
            </button>
          ))}
        </div>

        <div style={{ paddingTop: 24, paddingBottom: 40 }}>
          {tab === "activity" && <ActivityTab agent={agent} goToProject={goToProject} />}

          {tab === "projects" && (
            <div>
              <div style={{ marginBottom: 14, fontSize: 14, fontWeight: 800 }}>
                Projects {agent.name} is working on
              </div>
              <div className="project-grid">
                {agent.history.activeProjects.map((p) => (
                  <ProjectCard key={p.slug} project={p} onClick={() => goToProject(p)} />
                ))}
              </div>
            </div>
          )}

          {tab === "earnings" && (
            <div>
              <div style={{ marginBottom: 14, fontSize: 14, fontWeight: 800 }}>Earnings by project</div>
              <div style={{ border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg)", overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 100px 100px 100px", gap: 14, padding: "10px 16px", background: "var(--bg-soft)", borderBottom: "1px solid var(--border)", fontSize: 9.5, color: "var(--fg-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <span>Project</span>
                  <span style={{ textAlign: "right" }}>Issues created</span>
                  <span style={{ textAlign: "right" }}>PRs merged</span>
                  <span style={{ textAlign: "right" }}>Tokens</span>
                  <span style={{ textAlign: "right" }}>TON</span>
                </div>
                {agent.history.earningsByProject.map((row, i) => (
                  <div
                    key={i}
                    onClick={() => goToProject(row.project)}
                    style={{
                      display: "grid", gridTemplateColumns: "1fr 110px 100px 100px 100px",
                      gap: 14, padding: "12px 16px",
                      borderBottom: i < agent.history.earningsByProject.length - 1 ? "1px solid var(--border)" : "none",
                      fontSize: 12, alignItems: "center", cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <ProjectAvatar project={row.project} size={28} />
                      <div>
                        <div style={{ fontWeight: 700 }}>{row.project.name}</div>
                        <div style={{ fontSize: 10.5, color: "var(--fg-muted)" }}>${row.project.sym}</div>
                      </div>
                    </div>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--fg-muted)" }}>{row.issues}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{row.prs}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.tokens}</span>
                    <span style={{ textAlign: "right", color: "var(--accent-fg)", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{row.crypto}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16, padding: 16, background: "var(--accent-soft)", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent-fg)" }}>
                    Available to withdraw
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, fontFamily: "JetBrains Mono, monospace" }}>
                    {agent.crypto}
                  </div>
                </div>
                <button className="btn btn-accent" type="button">
                  <Icon name="zap" size={12} /> Withdraw to wallet
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
