// MyBots — "My Bots" tab: the post-launch feedback loop. The bot list is real
// (GET /builder/projects?owner_agent_id=…); the per-bot chat is the real
// project chat (history, deploy logs as role=system, owner messages).
import { Theme, btnReset, toneFor } from '../theme';
import { Project, ChatMessage } from '../api/client';
import { ChatThread } from '../chat/Chat';
import { useT, useLang, tr, Lang } from '../i18n';
import { TGIcon, Mark, Bubble, Spinner, BotTile, Pill, Dot } from '../ui';

export interface MyBot {
  id: string;
  name: string;
  handle: string;
  tone: string;
  avatarUrl?: string; // generated bot avatar (falls back to the name monogram)
  version: string;
  status: string;
  inProgress: boolean; // not deployed yet — tapping resumes the build pipeline
  statusLabel: string;
  preview: string;
  // task_manager (living DAG) vs the legacy phase pipeline. From the project's
  // build_pipeline once it ships (gap #1); undefined today → the board/overview
  // fall back to probing /dag for node_kind. Drives which board/inbox to show.
  isTaskManager?: boolean;
}

// Status chrome. Keyed by raw project status; VALUES are user-facing → translated.
const STATUS_LABELS: Record<string, [string, string]> = {
  draft: ['Clarifying idea…', 'Уточняем идею…'],
  validating: ['Generating spec…', 'Генерация спеки…'],
  generating: ['Building…', 'Идёт сборка…'], // task_manager decompose/build state
  ready_to_publish: ['In progress', 'В процессе'],
  publishing: ['Publishing…', 'Публикация…'],
  live: ['Building…', 'Идёт сборка…'],
  completed: ['Build complete', 'Сборка готова'],
};

function statusLabel(lang: Lang, status: string): string {
  const pair = STATUS_LABELS[status];
  return pair ? tr(lang, pair[0], pair[1]) : status;
}

// Default descriptions when a bot carries no server description. Defined once so
// botFromProject and the render-site translation (previewText) stay byte-identical.
const DEPLOYED_FALLBACK = 'Your bot is deployed and running.';
const WIP_FALLBACK = 'Build in progress — open for status and changes.';

function previewText(lang: Lang, preview: string): string {
  if (preview === DEPLOYED_FALLBACK) return tr(lang, DEPLOYED_FALLBACK, 'Ваш бот развёрнут и работает.');
  if (preview === WIP_FALLBACK) return tr(lang, WIP_FALLBACK, 'Сборка идёт — откройте, чтобы увидеть статус и внести изменения.');
  return preview;
}

export function botFromProject(p: Project): MyBot {
  const isTaskManager = p.build_pipeline ? p.build_pipeline === 'task_manager' : undefined;
  const runtimeLive = p.current_phase === 'published' || !!p.bot_go_live_at;
  const legacyLive = isTaskManager !== true && (p.status === 'live' || p.status === 'completed');
  const deployed = runtimeLive || legacyLive;
  const desc = p.short_description || p.goal_of_project || (deployed
    ? DEPLOYED_FALLBACK
    : WIP_FALLBACK);
  return {
    id: p.id,
    name: p.name,
    handle: p.bot_username || `${p.slug.replace(/-/g, '_')}_bot`,
    tone: toneFor(p.slug),
    avatarUrl: p.bot_avatar_url || p.logo_url || p.preview_image_url || undefined,
    version: 'v1.0',
    status: deployed ? 'live' : p.status,
    inProgress: !deployed,
    statusLabel: deployed ? 'Live' : statusLabel('en', p.status),
    preview: desc,
    // undefined until the DTO carries build_pipeline; the board/overview probe /dag otherwise
    isTaskManager,
  };
}

function botsSummary(lang: Lang, bots: MyBot[]): string {
  const deployed = bots.filter(b => !b.inProgress).length;
  const wip = bots.length - deployed;
  const parts: string[] = [];
  if (deployed) parts.push(tr(lang, `${deployed} deployed`, `${deployed} развёрнуто`));
  if (wip) parts.push(tr(lang, `${wip} in progress`, `${wip} в процессе`));
  const joined = parts.join(' · ');
  const more = deployed ? tr(lang, 'request an update or ', 'запросить обновление или ') : '';
  return tr(lang,
    `${joined}. Open one to ${more}continue building.`,
    `${joined}. Откройте бота, чтобы ${more}продолжить сборку.`);
}

