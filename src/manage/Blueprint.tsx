// Blueprint — "The plan" viewer: the AI's structured read of the idea (Bold 1c).
// Dark-green summary card (archetype · completeness ring · title · summary ·
// voice), a terracotta "things to confirm" card, and one-open-at-a-time
// accordions (commands · flows · what it remembers · tricky cases).
// Data: GET /projects/:id/quality/blueprint (owner). 404/403 → graceful empty.
import { useEffect, useState, ReactNode } from 'react';
import { Theme, btnReset, hexA } from '../theme';
import { Blueprint, getBlueprint } from '../api/client';
import { useT } from '../i18n';
import { TGIcon, Spinner } from '../ui';

function Accordion({ T, id, open, setOpen, icon, title, count, children }: {
  T: Theme; id: string; open: string | null; setOpen: (v: string | null) => void;
  icon: string; title: string; count: number; children: ReactNode;
}) {
  if (count === 0) return null;
  const isOpen = open === id;
  return (
    <div style={{ background: T.cardBg, border: `1px solid ${T.sep}`, borderRadius: 18, boxShadow: T.shadow, overflow: 'hidden' }}>
      <button onClick={() => setOpen(isOpen ? null : id)} style={{
        ...btnReset, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
      }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: T.sage, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <TGIcon name={icon} size={18} color="#2f8f6f" stroke={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.font, fontSize: 15.5, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>{title}</div>
          <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, marginTop: 1 }}>{count}</div>
        </div>
        <span style={{ display: 'inline-flex', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }}>
          <TGIcon name="chevDown" size={18} color={T.hint} stroke={2.2} />
        </span>
      </button>
      {isOpen && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
      )}
    </div>
  );
}

function Tile({ T, children }: { T: Theme; children: ReactNode }) {
  return (
    <div style={{ background: T.nestedBg, borderRadius: 13, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 11 }}>{children}</div>
  );
}

