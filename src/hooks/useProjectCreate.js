// State machine + polling for the TMA agntdev create flow.
//
// Phase transitions:
//
//   idle ──submit()──▶ submitting ──▶ polling ──▶ ready ──fundPool()──▶ live
//                              │              │
//                              └──────────────┴─▶ rejected / failed
//
// - `submit(body)` calls POST /builder/projects, then either jumps to
//   "ready" (when the server already returns a terminal status) or
//   "polling" (when status is `validating` and the LLM planner is
//   running in the background).
// - `pollUntilReady` walks the project status until it leaves
//   `validating` and lands on `ready_to_publish` (or rejected / failed).
// - `fundPool({ tonConnectUI })` runs the TonConnect transaction for
//   the funding-intent, then `pollUntilFunded` watches for the deposit
//   watcher to flip the project to `live`.
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

  async function pollUntilReady(idOrSlug, gen) {
    const start = Date.now();
    while (Date.now() - start < POLL_MAX_MS) {
      if (gen !== pollGen.current) return;
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

  async function pollUntilFunded(idOrSlug, gen) {
    const start = Date.now();
    let everSawFunded = false;
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
      return;
    }
    setErrorMsg("");
    setPhase("submitting");

    const res = await api.createProject(body, token);
    if (!handleApiResponse(res)) return;
    applyCreatedProject(res);

    const initial = res.data?.project;
    if (initial?.status === "validating") {
      setPhase("polling");
      pollUntilReady(initial.id || initial.slug, bumpPollGen());
    } else {
      setPhase("ready");
    }
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
