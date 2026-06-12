// Clarify — the real owner↔AI chat (POST /builder/chat → draft project).
// The assistant asks clarifying questions (quick-reply options when the
// answer space is enumerable) until the idea is clear; then the brief is
// accepted, the project flips draft → validating and plan-gen takes over.
import { useEffect, useRef } from 'react';
import { Theme } from '../theme';
import { ChatMessage } from '../api/client';
import { ChatThread } from '../chat/Chat';
import { TGIcon, Bubble, Chip } from '../ui';

// generation status driven by the real project lifecycle
export type GenPhase = 'idle' | 'generating' | 'ready' | 'error';

export function ClarifyScreen({ T, messages, thinking, status, gen, genError, onOption, onRetry }: {
  T: Theme; messages: ChatMessage[]; thinking: boolean;
  status: string | null; // project status: draft | validating | ready_to_publish…
  gen: GenPhase; genError?: string | null;
  onOption: (label: string) => void; onRetry?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    const sc = el && el.parentElement;
    if (sc) sc.scrollTop = sc.scrollHeight;
  });

  // handed off = the brief is locked and the pipeline owns the project now.
  // Don't enumerate post-draft statuses (the backend grows new ones) — any
  // status beyond 'draft' counts, and a system message ("idea locked in",
  // build logs…) is a definitive signal even before the status poll catches up.
  const lockedIn = messages.some(m => m.role === 'system');
  const handedOff = (status !== null && status !== 'draft') || gen === 'ready' || lockedIn;
  // escape hatch: once the AI has asked at least one question, the owner can
  // hand every remaining decision to the platform instead of being interviewed
  const answeredOnce = messages.some(m => m.role === 'assistant') && messages.filter(m => m.role === 'owner').length >= 2;

  return (
    <div ref={scrollRef} style={{ padding: '18px 16px 14px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: '100%' }}>
      <ChatThread T={T} messages={messages} thinking={thinking}
        onOption={handedOff ? undefined : onOption}
        pendingNote={handedOff && gen === 'generating' ? 'Brief accepted — generating your spec…' : null} />

      {!handedOff && !thinking && answeredOnce && gen !== 'error' && (
        <button
          onClick={() => onOption('Decide everything else yourself with sensible defaults and start building.')}
          style={{
            alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 7,
            border: 'none', cursor: 'pointer', padding: '9px 16px', borderRadius: 999,
            background: T.accentSoft, color: T.accent,
            fontFamily: T.font, fontSize: 13.5, fontWeight: 600, WebkitTapHighlightColor: 'transparent',
          }}>
          <TGIcon name="spark" size={15} color={T.accent} />
          Good enough — you decide the rest
        </button>
      )}

      {gen === 'ready' && (
        <Bubble T={T} from="bot" animateIn>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TGIcon name="spark" size={17} color={T.accent} />
            Spec is ready — review it below.
          </div>
        </Bubble>
      )}

      {gen === 'error' && (
        <>
          <Bubble T={T} from="bot" animateIn>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <TGIcon name="refresh" size={17} color={T.amber} stroke={2} />
              <span>I couldn't generate the spec{genError ? ` — ${genError}` : ''}. Want me to try again?</span>
            </div>
          </Bubble>
          <div style={{ display: 'flex', gap: 8 }}>
            <Chip T={T} selected onClick={onRetry}>Try again</Chip>
          </div>
        </>
      )}
    </div>
  );
}
