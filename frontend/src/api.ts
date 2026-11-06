// Typed client for the FastAPI backend (backend/main.py).

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export type RunStatus = 'running' | 'done' | 'error' | 'interrupted'

export interface RunRef {
  run_id: string
  status: RunStatus
}

export interface Ticket {
  id: number
  type: string
  requester: string
  subject: string
  sku: string | null
  size: string | null
  qty: number | null
  lease_id: number | null
  invoice_id: number | null
  status: string
  notes: string | null
  created_at: string
  resolved: boolean
  last_run: RunRef | null
}

export interface AgentReply {
  agent: string
  summary: string
  facts: string[]
  proposed_actions: string[]
  needs_human_approval: boolean
  open_questions: string[]
}

export interface Run {
  run_id: string
  ticket_id: number
  task: string
  status: RunStatus
  started_at: string
  finished_at: string | null
  error: string | null
}

export interface ToolCall {
  tool: string
  args: unknown
}

export interface AgentEvent {
  index: number
  ts: string
  run_id: string
  ticket_id: number | null
  agent: string | null
  chain: string[] | null
  step: number | null
  event: string
  said: string | null
  tools: ToolCall[]
  tool_results: { tool: string | null; result: string }[]
  reply: AgentReply | null
  total_tokens: number | null
}

export interface EventsPage {
  events: AgentEvent[]
  next_after: number
  total_entries: number
}

export interface Payment {
  id: number
  kind: string
  ref_id: number | null
  amount: number
  account: string
  paid_at: string
  approved_by: string
}

export interface Cash {
  account: string
  balance: number
  as_of: string
  shop_date: string | null
  payments: Payment[]
}

export interface Vendor {
  id: number
  name: string
  specialty: string
  lead_days: number
}

export type ApprovalKind = 'invoice' | 'rent' | 'purchase'

export interface ApprovalOption {
  kind: ApprovalKind
  title: string
  payee: string
  amount: number
  detail: string
  done: boolean
  done_reason: string | null
  qty?: number
  unit_cost?: number
  vendors?: Vendor[]
  vendor_id?: number
}

export interface Approvals {
  ticket_id: number
  balance: number
  options: ApprovalOption[]
  ready: boolean
  run_id: string | null
}

export interface ApprovalRequest {
  ticket_id: number
  kind: ApprovalKind
  run_id: string
  approved_by: string
  qty?: number
  vendor_id?: number
  expected_amount: number
}

export interface ApprovalResult {
  payment_id: number
  amount: number
  payee: string
  balance_before: number
  balance_after: number
  message: string
}

export interface Health {
  ok: boolean
  model: string
  portkey_key_set: boolean
  working_db: string
  audit_trail: string
  running_run_id: string | null
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(API_URL + path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError(0, `Can't reach the backend at ${API_URL}. Start it from backend/ with: uvicorn main:app --reload --port 8000`)
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = (body as { detail?: unknown }).detail
    throw new ApiError(res.status, typeof detail === 'string' ? detail : `Request failed (HTTP ${res.status})`)
  }
  return body as T
}

function query(params: Record<string, string | number | undefined>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return q ? `?${q}` : ''
}

export const api = {
  health: () => call<Health>('/api/health'),
  tickets: () => call<{ tickets: Ticket[] }>('/api/tickets'),
  runTicket: (id: number) => call<Run>(`/api/tickets/${id}/run`, { method: 'POST' }),
  events: (p: { run_id?: string; after?: number; limit?: number }) => call<EventsPage>(`/api/events${query(p)}`),
  approvals: (id: number) => call<Approvals>(`/api/tickets/${id}/approvals`),
  approve: (req: ApprovalRequest) => call<ApprovalResult>('/api/approvals', { method: 'POST', body: JSON.stringify(req) }),
  cash: () => call<Cash>('/api/cash'),
  reset: () => call<{ message: string }>('/api/reset', { method: 'POST' }),
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
