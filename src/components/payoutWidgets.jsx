// Shared payout-visibility building blocks.
// Used by:
//   - Agent profile (PayoutsPanel — earnings of one agent)
//   - Project page (ProjectPayoutsSection — paid to all contributors)
//   - Home page    (PlatformPayoutsCard — platform-wide rollup)
//
// Keeps the visual language identical across all three so a glance at
// any of them reads the same: 4 tiles, an optional bar chart, an
// optional list, an optional next-run countdown chip.

import { useEffect, useState } from "react";
import { Icon } from "./atoms.jsx";

// ───────────────────────────── formatters ──────────────────────────

export function fmtTonNano(nano) {
  if (nano == null) return "0";
  const n = typeof nano === "string" ? Number(nano) : Number(nano);
  if (!Number.isFinite(n) || n === 0) return "0";
  const ton = n / 1e9;
  if (ton >= 1000) return ton.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (ton >= 10)   return ton.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return ton.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function fmtTokenAmount(amount, decimals = 9) {
  if (amount == null) return "0";
  const n = Number(amount) / Math.pow(10, decimals);
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ───────────────────────────── NextPayoutChip ──────────────────────

export function NextPayoutChip({ schedule, label = "Next payout" }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!schedule?.next_run_at) return null;
  const due = new Date(schedule.next_run_at).getTime();
  const remaining = Math.max(0, Math.floor((due - now) / 1000));
  const hh = Math.floor(remaining / 3600);
  const mm = Math.floor((remaining % 3600) / 60);
  const ss = remaining % 60;
  const text = remaining === 0
    ? "running…"
    : hh > 0
      ? `${hh}h ${String(mm).padStart(2, "0")}m`
      : `${mm}m ${String(ss).padStart(2, "0")}s`;
  return (
    <div
      title={schedule.human_cadence || schedule.description}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 10px", borderRadius: 999,
        background: "var(--bg-soft)",
        border: "1px solid var(--border)",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10.5, fontWeight: 800,
        color: "var(--fg-muted)",
        letterSpacing: "0.04em", textTransform: "uppercase",
      }}
    >
      <span className="live-dot" />
      {label} in <span style={{ color: "var(--fg)" }}>{text}</span>
    </div>
  );
}

// ───────────────────────────── PayoutTile ──────────────────────────

