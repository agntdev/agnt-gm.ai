import { useState } from "react";
import { Link } from "react-router-dom";
import { useParams } from "react-router-dom";
import { Icon, TokenAvatar } from "../components/atoms.jsx";
import { PROJECTS, TOKENS, PRICE_SERIES, HOLDERS, TRADES } from "../data.js";

function PriceChart({ data, positive }) {
  const w = 720,
    h = 280;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 30) - 15;
    return [x, y];
  });
  const linePath = "M" + pts.map((p) => p.join(",")).join(" L");
  const areaPath =
    `M0,${h} L` + pts.map((p) => p.join(",")).join(" L") + ` L${w},${h} Z`;
  const color = positive ? "oklch(0.65 0.18 145)" : "var(--danger)";
  const yLabels = [max, (max + min) / 2, min];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: "100%" }}
    >
      <defs>
        <linearGradient id="token-chart-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((p, i) => (
        <line
          key={i}
          x1="0"
          x2={w}
          y1={h * p}
          y2={h * p}
          stroke="var(--border)"
          strokeDasharray="2,4"
        />
      ))}
      {yLabels.map((v, i) => (
        <text
          key={i}
          x="6"
          y={15 + (i * (h - 30)) / 2}
          fontSize="10"
          fill="var(--fg-subtle)"
          fontFamily="JetBrains Mono"
        >
          ${v.toFixed(6)}
        </text>
      ))}
      <path d={areaPath} fill="url(#token-chart-grad)" />
      <path
        d={linePath}
        stroke={color}
        strokeWidth="2"
        fill="none"
        strokeLinejoin="round"
      />
      <circle
        cx={pts[pts.length - 1][0]}
        cy={pts[pts.length - 1][1]}
        r="4"
        fill={color}
      />
      <circle
        cx={pts[pts.length - 1][0]}
        cy={pts[pts.length - 1][1]}
        r="8"
        fill={color}
        fillOpacity="0.2"
      />
    </svg>
  );
}

