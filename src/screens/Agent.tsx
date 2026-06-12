// Agent — Stage 2: bring the owner's agent online via the agent-link flow.
// The mini-app mints a one-time connect code (POST /builder/projects/{id}/
// agent-link); the first prompt tells the agent to run `agnt connect <code>`,
// which exchanges it for a delegate key server-side — no browser, no OAuth.
// We poll GET .../agent-link until status=connected.
import { useEffect, useRef, useState } from 'react';
import { Theme, btnReset, hexA } from '../theme';
import { mintAgentLink, getAgentLink, Project, BuildMode } from '../api/client';
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

// the two ways to build — pick at creation, switch anytime from the overview
export const MODE_META: Record<BuildMode, { title: string; desc: string; glyph: string }> = {
  platform: {
    title: 'Platform agent',
    desc: 'We build everything — agents write code and ship PRs from our platform. Zero setup.',
    glyph: 'bolt',
  },
  local: {
    title: 'Your agent',
    desc: 'Your Claude or Codex does the work and pushes to the repo. We run checks & deploy.',
    glyph: 'code',
  },
};

export function ModePicker({ T, mode, onMode }: { T: Theme; mode: BuildMode; onMode: (m: BuildMode) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {(Object.keys(MODE_META) as BuildMode[]).map(m => {
        const meta = MODE_META[m];
        const sel = mode === m;
        return (
          <button key={m} onClick={() => onMode(m)} style={{
            ...btnReset, width: '100%', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 13, padding: 14, borderRadius: 16,
            background: T.cardBg, border: `1.5px solid ${sel ? T.accentBorder : T.sep}`,
            boxShadow: sel ? `0 2px 14px ${hexA(T.accent, 0.16)}` : T.shadow, transition: 'all .15s',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: sel ? T.accentSoft : (T.dark ? 'rgba(255,255,255,0.05)' : '#f3f5f8'),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <TGIcon name={meta.glyph} size={20} color={sel ? T.accent : T.sub} stroke={1.9} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 600, color: T.text }}>{meta.title}</div>
              <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, marginTop: 2, lineHeight: '17px' }}>{meta.desc}</div>
            </div>
            <div style={{
              width: 22, height: 22, borderRadius: 999, flexShrink: 0,
              border: `2px solid ${sel ? T.accent : (T.dark ? 'rgba(255,255,255,0.2)' : 'rgba(15,22,32,0.18)')}`,
              background: sel ? T.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{sel && <TGIcon name="check" size={14} color="#fff" stroke={3} />}</div>
          </button>
        );
      })}
    </div>
  );
}

export function AgentScreen({ T, connected, agentName, project, mode, onMode, onConnected }: {
  T: Theme; connected: boolean; agentName: string | null; project: Project | null;
  mode: BuildMode; onMode: (m: BuildMode) => void;
  onConnected: (agentName: string | null) => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    if (connected || !project || mode !== 'local') return;
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
  }, [connected, project?.id, mode]);

  return (
    <div style={{ padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Stepper T={T} steps={[0, 1, 2, 3, 4]} current={1} />
      <Pill T={T} tone="accent" style={{ alignSelf: 'flex-start' }}>Stage 2 · Who builds it</Pill>

      <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: -0.3, padding: '0 2px' }}>
        Choose your builder
      </div>
      <div style={{ fontFamily: T.font, fontSize: 14.5, color: T.sub, lineHeight: '21px', padding: '0 2px', marginTop: -6 }}>
        Both end with a live bot — you can switch anytime from the bot's page.
      </div>

      <ModePicker T={T} mode={mode} onMode={onMode} />

      {mode === 'platform' ? (
        <Card T={T} pad={14} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <TGIcon name="shield" size={19} color={T.green} stroke={1.9} />
          <div>
            <div style={{ fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: T.text }}>Nothing to set up</div>
            <div style={{ fontFamily: T.font, fontSize: 13, color: T.hint, marginTop: 2, lineHeight: '18px' }}>
              Platform agents pick up every task, write the code and open PRs from our platform. You watch progress here and in the bot's chat.
            </div>
          </div>
        </Card>
      ) : (
        <>
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
        </>
      )}
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
