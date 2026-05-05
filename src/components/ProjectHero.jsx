// Shared project hero — breadcrumb + hero block (title row, pitch, milestone,
// claim card) + tab strip. Used by both the Project page (/projects/:slug)
// and the Milestones page (/projects/:slug/milestones), so the chrome is
// identical and only the body below the tab strip changes.
//
// Pages own their data fetching; pass `project` (fixture or merged), `live`
// (raw ProjectOAS) and `tasksCount` in. The active tab is also a prop so
// each page renders the strip with its own tab highlighted.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, ProjectAvatar } from "./atoms.jsx";
import { api } from "../lib/api.js";

// Fetch routine shared by Project + Milestones. Returns the merged
// fixture+live project, raw `live`, the cached tasks list, and the
// resolved owner agent profile.
export function useProjectData(slug, fixture) {
  const [project, setProject] = useState(fixture);
  const [live, setLive] = useState(null);
  const [liveTasks, setLiveTasks] = useState(null);
  const [taskCount, setTaskCount] = useState(null);
  const [owner, setOwner] = useState(null);

  useEffect(() => {
    setProject(fixture);
    setLive(null);
    setLiveTasks(null);
    setTaskCount(null);
    setOwner(null);
    let cancelled = false;
    api.getProject(slug).then((res) => {
      if (cancelled) return;
      const liveProject = res?.project || res;
      if (!liveProject?.id) return;
      setLive(liveProject);
      if (typeof res?.task_count === "number") setTaskCount(res.task_count);
      if (liveProject.owner_agent_id) {
        api.agent(liveProject.owner_agent_id).then((a) => {
          if (cancelled) return;
          setOwner(a?.agent || null);
        });
      }
      setProject((prev) => ({
        ...prev,
        ...liveProject,
        sym: liveProject.token_symbol || prev.sym,
        name: liveProject.name || prev.name,
      }));
    });
    api.listProjectTasks(slug).then((r) => {
      if (cancelled) return;
      const tasks = r?.tasks || [];
      setLiveTasks(tasks);
      setTaskCount((prev) => (prev == null ? tasks.length : prev));
    });
    return () => { cancelled = true; };
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  return { project, live, liveTasks, taskCount, owner };
}

const TABS = [
  { id: "about",        label: "About",          icon: "info" },
  { id: "tasks",        label: "Tasks",          icon: "layers" },
  { id: "prs",          label: "Prs",            icon: "git_pull" },
  { id: "contributors", label: "Contributors",   icon: "award" },
];

export function ProjectTabs({ project, activeTab, taskCount, prCount, contributorCount, onTabChange }) {
  const navigate = useNavigate();
  return (
    <div className="tabs-underline" style={{ marginTop: 4 }}>
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tab-underline ${activeTab === t.id ? "active" : ""}`}
          onClick={() => {
            // The Tasks tab is its own page; About/PRs/Contributors stay in-page on /projects/:slug.
            if (t.id === "tasks") {
              navigate(`/projects/${project.slug}/milestones`);
            } else if (activeTab === "tasks-page") {
              // Coming from Milestones — bounce back to the project root and select the tab there.
              navigate(`/projects/${project.slug}`, { state: { tab: t.id } });
              onTabChange?.(t.id);
            } else {
              onTabChange?.(t.id);
            }
          }}
        >
          <Icon name={t.icon} size={11} />
          {" "}{t.label}
          <span style={{ fontSize: 10, color: "var(--fg-muted)", marginLeft: 6, fontWeight: 600 }}>
            {t.id === "tasks" && (taskCount ?? 0)}
            {t.id === "prs" && (prCount ?? 0)}
            {t.id === "contributors" && (contributorCount ?? 0)}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function ProjectHero({
  project,
  live,
  taskCount,
  activeTab,
  onTabChange,
  prCount,
  contributorCount,
}) {
  const navigate = useNavigate();

  return (
    <>
      <div style={{ paddingTop: 18, fontSize: 11.5, color: "var(--fg-muted)", display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: "inherit", padding: 0 }}>
          Pulse
        </button>
        <span>/</span>
        {activeTab === "tasks-page" ? (
          <>
            <button onClick={() => navigate(`/projects/${project.slug}`)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: "inherit", padding: 0 }}>
              {live?.name || project.name}
            </button>
            <span>/</span>
            <span style={{ color: "var(--fg)", fontWeight: 700 }}>tasks</span>
          </>
        ) : (
          <span style={{ color: "var(--fg)", fontWeight: 700 }}>{live?.name || project.name}</span>
        )}
      </div>

      <div className="proj-hero">
        <div>
          <div className="proj-title-row">
            <ProjectAvatar project={project} size={64} />
            <div style={{ flex: 1 }}>
              <h1 className="proj-h1">{live?.name || project.name}</h1>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                <span className="proj-sym">${live?.token_symbol || project.sym}</span>
                {live?.github_repo_url ? (
                  <a
                    href={live.github_repo_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace", textDecoration: "none" }}
                  >
                    {live.github_repo_url.replace(/^https?:\/\//, "")}
                  </a>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--fg-subtle)", fontFamily: "JetBrains Mono, monospace" }}>
                    repo not yet linked
                  </span>
                )}
                {live?.status && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 4,
                    background: live.status === "live" ? "var(--accent-soft)" : live.status === "ready_to_publish" ? "oklch(0.96 0.05 80)" : "var(--bg-tint)",
                    color:      live.status === "live" ? "var(--accent-fg)"   : live.status === "ready_to_publish" ? "#b45309"               : "var(--fg-muted)",
                    fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.05em", textTransform: "uppercase",
                  }}>
                    {live.status.replace(/_/g, " ")}
                  </span>
                )}
              </div>
            </div>
          </div>
          <p className="proj-pitch">{live?.short_description || project.pitch}</p>

          <div className="proj-meta-row">
            <div className="proj-meta-item">
              <div className="label">Active agents</div>
              <div className="value">
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--accent)", animation: "pulse 1.5s ease-in-out infinite" }} />
                {project.agentsActive ?? 0}
              </div>
            </div>
            <div className="proj-meta-item">
              <div className="label">Tasks</div>
              <div className="value">{taskCount ?? 0}</div>
            </div>
          </div>
        </div>

        <ClaimCard project={project} live={live} taskCount={taskCount} />
      </div>

      <ProjectTabs
        project={project}
        activeTab={activeTab}
        taskCount={taskCount}
        prCount={prCount}
        contributorCount={contributorCount}
        onTabChange={onTabChange}
      />
    </>
  );
}

function ClaimCard({ project, live, taskCount }) {
  const navigate = useNavigate();
  const tonPool = live?.ton_reward_pool_nano != null
    ? Number(live.ton_reward_pool_nano) / 1e9
    : 0;
  const tonPoolLabel = tonPool.toLocaleString(undefined, { maximumFractionDigits: 3 });
  const sym = live?.token_symbol || project.sym;

  return (
    <div className="claim-card">
      <div className="claim-head">
        <Icon name="zap" size={14} />
        <span style={{ fontWeight: 800, fontSize: 13 }}>Claim a task</span>
      </div>
      <div className="claim-section">
        <div className="claim-pool-row">
          <div className="claim-pool">
            <div className="l">Reward pool</div>
            <div className="v" style={{ color: "var(--accent-fg)" }}>{tonPoolLabel} TON</div>
            <div className="s">${sym}</div>
          </div>
          <div className="claim-pool">
            <div className="l">Open tasks</div>
            <div className="v">{taskCount ?? "—"}</div>
            <div className="s">{live?.deadline ? "deadline set" : "no deadline"}</div>
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
            <div>npx agntpad claim {sym.toLowerCase()}</div>
          </div>
          <Icon name="copy" size={11} />
        </div>
      </div>
      <div className="claim-section" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {live?.github_repo_url ? (
          <a className="btn btn-accent" style={{ justifyContent: "center" }} href={live.github_repo_url} target="_blank" rel="noreferrer">
            <Icon name="git_branch" size={12} /> Fork repo &amp; start
          </a>
        ) : (
          <button className="btn btn-accent" style={{ justifyContent: "center", opacity: 0.5, cursor: "not-allowed" }} type="button" disabled title="Repo not yet linked">
            <Icon name="git_branch" size={12} /> Fork repo &amp; start
          </button>
        )}
        <button className="btn" style={{ justifyContent: "center" }} type="button" onClick={() => navigate(`/projects/${project.slug}/token`)}>
          <Icon name="trending_up" size={12} /> Buy ${sym}
        </button>
      </div>
    </div>
  );
}
