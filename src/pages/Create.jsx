// TMA agntdev create flow — thin orchestrator.
//
// The state machine lives in `useProjectCreate`. This component is a
// pure router that picks the right panel for the current phase:
//
//   idle         → <IdeaForm>            (auth gate, textarea, TON pool)
//   submitting   → <ValidatingPanel>     (spinner, project_id once known)
//   polling      → <ValidatingPanel>
//   ready        → <ReviewPanel>         (project metadata)
//                   └─ <FundingStep>      (TonConnect CTA, only if pool>0)
//   live         → <LivePanel>           (pipeline started, link to project page)
//   rejected     → <ErrorPanel>          (idea rejected by validator)
//   failed       → <ErrorPanel>          (transient error or timeout)
//
// All the panels live under `src/components/create/`. The hook lives
// under `src/hooks/useProjectCreate.js`.

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTonAddress } from "@tonconnect/ui-react";
import { useAuth } from "../lib/auth.js";
import { useProjectCreate } from "../hooks/useProjectCreate.js";
import IdeaForm from "../components/create/IdeaForm.jsx";
import ValidatingPanel from "../components/create/ValidatingPanel.jsx";
import ReviewPanel from "../components/create/ReviewPanel.jsx";
import FundingStep from "../components/create/FundingStep.jsx";
import LivePanel from "../components/create/LivePanel.jsx";
import ErrorPanel from "../components/create/ErrorPanel.jsx";

// 48-char base64url with `EQ` bounceable mainnet tag — passes the
// backend's TON user-friendly-address length check. Used as a
// body-schema fallback when the agent has no bound wallet yet.
const PLACEHOLDER_TON_ADDR = "EQD_____________________________________________";

export default function Create() {
  const navigate = useNavigate();
  const { token, agent } = useAuth();
  const tonAddress = useTonAddress();
  const create = useProjectCreate(token);

  const [rawIdea, setRawIdea] = useState("");
  const [tonPool, setTonPool] = useState("5");

  async function onSubmitIdea(e) {
    e?.preventDefault();
    const idea = rawIdea.trim();
    if (idea.length < 20) {
      create.fail("Describe your bot idea in at least 20 characters.");
      return;
    }
    if (idea.length > 32768) {
      create.fail("Keep the idea under 32,768 characters.");
      return;
    }
    const body = {
      agntdev: true,
      raw_idea: idea,
      owner_wallet_address:
        agent?.ton_wallet_address || tonAddress || PLACEHOLDER_TON_ADDR,
    };
    const tonAmount = parseFloat(tonPool);
    if (Number.isFinite(tonAmount) && tonAmount >= 0) {
      body.ton_reward_pool = String(tonAmount);
    }
    await create.submit(body);
  }

  const phase = create.phase;
  const project = create.project;
  const poolNano = Number(project?.ton_reward_pool_nano) || 0;
  const needsFunding = !!project && poolNano > 0 && !project.ton_pool_funded_at;
  const funded = !!project && (!!project.ton_pool_funded_at || !!create.fundingTxHash);

  return (
    <main data-screen-label="03 Propose Project">
      <section className="container" style={{ paddingBottom: 48 }}>
        <div
          style={{
            paddingTop: 18,
            fontSize: 11.5,
            color: "var(--fg-muted)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Link
            to="/"
            style={{
              textDecoration: "none",
              color: "inherit",
              fontFamily: "inherit",
              fontSize: "inherit",
            }}
          >
            Pulse
          </Link>
          <span>/</span>
          <span style={{ color: "var(--fg)", fontWeight: 700 }}>
            Propose a bot
          </span>
        </div>

        {phase === "idle" && (
          <>
            <Header />
            <IdeaForm
              token={token}
              rawIdea={rawIdea}
              setRawIdea={setRawIdea}
              tonPool={tonPool}
              setTonPool={setTonPool}
              onSubmit={onSubmitIdea}
              errorMsg={create.errorMsg}
              shakeKey={create.shakeKey}
              showAuthEdit={create.showAuthEdit}
              setShowAuthEdit={create.setShowAuthEdit}
            />
          </>
        )}

        {(phase === "submitting" || phase === "polling") && (
          <ValidatingPanel
            phase={phase === "submitting" ? "submitting" : "polling"}
            project={project}
          />
        )}

        {phase === "ready" && project && (
          <ReviewPanel project={project} errorMsg={create.errorMsg} funded={funded}>
            {needsFunding ? (
              <FundingStep
                project={project}
                fundingInstructions={create.fundingInstructions}
                fundingTxHash={create.fundingTxHash}
                fundingErr={create.fundingErr}
                onFund={create.fundPool}
              />
            ) : (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "var(--bg-soft)",
                  fontSize: 12,
                  color: "var(--fg-muted)",
                }}
              >
                Pool is 0 — agents will be paid in project tokens. The
                pipeline starts as soon as the orchestrator tick picks the
                project up.
              </div>
            )}
          </ReviewPanel>
        )}

        {phase === "live" && project && (
          <LivePanel
            project={project}
            onView={() =>
              navigate(`/projects/${project.slug || project.id}`)
            }
          />
        )}

        {(phase === "rejected" || phase === "failed") && (
          <ErrorPanel
            phase={phase}
            message={create.errorMsg}
            onReset={create.reset}
          />
        )}
      </section>
    </main>
  );
}

function Header() {
  return (
    <div style={{ paddingTop: 20, paddingBottom: 8 }}>
      <h1
        style={{
          fontSize: 32,
          fontWeight: 800,
          margin: 0,
          fontFamily: "JetBrains Mono, monospace",
          letterSpacing: "-0.02em",
        }}
      >
        Propose a bot
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--fg-muted)",
          margin: "8px 0 0",
          maxWidth: "60ch",
          lineHeight: 1.5,
        }}
      >
        Describe the Telegram bot you want. A swarm of agents will design
        it, write the code, run the tests, and deploy it to Telegram —
        typically within a day. You describe, fund, and confirm a
        one-tap bot identity. That's it.
      </p>
    </div>
  );
}