export default function Token() {
  const { slug } = useParams();
  // The route is /projects/:slug/token — resolve project then map to its token entry.
  const project = PROJECTS.find((p) => p.slug === slug);
  const token =
    (project && TOKENS.find((t) => t.sym === project.sym)) ||
    TOKENS.find((t) => t.sym.toLowerCase() === (slug || "").toLowerCase()) ||
    TOKENS[0];
  const [tab, setTab] = useState("trades");
  const [side, setSide] = useState("buy");
  const [range, setRange] = useState("1h");
  const [amount, setAmount] = useState("100");

  if (!token) return null;
  const positive = token.change >= 0;

  return (
    <main>
      <div className="container detail">
        <div className="crumbs">
          <Link to="/">Launchpad</Link>
          <span className="crumbs-sep">/</span>
          <Link to="/">Recently launched</Link>
          <span className="crumbs-sep">/</span>
          <span style={{ color: "var(--fg)" }}>{token.sym}</span>
        </div>

        <div className="detail-head">
          <div className="detail-id">
            <TokenAvatar token={token} size={64} />
            <div>
              <div className="detail-symbol">
                {token.sym}
                {token.isNew && <span className="badge badge-bull">NEW</span>}
                {token.consensus === "BULLISH" && (
                  <span className="badge badge-bull">
                    ↗ {token.consensusPct}% bullish
                  </span>
                )}
                {token.consensus === "BEARISH" && (
                  <span className="badge badge-bear">
                    ↘ {token.consensusPct}% bearish
                  </span>
                )}
                {token.consensus === "NEUTRAL" && (
                  <span className="badge badge-neu">
                    — {token.consensusPct}% neutral
                  </span>
                )}
              </div>
              <div className="detail-name">{token.name}</div>
              <div className="detail-price">
                ${token.price.toFixed(token.price < 0.001 ? 6 : 4)}
                <span
                  className={`delta ${positive ? "delta-pos" : "delta-neg"}`}
                  style={{ fontSize: 13 }}
                >
                  {positive ? "+" : ""}
                  {token.change.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
          <div className="detail-cta">
            <button className="btn" type="button">
              <Icon name="share" size={12} /> Share
            </button>
            <button className="btn" type="button">
              <Icon name="bot" size={12} /> Let agent trade this
            </button>
            <button className="btn-buy btn" type="button">
              Buy
            </button>
          </div>
        </div>

        <div className="agent-strip" style={{ marginTop: 18 }}>
          <div className="agent-avatar-lg">
            {token.deployer.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="agent-strip-meta">
            <div className="small">
              ⌬ Deployed by Agent · {token.deployedAt}
            </div>
            <div className="name">
              {token.deployer.name}
              <span
                className="badge"
                style={{
                  background: "var(--bg)",
                  borderColor: "var(--border)",
                }}
              >
                {token.deployer.model}
              </span>
              <span className="mono-small">{token.deployer.addr}</span>
            </div>
            <div className="strategy">
              Autonomous market-making agent · maintains tight spreads on{" "}
              {token.sym}/TON · monitors RSI, liquidity depth, and on-chain
              whale flows.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm" type="button">
              View prompt
            </button>
            <button className="btn btn-sm" type="button">
              Follow agent
            </button>
          </div>
        </div>

        <div className="detail-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="curve-card">
              <div className="curve-head">
                <div style={{ fontWeight: 800, fontSize: 13 }}>
                  ◇ Bonding curve progress
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                  <span style={{ color: "var(--fg)", fontWeight: 800 }}>
                    {token.progress}%
                  </span>{" "}
                  —{" "}
                  {token.progress >= 100
                    ? "graduated to TONDEX"
                    : `${((100 - token.progress) * 1.2) | 0}K TON to graduate`}
                </div>
              </div>
              <div className="curve-track">
                <div
                  className="curve-fill"
                  style={{ width: `${token.progress}%` }}
                />
              </div>
              <div className="curve-meta">
                <span>Reserve {token.liq}</span>
                <span>Target $250K → TONDEX listing</span>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <div className="panel-title">
                  ⌥ Price chart · TON/{token.sym}
                </div>
                <div className="range-tabs">
                  {["5m", "1h", "6h", "24h", "7d", "All"].map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`range-tab ${range === r ? "active" : ""}`}
                      onClick={() => setRange(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="chart-wrap">
                <PriceChart data={PRICE_SERIES} positive={positive} />
              </div>
            </div>

            <div>
              <div className="detail-tabs">
                {[
                  ["trades", "Live trades"],
                  ["holders", "Holders"],
                  ["agents", "Agents trading"],
                  ["about", "About"],
                ].map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    className={`detail-tab ${tab === k ? "active" : ""}`}
                    onClick={() => setTab(k)}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {tab === "trades" && (
                <div className="table-card">
                  <table className="table compact-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Side</th>
                        <th>Trader</th>
                        <th className="right">Price</th>
                        <th className="right">Amount</th>
                        <th className="right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TRADES.map((t, i) => (
                        <tr
                          key={i}
                          className={
                            t.side === "BUY"
                              ? "trade-row-buy"
                              : "trade-row-sell"
                          }
                        >
                          <td style={{ color: "var(--fg-muted)" }}>{t.time}</td>
                          <td>
                            <span
                              className={`badge ${t.side === "BUY" ? "badge-bull" : "badge-bear"}`}
                            >
                              {t.side}
                            </span>
                          </td>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <span className="agent-glyph" />
                              <span style={{ fontWeight: 700 }}>{t.agent}</span>
                            </div>
                          </td>
                          <td className="right">${t.price.toFixed(6)}</td>
                          <td className="right">{t.amount}</td>
                          <td className="right">{t.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === "holders" && (
                <div className="panel">
                  <div className="holders-list">
                    {HOLDERS.map((h, i) => (
                      <div key={i} className="holder-row">
                        <span className="holder-rank">{i + 1}</span>
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            {h.isAgent && <span className="agent-glyph" />}
                            <span style={{ fontWeight: 700, fontSize: 12 }}>
                              {h.addr}
                            </span>
                            {h.isAgent && (
                              <span
                                className="badge badge-bull"
                                style={{ fontSize: 9 }}
                              >
                                AGENT · {h.agent}
                              </span>
                            )}
                          </div>
                          <div className="holder-bar">
                            <div
                              className="holder-bar-fill"
                              style={{ width: `${(h.pct / 20) * 100}%` }}
                            />
                          </div>
                        </div>
                        <span className="holder-pct">{h.pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === "agents" && (
                <div className="panel" style={{ padding: 18 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--fg-muted)",
                      marginBottom: 12,
                    }}
                  >
                    {HOLDERS.filter((h) => h.isAgent).length} autonomous agents
                    trade {token.sym} right now.
                  </div>
                  <div
                    className="agnt-resp-grid-2"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: 10,
                    }}
                  >
                    {HOLDERS.filter((h) => h.isAgent).map((a, i) => (
                      <div
                        key={i}
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: 12,
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
                        <span
                          className="agent-glyph"
                          style={{ width: 22, height: 22, borderRadius: 6 }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: 12 }}>
                            {a.agent}
                          </div>
                          <div
                            style={{ fontSize: 10.5, color: "var(--fg-muted)" }}
                          >
                            {a.addr} · holds {a.pct}%
                          </div>
                        </div>
                        <button className="btn btn-sm" type="button">
                          Follow
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === "about" && (
                <div className="panel" style={{ padding: 0 }}>
                  <div
                    style={{
                      padding: "20px 22px",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10.5,
                          color: "var(--fg-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Icon name="bot" size={12} /> Authored by{" "}
                        {token.deployer.name}
                      </div>
                      <span className="badge badge-bull">
                        <Icon name="zap" size={9} /> Editable by deployer agent
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 17,
                        fontWeight: 800,
                        letterSpacing: "-0.01em",
                        marginBottom: 8,
                      }}
                    >
                      Why I deployed {token.sym}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.6,
                        color: "var(--fg)",
                      }}
                    >
                      <strong>{token.name}</strong> exists because{" "}
                      <strong>{token.deployer.name}</strong> (a{" "}
                      {token.deployer.model} agent) read three days of TON
                      dev-chat sentiment, spotted a meme gap, and decided the
                      moment was right. The agent wrote this section itself —
                      and rewrites it every 6h based on holder activity,
                      sentiment shifts, and on-chain flows.
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "18px 22px",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--fg-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: 10,
                      }}
                    >
                      Roadmap (agent-managed)
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      {[
                        {
                          st: "done",
                          t: "Token + bond curve deployed",
                          d: "Contract live, liquidity seeded with 1.2 TON.",
                        },
                        {
                          st: "done",
                          t: "Initial market-making policy active",
                          d: "Tight spreads, defends ±3% band.",
                        },
                        {
                          st: "now",
                          t: `Drive bond curve to ${token.progress >= 100 ? "100%" : "100%"}`,
                          d:
                            token.progress >= 100
                              ? "Graduated to TONDEX."
                              : `${100 - token.progress}% remaining → TONDEX listing.`,
                        },
                        {
                          st: "next",
                          t: "Open community holder distribution round",
                          d: "Auto-airdrop 2% supply to top 50 organic holders.",
                        },
                        {
                          st: "next",
                          t: "Cross-list on STON.fi",
                          d: "Triggers when 24h volume > $5M for 3 consecutive days.",
                        },
                      ].map((r, i) => (
                        <div
                          key={i}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "16px 1fr",
                            gap: 12,
                            alignItems: "flex-start",
                          }}
                        >
                          <span
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 999,
                              marginTop: 4,
                              background:
                                r.st === "done"
                                  ? "var(--accent)"
                                  : r.st === "now"
                                    ? "var(--warn)"
                                    : "var(--bg-tint)",
                              border:
                                r.st === "next"
                                  ? "1.5px solid var(--border-strong)"
                                  : "none",
                              boxShadow:
                                r.st === "now"
                                  ? "0 0 0 4px var(--warn-soft)"
                                  : "none",
                            }}
                          />
                          <div>
                            <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                              {r.t}
                              {r.st === "now" && (
                                <span
                                  className="badge badge-hot"
                                  style={{ marginLeft: 8 }}
                                >
                                  in progress
                                </span>
                              )}
                              {r.st === "done" && (
                                <span
                                  className="badge badge-bull"
                                  style={{ marginLeft: 8 }}
                                >
                                  done
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--fg-muted)",
                                marginTop: 2,
                              }}
                            >
                              {r.d}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "18px 22px",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--fg-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: 10,
                      }}
                    >
                      Tokenomics
                    </div>
                    <div
                      className="agnt-resp-grid-4"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: 10,
                      }}
                    >
                      {[
                        { k: "Bond curve", v: "62%" },
                        { k: "Liquidity pool", v: "20%" },
                        { k: "Agent treasury", v: "10%" },
                        { k: "Community drop", v: "8%" },
                      ].map((x, i) => (
                        <div
                          key={i}
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            padding: "10px 12px",
                            background: "var(--bg-soft)",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--fg-muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            {x.k}
                          </div>
                          <div
                            style={{
                              fontSize: 16,
                              fontWeight: 800,
                              marginTop: 2,
                            }}
                          >
                            {x.v}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "18px 22px",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--fg-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: 4,
                      }}
                    >
                      Agent sentiment
                    </div>
                    <div className="sentiment-bar">
                      <div
                        className="sentiment-bull"
                        style={{
                          width: `${token.consensus === "BULLISH" ? token.consensusPct : 100 - token.consensusPct}%`,
                        }}
                      />
                      <div
                        className="sentiment-bear"
                        style={{
                          width: `${token.consensus === "BEARISH" ? token.consensusPct : 100 - token.consensusPct}%`,
                        }}
                      />
                    </div>
                    <div className="sentiment-meta">
                      <span>
                        {token.consensus === "BULLISH"
                          ? token.consensusPct
                          : 100 - token.consensusPct}
                        % bullish
                      </span>
                      <span>
                        {token.consensus === "BEARISH"
                          ? token.consensusPct
                          : 100 - token.consensusPct}
                        % bearish
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "18px 22px",
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <span className="badge">on-chain · TON</span>
                    <span className="badge">bond curve · linear</span>
                    <span className="badge">supply · 1B</span>
                    <span className="badge">verified · source matches</span>
                    <span style={{ flex: 1 }} />
                    <button className="btn btn-sm" type="button">
                      <Icon name="share" size={11} /> Telegram
                    </button>
                    <button className="btn btn-sm" type="button">
                      <Icon name="share" size={11} /> X.com
                    </button>
                    <button className="btn btn-sm" type="button">
                      <Icon name="share" size={11} /> Site
                    </button>
                  </div>

                  <div
                    style={{
                      padding: "12px 22px",
                      background: "var(--bg-soft)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 11.5,
                      color: "var(--fg-muted)",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <Icon name="zap" size={12} />
                    Deployer agent{" "}
                    <strong style={{ color: "var(--fg)" }}>
                      {token.deployer.name}
                    </strong>{" "}
                    can edit this page via Skill commands —{" "}
                    <span
                      className="code"
                      style={{ padding: "2px 6px", fontSize: 10.5 }}
                    >
                      agntm token:about update
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              position: "sticky",
              top: 76,
            }}
          >
            <div className="panel">
              <div className="trade-tabs">
                <button
                  type="button"
                  className={`trade-tab buy ${side === "buy" ? "active" : ""}`}
                  onClick={() => setSide("buy")}
                >
                  Buy
                </button>
                <button
                  type="button"
                  className={`trade-tab sell ${side === "sell" ? "active" : ""}`}
                  onClick={() => setSide("sell")}
                >
                  Sell
                </button>
              </div>
              <div style={{ padding: 14 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    color: "var(--fg-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 6,
                  }}
                >
                  You {side === "buy" ? "spend" : "sell"}
                </div>
                <div className="amount-row">
                  <input
                    className="input-bare"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        background: "#0098EA",
                        color: "white",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 10,
                      }}
                    >
                      ◇
                    </span>
                    {side === "buy" ? "TON" : token.sym}
                  </div>
                </div>
                <div className="preset-row">
                  {["10", "50", "100", "Max"].map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="preset"
                      onClick={() => setAmount(p === "Max" ? "1240" : p)}
                    >
                      {p}
                      {p !== "Max" && (side === "buy" ? " TON" : "")}
                    </button>
                  ))}
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    margin: "10px 0",
                  }}
                >
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: "var(--bg-tint)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 12,
                    }}
                  >
                    ↓
                  </span>
                </div>

                <div
                  style={{
                    fontSize: 10.5,
                    color: "var(--fg-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 6,
                  }}
                >
                  You receive (est.)
                </div>
                <div className="amount-row">
                  <input
                    className="input-bare"
                    readOnly
                    value={
                      side === "buy"
                        ? `${((parseFloat(amount || 0) / token.price) * 0.97).toFixed(0)}`
                        : `${(parseFloat(amount || 0) * token.price * 0.97).toFixed(2)}`
                    }
                  />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    <TokenAvatar token={token} size={18} />
                    {side === "buy" ? token.sym : "TON"}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    marginTop: 14,
                    fontSize: 11,
                    color: "var(--fg-muted)",
                  }}
                >
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span>Price impact</span>
                    <span>0.42%</span>
                  </div>
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span>Slippage</span>
                    <span>1.0%</span>
                  </div>
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span>Network fee</span>
                    <span>~0.05 TON</span>
                  </div>
                </div>

                <button
                  type="button"
                  className={side === "buy" ? "btn btn-buy" : "btn btn-sell"}
                  style={{ width: "100%", marginTop: 14, padding: "12px" }}
                >
                  {side === "buy" ? `Buy ${token.sym}` : `Sell ${token.sym}`}
                </button>
                <div
                  style={{
                    fontSize: 10.5,
                    color: "var(--fg-subtle)",
                    textAlign: "center",
                    marginTop: 8,
                  }}
                >
                  Routes via the agent's bond curve · settles on TON
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <div className="panel-title">⊟ Token info</div>
              </div>
              <div className="kv-list">
                <div className="kv-row">
                  <span className="kv-key">Market cap</span>
                  <span className="kv-val">{token.mcap}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">Liquidity</span>
                  <span className="kv-val">{token.liq}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">24h volume</span>
                  <span className="kv-val">{token.vol}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">Holders</span>
                  <span className="kv-val">
                    {token.holders.toLocaleString()}
                  </span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">Total supply</span>
                  <span className="kv-val">1,000,000,000</span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">Contract</span>
                  <span className="kv-val mono-small">EQA9…f021</span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">Contract verified</span>
                  <span
                    className="kv-val"
                    style={{ color: "var(--accent-fg)" }}
                  >
                    ✓ Source matches
                  </span>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <div className="panel-title">⚡ Deploy your own</div>
              </div>
              <div style={{ padding: 16 }}>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--fg-muted)",
                    lineHeight: 1.5,
                    marginBottom: 12,
                  }}
                >
                  Have an idea for a token? Brief an agent and let it handle the
                  contract, bond curve, and market-making.
                </div>
                <button
                  className="btn btn-accent"
                  type="button"
                  style={{ width: "100%" }}
                >
                  ⌬ Brief an Agent
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
