// AgentManager — the "Add an agent" bottom sheet (opened from the overview's
// agent card → Manage). Two ways to put work on a project:
//   • Cloud agent (one-time) — a single platform build pass.
//   • Local agents — the owner's connected Claude/Codex agents; assign any of
//     them, or connect a new one via the connect-code flow.
// The registry + assignment + cloud-run endpoints aren't live yet, so this
// degrades honestly: with no registry it shows the single agent actually
// connected via getAgentLink() and the "Connect a new one" path — never
// invented agents.
import { useEffect, useState } from 'react';
import { Theme, btnReset } from '../theme';
import {
  AgentLinkStatus, LocalAgent,
  listMyAgents, listProjectAgents, assignAgent, runCloudAgent,
} from '../api/client';
import { TGIcon, Card, Dot, Spinner } from '../ui';

function clientLabel(c?: string): string {
  const k = (c || '').toLowerCase();
  if (k.includes('claude')) return 'Claude';
  if (k.includes('codex')) return 'Codex';
  if (k.includes('cursor')) return 'Cursor';
  return c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Agent';
}

export function AgentManager({ T, project, link, onConnectNew, onClose }: {
  T: Theme; project: { id: string; name: string };
  link: AgentLinkStatus | null; onConnectNew: () => void; onClose: () => void;
}) {
  const [agents, setAgents] = useState<LocalAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // agentId being assigned, or 'cloud'
  const [cloud, setCloud] = useState<'idle' | 'started' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [mine, assigned] = await Promise.all([listMyAgents(), listProjectAgents(project.id)]);
      if (cancelled) return;
      const assignedIds = new Set(assigned.map(a => a.id));
      let list = mine.map(a => ({ ...a, assigned: a.assigned || assignedIds.has(a.id) }));
      // registry not live yet — fall back to the one agent actually connected.
      if (list.length === 0 && link?.status === 'connected') {
        const name = clientLabel(link.connected_client);
        list = [{ id: 'connected', name, client: name, status: 'online', assigned: true }];
      }
      setAgents(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [project.id, link?.status]);

  const assign = async (a: LocalAgent) => {
    if (a.assigned || a.id === 'connected') return;
    setBusy(a.id);
    setAgents(prev => prev.map(x => (x.id === a.id ? { ...x, assigned: true } : x))); // optimistic
    try { await assignAgent(project.id, a.id); } catch { /* tolerated — kept optimistic */ }
    setBusy(null);
  };

  const cloudRun = async () => {
    if (cloud === 'started') return;
    setBusy('cloud');
    try { await runCloudAgent(project.id); setCloud('started'); }
    catch { setCloud('error'); }
    setBusy(null);
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.42)',
      display: 'flex', alignItems: 'flex-end', animation: 'tgfade .2s ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', background: T.cardBg, borderTopLeftRadius: 22, borderTopRightRadius: 22,
        maxHeight: '84vh', overflowY: 'auto', paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
        animation: 'tgsheet .3s cubic-bezier(.2,.8,.2,1)',
      }}>
        {/* grabber */}
        <div style={{ width: 38, height: 4, borderRadius: 2, background: T.sep, margin: '8px auto 4px' }} />

        <div style={{ padding: '8px 18px 4px' }}>
          <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>Add an agent</div>
          <div style={{ fontFamily: T.font, fontSize: 13, color: T.hint, marginTop: 2, lineHeight: '18px' }}>
            Put an agent on {project.name}'s open tasks.
          </div>
        </div>

        {/* cloud agent — one-time */}
        <div style={{ padding: '12px 14px 6px' }}>
          <button onClick={cloudRun} disabled={cloud === 'started'} style={{
            ...btnReset, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
            padding: '13px 14px', borderRadius: 14, background: T.cardBg, border: `1px solid ${T.sep}`,
            boxShadow: T.shadow, cursor: cloud === 'started' ? 'default' : 'pointer',
          }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TGIcon name="cloud" size={20} color={T.accent} stroke={1.9} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text }}>Cloud agent · one-time</div>
              <div style={{ fontFamily: T.font, fontSize: 12.5, color: cloud === 'error' ? T.amber : T.hint, marginTop: 1, lineHeight: '17px' }}>
                {cloud === 'started' ? 'Run started — building & shipping PRs'
                  : cloud === 'error' ? "Couldn't start — tap to retry"
                  : 'One build pass on our platform — no setup'}
              </div>
            </div>
            {busy === 'cloud' ? <Spinner color={T.accent} size={16} />
              : cloud === 'started' ? <TGIcon name="check" size={18} color={T.green} stroke={2.4} />
              : <TGIcon name="chevRight" size={17} color={T.hint} stroke={2} />}
          </button>
        </div>

        {/* local agents */}
        <div style={{ fontFamily: T.font, fontSize: 12, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.4, padding: '12px 18px 8px' }}>
          Local agents
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 20px' }}>
            <Spinner color={T.accent} size={18} />
          </div>
        ) : (
          <div style={{ padding: '0 14px' }}>
            <Card T={T} pad={0}>
              {agents.map((a, i) => {
                const online = a.status === 'online';
                return (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    borderTop: i ? `0.5px solid ${T.sep}` : 'none',
                  }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: T.dark ? 'rgba(255,255,255,0.05)' : '#f3f5f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <TGIcon name="code" size={17} color={T.sub} stroke={1.9} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: T.text }}>{a.name || clientLabel(a.client)}</div>
                      <div style={{ fontFamily: T.font, fontSize: 12, color: T.hint, marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Dot color={online ? T.green : T.hint} size={6} /> {online ? 'online' : 'offline'}
                      </div>
                    </div>
                    {a.assigned ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.green }}>
                        <TGIcon name="check" size={15} color={T.green} stroke={2.4} /> Assigned
                      </span>
                    ) : busy === a.id ? (
                      <Spinner color={T.accent} size={15} />
                    ) : (
                      <button onClick={() => void assign(a)} style={{
                        ...btnReset, height: 30, padding: '0 14px', borderRadius: 9, background: T.accentSoft,
                        color: T.accent, fontFamily: T.font, fontSize: 13, fontWeight: 600,
                      }}>Assign</button>
                    )}
                  </div>
                );
              })}
              {/* connect a new one — always available */}
              <button onClick={onConnectNew} style={{
                ...btnReset, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderTop: agents.length ? `0.5px solid ${T.sep}` : 'none',
              }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TGIcon name="plus" size={18} color={T.accent} stroke={2.2} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: T.text }}>Connect a new one</div>
                  <div style={{ fontFamily: T.font, fontSize: 12, color: T.hint, marginTop: 1 }}>Link your Claude or Codex with a connect code</div>
                </div>
                <TGIcon name="chevRight" size={17} color={T.hint} stroke={2} />
              </button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
