// MyBots — "My Bots" tab: the post-launch feedback loop. The bot list is real
// (GET /builder/projects?owner_agent_id=…); the per-bot chat is the real
// project chat (history, deploy logs as role=system, owner messages).
import { Theme, btnReset, toneFor } from '../theme';
import { Project, ChatMessage } from '../api/client';
import { ChatThread } from '../chat/Chat';
import { TGIcon, Mark, Bubble, Spinner, BotTile } from '../ui';

export interface MyBot {
  id: string;
  name: string;
  handle: string;
  tone: string;
  version: string;
  status: string;
  inProgress: boolean; // not deployed yet — tapping resumes the build pipeline
  statusLabel: string;
  preview: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Clarifying idea…',
  validating: 'Generating spec…',
  ready_to_publish: 'In progress',
  publishing: 'Publishing…',
  live: 'Live',
  completed: 'Completed',
};

export function botFromProject(p: Project): MyBot {
  const desc = p.short_description || p.goal_of_project || 'Your bot is deployed and running.';
  const deployed = p.status === 'live' || p.status === 'completed';
  return {
    id: p.id,
    name: p.name,
    handle: `${p.slug.replace(/-/g, '_')}_bot`,
    tone: toneFor(p.slug),
    version: 'v1.0',
    status: p.status,
    inProgress: !deployed,
    statusLabel: STATUS_LABELS[p.status] || p.status,
    preview: desc,
  };
}

function botsSummary(bots: MyBot[]): string {
  const deployed = bots.filter(b => !b.inProgress).length;
  const wip = bots.length - deployed;
  const parts: string[] = [];
  if (deployed) parts.push(`${deployed} deployed`);
  if (wip) parts.push(`${wip} in progress`);
  return `${parts.join(' · ')}. Open one to ${deployed ? 'request an update or ' : ''}continue building.`;
}

// inbox preview line
function lastPreview(bot: MyBot): string {
  return bot.inProgress ? 'Tap to continue where you left off' : bot.preview;
}

