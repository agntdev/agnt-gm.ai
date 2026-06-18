// Discovery — third tab: a feed of LIVE bots built on the platform (everyone's,
// including the viewer's). Tapping a card opens the live bot in Telegram. The
// listing is server-side (GET /builder/projects/discover); until that endpoint
// ships the feed is empty and we show a "coming soon" card. There is no
// client-side fallback — other users' bots can't be enumerated locally.
import { Theme, btnReset, toneFor } from '../theme';
import { Project } from '../api/client';
import { openTgLink } from '../telegram';
import { TGIcon, BotTile } from '../ui';

export interface DiscoverBot {
  id: string;
  name: string;
  username: string; // real managed-bot @username — drives the t.me link
  tone: string;
  preview: string;
}

// A bot with no username can't be opened — omit it from the feed.
export function discoverBotFromProject(p: Project): DiscoverBot | null {
  if (!p.bot_username) return null;
  return {
    id: p.id,
    name: p.name,
    username: p.bot_username,
    tone: toneFor(p.slug),
    preview: p.short_description || p.goal_of_project || 'A bot built on AgentBot.',
  };
}

export function DiscoveryPage({ T, bots, loading }: {
  T: Theme; bots: DiscoverBot[]; loading: boolean;
}) {
  return (
    <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ fontFamily: T.font, fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: -0.3, padding: '2px 2px 0' }}>
        Discover
      </div>
      <div style={{ fontFamily: T.font, fontSize: 14, color: T.sub, lineHeight: '20px', padding: '5px 2px 0' }}>
        {loading ? 'Loading bots…' : bots.length ? 'Live bots built on AgentBot. Tap one to try it in Telegram.' : ''}
      </div>

      {!loading && bots.length === 0 && (
        <div style={{
          marginTop: 18, display: 'flex', alignItems: 'center', gap: 13, padding: 16, textAlign: 'left',
          borderRadius: T.cardRadius, background: T.cardBg, border: `0.5px solid ${T.sep}`, boxShadow: T.shadow,
        }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TGIcon name="compass" size={20} color={T.accent} stroke={1.9} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 600, color: T.text }}>Discover is coming soon</div>
            <div style={{ fontFamily: T.font, fontSize: 13, color: T.hint, marginTop: 1 }}>Bots others build will show up here</div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bots.map(bot => (
          <button key={bot.id} onClick={() => openTgLink(`https://t.me/${bot.username}`)} style={{
            ...btnReset, textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', gap: 13,
            padding: 13, borderRadius: T.cardRadius, background: T.cardBg,
            border: `0.5px solid ${T.sep}`, boxShadow: T.shadow,
          }}>
            <BotTile T={T} name={bot.name} tone={bot.tone} size={46} radius={14} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>{bot.name}</div>
              <div style={{
                fontFamily: T.font, fontSize: 13, color: T.sub, lineHeight: '17px', marginTop: 3,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
              }}>{bot.preview}</div>
            </div>
            <TGIcon name="open" size={18} color={T.accent} stroke={2} />
          </button>
        ))}
      </div>
    </div>
  );
}
