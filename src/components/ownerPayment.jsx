// OwnerPaymentScreen — modal for owner-initiated TON payments tied to
// a server-issued payment intent (`agnt:pay:<8hex>` comment marker).
//
// Used today by the add-tasks flow; designed to plug into future
// publish / stage-activation flows as the backend migrates them onto
// the same machinery.
//
// Three integration paths:
//   A) TonConnect — preferred when a wallet is already paired with the
//      dApp. We build the comment as a TEP-74 text-comment BoC payload
//      (op=0 + UTF-8 string) with our own minimal serializer below,
//      then ship it via tonConnectUI.sendTransaction's `payload` field.
//   B) ton://transfer deep-links — for Tonkeeper / Tonhub /
//      MyTonWallet. One universal URL with `?text=` carrying the
//      comment marker; we render three labelled buttons for brand
//      recognition. Wallet apps decode the text into a TEP-74
//      comment payload internally.
//   C) Manual copy/paste — three Copy buttons (wallet, amount,
//      comment). Last-resort, but stays prominent because the values
//      are also useful for verifying what (A) / (B) sent.
//
// Why a hand-rolled BoC serializer instead of `@ton/core`:
//   @ton/core references the Node-only `Buffer` global at module-eval
//   time. Browsers don't ship `Buffer` → ReferenceError on import →
//   white-screen. Pulling in a `buffer` polyfill works but adds ~10KB
//   for one helper we use exactly once. Our marker is always 17 ASCII
//   bytes (`agnt:pay:<8hex>`) which fits cleanly in a single cell —
//   ~30 lines of code does the job without the library or polyfill.
//
// Polls /builder/owner-payments/{id} every 5s; stops once the intent
// flips to `confirmed` or `expired`. Calls onConfirmed / onExpired so
// the caller can refetch its own data.

import { useEffect, useRef, useState } from "react";
import { useTonConnectUI } from "@tonconnect/ui-react";
import { Icon } from "./atoms.jsx";
import { api } from "../lib/api.js";

const POLL_MS = 5_000;

// Max bytes of UTF-8 text that fit into a single 1023-bit cell after
// reserving 32 bits for the op-code. (1023 - 32) / 8 = 123.875 → 123.
// Our `agnt:pay:<8hex>` markers are 17 bytes, so this is never hit
// in practice — guard kept for future marker shapes.
const MAX_INLINE_COMMENT_BYTES = 123;

// CRC32C lookup table (Castagnoli polynomial, reversed bit order =
// 0x82f63b78). Used at the end of the BoC envelope per the TVM spec.
// Built once on module load.
const CRC32C_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? ((c >>> 1) ^ 0x82f63b78) : (c >>> 1);
    }
    t[i] = c;
  }
  return t;
})();

function crc32c(bytes) {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32C_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (~c) >>> 0;
}

/**
 * Encode `text` as a TEP-74 text-comment BoC payload, ready to drop
 * into `tonConnectUI.sendTransaction({ messages: [{ payload }] })`.
 *
 * Layout:
 *   cell = [4 bytes op-code = 0x00000000] [N bytes UTF-8 of text]
 *   BoC  = magic + header (with has_crc32c) + 1 cell + CRC32C tail
 *
 * Output is byte-for-byte identical to
 *   `beginCell().storeUint(0,32).storeStringTail(text).endCell().toBoc().toString("base64")`
 * from `@ton/core`. Verified examples:
 *   buildCommentPayload("test")
 *     = "te6cckEBAQEACgAAEAAAAAB0ZXN0cbBecQ=="
 *   buildCommentPayload("agnt:pay:a1b2c3d4")
 *     = "te6cckEBAQEAFwAAKgAAAABhZ250OnBheTphMWIyYzNkNF8srTc="
 */
function buildCommentPayload(text) {
  const textBytes = new TextEncoder().encode(text);
  if (textBytes.length > MAX_INLINE_COMMENT_BYTES) {
    throw new Error(
      `comment too long for a single-cell payload: ${textBytes.length} bytes ` +
      `(max ${MAX_INLINE_COMMENT_BYTES}). The current backend marker shape ` +
      `is well under this — if you're seeing this, the marker format changed.`
    );
  }

  // 1. Cell body: 4 zero bytes (op = text-comment) + UTF-8.
  //    Bit-aligned, so no completion tag.
  const cellData = new Uint8Array(4 + textBytes.length);
  cellData.set(textBytes, 4);

  // 2. Cell descriptors (TVM "raw" cell format):
  //      d1 = (refs & 7) + 8*is_exotic + 32*level   → 0 (no refs)
  //      d2 = floor(bits/8)*2 + (bits % 8 == 0 ? 0 : 1)
  //           For full-byte content: d2 = bytes * 2.
  const cellBytes = new Uint8Array(2 + cellData.length);
  cellBytes[0] = 0;
  cellBytes[1] = cellData.length * 2;
  cellBytes.set(cellData, 2);

  // 3. BoC envelope:
  //      magic     = b5ee9c72
  //      header    = 0b01000001 → has_idx=0, has_crc=1, has_cache=0,
  //                                flags=0, size_bytes=1
  //      off_bytes = 1
  //      cells / roots / absent counts (1 byte each because size=1)
  //      tot_cells_size = cellBytes.length (1 byte, off_bytes=1)
  //      root_list      = single byte index 0
  //      cell_data      = our 2+N bytes
  //      crc32c         = CRC of everything above, little-endian
  const totSize = cellBytes.length;
  const boc = new Uint8Array(4 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + cellBytes.length + 4);
  let i = 0;
  boc[i++] = 0xb5; boc[i++] = 0xee; boc[i++] = 0x9c; boc[i++] = 0x72;
  boc[i++] = 0x41;        // header (has_crc32c=1, size_bytes=1)
  boc[i++] = 0x01;        // off_bytes
  boc[i++] = 0x01;        // cells_count
  boc[i++] = 0x01;        // roots_count
  boc[i++] = 0x00;        // absent_count
  boc[i++] = totSize;     // tot_cells_size
  boc[i++] = 0x00;        // root index 0
  boc.set(cellBytes, i);
  i += cellBytes.length;
  const crc = crc32c(boc.subarray(0, i));
  boc[i++] = crc & 0xff;
  boc[i++] = (crc >>> 8) & 0xff;
  boc[i++] = (crc >>> 16) & 0xff;
  boc[i++] = (crc >>> 24) & 0xff;

  // 4. Base64. Chunked to dodge the apply-spread argument-count limit
  //    on very long inputs (not an issue for ~30-byte BoCs today, but
  //    cheap to keep for future longer markers).
  let s = "";
  for (let k = 0; k < boc.length; k += 0x8000) {
    s += String.fromCharCode.apply(null, boc.subarray(k, k + 0x8000));
  }
  return btoa(s);
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

// Re-export helpers in case callers want to render their own pay-button
// variant (e.g. a QR code, or a custom TonConnect-styled CTA).
export { buildCommentPayload, buildDeepLink };
