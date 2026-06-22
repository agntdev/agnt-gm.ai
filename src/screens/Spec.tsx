// Spec — the generated bot review plus managed-bot creation. This is the last
// default step before the platform starts the cloud build.
import { Theme, btnReset } from '../theme';
import { Project, BotInitiate } from '../api/client';
import { openTgLink } from '../telegram';
import { TGIcon, Card, Pill, Dot, Spinner, Stepper, SpecBlock, MiniStat } from '../ui';

export function specCaps(p: Project): string[] {
  const caps = ['Understands natural-language messages and replies in context'];
  if (p.goal_of_project) caps.push(p.goal_of_project);
  if (p.needs_database) caps.push(`Reads and writes records to a managed ${p.database_kind || 'database'}`);
  if (p.needs_backend) caps.push('Runs with a hosted backend service');
  if (p.needs_frontend) caps.push('Ships a companion web UI alongside the bot');
  return caps;
}

export function productionPlan(p: Project): string[] {
  const plan = ['Managed Telegram bot', 'Cloud build', 'Hosted runtime'];
  if (p.needs_database) plan.push(p.database_kind || 'Managed database');
  if (p.needs_frontend) plan.push('Companion web UI');
  plan.push('Production deploy');
  return plan;
}

export function SpecScreen({ T, project, taskCount, created, creating, createError, botInit, botUsername, onCreate, onEdit }: {
  T: Theme; project: Project; taskCount: number | null;
  created: boolean; creating: boolean; createError?: string | null;
  botInit?: BotInitiate | null; botUsername?: string | null;
  onCreate: () => void; onEdit: () => void;
}) {
  const caps = specCaps(project);
  const plan = productionPlan(project);
  // real managed bot > platform suggestion > slug-derived placeholder
  const handle = botUsername || botInit?.suggested_username || `${project.slug.replace(/-/g, '_')}_bot`;
  const summary = project.short_description || project.about_of_project || project.goal_of_project || '';

  return (
    <div style={{ padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Stepper T={T} steps={[0, 1]} current={1} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
        <Pill T={T} tone="accent">Review</Pill>
        <button onClick={onEdit} style={{ ...btnReset, color: T.accent, fontFamily: T.font, fontSize: 14, fontWeight: 500 }}>Edit idea</button>
      </div>

      {/* Managed bot identity + create */}
      <Card T={T} pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 16 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 14, flexShrink: 0,
            background: created ? T.green : T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .3s',
          }}>
            {created ? <TGIcon name="check" size={25} color="#fff" stroke={2.6} /> : <TGIcon name="user" size={24} color={T.accent} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text }}>{project.name}</div>
            <div style={{ fontFamily: T.mono, fontSize: 13.5, color: T.accent }}>@{handle}</div>
          </div>
          {created
            ? <Pill T={T} tone="green"><Dot color={T.green} size={6} /> Bot created</Pill>
            : <Pill T={T} tone="neutral">{botInit ? 'reserved' : 'available'}</Pill>}
        </div>
        {summary && (
          <div style={{ fontFamily: T.font, fontSize: 14.5, color: T.sub, lineHeight: '21px', padding: '0 16px 16px' }}>
            {summary}
          </div>
        )}

        {/* create-bot action bar */}
        <div style={{
          borderTop: `0.5px solid ${T.sep}`, background: T.dark ? 'rgba(255,255,255,0.02)' : '#f7f9fb', padding: 13,
        }}>
          {created ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <TGIcon name="shield" size={18} color={T.green} stroke={1.9} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: T.font, fontSize: 13.5, fontWeight: 600, color: T.text }}>Bot created & managed for you</div>
                <div style={{ fontFamily: T.font, fontSize: 12, color: T.hint, marginTop: 1 }}>
                  Ready to start the cloud build - no setup needed
                </div>
              </div>
            </div>
          ) : botInit ? (
            <>
              {/* deep link issued — the owner confirms creation inside Telegram */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
                <TGIcon name="send" size={16} color={T.accent} stroke={2} />
                <span style={{ fontFamily: T.font, fontSize: 13, color: T.sub, lineHeight: '17px', flex: 1 }}>
                  One tap left — confirm in Telegram and @{handle} is created & managed for you.
                </span>
              </div>
              {botInit.deep_link && (
                <button onClick={() => openTgLink(botInit.deep_link!)} style={{
                  ...btnReset, width: '100%', height: 44, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  backgroundColor: T.accent, color: '#fff', fontFamily: T.font, fontSize: 15, fontWeight: 600,
                }}>
                  <TGIcon name="send" size={17} color="#fff" stroke={2} /> Create in Telegram
                </button>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
                <Spinner color={T.hint} size={14} />
                <span style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint }}>
                  Waiting for the bot — this updates automatically…
                </span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
                <TGIcon name="bolt" size={16} color={T.accent} />
                <span style={{ fontFamily: T.font, fontSize: 13, color: T.sub, lineHeight: '17px', flex: 1 }}>
                  No bot yet — we'll create and manage one for you. No BotFather or tokens.
                </span>
              </div>
              <button onClick={onCreate} disabled={creating} style={{
                ...btnReset, width: '100%', height: 44, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                backgroundColor: T.accent, color: '#fff', fontFamily: T.font, fontSize: 15, fontWeight: 600,
                cursor: creating ? 'default' : 'pointer',
              }}>
                {creating ? <><Spinner size={16} /> Creating bot…</> : <><TGIcon name="plus" size={18} color="#fff" stroke={2.4} /> Create the bot</>}
              </button>
              {createError && (
                <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.amber, marginTop: 9, lineHeight: '17px' }}>
                  {createError}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      <SpecBlock T={T} title="What your bot will do">
        {caps.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '9px 0', borderTop: i ? `0.5px solid ${T.sep}` : 'none' }}>
            <TGIcon name="check" size={18} color={T.green} stroke={2.4} />
            <span style={{ fontFamily: T.font, fontSize: 14.5, color: T.text, lineHeight: '20px' }}>{c}</span>
          </div>
        ))}
      </SpecBlock>

      <SpecBlock T={T} title="Production plan">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {plan.map(s => (
            <span key={s} style={{
              fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.text, padding: '7px 11px', borderRadius: 9,
              background: T.dark ? 'rgba(255,255,255,0.05)' : '#f3f5f8', border: `0.5px solid ${T.sep}`,
            }}>{s}</span>
          ))}
        </div>
      </SpecBlock>

      <div style={{ display: 'flex', gap: 10 }}>
        <MiniStat T={T} icon="clock" label="Build tasks" value={taskCount != null ? String(taskCount) : '—'} />
        <MiniStat T={T} icon="server" label="Build mode" value="Cloud" />
      </div>
    </div>
  );
}
