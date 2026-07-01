// Prompt — entry hero: "What should your bot do?"
// Top row: user avatar + theme switcher (no logo); centered title/subtitle.
import { useEffect, useRef, useState } from 'react';
import { Theme, btnReset } from '../theme';
import { TgUser } from '../telegram';
import { TGIcon, Spinner, Wordmark } from '../ui';

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
  {
    title: 'Habit & streak tracker',
    blurb: 'Daily check-ins · streaks · reminders · weekly recap',
    prompt:
      'I want a Telegram bot that helps me build habits and keep streaks going. Each person sets up their own habits — "drink water", "read 20 minutes", "no smoking" — and chooses how often each should happen: every day, certain weekdays, or a number of times a week. The bot sends a gentle reminder at a time I pick and lets me check in with a single tap, then tracks my current streak, my longest streak, and my completion rate, and celebrates milestones without being cheesy. I can mark a day done, skipped, or missed, edit or pause a habit any time, and see a clean weekly recap of how I did. Handle time zones so reminders land at the right local time, never double-count a check-in, and keep each person\'s habits and history completely private. Give me all my habits at a glance, and make missing a day feel encouraging instead of punishing.',
  },
  {
    title: 'Vocabulary flashcards',
    blurb: 'Spaced repetition · daily reviews · custom decks · progress',
    prompt:
      'I want a Telegram bot that helps me learn a language by drilling vocabulary with spaced repetition. I can add my own word pairs — word, translation, and an optional example sentence — or pick from ready-made starter decks, and the bot schedules reviews so each card comes back right before I\'d forget it: cards I find hard return sooner, easy ones later. Each review is quick — it shows the prompt, I try to recall, then tap to reveal and rate myself "again", "hard", "good", or "easy". Nudge me when reviews are due and let me set how many new cards to learn per day so I don\'t get overwhelmed. I can browse, edit, and delete cards and organize them into decks. Show my streak, how many words I\'ve learned, and what\'s due today. Keep every person\'s decks and progress private, save my place if I stop mid-session, and handle empty decks or a finished session with a friendly message.',
  },
  {
    title: 'Group welcome & guard',
    blurb: 'Greet newcomers · human check · anti-spam · admin tools',
    prompt:
      'I want a Telegram bot that runs my group chat — welcoming new members and keeping out spam. When someone joins, greet them by name with a short welcome and the rules, and ask them to tap a button to confirm they\'re human before they can post; if they don\'t verify within a few minutes, quietly remove them so bots never get in. Watch for obvious spam — links from brand-new accounts, repeated identical messages, flood posting — and warn, mute, or remove based on thresholds I set. Give admins simple commands to warn, mute, kick, or ban, and keep a short log of actions so we can see who did what. Let me edit the welcome message and rules, choose which actions are automatic, and mark trusted users as exempt. Never act on admins or pinned content, explain every automated action so it doesn\'t feel arbitrary, and give me an overview of joins, verifications, and removals over time.',
  },
  {
    title: 'Appointment booking',
    blurb: 'Pick a service & slot · confirmations · reminders · reschedule',
    prompt:
      'I want a Telegram bot that books appointments for my one-person business — like a barber, tutor, or coach. A client taps to start, picks the service they want (each with its own length, and a price to show if I set one), then a day and an open time; the bot only offers slots that fit my working hours and aren\'t already taken, so it can never double-book me. It confirms instantly with the details and a reference code, sends a reminder the day before and an hour before, and lets clients reschedule or cancel from buttons. I configure my services, weekly availability, breaks, and days off, and I can block out time when something comes up. Give me an owner view of today\'s and the week\'s bookings, and ping me the moment a booking comes in or someone cancels. Handle odd input gracefully, keep client contact details private, and stay warm and clear throughout. No online payment needed — we settle in person.',
  },
  {
    title: 'Async team standup',
    blurb: 'Daily check-ins · channel digest · nudges · blocker history',
    prompt:
      'I want a Telegram bot that runs an async daily standup for my team so we can skip the meeting. Each workday at a time I set, the bot privately messages everyone three questions — what you did yesterday, what you\'re doing today, and anything blocking you — and collects the answers. Once people respond or a cutoff passes, it posts a clean digest to our team channel grouped by person, clearly listing anyone still pending and anything flagged as a blocker so nothing slips. Nudge people who haven\'t answered, but only once, and let anyone skip a day or mark themselves off. I can set the schedule, the questions, the team, the channel, and which days to run. Respect each person\'s time zone, never post a half-finished digest, and keep answers tidy. Give me a simple history so we can look back at past standups and spot blockers that keep coming up.',
  },
  {
    title: 'Event RSVP',
    blurb: 'Invites · yes/no/maybe · headcount · waitlist · reminders',
    prompt:
      'I want a Telegram bot that handles RSVPs for events I organize, big or small. I create an event with a title, date and time, place, and an optional guest limit, and the bot gives me a shareable link or posts it in a group where people RSVP with one tap — going, not going, or maybe — and can add a "+1" or a note. It keeps a live headcount, enforces the limit with a waitlist that auto-promotes people if someone drops out, and shows me the full guest list any time. Send reminders before the event to everyone who said yes, and let people change their answer up to a cutoff I set. I can edit the event, message all attendees at once, and close RSVPs when I\'m ready. Handle a full event gracefully, never lose a response, keep the guest list visible only to me unless I share it, and confirm every RSVP so people know it registered.',
  },
  {
    title: 'Personal budget tracker',
    blurb: 'Log spending · categories · monthly budgets · summaries',
    prompt:
      'I want a Telegram bot that helps me track my spending without a spreadsheet. I log an expense in seconds — just the amount and a category like food, transport, or rent, with an optional note — and the bot keeps a running total for the month. I can set a monthly budget overall and per category, and it warns me when I\'m getting close or have gone over, so there are no surprises. Offer my common categories as quick buttons, remember the ones I use most, and let me add, edit, or delete entries and create my own categories. Give me a clear summary any time — spent so far this month, broken down by category, and how each compares to its budget — plus an end-of-month recap. Pick a currency once and stick to it, total everything correctly to the cent, and roll cleanly into a new month. Keep all my data private to me, and make fixing a typo\'d amount or a wrong category effortless.',
  },
  {
    title: 'Group trivia game',
    blurb: 'Live quizzes · timed questions · scores · leaderboard',
    prompt:
      'I want a Telegram bot that runs fun trivia games in my group chat. Anyone can start a round, pick a category and how many questions, and the bot posts each question with multiple-choice buttons and a countdown; everyone answers at once, faster correct answers score more, and when time\'s up it reveals the right answer and who got it. It keeps scores through the round, shows a live scoreboard between questions, and crowns a winner at the end. Stop people from answering twice, break ties fairly, and keep the pace snappy so the chat stays lively. Ship with a good built-in question set across several categories, and let me add my own questions and answers for custom games. Track an all-time group leaderboard so there are bragging rights over time. If someone abandons a game, time it out cleanly, and make sure two games can\'t run in the same chat at once.',
  },
  {
    title: 'Support & FAQ desk',
    blurb: 'Instant FAQ answers · human handoff · tickets · hours',
    prompt:
      'I want a Telegram bot that handles first-line customer support for my product. It greets people, offers the most common questions as tappable buttons, and answers from a FAQ I manage — clear, friendly replies with follow-up suggestions so people can self-serve. When the bot can\'t help or the customer asks for a person, it opens a ticket: collects the details, gives the customer a reference number, and notifies me or my team so we can reply, with the conversation kept tied to that ticket. I can manage the FAQ entries, set business hours (and a polite "we\'re offline, we\'ll get back to you" message outside them), and see open tickets and their status. Make sure nothing falls through the cracks — every unanswered question becomes a ticket — keep each customer\'s conversation private, and confirm when a ticket is opened or resolved. Give me an owner view of the most common questions and ticket volume so I can spot what to fix or add to the FAQ.',
  },
];

