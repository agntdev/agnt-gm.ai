// Skeleton placeholders for the loading states. Sized to match
// the real content so the layout doesn't shift when data lands.
//
// Measurements were taken with Chrome CDP on a live dev server
// (1148px desktop + 430px mobile) — the .skel-card and .skel-task
// classes in styles.css encode those numbers directly. If the
// real card structure changes, re-measure and update the
// skeletons to match (don't eyeball it).

/**
 * Project card skeleton. One .skel-card = one project card
 * placeholder. Use 3-6 of these to fill the grid while the
 * projects API is loading.
 */
export function ProjectCardSkeleton() {
  return (
    <div className="skel-card">
      <div className="skel-card-hero">
        <div className="skel" style={{ width: 46, height: 46, borderRadius: 8 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="skel" style={{ width: "70%", height: 18 }} />
          <div className="skel" style={{ width: "45%", height: 15 }} />
        </div>
      </div>
      <div className="skel-card-body">
        <div className="skel" style={{ width: "100%", height: 13 }} />
        <div className="skel" style={{ width: "88%", height: 13 }} />
        <div className="skel-card-stats">
          <div className="skel-card-stat" />
          <div className="skel-card-stat" />
          <div className="skel-card-stat" />
          <div className="skel-card-stat-v" />
          <div className="skel-card-stat-v" />
          <div className="skel-card-stat-v" />
        </div>
      </div>
    </div>
  );
}

/**
 * Grid of project card skeletons. `count` is how many
 * placeholder cards to render. Six is enough to cover the
 * viewport on desktop; three on mobile.
 */
export function ProjectCardSkeletonGrid({ count = 6 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <ProjectCardSkeleton key={i} />
      ))}
    </>
  );
}

/**
 * Task row skeleton. Matches the .ms-task-row structure:
 * hash + status badge on top, 2-line title, labels row.
 * Use 4-6 of these while the DAG endpoint is loading.
 */
export function TaskRowSkeleton() {
  return (
    <div className="skel-task">
      <div className="skel-task-top">
        <div className="skel" style={{ width: 53, height: 15 }} />
        <div className="skel" style={{ width: 65, height: 18, borderRadius: 999 }} />
      </div>
      <div className="skel skel-task-title" />
      <div className="skel skel-task-title-2" />
      <div className="skel-task-labels">
        <div className="skel skel-task-label" />
        <div className="skel skel-task-label" style={{ width: 38 }} />
      </div>
    </div>
  );
}

export function TaskRowSkeletonList({ count = 5 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TaskRowSkeleton key={i} />
      ))}
    </>
  );
}
