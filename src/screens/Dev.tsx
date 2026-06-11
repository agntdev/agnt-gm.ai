// Dev — Stage 4: three parallel build tracks. The build animation is
// simulated (no live-progress API); the log is seeded with real task titles.
import { useEffect, useRef } from 'react';
import { Theme } from '../theme';
import { TGIcon, Card, Pill, Stepper, ProgressBar } from '../ui';

export const DEV_TRACKS = [
  { id: 'code', icon: 'code', label: 'Write code', steps: ['Scaffolding bot…', 'Handlers & commands…', 'Wiring skills…', 'Code complete'] },
  { id: 'deploy', icon: 'server', label: 'Deploy on VPS', steps: ['Provisioning server…', 'Building container…', 'Setting webhook…', 'Live on edge node'] },
  { id: 'tests', icon: 'beaker', label: 'Tests coverage', steps: ['Generating tests…', 'Running suite…', 'Measuring coverage…', '94% covered'] },
] as const;

export interface DevProgress { code: number; deploy: number; tests: number }
export interface DevLogLine { tag: string; t: string; c: string }

export function DevScreen({ T, progress, log }: { T: Theme; progress: DevProgress; log: DevLogLine[] }) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [log]);
  return (
    <div style={{ padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Stepper T={T} steps={[0, 1, 2, 3, 4]} current={3} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pill T={T} tone="accent">Stage 4 · Building</Pill>
        <span style={{ fontFamily: T.font, fontSize: 13, color: T.hint }}>3 agents working in parallel</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {DEV_TRACKS.map(tr => {
          const pct = progress[tr.id] || 0;
          const done = pct >= 100;
          const stepIdx = Math.min(tr.steps.length - 1, Math.floor(pct / 25));
          return (
            <Card T={T} key={tr.id} pad={14}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 11 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                  background: done ? T.greenSoft : T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {done ? <TGIcon name="check" size={20} color={T.green} stroke={2.5} /> : <TGIcon name={tr.icon} size={19} color={T.accent} stroke={1.9} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 600, color: T.text }}>{tr.label}</div>
                  <div style={{ fontFamily: T.font, fontSize: 13, color: done ? T.green : T.hint, marginTop: 1 }}>{tr.steps[stepIdx]}</div>
                </div>
                <span style={{ fontFamily: T.mono, fontSize: 13.5, fontWeight: 600, color: done ? T.green : T.sub }}>{Math.round(pct)}%</span>
              </div>
              <ProgressBar T={T} value={pct} color={done ? T.green : T.accent} />
            </Card>
          );
        })}
      </div>

      <div>
        <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 4px 9px' }}>Live log</div>
        <div ref={logRef} style={{
          background: T.dark ? '#0a1119' : '#0d1620', borderRadius: 14, padding: 14, height: 120, overflow: 'auto',
        }}>
          {log.map((ln, i) => (
            <div key={i} style={{ fontFamily: T.mono, fontSize: 12, color: ln.c, lineHeight: '19px', animation: 'tgline .2s ease' }}>
              <span style={{ color: 'rgba(255,255,255,0.35)' }}>{ln.tag} </span>{ln.t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
