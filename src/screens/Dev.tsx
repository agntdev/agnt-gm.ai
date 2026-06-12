// Dev — Stage 4: the REAL build dashboard. Everything on this screen is
// derived from platform state: task statuses (open|in_progress|done) and
// claims from GET /tasks, deploy history from GET /deployments, and the
// project chat's role=system messages as the live log.
import { useEffect, useRef } from 'react';
import { Theme } from '../theme';
import { TaskItem, Deployment, ChatMessage, DagInfo } from '../api/client';
import { TGIcon, Card, Pill, Stepper, ProgressBar, Dot } from '../ui';

export interface DevStats {
  total: number;
  done: number;
  inProgress: number;
  claimers: number;
}

export function devStats(tasks: TaskItem[]): DevStats {
  const done = tasks.filter(t => t.status === 'done').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const claimers = tasks.reduce((n, t) => n + (t.claimers_count || 0), 0);
  return { total: tasks.length, done, inProgress, claimers };
}

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);

export function DevScreen({ T, tasks, deployments, dag, log }: {
  T: Theme; tasks: TaskItem[]; deployments: Deployment[]; dag?: DagInfo | null; log: ChatMessage[];
}) {
  const s = devStats(tasks);
  const latestProd = deployments.find(d => d.kind !== 'preview');
  const deployed = !!latestProd && !latestProd.failure_reason;
  const deployFailed = !!latestProd?.failure_reason;

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [log.length]);

  const codePct = pct(s.done, s.total);
  const pickedPct = pct(s.done + s.inProgress, s.total);

  const tracks = [
    {
      id: 'code', icon: 'code', label: 'Write code', value: codePct,
      sub: s.total === 0 ? 'waiting for tasks…' : `${s.done}/${s.total} tasks done`,
      done: s.total > 0 && s.done >= s.total,
    },
    {
      id: 'agents', icon: 'bolt', label: 'Agents on tasks', value: pickedPct,
      sub: s.inProgress > 0
        ? `${s.inProgress} being built now${s.claimers ? ` · ${s.claimers} claim${s.claimers > 1 ? 's' : ''}` : ''}`
        : s.claimers > 0 ? `${s.claimers} active claim${s.claimers > 1 ? 's' : ''}` : 'waiting for an agent to pick up…',
      done: s.total > 0 && s.done >= s.total,
    },
    {
      id: 'deploy', icon: 'server', label: 'Deploy on VPS', value: deployed ? 100 : 0,
      sub: deployFailed ? `deploy failed${latestProd?.ref_sha ? ` (${latestProd.ref_sha.slice(0, 7)})` : ''} — retrying after a fix`
        : deployed ? `live${latestProd?.ref_sha ? ` · ${latestProd.ref_sha.slice(0, 7)}` : ''}`
        : 'waiting for first deploy…',
      done: deployed, failed: deployFailed,
    },
  ];

  return (
    <div style={{ padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Stepper T={T} steps={[0, 1, 2, 3, 4]} current={3} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pill T={T} tone="accent">Stage 4 · Building</Pill>
        <span style={{ fontFamily: T.font, fontSize: 13, color: dag?.phase_status === 'failed' ? T.red : T.hint }}>
          {dag?.current_phase
            ? `${dag.current_phase} phase${dag.phase_status === 'failed' ? ' · fixing' : dag.phase_status ? ` · ${dag.phase_status}` : ''}`
            : s.claimers > 0 || s.inProgress > 0 ? 'agents working — live' : 'live status'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {tracks.map(tr => (
          <Card T={T} key={tr.id} pad={14}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 11 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                background: tr.failed ? T.redSoft : tr.done ? T.greenSoft : T.accentSoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {tr.failed ? <TGIcon name="close" size={19} color={T.red} stroke={2.4} />
                  : tr.done ? <TGIcon name="check" size={20} color={T.green} stroke={2.5} />
                  : <TGIcon name={tr.icon} size={19} color={T.accent} stroke={1.9} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 600, color: T.text }}>{tr.label}</div>
                <div style={{ fontFamily: T.font, fontSize: 13, color: tr.failed ? T.red : tr.done ? T.green : T.hint, marginTop: 1 }}>{tr.sub}</div>
              </div>
              <span style={{ fontFamily: T.mono, fontSize: 13.5, fontWeight: 600, color: tr.failed ? T.red : tr.done ? T.green : T.sub }}>{tr.value}%</span>
            </div>
            <ProgressBar T={T} value={tr.value} color={tr.failed ? T.red : tr.done ? T.green : T.accent} />
          </Card>
        ))}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 4px 9px' }}>
          <span style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3 }}>Live log</span>
          <Dot color={T.green} size={6} pulse />
        </div>
        <div ref={logRef} style={{
          background: T.dark ? '#0a1119' : '#0d1620', borderRadius: 14, padding: 14, height: 120, overflow: 'auto',
        }}>
          {log.length === 0 && (
            <span style={{ fontFamily: T.mono, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>waiting for build events…</span>
          )}
          {log.map(m => {
            const fail = /fail|error|🔴|❌/i.test(m.content);
            return (
              <div key={m.id} style={{
                fontFamily: T.mono, fontSize: 12, lineHeight: '19px',
                color: fail ? '#ff9b8a' : '#b9f6ca', animation: 'tgline .2s ease',
              }}>
                <span style={{ color: 'rgba(255,255,255,0.35)' }}>[build] </span>{m.content}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '0 2px' }}>
        <TGIcon name="clock" size={15} color={T.hint} stroke={1.9} />
        <span style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, lineHeight: '17px' }}>
          Real builds take a while — you can close the app and come back from My Bots anytime.
        </span>
      </div>
    </div>
  );
}
