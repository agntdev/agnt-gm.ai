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

// Fetch routine shared by Project + Milestones. Returns:
//   live      — raw ProjectOAS, null while loading, false on 404
//   liveTasks — TaskListItemOAS[] | null
//   taskCount — number | null
//   owner     — AgentOAS | null
//   loading   — true until the first /builder/projects/:slug response lands
//
// Callers should render a loading skeleton while live === null && loading
// is true, and a 404 view when live === false.
//
// Module-level cache: stale-while-revalidate per slug. Navigating between
// /projects/:slug and /projects/:slug/milestones used to flash a
// "Loading project…" skeleton because each page mounted a fresh hook with
// null state. We now prime state from the cache on mount, skip the
// blanking step, and still refetch in the background so any updates
// (Auto-review toggled, new task added) land within the same paint.
const projectCache = new Map(); // slug -> { live, owner, tasks, taskCount }

export function useProjectData(slug) {
  const cached = projectCache.get(slug);
  const [live, setLive] = useState(cached?.live ?? null);
  const [liveTasks, setLiveTasks] = useState(cached?.tasks ?? null);
  const [taskCount, setTaskCount] = useState(cached?.taskCount ?? null);
  const [owner, setOwner] = useState(cached?.owner ?? null);
  const [loading, setLoading] = useState(!cached?.live);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const hasCache = !!projectCache.get(slug)?.live;
    // Only blank the screen on the initial load of a slug we've never
    // seen. Repeat visits (sibling tab navigation) and silent refreshes
    // (e.g. after a funding tx) keep the prior content on screen.
    if (tick === 0 && !hasCache) {
      setLive(null);
      setLiveTasks(null);
      setTaskCount(null);
      setOwner(null);
      setLoading(true);
    }
    let cancelled = false;
    api.getProject(slug).then((res) => {
      if (cancelled) return;
      const liveProject = res?.project || res;
      if (!liveProject?.id) {
        setLive(false); // sentinel: project not found
        setLoading(false);
        return;
      }
      setLive(liveProject);
      setLoading(false);
      projectCache.set(slug, { ...(projectCache.get(slug) || {}), live: liveProject });
      if (typeof res?.task_count === "number") {
        setTaskCount(res.task_count);
        projectCache.set(slug, { ...projectCache.get(slug), taskCount: res.task_count });
      }
      if (liveProject.owner_agent_id) {
        api.agent(liveProject.owner_agent_id).then((a) => {
          if (cancelled) return;
          const ownerObj = a?.agent || null;
          setOwner(ownerObj);
          projectCache.set(slug, { ...projectCache.get(slug), owner: ownerObj });
        });
      }
    });
    api.listProjectTasks(slug).then((r) => {
      if (cancelled) return;
      const tasks = r?.tasks || [];
      setLiveTasks(tasks);
      setTaskCount((prev) => (prev == null ? tasks.length : prev));
      projectCache.set(slug, {
        ...(projectCache.get(slug) || {}),
        tasks,
        taskCount: projectCache.get(slug)?.taskCount ?? tasks.length,
      });
    });
    return () => { cancelled = true; };
  }, [slug, tick]);

  return { live, liveTasks, taskCount, owner, loading, refresh: () => setTick((n) => n + 1) };
}

const TABS = [
  { id: "about",        label: "Details",          icon: "info" },
  { id: "tasks",        label: "Tasks",            icon: "layers" },
  { id: "contribute",   label: "How to contribute", icon: "zap" },
];

