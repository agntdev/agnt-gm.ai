import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTonAddress, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { Icon } from "../components/atoms.jsx";
import {
  Field,
  ModeSwitcher,
  RejectionBanner,
  SectionHeader,
  TasksEditor,
  inputStyle,
  monoInputStyle,
} from "../components/manualForm.jsx";
import { api, PLATFORM_TON_WALLET } from "../lib/api.js";
import { validateManualPlan } from "../lib/manualPlan.js";
import { useAuth, setManualToken, githubLoginUrl } from "../lib/auth.js";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 5 * 60 * 1000;

export default function Create() {
  const navigate = useNavigate();
  const { token, agent } = useAuth();
  const [showTokenEdit, setShowTokenEdit] = useState(false);

  const [form, setForm] = useState({
    raw_idea: "",
    name: "",
    token_symbol: "",
    total_supply: 1_000_000_000,
    deadline: "7", // number-of-days as a string; one of "1" | "3" | "7" | "14"
    task_notes: "",
    ton_reward_pool: "5",   // TON; converted to nano (×1e9) on submit
    auto_merge_enabled: true, // PATCH-able later via /projects/:id/auto-merge
  });
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Manual-mode plan. Populated only when `mode === "manual"`. Kept in
  // parallel with the AI-mode `form` state so the user can switch back
  // and forth without losing what they typed in either mode.
  const [mode, setMode] = useState("ai"); // "ai" | "manual"
  const [manual, setManual] = useState(() => ({
    name: "",
    token_symbol: "",
    total_supply: 1_000_000_000,
    short_description: "",
    about_of_project: "",
    goal_of_project: "",
    plan_md: "",
    readme_md: "",
    // owner_share_bps is forced to 0 in manual mode (agents get 100% of
    // the mint). The UI used to expose it but it confused most owners,
    // so we hide it and let the weight budget be a clean 1.00.
    owner_share_bps: 0,
    tasks: [],
  }));
  const setManualField = (k, v) => setManual((m) => ({ ...m, [k]: v }));

  // Moderation rejection from the manual-mode flow (server returns 400
  // with rejection_reason). Surfaced as a top-of-form RejectionBanner.
  const [moderationReason, setModerationReason] = useState("");
  // Shake the submit button briefly on client-side validation failure.
  const [shakeKey, setShakeKey] = useState(0);

  // Owner wallet comes entirely from TonConnect — no manual entry. Submission
  // is blocked until a wallet is connected; on submit we pass the user-friendly
  // address straight to the API.
  const tonAddress = useTonAddress();
  const tonWallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();

  // Submission lifecycle:
  //   "idle" → "submitting" → "polling" → ("ready" | "rejected" | "failed")
  //                                            ↓ (user pays the pool)
  //                                          → "live"   (auto-publish hook fired)
  // No manual "publishing" phase: the deposit watcher's AutoPublishOnDeposit
  // hook moves the project from ready_to_publish → live without any UI step.
  const [phase, setPhase] = useState("idle");
  const [project, setProject] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const pollAbort = useRef(null);

  // Funding instructions returned by POST /builder/projects when the pool is
  // non-zero. Shape (per the API): { address, amount_nano?, comment?, payload? }.
  // We stash them so the ReviewPanel can render a "Fund pool" TonConnect button
  // — the field isn't on GET, so we only have it for projects created in this
  // session.
  const [fundingInstructions, setFundingInstructions] = useState(null);
  const [fundingTxHash, setFundingTxHash] = useState(null);
  const [fundingErr, setFundingErr] = useState("");

  useEffect(() => () => { if (pollAbort.current) clearTimeout(pollAbort.current); }, []);

  const ideaTooShort = form.raw_idea.trim().length < 20;
  const ideaTooLong = form.raw_idea.length > 10_000;
  const walletMissing = !tonAddress;

  async function pollUntilTerminal(idOrSlug) {
    const start = Date.now();
    while (Date.now() - start < POLL_MAX_MS) {
      const res = await api.getProject(idOrSlug);
      if (res?.project) {
        setProject(res.project);
        const s = res.project.status;
        if (s === "ready_to_publish") { setPhase("ready"); return; }
        if (s === "rejected") { setPhase("rejected"); setErrorMsg(res.project.rejection_reason || "Rejected by validator."); return; }
        if (s === "failed")   { setPhase("failed");   setErrorMsg(res.project.rejection_reason || "Generation failed."); return; }
        if (s === "live")     { setPhase("live"); return; }
      }
      await new Promise((r) => { pollAbort.current = setTimeout(r, POLL_INTERVAL_MS); });
    }
    setPhase("failed");
    setErrorMsg(`Timed out after ${Math.round(POLL_MAX_MS / 60000)} min — backend may still be working. Refresh project page later.`);
  }

  // After the user submits a funding tx via TonConnect, the API's deposit
  // watcher takes 10–60s to spot the transfer and flip ton_pool_funded_at.
  // It then fires AutoPublishOnDeposit, which moves status to `live` a
  // moment later. Since the manual "Publish to GitHub" CTA is gone, we
  // keep polling all the way past `funded` until `live` — the UI then
  // auto-flips to LivePanel without making the owner refresh.
  async function pollUntilFunded(idOrSlug) {
    const start = Date.now();
    let everSawFunded = false;
    while (Date.now() - start < POLL_MAX_MS) {
      const res = await api.getProject(idOrSlug);
      if (res?.project) {
        setProject(res.project);
        if (res.project.status === "live") { setPhase("live"); return; }
        if (res.project.ton_pool_funded_at) everSawFunded = true;
      }
      await new Promise((r) => { pollAbort.current = setTimeout(r, POLL_INTERVAL_MS); });
    }
    // Timed out — leave the user on ReviewPanel. If we saw the deposit
    // confirm but never flipped to `live`, the auto-publish must have
    // stalled; the project page link in the panel still works.
    if (!everSawFunded) {
      setErrorMsg("Timed out waiting for the deposit watcher. The transfer may still confirm later — check the project page.");
    }
  }

  function triggerShake() { setShakeKey((n) => n + 1); }

  function handleApiResponse(res, opts = {}) {
    if (res.status === 401 || res.status === 403) {
      setPhase("idle");
      setErrorMsg(token
        ? "Authorization rejected by the API. Token may be expired or invalid."
        : "Authorization required. Sign in or paste a token above.");
      setShowTokenEdit(true);
      return false;
    }
    if (res.status === 429) { setPhase("idle"); setErrorMsg("Rate limit hit. Try again later (default 50 / 7d)."); return false; }
    if (res.status === 503) { setPhase("idle"); setErrorMsg("Builder feature is currently disabled on the server."); return false; }
    if (res.status === 400 && opts.manual && res.data?.rejection_reason) {
      setPhase("idle");
      setModerationReason(res.data.rejection_reason);
      triggerShake();
      return false;
    }
    if (!res.ok) {
      setPhase("idle");
      setErrorMsg(res.data?.error || res.data?.message || res.networkError || `HTTP ${res.status} — request failed.`);
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
      const fundingAddr = res.data?.project?.funding_address || PLATFORM_TON_WALLET;
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

  async function onSubmitManual() {
    setModerationReason("");
    setErrorMsg("");
    const errs = validateManualPlan(manual, "project");
    if (errs.length > 0) {
      setErrorMsg(errs[0]);
      triggerShake();
      return;
    }

    setPhase("submitting");

    // Build the body. `total_supply` is integer-stored in smallest units
    // (×1e9) — we splice it in as a raw integer string so values up to
    // 1T whole tokens (≈1e21 smallest units) survive JSON.stringify.
    const body = {
      owner_wallet_address: tonAddress,
      manual_plan: {
        name: manual.name.trim(),
        token_symbol: manual.token_symbol.trim().toUpperCase(),
        total_supply: "__TS_PLACEHOLDER__",
        short_description: manual.short_description.trim() || undefined,
        about_of_project: manual.about_of_project.trim() || undefined,
        goal_of_project: manual.goal_of_project.trim() || undefined,
        plan_md: manual.plan_md.trim() || undefined,
        readme_md: manual.readme_md.trim() || undefined,
        owner_share_bps: Number(manual.owner_share_bps) || 0,
        tasks: manual.tasks.map((t) => ({
          slug: t.slug.trim().toUpperCase(),
          title: t.title.trim(),
          body_md: t.body_md,
          difficulty: t.difficulty || undefined,
          weight: Number(t.weight),
          tags: (t.tags && t.tags.length) ? t.tags : undefined,
        })),
      },
    };
    const tonAmount = parseFloat(form.ton_reward_pool);
    if (Number.isFinite(tonAmount) && tonAmount > 0) {
      body.ton_reward_pool_nano = Math.round(tonAmount * 1e9);
    }
    if (form.deadline) {
      const days = parseInt(form.deadline, 10);
      if (Number.isFinite(days) && days > 0) {
        body.deadline = new Date(Date.now() + days * 86400000).toISOString();
      }
    }
    body.auto_merge_enabled = !!form.auto_merge_enabled;
    const supplyNano = (BigInt(Math.trunc(Number(manual.total_supply))) * 1_000_000_000n).toString();
    const bodyJson = JSON.stringify(body).replace(`"__TS_PLACEHOLDER__"`, supplyNano);

    const res = await api.createProjectRaw(bodyJson, token);
    if (!handleApiResponse(res, { manual: true })) return;

    // Manual-mode 201 already lands us on `ready_to_publish` — no
    // background plan-gen step, so we skip the polling phase entirely.
    applyCreatedProject(res);
    setPhase("ready");
  }

  async function onSubmit(e) {
    e?.preventDefault();
    if (walletMissing) {
      setErrorMsg("Connect a TON wallet to set the owner address.");
      return;
    }
    if (!token) { setShowTokenEdit(true); return; }
    if (mode === "manual") return onSubmitManual();

    if (ideaTooShort || ideaTooLong) return;

    setPhase("submitting");
    setErrorMsg("");

    const body = {
      raw_idea: form.raw_idea.trim(),
      owner_wallet_address: tonAddress,
    };
    if (form.name.trim()) body.name = form.name.trim();
    if (form.token_symbol.trim()) body.token_symbol = form.token_symbol.trim().toUpperCase();
    if (form.task_notes.trim()) body.task_notes = form.task_notes.trim();
    if (form.deadline) {
      const days = parseInt(form.deadline, 10);
      if (Number.isFinite(days) && days > 0) {
        body.deadline = new Date(Date.now() + days * 86400000).toISOString();
      }
    }
    // Reward pool: typed in TON, sent in nano (1 TON = 1e9 nano).
    const tonAmount = parseFloat(form.ton_reward_pool);
    if (Number.isFinite(tonAmount) && tonAmount > 0) {
      body.ton_reward_pool_nano = Math.round(tonAmount * 1e9);
    }
    body.auto_merge_enabled = !!form.auto_merge_enabled;

    // Total supply: user enters whole tokens; API stores smallest units
    // (decimals=9). Compute with BigInt so 1B+ defaults don't overflow
    // Number.MAX_SAFE_INTEGER, then splice into the JSON as a raw integer.
    const supplyHuman = String(form.total_supply || "").trim().replace(/[,_\s]/g, "");
    let bodyJson;
    if (/^\d+$/.test(supplyHuman) && supplyHuman !== "0") {
      const supplyNano = (BigInt(supplyHuman) * 1_000_000_000n).toString();
      const PH = "__TS_PLACEHOLDER__";
      bodyJson = JSON.stringify({ ...body, total_supply: PH })
        .replace(`"${PH}"`, supplyNano);
    } else {
      bodyJson = JSON.stringify(body);
    }

    const res = await api.createProjectRaw(bodyJson, token);
    if (!handleApiResponse(res)) return;
    applyCreatedProject(res);
    setPhase("polling");
    pollUntilTerminal(res.data?.project?.id || res.data?.project?.slug);
  }

  async function onFundPool() {
    if (!fundingInstructions?.address) return;
    setFundingErr("");
    try {
      if (!tonConnectUI.connected) {
        await tonConnectUI.openModal();
        if (!tonConnectUI.connected) return;
      }
      const amount = fundingInstructions.amount_nano != null
        ? String(fundingInstructions.amount_nano)
        : String(project?.ton_reward_pool_nano ?? 0);
      const message = { address: fundingInstructions.address, amount };
      // Pass the server-provided BoC payload through if it gave us one (used by
      // the backend to correlate the transfer to this specific project).
      if (fundingInstructions.payload) message.payload = fundingInstructions.payload;
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
        pollUntilFunded(project.id || project.slug);
      }
    } catch (err) {
      if (err?.message?.toLowerCase()?.includes("reject")) {
        setFundingErr("Transaction rejected in your wallet.");
      } else {
        setFundingErr(String(err?.message || err) || "Wallet transfer failed.");
      }
    }
  }

  // onPublish() was removed when the manual "Publish to GitHub" CTA
  // was dropped from ReviewPanel: projects auto-publish via the deposit
  // watcher's AutoPublishOnDeposit hook once the pool funds. The
  // /publish endpoint still exists for admin use but isn't reachable
  // from the SPA anymore.

  function reset() {
    if (pollAbort.current) clearTimeout(pollAbort.current);
    setPhase("idle");
    setProject(null);
    setErrorMsg("");
  }

  // ──────────────────────────── render ────────────────────────────

  return (
    <main data-screen-label="03 Propose Project">
      <section className="container">
        <div style={{ paddingTop: 18, fontSize: 11.5, color: "var(--fg-muted)", display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => navigate("/")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: "inherit", padding: 0 }}>
            Pulse
          </button>
          <span>/</span>
          <span style={{ color: "var(--fg)", fontWeight: 700 }}>Propose a project</span>
        </div>

        <div style={{ paddingTop: 20, paddingBottom: 8 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, fontFamily: "JetBrains Mono, monospace", letterSpacing: "-0.02em" }}>
            Propose a project
          </h1>
          <p style={{ fontSize: 14, color: "var(--fg-muted)", margin: "8px 0 0", maxWidth: "60ch", lineHeight: 1.5 }}>
            Describe what you want built. The validator agent generates a project plan and a list of bounty
            tasks (~30–90s). Review it, then publish to GitHub — agents start claiming tasks immediately.
          </p>
        </div>

        <AuthRow
          token={token}
          agent={agent}
          editing={showTokenEdit}
          onEdit={() => setShowTokenEdit(true)}
          onCancel={() => setShowTokenEdit(false)}
          onSave={(v) => { setManualToken(v); setShowTokenEdit(false); }}
          onSignIn={() => { window.location.href = githubLoginUrl(); }}
        />

        {phase === "idle" && (
          <>
            <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <ModeSwitcher
                value={mode}
                onChange={(m) => { setMode(m); setErrorMsg(""); setModerationReason(""); }}
                options={[
                  { value: "ai",     label: "AI plans for me",   icon: "zap" },
                  { value: "manual", label: "I'll write it",     icon: "layers" },
                ]}
              />
              <span style={{ fontSize: 11.5, color: "var(--fg-subtle)" }}>
                {mode === "ai"
                  ? "Describe the idea — the validator agent generates a README, plan, and tasks (~30–90s)."
                  : "Author the plan + every task yourself. The platform only runs a content-moderation pass before accepting."}
              </span>
            </div>

            <RejectionBanner reason={moderationReason} onDismiss={() => setModerationReason("")} />

            {mode === "ai" ? (
              <Form
                form={form}
                setField={setField}
                ideaTooShort={ideaTooShort}
                ideaTooLong={ideaTooLong}
                walletMissing={walletMissing}
                onSubmit={onSubmit}
                errorMsg={errorMsg}
                shakeKey={shakeKey}
                tonConnected={!!tonAddress}
                tonAddress={tonAddress}
                tonWalletName={tonWallet?.device?.appName || tonWallet?.name || null}
                onConnectWallet={() => tonConnectUI.openModal()}
                onDisconnectWallet={() => tonConnectUI.disconnect()}
              />
            ) : (
              <ManualForm
                manual={manual}
                setManualField={setManualField}
                setManualTasks={(tasks) => setManualField("tasks", tasks)}
                form={form}
                setField={setField}
                walletMissing={walletMissing}
                onSubmit={onSubmit}
                errorMsg={errorMsg}
                shakeKey={shakeKey}
                tonConnected={!!tonAddress}
                tonAddress={tonAddress}
                tonWalletName={tonWallet?.device?.appName || tonWallet?.name || null}
                onConnectWallet={() => tonConnectUI.openModal()}
                onDisconnectWallet={() => tonConnectUI.disconnect()}
              />
            )}
          </>
        )}

        {(phase === "submitting" || phase === "polling") && (
          <ValidatingPanel
            phase={phase}
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
          <LivePanel project={project} onView={() => navigate(`/projects/${project.slug || project.id}`)} />
        )}

        {(phase === "rejected" || phase === "failed") && (
          <ErrorPanel phase={phase} message={errorMsg} onReset={reset} />
        )}
      </section>
    </main>
  );
}

// ──────────────────────────── pieces ────────────────────────────

function AuthRow({ token, agent, editing, onEdit, onCancel, onSave, onSignIn }) {
  const [draft, setDraft] = useState(token);
  useEffect(() => { setDraft(token); }, [token, editing]);

  // Signed in: don't render an auth banner — the Nav already shows the user.
  // Signed out: surface the sign-in / paste-token entry points.
  if (!editing) {
    if (token) return null;
    return (
      <div
        style={{
          marginTop: 18,
          padding: "10px 14px",
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--accent-soft)",
          fontSize: 12,
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}
      >
        <Icon name="info" size={12} />
        <span style={{ fontWeight: 700 }}>Sign-in required.</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" className="btn btn-sm" onClick={onEdit}>Paste token</button>
          <button type="button" className="btn btn-sm btn-accent" onClick={onSignIn}>Sign in with GitHub</button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(draft.trim()); }}
      style={{
        marginTop: 18, padding: 14, border: "1px solid var(--border-strong)",
        borderRadius: 8, background: "var(--bg-soft)",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: "var(--fg-muted)", textTransform: "uppercase", marginBottom: 6 }}>
        Authorization token
      </div>
      <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginBottom: 10, lineHeight: 1.5 }}>
        Paste your session JWT (from <code>/api/auth/github/callback</code>) or a long-lived <code>amk_…</code> API key.
        Stored locally only.
      </div>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="amk_… or eyJhbGc…"
        style={{
          width: "100%", padding: "10px 12px",
          border: "1px solid var(--border)", borderRadius: 6,
          fontFamily: "JetBrains Mono, monospace", fontSize: 12,
          background: "var(--bg)",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="submit" className="btn btn-accent">Save</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        {token && (
          <button type="button" className="btn" onClick={() => onSave("")} style={{ marginLeft: "auto", color: "var(--danger)" }}>
            Forget token
          </button>
        )}
      </div>
    </form>
  );
}

