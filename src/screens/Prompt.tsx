// Prompt — entry hero: "What should your bot do?"
// Top row: user avatar + theme switcher (no logo); centered title/subtitle.
import { useEffect, useRef } from 'react';
import { Theme, btnReset } from '../theme';
import { TgUser } from '../telegram';
import { TGIcon } from '../ui';

// Each example is a short button (title + blurb) that drops a rich, detailed
// brief into the prompt box. That brief is what gets sent verbatim as the
// first message to the builder AI — a fuller brief means a more
// production-ready bot and fewer clarifying questions.
export type IdeaExample = { title: string; blurb: string; prompt: string };

export const IDEA_EXAMPLES: IdeaExample[] = [
  {
    title: 'TON price alerts',
    blurb: 'Watchlist, threshold pings, morning summary, quiet hours',
    prompt:
      'I want a Telegram bot that watches Toncoin and TON jettons like USDT and GRAM and pings me the moment something important moves. Each person keeps their own private watchlist — add or remove coins with simple inline buttons — so the bot only follows what they actually care about. I want threshold alerts in plain language: tell me when TON drops below a price I set, or when anything jumps or falls more than 5% within an hour. Give me an on-demand "price now" check, plus an optional morning summary of where my coins stand. Add quiet hours so it never wakes me at night, and please don\'t spam — if a coin keeps wobbling around my threshold, send one clear alert, not fifty. Every message should say exactly what changed and by how much. If a price source hiccups, stay calm and retry instead of sending garbage. Handle typos and odd input gracefully, keep each person\'s settings private, and give me an owner view of who\'s using it and which alerts fire most.',
  },
  {
    title: 'Daily AI news digest',
    blurb: 'Curated morning AI news, summarized, deduped, on-demand',
    prompt:
      'I want a Telegram bot that greets me each morning with a clean, skimmable digest of the freshest AI and Telegram-bot news, so I never have to dig through a dozen sites myself. When someone first opens it, let them pick the topics and keywords they care about — model launches, funding rounds, new bots, research — and set the time their digest arrives. Each morning, send a short rundown: a punchy headline, two or three sentences on what happened, and a link to read more. If the same story shows up across several sources, merge it into one entry instead of repeating it. Add a "what\'s new" button for an on-demand pull between digests, and let readers tap to bookmark items they want to revisit. Make it easy to add or drop sources and mute topics that get noisy. Above all, it should never miss a day, quietly skip any source that\'s down rather than breaking, and keep things tight — a handful of strong items, not an endless wall of links.',
  },
  {
    title: 'Trip expense splitter',
    blurb: 'Shared expenses, fair splits, settle up in TON',
    prompt:
      'I want a Telegram bot that splits expenses for a group trip, so nobody has to chase friends for money or do the math by hand. I start a trip, add everyone who\'s in it, and then anyone can log an expense — who paid, how much, and what it was for — split evenly or by custom shares when only some of us were in on it. The bot keeps a running tally of who owes whom, simplified down to the fewest payments, and I can check the balance any time with a tap. When it\'s time to settle, let people pay each other back in TON straight from their wallet, then mark the debt cleared once it lands. Handle the awkward stuff gracefully: round amounts so balances always net to zero, never lose an expense someone logged, and cope with people joining or leaving partway through the trip. Always confirm before marking a debt settled, keep each group\'s amounts private to its members, and give the organizer a clean overview of the whole trip.',
  },
  {
    title: 'Restaurant table booking',
    blurb: 'Live slots, reminders, easy reschedule, refundable deposits',
    prompt:
      'I want a Telegram bot that takes table reservations for my restaurant, Durger King. A guest starts with a tap, picks a date, a time, and how many people are coming, and the bot only ever shows slots that are actually open — it checks real availability against my tables and never offers a time that\'s already full. Once they choose, it confirms the booking right away with a warm, clear message they can trust, then sends a gentle reminder a couple of hours before they\'re due. Guests can cancel or reschedule straight from inline buttons, no need to message me. For bigger parties, let me hold the table with a small refundable TON deposit that comes back when they arrive. On my side I need an owner view of all upcoming bookings, the day\'s table capacity, and a heads-up on no-shows, so we never double-book or get caught overbooked. Keep it forgiving when someone types something odd, private with guest details, and friendly at every step.',
  },
];

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.max(70, el.scrollHeight) + 'px';
}