// ── inbox list ────────────────────────────────────────────────
export function MyBotsList({ T, bots, loading, authed, onOpen, onBuildFirst }: {
  T: Theme; bots: MyBot[]; loading: boolean; authed: boolean;
  onOpen: (id: string) => void; onBuildFirst: () => void;
}) {
  return (
    <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ fontFamily: T.font, fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: -0.3, padding: '2px 2px 0' }}>
        My bots
      </div>
      <div style={{ fontFamily: T.font, fontSize: 14, color: T.sub, lineHeight: '20px', padding: '5px 2px 0' }}>
        {loading ? 'Loading your bots…' : bots.length
          ? botsSummary(bots)
          : authed ? 'Nothing deployed yet.' : 'Your bots are tied to your Telegram account.'}
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 36 }}>
          <Spinner color={T.accent} size={22} />
        </div>
      )}

      {!loading && !authed && (
        <EmptyAction T={T} icon="user" label="Open in Telegram" sub="Sign-in is automatic inside the mini-app" onClick={() => {}} />
      )}

      {!loading && authed && bots.length === 0 && (
        <EmptyAction T={T} icon="bolt" label="Build your first bot" sub="Describe it in plain words — we do the rest" onClick={onBuildFirst} />
      )}

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bots.map(bot => (
          <button key={bot.id} onClick={() => onOpen(bot.id)} style={{
            ...btnReset, textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', gap: 13,
            padding: 13, borderRadius: T.cardRadius, background: T.cardBg,
            border: `0.5px solid ${T.sep}`, boxShadow: T.shadow,
          }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <BotTile T={T} name={bot.name} tone={bot.tone} size={46} radius={14} />
              <span style={{
                position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 999,
                background: bot.status === 'live' ? T.green : T.amber, border: `2.5px solid ${T.cardBg}`,
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>{bot.name}</span>
                <span style={{
                  fontFamily: bot.inProgress ? T.font : T.mono, fontSize: 11, fontWeight: 600,
                  color: bot.inProgress ? T.amber : T.hint,
                  background: T.dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,22,32,0.05)', padding: '1px 6px', borderRadius: 6,
                }}>{bot.inProgress ? bot.statusLabel : bot.version}</span>
              </div>
              <div style={{
                fontFamily: T.font, fontSize: 13, color: T.sub, lineHeight: '17px', marginTop: 3,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
              }}>{lastPreview(bot)}</div>
            </div>
            <TGIcon name="chevRight" size={20} color={T.hint} stroke={2} />
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyAction({ T, icon, label, sub, onClick }: {
  T: Theme; icon: string; label: string; sub: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      ...btnReset, marginTop: 18, display: 'flex', alignItems: 'center', gap: 13, padding: 16, textAlign: 'left',
      borderRadius: T.cardRadius, background: T.cardBg, border: `0.5px solid ${T.sep}`, boxShadow: T.shadow,
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TGIcon name={icon} size={20} color={T.accent} stroke={1.9} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 600, color: T.text }}>{label}</div>
        <div style={{ fontFamily: T.font, fontSize: 13, color: T.hint, marginTop: 1 }}>{sub}</div>
      </div>
      <TGIcon name="chevRight" size={20} color={T.hint} stroke={2} />
    </button>
  );
}

// ── the update conversation — the project's REAL chat feed ────
// showIdentity: inside Telegram our mocked header is hidden (Telegram draws
// its own chrome), so the bot identity moves into the chat body.
export function BotChat({ T, bot, messages, thinking, loading, showIdentity, onOption }: {
  T: Theme; bot: MyBot; messages: ChatMessage[]; thinking: boolean;
  loading?: boolean; showIdentity?: boolean; onOption?: (label: string) => void;
}) {
  return (
    <div style={{ padding: '16px 14px 18px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: '100%' }}>
      {showIdentity && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 2px 6px' }}>
          <BotTile T={T} name={bot.name} tone={bot.tone} size={38} radius={12} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>{bot.name}</div>
            <div style={{ fontFamily: T.mono, fontSize: 12, color: T.hint, marginTop: 1 }}>@{bot.handle} · {bot.version}</div>
          </div>
        </div>
      )}
      {/* intro context line */}
      <div style={{
        alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 999,
        background: T.dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,22,32,0.04)', marginBottom: 2,
      }}>
        <Mark T={T} size={17} radius={5} />
        <span style={{ fontFamily: T.font, fontSize: 12, color: T.hint, fontWeight: 500 }}>Build agent · updates ship live</span>
      </div>

      {loading && messages.length === 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
          <Spinner color={T.accent} size={18} />
        </div>
      )}

      {!loading && messages.length === 0 && !thinking && (
        <Bubble T={T} from="bot">
          <span style={{ whiteSpace: 'pre-line' }}>{`I'm live 🟢 ${bot.preview} Tell me anything you'd like to change and I'll ship it.`}</span>
        </Bubble>
      )}

      <ChatThread T={T} messages={messages} thinking={thinking} onOption={onOption} />
    </div>
  );
}

// ── composer (sits above the tab bar) ─────────────────────────
export function Composer({ T, draft, onChange, onSend, disabled, placeholder }: {
  T: Theme; draft: string; onChange: (v: string) => void; onSend: () => void; disabled: boolean;
  placeholder?: string;
}) {
  const can = !!draft.trim() && !disabled;
  return (
    <div style={{ padding: '9px 10px 11px', background: T.headerBg, borderTop: `0.5px solid ${T.sep}`, position: 'relative', zIndex: 5 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <textarea
          value={draft}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (can) onSend(); } }}
          placeholder={placeholder || (disabled ? 'Shipping your update…' : 'Describe an update to ship…')}
          rows={1}
          style={{
            flex: 1, resize: 'none', maxHeight: 96, minHeight: 42, padding: '11px 15px', borderRadius: 21,
            background: T.inputBg, border: `0.5px solid ${T.sep}`, color: T.text,
            fontFamily: T.font, fontSize: 15, lineHeight: '20px', outline: 'none', boxSizing: 'border-box',
          }} />
        <button onClick={can ? onSend : undefined} style={{
          ...btnReset, width: 42, height: 42, borderRadius: 999, flexShrink: 0,
          background: can ? T.accent : (T.dark ? '#243140' : '#dfe4ea'),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background .15s', cursor: can ? 'pointer' : 'default',
        }}>
          <TGIcon name="send" size={20} color={can ? '#fff' : T.hint} stroke={2} />
        </button>
      </div>
    </div>
  );
}
