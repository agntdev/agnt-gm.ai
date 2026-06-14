// api/client.ts — typed client for the agnt API (https://api.agnt-gm.ai).
// Dev goes through the Vite proxy (/api); production builds call the API
// directly (CORS allows the deployed origins). Override with VITE_API_BASE.

const BASE: string = (import.meta.env.VITE_API_BASE as string | undefined)
  || (import.meta.env.DEV ? '/api' : 'https://api.agnt-gm.ai/api');

export class ApiError extends Error {
  status: number;
  details?: string;
  constructor(status: number, message: string, details?: string) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Session token (JWT) issued by POST /auth/telegram — attached to every call.
let authToken: string | null = null;
export function setAuthToken(token: string | null): void { authToken = token; }

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  if (!res.ok && res.status !== 202) {
    throw new ApiError(res.status, json?.error || res.statusText || 'request failed', json?.details);
  }
  return json as T;
}

// ── Projects ──────────────────────────────────────────────────

export type ProjectStatus =
  | 'validating' | 'ready_to_publish' | 'publishing' | 'live'
  | 'rejected' | 'failed' | 'completed' | string;

export interface Project {
  id: string;
  slug: string;
  name: string;
  status: ProjectStatus;
  short_description?: string;
  goal_of_project?: string;
  about_of_project?: string;
  rejection_reason?: string;
  needs_frontend?: boolean;
  needs_backend?: boolean;
  needs_database?: boolean;
  database_kind?: string;
  token_symbol?: string;
  github_repo_url?: string;
  github_project_url?: string;
  live_url?: string;
  logo_url?: string;
  preview_image_url?: string;
  open_tasks?: number;
  open_easy?: number;
  open_hard?: number;
  active_agents?: number;
  prs_merged_7d?: number;
  owner_wallet_address?: string;
  created_at?: string;
  published_at?: string;
  build_mode?: string; // 'local_agent' | 'platform_agent' once the API ships it
}

export interface ProjectCreated {
  project: Project;
  task_count?: number;
  next_step?: string;
}

export interface ProjectDetail {
  project: Project;
  readme_md?: string;
  tokenomics?: unknown;
}

export interface ProjectList {
  projects: Project[];
  total: number;
  limit: number;
  offset: number;
}

// Authorized via Telegram (Bearer token) — the owner is derived from the
// session; no wallet address needed at creation (bind one later to fund).
export function createProject(rawIdea: string): Promise<ProjectCreated> {
  return request('POST', '/builder/projects', { raw_idea: rawIdea });
}

export function getProject(idOrSlug: string): Promise<ProjectDetail> {
  return request('GET', `/builder/projects/${encodeURIComponent(idOrSlug)}`);
}

export interface PublishResult {
  project: Project;
  github_repo_url?: string;
  issues_opened?: number;
}

export function publishProject(id: string): Promise<PublishResult> {
  return request('POST', `/builder/projects/${encodeURIComponent(id)}/publish`);
}

// ── Owner ↔ AI chat (clarify the idea → draft project → pipeline) ──
// POST /builder/chat creates a draft project from the first message and runs
// the first AI turn. Poll GET .../chat/messages with the id cursor; quick
// replies arrive as `options`, deploy logs as role=system, and `ai_thinking`
// drives the typing indicator.

export interface ChatMessage {
  id: number;
  role: 'owner' | 'assistant' | 'system' | string;
  content: string;
  options?: string[];
  data?: unknown;
  created_at?: string;
}

export interface ChatPoll {
  messages: ChatMessage[];
  ai_thinking?: boolean;
}

export interface ChatStarted {
  project_id: string;
  status: string;
  poll_url?: string;
}

export function startChat(message: string): Promise<ChatStarted> {
  return request('POST', '/builder/chat', { message });
}

export function sendChatMessage(idOrSlug: string, message: string): Promise<ChatPoll> {
  return request('POST', `/builder/projects/${encodeURIComponent(idOrSlug)}/chat/messages`, { message });
}

