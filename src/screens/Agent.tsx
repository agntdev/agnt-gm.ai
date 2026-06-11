// Agent — Stage 2: bring the owner's agent online.
// 1) Install the agnt skills into the user's coding agent (Claude/Codex):
//      npx skills add agntdev/skills --all
// 2) Copy the FIRST PROMPT into the agent. It carries the connect ID + code
//    from a real CLI session (POST /auth/cli-session) — the agent opens the
//    login link, the owner confirms the code, and our poll flips to connected.
import { useEffect, useRef, useState } from 'react';
import { Theme, btnReset } from '../theme';
import { createCliSession, pollCliSession, CliSession, Project } from '../api/client';
import { TGIcon, Card, Pill, Dot, Spinner, Stepper } from '../ui';

const INSTALL_CMD = 'npx skills add agntdev/skills --all';

function firstPrompt(project: Project | null, s: CliSession): string {
  const slug = project?.slug || 'my-project';
  return [
    `Use the agnt-cli-builder skill to build my Telegram bot on agnt-gm.ai.`,
    ``,
    `Project: ${project?.name || slug} (${slug})${project ? ` · id ${project.id}` : ''}`,
    `Connect ID: ${s.session_id}`,
    `Code: ${s.verification_code || '—'}`,
    ``,
    `1) If the agnt skills are missing, install them: ${INSTALL_CMD}`,
    `2) Connect my account: open ${s.login_url} — I'll confirm the code above.`,
    `3) Once I approve the build plan, run \`agnt task list ${slug}\` and build the tasks one by one as the skill instructs.`,
  ].join('\n');
}

export function AgentScreen({ T, connected, agentName, project, onConnected }: {
  T: Theme; connected: boolean; agentName: string | null; project: Project | null;
  onConnected: (agentName: string | null) => void;
}) {
  const [session, setSession] = useState<CliSession | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    if (connected) return;
    stopped.current = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        const s = await createCliSession('agentbot-miniapp/0.1.0 (telegram)');
        if (stopped.current) return;
        setSession(s);

        const poll = async () => {
          if (stopped.current) return;
          try {
            const r = await pollCliSession(s.session_id);
            if (stopped.current) return;
            if (r.status === 'ready') {
              onConnected(r.agent?.display_name || r.agent?.github_username || null);
              return;
            }
            if (r.status === 'expired') {
              // session lapsed — issue a fresh one so the prompt stays valid
              const ns = await createCliSession('agentbot-miniapp/0.1.0 (telegram)').catch(() => null);
              if (!stopped.current && ns) setSession(ns);
              pollTimer = setTimeout(poll, 2000);
              return;
            }
            pollTimer = setTimeout(poll, 2000);
          } catch {
            pollTimer = setTimeout(poll, 4000);
          }
        };
        pollTimer = setTimeout(poll, 2000);
      } catch {
        // API unreachable — let the flow stay walkable
        setTimeout(() => { if (!stopped.current) onConnected(null); }, 3500);
      }
    })();

    return () => { stopped.current = true; if (pollTimer) clearTimeout(pollTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  return (
    <div style={{ padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Stepper T={T} steps={[0, 1, 2, 3, 4]} current={1} />
      <Pill T={T} tone="accent" style={{ alignSelf: 'flex-start' }}>Stage 2 · Connect agent</Pill>

      <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: -0.3, padding: '0 2px' }}>
        Bring your agent online
      </div>
      <div style={{ fontFamily: T.font, fontSize: 14.5, color: T.sub, lineHeight: '21px', padding: '0 2px', marginTop: -6 }}>
        Paste this prompt into your Claude or Codex agent — it installs our skills and carries the connect ID your agent uses to link up. No extra cost.
      </div>

      {/* the first prompt — skills install is inside it */}
      <div>
        <StepLabel T={T} text="Paste this first prompt into your agent" />
        {session ? (
          <CopyCard T={T} text={firstPrompt(project, session)} mono small />
        ) : (
          <Card T={T} pad={14} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Spinner color={T.accent} size={15} />
            <span style={{ fontFamily: T.font, fontSize: 13.5, color: T.sub }}>Generating your connect ID…</span>
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
          {!connected && session?.verification_code && (
            <div style={{ fontFamily: T.font, fontSize: 12, color: T.hint, marginTop: 1 }}>
              Confirm code <span style={{ fontFamily: T.mono, fontWeight: 600 }}>{session.verification_code}</span> when asked
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

function StepLabel({ T, text }: { T: Theme; text: string }) {
  return (
    <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 4px 9px' }}>
      {text}
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
