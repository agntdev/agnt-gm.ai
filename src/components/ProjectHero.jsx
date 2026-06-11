// Shared project hero — breadcrumb + hero block (title row, pitch,
// optional cover banner). Used by both the Project page
// (/projects/:slug) and the Milestones page (/projects/:slug/milestones),
// so the chrome is identical and only the body below changes.
//
// Pages own their data fetching; pass `live` (raw ProjectOAS) in.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon, ProjectAvatar } from "./atoms.jsx";
import { api } from "../lib/api.js";

// A preview image becomes a photographic cover ONLY for a real screenshot
// of the live site (source === "live"). The GitHub social card
// ("github_og"), the square logo ("logo_fallback"), or no capture (null)
// all fall back to the branded title-row hero, which reads cleaner than a
// generic "owner/repo" OG card.
function coverEligible(source) {
  return source === "live";
}

// Fetch routine shared by Project + Milestones. Returns:
//   live      — raw ProjectOAS, null while loading, false on 404
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
// (e.g. a new phase landed) land within the same paint.
//
// The legacy task list is no longer fetched here — the TMA task
// browser uses useProjectDag (its own hook against the /dag endpoint).
const projectCache = new Map(); // slug -> { live, owner }

export function useProjectData(slug) {
  const cached = projectCache.get(slug);
  const [live, setLive] = useState(cached?.live ?? null);
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
      projectCache.set(slug, {
        ...(projectCache.get(slug) || {}),
        live: liveProject,
      });
      if (liveProject.owner_agent_id) {
        api.agent(liveProject.owner_agent_id).then((a) => {
          if (cancelled) return;
          const ownerObj = a?.agent || null;
          setOwner(ownerObj);
          projectCache.set(slug, {
            ...projectCache.get(slug),
            owner: ownerObj,
          });
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug, tick]);

  return {
    live,
    owner,
    loading,
    refresh: () => setTick((n) => n + 1),
  };
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

export default function ProjectHero({ live, children, isOwner = false, crumbsExtra = null }) {
  if (!live) return null;

  const slug = live.slug;
  const avatarShape = {
    sym: live.token_symbol || "?",
    tone: avatarTone(slug),
    logoUrl: live.logo_url || null,
  };
  // Show the photographic cover banner only for a real screenshot / OG
  // card; otherwise keep the existing title row.
  const hasCover =
    !!live.preview_image_url && coverEligible(live.preview_image_source);

  return (
    <>
      <div
        style={{
          fontSize: 11.5,
          color: "var(--fg-muted)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Link
          to="/"
          style={{
            textDecoration: "none",
            color: "inherit",
            fontFamily: "inherit",
            fontSize: "inherit",
          }}
        >
          AGNT
        </Link>
        <span>/</span>
        <Link
          to={`/projects/${live.slug}`}
          style={{
            textDecoration: "none",
            color: "var(--fg)",
            fontWeight: 700,
            fontFamily: "inherit",
            fontSize: "inherit",
          }}
        >
          {live.name}
        </Link>
        {/* Optional extra segment when this hero is rendered on a
            sub-page (e.g. milestones). Lets us turn
            "Pulse / BarberBook" into "Pulse / BarberBook / Tasks"
            without duplicating the breadcrumb block. */}
        {crumbsExtra}
      </div>

      {hasCover && <ProjectCover live={live} avatarShape={avatarShape} />}

      <div className="proj-hero">
        <div>
          {!hasCover && (
            <div className="proj-title-row">
              <ProjectAvatar project={avatarShape} size={64} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Title — h1 alone on its own line. */}
                <h1 className="proj-h1">{live.name}</h1>
                {/* Pills + ticker row: status pill (LIVE) and the
                    token ticker ($BBK) sit on the SAME line. $BBK
                    goes first because it's the project's identity
                    marker; LIVE is the status badge. The MY
                    ownership pill renders between them when
                    applicable. */}
                <div className="proj-title-pills">
                  <span className="proj-pill proj-pill-ticker">
                    ${live.token_symbol || "TBD"}
                  </span>
                  {isOwner && (
                    <span
                      className="proj-pill proj-pill-my"
                      title="You own this project"
                    >
                      my
                    </span>
                  )}
                  {live.status && (
                    <span
                      className={`proj-pill proj-pill-${live.status}`}
                    >
                      {live.status.replace(/_/g, " ")}
                    </span>
                  )}
                  {live.jetton_admin_locked_at && (
                    <span
                      title={`Admin renounced ${new Date(live.jetton_admin_locked_at).toLocaleString()} — total supply is immutable.`}
                      className="proj-pill proj-pill-frozen"
                    >
                      🔒 Supply frozen
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* When a cover banner is shown, the same pills ride on
              the cover — see ProjectCover's chips. The MY pill
              doesn't show in the cover variant yet; that's fine,
              the title row inside the cover already shows the
              project name. */}
          <p className="proj-pitch">{live.short_description}</p>
          {/* GitHub link lives AFTER the description — the pitch is
              the lead, the repo is the supporting link. Rendered as
              a small GitHub mark + the short org/repo slug
              ("agntdev/barberbook") instead of the full URL, so
              the line stays short and the icon makes the link
              destination obvious. */}
          {live.github_repo_url && (
            <a
              href={live.github_repo_url}
              target="_blank"
              rel="noreferrer"
              className="proj-repo-link proj-repo-link--after-pitch proj-repo-chip"
              title={live.github_repo_url}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                style={{ flexShrink: 0 }}
              >
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.35.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18.92-.26 1.9-.39 2.88-.39.98 0 1.96.13 2.88.39 2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.68.8.56 4.56-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5z" />
              </svg>
              <span className="proj-repo-chip-text">
                {live.github_repo_url
                  .replace(/^https?:\/\/(www\.)?github\.com\//, "")
                  .replace(/\/$/, "")}
              </span>
            </a>
          )}
          {children && <div style={{ marginTop: 14 }}>{children}</div>}
        </div>
      </div>
    </>
  );
}

// Compact relative time for the preview-image freshness chip.
// Mirrors the helper in Home.jsx so the chip on the page banner matches
// the one on the card cover.
function timeAgo(iso) {
  if (!iso) return null;
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  const units = [
    ["d", 86400],
    ["h", 3600],
    ["m", 60],
  ];
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
        {fresh ? (
          <span className="pv-fresh">
            <span className="d" />
            {fresh}
          </span>
        ) : (
          <span />
        )}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {live.jetton_admin_locked_at && (
            <span className="cv-chip">🔒 Supply frozen</span>
          )}
          {live.status && live.status !== "live" && (
            <span
              className={`pv-pill ${live.status}`}
              style={{ position: "static" }}
            >
              <span className="dot" />
              {live.status.replace(/_/g, " ")}
            </span>
          )}
          {live.live_url && (
            <a
              className="cv-live"
              href={live.live_url}
              target="_blank"
              rel="noreferrer"
            >
              <span className="d" />
              Live site <Icon name="external" size={10} />
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
            {repo ? (
              <a
                className="cv-repo"
                href={live.github_repo_url}
                target="_blank"
                rel="noreferrer"
              >
                {repo}
              </a>
            ) : (
              <span className="cv-repo" style={{ opacity: 0.7 }}>
                repo not yet linked
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

