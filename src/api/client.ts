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