// ── inbox list ────────────────────────────────────────────────
export function MyBotsList({ T, bots, loading, authed, onOpen, onBuildFirst }: {
  T: Theme; bots: MyBot[]; loading: boolean; authed: boolean;
  onOpen: (id: string) => void; onBuildFirst: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  return (
    <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '2px 2px 0' }}>
        <div style={{ fontFamily: T.font, fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: -0.6 }}>
          {t('My bots', 'Мои боты')}
        </div>
        {authed && bots.length > 0 && (
          <button onClick={onBuildFirst} style={{
            ...btnReset, width: 44, height: 44, borderRadius: 14, flexShrink: 0, background: T.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: T.ctaShadow,
          }}>
            <TGIcon name="plus" size={24} color={T.accentText} stroke={2.4} />
          </button>
        )}
      </div>
      <div style={{ fontFamily: T.font, fontSize: 14, color: T.sub, lineHeight: '20px', padding: '6px 2px 0' }}>
        {loading ? t('Loading your bots…', 'Загрузка ваших ботов…') : bots.length
          ? botsSummary(lang, bots)
          : authed ? t('Nothing deployed yet.', 'Пока ничего не развёрнуто.') : t('Your bots are tied to your Telegram account.', 'Ваши боты привязаны к вашему аккаунту Telegram.')}
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 36 }}>
          <Spinner color={T.accent} size={22} />
        </div>
      )}

      {!loading && !authed && (
        <EmptyAction T={T} icon="user" label={t('Open in Telegram', 'Открыть в Telegram')} sub={t('Sign-in is automatic inside the mini-app', 'Вход выполняется автоматически в мини-приложении')} onClick={() => {}} />
      )}

      {!loading && authed && bots.length === 0 && (
        <EmptyAction T={T} icon="bolt" label={t('Build your first bot', 'Соберите своего первого бота')} sub={t('Describe it in plain words — we do the rest', 'Опишите его простыми словами — остальное сделаем мы')} onClick={onBuildFirst} />
      )}

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {bots.map(bot => {
          const liveB = bot.status === 'live';
          return (
            <button key={bot.id} onClick={() => onOpen(bot.id)} style={{
              ...btnReset, textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', gap: 13,
              padding: 15, borderRadius: T.cardRadius, background: T.cardBg,
              border: `1px solid ${T.sep}`, boxShadow: T.shadow,
            }}>
              <BotTile T={T} name={bot.name} tone={bot.tone} src={bot.avatarUrl} size={48} radius={15} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: -0.2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{bot.name}</div>
                <div style={{ fontFamily: T.mono, fontSize: 12.5, color: T.hint, marginTop: 2 }}>@{bot.handle}</div>
              </div>
              <Pill T={T} tone={liveB ? 'green' : 'gold'} style={{ flexShrink: 0 }}>
                <Dot color={liveB ? '#2f8f6f' : T.gold} size={6} pulse={!liveB} />
                {liveB ? t('Live', 'Работает') : statusLabel(lang, bot.status)}
              </Pill>
            </button>
          );
        })}
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
      borderRadius: T.cardRadius, background: T.cardBg, border: `1px solid ${T.sep}`, boxShadow: T.shadow,
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
export function BotChat({ T, bot, messages, thinking, loading, showIdentity, onOption, onRetry, onConnectAgent, cloudAgent }: {
  T: Theme; bot: MyBot; messages: ChatMessage[]; thinking: boolean;
  loading?: boolean; showIdentity?: boolean; onOption?: (label: string) => void;
  onRetry?: (m: ChatMessage) => void;
  onConnectAgent?: () => void; cloudAgent?: boolean;
}) {
  const t = useT();
  const { lang } = useLang();
  return (
    <div style={{ padding: '16px 14px 18px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: '100%' }}>
      {showIdentity && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 2px 6px' }}>
          <BotTile T={T} name={bot.name} tone={bot.tone} src={bot.avatarUrl} size={38} radius={12} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>{bot.name}</div>
            <div style={{ fontFamily: T.mono, fontSize: 12, color: T.hint, marginTop: 1 }}>@{bot.handle} · {bot.version}</div>
          </div>
        </div>
      )}
      {/* intro context line */}
      <div style={{
        alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 999,
        background: T.nestedBg, marginBottom: 2,
      }}>
        <Mark T={T} size={17} radius={5} />
        <span style={{ fontFamily: T.font, fontSize: 12, color: T.hint, fontWeight: 500 }}>
          {cloudAgent
            ? t('Cloud agent · runs tasks & makes changes', 'Облачный агент · выполняет задачи и вносит изменения')
            : t('Build agent · updates ship live', 'Агент сборки · обновления сразу в эфире')}
        </span>
      </div>

      {/* tasks are open — let the owner (re)connect a coding agent anytime */}
      {onConnectAgent && (
        <button onClick={onConnectAgent} style={{
          ...btnReset, display: 'flex', alignItems: 'center', gap: 11, padding: 12, textAlign: 'left',
          borderRadius: T.cardRadius, background: T.cardBg, border: `1px solid ${T.sep}`, boxShadow: T.shadow,
        }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TGIcon name="bolt" size={18} color={T.accent} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 600, color: T.text }}>{t('Connect an agent', 'Подключить агента')}</div>
            <div style={{ fontFamily: T.font, fontSize: 12, color: T.hint, marginTop: 1 }}>{t("Put your Claude or Codex on this bot's tasks", 'Поручите задачи бота вашему Claude или Codex')}</div>
          </div>
          <TGIcon name="chevRight" size={18} color={T.hint} stroke={2} />
        </button>
      )}

      {loading && messages.length === 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
          <Spinner color={T.accent} size={18} />
        </div>
      )}

      {!loading && messages.length === 0 && !thinking && (
        <Bubble T={T} from="bot">
          <span style={{ whiteSpace: 'pre-line' }}>{cloudAgent
            ? t(
                `I'm your cloud agent for ${bot.name}. Ask me to finish a task, change something, or run an action — I'll do it and report back.`,
                `Я ваш облачный агент для ${bot.name}. Попросите завершить задачу, что-то изменить или выполнить действие — я всё сделаю и отчитаюсь.`)
            : t(
                `I'm live 🟢 ${previewText(lang, bot.preview)} Tell me anything you'd like to change and I'll ship it.`,
                `Я в эфире 🟢 ${previewText(lang, bot.preview)} Скажите, что хотите изменить, и я выпущу обновление.`)}</span>
        </Bubble>
      )}

      <ChatThread T={T} messages={messages} thinking={thinking} onOption={onOption} onRetry={onRetry} />
    </div>
  );
}

