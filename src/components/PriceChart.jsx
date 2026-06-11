// Price chart for the Trading page. Extracted from Trading.jsx
// so React.lazy can split it into its own bundle chunk — the
// chart's SVG geometry + path math is ~70 lines and only runs
// on the /trading route. The Suspense fallback in Trading.jsx
// is a 240px gray rectangle that matches the chart's footprint
// so the page doesn't shift when the chart lands.

export default function PriceChart({ data, height = 240 }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 800;
  const h = height;
  const padTop = 16, padBot = 24, padL = 12, padR = 56;
  const innerW = w - padL - padR;
  const innerH = h - padTop - padBot;

  const pts = data.map((v, i) => {
    const x = padL + (i / (data.length - 1)) * innerW;
    const y = padTop + innerH - ((v - min) / range) * innerH;
    return [x, y];
  });
  const linePath = "M" + pts.map((p) => p.join(",")).join(" L");
  const areaPath = `M${pts[0][0]},${padTop + innerH} L` + pts.map((p) => p.join(",")).join(" L") + ` L${pts[pts.length - 1][0]},${padTop + innerH} Z`;

  const last = data[data.length - 1];
  const lastY = pts[pts.length - 1][1];

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const v = min + range * (1 - t);
    const y = padTop + t * innerH;
    return { v, y };
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: h, display: "block" }}>
      <defs>
        <linearGradient id="trading-chart-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={w - padR} y1={t.y} y2={t.y} stroke="var(--border)" strokeDasharray="2 4" />
          <text x={w - padR + 6} y={t.y + 3} fontSize="9.5" fill="var(--fg-muted)" fontFamily="JetBrains Mono">
            {t.v.toFixed(6)}
          </text>
        </g>
      ))}
      <path d={areaPath} fill="url(#trading-chart-grad)" />
      <path d={linePath} stroke="var(--accent)" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      <line x1={padL} x2={w - padR} y1={lastY} y2={lastY} stroke="var(--accent)" strokeDasharray="2 3" strokeWidth="1" />
      <rect x={w - padR + 2} y={lastY - 8} width={50} height={16} rx={3} fill="var(--accent)" />
      <text x={w - padR + 6} y={lastY + 3} fontSize="10" fill="white" fontWeight="800" fontFamily="JetBrains Mono">
        {last.toFixed(6)}
      </text>
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <text key={i} x={padL + t * innerW} y={h - 8} fontSize="9" fill="var(--fg-muted)" textAnchor="middle" fontFamily="JetBrains Mono">
          {["−24h", "−18h", "−12h", "−6h", "now"][i]}
        </text>
      ))}
    </svg>
  );
}
