// Turns the audit-trail events of one run into what the desk shows:
// crew stations, hand-off links, the radio transcript, telemetry and the final call.
import type { AgentEvent, AgentReply } from './api'
import { AGENT_IDS, CREW, isAgent, type AgentId } from './crew'

export type StationStatus = 'standby' | 'active' | 'done' | 'error'
export type LineKind = 'system' | 'task' | 'say' | 'tool' | 'handoff' | 'result' | 'final' | 'warn' | 'error' | 'human' | 'landed' | 'gap'

export interface Station {
  id: AgentId
  status: StationStatus
  activity: string | null
  activityKind: LineKind | null
  tasks: string[]
  toolCounts: Record<string, number>
  handoffsTo: AgentId[]
  summary: string | null
  reply: AgentReply | null
  steps: number
}

export type LinkState = 'pending' | 'live' | 'done' | 'refused'

export interface Link {
  from: AgentId
  to: AgentId
  task: string
  state: LinkState
}

export interface Line {
  key: string
  ts: string
  agent: string | null
  kind: LineKind
  text: string
  extra?: string
  to?: AgentId
}

export interface RunView {
  stations: Record<AgentId, Station>
  links: Link[]
  lines: Line[]
  finalReply: AgentReply | null
  startTs: string | null
  endTs: string | null
  ended: 'done' | 'error' | null
  tokens: number
  toolCalls: number
  handoffs: number
  toolSet: string[]
  /** Who FLIGHT called in its first hand-off turn (several = called in parallel). */
  firstHandoffs: AgentId[]
}

export function formatArgs(args: unknown): string {
  if (args == null) return ''
  if (typeof args === 'string') return args
  if (typeof args === 'object' && !Array.isArray(args)) {
    return Object.values(args as Record<string, unknown>)
      .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
      .join(' · ')
  }
  return JSON.stringify(args)
}

function emptyStation(id: AgentId): Station {
  return { id, status: 'standby', activity: null, activityKind: null, tasks: [], toolCounts: {},
    handoffsTo: [], summary: null, reply: null, steps: 0 }
}

function parentOf(chain: string[] | null): AgentId | null {
  if (!chain || chain.length < 2) return null
  const p = chain[chain.length - 2]
  return isAgent(p) ? p : null
}

