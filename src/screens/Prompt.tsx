// Prompt — entry hero: "What should your bot do?"
// Top row: user avatar + theme switcher (no logo); centered title/subtitle.
import { useEffect, useRef } from 'react';
import { Theme, btnReset } from '../theme';
import { TgUser } from '../telegram';
import { TGIcon } from '../ui';

export const IDEA_EXAMPLES = [
  'A support bot for my Shopify store that answers order questions',
  'Daily AI-news digest with a morning summary',
  'A booking assistant for my barbershop',
  'Crypto price alerts when a coin moves 5%',
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
          <button key={i} onClick={() => setIdea(ex)} style={{
            ...btnReset, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
            borderRadius: 13, background: T.dark ? 'rgba(255,255,255,0.04)' : '#ffffff',
            border: `0.5px solid ${T.sep}`, boxShadow: T.shadow,
          }}>
            <TGIcon name="spark" size={17} color={T.accent} />
            <span style={{ fontFamily: T.font, fontSize: 14.5, color: T.text, lineHeight: '19px', flex: 1 }}>{ex}</span>
            <TGIcon name="arrowUp" size={15} color={T.hint} stroke={2} />
          </button>
        ))}
      </div>
    </div>
  );
}