// circular user avatar (photo > initials) with an online dot
function Avatar({ T, user }: { T: Theme; user?: TgUser | null }) {
  return (
    <div style={{ position: 'relative', width: 38, height: 38 }}>
      {user?.photoUrl ? (
        <img src={user.photoUrl} alt="" style={{ width: 38, height: 38, borderRadius: 999, objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{
          width: 38, height: 38, borderRadius: 999, background: T.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: '#fff', letterSpacing: 0.2,
        }}>
          {user?.initials || <TGIcon name="user" size={19} color="#fff" stroke={2} />}
        </div>
      )}
      <span style={{
        position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: 999,
        background: T.green, border: `2px solid ${T.pageBg}`,
      }} />
    </div>
  );
}

export function PromptScreen({ T, idea, setIdea, changed, user, onToggleTheme, error }: {
  T: Theme; idea: string; setIdea: (v: string) => void; changed: boolean;
  user?: TgUser | null; onToggleTheme: () => void; error?: string | null;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { autoGrow(taRef.current); }, [idea]);
  return (
    <div style={{ padding: '12px 18px 20px', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* avatar · theme switcher */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <Avatar T={T} user={user} />
        <button onClick={onToggleTheme} style={{
          ...btnReset, width: 38, height: 38, borderRadius: 999,
          background: T.dark ? 'rgba(255,255,255,0.07)' : 'rgba(15,22,32,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <TGIcon name={T.dark ? 'sun' : 'moon'} size={18} color={T.sub} stroke={1.9} />
        </button>
      </div>

      {changed && (
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 13px', borderRadius: 12, marginBottom: 16,
          background: T.accentSoft, border: `1px solid ${T.accentBorder}`,
        }}>
          <TGIcon name="refresh" size={17} color={T.accent} stroke={2} />
          <span style={{ fontFamily: T.font, fontSize: 13.5, color: T.text, lineHeight: '18px' }}>
            Edit your idea below — I'll rebuild and re-test from here.
          </span>
        </div>
      )}

      <div style={{ fontFamily: T.font, fontSize: 27, fontWeight: 700, color: T.text, letterSpacing: -0.5, lineHeight: '32px', textAlign: 'center' }}>
        What should your<br />bot do?
      </div>
      <div style={{ fontFamily: T.font, fontSize: 15, color: T.sub, marginTop: 8, lineHeight: '21px', textAlign: 'center' }}>
        Describe your idea in plain words — you can refine it next.
      </div>

      <div style={{
        marginTop: 18, borderRadius: 18, background: T.cardBg, border: `1.5px solid ${idea ? T.accentBorder : T.sep}`,
        boxShadow: T.shadow, padding: 16, transition: 'border-color .2s',
      }}>
        <textarea
          ref={taRef} value={idea} onChange={e => setIdea(e.target.value)} rows={3}
          placeholder="e.g. A bot that lets my customers track their orders and chat with support…"
          style={{
            width: '100%', resize: 'none', border: 'none', outline: 'none', background: 'transparent',
            fontFamily: T.font, fontSize: 16, lineHeight: '23px', color: T.text, padding: 0, minHeight: 70,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontFamily: T.mono, fontSize: 12, color: T.hint }}>{idea.trim().length} chars</span>
          <span style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint }}>Plain language is fine</span>
        </div>
      </div>

      {error && (
        <div style={{ fontFamily: T.font, fontSize: 13, color: T.amber, lineHeight: '18px', marginTop: 10, padding: '0 4px' }}>
          Couldn't start — {error}. Tap the button to retry.
        </div>
      )}

      <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3, margin: '22px 4px 11px' }}>
        Or start from an idea
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {IDEA_EXAMPLES.map((ex, i) => (
          <button key={i} onClick={() => setIdea(ex.prompt)} style={{
            ...btnReset, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
            borderRadius: 13, background: T.dark ? 'rgba(255,255,255,0.04)' : '#ffffff',
            border: `0.5px solid ${T.sep}`, boxShadow: T.shadow,
          }}>
            <TGIcon name="spark" size={17} color={T.accent} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: T.text, lineHeight: '19px' }}>{ex.title}</span>
              <span style={{ display: 'block', fontFamily: T.font, fontSize: 12.5, color: T.hint, lineHeight: '16px', marginTop: 2 }}>{ex.blurb}</span>
            </span>
            <TGIcon name="arrowUp" size={15} color={T.hint} stroke={2} />
          </button>
        ))}
      </div>
    </div>
  );
}
