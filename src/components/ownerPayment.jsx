// OwnerPaymentScreen — modal for owner-initiated TON payments tied to
// a server-issued payment intent (`agnt:pay:<8hex>` comment marker).
//
// Used today by the add-tasks flow; designed to plug into future
// publish / stage-activation flows as the backend migrates them onto
// the same machinery.
//
// Three integration paths:
//   A) TonConnect — preferred when a wallet is already paired with the
//      dApp. We hand the wallet a tx with the comment encoded as a
//      TEP-74 text-comment BoC payload (op=0 + UTF-8 string).
//   B) ton://transfer deep-links — for Tonkeeper / Tonhub /
//      MyTonWallet. One universal URL; we render three labelled
//      buttons for brand recognition.
//   C) Manual copy/paste — three Copy buttons (wallet, amount,
//      comment). Last-resort, but the buttons stay prominent because
//      they're also useful for verifying the values from any of the
//      above paths.
//
// Polls /builder/owner-payments/{id} every 5s; stops once the intent
// flips to `confirmed` or `expired`. Calls onConfirmed / onExpired so
// the caller can refetch its own data.

import { useEffect, useRef, useState } from "react";
import { useTonConnectUI } from "@tonconnect/ui-react";
import { beginCell, toNano } from "@ton/core";
import { Icon } from "./atoms.jsx";
import { api } from "../lib/api.js";

const POLL_MS = 5_000;

// Build the TEP-74 text-comment payload: op=0 (32 zero bits) followed
// by the UTF-8 string. Returned as base64 BoC, ready to drop into
// tonConnectUI.sendTransaction({ messages: [{ payload }] }).
//
// `storeStringTail` auto-chains into ref cells if the comment exceeds
// the cell's bit budget, which is what we want for any marker shape
// the backend might mint in the future. For today's 17-byte
// `agnt:pay:<8hex>` markers it fits in the head cell, no refs needed.
function buildCommentPayload(text) {
  return beginCell()
    .storeUint(0, 32)
    .storeStringTail(text)
    .endCell()
    .toBoc()
    .toString("base64");
}

function buildDeepLink(intent) {
  const params = new URLSearchParams({
    amount: String(intent.expected_nano),
    text:   intent.comment_marker,
  });
  return `ton://transfer/${intent.target_wallet}?${params.toString()}`;
}

