// Bot-initiate interstitial for the project page.
//
// Renders only when:
//  - the backend has recorded a `suggested_bot_username` on the project
//    (i.e. the user has clicked "start" at least once, OR the orchestrator
//    pre-populated it), AND
//  - the managed-bot poller hasn't yet landed the project_bot row, AND
//  - the project isn't `published` yet (BotCard owns the published case).
//
// Click flow: POST /bot/initiate → backend records the suggested username
// and returns the manager-bot deeplink. We open the deeplink in a new
// tab (the user is already inside Telegram — the link opens the
// manager bot's chat with the ManagedBot pre-fill). The poller
// eventually captures the bot row; meanwhile this banner polls /bot
// every 10s and self-hides when the row appears.

import { useEffect, useState } from "react";
import { Icon } from "./atoms.jsx";
import { api } from "../lib/api.js";

export default function BotInitiationBanner({ live, token }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [botReady, setBotReady] = useState(false);
  const [pollDisabled, setPollDisabled] = useState(false);

  // Poll /bot while the banner is visible. 10s cadence while waiting
  // for the user to come back from Telegram; auto-hides when the
  // managed-bot poller lands the row.
  useEffect(() => {
    if (!live?.slug || pollDisabled) return undefined;
    let cancelled = false;
    let timer = null;
    const tick = async () => {
      const res = await api.getProjectBot(live.slug);
      if (cancelled) return;
      if (res && res.bot_username) {
        setBotReady(true);
        return; // bot row landed; banner will hide on next render
      }
      timer = setTimeout(tick, 10000);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [live?.slug, pollDisabled]);

  // Hide conditions: no suggested username yet, or the bot row already
  // exists (BotCard takes over), or the project is published (BotCard
  // also takes over), or the project isn't even live yet (no point
  // asking the user to confirm before the orchestrator has picked the
  // project up).
  if (pollDisabled) return null;
  if (botReady) return null;
  if (!live) return null;
  if (live.current_phase === "published") return null;
  if (live.status !== "live") return null;
  if (!live.suggested_bot_username) return null;

  async function onConfirm() {
    if (!token) {
      setErr("Sign in as the project owner to confirm the bot identity.");
      return;
    }
    setBusy(true);
    setErr("");
    const res = await api.initiateBot(live.slug || live.id, token);
    setBusy(false);
    if (!res?.ok) {
      const code = res?.status;
      if (code === 401 || code === 403) {
        setErr("Sign in as the project owner to confirm the bot identity.");
      } else if (code === 409) {
        // The bot row already exists. Stop polling — the banner is
        // moot; BotCard will pick it up on its own poll.
        setErr("Bot already provisioned — refreshing.");
        setPollDisabled(true);
        return;
      } else if (code === 503) {
        setErr(
          "Bot creation isn't enabled on this deployment. An admin needs to set MANAGER_BOT_TOKEN and MANAGER_BOT_USERNAME.",
        );
      } else {
        setErr(
          res?.data?.error ||
            res?.networkError ||
            `HTTP ${code || "?"} — request failed.`,
        );
      }
      return;
    }
    // Open the deeplink. window.open is fine — the TMA is inside
    // Telegram already, so this opens the manager bot's chat
    // alongside the mini app (in Telegram's tab UI) or in a new
    // browser tab if the user is on web.telegram.
    const link = res?.data?.deep_link;
    if (link && typeof window !== "undefined") {
      window.open(link, "_blank", "noopener,noreferrer");
    } else {
      setErr("Server didn't return a deeplink. Try again.");
    }
  }

  return (
    <div className="bot-initiation">
      <div className="bot-initiation-icon" aria-hidden="true">
        <Icon name="bot" size={18} />
      </div>
      <div className="bot-initiation-body">
        <div className="bot-initiation-eyebrow">Confirm your bot identity</div>
        <div className="bot-initiation-title">
          Telegram will create{" "}
          <code className="bot-initiation-handle">
            @{live.suggested_bot_username}
          </code>{" "}
          for your project.
        </div>
        <div className="bot-initiation-sub">
          The bot is built from the agent swarm's code and deployed
          automatically — you just need to give Telegram the one-tap
          consent. This is the only interaction Telegram requires from you.
        </div>
        {err && (
          <div className="bot-initiation-err" role="alert">
            {err}
          </div>
        )}
        <button
          type="button"
          className="btn btn-accent bot-initiation-cta"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? (
            <>
              <span className="bot-card-spinner" aria-hidden="true" /> Opening Telegram…
            </>
          ) : (
            <>
              <Icon name="bot" size={14} /> Tap to confirm in Telegram
            </>
          )}
        </button>
      </div>
    </div>
  );
}
