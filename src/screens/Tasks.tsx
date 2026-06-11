// Tasks — Stage 3: the build plan. The platform decomposed the spec into
// concrete tasks (GET /builder/projects/{id}/tasks); the connected agent
// picks them up one by one.
import { Theme } from '../theme';
import { TaskItem } from '../api/client';
import { TGIcon, Card, Pill, Dot, Spinner, Stepper } from '../ui';

const DIFF_TONE: Record<string, 'accent' | 'green' | 'neutral'> = {
  easy: 'green', medium: 'accent', hard: 'accent',
};

export function TasksScreen({ T, tasks, loading, agentName, tokenSymbol, error }: {
  T: Theme; tasks: TaskItem[]; loading: boolean; agentName: string; tokenSymbol?: string;
  error?: string | null;
}) {
  return (
    <div style={{ padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Stepper T={T} steps={[0, 1, 2, 3, 4]} current={2} />
      <Pill T={T} tone="accent" style={{ alignSelf: 'flex-start' }}>Stage 3 · Build plan</Pill>

      <div style={{ padding: '0 2px' }}>
        <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: -0.3 }}>
          {loading ? 'Preparing tasks…' : `${tasks.length} tasks for your agent`}
        </div>
        <div style={{ fontFamily: T.font, fontSize: 14.5, color: T.sub, lineHeight: '21px', marginTop: 6 }}>
          We turned your spec into a task list. Your connected agent picks these up and builds them one by one.
        </div>
      </div>

      {/* who's building */}
      <Card T={T} pad={12} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TGIcon name="bolt" size={18} color={T.accent} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.font, fontSize: 14.5, fontWeight: 600, color: T.text }}>{agentName} agent</div>
          <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint }}>Connected · will execute every task</div>
        </div>
        <Pill T={T} tone="green"><Dot color={T.green} size={6} /> Ready</Pill>
      </Card>

      {/* the task queue */}
      <div>
        <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.hint, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 4px 9px' }}>Task queue</div>
        <Card T={T} pad={0}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16 }}>
              <Spinner color={T.accent} size={16} />
              <span style={{ fontFamily: T.font, fontSize: 14, color: T.sub }}>Fetching the task queue…</span>
            </div>
          )}
          {!loading && tasks.length === 0 && (
            <div style={{ padding: 16, fontFamily: T.font, fontSize: 14, color: T.sub }}>
              Tasks are being prepared — they'll appear here as the platform opens them.
            </div>
          )}
          {tasks.map((t, i) => (
            <TaskRow key={t.id || t.slug} T={T} task={t} index={i + 1} first={i === 0} tokenSymbol={tokenSymbol} />
          ))}
        </Card>
      </div>

      {error && (
        <div style={{ fontFamily: T.font, fontSize: 13, color: T.amber, lineHeight: '18px', padding: '0 4px' }}>
          {error}
        </div>
      )}
    </div>
  );
}

function TaskRow({ T, task, index, first, tokenSymbol }: {
  T: Theme; task: TaskItem; index: number; first: boolean; tokenSymbol?: string;
}) {
  const diff = (task.difficulty || 'medium').toLowerCase();
  const tone = DIFF_TONE[diff] || 'neutral';
  const reward = task.reward_amount_human
    ? `${task.reward_amount_human}${tokenSymbol ? ` $${tokenSymbol}` : ''}`
    : null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
      borderTop: first ? 'none' : `0.5px solid ${T.sep}`,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 9, flexShrink: 0, background: T.accentSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.accent,
      }}>{index}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text, lineHeight: '19px' }}>{task.title}</div>
        <div style={{ fontFamily: T.font, fontSize: 12.5, color: T.hint, marginTop: 1, lineHeight: '17px' }}>
          {reward ? `Reward ${reward}` : task.slug}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
        <Pill T={T} tone={tone} style={{ height: 21, fontSize: 11, padding: '0 8px' }}>{diff}</Pill>
        <span style={{ fontFamily: T.font, fontSize: 11, color: T.hint }}>{task.status === 'open' ? 'queued' : task.status}</span>
      </div>
    </div>
  );
}
