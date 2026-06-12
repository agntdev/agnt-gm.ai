// Agent — Stage 2: bring the owner's agent online via the agent-link flow.
// The mini-app mints a one-time connect code (POST /builder/projects/{id}/
// agent-link); the first prompt tells the agent to run `agnt connect <code>`,
// which exchanges it for a delegate key server-side — no browser, no OAuth.
// We poll GET .../agent-link until status=connected.
import { useEffect, useRef, useState } from 'react';
import { Theme, btnReset } from '../theme';
import { mintAgentLink, getAgentLink, Project } from '../api/client';
import { TGIcon, Card, Pill, Dot, Spinner, Stepper } from '../ui';

const INSTALL_CMD = 'npx skills add agntdev/skills --all';

function firstPrompt(project: Project | null, code: string): string {
  const slug = project?.slug || 'my-project';
  return [
    `Use the agnt-cli-builder skill to build my Telegram bot on agnt-gm.ai.`,
    ``,
    `Project: ${project?.name || slug} (${slug})`,
    `Connect code: ${code}`,
    ``,
    `1) If the agnt skills are missing, install them: ${INSTALL_CMD}`,
    `2) Run: agnt connect ${code}`,
    `3) Then run \`agnt task list ${slug}\` and build the tasks one by one as the skill instructs.`,
  ].join('\n');
}

export function AgentScreen({ T, connected, agentName, project, onConnected }: {
  T: Theme; connected: boolean; agentName: string | null; project: Project | null;
  onConnected: (agentName: string | null) => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    if (connected || !project) return;
    stopped.current = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let remintTimer: ReturnType<typeof setTimeout> | undefined;

    const mint = async () => {
      try {
        const c = await mintAgentLink(project.id);
        if (stopped.current) return;
        setCode(c.code);
        // codes are one-time and short-lived — refresh shortly before expiry
        const ttl = (c.expires_in ?? 600) * 1000;
        remintTimer = setTimeout(mint, Math.max(30_000, ttl - 20_000));
      } catch {
        remintTimer = setTimeout(mint, 5000); // transient — retry
      }
    };

    const poll = async () => {
      if (stopped.current) return;
      try {
        const s = await getAgentLink(project.id);
        if (stopped.current) return;
        if (s.status === 'connected') {
          onConnected(s.connected_client || null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, project?.id]);

  return (
    <div style={{ padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Stepper T={T} steps={[0, 1, 2, 3, 4]} current={1} />
      <Pill T={T} tone="accent" style={{ alignSelf: 'flex-start' }}>Stage 2 · Connect agent</Pill>

      <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: -0.3, padding: '0 2px' }}>
        Bring your agent online
      </div>
      <div style={{ fontFamily: T.font, fontSize: 14.5, color: T.sub, lineHeight: '21px', padding: '0 2px', marginTop: -6 }}>
        Paste this prompt into your Claude or Codex agent — the connect code inside links it to this bot. One command, no sign-in. No extra cost.
      </div>

      {/* the first prompt — connect code inside */}
      <div>
        <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 4px 9px' }}>
          Paste this first prompt into your agent
        </div>
        {code ? (
          <CopyCard T={T} text={firstPrompt(project, code)} mono small />
        ) : (
          <Card T={T} pad={14} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Spinner color={T.accent} size={15} />
            <span style={{ fontFamily: T.font, fontSize: 13.5, color: T.sub }}>Generating your connect code…</span>
          </Card>
        )}
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
          ? <Pill T={T} tone="green">{agentName || 'Agent ready'}</Pill>
          : <TGIcon name="clock" size={19} color={T.amber} stroke={1.9} />}
      </Card>
    </div>
  );
}

function CopyCard({ T, text, mono, small }: { T: Theme; text: string; mono?: boolean; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <Card T={T} pad={0} style={{ overflow: 'hidden' }}>
      <div style={{
        padding: '11px 14px', fontFamily: mono ? T.mono : T.font, fontSize: small ? 12 : 13.5,
        lineHeight: small ? '18px' : '20px', color: T.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>{text}</div>
      <button onClick={copy} style={{
        ...btnReset, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        padding: '10px 14px', borderTop: `0.5px solid ${T.sep}`,
        background: T.dark ? 'rgba(255,255,255,0.03)' : '#f7f9fb',
        color: copied ? T.green : T.accent, fontFamily: T.font, fontSize: 13.5, fontWeight: 600,
      }}>
        <TGIcon name={copied ? 'check' : 'copy'} size={16} color={copied ? T.green : T.accent} stroke={2} />
        {copied ? 'Copied' : 'Copy'}
      </button>
    </Card>
  );
}
