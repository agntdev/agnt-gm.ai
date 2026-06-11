import { useState, lazy, Suspense } from "react";
import { Icon } from "../components/atoms.jsx";
import { PRICE_SERIES } from "../data.js";

// Lazy-load the SVG chart so its ~70 lines of path math don't
// ship in the initial bundle for users who never visit /trading.
// The Suspense fallback is a fixed-height rectangle that matches
// the chart's height prop (default 220px in the Trading page) so
// the page doesn't reflow when the chart lands.
const PriceChart = lazy(() => import("../components/PriceChart.jsx"));

const STRATEGIES = [
  { id: "scalp", name: "Scalper", icon: "zap", desc: "Tight spreads, in & out fast. Hunts every micro-move.", risk: "Mid risk", win: "62%" },
  { id: "mom", name: "Momentum Rider", icon: "trending_up", desc: "Catches breakouts, rides the wave, exits on reversal.", risk: "High risk", win: "48%" },
  { id: "range", name: "Range Bot", icon: "target", desc: "Buys the floor, sells the ceiling, sleeps in between.", risk: "Low risk", win: "71%" },
  { id: "snipe", name: "Launch Sniper", icon: "rocket", desc: "First into new agent-deployed tokens, exits at 3×.", risk: "Degen", win: "33%" },
];

const MY_PAIR_AGENTS = [
  { name: "Scalper-2389", strategy: "Scalper", status: "running", pnl: "+47.2 TON", trades: 142, since: "3h 12m" },
  { name: "RangeBot-001", strategy: "Range Bot", status: "running", pnl: "+12.8 TON", trades: 28, since: "1d 4h" },
  { name: "MomentumPepe", strategy: "Momentum Rider", status: "paused", pnl: "−4.1 TON", trades: 9, since: "6h 42m" },
];

const RECENT_FILLS = [
  { time: "11:42:08", side: "BUY", agent: "Scalper-2389", price: 0.000702, qty: "300.0", value: "$299.95" },
  { time: "11:41:54", side: "SELL", agent: "0:bb02…91ef", price: 0.000702, qty: "120.4", value: "$120.32" },
  { time: "11:41:31", side: "BUY", agent: "RangeBot-001", price: 0.000700, qty: "50.00", value: "$49.99" },
  { time: "11:40:18", side: "SELL", agent: "MoonHunter", price: 0.000698, qty: "212.6", value: "$212.18" },
  { time: "11:39:42", side: "BUY", agent: "Scalper-2389", price: 0.000704, qty: "44.21", value: "$44.20" },
  { time: "11:38:55", side: "SELL", agent: "0:f0df…c572", price: 0.000700, qty: "1,290", value: "$1,289" },
  { time: "11:37:12", side: "BUY", agent: "GrokStrategy-2", price: 0.000702, qty: "188.9", value: "$188.78" },
];

const PAIRS = [
  { base: "AGNT", quote: "USDT", baseColor: "ton", quoteColor: "usdt" },
  { base: "USDT", quote: "BUILD", baseColor: "usdt", quoteColor: "ton" },
];

function PriceChartFallback({ height = 220 }) {
  // Suspense fallback for the lazy chart. Same height so the
  // page doesn't shift when the chart lands. A subtle
  // shimmer matches the Skeletons.jsx aesthetic.
  return (
    <div
      className="skel"
      style={{ width: "100%", height, borderRadius: 4 }}
    />
  );
}

function TokenCoin({ kind, label }) {
  return <div className={`token-coin token-coin-${kind}`}>{label}</div>;
}

function PairPill({ pair, active, onClick }) {
  return (
    <button type="button" className={`pair-pill ${active ? "" : "alt"}`} onClick={onClick}>
      <div className="pair-icons">
        <TokenCoin kind={pair.baseColor} label={pair.base.slice(0, 2)} />
        <TokenCoin kind={pair.quoteColor} label={pair.quote.slice(0, 2)} />
      </div>
      {pair.base} / {pair.quote}
    </button>
  );
}

