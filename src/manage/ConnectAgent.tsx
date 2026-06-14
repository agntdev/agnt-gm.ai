// ConnectAgent — focused "connect a local agent" screen, reached from the
// overview's "Add an agent" sheet → "Connect a new one". No platform/local
// picker (the new agent model dropped it) — just the one-time connect code and
// the CLI command, with a live waiting → connected status. Mints a code via
// POST .../agent-link and polls GET .../agent-link until the CLI claims it.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Theme, btnReset } from '../theme';
import { mintAgentLink, getAgentLink, getProject, Project } from '../api/client';
import { TGIcon, Card, Pill, Dot, Spinner } from '../ui';
import { firstPrompt, CopyCard, INSTALL_CMD } from '../screens/Agent';
import { MyBot } from './MyBots';

function Label({ T, children }: { T: Theme; children: ReactNode }) {
  return (
    <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 4px 9px' }}>
      {children}
    </div>
  );
}

export function ConnectAgent({ T, bot, onConnected }: { T: Theme; bot: MyBot; onConnected: () => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [client, setClient] = useState<string | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getProject(bot.id).then(d => { if (!cancelled) setProject(d.project); }).catch(() => {});
    return () => { cancelled = true; };
  }, [bot.id]);

  // mint a one-time code (refreshed before expiry) and poll until connected
  useEffect(() => {
    stopped.current = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let remintTimer: ReturnType<typeof setTimeout> | undefined;

    const mint = async () => {
      try {
        const c = await mintAgentLink(bot.id);
        if (stopped.current) return;
        setCode(c.code);
        const ttl = (c.expires_in ?? 600) * 1000;
        remintTimer = setTimeout(mint, Math.max(30_000, ttl - 20_000));
      } catch {
        remintTimer = setTimeout(mint, 5000); // transient — retry
      }
    };

    const poll = async () => {
      if (stopped.current) return;
      try {
        const s = await getAgentLink(bot.id);
        if (stopped.current) return;
        if (s.status === 'connected') {
          setClient((s.connected_client || '').split('/')[0] || null);
          setConnected(true);
          return;
        }
      } catch { /* transient — keep polling */ }
      pollTimer = setTimeout(poll, 2000);
    };

    void mint();
    pollTimer = setTimeout(poll, 2000);
    return () => {
      stopped.current = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (remintTimer) clearTimeout(remintTimer);
    };
  }, [bot.id]);

  return (
    <div style={{ padding: '16px 16px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: -0.3 }}>Connect a local agent</div>
        <div style={{ fontFamily: T.font, fontSize: 14, color: T.sub, lineHeight: '20px', marginTop: 4 }}>
          Paste the prompt into your Claude or Codex — or run the command yourself. The one-time code connects it and it starts building.
        </div>
      </div>

      {/* one-tap path: the whole first prompt (contains the code + commands) */}
      <div>
        <Label T={T}>Paste this into your agent</Label>
        {code ? (
          <CopyCard T={T} text={firstPrompt(project, code)} mono small />
        ) : (
          <Card T={T} pad={14} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Spinner color={T.accent} size={15} />
            <span style={{ fontFamily: T.font, fontSize: 13.5, color: T.sub }}>Generating your connect code…</span>
          </Card>
        )}
      </div>

      {/* manual path: raw code + CLI commands */}
      <div>
        <Label T={T}>Or run it yourself</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CopyCard T={T} text={code ? `agnt connect ${code}` : '…'} mono small />
          <div style={{ fontFamily: T.font, fontSize: 12, color: T.hint, padding: '0 4px' }}>
            New to agnt? Install the CLI skills first:
          </div>
          <CopyCard T={T} text={INSTALL_CMD} mono small />
        </div>
      </div>

      {/* status */}
      <Card T={T} pad={14} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Dot color={connected ? T.green : T.amber} size={9} pulse={!connected} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: T.text }}>
            {connected ? 'Agent connected' : 'Waiting for your agent…'}
          </div>
          {!connected && code && (
            <div style={{ fontFamily: T.font, fontSize: 12, color: T.hint, marginTop: 1 }}>
              Connect code <span style={{ fontFamily: T.mono, fontWeight: 600 }}>{code}</span> · valid 10 min, auto-refreshes
            </div>
          )}
        </div>
        {connected
          ? <Pill T={T} tone="green">{client || 'Ready'}</Pill>
          : <TGIcon name="clock" size={19} color={T.amber} stroke={1.9} />}
      </Card>

      {connected && (
        <button onClick={onConnected} style={{
          ...btnReset, width: '100%', height: 48, borderRadius: 13, background: T.accent, color: '#fff',
          fontFamily: T.font, fontSize: 15.5, fontWeight: 600,
        }}>
          Done
        </button>
      )}
    </div>
  );
}