export function deriveRun(events: AgentEvent[]): RunView {
  const stations = Object.fromEntries(AGENT_IDS.map((id) => [id, emptyStation(id)])) as Record<AgentId, Station>
  const links: Link[] = []
  const lines: Line[] = []
  const toolSet = new Set<string>()
  let finalReply: AgentReply | null = null
  let startTs: string | null = null
  let endTs: string | null = null
  let ended: 'done' | 'error' | null = null
  let tokens = 0
  let toolCalls = 0
  let handoffs = 0
  const firstHandoffs: AgentId[] = []

  for (const e of events) {
    tokens = Math.max(tokens, e.total_tokens ?? 0)
    const a = isAgent(e.agent) ? e.agent : null
    const st = a ? stations[a] : null
    const key = String(e.index)

    switch (e.event) {
      case 'team_run_start':
        startTs = e.ts
        lines.push({ key, ts: e.ts, agent: null, kind: 'system', text: `Run started · ${(e.said ?? '').replace(/^Task: /, '')}` })
        break

      case 'agent_start': {
        if (!st || !a) break
        const task = (e.said ?? '').replace(/^Task: /, '')
        st.status = 'active'
        st.tasks.push(task)
        st.activity = 'Reading the task'
        st.activityKind = 'task'
        const parent = parentOf(e.chain)
        const link = parent ? [...links].reverse().find((l) => l.from === parent && l.to === a && l.state === 'pending') : null
        if (link) link.state = 'live'
        if (!parent) lines.push({ key, ts: e.ts, agent: a, kind: 'task', text: task })
        break
      }

      case 'model_response': {
        if (!st || !a) break
        st.steps += 1
        if (e.said) {
          lines.push({ key: `${key}s`, ts: e.ts, agent: a, kind: 'say', text: e.said })
          st.activity = e.said
          st.activityKind = 'say'
        }
        e.tools.forEach((t, i) => {
          if (t.tool === 'delegate') {
            const args = (t.args ?? {}) as { to_agent?: string; task?: string }
            const to = isAgent(args.to_agent) ? args.to_agent : null
            handoffs += 1
            if (to) {
              links.push({ from: a, to, task: args.task ?? '', state: 'pending' })
              st.handoffsTo.push(to)
            }
            lines.push({ key: `${key}t${i}`, ts: e.ts, agent: a, kind: 'handoff', text: args.task ?? '', to: to ?? undefined })
            st.activity = `Handing off to ${to ? CREW[to].callsign : args.to_agent ?? 'a teammate'}`
            st.activityKind = 'handoff'
          } else {
            toolCalls += 1
            toolSet.add(t.tool)
            st.toolCounts[t.tool] = (st.toolCounts[t.tool] ?? 0) + 1
            const argText = formatArgs(t.args)
            lines.push({ key: `${key}t${i}`, ts: e.ts, agent: a, kind: 'tool', text: t.tool, extra: argText })
            st.activity = `${t.tool}(${argText})`
            st.activityKind = 'tool'
          }
        })
        if (a === 'boss' && (e.chain?.length ?? 1) === 1 && firstHandoffs.length === 0) {
          for (const t of e.tools) {
            const to = (t.args as { to_agent?: string } | null)?.to_agent
            if (t.tool === 'delegate' && isAgent(to)) firstHandoffs.push(to)
          }
        }
        break
      }

      case 'model_request': {
        if (!st || !a) break
        const results = e.tool_results.filter((r) => r.tool && r.tool !== 'delegate')
        results.forEach((r, i) => lines.push({ key: `${key}r${i}`, ts: e.ts, agent: a, kind: 'result', text: r.tool ?? '', extra: r.result }))
        if (e.tool_results.length) {
          st.activity = 'Reading results'
          st.activityKind = 'result'
        }
        break
      }

      case 'loop_end': {
        if (!st || !a) break
        st.summary = e.reply?.summary ?? e.said
        st.reply = e.reply
        if ((e.chain?.length ?? 1) === 1) finalReply = e.reply
        lines.push({ key, ts: e.ts, agent: a, kind: 'final', text: st.summary ?? '' })
        // What the agent could not answer (its open questions), shown as its own line so a gap is never buried.
        const asker = parentOf(e.chain)
        ;(e.reply?.open_questions ?? []).forEach((q, i) =>
          lines.push({ key: `${key}g${i}`, ts: e.ts, agent: a, kind: 'gap', text: q, to: asker ?? undefined }),
        )
        break
      }

      case 'agent_end': {
        if (!st || !a) break
        st.status = 'done'
        st.activity = st.summary ?? 'Report filed'
        st.activityKind = 'final'
        const parent = parentOf(e.chain)
        const link = parent ? [...links].reverse().find((l) => l.from === parent && l.to === a && l.state === 'live') : null
        if (link) link.state = 'done'
        break
      }

      case 'delegation_refused': {
        if (!a) break
        const chain = e.chain ?? []
        links
          .filter((l) => l.from === a && l.state === 'pending' && (chain.includes(l.to) || chain.length >= 4))
          .forEach((l) => (l.state = 'refused'))
        lines.push({ key, ts: e.ts, agent: a, kind: 'warn', text: e.said ?? 'Hand-off refused' })
        break
      }

      case 'agent_error':
        if (st) {
          st.status = 'error'
          st.activity = e.said
          st.activityKind = 'error'
        }
        lines.push({ key, ts: e.ts, agent: e.agent, kind: 'error', text: e.said ?? 'Error' })
        break

      case 'team_run_error':
        ended = 'error'
        endTs = e.ts
        lines.push({ key, ts: e.ts, agent: null, kind: 'error', text: `Run failed · ${(e.said ?? '').replace(/^Error: /, '')}` })
        break

      case 'team_run_end':
        ended = 'done'
        endTs = e.ts
        lines.push({ key, ts: e.ts, agent: null, kind: 'landed', text: 'Run finished · ticket resolved' })
        break

      case 'human_approval':
      case 'approval_rejected':
        lines.push({ key, ts: e.ts, agent: 'human', kind: e.event === 'human_approval' ? 'human' : 'warn', text: e.said ?? e.event })
        break
    }
  }

  return { stations, links, lines, finalReply, startTs, endTs, ended, tokens, toolCalls, handoffs,
    toolSet: [...toolSet], firstHandoffs }
}

export function elapsed(fromIso: string | null, toMs: number): string {
  if (!fromIso) return '00:00'
  const s = Math.max(0, Math.floor((toMs - Date.parse(fromIso)) / 1000))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 })
