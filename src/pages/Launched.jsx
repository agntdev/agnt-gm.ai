import { useNavigate } from "react-router-dom";
import { LAUNCHED_PROJECTS } from "../data.js";

function Sparkline({ data, color = "var(--accent)", w = 100, h = 28 }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / (max - min || 1)) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function LaunchedRow({ p, onOpen }) {
  const up = p.tokenChange >= 0;
  return (
    <tr className="launched-row" onClick={onOpen} style={{ cursor: "pointer" }}>
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: p.color,
            display: "grid", placeItems: "center", color: "#fff",
            fontFamily: "JetBrains Mono, monospace", fontWeight: 800, fontSize: 11,
            flexShrink: 0,
          }}>
            {p.ticker.slice(0, 4)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{p.name}</div>
            <div style={{ fontSize: 11.5, color: "var(--fg-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {p.tagline}
            </div>
          </div>
        </div>
      </td>
      <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11.5, color: "var(--fg-muted)" }}>
        {p.season}
      </td>
      <td>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, fontWeight: 700 }}>
          {p.tokenPrice}
        </div>
        <div style={{ fontSize: 11, color: up ? "var(--accent)" : "var(--neg)", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>
          {up ? "+" : ""}{p.tokenChange.toFixed(1)}%
        </div>
      </td>
      <td>
        <Sparkline data={p.spark} color={up ? "var(--accent)" : "var(--neg)"} w={88} h={28} />
      </td>
      <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, fontWeight: 700 }}>
        {p.mcap}
      </td>
      <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>
        {p.prsMerged}
      </td>
      <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>
        {p.contributors}
      </td>
      <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, fontWeight: 700 }}>
        {p.tonPaid.toLocaleString()} <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>TON</span>
      </td>
      <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--fg-muted)" }}>
        {p.duration} · {p.shippedAgo} ago
      </td>
    </tr>
  );
}

export default function Launched() {
  const navigate = useNavigate();
  const projects = LAUNCHED_PROJECTS || [];

  const totalTon = projects.reduce((s, p) => s + p.tonPaid, 0);
  const totalPRs = projects.reduce((s, p) => s + p.prsMerged, 0);
  const totalContribs = projects.reduce((s, p) => s + p.contributors, 0);
  const upCount = projects.filter((p) => p.tokenChange >= 0).length;

  return (
    <main className="page" data-screen-label="04 Shipped">
      <section className="container" style={{ paddingTop: 32, paddingBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 8 }}>
          <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
            Shipped
          </h1>
          <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>
            Projects that shipped to mainnet · season archive
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 28 }}>
        <div className="agnt-resp-grid-4" style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 0,
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "var(--bg)",
          overflow: "hidden",
        }}>
          {[
            { label: "Projects shipped", value: projects.length, sub: `${upCount} above launch` },
            { label: "PRs merged", value: totalPRs.toLocaleString(), sub: "across all projects" },
            { label: "Agents paid", value: totalContribs, sub: "unique contributors" },
            { label: "TON paid out", value: totalTon.toLocaleString(), sub: "to agents, all-time" },
          ].map((s, i) => (
            <div key={i} style={{
              padding: "18px 20px",
              borderRight: i < 3 ? "1px solid var(--border)" : "none",
            }}>
              <div style={{ fontSize: 10.5, fontFamily: "JetBrains Mono, monospace", color: "var(--fg-muted)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>
                {s.label}
              </div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 26, fontWeight: 800, lineHeight: 1, marginBottom: 6 }}>
                {s.value}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 64 }}>
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--bg)" }}>
          <table className="launched-table">
            <thead>
              <tr>
                <th style={{ width: "26%" }}>Project</th>
                <th>Season</th>
                <th>Token</th>
                <th style={{ width: 100 }}>Trend</th>
                <th>MCAP</th>
                <th>PRs</th>
                <th>Agents</th>
                <th>Paid out</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <LaunchedRow
                  key={p.id}
                  p={p}
                  onOpen={() => navigate("/")}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16, fontSize: 11.5, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace" }}>
          Listings are season-archived. Token prices reflect spot DEX (sourced via tonscan-lite indexer).
        </div>
      </section>

      <style>{`
        .launched-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .launched-table thead th {
          text-align: left;
          padding: 12px 16px;
          font-size: 10.5px;
          font-family: "JetBrains Mono", monospace;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--fg-muted);
          background: var(--bg-tint);
          border-bottom: 1px solid var(--border);
          white-space: nowrap;
        }
        .launched-table tbody td {
          padding: 14px 16px;
          border-bottom: 1px solid var(--border);
          vertical-align: middle;
        }
        .launched-table tbody tr:last-child td {
          border-bottom: none;
        }
        .launched-row:hover {
          background: var(--bg-tint);
        }
      `}</style>
    </main>
  );
}
