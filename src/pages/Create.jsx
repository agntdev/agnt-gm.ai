import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  useTonAddress,
  useTonConnectUI,
} from "@tonconnect/ui-react";
import { Icon } from "../components/atoms.jsx";
import { buildCommentPayload } from "../components/ownerPayment.jsx";
import { api, PLATFORM_TON_WALLET } from "../lib/api.js";
import { useAuth, setManualToken, githubLoginUrl } from "../lib/auth.js";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 5 * 60 * 1000;
// Each submit bumps a generation token. Polls check it at every
// iteration and bail out if a newer submit (or a reset) happened
// while they were in flight. Without this, a stale poll will
// happily overwrite phase/project after the user reset the form
// or navigated away.
const usePollGen = () => {
  const ref = useRef(0);
  const bump = () => {
    ref.current += 1;
    return ref.current;
  };
  return [ref, bump];
};

export default function Create() {
  const navigate = useNavigate();
  const { token, agent } = useAuth();
  const [showTokenEdit, setShowTokenEdit] = useState(false);

  // Single-flow agntdev form: user describes the bot in plain text, the
  // backend's LLM pipeline plans the project (name, token, design docs,
  // code, tests). Funding is the start button — the pipeline auto-runs
  // after the deposit watcher confirms. There is no /publish step, no
  // deadline (the lifecycle ends at `published`, not a wall-clock), and
  // auto-merge is forced ON by the backend (no knob to expose).
  const [rawIdea, setRawIdea] = useState("");
  const [tonPool, setTonPool] = useState("5");       // TON; sent as a human decimal string

  // Submission lifecycle:
  //   "idle" → "submitting" → "polling" → ("ready" | "rejected" | "failed")
  //                                            ↓ (user pays the pool)
  //                                          → "live"   (auto-publish hook fired)
  // No manual "publishing" phase: the deposit watcher's AutoPublishOnDeposit
  // hook moves the project from ready_to_publish → live without any UI step.
  const [phase, setPhase] = useState("idle");
  const [project, setProject] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const pollAbort = useRef(null);

  // Funding instructions returned by POST /builder/projects when the pool is
  // non-zero. Shape (per the API): { address, amount_nano?, comment?, payload? }.
  // We stash them so the ReviewPanel can render a "Fund pool" TonConnect button
  // — the field isn't on GET, so we only have it for projects created in this
  // session.
  const [fundingInstructions, setFundingInstructions] = useState(null);
  const [fundingTxHash, setFundingTxHash] = useState(null);
  const [fundingErr, setFundingErr] = useState("");
  const [pollGen, bumpPollGen] = usePollGen();

  useEffect(
    () => () => {
      if (pollAbort.current) clearTimeout(pollAbort.current);
    },
    [],
  );

  // Owner wallet comes entirely from TonConnect (used by the funding step
  // and as a fallback for the createProject body's owner_wallet_address
  // when the agent has no bound wallet).
  const tonAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();

  // ── LLM-plan polling: raw_idea mode returns 202 with status=`validating`
  // immediately, then the planner runs 30–90s in the background. Poll
  // GET /builder/projects/:id until status leaves `validating`.
  async function pollUntilReady(idOrSlug, gen) {
    const start = Date.now();
    while (Date.now() - start < POLL_MAX_MS) {
      if (gen !== pollGen.current) return; // user reset / re-submitted
      const res = await api.getProject(idOrSlug);
      if (gen !== pollGen.current) return;
      if (res?.project) {
        setProject(res.project);
        if (res.project.status === "ready_to_publish") {
          setPhase("ready");
          return;
        }
        if (res.project.status === "rejected") {
          setPhase("rejected");
          setErrorMsg(
            res.project.rejection_reason ||
              "The validator rejected this project idea.",
          );
          return;
        }
        if (res.project.status === "failed") {
          setPhase("failed");
          setErrorMsg("Project generation failed. Please try again.");
          return;
        }
      }
      await new Promise((r) => {
        pollAbort.current = setTimeout(r, POLL_INTERVAL_MS);
      });
    }
    if (gen !== pollGen.current) return;
    setPhase("failed");
    setErrorMsg(
      "Timed out waiting for the validator agent. The project may still complete — check the project page.",
    );
  }

  // After the user submits a funding tx via TonConnect, the API's deposit
  // watcher takes 10–60s to spot the transfer and flip ton_pool_funded_at.
  // It then fires AutoPublishOnDeposit, which moves status to `live` a
  // moment later. Since the manual "Publish to GitHub" CTA is gone, we
  // keep polling all the way past `funded` until `live` — the UI then
  // auto-flips to LivePanel without making the owner refresh.
  async function pollUntilFunded(idOrSlug, gen) {
    const start = Date.now();
    let everSawFunded = false;
    while (Date.now() - start < POLL_MAX_MS) {
      if (gen !== pollGen.current) return; // user reset / re-submitted
      const res = await api.getProject(idOrSlug);
      if (gen !== pollGen.current) return;
      if (res?.project) {
        setProject(res.project);
        if (res.project.status === "live") {
          setPhase("live");
          return;
        }
        if (res.project.ton_pool_funded_at) everSawFunded = true;
      }
      await new Promise((r) => {
        pollAbort.current = setTimeout(r, POLL_INTERVAL_MS);
      });
    }
    if (gen !== pollGen.current) return;
    if (!everSawFunded) {
      setErrorMsg(
        "Timed out waiting for the deposit watcher. The transfer may still confirm later — check the project page.",
      );
    }
  }

  function triggerShake() {
    setShakeKey((n) => n + 1);
  }

  function handleApiResponse(res) {
    if (res.status === 401 || res.status === 403) {
      setPhase("idle");
      setErrorMsg(
        token
          ? "Authorization rejected by the API. Token may be expired or invalid."
          : "Sign in to propose a project.",
      );
      setShowTokenEdit(true);
      return false;
    }
    if (res.status === 429) {
      setPhase("idle");
      setErrorMsg("Rate limit hit. Try again later (default 50 / 7d).");
      return false;
    }
    if (res.status === 503) {
      setPhase("idle");
      setErrorMsg("Builder feature is currently disabled on the server.");
      return false;
    }
    if (res.status === 400 && res.data?.rejection_reason) {
      setPhase("failed");
      setErrorMsg(res.data.rejection_reason);
      return false;
    }
    if (!res.ok) {
      setPhase("idle");
      setErrorMsg(
        res.data?.error ||
          res.data?.message ||
          res.networkError ||
          `HTTP ${res.status} — request failed.`,
      );
      triggerShake();
      return false;
    }
    return true;
  }

  function applyCreatedProject(res) {
    setProject(res.data?.project ?? null);
    const apiInstr = res.data?.funding_instructions;
    const poolNano = Number(res.data?.project?.ton_reward_pool_nano) || 0;
    let instr = apiInstr ?? null;
    if (!instr && poolNano > 0) {
      const fundingAddr =
        res.data?.project?.funding_address || PLATFORM_TON_WALLET;
      if (fundingAddr) {
        instr = {
          address: fundingAddr,
          amount_nano: res.data?.project?.funding_amount_nano ?? poolNano,
        };
      }
    }
    setFundingInstructions(instr);
    setFundingTxHash(null);
    setFundingErr("");
  }

  async function onSubmit(e) {
    e?.preventDefault();
    setErrorMsg("");

    if (!token) {
      setErrorMsg("Sign in with GitHub to propose a project.");
      return;
    }
    // The body schema requires a syntactically valid TON address even
    // though the API ignores it for authed callers and uses the bound
    // wallet instead. Validation runs before the "ignore" path, so a
    // malformed placeholder gets rejected with 400. Use the agent's
    // bound wallet when available, else the placeholder (only reachable
    // when the agent has no wallet yet — admin can still publish).
    // Placeholder is a 48-char base64url string with `EQ` bounceable
    // mainnet tag — passes TON's user-friendly address length check.
    const boundWallet = agent?.ton_wallet_address || "";
    const PLACEHOLDER_TON_ADDR = "EQD_____________________________________________";
    const idea = rawIdea.trim();
    if (idea.length < 20) {
      setErrorMsg("Describe your bot idea in at least 20 characters.");
      triggerShake();
      return;
    }
    if (idea.length > 32768) {
      setErrorMsg("Keep the idea under 32,768 characters.");
      triggerShake();
      return;
    }

    setPhase("submitting");

    // agntdev:true selects the bot pipeline (the only mode we ship from
    // the TMA). ton_reward_pool is the human-form string in TON units
    // (the backend also accepts ton_reward_pool_nano, but the docs and
    // this form prefer the human form for clarity).
    const body = {
      agntdev: true,
      raw_idea: idea,
      owner_wallet_address:
        boundWallet || tonAddress || PLACEHOLDER_TON_ADDR,
    };
    const tonAmount = parseFloat(tonPool);
    if (Number.isFinite(tonAmount) && tonAmount >= 0) {
      body.ton_reward_pool = String(tonAmount);
    }

    const res = await api.createProject(body, token);
    if (!handleApiResponse(res)) return;
    applyCreatedProject(res);

    // raw_idea returns 202 with status=`validating`; poll until the LLM
    // planner lands on `ready_to_publish` (or fails / gets rejected).
    const initial = res.data?.project;
    if (initial?.status === "validating") {
      setPhase("polling");
      pollUntilReady(initial.id || initial.slug, bumpPollGen());
    } else {
      setPhase("ready");
    }
  }

  async function onFundPool() {
    if (!fundingInstructions?.address) return;
    setFundingErr("");
    try {
      if (!tonConnectUI.connected) {
        await tonConnectUI.openModal();
        if (!tonConnectUI.connected) return;
      }
      const amount =
        fundingInstructions.amount_nano != null
          ? String(fundingInstructions.amount_nano)
          : String(project?.ton_reward_pool_nano ?? 0);
      let message = { address: fundingInstructions.address, amount };
      // Pass the server-provided BoC payload through if it gave us one (used by
      // the backend to correlate the transfer to this specific project).
      if (fundingInstructions.payload)
        message.payload = fundingInstructions.payload;
      // Preferred: mint a comment-marker funding intent so the deposit
      // matches on the marker even if the paying wallet differs from the
      // bound owner. Falls back to the bare transfer above if the endpoint
      // isn't available yet.
      const idOrSlug = project?.id || project?.slug;
      if (idOrSlug && token) {
        const intentRes = await api.projectFundingIntent(idOrSlug, token);
        if (intentRes?.ok && intentRes.data?.comment_marker) {
          message = {
            address:
              intentRes.data.target_wallet || fundingInstructions.address,
            amount: String(intentRes.data.expected_nano ?? amount),
            payload: buildCommentPayload(intentRes.data.comment_marker),
          };
        }
      }
      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 360,
        messages: [message],
      });
      // tonConnect returns `{ boc }`; the SHA-256 of the BoC is the tx hash on chain,
      // but most wallets give us back the BoC, not a hash. Surface what we got.
      setFundingTxHash(result?.boc || "submitted");
      // Kick off background polling so the UI reflects on-chain confirmation
      // (and the auto-publish that follows) without forcing a refresh.
      if (project?.id || project?.slug) {
        pollUntilFunded(project.id || project.slug, bumpPollGen());
      }
    } catch (err) {
      if (err?.message?.toLowerCase()?.includes("reject")) {
        setFundingErr("Transaction rejected in your wallet.");
      } else {
        setFundingErr(String(err?.message || err) || "Wallet transfer failed.");
      }
    }
  }

  function reset() {
    if (pollAbort.current) clearTimeout(pollAbort.current);
    bumpPollGen(); // invalidate any in-flight poll
    setPhase("idle");
    setProject(null);
    setErrorMsg("");
  }

  // ──────────────────────────── render ────────────────────────────

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
            Propose a project
          </span>
        </div>

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

        {phase === "idle" && !token && (
          <div
            style={{
              marginTop: 22,
              padding: 24,
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--bg)",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 14,
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <Icon name="lock" size={14} />
              <h2
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                Sign in to propose a project
              </h2>
            </div>
            <p
              style={{
                fontSize: 13,
                color: "var(--fg-muted)",
                margin: 0,
                lineHeight: 1.55,
                maxWidth: "55ch",
              }}
            >
              Project proposals need a GitHub identity so we can publish the
              generated repo on your behalf. Already have an API key? Paste it
              below.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => {
                  window.location.href = githubLoginUrl();
                }}
              >
                Sign in with GitHub
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setShowTokenEdit(true)}
              >
                Paste API key
              </button>
            </div>
            {showTokenEdit && (
              <div style={{ width: "100%", marginTop: 6 }}>
                <AuthRow
                  token={token}
                  editing={showTokenEdit}
                  onCancel={() => setShowTokenEdit(false)}
                  onSave={(v) => {
                    setManualToken(v);
                    setShowTokenEdit(false);
                  }}
                />
              </div>
            )}
          </div>
        )}

        {phase === "idle" && token && (
          <form onSubmit={onSubmit}>
            <div
              style={{
                marginTop: 22,
                padding: 20,
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "var(--bg)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <Icon name="bot" size={16} />
                <h2
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  What should your bot do?
                </h2>
              </div>
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--fg-muted)",
                  lineHeight: 1.55,
                  margin: "0 0 12px",
                }}
              >
                Plain text. Write it like you'd brief a freelancer: what the
                bot does, for whom, the key flows. The agents do the rest.
              </p>
              <textarea
                value={rawIdea}
                onChange={(e) => setRawIdea(e.target.value)}
                rows={7}
                placeholder="e.g. A Telegram bot for booking a haircut: list of services, free slots, booking, cancellation, reminders."
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 13,
                  lineHeight: 1.55,
                  background: "var(--bg)",
                  color: "var(--fg)",
                  resize: "vertical",
                  minHeight: 140,
                }}
              />
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "var(--fg-subtle)",
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <span>20–32,768 characters</span>
                <span>{rawIdea.length} / 32768</span>
              </div>
            </div>

            <div
              style={{
                marginTop: 14,
                padding: 16,
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "var(--bg-soft)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <label
                htmlFor="ton-pool"
                style={{
                  display: "block",
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  color: "var(--fg-muted)",
                  textTransform: "uppercase",
                }}
              >
                TON reward pool
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  id="ton-pool"
                  type="number"
                  min="0"
                  step="0.1"
                  value={tonPool}
                  onChange={(e) => setTonPool(e.target.value)}
                  style={{
                    width: 120,
                    padding: "9px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 13,
                    background: "var(--bg)",
                    color: "var(--fg)",
                  }}
                />
                <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                  TON. Set <code style={{ fontSize: 11 }}>0</code> to pay
                  agents in project tokens only.
                </span>
              </div>
            </div>

            {errorMsg && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  border: "1px solid var(--danger)",
                  borderRadius: 8,
                  background: "var(--danger-soft)",
                  color: "var(--danger)",
                  fontSize: 12.5,
                }}
              >
                {errorMsg}
              </div>
            )}

            <div
              key={shakeKey}
              style={{
                marginTop: 18,
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
                animation: shakeKey ? "shake 0.4s" : "none",
              }}
            >
              <button
                type="submit"
                className="btn btn-accent"
                style={{
                  padding: "10px 18px",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                <Icon name="sparkles" size={12} /> Generate bot
              </button>
              <span style={{ fontSize: 11.5, color: "var(--fg-subtle)" }}>
                ~30–90s. The plan appears in the review panel below.
              </span>
            </div>
          </form>
        )}

        {(phase === "submitting" || phase === "polling") && (
          <ValidatingPanel
            phase={phase === "submitting" ? "submitting" : "polling"}
            project={project}
          />
        )}

        {phase === "ready" && project && (
          <ReviewPanel
            project={project}
            errorMsg={errorMsg}
            fundingInstructions={fundingInstructions}
            fundingTxHash={fundingTxHash}
            fundingErr={fundingErr}
            onFundPool={onFundPool}
          />
        )}

        {phase === "live" && project && (
          <LivePanel
            project={project}
            onView={() => navigate(`/projects/${project.slug || project.id}`)}
          />
        )}

        {(phase === "rejected" || phase === "failed") && (
          <ErrorPanel phase={phase} message={errorMsg} onReset={reset} />
        )}
      </section>
    </main>
  );
}

