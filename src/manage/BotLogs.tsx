// BotLogs — owner-facing runtime-logs viewer for a deployed bot. Opened from
// the bot overview's "Logs" action. Fetches GET /builder/projects/:id/bot-logs
// (the live Fly app's recent stderr/stdout — crash traces, grammY errors) and
// shows them in a scrollable dark monospace block with a Refresh control.
//
// States: loading · error (404/500) · empty (available:false → no Fly app yet)
// · logs. Mirrors the TaskDetail / AgentManager bottom-sheet (scrim-to-close,
// drag handle, tgfade/tgsheet) so it feels native to the rest of the app.
import { useEffect, useRef, useState } from 'react';
import { Theme, btnReset } from '../theme';
import { ApiError, BotLogs as BotLogsDTO, getBotLogs } from '../api/client';
import { TGIcon, Spinner } from '../ui';
import { relTime } from './Activity';

export function BotLogs({ T, projectId, app: appHint, onClose }: {
  T: Theme; projectId: string;
  app?: string;        // bot @username for the header subtitle before the fetch lands
  onClose: () => void;
}) {
  const [data, setData] = useState<BotLogsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const d = await getBotLogs(projectId);
      setData(d);
    } catch (e) {
      setError(e instanceof ApiError
        ? (e.status === 404 ? "Couldn't find this bot's logs — it may not have deployed yet."
          : `Couldn't load logs — ${e.message}${e.details ? ` (${e.details})` : ''}`)
        : 'Network error — try again.');
    } finally {
      setLoading(false);
    }
  };

  // initial fetch (re-runs if the open bot changes under the same mounted sheet)
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Esc to close — matches the keyboard affordance other overlays rely on the
  // host back-button for; harmless in Telegram (no Esc), helps in the browser.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // pin the view to the newest lines (tail) whenever fresh logs arrive
  useEffect(() => {
    const el = preRef.current;
    if (el && data?.logs) el.scrollTop = el.scrollHeight;
  }, [data?.logs]);

  const app = data?.app || appHint || '';
  const hasLogs = !!data && data.available && !!data.logs.trim();
  const empty = !!data && (!data.available || !data.logs.trim());

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.42)',
      display: 'flex', alignItems: 'flex-end', animation: 'tgfade .2s ease',
    }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Bot runtime logs" style={{
        width: '100%', maxHeight: '90vh', background: T.cardBg,
        borderTopLeftRadius: 22, borderTopRightRadius: 22, display: 'flex', flexDirection: 'column',
        paddingBottom: 'max(14px, env(safe-area-inset-bottom, 0px))',
        animation: 'tgsheet .3s cubic-bezier(.2,.8,.2,1)',
      }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: T.sep, margin: '8px auto 2px', flexShrink: 0 }} />

        {/* header — title + app/fetched-at meta, Refresh, close */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 16px 12px', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>
              Runtime logs
            </div>
            <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, marginTop: 2, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              {app && <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.sub }}>{app}</span>}
              {data?.fetched_at && (
                <span>{app ? '· ' : ''}fetched {relTime(data.fetched_at)} ago</span>
              )}
            </div>
          </div>
          <button onClick={() => void load()} disabled={loading} aria-label="Refresh logs" style={{
            ...btnReset, height: 32, padding: '0 12px', borderRadius: 999,
            display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
            background: T.dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,22,32,0.05)',
            color: T.accent, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1,
          }}>
            {loading ? <Spinner color={T.accent} size={14} /> : <TGIcon name="refresh" size={15} color={T.accent} stroke={2.1} />}
            <span style={{ fontFamily: T.font, fontSize: 13.5, fontWeight: 600 }}>Refresh</span>
          </button>
          <button onClick={onClose} aria-label="Close" style={{
            ...btnReset, width: 32, height: 32, borderRadius: 999, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: T.dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,22,32,0.05)',
          }}>
            <TGIcon name="close" size={18} color={T.hint} stroke={2.2} />
          </button>
        </div>

        {/* body */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '0 16px 14px', display: 'flex', flexDirection: 'column' }}>
          {loading && !data ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '18px 2px' }}>
              <Spinner color={T.hint} size={15} />
              <span style={{ fontFamily: T.font, fontSize: 13.5, color: T.hint }}>Loading logs…</span>
            </div>
          ) : error ? (
            <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '13px 14px', borderRadius: 12, background: T.redSoft }}>
              <TGIcon name="refresh" size={16} color={T.red} stroke={2} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.font, fontSize: 13.5, fontWeight: 700, color: T.red, lineHeight: '18px' }}>Couldn't load logs</div>
                <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.sub, lineHeight: '18px', marginTop: 3 }}>{error}</div>
              </div>
            </div>
          ) : empty ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9,
              padding: '30px 18px', textAlign: 'center',
            }}>
              <div style={{ width: 44, height: 44, borderRadius: 13, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TGIcon name="server" size={22} color={T.accent} stroke={1.9} />
              </div>
              <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text }}>No runtime logs yet</div>
              <div style={{ fontFamily: T.font, fontSize: 13, color: T.hint, lineHeight: '18px', maxWidth: 280 }}>
                The bot hasn't deployed. Logs will appear here once it's live and serving users.
              </div>
            </div>
          ) : hasLogs ? (
            <pre ref={preRef} style={{
              flex: 1, minHeight: 0, margin: 0, overflow: 'auto',
              padding: '13px 14px', borderRadius: 12,
              background: T.dark ? '#0b1219' : '#0d1620',
              color: T.dark ? '#cdd6df' : '#dfe6ee',
              fontFamily: T.mono, fontSize: 12, lineHeight: '17px',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              border: `0.5px solid ${T.sep}`,
              WebkitOverflowScrolling: 'touch',
            }}>{data?.logs}</pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}