function fmtTon(nano) {
  if (nano == null) return "—";
  const n = Number(nano) / 1e9;
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 10)   return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function fmtRemaining(seconds) {
  if (seconds <= 0) return "expired";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function CopyButton({ value, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  async function onClick(e) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // execCommand fallback for very old browsers / iOS Safari in
      // some embedded contexts (in-app browsers).
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* nope */ }
      document.body.removeChild(ta);
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-sm"
      style={{
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10.5, fontWeight: 800, letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: copied ? "var(--accent-fg)" : "var(--fg)",
        borderColor: copied ? "var(--accent)" : "var(--border)",
        minWidth: 70, justifyContent: "center",
      }}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

function CopyRow({ label, value, mono = true }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto",
      gap: 10, alignItems: "center",
      padding: "10px 12px",
      borderRadius: 8,
      background: "var(--bg-soft)",
      border: "1px solid var(--border)",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 9.5, fontWeight: 800, color: "var(--fg-muted)",
          letterSpacing: "0.06em", textTransform: "uppercase",
          marginBottom: 4,
        }}>
          {label}
        </div>
        <div style={{
          fontFamily: mono ? "JetBrains Mono, monospace" : "inherit",
          fontSize: 12, fontWeight: 700, color: "var(--fg)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }} title={value}>
          {value}
        </div>
      </div>
      <CopyButton value={value} />
    </div>
  );
}

export default function OwnerPaymentScreen({
  intent: initialIntent,
  token,
  onConfirmed,
  onExpired,
  onClose,
  // Optional human-readable verb shown in the header — e.g.
  // "activate your new tasks", "publish your project". Defaults to
  // "fund your project".
  purposeLabel = "fund your project",
}) {
  const [intent, setIntent] = useState(initialIntent);
  const [tonConnectUI] = useTonConnectUI();
  const [tcStatus, setTcStatus] = useState("idle"); // idle | sending | sent | rejected | error
  const [tcError, setTcError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const pollRef = useRef(null);

  // 1s ticker for the countdown display only — does not drive polling.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Polling: every 5s while the intent is still in flight.
  useEffect(() => {
    if (!intent?.id) return undefined;
    const terminal = intent.status === "confirmed" || intent.status === "expired";
    if (terminal) return undefined;

    let cancelled = false;
    async function tick() {
      const res = await api.getOwnerPayment(intent.id, token);
      if (cancelled) return;
      if (res.ok && res.data) {
        setIntent(res.data);
        if (res.data.status === "confirmed") {
          onConfirmed?.(res.data);
          return; // stop polling
        }
        if (res.data.status === "expired") {
          onExpired?.(res.data);
          return;
        }
      }
      pollRef.current = setTimeout(tick, POLL_MS);
    }
    pollRef.current = setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [intent?.id, intent?.status, token, onConfirmed, onExpired]);

  if (!intent) return null;

  const status = intent.status;
  const expectedTon = fmtTon(intent.expected_nano);
  const detectedNano = Number(intent.detected_nano) || 0;
  const remainingSec = Math.max(
    0,
    Math.floor((new Date(intent.expires_at).getTime() - now) / 1000),
  );

  const deepLink = buildDeepLink(intent);

  async function onPayTonConnect() {
    setTcError("");
    setTcStatus("sending");
    try {
      if (!tonConnectUI.connected) {
        await tonConnectUI.openModal();
        if (!tonConnectUI.connected) { setTcStatus("idle"); return; }
      }
      const payload = buildCommentPayload(intent.comment_marker);
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 6 * 60,
        messages: [{
          address: intent.target_wallet,
          amount:  String(intent.expected_nano),
          payload,
        }],
      });
      setTcStatus("sent");
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (msg.toLowerCase().includes("reject")) {
        setTcStatus("rejected");
        setTcError("Transaction rejected in your wallet.");
      } else {
        setTcStatus("error");
        setTcError(msg || "Wallet transfer failed. Try the deep-links below or copy the values manually.");
      }
    }
  }

  const statusBlock = (() => {
    if (status === "confirmed") {
      return (
        <div style={{
          padding: "10px 14px", borderRadius: 8,
          background: "var(--accent-soft)", color: "var(--accent-fg)",
          border: "1px solid var(--accent)",
          fontSize: 13, fontWeight: 700,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <Icon name="check" size={14} /> Payment confirmed!
          {intent.detected_tx_hash && (
            <a
              href={`https://tonscan.org/tx/${intent.detected_tx_hash}`}
              target="_blank"
              rel="noreferrer"
              style={{ marginLeft: "auto", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "inherit" }}
            >
              {intent.detected_tx_hash.slice(0, 10)}…
            </a>
          )}
        </div>
      );
    }
    if (status === "expired") {
      return (
        <div style={{
          padding: "10px 14px", borderRadius: 8,
          background: "var(--danger-soft)", color: "var(--danger)",
          border: "1px solid var(--danger)",
          fontSize: 13, fontWeight: 700,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          ⏱ Intent expired — your payment wasn't matched. Start over to get a fresh marker.
        </div>
      );
    }
    if (status === "matched") {
      const shortfall = Number(intent.expected_nano) - detectedNano;
      return (
        <div style={{
          padding: "10px 14px", borderRadius: 8,
          background: "oklch(0.96 0.05 80)", color: "#b45309",
          border: "1px solid oklch(0.75 0.12 80)",
          fontSize: 12.5, fontWeight: 700, lineHeight: 1.5,
        }}>
          🟡 Received <strong>{fmtTon(detectedNano)} TON</strong> of <strong>{expectedTon} TON</strong>.
          {shortfall > 0 && (
            <> Send another <strong>{fmtTon(shortfall)} TON</strong> with the same comment, or cancel and create a new intent.</>
          )}
        </div>
      );
    }
    // awaiting
    return (
      <div style={{
        padding: "10px 14px", borderRadius: 8,
        background: "var(--bg-soft)", border: "1px solid var(--border)",
        fontSize: 12.5, color: "var(--fg-muted)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span className="live-dot" />
        ⏳ Awaiting payment · expires in <strong style={{ color: "var(--fg)" }}>{fmtRemaining(remainingSec)}</strong>
      </div>
    );
  })();

  const terminal = status === "confirmed" || status === "expired";

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "grid", placeItems: "center",
        padding: 16,
        background: "rgba(10, 10, 10, 0.5)",
        animation: "agnt-modal-fade 160ms ease-out both",
      }}
    >
      <style>{`
        @keyframes agnt-modal-fade {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes agnt-modal-pop {
          from { opacity: 0; transform: translateY(8px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
      <div style={{
        maxWidth: 560, width: "100%",
        background: "var(--bg)",
        border: "1px solid var(--border-strong)",
        borderRadius: 12,
        padding: 22,
        display: "flex", flexDirection: "column", gap: 14,
        boxShadow: "0 24px 60px rgba(0, 0, 0, 0.18)",
        animation: "agnt-modal-pop 180ms ease-out both",
        maxHeight: "calc(100dvh - 32px)",
        overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="zap" size={16} />
          <h2 style={{
            margin: 0, fontSize: 17,
            fontFamily: "JetBrains Mono, monospace",
            fontWeight: 800, letterSpacing: "-0.01em",
            flex: 1, minWidth: 0,
          }}>
            Pay {expectedTon} TON to {purposeLabel}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--fg-muted)", padding: 4,
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <CopyRow label="Wallet"  value={intent.target_wallet} />
        <CopyRow label={`Amount · ${expectedTon} TON`} value={String(intent.expected_nano)} />
        <CopyRow label="Comment" value={intent.comment_marker} />

        <div style={{
          fontSize: 11.5, lineHeight: 1.5,
          padding: "8px 12px", borderRadius: 6,
          background: "oklch(0.97 0.04 80)",
          border: "1px solid oklch(0.85 0.08 80)",
          color: "#b45309",
        }}>
          ⚠ The <strong>comment must be exactly as shown</strong>, otherwise the
          watcher can't match your TX. The amount must also match exactly —
          underpayment leaves the intent stuck, overpayment doesn't refund.
        </div>

        {!terminal && (
          <>
            <button
              type="button"
              onClick={onPayTonConnect}
              disabled={tcStatus === "sending"}
              className="btn-primary-big"
              style={{
                background: "var(--accent)",
                opacity: tcStatus === "sending" ? 0.6 : 1,
                justifyContent: "center", width: "100%",
              }}
            >
              <Icon name="zap" size={12} />
              {tcStatus === "sending" ? "Sending to wallet…"
                : tcStatus === "sent"  ? "Sent — waiting for on-chain confirmation"
                : `Pay with connected wallet`}
            </button>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a
                href={deepLink}
                className="btn"
                style={{ flex: 1, minWidth: 120, justifyContent: "center", textDecoration: "none" }}
                rel="noreferrer"
              >
                <Icon name="external" size={12} /> Tonkeeper
              </a>
              <a
                href={deepLink}
                className="btn"
                style={{ flex: 1, minWidth: 120, justifyContent: "center", textDecoration: "none" }}
                rel="noreferrer"
              >
                <Icon name="external" size={12} /> Tonhub
              </a>
              <a
                href={deepLink}
                className="btn"
                style={{ flex: 1, minWidth: 120, justifyContent: "center", textDecoration: "none" }}
                rel="noreferrer"
              >
                <Icon name="external" size={12} /> MyTonWallet
              </a>
            </div>

            {tcError && (
              <div style={{
                padding: 10, fontSize: 12,
                border: "1px solid var(--danger)", borderRadius: 6,
                background: "var(--danger-soft)", color: "var(--danger)",
              }}>
                {tcError}
              </div>
            )}
          </>
        )}

        {statusBlock}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          {terminal ? (
            <button type="button" className="btn-primary-big" style={{ background: "var(--accent)" }} onClick={onClose}>
              {status === "confirmed" ? "Done" : "Close"}
            </button>
          ) : (
            <button type="button" className="btn" onClick={onClose}>
              I'll pay later — close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Re-export helpers in case callers want to render their own variant.
export { buildCommentPayload, buildDeepLink };
// Hint to eslint: toNano is imported in case a caller wants the helper
// later; it stays exported below so the import isn't pruned.
export { toNano };