export function getChatMessages(idOrSlug: string, after = 0, limit = 50): Promise<ChatPoll> {
  return request('GET', `/builder/projects/${encodeURIComponent(idOrSlug)}/chat/messages?after=${after}&limit=${limit}`);
}

// ── Managed bot (real Telegram bot, created via the manager bot) ──
// initiate: records a suggested username, returns the manager-bot deep link
// the owner taps inside Telegram (pre-filled child-bot creation screen).
// Idempotent — repeat calls return the same (or a fresh) suggestion.
export interface BotInitiate {
  project_id?: string;
  project_slug?: string;
  suggested_username?: string;
  manager_bot?: string;
  deep_link?: string;
  request_managed_bot?: boolean;
  instructions?: string;
}

export function initiateBot(idOrSlug: string): Promise<BotInitiate> {
  return request('POST', `/builder/projects/${encodeURIComponent(idOrSlug)}/bot/initiate`);
}

export interface ProjectBot {
  bot_username?: string;
  bot_name?: string;
  paused?: boolean;      // managed bot paused (webhook off) — once the API ships it
  paused_at?: string;
}

// 404 until the managed-bot poller lands the row → null, keep polling.
export async function getProjectBot(idOrSlug: string): Promise<ProjectBot | null> {
  try {
    return await request('GET', `/builder/projects/${encodeURIComponent(idOrSlug)}/bot`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

// Not in the API yet — called optimistically; 404/405 → the app falls back
// to hiding the bot locally, and upgrades automatically once this ships.
export function deleteProject(idOrSlug: string): Promise<unknown> {
  return request('DELETE', `/builder/projects/${encodeURIComponent(idOrSlug)}`);
}

// ── Build mode: who builds the tasks ──────────────────────────
// 'platform' — the platform's agents build and ship PRs.
// 'local'    — the owner's connected agent does the work; platform only
//              runs gates + deploys.
// Not in the API yet — set optimistically (404 tolerated, mode kept locally).
export type BuildMode = 'platform' | 'local';

export function setBuildModeApi(idOrSlug: string, mode: BuildMode): Promise<unknown> {
  return request('PUT', `/builder/projects/${encodeURIComponent(idOrSlug)}/build-mode`, {
    mode: mode === 'local' ? 'local_agent' : 'platform_agent',
  });
}

export function listProjectsByAgent(agentId: string, limit = 50): Promise<ProjectList> {
  return request('GET', `/builder/projects?owner_agent_id=${encodeURIComponent(agentId)}&limit=${limit}`);
}

// ── Telegram Mini-App auth (silent, via WebApp initData) ──────
// Validates the initData HMAC against the bot token server-side and issues a
// session JWT for an auto-created Telegram-owned agent.

export interface TelegramAuthResult {
  jwt?: string;
  token?: string;
  agent?: { id: string; display_name?: string; telegram_username?: string; github_username?: string };
}

export function authTelegram(initData: string): Promise<TelegramAuthResult> {
  return request('POST', '/auth/telegram', { init_data: initData });
}

// ── Tasks ─────────────────────────────────────────────────────

export interface TaskItem {
  id: string;
  slug: string;
  title: string;
  status: string;
  difficulty?: 'easy' | 'medium' | 'hard' | string;
  weight?: number;
  reward_amount?: number;
  reward_amount_human?: string;
  is_claimed?: boolean;
  claimers_count?: number;
  github_issue_url?: string;
  pr_url?: string;
  pr_number?: number;
  solved_by_agent_id?: string;
  // DAG extras (chat-created projects)
  phase?: string;
  depends_on?: string[];
  claim_reason?: string;
}

export interface TaskDetail {
  id?: string;
  slug: string;
  title: string;
  body_md?: string;
  github_issue_url?: string;
  pr_url?: string;
  status?: string;
}

// Full task body — works for both legacy and DAG tasks.
export async function getTaskDetail(idOrSlug: string, taskSlug: string): Promise<TaskDetail | null> {
  try {
    const r = await request<{ task?: TaskDetail }>('GET',
      `/builder/projects/${encodeURIComponent(idOrSlug)}/tasks/${encodeURIComponent(taskSlug)}`);
    return r.task ?? null;
  } catch {
    return null;
  }
}

export interface TaskList {
  project_id: string;
  project_slug: string;
  token_symbol?: string;
  project_github_url?: string;
  tasks: TaskItem[];
}

export function listProjectTasks(idOrSlug: string): Promise<TaskList> {
  return request('GET', `/builder/projects/${encodeURIComponent(idOrSlug)}/tasks`);
}

// ── Task DAG (chat-created AGNTDEV projects) ──────────────────
// These projects keep their work in a per-phase task graph; the legacy
// /tasks list is empty for them. fetchProjectTasks() unifies the two.

export interface DagTask {
  slug: string;
  title: string;
  task_kind?: string; // foundation | feature | integration | doc | fix
  phase?: string;
  status: string; // open | in_progress | done
  depends_on?: string[];
  claimable?: boolean;
  claim_reason?: string;
  claimers?: unknown[];
}

export interface DagInfo {
  current_phase?: string;
  phase_status?: string;
  next_action?: string;
  next_action_reason?: string;
}

export interface ProjectDag extends DagInfo {
  project_id: string;
  project_slug: string;
  tasks: DagTask[];
}

export function getProjectDag(idOrSlug: string): Promise<ProjectDag> {
  return request('GET', `/builder/projects/${encodeURIComponent(idOrSlug)}/dag`);
}

export interface UnifiedTasks {
  tasks: TaskItem[];
  token_symbol?: string;
  dag?: DagInfo;
}

// DAG first (the real system for chat-created projects), legacy list as
// the fallback for older bounty-style projects.
export async function fetchProjectTasks(idOrSlug: string): Promise<UnifiedTasks> {
  try {
    const d = await getProjectDag(idOrSlug);
    if (d.tasks?.length || d.current_phase) {
      return {
        tasks: (d.tasks || []).map(t => ({
          id: t.slug,
          slug: t.slug,
          title: t.title,
          status: t.status,
          difficulty: t.task_kind, // shown as the row pill
          claimers_count: t.claimers?.length || 0,
          is_claimed: (t.claimers?.length || 0) > 0,
          phase: t.phase,
          depends_on: t.depends_on,
          claim_reason: t.claimable === false ? t.claim_reason : undefined,
        })),
        dag: {
          current_phase: d.current_phase,
          phase_status: d.phase_status,
          next_action: d.next_action,
          next_action_reason: d.next_action_reason,
        },
      };
    }
  } catch { /* no DAG — legacy project */ }
  const legacy = await listProjectTasks(idOrSlug);
  return { tasks: legacy.tasks || [], token_symbol: legacy.token_symbol };
}

// ── Deployments (real deploy history; most recent first) ─────

export interface Deployment {
  id?: string;
  kind?: 'prod' | 'preview' | string;
  status?: string;
  ref_sha?: string;
  failure_reason?: string;
  queued_at?: string;
  built_at?: string;
  deployed_at?: string;
  build_log_url?: string;
}

export function listDeployments(idOrSlug: string): Promise<{ deployments: Deployment[] }> {
  return request('GET', `/builder/projects/${encodeURIComponent(idOrSlug)}/deployments`);
}

// ── Agent link: one-time connect code → delegate key (CLI side) ──
// Mint is owner-scoped; the CLI exchanges the code via /auth/agent-link/claim.
// The mini-app only mints and polls — the code IS the credential.

export interface AgentLinkCode {
  code: string;
  expires_in?: number;
}

export interface AgentLinkStatus {
  status: 'pending' | 'connected';
  connected_client?: string;
  connected_at?: string;
}

export function mintAgentLink(projectId: string): Promise<AgentLinkCode> {
  return request('POST', `/builder/projects/${encodeURIComponent(projectId)}/agent-link`);
}

export function getAgentLink(projectId: string): Promise<AgentLinkStatus> {
  return request('GET', `/builder/projects/${encodeURIComponent(projectId)}/agent-link`);
}

// ── CLI auth session (device-flow: connect the owner's agent) ─

export interface CliSession {
  session_id: string;
  login_url: string;
  verification_code?: string;
  expires_in?: number;
  expires_at?: string;
}

export interface CliSessionPoll {
  status: 'pending' | 'ready' | 'expired';
  token?: string;
  jwt?: string;
  agent?: { id?: string; github_username?: string; display_name?: string };
}

export function createCliSession(clientName: string): Promise<CliSession> {
  return request('POST', '/auth/cli-session', { client_name: clientName });
}

export function pollCliSession(id: string): Promise<CliSessionPoll> {
  return request('GET', `/auth/cli-session/${encodeURIComponent(id)}`);
}

// ── Bot analytics (end-user usage of the DEPLOYED bot) ────────
// Not in the API yet — 404/405 → null; the overview shows real build stats
// until this lands. Mirrors the mock's "active users / today / vs. yest." card.
export interface BotAnalytics {
  active_users?: number;
  messages_today?: number;
  delta_pct?: number; // change vs. yesterday
  window?: string;
}

export async function getBotAnalytics(idOrSlug: string): Promise<BotAnalytics | null> {
  try {
    return await request('GET', `/builder/projects/${encodeURIComponent(idOrSlug)}/analytics`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return null;
    throw e;
  }
}

// ── Pause / resume the managed bot ────────────────────────────
// Not in the API yet — set optimistically (404/405 tolerated, state kept
// locally). The owner-visible status pill flips Live ⇄ Paused immediately.
export function setBotPaused(idOrSlug: string, paused: boolean): Promise<unknown> {
  return request('PUT', `/builder/projects/${encodeURIComponent(idOrSlug)}/bot/pause`, { paused });
}

// ── Local-agent registry (owner-scoped) + per-project assignment ──
// The "Add an agent" surface: the owner's connected local agents across all
// their projects, any of which can be assigned to a project to pick up its
// tasks. Not in the API yet — list 404/405 → [], assign/unassign optimistic.
// Until it ships, the manage sheet falls back to the single connected agent
// from getAgentLink() — no invented agents are shown.
export interface LocalAgent {
  id: string;
  name?: string;
  client?: string;            // 'claude' | 'codex' | …
  status?: 'online' | 'offline' | string;
  last_seen_at?: string;
  assigned?: boolean;         // assigned to the queried project
}

export async function listMyAgents(): Promise<LocalAgent[]> {
  try {
    const r = await request<{ agents?: LocalAgent[] }>('GET', '/builder/agents');
    return r.agents || [];
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return [];
    throw e;
  }
}

export async function listProjectAgents(idOrSlug: string): Promise<LocalAgent[]> {
  try {
    const r = await request<{ agents?: LocalAgent[] }>('GET', `/builder/projects/${encodeURIComponent(idOrSlug)}/agents`);
    return r.agents || [];
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return [];
    throw e;
  }
}

export function assignAgent(idOrSlug: string, agentId: string): Promise<unknown> {
  return request('POST', `/builder/projects/${encodeURIComponent(idOrSlug)}/agents/${encodeURIComponent(agentId)}/assign`);
}

export function unassignAgent(idOrSlug: string, agentId: string): Promise<unknown> {
  return request('DELETE', `/builder/projects/${encodeURIComponent(idOrSlug)}/agents/${encodeURIComponent(agentId)}`);
}

// ── One-time cloud agent run ──────────────────────────────────
// Triggers a SINGLE platform build pass (picks up the open tasks once, ships
// PRs, then stops) — distinct from always-on platform mode. Not in the API
// yet — 404/405 tolerated (the UI reports "couldn't start" only on real errors).
export interface CloudRun {
  run_id?: string;
  status?: string;
}

export function runCloudAgent(idOrSlug: string): Promise<CloudRun> {
  return request('POST', `/builder/projects/${encodeURIComponent(idOrSlug)}/cloud-run`);
}