// ── composer (sits above the tab bar) ─────────────────────────
export function Composer({ T, draft, onChange, onSend, disabled, placeholder }: {
  T: Theme; draft: string; onChange: (v: string) => void; onSend: () => void; disabled: boolean;
  placeholder?: string;
}) {
  const t = useT();
  const can = !!draft.trim() && !disabled;
  return (
    <div style={{ padding: '9px 10px 11px', background: T.headerBg, borderTop: `1px solid ${T.sep}`, position: 'relative', zIndex: 5 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <textarea
          value={draft}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (can) onSend(); } }}
          placeholder={placeholder || (disabled ? t('Shipping your update…', 'Отправляем обновление…') : t('Describe an update to ship…', 'Опишите обновление для отправки…'))}
          rows={1}
          style={{
            flex: 1, resize: 'none', maxHeight: 96, minHeight: 42, padding: '11px 15px', borderRadius: 21,
            background: T.inputBg, border: `1px solid ${T.sep}`, color: T.text,
            fontFamily: T.font, fontSize: 15, lineHeight: '20px', outline: 'none', boxSizing: 'border-box',
          }} />
        <button onClick={can ? onSend : undefined} style={{
          ...btnReset, width: 42, height: 42, borderRadius: 999, flexShrink: 0,
          background: can ? T.accent : T.nestedBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background .15s', cursor: can ? 'pointer' : 'default',
        }}>
          <TGIcon name="send" size={20} color={can ? '#fff' : T.hint} stroke={2} />
        </button>
      </div>
    </div>
  );
}