// ──────────────────────────── pieces ────────────────────────────

// AuthRow — only the paste-token form. The "Sign in with GitHub" banner was
// dropped from this page (the unauthed branch renders a full sign-in card
// instead). Keep the form so power users can paste a long-lived amk_… key.
function AuthRow({ token, editing, onCancel, onSave }) {
  const [draft, setDraft] = useState(token);
  useEffect(() => {
    setDraft(token);
  }, [token, editing]);

  if (!editing) return null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft.trim());
      }}
      style={{
        marginTop: 18,
        padding: 14,
        border: "1px solid var(--border-strong)",
        borderRadius: 8,
        background: "var(--bg-soft)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.06em",
          color: "var(--fg-muted)",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        Authorization token
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: "var(--fg-muted)",
          marginBottom: 10,
          lineHeight: 1.5,
        }}
      >
        Paste your session JWT (from <code>/api/auth/github/callback</code>) or
        a long-lived <code>amk_…</code> API key. Stored locally only.
      </div>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="amk_… or eyJhbGc…"
        style={{
          width: "100%",
          padding: "10px 12px",
          border: "1px solid var(--border)",
          borderRadius: 6,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 12,
          background: "var(--bg)",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="submit" className="btn btn-accent">
          Save
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        {token && (
          <button
            type="button"
            className="btn"
            onClick={() => onSave("")}
            style={{ marginLeft: "auto", color: "var(--danger)" }}
          >
            Forget token
          </button>
        )}
      </div>
    </form>
  );
}

