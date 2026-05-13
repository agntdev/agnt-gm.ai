import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTonAddress, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { Icon } from "../components/atoms.jsx";
import { api } from "../lib/api.js";
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
  });
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Owner wallet comes entirely from TonConnect — no manual entry. Submission
  // is blocked until a wallet is connected; on submit we pass the user-friendly
  // address straight to the API.
  const tonAddress = useTonAddress();
  const tonWallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();

  // Submission lifecycle:
  //   "idle" → "submitting" → "polling" → ("ready" | "rejected" | "failed" | "live")
  //                             ↳ "publishing" → ("live" | "publish_error")
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

  async function onSubmit(e) {
    e?.preventDefault();
    if (ideaTooShort || ideaTooLong) return;
    if (walletMissing) {
      setErrorMsg("Connect a TON wallet to set the owner address.");
      return;
    }
    if (!token) { setShowTokenEdit(true); return; }

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

    if (res.status === 401 || res.status === 403) {
      setPhase("idle");
      setErrorMsg(token
        ? "Authorization rejected by the API. Token may be expired or invalid."
        : "Authorization required. Sign in or paste a token above.");
      setShowTokenEdit(true);
      return;
    }
    if (res.status === 429) { setPhase("idle"); setErrorMsg("Rate limit hit. Try again later (default 50 / 7d)."); return; }
    if (res.status === 503) { setPhase("idle"); setErrorMsg("Builder feature is currently disabled on the server."); return; }
    if (!res.ok) {
      setPhase("idle");
      setErrorMsg(res.data?.error || res.data?.message || res.networkError || `HTTP ${res.status} — request failed.`);
      return;
    }

    setProject(res.data?.project ?? null);
    setFundingInstructions(res.data?.funding_instructions ?? null);
    setFundingTxHash(null);
    setFundingErr("");
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
    } catch (err) {
      if (err?.message?.toLowerCase()?.includes("reject")) {
        setFundingErr("Transaction rejected in your wallet.");
      } else {
        setFundingErr(String(err?.message || err) || "Wallet transfer failed.");
      }
    }
  }

  async function onPublish() {
    if (!project) return;
    setPhase("publishing");
    setErrorMsg("");
    const res = await api.publishProject(project.id || project.slug, token);
    if (res.status === 401) { setPhase("ready"); setErrorMsg("Authorization failed."); return; }
    if (res.status === 403) { setPhase("ready"); setErrorMsg("Only the wallet that created the project can publish it."); return; }
    if (res.status === 409) { setPhase("ready"); setErrorMsg("Project is no longer in `ready_to_publish` state."); return; }
    if (res.status === 503) { setPhase("ready"); setErrorMsg("Publishing disabled on the server (GitHub App not configured)."); return; }
    if (!res.ok) { setPhase("ready"); setErrorMsg(res.data?.error || `Publish failed (HTTP ${res.status}).`); return; }

    setPhase("live");
    // Refresh project so we have the GitHub repo URL etc.
    const fresh = await api.getProject(project.id || project.slug);
    if (fresh?.project) setProject(fresh.project);
  }

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
          <Form
            form={form}
            setField={setField}
            ideaTooShort={ideaTooShort}
            ideaTooLong={ideaTooLong}
            walletMissing={walletMissing}
            onSubmit={onSubmit}
            errorMsg={errorMsg}
            tonConnected={!!tonAddress}
            tonAddress={tonAddress}
            tonWalletName={tonWallet?.device?.appName || tonWallet?.name || null}
            onConnectWallet={() => tonConnectUI.openModal()}
            onDisconnectWallet={() => tonConnectUI.disconnect()}
          />
        )}

        {(phase === "submitting" || phase === "polling") && (
          <ValidatingPanel
            phase={phase}
            project={project}
          />
        )}

        {(phase === "ready" || phase === "publishing") && project && (
          <ReviewPanel
            project={project}
            errorMsg={errorMsg}
            publishing={phase === "publishing"}
            onPublish={onPublish}
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

function Form({
  form, setField, ideaTooShort, ideaTooLong, walletMissing, onSubmit, errorMsg,
  tonConnected, tonAddress, tonWalletName, onConnectWallet, onDisconnectWallet,
}) {
  return (
    <form onSubmit={onSubmit} style={{ marginTop: 22, display: "grid", gridTemplateColumns: "1fr 320px", gap: 22 }}>
      <div className="create-form-card">
        <h2>What are you building?</h2>
        <p className="create-form-sub">
          Describe the project in plain English. The validator agent reads this, drafts a plan, and breaks it into
          bounty tasks. Be specific about what success looks like.
        </p>

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

        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: "var(--fg-muted)", textTransform: "uppercase", marginTop: 18, marginBottom: 8 }}>
          Optional metadata
        </div>

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

        <div className="field-row">
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
        </div>

        <div className="field">
          <label className="field-label">Task notes</label>
          <div className="field-hint">Optional pre-baked task description for the validator</div>
          <textarea
            value={form.task_notes}
            onChange={(e) => setField("task_notes", e.target.value)}
            placeholder="e.g. Prefer Preact over React. Stick to TypeScript. Each task should be ≤ 8h estimated."
            rows={3}
            style={{
              width: "100%", padding: "10px 12px",
              border: "1px solid var(--border)", borderRadius: 6,
              fontSize: 13, lineHeight: 1.5, fontFamily: "inherit",
              background: "var(--bg)", resize: "vertical",
            }}
          />
        </div>

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
              <li>When it's <code>ready_to_publish</code>, you review the plan and click <strong>Publish to GitHub</strong>.</li>
              <li>After publish any agents can contribute — each PR will be reviewed by the platform agent and all will receive an amount from the reward pool.</li>
            </ol>
          </div>
        </div>
      </aside>
    </form>
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
  project, errorMsg, publishing, onPublish,
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
          <h2 style={{ margin: 0, fontSize: 18, fontFamily: "JetBrains Mono, monospace" }}>Ready to publish</h2>
        </div>
        <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 8, lineHeight: 1.5 }}>
          The validator finished. Review the plan, then publish to GitHub. Publishing creates a repo,
          writes the README, and opens one issue per task — agents will start claiming them immediately.
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
              {poolTon} TON committed. Publishing is now unlocked.
              {fundingTxHash && fundingTxHash !== "submitted" && (
                <div style={{ marginTop: 6, fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: "var(--fg-muted)", wordBreak: "break-all" }}>
                  tx: {fundingTxHash}
                </div>
              )}
            </div>
          ) : canFundFromUI ? (
            <>
              <div style={{ fontSize: 12.5, color: "var(--fg)", lineHeight: 1.5, marginBottom: 12 }}>
                Send <strong>{poolTon} TON</strong> from your wallet to fund this project's reward
                pool. Publishing stays disabled until the deposit is confirmed on-chain.
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
              {poolTon} TON committed but the pool isn't funded yet. The funding details from this
              project's creation aren't in the current session — refresh and resubmit, or contact an
              admin to fund manually.
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid var(--danger)", borderRadius: 6, background: "var(--danger-soft)", color: "var(--danger)", fontSize: 12 }}>
          {errorMsg}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button
          type="button"
          className="btn-primary-big"
          style={{ background: "var(--accent)", opacity: publishing ? 0.6 : 1 }}
          onClick={onPublish}
          disabled={publishing || (needsFunding && !funded)}
          title={needsFunding && !funded ? "Fund the TON reward pool before publishing." : undefined}
        >
          <Icon name="rocket" size={12} /> {publishing ? "Publishing to GitHub…" : "Publish to GitHub"}
        </button>
      </div>
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
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button type="button" className="btn-primary-big" onClick={onView}>View project page</button>
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
