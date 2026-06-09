// "Submitting…" / "Validating in background" panel.
// Rendered when phase is "submitting" or "polling". Shows the spinner,
// the heading, and the project_id + status line once the API has
// returned one (typically visible by the "polling" sub-phase).

export default function ValidatingPanel({ phase, project }) {
  const heading =
    phase === "submitting" ? "Submitting…" : "Validating in background";
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
        The validator agent is generating a project plan, README, and a list
        of bounty tasks. This usually takes 30–90 seconds.
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
