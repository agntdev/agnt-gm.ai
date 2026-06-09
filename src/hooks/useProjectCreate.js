// State machine + polling for the TMA agntdev create flow.
//
// Phase transitions:
//
//   pool > 0:
//     idle ──submit()──▶ submitting ──▶ polling ──▶ ready ──fundPool()──▶ starting ──▶ live
//                                 │              │
//                                 └──────────────┴─▶ rejected / failed
//
//   pool = 0 (no user action required — orchestrator auto-starts):
//     idle ──submit()──▶ submitting ──▶ polling ──▶ starting ──▶ live
//                                 │              │
//                                 └──────────────┴─▶ rejected / failed
//
// - `submit(body)` calls POST /builder/projects, then either jumps to
//   "ready" (pool>0) or to "starting" (pool=0) once the LLM planner
//   lands the project on `ready_to_publish`. While status is
//   `validating` we sit in the "polling" phase.
// - `pollUntilReady` returns true on `ready_to_publish`, false on
//   any other terminal state (rejected / failed / live / timeout).
// - `pollUntilFunded` watches for the project to flip to `live`
//   (deposit-watcher path for pool>0, orchestrator-sweep path for
//   pool=0). On 5-minute timeout, sets phase to "failed".
//
// All poll loops carry a generation token so a reset / re-submit kills
// in-flight polls without leaking the timeout. The hook itself owns
// every piece of state — the calling component is a pure router.

import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { PLATFORM_TON_WALLET } from "../lib/api.js";
import { buildCommentPayload } from "../components/ownerPayment.jsx";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 5 * 60 * 1000;

function usePollGen() {
  const ref = useRef(0);
  const bump = () => {
    ref.current += 1;
    return ref.current;
  };
  return [ref, bump];
}

export function useProjectCreate(token) {
  const [phase, setPhase] = useState("idle");
  const [project, setProject] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [showAuthEdit, setShowAuthEdit] = useState(false);
  const [fundingInstructions, setFundingInstructions] = useState(null);
  const [fundingTxHash, setFundingTxHash] = useState(null);
  const [fundingErr, setFundingErr] = useState("");
  const pollAbort = useRef(null);
  const [pollGen, bumpPollGen] = usePollGen();

  useEffect(
    () => () => {
      if (pollAbort.current) clearTimeout(pollAbort.current);
    },
    [],
  );

  function shake() {
    setShakeKey((n) => n + 1);
  }

  function fail(message) {
    setErrorMsg(message);
    shake();
  }

  function reset() {
    if (pollAbort.current) clearTimeout(pollAbort.current);
    bumpPollGen();
    setPhase("idle");
    setProject(null);
    setErrorMsg("");
    setShowAuthEdit(false);
    setFundingTxHash(null);
    setFundingErr("");
  }

  // ── poll loops ──────────────────────────────────────────────────

  // Returns true when the project lands on `ready_to_publish`
  // (the caller can then proceed to funding or to "starting"),
  // false for any other terminal state — rejected, failed, or a
  // 5-minute timeout. Phase transitions for those terminal states
  // happen inside this function; the caller doesn't need to act.
  async function pollUntilReady(idOrSlug, gen) {
    const start = Date.now();
    while (Date.now() - start < POLL_MAX_MS) {
      if (gen !== pollGen.current) return false;
      const res = await api.getProject(idOrSlug);
      if (gen !== pollGen.current) return false;
      if (res?.project) {
        setProject(res.project);
        if (res.project.status === "ready_to_publish") return true;
        if (res.project.status === "rejected") {
          setPhase("rejected");
          setErrorMsg(
            res.project.rejection_reason ||
              "The validator rejected this project idea.",
          );
          return false;
        }
        if (res.project.status === "failed") {
          setPhase("failed");
          setErrorMsg("Project generation failed. Please try again.");
          return false;
        }
        if (res.project.status === "live") {
          // Fast orchestrator: the project auto-started before the
          // LLM planner finished reporting back. Land on `live`
          // directly — the caller would route there anyway.
          setPhase("live");
          return false;
        }
      }
      await new Promise((r) => {
        pollAbort.current = setTimeout(r, POLL_INTERVAL_MS);
      });
    }
    if (gen !== pollGen.current) return false;
    setPhase("failed");
    setErrorMsg(
      "Timed out waiting for the validator agent. The project may still complete — check the project page.",
    );
    return false;
  }

  // Watches for the project to flip to `live` (either because the
  // deposit watcher confirmed the TON transfer, or because the
  // orchestrator sweep picked up a pool=0 project). On 5-minute
  // timeout we set phase to "failed" so the user lands on the
  // ErrorPanel instead of being stuck on the "starting" spinner.
  async function pollUntilFunded(idOrSlug, gen) {
    const start = Date.now();
    while (Date.now() - start < POLL_MAX_MS) {
      if (gen !== pollGen.current) return;
      const res = await api.getProject(idOrSlug);
      if (gen !== pollGen.current) return;
      if (res?.project) {
        setProject(res.project);
        if (res.project.status === "live") {
          setPhase("live");
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
      "The pipeline is taking longer than expected. The project is still being processed — check the project page.",
    );
  }

  // ── error handling ──────────────────────────────────────────────

  function handleApiResponse(res) {
    if (res.status === 401 || res.status === 403) {
      setPhase("idle");
      setErrorMsg(
        token
          ? "Authorization rejected by the API. Token may be expired or invalid."
          : "Sign in to propose a project.",
      );
      setShowAuthEdit(true);
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
      shake();
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

  // ── public actions ──────────────────────────────────────────────

  async function submit(body) {
    if (!token) {
      setErrorMsg("Sign in with GitHub to propose a project.");
      return false;
    }
    setErrorMsg("");
    setPhase("submitting");

    const res = await api.createProject(body, token);
    if (!handleApiResponse(res)) return false;
    applyCreatedProject(res);

    const initial = res.data?.project;
    const idOrSlug = initial?.id || initial?.slug;
    const poolNano = Number(initial?.ton_reward_pool_nano) || 0;
    const needsFunding = poolNano > 0;

    if (!idOrSlug) {
      setPhase("failed");
      setErrorMsg("Project created without an id. Refresh and try again.");
      return true;
    }

    // Two paths from "validating":
    //  - pool>0: poll until ready_to_publish, then wait in "ready" for
    //    the user to fund. The deposit watcher takes over from there.
    //  - pool=0: poll until ready_to_publish, then kick off
    //    pollUntilFunded immediately (the orchestrator sweep does
    //    the work, no human in the loop).
    if (initial?.status === "validating") {
      setPhase("polling");
      const landed = await pollUntilReady(idOrSlug, bumpPollGen());
      if (!landed) return true; // terminal state already set
      if (needsFunding) {
        setPhase("ready");
      } else {
        setPhase("starting");
        pollUntilFunded(idOrSlug, bumpPollGen());
      }
    } else if (initial?.status === "live") {
      // Fast orchestrator beat the polling — already live.
      setPhase("live");
    } else if (needsFunding) {
      setPhase("ready");
    } else {
      setPhase("starting");
      pollUntilFunded(idOrSlug, bumpPollGen());
    }
    return true;
  }

  async function fundPool({ tonConnectUI }) {
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
      if (fundingInstructions.payload)
        message.payload = fundingInstructions.payload;
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
      setFundingTxHash(result?.boc || "submitted");
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

  return {
    phase,
    project,
    errorMsg,
    shakeKey,
    showAuthEdit,
    setShowAuthEdit,
    fundingInstructions,
    fundingTxHash,
    fundingErr,
    submit,
    fundPool,
    reset,
    fail,
    shake,
  };
}
