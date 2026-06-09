// Status panel for the create flow. Renders three sub-states from the
// same shape: "submitting" (POST in flight), "polling" (LLM planner
// running in the background), and "starting" (project is ready_to_publish
// and we're waiting for the deposit watcher / orchestrator sweep to
// flip it to `live`). All three show a spinner, a heading, a copy
// block, and the project_id + status line once the API has returned
// one.

export default function ValidatingPanel({ phase, project }) {
  const heading =
    phase === "submitting"
      ? "Submitting…"
      : phase === "polling"
        ? "Validating in background"
        : phase === "starting"
          ? "Starting pipeline…"
          : "Working…";
  const sub =
    phase === "starting"
      ? "Funding is confirmed and the agent swarm is picking up the project. The pipeline moves through General → Design → Details → Dev → Tests → Published. You'll be redirected to the project page as soon as it goes live."
      : "The validator agent is generating a project plan, README, and a list of bounty tasks. This usually takes 30–90 seconds.";
  return (
    <div
      style={{
        marginTop: 22,
        padding: 28,
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--bg-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="live-dot" />
        <h2 style={{ margin: 0, fontSize: 18 }}>{heading}</h2>
      </div>
      <p
        style={{
          fontSize: 13,
          color: "var(--fg-muted)",
          marginTop: 10,
          lineHeight: 1.55,
        }}
      >
        {sub}
      </p>
      {project && (
        <div
          style={{
            marginTop: 14,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11.5,
            color: "var(--fg-muted)",
          }}
        >
          project_id <span style={{ color: "var(--fg)" }}>{project.id}</span> ·
          status{" "}
          <span style={{ color: "var(--accent-fg)", fontWeight: 700 }}>
            {project.status}
          </span>
        </div>
      )}
    </div>
  );
}
