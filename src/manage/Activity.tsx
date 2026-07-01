// Activity — the bot's event feed, rendered as a vertical timeline (coloured
// dots joined by a rail) on the "View all" page. Events are the chat's
// role=system messages (build/deploy + bot-runtime events). Also home of the
// shared relTime() helper (the overview imports it for uptime/footers).
import { useEffect, useState } from 'react';
import { Theme } from '../theme';
import { ChatMessage, Deployment, listDeployments } from '../api/client';
import { Card, Dot } from '../ui';
import { MyBot } from './MyBots';
import { Lang, tr, useT, useLang } from '../i18n';

// Turn a deployment into a timeline event so deploys show up alongside the
// chat's system events. Skips rows with no timestamp (can't place on the rail).
function deployEvent(d: Deployment, i: number, lang: Lang): ChatMessage | null {
  const when = d.deployed_at || d.built_at || d.queued_at;
  if (!when) return null;
  const prod = d.kind !== 'preview';
  const failed = !!d.failure_reason || /fail|error|cancel/i.test(d.status || '');
  const content = failed
    ? `🔴 ${tr(lang,
        prod ? 'Production deploy failed' : 'Preview deploy failed',
        prod ? 'Ошибка деплоя (продакшн)' : 'Ошибка деплоя (превью)')}${d.failure_reason ? ` — ${d.failure_reason}` : ''}`
    : (d.deployed_at || d.built_at)
      ? `🚀 ${tr(lang,
          prod ? 'Deployed to production' : 'Deployed to preview',
          prod ? 'Развёрнут в продакшн' : 'Развёрнут в превью')}`
      : `🏗️ ${tr(lang,
          prod ? 'Deploying to production…' : 'Deploying to preview…',
          prod ? 'Разворачивается в продакшн…' : 'Разворачивается в превью…')}`;
  return { id: -1 - i, role: 'system', content, created_at: when }; // negative id: no clash with message ids
}

// Merge deployment events into the chronological (oldest-first) system feed.
// Callers reverse/slice as before, so newest-first ordering still holds.
function withDeployments(sys: ChatMessage[], deploys: Deployment[], lang: Lang = 'en'): ChatMessage[] {
  const dep = deploys.map((d, i) => deployEvent(d, i, lang)).filter((e): e is ChatMessage => !!e);
  if (dep.length === 0) return sys;
  return [...sys, ...dep].sort((a, b) =>
    new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
}

// relative "2m / 11m / 1h / 21d" (RU: «сейчас / 2м / 1ч / 21д») — shared with
// the overview (uptime, usage footer) and the task screens (blocked-since).
export function relTime(iso?: string, lang: Lang = 'en'): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return tr(lang, 'now', 'сейчас');
  if (s < 3600) return `${Math.floor(s / 60)}${tr(lang, 'm', 'м')}`;
  if (s < 86400) return `${Math.floor(s / 3600)}${tr(lang, 'h', 'ч')}`;
  return `${Math.floor(s / 86400)}${tr(lang, 'd', 'д')}`;
}

// hoisted out of eventTone so they aren't recreated on every event (js-hoist-regexp)
const RE_FAIL = /\bfail|error|crash|🔴|❌|✗/i;
const RE_ESCALATE = /escalat|human|⚠️|🟠|blocked|needs? (a )?human/i;
const RE_RESOLVE = /resolv|✅|🟢|passing|succeed|success|complete/i;

// dot colour by event kind — matches the mock: resolved=green, command/ship=
// blue, escalation=amber, failure=red.
function eventTone(m: ChatMessage, T: Theme): string {
  const c = m.content;
  if (RE_FAIL.test(c)) return T.red;
  if (RE_ESCALATE.test(c)) return T.amber;
  if (RE_RESOLVE.test(c)) return T.green;
  return T.accent;
}

// first line of the event — the timeline title; the rest (if any) is dropped
// for the compact preview and kept on the full page.
function title(m: ChatMessage): string {
  const line = (m.content || '').split('\n')[0].trim();
  return line || m.content || '—';
}

function ActivityTimeline({ T, events }: { T: Theme; events: ChatMessage[] }) {
  const t = useT();
  const { lang } = useLang();
  if (events.length === 0) {
    return (
      <div style={{ fontFamily: T.font, fontSize: 13.5, color: T.hint, lineHeight: '19px' }}>
        {t('No events yet — they appear as the bot works and ships.',
          'Событий пока нет — они появятся, когда бот начнёт работать и выкатывать обновления.')}
      </div>
    );
  }
  return (
    <div>
      {events.map((m, i) => {
        const last = i === events.length - 1;
        const tone = eventTone(m, T);
        return (
          <div key={m.id} style={{ display: 'flex', gap: 13 }}>
            {/* rail: dot + connector down to the next event */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 10, flexShrink: 0 }}>
              <Dot color={tone} size={9} />
              {!last && <div style={{ flex: 1, width: 2, borderRadius: 2, background: T.sep, marginTop: 5, minHeight: 22 }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 18 }}>
              <div style={{ fontFamily: T.font, fontSize: 14.5, color: T.text, lineHeight: '19px' }}>{title(m)}</div>
              <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, marginTop: 3 }}>
                {relTime(m.created_at, lang)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// "View all" page — the complete event history, newest first, in a card.
// Pulls the bot's deployments so deploys appear in the feed alongside chat events.
export function ActivityPage({ T, bot, events }: { T: Theme; bot: MyBot; events: ChatMessage[] }) {
  const t = useT();
  const { lang } = useLang();
  const [deploys, setDeploys] = useState<Deployment[]>([]);
  useEffect(() => {
    let cancelled = false;
    listDeployments(bot.id)
      .then(r => { if (!cancelled) setDeploys(r.deployments || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [bot.id]);
  const ordered = [...withDeployments(events, deploys, lang)].reverse(); // newest first
  return (
    <div style={{ padding: '16px 16px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 4px' }}>
        {bot.name} · {t('activity', 'активность')}
      </div>
      <Card T={T} pad={18}>
        <ActivityTimeline T={T} events={ordered} />
      </Card>
    </div>
  );
}