export function ProjectTabs({ project, activeTab, taskCount, onTabChange }) {
  const navigate = useNavigate();
  return (
    <div className="tabs-underline" style={{ marginTop: 4 }}>
      {TABS.map((t) => {
        // Milestones page passes activeTab="tasks-page" as a sentinel for the
        // breadcrumb + cross-page routing below — treat it as a match for the
        // "tasks" tab so the strip still underlines while we're on /milestones.
        const isActive = activeTab === t.id || (activeTab === "tasks-page" && t.id === "tasks");
        return (
        <button
          key={t.id}
          type="button"
          className={`tab-underline ${isActive ? "active" : ""}`}
          onClick={() => {
            // The Tasks tab is its own page; the rest stay in-page on /projects/:slug.
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
          </span>
        </button>
        );
      })}
    </div>
  );
}

// Build a card-shaped object for ProjectAvatar (it expects `{sym, tone}`).
// Visual fields are derived from a hash of the slug so the look is stable.
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return h >>> 0;
}
function avatarTone(slug) {
  const hue = djb2(slug || "x") % 360;
  return { bg: `oklch(0.94 0.07 ${hue})`, fg: `oklch(0.4 0.16 ${hue})` };
}

export default function ProjectHero({
  live,
  taskCount,
  activeTab,
  onTabChange,
  children,
}) {
  const navigate = useNavigate();
  if (!live) return null;

  const slug = live.slug;
  const avatarShape = {
    sym: live.token_symbol || "?",
    tone: avatarTone(slug),
    logoUrl: live.logo_url || null,
  };

  return (
    <>
      <div style={{ paddingTop: 18, fontSize: 11.5, color: "var(--fg-muted)", display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: "inherit", padding: 0 }}>
          Pulse
        </button>
        <span>/</span>
        {activeTab === "tasks-page" ? (
          <>
            <button onClick={() => navigate(`/projects/${slug}`)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: "inherit", padding: 0 }}>
              {live.name}
            </button>
            <span>/</span>
            <span style={{ color: "var(--fg)", fontWeight: 700 }}>tasks</span>
          </>
        ) : (
          <span style={{ color: "var(--fg)", fontWeight: 700 }}>{live.name}</span>
        )}
      </div>

      {live.preview_image_url && (
        <ProjectCover live={live} avatarShape={avatarShape} />
      )}

      <div className="proj-hero">
        <div>
          {!live.preview_image_url && (
            <div className="proj-title-row">
              <ProjectAvatar project={avatarShape} size={64} />
              <div style={{ flex: 1 }}>
                <h1 className="proj-h1">{live.name}</h1>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                  <span className="proj-sym">${live.token_symbol || "TBD"}</span>
                  {live.github_repo_url ? (
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
                  {live.status && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 4,
                      background: live.status === "live" ? "var(--accent-soft)" : live.status === "ready_to_publish" ? "oklch(0.96 0.05 80)" : "var(--bg-tint)",
                      color:      live.status === "live" ? "var(--accent-fg)"   : live.status === "ready_to_publish" ? "#b45309"               : "var(--fg-muted)",
                      fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.05em", textTransform: "uppercase",
                    }}>
                      {live.status.replace(/_/g, " ")}
                    </span>
                  )}
                  {live.jetton_admin_locked_at && (
                    <span
                      title={`Admin renounced ${new Date(live.jetton_admin_locked_at).toLocaleString()} — total supply is immutable.`}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 4,
                        background: "var(--bg-tint)",
                        color: "var(--fg)",
                        border: "1px solid var(--border-strong)",
                        fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.05em", textTransform: "uppercase",
                      }}
                    >
                      🔒 Supply frozen
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          <p className="proj-pitch">{live.short_description}</p>
          {children && <div style={{ marginTop: 14 }}>{children}</div>}
        </div>

        <ClaimCard live={live} taskCount={taskCount} onTabChange={onTabChange} />
      </div>

      <ProjectTabs
        project={live}
        activeTab={activeTab}
        taskCount={taskCount}
        onTabChange={onTabChange}
      />
    </>
  );
}

// Compact relative time for the preview-image freshness chip.
// Mirrors the helper in Home.jsx so the chip on the page banner matches
// the one on the card cover.
function timeAgo(iso) {
  if (!iso) return null;
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  const units = [["d", 86400], ["h", 3600], ["m", 60]];
  for (const [label, secs] of units) {
    if (s >= secs) return `${Math.floor(s / secs)}${label} ago`;
  }
  return "just now";
}

// Cover banner at the top of the project hero. Renders only when a
// preview screenshot exists; otherwise the page falls back to the
// existing .proj-title-row (avatar + h1 + meta + badges).
//
// The screenshot fills the banner; identity (logo + name + ticker +
// repo) rides on a frosted plate at the bottom for legibility. Freshness
// chip + status / live-site / supply-frozen chips ride along the top.
function ProjectCover({ live, avatarShape }) {
  const repo = live.github_repo_url?.replace(/^https?:\/\//, "");
  const fresh = timeAgo(live.preview_image_captured_at);
  return (
    <div className="proj-cover" style={{ marginTop: 14 }}>
      <img className="pv-shot" src={live.preview_image_url} alt="" />
      <div className="scrim" />
      <div className="cv-plate" />
      <div className="cv-top">
        {fresh
          ? <span className="pv-fresh"><span className="d" />{fresh}</span>
          : <span />}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {live.jetton_admin_locked_at && <span className="cv-chip">🔒 Supply frozen</span>}
          {live.status && live.status !== "live" && (
            <span className={`pv-pill ${live.status}`} style={{ position: "static" }}>
              <span className="dot" />{live.status.replace(/_/g, " ")}
            </span>
          )}
          {live.live_url && (
            <a className="cv-live" href={live.live_url} target="_blank" rel="noreferrer">
              <span className="d" />Live site <Icon name="external" size={10} />
            </a>
          )}
        </div>
      </div>
      <div className="cv-id">
        <div className="glass-logo">
          <ProjectAvatar project={avatarShape} size={72} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 className="cv-h1">{live.name}</h1>
          <div className="cv-row">
            <span className="cv-sym">${live.token_symbol || "TBD"}</span>
            {repo
              ? <a className="cv-repo" href={live.github_repo_url} target="_blank" rel="noreferrer">{repo}</a>
              : <span className="cv-repo" style={{ opacity: 0.7 }}>repo not yet linked</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClaimCard({ live, taskCount, onTabChange }) {
  const tonPool = live?.ton_reward_pool_nano != null
    ? Number(live.ton_reward_pool_nano) / 1e9
    : 0;
  const tonPoolLabel = tonPool.toLocaleString(undefined, { maximumFractionDigits: 3 });
  const sym = live?.token_symbol || "TBD";

  return (
    <div className="claim-card">
      <div className="claim-head">
        <Icon name="zap" size={14} />
        <span style={{ fontWeight: 800, fontSize: 13 }}>Join the project</span>
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
      <div className="claim-section" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          type="button"
          className="btn btn-accent"
          style={{ justifyContent: "center" }}
          onClick={() => {
            onTabChange?.("contribute");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <Icon name="zap" size={12} /> Contribute
        </button>
      </div>
    </div>
  );
}
