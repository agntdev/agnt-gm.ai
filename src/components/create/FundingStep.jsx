// Funding CTA. Shown inside the ReviewPanel when the project has a
// non-zero pool and isn't funded yet. Owns its own TonConnect wiring
// (the orchestrator just hands over `onFund` which delegates to
// useProjectCreate's `fundPool({ tonConnectUI })`).
//
// Three states: `canFund` (has instructions, ready to pay), `funded`
// (already paid, polling for live), `unconfigured` (no destination
// configured on the server, fall back to admin path).

import { useTonConnectUI } from "@tonconnect/ui-react";
import { Icon } from "../atoms.jsx";

export default function FundingStep({
  project,
  fundingInstructions,
  fundingTxHash,
  fundingErr,
  onFund,
}) {
  const [tonConnectUI] = useTonConnectUI();
  const poolNano = Number(project?.ton_reward_pool_nano) || 0;
  const needsFunding = poolNano > 0 && !project?.ton_pool_funded_at;
  const funded = !!project?.ton_pool_funded_at || !!fundingTxHash;
  const poolTon = (poolNano / 1e9).toLocaleString(undefined, {
    maximumFractionDigits: 3,
  });
  const canFundFromUI =
    needsFunding && !!fundingInstructions?.address && !funded;

  if (!needsFunding) return null;

  const borderColor = funded
    ? "var(--accent)"
    : canFundFromUI
      ? "var(--border-strong)"
      : "var(--danger)";
  const background = funded
    ? "var(--accent-soft)"
    : canFundFromUI
      ? "var(--bg-soft)"
      : "var(--danger-soft)";

  return (
    <div
      style={{
        marginTop: 14,
        padding: 16,
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        background,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <Icon name="zap" size={14} />
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          {funded ? "Pool funded — pipeline running" : "Fund the pool to start"}
        </h3>
      </div>
      {funded ? (
        <div style={{ fontSize: 12, color: "var(--fg)" }}>
          {poolTon} TON committed. The pipeline is running — design, details,
          code, tests and deploy will follow. You'll land on the project
          page in a moment.
          {fundingTxHash && fundingTxHash !== "submitted" && (
            <div
              style={{
                marginTop: 6,
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10.5,
                color: "var(--fg-muted)",
                wordBreak: "break-all",
              }}
            >
              tx: {fundingTxHash}
            </div>
          )}
        </div>
      ) : canFundFromUI ? (
        <>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--fg)",
              lineHeight: 1.5,
              marginBottom: 12,
            }}
          >
            Send <strong>{poolTon} TON</strong> from your wallet. The
            pipeline starts automatically the moment the deposit confirms
            on-chain — design, code, tests and deploy run with no further
            action on your side.
          </div>
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10.5,
              color: "var(--fg-muted)",
              marginBottom: 12,
              wordBreak: "break-all",
            }}
          >
            to:{" "}
            <span style={{ color: "var(--fg)" }}>
              {fundingInstructions.address}
            </span>
            {fundingInstructions.comment && (
              <div style={{ marginTop: 2 }}>
                comment:{" "}
                <span style={{ color: "var(--fg)" }}>
                  {fundingInstructions.comment}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn-primary-big"
            style={{ background: "var(--accent)" }}
            onClick={() => onFund({ tonConnectUI })}
          >
            <Icon name="zap" size={12} /> Start pipeline ({poolTon} TON)
          </button>
          {fundingErr && (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                border: "1px solid var(--danger)",
                borderRadius: 6,
                background: "var(--danger-soft)",
                color: "var(--danger)",
                fontSize: 12,
              }}
            >
              {fundingErr}
            </div>
          )}
          {fundingTxHash === "submitted" && (
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "var(--fg-muted)",
              }}
            >
              Transaction submitted to your wallet. Waiting for on-chain
              confirmation…
            </div>
          )}
        </>
      ) : (
        <div
          style={{
            fontSize: 12.5,
            color: "var(--danger)",
            lineHeight: 1.5,
          }}
        >
          {poolTon} TON committed but no funding destination is configured
          for this deployment (set <code>VITE_TON_PLATFORM_WALLET</code> to
          match the API's
          <code> PLATFORM_TON_WALLET_ADDRESS</code>), or the API hasn't
          returned funding instructions yet. Refresh and resubmit, or
          contact an admin to confirm the deposit (admin endpoint also
          auto-starts the pipeline).
        </div>
      )}
    </div>
  );
}
