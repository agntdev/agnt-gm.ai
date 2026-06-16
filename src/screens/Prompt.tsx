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
    title: 'Crypto price alerts',
    blurb: 'Watchlist · threshold & %-move alerts · price check · quiet hours',
    prompt:
      'I want a Telegram bot that watches crypto prices and pings me when something moves. Each person keeps their own private watchlist and adds or removes coins with inline buttons — Bitcoin, Ethereum, Toncoin, or any ticker they type. Support two kinds of alerts: a price threshold ("tell me when BTC drops below $60k") and a percentage move ("tell me when any coin on my list jumps or falls more than 5% in an hour"). Add a /price command for an on-demand check of one coin or my whole list, and an optional morning summary at a time I choose. Include quiet hours so it never alerts me overnight, and don\'t spam — if a coin keeps wobbling around my threshold, send one alert and then cool down for a while instead of firing repeatedly. Every alert should say exactly which coin moved, the old and new price, and the percent change. If a price feed fails, retry quietly instead of sending bad numbers, and handle unknown tickers or typos with a helpful reply. Keep each person\'s watchlist and settings private, and give me an owner view of how many people use it and which alerts fire most.',
  },
  {
    title: 'Restaurant table booking',
    blurb: 'Live availability · instant confirm · reminders · reschedule',
    prompt:
      'I want a Telegram bot that takes table reservations for my restaurant. A guest taps to start, then picks a date, a time, and party size, and the bot only ever offers slots that are genuinely open — it checks real availability against my tables and capacity and never shows a time that\'s already full. As soon as they choose, confirm the booking with a clear message and a short reference code, then send a reminder a couple of hours before. Guests can reschedule or cancel from inline buttons without messaging us. Let me configure the basics — opening hours, how long a sitting lasts, and how many tables and seats I have — so the bot prevents double-booking and overbooking on its own. On my side I need an owner view of all upcoming bookings, today\'s remaining capacity at a glance, and a flag on no-shows. Handle odd or partial input gracefully, keep guest details private, and stay friendly and clear at every step. No payments needed.',
  },
  {
    title: 'Trip expense splitter',
    blurb: 'Group trips · log expenses · who-owes-whom · settle up',
    prompt:
      'I want a Telegram bot that splits expenses for a trip with friends, so nobody has to do the math or chase people for money. It should work inside our group chat: I create a trip, set its currency, and add everyone, then anyone can log an expense — who paid, how much, and what for — split evenly or by custom shares when only some of us were in on it. The bot keeps a running tally of who owes whom, simplified down to the fewest payments, and we can see the balance any time with /balance. When it\'s time to settle, people pay each other back however they like and then mark the debt as paid in the bot, which always asks for a quick confirm before clearing it. Handle the awkward parts: round amounts so balances always net to zero, never lose an expense someone logged, and cope with people joining or leaving partway through. Keep each trip\'s amounts visible only to its members, and give the organizer a clean overview of the whole trip and every expense in it.',
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
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontFamily: T.mono, fontSize: 12, color: T.hint }}>{idea.trim().length} chars</span>
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