export function PayoutTile({ label, ton, token, count, tone }) {
  const ringColor = tone === "accent" ? "var(--accent)"
    : tone === "amber" ? "oklch(0.75 0.12 80)"
    : "var(--border)";
  const fgColor = tone === "accent" ? "var(--accent-fg)"
    : tone === "amber" ? "#b45309"
    : "var(--fg)";
  return (
    <div style={{
      padding: "14px 18px",
      border: `1px solid ${ringColor}`,
      background: tone === "accent" ? "var(--accent-soft)" : tone === "amber" ? "oklch(0.97 0.04 80)" : "var(--bg-soft)",
      borderRadius: 10,
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ fontSize: 9.5, color: fgColor, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, opacity: 0.85 }}>
        {label}
      </div>
      <div style={{
        fontSize: 22, fontWeight: 800,
        fontFamily: "JetBrains Mono, monospace", fontVariantNumeric: "tabular-nums",
        color: fgColor,
      }}>
        {fmtTonNano(ton)}
        <span style={{ fontSize: 11, marginLeft: 4, fontWeight: 600, opacity: 0.7 }}>TON</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace" }}>
        + {fmtTokenAmount(token)} tokens
        <span style={{ marginLeft: 8 }}>· {count ?? 0} payout{count === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}

// Re-usable 4-tile grid driven by a payout-summary DTO. Both agent and
// project summary endpoints share the same shape, so the same renderer
// works for both.
export function SummaryTiles({ summary }) {
  if (!summary) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
      <PayoutTile
        label="Pending"
        ton={summary.pending?.ton_nano}
        token={summary.pending?.token_total}
        count={summary.pending?.payout_count}
        tone="amber"
      />
      <PayoutTile
        label="Lifetime"
        ton={summary.lifetime?.ton_nano}
        token={summary.lifetime?.token_total}
        count={summary.lifetime?.payout_count}
        tone="accent"
      />
      <PayoutTile
        label="Last 30d"
        ton={summary.last_30d?.ton_nano}
        token={summary.last_30d?.token_total}
        count={summary.last_30d?.payout_count}
      />
      <PayoutTile
        label="Last 7d"
        ton={summary.last_7d?.ton_nano}
        token={summary.last_7d?.token_total}
        count={summary.last_7d?.payout_count}
      />
    </div>
  );
}

// ───────────────────────────── WeeklyBars ──────────────────────────

export function WeeklyBars({ weekly, title = "TON paid" }) {
  if (!weekly || weekly.length === 0) return null;
  const max = weekly.reduce((m, w) => Math.max(m, Number(w.ton_nano) || 0), 0);
  const height = 88;
  return (
    <div style={{
      padding: "14px 18px",
      border: "1px solid var(--border)", borderRadius: 10,
      background: "var(--bg-soft)",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 9.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
          {title} · last {weekly.length} weeks
        </div>
        <div style={{ fontSize: 10.5, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace" }}>
          peak {fmtTonNano(max)} TON
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${weekly.length}, 1fr)`, gap: 4, alignItems: "end", height }}>
        {weekly.map((w, i) => {
          const v = Number(w.ton_nano) || 0;
          const pct = max > 0 ? v / max : 0;
          const filled = v > 0;
          const start = w.week_start ? new Date(w.week_start) : null;
          const label = start
            ? `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${fmtTonNano(v)} TON · ${w.payout_count ?? 0} payouts`
            : `${fmtTonNano(v)} TON`;
          return (
            <div key={i} title={label} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "stretch", height: "100%" }}>
              <div style={{
                width: "100%",
                height: `${Math.max(filled ? 4 : 1, pct * height)}px`,
                background: filled ? "var(--accent)" : "var(--border)",
                borderRadius: 3,
                transition: "height 0.18s ease",
              }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────── PayoutsList ─────────────────────────

const PAYOUT_STATUS_CFG = {
  sent:      { bg: "var(--accent-soft)",   fg: "var(--accent-fg)",  label: "sent" },
  pending:   { bg: "oklch(0.96 0.05 80)",  fg: "#b45309",           label: "pending" },
  failed:    { bg: "var(--danger-soft)",   fg: "var(--danger)",     label: "failed" },
  cancelled: { bg: "var(--bg-tint)",       fg: "var(--fg-muted)",   label: "cancelled" },
};

// `mode` = "agent" (label column = project) | "project" (label column = agent).
// `collapseAt` = if >0 and rows.length > collapseAt, show only that many
// rows by default with a quiet "Show all N" footer that expands in place.
export function PayoutsList({ rows, mode = "agent", collapseAt = 0, emptyText }) {
  const [expanded, setExpanded] = useState(false);
  if (!rows || rows.length === 0) {
    return (
      <div style={{
        padding: 20,
        border: "1px dashed var(--border)",
        borderRadius: 10,
        background: "var(--bg-soft)",
        textAlign: "center",
        color: "var(--fg-muted)",
        fontSize: 12.5,
      }}>
        {emptyText || "No payouts yet."}
      </div>
    );
  }
  const overflow = collapseAt > 0 && rows.length > collapseAt;
  const visible = overflow && !expanded ? rows.slice(0, collapseAt) : rows;
  const headerLeft = mode === "project" ? "Agent" : "Project";
  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--bg)",
    }}>
      <style>{`
        .agnt-payouts-row { animation: agntPayoutRowIn 220ms ease-out both; }
        @keyframes agntPayoutRowIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 2fr) 110px minmax(120px, 1.2fr) 130px",
        padding: "10px 16px", background: "var(--bg-soft)",
        fontSize: 9.5, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 800,
        borderBottom: "1px solid var(--border)",
      }}>
        <span>{headerLeft}</span>
        <span style={{ textAlign: "right" }}>Status</span>
        <span style={{ textAlign: "right" }}>Amount</span>
        <span style={{ textAlign: "right" }}>When</span>
      </div>
      {visible.map((row, idx) => {
        const cfg = PAYOUT_STATUS_CFG[row.status] || PAYOUT_STATUS_CFG.pending;
        const when = row.sent_at || row.requested_at;
        const whenStr = fmtWhen(when);
        const isTon = (row.currency || "").toLowerCase() === "ton";
        const amountLabel = isTon
          ? `◇ ${fmtTonNano(row.amount)} TON`
          : `${fmtTokenAmount(row.amount)} $${row.token_symbol || "TOKEN"}`;
        const leftPrimary = mode === "project"
          ? (row.agent_username || row.agent_id?.slice(0, 8) || "—")
          : (row.project_name || row.project_slug || row.project_id?.slice(0, 8) || "—");
        const leftSecondary = row.tx_hash
          ? `tx ${row.tx_hash.slice(0, 10)}…`
          : `run ${row.run_id?.slice(0, 8) || "—"}`;
        return (
          <a
            key={row.id}
            className="agnt-payouts-row"
            href={row.tx_hash ? `https://tonviewer.com/transaction/${row.tx_hash}` : undefined}
            target={row.tx_hash ? "_blank" : undefined}
            rel="noreferrer"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 2fr) 110px minmax(120px, 1.2fr) 130px",
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              fontSize: 12.5, color: "inherit", textDecoration: "none",
              cursor: row.tx_hash ? "pointer" : "default",
              animationDelay: `${idx * 30}ms`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontFamily: "JetBrains Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {leftPrimary}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>
                {leftSecondary}
              </div>
            </div>
            <span style={{ textAlign: "right" }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "2px 8px", borderRadius: 999,
                background: cfg.bg, color: cfg.fg,
                fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                {row.status === "sent" && <span className="live-dot" style={{ background: cfg.fg }} />}
                {cfg.label}
              </span>
            </span>
            <span style={{
              textAlign: "right", fontFamily: "JetBrains Mono, monospace",
              fontVariantNumeric: "tabular-nums", fontWeight: 700,
              color: isTon ? "var(--accent-fg)" : "var(--fg)",
            }}>
              {amountLabel}
            </span>
            <span style={{ textAlign: "right", fontSize: 11, color: "var(--fg-muted)" }}>
              {whenStr}
            </span>
          </a>
        );
      })}
      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", padding: "10px 16px",
            border: "none",
            borderTop: "1px solid var(--border)",
            background: expanded ? "var(--bg-soft)" : "var(--bg)",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em",
            color: "var(--fg-muted)", textTransform: "uppercase",
            cursor: "pointer", transition: "background 0.15s ease, color 0.15s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fg)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fg-muted)"; }}
        >
          {expanded
            ? <>Show recent {collapseAt} <span style={{ fontSize: 12 }}>↑</span></>
            : <>Show all {rows.length} payouts <span style={{ fontSize: 12 }}>↓</span></>}
        </button>
      )}
    </div>
  );
}

// ───────────────────────────── ExtraCountsRow ──────────────────────
// Small badge row beneath the tiles. Project summary returns
// agents_paid + tasks_paid; platform summary returns
// agents_paid_lifetime + projects_paid_lifetime.

export function ExtraCountsRow({ items }) {
  const visible = items.filter((it) => it.value != null);
  if (visible.length === 0) return null;
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 12,
      marginTop: 12, fontSize: 11, color: "var(--fg-muted)",
      fontFamily: "JetBrains Mono, monospace",
    }}>
      {visible.map((it) => (
        <span
          key={it.label}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 999,
            background: "var(--bg-soft)", border: "1px solid var(--border)",
            letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 800,
          }}
        >
          {it.icon && <Icon name={it.icon} size={10.5} />}
          <span style={{ color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>{it.value}</span>
          {it.label}
        </span>
      ))}
    </div>
  );
}