export function BlueprintScreen({ T, projectId }: { T: Theme; projectId: string }) {
  const t = useT();
  const [bp, setBp] = useState<Blueprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>('commands');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBlueprint(projectId)
      .then(b => { if (!cancelled) { setBp(b); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}><Spinner color={T.accent} size={22} /></div>;
  }
  if (!bp) {
    return (
      <div style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: T.nestedBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TGIcon name="beaker" size={24} color={T.hint} stroke={2} />
        </div>
        <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text }}>{t('The plan is being prepared', 'План готовится')}</div>
        <div style={{ fontFamily: T.font, fontSize: 13.5, color: T.sub, lineHeight: '19px', maxWidth: 300 }}>
          {t('Once your idea is understood, the structured plan shows up here.', 'Как только идея будет понята, здесь появится структурированный план.')}
        </div>
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, Math.round((bp.completeness_score ?? 0) * 100)));
  const entryPoints = bp.content?.entry_points ?? [];
  const flows = bp.content?.flows ?? [];
  const entities = bp.content?.data_entities ?? [];
  const edges = bp.content?.edge_cases ?? [];

  const retention = (r?: string): { label: string; bg: string; fg: string } | null => {
    if (r === 'persistent') return { label: t('kept', 'хранится'), bg: T.sage, fg: '#2f8f6f' };
    if (r === 'session') return { label: t('temporary', 'временно'), bg: T.goldSoft, fg: T.gold };
    return null;
  };
  const stepsText = (s?: string[] | string): string => Array.isArray(s) ? s.join(' → ') : (s || '');

  return (
    <div style={{ padding: '14px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* summary card — dark green */}
      <div style={{ background: T.text, borderRadius: 22, boxShadow: T.heroShadow, padding: '20px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {bp.archetype
            ? <span style={{ display: 'inline-flex', alignItems: 'center', background: hexA(T.accentText, 0.12), borderRadius: 999, padding: '5px 13px', fontFamily: T.font, fontSize: 12, fontWeight: 700, letterSpacing: 0.8, color: T.accentText, textTransform: 'uppercase' }}>{bp.archetype}</span>
            : <span />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: T.font, fontSize: 12, color: hexA(T.accentText, 0.6) }}>{t('complete', 'готово')}</div>
              <div style={{ fontFamily: T.font, fontSize: 17, fontWeight: 700, color: T.accentText, letterSpacing: -0.3 }}>{pct}%</div>
            </div>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: `conic-gradient(${T.green} ${pct}%, ${hexA(T.accentText, 0.15)} 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: T.text }} />
            </div>
          </div>
        </div>
        <div style={{ fontFamily: T.font, fontSize: 24, fontWeight: 700, color: T.accentText, letterSpacing: -0.5, marginTop: 16 }}>{bp.title || t('Your bot', 'Ваш бот')}</div>
        {bp.summary && <div style={{ fontFamily: T.font, fontSize: 15, color: hexA(T.accentText, 0.85), lineHeight: '22px', marginTop: 8 }}>{bp.summary}</div>}
        {bp.voice && <div style={{ fontFamily: T.font, fontSize: 13.5, color: hexA(T.accentText, 0.6), marginTop: 12 }}>{t('Voice:', 'Тон:')} {bp.voice}</div>}
      </div>

      {/* a few things to confirm */}
      {(bp.missing_fields?.length ?? 0) > 0 && (
        <div style={{ background: '#FBF3EC', border: '1px solid #eccfbf', borderRadius: 18, padding: '14px 16px' }}>
          <div style={{ fontFamily: T.font, fontSize: 12, fontWeight: 700, color: T.accentPressed, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 11 }}>{t('A few things to confirm', 'Нужно уточнить')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
            {bp.missing_fields!.map((m, i) => (
              <span key={i} style={{ background: T.cardBg, border: `1px solid ${hexA(T.accent, 0.4)}`, borderRadius: 999, padding: '8px 14px', fontFamily: T.font, fontSize: 14, fontWeight: 600, color: T.accentPressed }}>{m}</span>
            ))}
          </div>
        </div>
      )}

      {/* commands & buttons */}
      <Accordion T={T} id="commands" open={open} setOpen={setOpen} icon="code" title={t('Commands & buttons', 'Команды и кнопки')} count={entryPoints.length}>
        {entryPoints.map((e, i) => (
          <Tile key={i} T={T}>
            <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.accent, flexShrink: 0 }}>{e.command}</span>
            <span style={{ flex: 1, minWidth: 0, fontFamily: T.font, fontSize: 13.5, color: T.text, lineHeight: '18px' }}>{e.description}</span>
            {e.actor && <span style={{ flexShrink: 0, fontFamily: T.font, fontSize: 12, fontWeight: 600, color: T.sub, background: T.cardBg, border: `1px solid ${T.sep}`, borderRadius: 999, padding: '3px 10px' }}>{e.actor}</span>}
          </Tile>
        ))}
      </Accordion>

      {/* what it does — flows */}
      <Accordion T={T} id="flows" open={open} setOpen={setOpen} icon="bolt" title={t('What it does', 'Что делает')} count={flows.length}>
        {flows.map((f, i) => (
          <div key={i} style={{ background: T.nestedBg, borderRadius: 13, padding: '11px 13px' }}>
            <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 700, color: T.text }}>{f.name}</div>
            {(f.when || f.trigger) && <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.gold, marginTop: 2 }}>{t('when:', 'когда:')} {f.when || f.trigger}</div>}
            {(stepsText(f.steps) || f.summary) && <div style={{ fontFamily: T.font, fontSize: 13, color: T.sub, marginTop: 4, lineHeight: '18px' }}>{stepsText(f.steps) || f.summary}</div>}
          </div>
        ))}
      </Accordion>

      {/* what it remembers — data entities */}
      <Accordion T={T} id="data" open={open} setOpen={setOpen} icon="server" title={t('What it remembers', 'Что запоминает')} count={entities.length}>
        {entities.map((e, i) => {
          const r = retention(e.retention);
          return (
            <Tile key={i} T={T}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 650, color: T.text }}>{e.name}</div>
                {e.description && <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.sub, marginTop: 1, lineHeight: '17px' }}>{e.description}</div>}
              </div>
              {r && <span style={{ flexShrink: 0, fontFamily: T.font, fontSize: 12, fontWeight: 700, color: r.fg, background: r.bg, borderRadius: 999, padding: '3px 10px' }}>{r.label}</span>}
            </Tile>
          );
        })}
      </Accordion>

      {/* tricky cases — edge cases */}
      <Accordion T={T} id="edges" open={open} setOpen={setOpen} icon="shield" title={t('Tricky cases', 'Сложные случаи')} count={edges.length}>
        {edges.map((e, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '2px 4px' }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: T.accent, marginTop: 7, flexShrink: 0 }} />
            <span style={{ flex: 1, fontFamily: T.font, fontSize: 13.5, color: T.text, lineHeight: '19px' }}>{e}</span>
          </div>
        ))}
      </Accordion>

      {(bp.assumptions?.length ?? 0) > 0 && (
        <div style={{ fontFamily: T.font, fontSize: 12, color: T.hint, lineHeight: '17px', padding: '0 4px' }}>
          {t('Assumptions:', 'Предположения:')} {bp.assumptions!.join(' · ')}
        </div>
      )}
    </div>
  );
}
