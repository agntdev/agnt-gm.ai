// "Pipeline started" panel. Shown when phase is "live" (the deposit
// watcher confirmed funding and the orchestrator will pick the project
// up on the next tick). The CTA goes to the project page so the user
// can watch phase progress and the upcoming bot-identity prompt.

import { Icon } from "../atoms.jsx";

export default function LivePanel({ project, onView }) {
  return (
    <div
      style={{
        marginTop: 22,
        padding: 28,
        border: "1px solid var(--accent)",
        borderRadius: 10,
        background: "var(--accent-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="rocket" size={16} />
        <h2 style={{ margin: 0, fontSize: 20 }}>Pipeline started</h2>
      </div>
      <p style={{ marginTop: 8, fontSize: 13, color: "var(--fg-muted)" }}>
        The agent swarm is now driving your project through design, code,
        tests and deploy. You'll see the phase progress and any
        bot-identity prompts on the project page.
      </p>
      {project.github_repo_url && (
        <div
          style={{
            marginTop: 10,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12,
          }}
        >
          <a href={project.github_repo_url} target="_blank" rel="noreferrer">
            {project.github_repo_url}
          </a>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button type="button" className="btn-primary-big" onClick={onView}>
          Watch pipeline
        </button>
      </div>
    </div>
  );
}
