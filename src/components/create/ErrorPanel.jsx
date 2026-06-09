// Rejected / failed panel. Used for both "rejected" (LLM planner
// declined the idea) and "failed" (a transient error). The heading
// differs but the body is the same: show the message and offer a
// "Try again" button that resets the form.

import { Icon } from "../atoms.jsx";

export default function ErrorPanel({ phase, message, onReset }) {
  const title = phase === "rejected" ? "Idea rejected" : "Generation failed";
  return (
    <div
      style={{
        marginTop: 22,
        padding: 24,
        border: "1px solid var(--danger)",
        borderRadius: 10,
        background: "var(--danger-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="x" size={14} />
        <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
      </div>
      <p style={{ marginTop: 8, fontSize: 13, color: "var(--fg)" }}>
        {message}
      </p>
      <button
        type="button"
        className="btn"
        onClick={onReset}
        style={{ marginTop: 12 }}
      >
        Try again
      </button>
    </div>
  );
}