function BookTable({ side, rows, total, totalLabel }) {
  return (
    <div className="book-card">
      <div className="book-head">
        <span>
          <span style={{ color: side === "bid" ? "var(--accent-fg)" : "var(--danger)", marginRight: 6 }}>
            {side === "bid" ? "↑" : "↓"}
          </span>
          {side === "bid" ? "Bids" : "Asks"} <span className="count">({rows.length})</span>
        </span>
        <a style={{ fontSize: 10.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {side === "bid" ? "Buy orders" : "Sell orders"}
        </a>
      </div>
      <table className="book-table">
        <thead>
          <tr>
            <th>Price (USDT)</th>
            <th>Amount</th>
            <th>Total</th>
            <th>Qty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`${side}-row ${i === 0 ? "best" : ""}`}>
              <td>{r.price}</td>
              <td>{r.amount}</td>
              <td>{r.total}</td>
              <td>{r.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="book-foot">
        <span className="muted">Total</span>
        <span>{total}</span>
        <span>{totalLabel}</span>
      </div>
    </div>
  );
}

function TradeForm({ pair }) {
  const [side, setSide] = useState("buy");
  const [amount, setAmount] = useState("");
  const [orderType, setOrderType] = useState("market");
  const isBuy = side === "buy";

  return (
    <div className="trade-form-card book-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <button
          type="button"
          onClick={() => setSide("buy")}
          style={{
            padding: "12px 0", fontFamily: "inherit", fontWeight: 800, fontSize: 13,
            background: isBuy ? "var(--accent-soft)" : "transparent",
            color: isBuy ? "var(--accent-fg)" : "var(--fg-muted)",
            border: "none", borderRight: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
            cursor: "pointer",
          }}
        >Buy {pair.base}</button>
        <button
          type="button"
          onClick={() => setSide("sell")}
          style={{
            padding: "12px 0", fontFamily: "inherit", fontWeight: 800, fontSize: 13,
            background: !isBuy ? "var(--danger-soft)" : "transparent",
            color: !isBuy ? "var(--danger)" : "var(--fg-muted)",
            border: "none",
            borderBottom: "1px solid var(--border)",
            cursor: "pointer",
          }}
        >Sell {pair.base}</button>
      </div>
      <div style={{ padding: 16, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["market", "limit", "stop"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setOrderType(t)}
              style={{
                flex: 1, padding: "6px 0", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em",
                fontWeight: 700, fontFamily: "inherit",
                background: orderType === t ? "var(--fg)" : "transparent",
                color: orderType === t ? "white" : "var(--fg-muted)",
                border: "1px solid " + (orderType === t ? "var(--fg)" : "var(--border)"),
                borderRadius: 6, cursor: "pointer",
              }}
            >{t}</button>
          ))}
        </div>
        {orderType !== "market" && (
          <div className="budget-row">
            <input type="text" placeholder="0.000702" defaultValue="0.000702" />
            <span style={{ fontSize: 10.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>USDT / {pair.base}</span>
          </div>
        )}
        <div className="budget-row">
          <input type="text" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <span style={{ fontSize: 10.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{isBuy ? pair.quote : pair.base}</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["25%", "50%", "75%", "MAX"].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(p === "MAX" ? "1000" : ((1000 * parseInt(p, 10)) / 100).toString())}
              style={{
                flex: 1, padding: "5px 0", fontSize: 10, fontFamily: "inherit",
                background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 5,
                color: "var(--fg-muted)", fontWeight: 700, cursor: "pointer",
              }}
            >{p}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--fg-muted)", display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
          <span>Available</span>
          <span style={{ fontWeight: 700, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>1,284.21 {isBuy ? pair.quote : pair.base}</span>
        </div>
        <button
          type="button"
          style={{
            padding: "12px 0",
            background: isBuy ? "var(--accent)" : "var(--danger)",
            color: "white", border: "none", borderRadius: 7,
            fontFamily: "inherit", fontWeight: 800, fontSize: 13,
            cursor: "pointer",
            letterSpacing: "0.02em",
          }}
        >
          {isBuy ? "Buy" : "Sell"} {pair.base} now
        </button>
        <div style={{ fontSize: 10.5, color: "var(--fg-muted)", textAlign: "center", marginTop: -2 }}>
          Routed via tongateway · Fee 0.2% · Settles on TON
        </div>
      </div>
    </div>
  );
}

function DeployAgentCard({ pair }) {
  const [strategy, setStrategy] = useState("scalp");
  const [budget, setBudget] = useState(500);
  const [duration, setDuration] = useState(24);
  const [stopLoss, setStopLoss] = useState(true);
  const [takeProfit, setTakeProfit] = useState(true);
  const [autoCompound, setAutoCompound] = useState(false);

  return (
    <div className="deploy-card">
      <div className="deploy-head">
        <Icon name="bot" size={18} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Deploy a Trading Agent</div>
          <div style={{ fontSize: 10.5, color: "var(--fg-muted)" }}>Lets it trade {pair.base}/{pair.quote} for you 24/7</div>
        </div>
        <span className="badge-shine">New</span>
      </div>

      <div className="deploy-step">
        <div className="deploy-step-label"><span className="num">1</span> Choose strategy</div>
        <div className="strategy-grid">
          {STRATEGIES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`strategy-card ${strategy === s.id ? "selected" : ""}`}
              onClick={() => setStrategy(s.id)}
            >
              <div className="sc-title"><Icon name={s.icon} size={12} /> {s.name}</div>
              <div className="sc-desc">{s.desc}</div>
              <div className="sc-meta">{s.risk} · {s.win} win-rate</div>
            </button>
          ))}
        </div>
      </div>

      <div className="deploy-step">
        <div className="deploy-step-label"><span className="num">2</span> Allocate budget</div>
        <div className="budget-row">
          <input
            type="text"
            value={budget}
            onChange={(e) => setBudget(parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)}
          />
          <span style={{ fontSize: 11, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>USDT</span>
        </div>
        <div className="slider-row">
          <input type="range" min={50} max={5000} step={50} value={budget} onChange={(e) => setBudget(parseInt(e.target.value, 10))} />
          <span style={{ fontSize: 10.5, color: "var(--fg-muted)", minWidth: 50, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>${budget}</span>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
          {[100, 500, 1000, 2500].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setBudget(v)}
              style={{
                flex: 1, padding: "5px 0", fontSize: 10, fontFamily: "inherit",
                background: budget === v ? "var(--fg)" : "var(--bg-soft)",
                color: budget === v ? "white" : "var(--fg-muted)",
                border: "1px solid var(--border)", borderRadius: 5,
                fontWeight: 700, cursor: "pointer",
              }}
            >${v}</button>
          ))}
        </div>
      </div>

      <div className="deploy-step">
        <div className="deploy-step-label"><span className="num">3</span> Guardrails</div>
        <div className="guardrails-list">
          <div className="guard-row">
            <span className="gr-key"><Icon name="clock" size={12} /> Run for</span>
            <span className="gr-val">
              <input type="number" value={duration} onChange={(e) => setDuration(parseInt(e.target.value, 10) || 0)}
                style={{ width: 40, border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px", fontFamily: "inherit", fontSize: 11.5, fontWeight: 800, textAlign: "right" }} /> hours
            </span>
          </div>
          <div className="guard-row">
            <span className="gr-key"><Icon name="trending_down" size={12} /> Stop-loss at −15%</span>
            <button type="button" className={`toggle ${stopLoss ? "on" : ""}`} onClick={() => setStopLoss(!stopLoss)} aria-label="toggle stop loss" />
          </div>
          <div className="guard-row">
            <span className="gr-key"><Icon name="trending_up" size={12} /> Take-profit at +50%</span>
            <button type="button" className={`toggle ${takeProfit ? "on" : ""}`} onClick={() => setTakeProfit(!takeProfit)} aria-label="toggle take profit" />
          </div>
          <div className="guard-row">
            <span className="gr-key"><Icon name="zap" size={12} /> Auto-compound profits</span>
            <button type="button" className={`toggle ${autoCompound ? "on" : ""}`} onClick={() => setAutoCompound(!autoCompound)} aria-label="toggle auto compound" />
          </div>
        </div>
      </div>

      <div className="deploy-step">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10, fontSize: 11 }}>
          <div>
            <div style={{ color: "var(--fg-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Est. fee</div>
            <div style={{ fontWeight: 800, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>0.4 TON</div>
          </div>
          <div>
            <div style={{ color: "var(--fg-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Spawned via</div>
            <div style={{ fontWeight: 800, marginTop: 2 }}>grok-4.1-fast</div>
          </div>
        </div>
        <button
          type="button"
          style={{
            width: "100%", padding: "12px 0",
            background: "var(--fg)", color: "white",
            border: "none", borderRadius: 7,
            fontFamily: "inherit", fontWeight: 800, fontSize: 13,
            cursor: "pointer", letterSpacing: "0.02em",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <Icon name="rocket" size={14} /> Deploy agent · ${budget} on {pair.base}/{pair.quote}
        </button>
        <div style={{ fontSize: 10.5, color: "var(--fg-muted)", textAlign: "center", marginTop: 8 }}>
          Agent runs in your TON wallet · pause or withdraw any time
        </div>
      </div>
    </div>
  );
}

function MyPairAgents({ pair }) {
  return (
    <div className="book-card">
      <div className="book-head">
        <span><Icon name="bot" size={12} /> Your agents on {pair.base}/{pair.quote} <span className="count">({MY_PAIR_AGENTS.length})</span></span>
        <a style={{ fontSize: 10.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Manage all</a>
      </div>
      <div>
        {MY_PAIR_AGENTS.map((a, i) => (
          <div key={i} className="agent-row">
            <div className={`agent-status-dot ${a.status === "paused" ? "paused" : ""}`} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 12 }}>{a.name}</div>
              <div style={{ color: "var(--fg-muted)", fontSize: 10.5, marginTop: 2 }}>
                {a.strategy} · {a.trades} trades · running {a.since}
              </div>
            </div>
            <div style={{
              fontWeight: 800, fontVariantNumeric: "tabular-nums",
              color: a.pnl.startsWith("+") ? "var(--accent-fg)" : "var(--danger)",
              fontSize: 12,
            }}>{a.pnl}</div>
            <div style={{ display: "flex", gap: 4 }}>
              <button type="button" style={{ padding: "4px 8px", fontSize: 10, fontFamily: "inherit", background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 5, cursor: "pointer", fontWeight: 700 }}>
                {a.status === "paused" ? "Resume" : "Pause"}
              </button>
              <button type="button" style={{ padding: "4px 8px", fontSize: 10, fontFamily: "inherit", background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 5, cursor: "pointer", fontWeight: 700 }}>Logs</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentFills() {
  return (
    <div className="book-card">
      <div className="book-head">
        <span><Icon name="activity" size={12} /> Recent trades</span>
        <span className="count">live</span>
      </div>
      <table className="book-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Side</th>
            <th>Price</th>
            <th>Qty</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {RECENT_FILLS.map((f, i) => (
            <tr key={i}>
              <td style={{ textAlign: "left", color: "var(--fg-muted)", fontWeight: 500 }}>{f.time}</td>
              <td style={{ color: f.side === "BUY" ? "var(--accent-fg)" : "var(--danger)", textAlign: "left", fontWeight: 700 }}>
                {f.side}
              </td>
              <td>{f.price.toFixed(6)}</td>
              <td>{f.qty}</td>
              <td>{f.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Trading() {
  const [activePair, setActivePair] = useState(0);
  const pair = PAIRS[activePair];

  const bids = [
    { price: "0.000702", amount: "300.0000", total: "427,500", qty: "1" },
    { price: "0.000700", amount: "50.0000", total: "71,428.6", qty: "1" },
    { price: "0.000698", amount: "120.0000", total: "171,919", qty: "2" },
    { price: "0.000695", amount: "210.0000", total: "302,158", qty: "3" },
    { price: "0.000692", amount: "84.5000", total: "122,109", qty: "1" },
  ];

  const asks = [
    { price: "0.000704", amount: "44.21", total: "0.031124", qty: "1" },
    { price: "0.000708", amount: "180.00", total: "0.127440", qty: "2" },
    { price: "0.000712", amount: "320.00", total: "0.227840", qty: "3" },
    { price: "0.000718", amount: "75.00", total: "0.053850", qty: "1" },
    { price: "0.000722", amount: "212.60", total: "0.153500", qty: "2" },
  ];

  return (
    <main className="container" data-screen-label="04 Trading">
      <div className="trading-head">
        <div className="trading-title-icon"><Icon name="chart" size={20} /></div>
        <div className="trading-title">
          <h1>Trading</h1>
          <div className="trading-title-sub">
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--accent)" }} />
            Live · Routed via tongateway · Settled on TON
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button type="button" style={{ padding: "8px 14px", fontSize: 12, fontFamily: "inherit", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="share" size={12} /> Share pair
          </button>
        </div>
      </div>

      <div className="pair-row">
        <span style={{ fontSize: 10.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginRight: 6 }}>Pair</span>
        {PAIRS.map((p, i) => (
          <PairPill key={i} pair={p} active={i === activePair} onClick={() => setActivePair(i)} />
        ))}
        <button type="button" className="pair-add">+</button>
      </div>

      <div className="market-strip">
        <div className="ms-item">
          <span className="ms-label">Last price</span>
          <span className="ms-value" style={{ color: "var(--accent-fg)" }}>0.000702</span>
        </div>
        <div className="ms-divider" />
        <div className="ms-item">
          <span className="ms-label">24h change</span>
          <span className="ms-value" style={{ color: "var(--accent-fg)" }}>+12.4%</span>
        </div>
        <div className="ms-divider" />
        <div className="ms-item">
          <span className="ms-label">Bid</span>
          <span className="ms-value" style={{ color: "var(--accent-fg)" }}>0.000702</span>
        </div>
        <div className="ms-item">
          <span className="ms-label">Ask</span>
          <span className="ms-value" style={{ color: "var(--danger)" }}>0.000704</span>
        </div>
        <div className="ms-item">
          <span className="ms-label">Spread</span>
          <span className="ms-value" style={{ color: "var(--warn)" }}>0.28%</span>
        </div>
        <div className="ms-divider" />
        <div className="ms-item">
          <span className="ms-label">Vol 24h</span>
          <span className="ms-value">$371.25K</span>
        </div>
        <div className="ms-item">
          <span className="ms-label">Filled 24h</span>
          <span className="ms-value">287</span>
        </div>
        <div className="ms-divider" />
        <div className="ms-item">
          <span className="ms-label">Bot share</span>
          <span className="ms-value">73%</span>
        </div>
      </div>

      <div className="trading-grid">
        <div className="tg-left">
          <div className="book-card">
            <div className="book-head">
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {pair.base}/{pair.quote}
                <span style={{ display: "flex", gap: 2 }}>
                  {["1H", "4H", "1D", "1W"].map((tf, i) => (
                    <button
                      key={tf}
                      type="button"
                      style={{
                        padding: "3px 8px", fontSize: 10, fontFamily: "inherit",
                        background: i === 2 ? "var(--fg)" : "transparent",
                        color: i === 2 ? "white" : "var(--fg-muted)",
                        border: "1px solid " + (i === 2 ? "var(--fg)" : "var(--border)"),
                        borderRadius: 4, cursor: "pointer", fontWeight: 700,
                      }}
                    >{tf}</button>
                  ))}
                </span>
              </span>
              <span className="count">tongateway feed</span>
            </div>
            <div style={{ padding: "8px 4px" }}>
              <Suspense fallback={<PriceChartFallback height={220} />}>
                <PriceChart data={PRICE_SERIES} height={220} />
              </Suspense>
            </div>
          </div>

          <div className="book-row-grid">
            <BookTable side="bid" rows={bids} total="350.0000 USDT" totalLabel="$349.94" />
            <BookTable side="ask" rows={asks} total="831.81 AGNT" totalLabel="$0.594" />
          </div>

          <MyPairAgents pair={pair} />

          <RecentFills />
        </div>

        <div className="tg-right">
          <TradeForm pair={pair} />
          <DeployAgentCard pair={pair} />
        </div>
      </div>
    </main>
  );
}