// We keep a big library of examples but only show three at a time, picked at
// random each visit (and re-rollable via the shuffle button) so the screen
// stays fresh and surfaces the full range over repeat visits.
const IDEAS_SHOWN = 3;

function pickIdeas(n: number): IdeaExample[] {
  const a = IDEA_EXAMPLES.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

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

export type StartBtn = { label: string; disabled?: boolean; busy?: boolean; onClick?: () => void };

export function PromptScreen({ T, idea, setIdea, changed, user, error, startBtn }: {
  T: Theme; idea: string; setIdea: (v: string) => void; changed: boolean;
  user?: TgUser | null; onToggleTheme?: () => void; error?: string | null;
  startBtn?: StartBtn | null;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { autoGrow(taRef.current); }, [idea]);
  // Three random ideas, chosen once on mount; the shuffle button re-rolls them.
  const [shownIdeas, setShownIdeas] = useState<IdeaExample[]>(() => pickIdeas(IDEAS_SHOWN));
  return (
    <div style={{ padding: '14px 22px 20px', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* brand lockup · user avatar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <Wordmark T={T} size={30} />
        <Avatar T={T} user={user} />
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

      <div style={{ fontFamily: T.font, fontSize: 30, fontWeight: 800, color: T.text, letterSpacing: -1, lineHeight: '34px', textAlign: 'center' }}>
        What should your<br />bot do?
      </div>
      <div style={{ fontFamily: T.font, fontSize: 15, color: T.sub, marginTop: 10, lineHeight: '21px', textAlign: 'center' }}>
        Describe your idea in plain words — you can refine it next.
      </div>

      <div style={{
        marginTop: 20, borderRadius: 18, background: T.cardBg, border: `1.5px solid ${idea ? T.accentBorder : T.sep}`,
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
          <span style={{ fontFamily: T.mono, fontSize: 12, color: T.hint }}>{idea.trim().length} chars</span>
          {idea.trim() && startBtn && (
            <button
              onClick={startBtn.disabled || startBtn.busy ? undefined : startBtn.onClick}
              disabled={startBtn.disabled}
              style={{
                ...btnReset, display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 999,
                background: startBtn.disabled ? T.nestedBg : T.accent,
                color: startBtn.disabled ? T.hint : T.accentText,
                fontFamily: T.font, fontSize: 13, fontWeight: 700, letterSpacing: 0.1,
                cursor: startBtn.disabled ? 'default' : 'pointer',
                boxShadow: startBtn.disabled ? 'none' : T.ctaShadow,
                animation: 'tgfade .2s', whiteSpace: 'nowrap',
              }}
            >
              {startBtn.busy && <Spinner color={startBtn.disabled ? T.hint : T.accentText} size={14} />}
              {startBtn.label}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ fontFamily: T.font, fontSize: 13, color: T.amber, lineHeight: '18px', marginTop: 10, padding: '0 4px' }}>
          Couldn't start — {error}. Tap the button to retry.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '22px 4px 11px' }}>
        <span style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3 }}>
          Or start from an idea
        </span>
        <button onClick={() => setShownIdeas(pickIdeas(IDEAS_SHOWN))} style={{
          ...btnReset, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', borderRadius: 8,
          fontFamily: T.font, fontSize: 12, fontWeight: 600, color: T.accent, textTransform: 'none', letterSpacing: 0,
        }}>
          <TGIcon name="refresh" size={13} color={T.accent} stroke={2} />
          Shuffle
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {shownIdeas.map((ex) => (
          <button key={ex.title} onClick={() => setIdea(ex.prompt)} style={{
            ...btnReset, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px',
            borderRadius: 14, background: T.cardBg,
            border: `1px solid ${T.sep}`, boxShadow: T.shadow,
          }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <TGIcon name="spark" size={16} color={T.accent} />
            </div>
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
