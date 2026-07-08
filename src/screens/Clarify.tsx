// Clarify — the real owner↔AI chat (POST /builder/chat → draft project).
// The assistant asks clarifying questions (quick-reply options when the
// answer space is enumerable) until the idea is clear; then the brief is
// accepted, the project flips draft → validating and plan-gen takes over.
import { useEffect, useRef } from 'react';
import { Theme } from '../theme';
import { ChatMessage } from '../api/client';
import { ChatThread } from '../chat/Chat';
import { TGIcon, Bubble, Chip, Dot } from '../ui';
import { useT } from '../i18n';

// generation status driven by the real project lifecycle
export type GenPhase = 'idle' | 'generating' | 'ready' | 'error';

export function ClarifyScreen({ T, messages, thinking, thinkingStatus, status, gen, genError, onOption, onRetry, onRetrySend }: {
  T: Theme; messages: ChatMessage[]; thinking: boolean; thinkingStatus?: string;
  status: string | null; // project status: draft | validating | ready_to_publish…
  gen: GenPhase; genError?: string | null;
  onOption: (label: string) => void; onRetry?: () => void;
  onRetrySend?: (m: ChatMessage) => void; // re-send a failed chat message
}) {
  const t = useT();
  const scrollRef = useRef<HTMLDivElement>(null);

  // only pin to the bottom while the user is parked there — don't yank someone
  // who scrolled up to re-read the conversation. The listener keeps the flag
  // fresh; a programmatic pin re-fires it, so staying at the bottom sticks.
  const nearBottom = useRef(true);
  useEffect(() => {
    const sc = scrollRef.current?.parentElement;
    if (!sc) return;
    const onScroll = () => { nearBottom.current = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 120; };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => sc.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    const sc = scrollRef.current?.parentElement;
    if (sc && nearBottom.current) sc.scrollTop = sc.scrollHeight;
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
      {/* in-content chat identity — avatar · New bot · draft · online */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 2px 2px' }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <TGIcon name="bolt" size={20} color={T.accentText} stroke={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>{t('New bot', 'Новый бот')}</div>
          <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, marginTop: 1 }}>{t('draft · AI assistant', 'черновик · ИИ-ассистент')}</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: T.sage, borderRadius: 999, padding: '5px 11px', flexShrink: 0 }}>
          <Dot color={T.green} size={6} pulse />
          <span style={{ fontFamily: T.font, fontSize: 12.5, fontWeight: 600, color: '#3f6b4a' }}>{t('online', 'онлайн')}</span>
        </span>
      </div>

      <ChatThread T={T} messages={messages} thinking={thinking} thinkingStatus={thinkingStatus}
        onOption={handedOff ? undefined : onOption}
        onRetry={onRetrySend}
        pendingNote={handedOff && gen === 'generating' ? t('Brief accepted — generating your spec…', 'Бриф принят — генерируем спецификацию…') : null} />

      {!handedOff && !thinking && answeredOnce && gen !== 'error' && (
        <button
          // send stable English to the backend (it may key off this phrasing);
          // the button label below is what the user sees, localized.
          onClick={() => onOption('Decide everything else yourself with sensible defaults and start building.')}
          style={{
            alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 7,
            border: 'none', cursor: 'pointer', padding: '9px 16px', borderRadius: 999,
            background: T.accentSoft, color: T.accent,
            fontFamily: T.font, fontSize: 13.5, fontWeight: 600, WebkitTapHighlightColor: 'transparent',
          }}>
          <TGIcon name="spark" size={15} color={T.accent} />
          {t('Good enough — you decide the rest', 'Достаточно — решите остальное сами')}
        </button>
      )}

      {gen === 'ready' && (
        <Bubble T={T} from="bot" animateIn>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TGIcon name="spark" size={17} color={T.accent} />
            {t('Your bot’s ready — opening it now…', 'Ваш бот готов — открываем…')}
          </div>
        </Bubble>
      )}

      {gen === 'error' && (
        <>
          <Bubble T={T} from="bot" animateIn>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <TGIcon name="refresh" size={17} color={T.amber} stroke={2} />
              <span>{t("I couldn't generate the spec", 'Не удалось сгенерировать спецификацию')}{genError ? ` — ${genError}` : ''}{t('. Want me to try again?', '. Попробовать ещё раз?')}</span>
            </div>
          </Bubble>
          <div style={{ display: 'flex', gap: 8 }}>
            <Chip T={T} selected onClick={onRetry}>{t('Try again', 'Попробовать снова')}</Chip>
          </div>
        </>
      )}
    </div>
  );
}
