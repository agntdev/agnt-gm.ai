// Bot-initiate interstitial for the project page.
//
// Renders only when:
//  - the project is `live` (orchestrator picked it up), AND
//  - the project isn't `published` yet (BotCard owns the published case), AND
//  - the managed-bot poller hasn't yet landed the project_bot row.
//
// Click flow: POST /bot/initiate → backend records the suggested username
// and returns the manager-bot deeplink. We open the deeplink in a new
// tab (the user is already inside Telegram — the link opens the
// pre-filled child-bot creation screen via Bot API 9.6's
// t.me/newbot/{manager}/{suggested_username} format). The poller
// eventually captures the bot row; meanwhile this banner polls /bot
// every 10s and self-hides when the row appears.
//
// Note on the suggested username: the orchestrator does NOT pre-populate
// `live.suggested_bot_username`. We work around that by eagerly calling
// /bot/initiate on mount (idempotent — returns the same username on
// repeat calls, or a fresh one if the previous was claimed). This
// keeps the banner visible at the right phase without depending on
// orchestrator wiring.

import { useEffect, useState } from "react";
import { Icon } from "./atoms.jsx";
import { api } from "../lib/api.js";

export default function BotInitiationBanner({ live, token }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [botReady, setBotReady] = useState(false);
  const [pollDisabled, setPollDisabled] = useState(false);
  const [username, setUsername] = useState(live?.suggested_bot_username || null);
  const [deepLink, setDeepLink] = useState(null);

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

  // Eagerly pre-call /bot/initiate on mount IF the project doesn't
  // already have a suggested username. The endpoint is idempotent —
  // it returns the same username on repeat calls, or a fresh one
  // with a new random tail if the previous was claimed. This is what
  // surfaces the suggested @username in the banner UI without
  // requiring the orchestrator to pre-populate the field.
  //
  // Guard is `username` only (not a separate "pending" flag) — adding
  // a pending flag to the dep array triggers a re-render mid-flight
  // that cancels the in-flight call before it resolves. The username
  // guard is sufficient: once the response lands, `setUsername` flips
  // the dep and the effect short-circuits.
  useEffect(() => {
    if (!live?.slug || username || !token) return undefined;
    let cancelled = false;
    api
      .initiateBot(live.slug, token)
      .then((res) => {
        if (cancelled) return;
        if (res?.ok && res?.data) {
          setUsername(res.data.suggested_username || null);
          setDeepLink(res.data.deep_link || null);
        }
      })
      .catch(() => {
        // Non-fatal — the user can still click the button to retry
      });
    return () => {
      cancelled = true;
    };
  }, [live?.slug, token, username]);

  // Hide conditions: bot row already exists (BotCard takes over), or
  // the project is published (BotCard also takes over), or the
  // project isn't even live yet (no point asking the user to confirm
  // before the orchestrator has picked the project up). We DO NOT
  // require the suggested username to be pre-set — we populate it
  // ourselves via the eager /bot/initiate call above.
  if (pollDisabled) return null;
  if (botReady) return null;
  if (!live) return null;
  if (live.status !== "live") return null;

  async function onConfirm() {
    if (!token) {
      setErr("Sign in as the project owner to confirm the bot identity.");
      return;
    }
    setBusy(true);
    setErr("");

    // Use a cached deep_link from the eager pre-call when available;
    // otherwise (or if the cached one is stale) re-call /bot/initiate
    // now. The endpoint is idempotent.
    let link = deepLink;
    if (!link) {
      const res = await api.initiateBot(live.slug || live.id, token);
      if (!res?.ok) {
        setBusy(false);
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
      link = res?.data?.deep_link;
      if (res?.data?.suggested_username) {
        setUsername(res.data.suggested_username);
      }
      setDeepLink(link);
    }
    setBusy(false);

    // Open the deeplink. window.open is the right call for both the
    // TMA in Telegram (opens the bot creation screen in Telegram's
    // tab UI) and the TMA on web.telegram.org (opens in a new tab).
    // In a plain Chrome browser with no Telegram context, this just
    // opens t.me/newbot/... in a new tab — still useful, since the
    // user can paste the username into Telegram manually.
    if (link && typeof window !== "undefined") {
      window.open(link, "_blank", "noopener,noreferrer");
    } else {
      setErr("Server didn't return a deeplink. Try again.");
    }
  }

  // The handle placeholder. While the eager /bot/initiate is in
  // flight, show an ellipsis. After it resolves, show the real
  // username. If the user is not authed, the username is null and
  // we show a generic "your project's bot" message.
  const handlePlaceholder = username
    ? `@${username}`
    : live?.slug
      ? `@${live.slug}_bot`
      : "@your-project_bot";

  return (
    <div className="bot-initiation">
      <div className="bot-initiation-icon" aria-hidden="true">
        <Icon name="bot" size={18} />
      </div>
      <div className="bot-initiation-body">
        <div className="bot-initiation-eyebrow">Confirm your bot identity</div>
        <div className="bot-initiation-title">
          Telegram will create{" "}
          <code className="bot-initiation-handle">{handlePlaceholder}</code>{" "}
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
