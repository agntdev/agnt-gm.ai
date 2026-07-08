// ConnectAgent — focused "connect a local agent" screen, reached from the
// overview's "Add an agent" sheet → "Connect a new one". No platform/local
// picker (the new agent model dropped it) — just the one-time connect code and
// the CLI command, with a live waiting → connected status. Mints a code via
// POST .../agent-link and polls GET .../agent-link until the CLI claims it.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Theme, btnReset } from '../theme';
import { mintAgentLink, getAgentLink, getProject, Project } from '../api/client';
import { TGIcon, Card, Dot, Spinner } from '../ui';
import { MyBot } from './MyBots';
import { useT } from '../i18n';

export const INSTALL_CMD = 'npx skills add agntdev/skills --all';

// The first prompt the owner pastes into their agent — carries the one-time
// connect code and the exact commands to run (install skills → connect → build).
export function firstPrompt(project: Project | null, code: string): string {
  // Without the project loaded we don't know the real slug — never bake a
  // made-up one ("my-project") into a command the agent will actually run.
  const slug = project?.slug || null;
  return [
    `Use the agnt-cli-builder skill to build my Telegram bot on agnt-gm.ai.`,
    ``,
    ...(slug ? [`Project: ${project?.name || slug} (${slug})`] : []),
    `Connect code: ${code}`,
    ``,
    `1) If the agnt skills are missing, install them: ${INSTALL_CMD}`,
    `2) Run: agnt connect ${code}`,
    slug
      ? `3) Then run \`agnt tasks ${slug}\` and build the tasks one by one as the skill instructs.`
      : `3) Then run \`agnt tasks\` for the connected project and build the tasks one by one as the skill instructs.`,
  ].join('\n');
}

function Label({ T, children }: { T: Theme; children: ReactNode }) {
  return (
    <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 4px 9px' }}>
      {children}
    </div>
  );
}

export function ConnectAgent({ T, bot, onConnected }: { T: Theme; bot: MyBot; onConnected: () => void }) {
  const t = useT();
  const [project, setProject] = useState<Project | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const stopped = useRef(false);
  // navigate straight back the moment the agent connects — no confirmation step
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

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
        if (s.status === 'connected') { onConnectedRef.current(); return; }
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
        <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: -0.3 }}>{t('Connect a local agent', 'Подключить локального агента')}</div>
        <div style={{ fontFamily: T.font, fontSize: 14, color: T.sub, lineHeight: '20px', marginTop: 4 }}>
          {t('Paste the prompt into your Claude or Codex — or run the command yourself. The one-time code connects it and it starts building.', 'Вставьте промпт в Claude или Codex — или выполните команду сами. Одноразовый код подключит его, и он начнёт сборку.')}
        </div>
      </div>

      {/* one-tap path: the whole first prompt (contains the code + commands) */}
      <div>
        <Label T={T}>{t('Paste this into your agent', 'Вставьте это в вашего агента')}</Label>
        {code ? (
          <CopyCard T={T} text={firstPrompt(project, code)} mono small />
        ) : (
          <Card T={T} pad={14} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Spinner color={T.accent} size={15} />
            <span style={{ fontFamily: T.font, fontSize: 13.5, color: T.sub }}>{t('Generating your connect code…', 'Генерируем код подключения…')}</span>
          </Card>
        )}
      </div>

      {/* manual path: raw code + CLI commands */}
      <div>
        <Label T={T}>{t('Or run it yourself', 'Или выполните сами')}</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CopyCard T={T} text={code ? `agnt connect ${code}` : '…'} mono small />
          <div style={{ fontFamily: T.font, fontSize: 12, color: T.hint, padding: '0 4px' }}>
            {t('New to agnt? Install the CLI skills first:', 'Впервые в agnt? Сначала установите навыки CLI:')}
          </div>
          <CopyCard T={T} text={INSTALL_CMD} mono small />
        </div>
      </div>

      {/* status — auto-returns to the overview the moment the agent connects */}
      <Card T={T} pad={14} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Dot color={T.amber} size={9} pulse />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: T.text }}>{t('Waiting for your agent…', 'Ожидание вашего агента…')}</div>
          {code && (
            <div style={{ fontFamily: T.font, fontSize: 12, color: T.hint, marginTop: 1 }}>
              {t('Connect code', 'Код подключения')} <span style={{ fontFamily: T.mono, fontWeight: 600 }}>{code}</span> {t('· valid 10 min, auto-refreshes', '· действует 10 мин, обновляется автоматически')}
            </div>
          )}
        </div>
        <TGIcon name="clock" size={19} color={T.amber} stroke={1.9} />
      </Card>
    </div>
  );
}

// A copyable code/prompt block: the text, plus a tap-to-copy footer that flips
// to "Copied". Falls back to execCommand for older Telegram webviews.
export function CopyCard({ T, text, mono, small }: { T: Theme; text: string; mono?: boolean; small?: boolean }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const flash = () => { setCopied(true); setTimeout(() => setCopied(false), 1400); };
  // legacy fallback for webviews without navigator.clipboard (older Telegram)
  const legacyCopy = () => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { if (document.execCommand('copy')) flash(); } catch { /* give up quietly */ }
    document.body.removeChild(ta);
  };
  // only show "Copied" when the copy actually landed
  const copy = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(flash).catch(legacyCopy);
    } else {
      legacyCopy();
    }
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
        background: T.nestedBg,
        color: copied ? T.green : T.accent, fontFamily: T.font, fontSize: 13.5, fontWeight: 600,
      }}>
        <TGIcon name={copied ? 'check' : 'copy'} size={16} color={copied ? T.green : T.accent} stroke={2} />
        {copied ? t('Copied', 'Скопировано') : t('Copy', 'Копировать')}
      </button>
    </Card>
  );
}
