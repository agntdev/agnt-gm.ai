// AgentManager — the "Add an agent" sheet (overview's agent card → Manage).
// One simple choice:
//   • Cloud agent — we deploy and run it (max one per bot).
//   • Local agent — connect your own Claude/Codex with a code.
import { useState, type ReactNode } from 'react';
import { Theme, btnReset } from '../theme';
import { runCloudAgent } from '../api/client';
import { payAndAssignCloudAgent, STAR_COST } from '../api/stars';
import { TGIcon, Spinner } from '../ui';

export function AgentManager({ T, project, cloudDeployed, onConnectNew, onCloudDeployed, onClose }: {
  T: Theme; project: { id: string; name: string };
  cloudDeployed: boolean; onConnectNew: () => void; onCloudDeployed: () => void; onClose: () => void;
}) {
  const [deployed, setDeployed] = useState(cloudDeployed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [confirmLocal, setConfirmLocal] = useState(false); // warn before deferring a live cloud agent

  // Tapping "Local agent" hands new tasks to the local agent (build_mode=local).
  // If a cloud agent is currently deployed, confirm first — otherwise an
  // accidental tap silently switches the bot off the cloud agent with nothing
  // connected yet.
  const pickLocal = () => {
    if (deployed) { setConfirmLocal(true); return; }
    onConnectNew();
  };

  const deployCloud = async () => {
    if (deployed || busy) return; // max one cloud agent per bot
    setBusy(true); setError(false);
    try {
      // Stars gate (10★): pay an invoice, then assign. Free no-op when charging
      // is disabled — payAndAssignCloudAgent runs runCloudAgent directly.
      const r = await payAndAssignCloudAgent(project.id, async () => { await runCloudAgent(project.id); });
      if (r === 'ok') { setDeployed(true); onCloudDeployed(); }
      else if (r === 'failed' || r === 'unconfirmed') setError(true);
      // 'cancelled' → user closed the payment sheet; leave the option idle.
    } catch { setError(true); }
    setBusy(false);
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.42)',
      display: 'flex', alignItems: 'flex-end', animation: 'tgfade .2s ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', background: T.cardBg, borderTopLeftRadius: 22, borderTopRightRadius: 22,
        paddingBottom: 'max(18px, env(safe-area-inset-bottom, 0px))', animation: 'tgsheet .3s cubic-bezier(.2,.8,.2,1)',
      }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: T.sep, margin: '8px auto 4px' }} />

        {confirmLocal ? (
          // detach confirmation — honest about what "go local" does today: it
          // doesn't stop/un-assign the cloud agent, it just makes the platform
          // defer to your local one for new tasks.
          <div style={{ padding: '12px 18px 6px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <TGIcon name="shield" size={21} color={T.amber} stroke={1.9} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text }}>Switch to a local agent?</div>
                <div style={{ fontFamily: T.font, fontSize: 13, color: T.sub, marginTop: 3, lineHeight: '18px' }}>
                  The platform will hand new tasks to your local agent instead of the cloud agent on {project.name}. You can switch back anytime.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmLocal(false)} style={{
                ...btnReset, flex: 1, height: 44, borderRadius: 12,
                background: T.dark ? 'rgba(255,255,255,0.06)' : '#f3f5f8',
                color: T.text, fontFamily: T.font, fontSize: 14.5, fontWeight: 600,
              }}>
                Keep cloud agent
              </button>
              <button onClick={onConnectNew} style={{
                ...btnReset, flex: 1, height: 44, borderRadius: 12,
                background: T.accent, color: '#fff', fontFamily: T.font, fontSize: 14.5, fontWeight: 600,
              }}>
                Switch to local
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: '8px 18px 4px' }}>
              <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>Add an agent</div>
              <div style={{ fontFamily: T.font, fontSize: 13, color: T.hint, marginTop: 2, lineHeight: '18px' }}>
                Put an agent on {project.name}'s tasks.
              </div>
            </div>

            <div style={{ padding: '14px 14px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* cloud — deploy one (max one per bot) */}
              <Option T={T} icon="cloud"
                title="Cloud agent"
                desc={deployed ? 'Deployed — running on our platform'
                  : error ? "Couldn't deploy — tap to retry"
                  : `We deploy and run one for you · ${STAR_COST.cloudAgent} ⭐`}
                tone={deployed ? 'green' : error ? 'amber' : 'hint'}
                onClick={deployCloud} disabled={deployed}
                right={busy ? <Spinner color={T.accent} size={18} />
                  : deployed ? <TGIcon name="check" size={20} color={T.green} stroke={2.4} />
                  : <TGIcon name="chevRight" size={18} color={T.hint} stroke={2} />} />

              {/* local — connect your own agent with a code */}
              <Option T={T} icon="code"
                title="Local agent"
                desc="Connect your Claude or Codex with a code"
                tone="hint"
                onClick={pickLocal}
                right={<TGIcon name="chevRight" size={18} color={T.hint} stroke={2} />} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Option({ T, icon, title, desc, tone, onClick, right, disabled }: {
  T: Theme; icon: string; title: string; desc: string;
  tone: 'hint' | 'green' | 'amber'; onClick: () => void; right: ReactNode; disabled?: boolean;
}) {
  const descColor = tone === 'green' ? T.green : tone === 'amber' ? T.amber : T.hint;
  return (
    <button onClick={disabled ? undefined : onClick} style={{
      ...btnReset, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 13,
      padding: '14px', borderRadius: 16, background: T.cardBg, border: `1px solid ${T.sep}`,
      boxShadow: T.shadow, cursor: disabled ? 'default' : 'pointer',
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <TGIcon name={icon} size={21} color={T.accent} stroke={1.9} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 600, color: T.text }}>{title}</div>
        <div style={{ fontFamily: T.font, fontSize: 12.5, color: descColor, marginTop: 2, lineHeight: '17px' }}>{desc}</div>
      </div>
      {right}
    </button>
  );
}
