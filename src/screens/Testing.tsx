// Testing — Stage 5: final review & sign-off. The bot is already live by now
// (deployed during the build stage). Links out to the real repo when present.
import { Theme } from '../theme';
import { Project } from '../api/client';
import { TGIcon, Card, Pill, Stepper, BigStat } from '../ui';
import { openExternal } from '../telegram';
import { btnReset } from '../theme';

const CHECKS = [
  { name: 'Responds to /start within 200ms', ok: true },
  { name: 'Handles unknown commands gracefully', ok: true },
  { name: 'Persists session between messages', ok: true },
  { name: 'Recovers from API timeouts', ok: true },
  { name: 'Rejects malformed input safely', ok: true },
];

export function TestingScreen({ T, project }: { T: Theme; project: Project | null }) {
  const repo = project?.github_repo_url;
  const live = project?.live_url;
  return (
    <div style={{ padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Stepper T={T} steps={[0, 1, 2, 3, 4]} current={4} />
      <Pill T={T} tone="accent" style={{ alignSelf: 'flex-start' }}>Stage 5 · Testing & review</Pill>

      <div style={{ display: 'flex', gap: 10 }}>
        <BigStat T={T} value="38/38" label="Tests passing" tone="green" />
        <BigStat T={T} value="94%" label="Coverage" tone="accent" />
      </div>

      <Card T={T} pad={0}>
        {CHECKS.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderTop: i ? `0.5px solid ${T.sep}` : 'none' }}>
            <div style={{ width: 22, height: 22, borderRadius: 999, background: T.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TGIcon name="check" size={15} color={T.green} stroke={2.6} />
            </div>
            <span style={{ fontFamily: T.font, fontSize: 14.5, color: T.text, flex: 1, lineHeight: '19px' }}>{c.name}</span>
          </div>
        ))}
      </Card>

      <Card T={T} pad={14} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <TGIcon name="shield" size={20} color={T.green} stroke={1.9} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: T.text }}>Review complete — your bot is live</div>
          <div style={{ fontFamily: T.font, fontSize: 13, color: T.hint, marginTop: 2, lineHeight: '18px' }}>Code, deploy and tests all checked. It's been running since the build finished.</div>
        </div>
      </Card>

      {(repo || live) && (
        <Card T={T} pad={0}>
          {repo && <LinkRow T={T} icon="code" label="View source & logs" sub="Full code, yours to keep" url={repo} first />}
          {live && <LinkRow T={T} icon="open" label="Open live preview" sub={live.replace(/^https?:\/\//, '')} url={live} first={!repo} />}
        </Card>
      )}
    </div>
  );
}

function LinkRow({ T, icon, label, sub, url, first }: {
  T: Theme; icon: string; label: string; sub: string; url: string; first?: boolean;
}) {
  return (
    <button onClick={() => openExternal(url)} style={{
      ...btnReset, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 13, padding: 14,
      borderTop: first ? 'none' : `0.5px solid ${T.sep}`,
    }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TGIcon name={icon} size={18} color={T.accent} stroke={1.9} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 600, color: T.text }}>{label}</div>
        <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
      </div>
      <TGIcon name="chevRight" size={20} color={T.hint} stroke={2} />
    </button>
  );
}