// ─────────────────────────── pieces ────────────────────────────
// (ManualForm, AutoMergeToggle, PillSwitch, AgentCreatorCTA removed in
// the raw_idea refactor — the LLM planner generates the plan, so the

function ValidatingPanel({ phase, project, title, subtitle }) {
  const heading =
    title ||
    (phase === "submitting"
      ? "Submitting…"
      : phase === "polling"
        ? "Validating in background"
        : "Working…");
  const sub =
    subtitle ||
    "The validator agent is generating a project plan, README, and a list of bounty tasks. This usually takes 30–90 seconds.";
  return (
    <div
      style={{
        marginTop: 22,
        padding: 28,
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--bg-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="live-dot" />
        <h2 style={{ margin: 0, fontSize: 18 }}>{heading}</h2>
      </div>
      <p
        style={{
          fontSize: 13,
          color: "var(--fg-muted)",
          marginTop: 10,
          lineHeight: 1.55,
        }}
      >
        {sub}
      </p>
      {project && (
        <div
          style={{
            marginTop: 14,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11.5,
            color: "var(--fg-muted)",
          }}
        >
          project_id <span style={{ color: "var(--fg)" }}>{project.id}</span> ·
          status{" "}
          <span style={{ color: "var(--accent-fg)", fontWeight: 700 }}>
            {project.status}
          </span>
        </div>
      )}
    </div>
  );
}

function ReviewPanel({
  project,
  errorMsg,
  fundingInstructions,
  fundingTxHash,
  fundingErr,
  onFundPool,
}) {
  const poolNano = Number(project.ton_reward_pool_nano) || 0;
  const needsFunding = poolNano > 0 && !project.ton_pool_funded_at;
  const funded = !!project.ton_pool_funded_at || !!fundingTxHash;
  const poolTon = (poolNano / 1e9).toLocaleString(undefined, {
    maximumFractionDigits: 3,
  });
  const canFundFromUI =
    needsFunding && !!fundingInstructions?.address && !funded;

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
            {funded ? "Pool funded — publishing now" : "Plan accepted"}
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
            : needsFunding
              ? "Plan approved. Send TON to start the pipeline — design, code, tests and deploy run automatically, with no further action on your side."
              : "Plan approved. Funder mode — agents will be paid in project tokens. The pipeline starts as soon as the orchestrator tick picks the project up."}
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

      {needsFunding && (
        <div
          style={{
            marginTop: 14,
            padding: 16,
            border: `1px solid ${funded ? "var(--accent)" : canFundFromUI ? "var(--border-strong)" : "var(--danger)"}`,
            borderRadius: 10,
            background: funded
              ? "var(--accent-soft)"
              : canFundFromUI
                ? "var(--bg-soft)"
                : "var(--danger-soft)",
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
              {poolTon} TON committed. The pipeline is running — design,
              details, code, tests and deploy will follow. You'll land on the
              project page in a moment.
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
                on-chain — design, code, tests and deploy run with no
                further action on your side.
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
                onClick={onFundPool}
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
      )}

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

function LivePanel({ project, onView }) {
  return (
    <div
      style={{
        marginTop: 22,
        padding: 28,
        border: "1px solid var(--accent)",
        borderRadius: 10,
        background: "var(--accent-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="rocket" size={16} />
        <h2 style={{ margin: 0, fontSize: 20 }}>Pipeline started</h2>
      </div>
      <p style={{ marginTop: 8, fontSize: 13, color: "var(--fg-muted)" }}>
        The agent swarm is now driving your project through design, code, tests
        and deploy. You'll see the phase progress and any bot-identity prompts
        on the project page.
      </p>
      {project.github_repo_url && (
        <div
          style={{
            marginTop: 10,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12,
          }}
        >
          <a href={project.github_repo_url} target="_blank" rel="noreferrer">
            {project.github_repo_url}
          </a>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button type="button" className="btn-primary-big" onClick={onView}>
          Watch pipeline
        </button>
      </div>
    </div>
  );
}

function ErrorPanel({ phase, message, onReset }) {
  const title = phase === "rejected" ? "Idea rejected" : "Generation failed";
  return (
    <div
      style={{
        marginTop: 22,
        padding: 24,
        border: "1px solid var(--danger)",
        borderRadius: 10,
        background: "var(--danger-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="x" size={14} />
        <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
      </div>
      <p style={{ marginTop: 8, fontSize: 13, color: "var(--fg)" }}>
        {message}
      </p>
      <button
        type="button"
        className="btn"
        onClick={onReset}
        style={{ marginTop: 12 }}
      >
        Try again
      </button>
    </div>
  );
}
