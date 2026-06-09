// AGNTDEV managed-bot CTA.
//
// Renders only when the project's current_phase is "published". Shows
// the bot's @username + t.me link (the "your bot is live" moment) when
// the project_bot row exists, or a "provisioning" placeholder while
// the managed-bot auto-capture poller is still landing the row.
//
// Polls every 10s while in provisioning, every 60s once live (status
// changes are slow). Pure presentational — caller passes the slug.

import { useEffect, useState } from "react";
import { Icon } from "./atoms.jsx";
import { api } from "../lib/api.js";

const CONTAINER_TONE = {
  running: "accent",
  stopped: "muted",
  error: "danger",
  none: "muted",
};

function tmeLink(username, startParam) {
  if (!username) return null;
  const base = `https://t.me/${username.replace(/^@/, "")}`;
  return startParam ? `${base}?start=${encodeURIComponent(startParam)}` : base;
}

export default function BotCard({ slug, projectName, compact = false }) {
  const [bot, setBot] = useState(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return undefined;
    let cancelled = false;
    let timer = null;
    const tick = async () => {
      const res = await api.getProjectBot(slug);
      if (cancelled) return;
      if (res && res.bot_username) {
        setBot(res);
        setMissing(false);
        setLoading(false);
        // Bot state changes are slow (deploy/teardown/redeploy).
        timer = setTimeout(tick, 60000);
      } else {
        // 404 (or any null): bot row not yet provisioned.
        setBot(null);
        setMissing(true);
        setLoading(false);
        // Poll hot while we're in the provisioning window.
        timer = setTimeout(tick, 10000);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [slug]);

  if (loading) {
    return (
      <div className={`bot-card bot-card--loading${compact ? " bot-card--compact" : ""}`}>
        <div className="bot-card-spinner" aria-hidden="true" />
        <span>Checking bot status…</span>
      </div>
    );
  }

  // Provisioning state: phase=published but no project_bot row yet.
  if (!bot) {
    return (
      <div className={`bot-card bot-card--provisioning${compact ? " bot-card--compact" : ""}`}>
        <div className="bot-card-icon" aria-hidden="true">
          <span className="phase-state-ring" />
        </div>
        <div className="bot-card-body">
          <div className="bot-card-title">
            Bot provisioning
            {projectName ? <span className="bot-card-for"> for {projectName}</span> : null}
          </div>
          <div className="bot-card-sub">
            The managed-bot flow is creating{" "}
            <code className="bot-card-code">@{missing ? "…" : "?"}</code> on Telegram. This
            usually takes a few seconds after the Tests gate passes.
          </div>
        </div>
      </div>
    );
  }

  // Live state: bot row exists, render the CTA.
  const tone = CONTAINER_TONE[bot.container_state] || "muted";
  const link = tmeLink(bot.bot_username);

  return (
    <div className={`bot-card bot-card--live${compact ? " bot-card--compact" : ""}`}>
      <div className="bot-card-icon bot-card-icon--live" aria-hidden="true">
        <Icon name="bot" size={compact ? 16 : 20} />
      </div>
      <div className="bot-card-body">
        <div className="bot-card-eyebrow">
          <span className={`bot-card-dot bot-card-dot--${tone}`} aria-hidden="true" />
          {bot.container_state === "running" ? "Live" : bot.container_state}
        </div>
        <div className="bot-card-title">
          @{bot.bot_username}
        </div>
        <div className="bot-card-sub">
          Your bot is deployed as a managed container
          {projectName ? <> for <strong>{projectName}</strong></> : null}.
        </div>
      </div>
      <div className="bot-card-actions">
        {link && (
          <a
            className="btn btn-accent bot-card-cta"
            href={link}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="bot" size={14} />
            Open in Telegram
          </a>
        )}
        <div className="bot-card-meta">
          {bot.is_managed ? "managed bot" : "owner token"} · {bot.bot_id}
        </div>
      </div>
    </div>
  );
}