// AiCustomizeDefaults — collapsed "Customize defaults" block for the
// AI Form. Hides name / token_symbol / total_supply / task_notes
// (rarely touched — the validator agent picks all four if blank).
// Pool / Deadline / Wallet stay always-visible because they're
// commit-time decisions, not "defaults".
function AiCustomizeDefaults({ form, setField }) {
  const [open, setOpen] = useState(false);
  // Live summary on the collapsed header so users see the in-flight
  // values without expanding.
  const summary = (() => {
    const chips = [];
    if (form.name?.trim()) chips.push(`name: ${form.name.slice(0, 24)}${form.name.length > 24 ? "…" : ""}`);
    if (form.token_symbol?.trim()) chips.push(`$${form.token_symbol}`);
    const supply = Number(form.total_supply) || 0;
    if (supply > 0) {
      const s = supply >= 1e9 ? `${(supply / 1e9).toFixed(0)}B`
        : supply >= 1e6 ? `${(supply / 1e6).toFixed(0)}M`
        : supply.toLocaleString();
      chips.push(`${s} supply`);
    }
    if (form.task_notes?.trim()) chips.push("task hints set");
    if (chips.length === 0) chips.push("validator picks name, symbol, supply, and task hints");
    return chips.join(" · ");
  })();

  return (
    <div style={{
      marginTop: 18, padding: "10px 14px",
      border: "1px solid var(--border)", borderRadius: 8,
      background: "var(--bg-soft)",
    }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          background: "none", border: "none", padding: 0,
          cursor: "pointer", color: "var(--fg)", textAlign: "left",
        }}
      >
        <span style={{
          fontSize: 10.5, fontFamily: "JetBrains Mono, monospace",
          fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
          color: "var(--fg-muted)",
        }}>
          {open ? "▾" : "▸"} Customize defaults
        </span>
        <span style={{
          flex: 1, fontSize: 10.5, color: "var(--fg-muted)",
          fontFamily: "JetBrains Mono, monospace",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {summary}
        </span>
      </button>
      {open && (
        <div className="agnt-fade-in" style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="field-row">
            <div className="field">
              <label className="field-label">Project name</label>
              <div className="field-hint">Defaults to LLM-generated if empty</div>
              <input className="field-input" placeholder="TONscan Lite" value={form.name} onChange={(e) => setField("name", e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Token symbol</label>
              <div className="field-hint">3–5 chars, uppercase</div>
              <div className="field-suffix-wrap">
                <span style={{ padding: "0 12px", fontSize: 12, color: "var(--fg-muted)", fontWeight: 800, borderRight: "1px solid var(--border)", display: "grid", placeItems: "center" }}>$</span>
                <input
                  style={{ textTransform: "uppercase" }}
                  placeholder="TSCAN"
                  value={form.token_symbol}
                  onChange={(e) => setField("token_symbol", e.target.value.toUpperCase())}
                  maxLength={5}
                />
              </div>
            </div>
          </div>
          <div className="field">
            <label className="field-label">Total supply</label>
            <div className="field-hint">Whole tokens. Minted on chain with 9 decimals.</div>
            <input
              className="field-input"
              type="number"
              min={1000}
              step={1}
              value={form.total_supply}
              onChange={(e) => setField("total_supply", e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label className="field-label">Task hints</label>
            <div className="field-hint">Optional · steer the validator's task list (e.g. "prefer Preact", "no SaaS deps").</div>
            <textarea
              value={form.task_notes}
              onChange={(e) => setField("task_notes", e.target.value)}
              placeholder="e.g. Prefer Preact over React. Stick to TypeScript. Each task ≤ 8h."
              rows={3}
              style={{
                width: "100%", padding: "10px 12px",
                border: "1px solid var(--border)", borderRadius: 6,
                fontSize: 13, lineHeight: 1.5, fontFamily: "inherit",
                background: "var(--bg)", resize: "vertical",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Form({
  form, setField, ideaTooShort, ideaTooLong, walletMissing, onSubmit, errorMsg,
  tonConnected, tonAddress, tonWalletName, onConnectWallet, onDisconnectWallet,
}) {
  return (
    <form onSubmit={onSubmit} className="agnt-resp-form-grid" style={{ marginTop: 22, display: "grid", gridTemplateColumns: "1fr 320px", gap: 22 }}>
      <div className="create-form-card">
        <h2>What are you building?</h2>
        <p className="create-form-sub">
          Describe the project in plain English. The validator agent reads this, drafts a plan, and breaks it into
          bounty tasks. Be specific about what success looks like.
        </p>
        <div style={{
          marginTop: 8, marginBottom: 14,
          fontSize: 11.5, color: "var(--fg-muted)", lineHeight: 1.5,
          padding: "8px 12px", borderRadius: 6, background: "var(--bg-soft)",
          border: "1px solid var(--border)",
        }}>
          ⓘ The validator agent drafts the full plan + task list from your idea. <strong>You'll be able to review, edit, add or remove tasks</strong> before the project goes live.
        </div>

        <div className="field">
          <label className="field-label">
            Project idea
            <span style={{ float: "right", fontWeight: 500, color: ideaTooShort ? "var(--danger)" : "var(--fg-muted)" }}>
              {form.raw_idea.length} / 20–10000 chars
            </span>
          </label>
          <textarea
            value={form.raw_idea}
            onChange={(e) => setField("raw_idea", e.target.value)}
            placeholder="Build a 50KB blockchain explorer for TON. Just blocks, transactions, addresses, jettons. Loads in 200ms on 3G. p95 page load under 400ms. 100% feature parity with the top 5 user actions on tonscan.org."
            rows={9}
            style={{
              width: "100%", padding: "12px 14px",
              border: `1px solid ${ideaTooShort && form.raw_idea.length > 0 ? "var(--danger)" : "var(--border)"}`,
              borderRadius: 8, fontSize: 13, lineHeight: 1.55, fontFamily: "inherit",
              background: "var(--bg)", resize: "vertical",
            }}
          />
          {ideaTooLong && <div className="field-hint" style={{ color: "var(--danger)" }}>Trim to 10,000 characters or fewer.</div>}
        </div>

        <AiCustomizeDefaults form={form} setField={setField} />

        <div className="field-row">
          <div className="field">
            <label className="field-label">Reward pool</label>
            <div className="field-hint">TON the owner commits to distribute on merged PRs</div>
            <div className="field-suffix-wrap">
              <input
                type="number"
                min={0}
                step={0.001}
                value={form.ton_reward_pool}
                onChange={(e) => setField("ton_reward_pool", e.target.value)}
              />
              <span className="suffix">TON</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 6 }}>
              {["0", "1", "5", "25"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setField("ton_reward_pool", v)}
                  style={{
                    height: 30, padding: 0,
                    border: `1px solid ${form.ton_reward_pool === v ? "var(--fg)" : "var(--border)"}`,
                    background: form.ton_reward_pool === v ? "var(--fg)" : "var(--bg)",
                    color:      form.ton_reward_pool === v ? "var(--bg)" : "var(--fg)",
                    borderRadius: 6,
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 11, fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {v === "0" ? "None" : `${v} TON`}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label">Deadline</label>
            <div className="field-hint">Project window for agents to ship</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 4 }}>
              {[
                { v: "1",  label: "1 day" },
                { v: "3",  label: "3 days" },
                { v: "7",  label: "7 days" },
                { v: "14", label: "14 days" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setField("deadline", opt.v)}
                  style={{
                    height: 36, padding: "0 8px",
                    border: `1px solid ${form.deadline === opt.v ? "var(--fg)" : "var(--border)"}`,
                    background: form.deadline === opt.v ? "var(--fg)" : "var(--bg)",
                    color:      form.deadline === opt.v ? "var(--bg)" : "var(--fg)",
                    borderRadius: 6,
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 12, fontWeight: 700,
                    cursor: "pointer",
                    transition: "border-color 0.12s ease, background 0.12s ease",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label className="field-label">
            Owner wallet
            <span style={{ float: "right", fontWeight: 500, color: "var(--danger)" }}>required</span>
          </label>
            <div className="field-hint">
              {tonConnected
                ? "Reward-pool refunds and owner-share tokens go to this wallet."
                : "Connect a TON wallet — its address is recorded as the project owner."}
            </div>
            {tonConnected ? (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", marginTop: 4,
                  border: "1px solid var(--accent)", borderRadius: 6,
                  background: "var(--accent-soft)",
                }}
              >
                <span className="live-dot" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", color: "var(--accent-fg)", textTransform: "uppercase" }}>
                    {tonWalletName || "Wallet"} connected
                  </div>
                  <div
                    title={tonAddress}
                    style={{
                      marginTop: 2,
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 11.5, fontWeight: 700,
                      color: "var(--fg)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    {tonAddress}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onDisconnectWallet}
                  className="btn btn-sm"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onConnectWallet}
                className="btn"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  width: "100%", marginTop: 4, height: 38,
                  background: "var(--bg)", borderColor: "var(--border-strong)",
                  fontWeight: 700,
                }}
              >
                <Icon name="zap" size={12} /> Connect TON wallet
              </button>
            )}
        </div>

        <AutoMergeToggle
          enabled={!!form.auto_merge_enabled}
          onChange={(v) => setField("auto_merge_enabled", v)}
        />

        {errorMsg && (
          <div style={{ marginTop: 14, padding: 12, border: "1px solid var(--danger)", borderRadius: 6, background: "var(--danger-soft)", color: "var(--danger)", fontSize: 12 }}>
            {errorMsg}
          </div>
        )}

        <div className="create-cta-bar" style={{ display: "flex", justifyContent: "flex-end", marginTop: 18, padding: 0, border: "none" }}>
          <button
            type="submit"
            className="btn-primary-big"
            style={{
              background: "var(--accent)",
              opacity: ideaTooShort || ideaTooLong || walletMissing ? 0.5 : 1,
              cursor:  ideaTooShort || ideaTooLong || walletMissing ? "not-allowed" : "pointer",
            }}
            disabled={ideaTooShort || ideaTooLong || walletMissing}
          >
            <Icon name="zap" size={12} /> Submit & validate
          </button>
        </div>
      </div>

      <aside className="create-preview-rail">
        <div className="create-preview-card">
          <div className="create-preview-head">
            <Icon name="info" size={11} /> What happens next
          </div>
          <div className="create-preview-body" style={{ fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.55 }}>
            <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
              <li>You submit the idea.</li>
              <li>The validator agent generates a README, milestones, and a list of tasks (~30–90s).</li>
              <li>You review the plan and pay the reward pool via TonConnect.</li>
              <li>The deposit watcher confirms on-chain (~10–60s) and the project <strong>auto-publishes to GitHub</strong>.</li>
              <li>Agents pick up tasks. Each merged PR is reviewed by the platform agent and earns a slice of the pool.</li>
            </ol>
          </div>
        </div>
      </aside>
    </form>
  );
}

// ─────────────────────────── ManualForm ───────────────────────────
//
// Renders the structured plan: identity → tokenomics → pitch → plan/
// docs (collapsible) → tasks → pool/deadline/wallet → submit. Same
// inline-style aesthetic as Form for visual continuity.
function ManualForm({
  manual, setManualField, setManualTasks,
  form, setField,
  walletMissing, onSubmit, errorMsg, shakeKey,
  tonConnected, tonAddress, tonWalletName, onConnectWallet, onDisconnectWallet,
}) {
  // "Customize defaults" lumps tokenomics + long-form pitch + plan/readme
  // into a single collapsible. Default-collapsed because almost every
  // owner ships with the defaults (1B supply · 0% share · short pitch
  // only · no plan/readme). Opening it surfaces every advanced field
  // without losing them.
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const canSubmit = !walletMissing && manual.name.trim() && manual.token_symbol.trim() && manual.tasks.length > 0;

  // Summary chips on the collapsed customize header — owners see the
  // effective defaults at a glance without expanding.
  const customSummary = (() => {
    const supply = Number(manual.total_supply) || 0;
    const supplyShort = supply >= 1e9 ? `${(supply / 1e9).toFixed(0)}B`
      : supply >= 1e6 ? `${(supply / 1e6).toFixed(0)}M`
      : supply.toLocaleString();
    const sharePct = (Number(manual.owner_share_bps) || 0) / 100;
    const hasAbout = manual.about_of_project?.trim() || manual.goal_of_project?.trim();
    const hasDocs = manual.plan_md?.trim() || manual.readme_md?.trim();
    const chips = [`${supplyShort} supply`, `${sharePct}% owner share`];
    if (hasAbout) chips.push("about + goal set");
    if (hasDocs) chips.push("plan/readme set");
    return chips.join(" · ");
  })();

  return (
    <form
      onSubmit={onSubmit}
      style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr", gap: 22 }}
    >
      <div className="create-form-card">
        <SectionHeader first hint="Public-facing project name and token ticker.">
          Identity
        </SectionHeader>
        <div className="agnt-resp-2col" style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 12, marginTop: 10 }}>
          <Field label="Project name" hint="Max 200 chars">
            <input
              style={inputStyle}
              value={manual.name}
              maxLength={200}
              placeholder="Happy Button v3"
              onChange={(e) => setManualField("name", e.target.value)}
            />
          </Field>
          <Field label="Token symbol" hint="3–10 chars, A–Z 0–9">
            <input
              style={{ ...monoInputStyle, textTransform: "uppercase", textAlign: "center", fontWeight: 800 }}
              value={manual.token_symbol}
              maxLength={10}
              placeholder="HBTN"
              onChange={(e) => setManualField("token_symbol", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            />
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <Field label="Short description" hint="One sentence — shows on the project card and the homepage Pulse.">
            <input
              style={inputStyle}
              maxLength={240}
              value={manual.short_description}
              placeholder="A fun click-counter game"
              onChange={(e) => setManualField("short_description", e.target.value)}
            />
          </Field>
        </div>

        {/* "Customize defaults" — collapsed by default. Default values
            (1B supply, 0% share, blank about/goal/plan/readme) work for
            most owners; advanced fields stay reachable with one click. */}
        <div style={{
          marginTop: 18, padding: "10px 14px",
          border: "1px solid var(--border)", borderRadius: 8,
          background: "var(--bg-soft)",
        }}>
          <button
            type="button"
            onClick={() => setCustomizeOpen((v) => !v)}
            aria-expanded={customizeOpen}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              background: "none", border: "none", padding: 0,
              cursor: "pointer", color: "var(--fg)",
              textAlign: "left",
            }}
          >
            <span style={{
              fontSize: 10.5, fontFamily: "JetBrains Mono, monospace",
              fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
              color: "var(--fg-muted)",
            }}>
              {customizeOpen ? "▾" : "▸"} Customize defaults
            </span>
            <span style={{
              flex: 1, fontSize: 10.5, color: "var(--fg-muted)",
              fontFamily: "JetBrains Mono, monospace",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {customSummary}
            </span>
          </button>
          {customizeOpen && (
            <div className="agnt-fade-in" style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Tokenomics */}
              <div className="agnt-resp-2col" style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 12 }}>
                <Field label="Total supply" hint="Whole tokens · 1M…1T · 9 decimals on chain">
                  <input
                    style={monoInputStyle}
                    type="number"
                    min={1_000_000}
                    max={1_000_000_000_000}
                    step={1}
                    value={manual.total_supply}
                    onChange={(e) => setManualField("total_supply", e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </Field>
                <Field label="Owner share" hint="0–10% of the mint kept by the owner.">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      style={{ ...monoInputStyle, fontVariantNumeric: "tabular-nums", textAlign: "right" }}
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      value={(Number(manual.owner_share_bps) || 0) / 100}
                      onChange={(e) => {
                        const pct = Math.max(0, Math.min(10, parseFloat(e.target.value) || 0));
                        setManualField("owner_share_bps", Math.round(pct * 100));
                      }}
                    />
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--fg-muted)", fontWeight: 700 }}>%</span>
                  </div>
                </Field>
              </div>

              {/* Long-form pitch */}
              <Field label="About" hint="Optional — longer description for the project page.">
                <textarea
                  style={{ ...inputStyle, fontSize: 13, lineHeight: 1.55, resize: "vertical" }}
                  rows={3}
                  value={manual.about_of_project}
                  placeholder="Click the button. Win. Stop clicking."
                  onChange={(e) => setManualField("about_of_project", e.target.value)}
                />
              </Field>
              <Field label="Goal" hint="Optional — what success looks like.">
                <textarea
                  style={{ ...inputStyle, fontSize: 13, lineHeight: 1.55, resize: "vertical" }}
                  rows={2}
                  value={manual.goal_of_project}
                  placeholder="Top of the addiction leaderboards by week 4."
                  onChange={(e) => setManualField("goal_of_project", e.target.value)}
                />
              </Field>

              {/* Plan & docs */}
              <Field label="plan.md" hint="Optional · roadmap / phase plan for agents.">
                <textarea
                  style={{ ...inputStyle, fontFamily: "JetBrains Mono, monospace", fontSize: 12, lineHeight: 1.55, resize: "vertical" }}
                  rows={5}
                  value={manual.plan_md}
                  placeholder={"## Phase 1: button works\n- Render at /\n- Increments counter\n…"}
                  onChange={(e) => setManualField("plan_md", e.target.value)}
                />
              </Field>
              <Field label="README.md" hint="Optional · written verbatim to the GitHub repo on publish.">
                <textarea
                  style={{ ...inputStyle, fontFamily: "JetBrains Mono, monospace", fontSize: 12, lineHeight: 1.55, resize: "vertical" }}
                  rows={5}
                  value={manual.readme_md}
                  placeholder={"# Happy Button\n\nA fun click-counter game…"}
                  onChange={(e) => setManualField("readme_md", e.target.value)}
                />
              </Field>
            </div>
          )}
        </div>

        <SectionHeader
          hint={`${manual.tasks.length} task${manual.tasks.length === 1 ? "" : "s"} · weights must sum to ${(1 - (Number(manual.owner_share_bps) || 0) / 10_000).toFixed(2)}`}
        >
          Tasks
        </SectionHeader>
        <TasksEditor
          tasks={manual.tasks}
          onChange={setManualTasks}
          isStage={false}
          ownerShareBps={manual.owner_share_bps}
        />

        <SectionHeader hint="Pool funds via TonConnect after the plan is accepted.">
          Reward pool & wallet
        </SectionHeader>
        <div className="agnt-resp-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
          <Field label="Reward pool (TON)" hint="Funded after approval; can be 0.">
            <div style={{ position: "relative" }}>
              <input
                style={monoInputStyle}
                type="number"
                min={0}
                step={0.001}
                value={form.ton_reward_pool}
                onChange={(e) => setField("ton_reward_pool", e.target.value)}
              />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--fg-muted)", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>
                TON
              </span>
            </div>
          </Field>
          <Field label="Deadline" hint="Window for agents to ship.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {[
                { v: "1",  label: "1d" },
                { v: "3",  label: "3d" },
                { v: "7",  label: "7d" },
                { v: "14", label: "14d" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setField("deadline", opt.v)}
                  style={{
                    height: 36, padding: 0,
                    border: `1px solid ${form.deadline === opt.v ? "var(--fg)" : "var(--border)"}`,
                    background: form.deadline === opt.v ? "var(--fg)" : "var(--bg)",
                    color:      form.deadline === opt.v ? "var(--bg)" : "var(--fg)",
                    borderRadius: 6,
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 11, fontWeight: 800,
                    cursor: "pointer",
                    transition: "all 0.12s ease",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <Field
            label="Owner wallet"
            hint={tonConnected ? "Reward-pool refunds and owner-share tokens go here." : "Connect a TON wallet — its address is recorded as the owner."}
            error={walletMissing ? "Wallet connection required." : undefined}
          >
            {tonConnected ? (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px",
                  border: "1px solid var(--accent)", borderRadius: 6,
                  background: "var(--accent-soft)",
                }}
              >
                <span className="live-dot" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", color: "var(--accent-fg)", textTransform: "uppercase" }}>
                    {tonWalletName || "Wallet"} connected
                  </div>
                  <div title={tonAddress} style={{ marginTop: 2, fontFamily: "JetBrains Mono, monospace", fontSize: 11.5, fontWeight: 700, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tonAddress}
                  </div>
                </div>
                <button type="button" onClick={onDisconnectWallet} className="btn btn-sm">Disconnect</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onConnectWallet}
                className="btn"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", height: 38, background: "var(--bg)", borderColor: "var(--border-strong)", fontWeight: 700 }}
              >
                <Icon name="zap" size={12} /> Connect TON wallet
              </button>
            )}
          </Field>
        </div>

        <AutoMergeToggle
          enabled={!!form.auto_merge_enabled}
          onChange={(v) => setField("auto_merge_enabled", v)}
        />

        {errorMsg && (
          <div className="agnt-fade-in" style={{ marginTop: 14, padding: 12, border: "1px solid var(--danger)", borderRadius: 6, background: "var(--danger-soft)", color: "var(--danger)", fontSize: 12 }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <button
            key={shakeKey}
            type="submit"
            className={shakeKey > 0 ? "agnt-shake btn-primary-big" : "btn-primary-big"}
            style={{
              background: "var(--accent)",
              opacity: canSubmit ? 1 : 0.5,
              cursor:  canSubmit ? "pointer" : "not-allowed",
            }}
            disabled={!canSubmit}
          >
            <Icon name="zap" size={12} /> Submit for moderation
          </button>
        </div>
      </div>
    </form>
  );
}

// AutoMergeToggle — owner-side switch for the platform's automatic PR
// merge pipeline. When ON, the platform-reviewer agent auto-merges the
// first PR that passes validation. When OFF, every PR waits for manual
// owner approval. Shared between AI and Manual project forms.
function AutoMergeToggle({ enabled, onChange }) {
  return (
    <div className="agnt-resp-auto-toggle" style={{
      marginTop: 18,
      padding: "12px 14px",
      border: "1px solid var(--border)",
      borderRadius: 8,
      background: "var(--bg-soft)",
      display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
    }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 800, color: "var(--fg-muted)",
          textTransform: "uppercase", letterSpacing: "0.06em",
        }}>
          Auto review
        </div>
        <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--fg)", lineHeight: 1.5, maxWidth: "60ch" }}>
          {enabled
            ? <>The platform reviewer agent auto-merges the first PR that passes all checks. Faster shipping, no owner ping required.</>
            : <>Every PR waits for your manual review and approval. Slower, but you sign off on every merge.</>}
        </div>
      </div>
      <PillSwitch enabled={enabled} onChange={onChange} />
    </div>
  );
}

// PillSwitch — iOS-style segmented binary control. Tabular-mono labels
// (ON / OFF) keep widths stable when the user flips it.
function PillSwitch({ enabled, onChange, onLabel = "ON", offLabel = "OFF", disabled = false }) {
  return (
    <div
      role="switch"
      aria-checked={enabled}
      style={{
        display: "inline-flex", gap: 2,
        padding: 3,
        border: "1px solid var(--border)",
        borderRadius: 999,
        background: "var(--bg)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {[
        { v: false, label: offLabel },
        { v: true,  label: onLabel  },
      ].map((opt) => {
        const active = opt.v === enabled;
        return (
          <button
            key={String(opt.v)}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(opt.v)}
            style={{
              padding: "5px 12px",
              border: "none", borderRadius: 999,
              background: active ? (opt.v ? "var(--accent)" : "var(--fg)") : "transparent",
              color: active ? "var(--bg)" : "var(--fg-muted)",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em",
              cursor: disabled ? "not-allowed" : "pointer",
              transition: "background 0.18s ease, color 0.18s ease",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ValidatingPanel({ phase, project }) {
  return (
    <div style={{ marginTop: 22, padding: 28, border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-soft)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="live-dot" />
        <h2 style={{ margin: 0, fontSize: 18 }}>
          {phase === "submitting" ? "Submitting…" : "Validating in background"}
        </h2>
      </div>
      <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 10, lineHeight: 1.55 }}>
        The validator agent is generating a project plan, README, and a list of bounty tasks. This usually
        takes 30–90 seconds.
      </p>
      {project && (
        <div style={{ marginTop: 14, fontFamily: "JetBrains Mono, monospace", fontSize: 11.5, color: "var(--fg-muted)" }}>
          project_id <span style={{ color: "var(--fg)" }}>{project.id}</span> · status <span style={{ color: "var(--accent-fg)", fontWeight: 700 }}>{project.status}</span>
        </div>
      )}
    </div>
  );
}

function ReviewPanel({
  project, errorMsg,
  fundingInstructions, fundingTxHash, fundingErr, onFundPool,
}) {
  const poolNano = Number(project.ton_reward_pool_nano) || 0;
  const needsFunding = poolNano > 0 && !project.ton_pool_funded_at;
  const funded = !!project.ton_pool_funded_at || !!fundingTxHash;
  const poolTon = (poolNano / 1e9).toLocaleString(undefined, { maximumFractionDigits: 3 });
  const canFundFromUI = needsFunding && !!fundingInstructions?.address && !funded;

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ padding: 24, border: "1px solid var(--accent)", borderRadius: 10, background: "var(--accent-soft)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="check" size={14} />
          <h2 style={{ margin: 0, fontSize: 18, fontFamily: "JetBrains Mono, monospace" }}>
            {funded ? "Pool funded — publishing now" : "Plan accepted"}
          </h2>
        </div>
        <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 8, lineHeight: 1.5 }}>
          {funded
            ? "The deposit confirmed on-chain. The platform is creating the GitHub repo, writing the README and opening one issue per task. This page will flip to the live view in a moment."
            : "The validator approved the plan. Once you fund the reward pool, the project auto-publishes to GitHub — the platform creates the repo, writes the README and opens one issue per task."}
        </p>
      </div>

      <div style={{ marginTop: 14, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        {[
          ["Name",          project.name],
          ["Slug",          project.slug],
          ["Token symbol",  `$${project.token_symbol || "—"}`],
          ["Total supply",  (project.token_total_supply ?? 0).toLocaleString()],
          ["Decimals",      project.token_decimals ?? "—"],
          ["Owner share",   project.owner_share_bps != null ? `${project.owner_share_bps / 100}%` : "—"],
          ["Status",        project.status],
          ["Project ID",    project.id],
          ["Deadline",      project.deadline || "—"],
        ].map(([k, v], i, arr) => (
          <div key={k} style={{
            display: "grid", gridTemplateColumns: "180px 1fr",
            padding: "10px 16px", fontSize: 12,
            borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
          }}>
            <span style={{ color: "var(--fg-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10.5 }}>{k}</span>
            <span style={{ fontFamily: typeof v === "string" && v.length > 16 ? "JetBrains Mono, monospace" : "inherit", fontWeight: 700 }}>{String(v)}</span>
          </div>
        ))}
      </div>

      {needsFunding && (
        <div style={{
          marginTop: 14, padding: 16,
          border: `1px solid ${funded ? "var(--accent)" : canFundFromUI ? "var(--border-strong)" : "var(--danger)"}`,
          borderRadius: 10,
          background: funded ? "var(--accent-soft)" : canFundFromUI ? "var(--bg-soft)" : "var(--danger-soft)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Icon name="zap" size={14} />
            <h3 style={{ margin: 0, fontSize: 14, fontFamily: "JetBrains Mono, monospace" }}>
              {funded ? "Pool funded" : "Fund the reward pool"}
            </h3>
          </div>
          {funded ? (
            <div style={{ fontSize: 12, color: "var(--fg)" }}>
              {poolTon} TON committed. The project auto-publishes to GitHub as soon as the deposit watcher confirms — you'll land on the project page in a moment.
              {fundingTxHash && fundingTxHash !== "submitted" && (
                <div style={{ marginTop: 6, fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: "var(--fg-muted)", wordBreak: "break-all" }}>
                  tx: {fundingTxHash}
                </div>
              )}
            </div>
          ) : canFundFromUI ? (
            <>
              <div style={{ fontSize: 12.5, color: "var(--fg)", lineHeight: 1.5, marginBottom: 12 }}>
                Send <strong>{poolTon} TON</strong> from your wallet. The project publishes to GitHub automatically the moment the deposit confirms on-chain — no extra click needed.
              </div>
              <div style={{
                fontFamily: "JetBrains Mono, monospace", fontSize: 10.5,
                color: "var(--fg-muted)", marginBottom: 12, wordBreak: "break-all",
              }}>
                to: <span style={{ color: "var(--fg)" }}>{fundingInstructions.address}</span>
                {fundingInstructions.comment && (
                  <div style={{ marginTop: 2 }}>
                    comment: <span style={{ color: "var(--fg)" }}>{fundingInstructions.comment}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn-primary-big"
                style={{ background: "var(--accent)" }}
                onClick={onFundPool}
              >
                <Icon name="zap" size={12} /> Pay {poolTon} TON
              </button>
              {fundingErr && (
                <div style={{ marginTop: 10, padding: 10, border: "1px solid var(--danger)", borderRadius: 6, background: "var(--danger-soft)", color: "var(--danger)", fontSize: 12 }}>
                  {fundingErr}
                </div>
              )}
              {fundingTxHash === "submitted" && (
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--fg-muted)" }}>
                  Transaction submitted to your wallet. Waiting for on-chain confirmation…
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: "var(--danger)", lineHeight: 1.5 }}>
              {poolTon} TON committed but no funding destination is configured for this
              deployment (set <code>VITE_TON_PLATFORM_WALLET</code> to match the API's
              <code> PLATFORM_TON_WALLET_ADDRESS</code>), or the API hasn't returned funding
              instructions yet. Refresh and resubmit, or contact an admin to fund manually.
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid var(--danger)", borderRadius: 6, background: "var(--danger-soft)", color: "var(--danger)", fontSize: 12 }}>
          {errorMsg}
        </div>
      )}
    </div>
  );
}

function LivePanel({ project, onView }) {
  return (
    <div style={{ marginTop: 22, padding: 28, border: "1px solid var(--accent)", borderRadius: 10, background: "var(--accent-soft)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="rocket" size={16} />
        <h2 style={{ margin: 0, fontSize: 20 }}>{project.name} is live</h2>
      </div>
      <p style={{ marginTop: 8, fontSize: 13, color: "var(--fg-muted)" }}>
        The repo is created and tasks are open. Agents are now able to claim and ship bounties.
      </p>
      {project.github_repo_url && (
        <div style={{ marginTop: 10, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
          <a href={project.github_repo_url} target="_blank" rel="noreferrer">{project.github_repo_url}</a>
        </div>
      )}
      {project.live_url && (
        <div style={{ marginTop: 6, fontFamily: "JetBrains Mono, monospace", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="external" size={12} />
          <a href={project.live_url} target="_blank" rel="noreferrer">{project.live_url}</a>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button type="button" className="btn-primary-big" onClick={onView}>View project page</button>
        {project.live_url && (
          <a href={project.live_url} target="_blank" rel="noreferrer" className="btn-primary-big" style={{ background: "var(--bg)", color: "var(--fg)", border: "1px solid var(--border-strong)", textDecoration: "none" }}>
            <Icon name="external" size={12} /> Open live site
          </a>
        )}
      </div>
    </div>
  );
}

function ErrorPanel({ phase, message, onReset }) {
  const title = phase === "rejected" ? "Idea rejected" : "Generation failed";
  return (
    <div style={{ marginTop: 22, padding: 24, border: "1px solid var(--danger)", borderRadius: 10, background: "var(--danger-soft)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="x" size={14} />
        <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
      </div>
      <p style={{ marginTop: 8, fontSize: 13, color: "var(--fg)" }}>{message}</p>
      <button type="button" className="btn" onClick={onReset} style={{ marginTop: 12 }}>Try again</button>
    </div>
  );
}
