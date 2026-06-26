// WholeBotUpdateComposer — the post-build "Ship an update" box for a whole_bot.
// POSTs /feedback (202; rate limit 20/hr), which re-enters the building phase
// carrying the owner's change request as the first pass's feedback; the N-pass
// loop applies it and redeploys. Unlike the task_manager FeedbackComposer there
// are no tasks/DAG to poll — the bot just goes back to "building", which the
// parent's detail polling reflects (the build card reappears). Shown only when the
// bot has FINISHED a build round (live or failed); hidden while it's building.
import { useState } from 'react';
import { Theme, btnReset } from '../theme';
import { ApiError, postFeedback } from '../api/client';
import { TGIcon, Spinner } from '../ui';
import { MyBot } from './MyBots';

const MAX_LEN = 4000;

export function WholeBotUpdateComposer({ T, bot, onUpdated }: {
  T: Theme; bot: MyBot; onUpdated?: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true); setError(null);
    try {
      await postFeedback(bot.id, text);
      setDraft(''); setSent(true);
      onUpdated?.(); // parent re-fetches detail → phase flips to building, build card returns
    } catch (e) {
      setError(e instanceof ApiError
        ? (e.status === 429 ? `Slow down — ${e.message} (20/hr).`
          : e.status === 409 ? 'A build is already running — wait until it’s live, then try again.'
          : `${e.message}${e.details ? ` — ${e.details}` : ''}`)
        : 'network error — try again');
    } finally { setSending(false); }
  };

  const can = !!draft.trim() && !sending;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 2px' }}>
        Ship an update
      </div>

      {sent && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 12,
          background: T.greenSoft, fontFamily: T.font, fontSize: 13, color: T.text,
        }}>
          <TGIcon name="check" size={15} color={T.green} stroke={2.2} />
          Update started — your bot is rebuilding now. Watch the build progress above.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <textarea
          value={draft}
          onChange={e => { setDraft(e.target.value.slice(0, MAX_LEN)); setSent(false); }}
          placeholder="Describe a change to ship — e.g. “Change the welcome message to…”"
          rows={2}
          style={{
            flex: 1, resize: 'none', fontFamily: T.font, fontSize: 14.5, lineHeight: '20px',
            color: T.text, background: T.inputBg ?? T.cardBg, border: `1px solid ${T.sep}`,
            borderRadius: 12, padding: '10px 12px', outline: 'none',
          }}
        />
        <button onClick={send} disabled={!can} style={{
          ...btnReset, width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: can ? T.accent : T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: can ? 'pointer' : 'default', transition: 'background .15s',
        }}>
          {sending ? <Spinner color="#fff" size={16} /> : <TGIcon name="send" size={18} color={can ? '#fff' : T.hint} stroke={2} />}
        </button>
      </div>

      {error && <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.red, padding: '0 2px' }}>{error}</div>}
      <div style={{ fontFamily: T.font, fontSize: 11.5, color: T.hint, padding: '0 2px' }}>
        The bot stays live while it rebuilds, then redeploys with your change.
      </div>
    </div>
  );
}
