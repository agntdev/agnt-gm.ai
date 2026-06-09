// "Plan accepted" panel + the project metadata table. Rendered when
// phase is "ready" (the LLM planner finished and the project is in
// ready_to_publish). The funding CTA is a `children` slot so the
// parent (orchestrator) can decide whether to show it (when the pool
// is non-zero) or skip it (when pool=0, pipeline auto-starts).

import { Icon } from "../atoms.jsx";

export default function ReviewPanel({ project, errorMsg, funded, children }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div
        style={{
          padding: 24,
          border: "1px solid var(--accent)",
          borderRadius: 10,
          background: "var(--accent-soft)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="check" size={14} />
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            {funded ? "Pool funded — pipeline running" : "Plan accepted"}
          </h2>
        </div>
        <p
          style={{
            fontSize: 13,
            color: "var(--fg-muted)",
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          {funded
            ? "The deposit confirmed on-chain. The agent swarm is taking over — design, code, tests, deploy — with no further action on your side. This page will flip to the project view in a moment."
            : "Plan approved. Send TON to start the pipeline — design, code, tests and deploy run automatically, with no further action on your side."}
        </p>
      </div>

      <div
        style={{
          marginTop: 14,
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {[
          ["Name", project.name],
          ["Slug", project.slug],
          ["Token symbol", `$${project.token_symbol || "—"}`],
          ["Total supply", (project.token_total_supply ?? 0).toLocaleString()],
          ["Decimals", project.token_decimals ?? "—"],
          [
            "Owner share",
            project.owner_share_bps != null
              ? `${project.owner_share_bps / 100}%`
              : "—",
          ],
          ["Status", project.status],
          ["Project ID", project.id],
        ].map(([k, v], i, arr) => (
          <div
            key={k}
            className="agnt-resp-kv-row"
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              padding: "10px 16px",
              fontSize: 12,
              borderBottom:
                i < arr.length - 1 ? "1px solid var(--border)" : "none",
            }}
          >
            <span
              style={{
                color: "var(--fg-muted)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                fontSize: 10.5,
              }}
            >
              {k}
            </span>
            <span
              style={{
                fontFamily:
                  typeof v === "string" && v.length > 16
                    ? "JetBrains Mono, monospace"
                    : "inherit",
                fontWeight: 700,
              }}
            >
              {String(v)}
            </span>
          </div>
        ))}
      </div>

      {children}

      {errorMsg && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: "1px solid var(--danger)",
            borderRadius: 6,
            background: "var(--danger-soft)",
            color: "var(--danger)",
            fontSize: 12,
          }}
        >
          {errorMsg}
        </div>
      )}
    </div>
  );
}
