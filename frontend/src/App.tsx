import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_URL, api, errorText, type AgentEvent, type ApprovalOption, type Approvals, type Cash, type Health, type Ticket } from './api'
import { TICKET_TYPE } from './crew'
import { deriveRun, elapsed, type RunView } from './derive'
import { useInterval, useNow, useStored } from './hooks'
import { CommLinks } from './components/CommLinks'
import { CommsLoop } from './components/CommsLoop'
import { Debrief } from './components/Debrief'
import { FlightStrips, STATE_LABEL, flightState } from './components/FlightStrips'
import { FuelPanel } from './components/FuelPanel'
import { GoNoGo } from './components/GoNoGo'
import { ResetDialog, Toasts, type Toast } from './components/Overlays'
import { Stations } from './components/Stations'
import { TopBar } from './components/TopBar'
import { PanelHead } from './components/ui'

interface Feed {
  runId: string
  events: AgentEvent[]
  cursor: number
}

const TOKEN_BUDGET = 250_000 // MAX_TOTAL_TOKENS in backend/settings.py

export default function App() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [cash, setCash] = useState<Cash | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useStored<number | null>('cc.selected', null)
  const [operator, setOperator] = useStored<string>('cc.operator', '')
  const [feed, setFeed] = useState<Feed | null>(null)
  const [approvals, setApprovals] = useState<Approvals | null>(null)
  const [projected, setProjected] = useState<number | null>(null)
  const [launching, setLaunching] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  const toastId = useRef(0)
  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++toastId.current
    setToasts((ts) => [...ts.slice(-3), { ...t, id }])
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.tone === 'error' ? 9000 : 6000)
  }, [])

  const selected = tickets?.find((t) => t.id === selectedId) ?? null
  const runId = selected?.last_run?.run_id ?? null
  const runStatus = selected?.last_run?.status ?? null
  const running = runStatus === 'running'
  const flying = tickets?.find((t) => t.last_run?.status === 'running') ?? null

  // ---------------------------------------------------------------- board data
  const refreshBoard = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([api.tickets(), api.cash()])
      setTickets(t.tickets)
      setCash(c)
      setLinkError(null)
    } catch (e) {
      setLinkError(errorText(e))
    }
  }, [])
  const refreshHealth = useCallback(() => {
    api.health().then(setHealth).catch(() => setHealth(null))
  }, [])

  useEffect(() => {
    refreshBoard()
    refreshHealth()
  }, [refreshBoard, refreshHealth])
  useInterval(refreshBoard, flying ? 1500 : 6000)
  useInterval(refreshHealth, 10000)

  // A link like /?ticket=102 opens that ticket directly.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get('ticket'))
    if (id) setSelectedId(id)
  }, [setSelectedId])

  useEffect(() => {
    if (tickets && tickets.length && !tickets.some((t) => t.id === selectedId)) setSelectedId(tickets[0].id)
  }, [tickets, selectedId, setSelectedId])

  // ---------------------------------------------------------------- live feed for the selected run
  const feedRef = useRef<Feed | null>(null)
  feedRef.current = feed
  const loadFeed = useCallback(async (id: string, incremental: boolean) => {
    const cur = feedRef.current
    const after = incremental && cur?.runId === id ? cur.cursor : undefined
    try {
      const page = await api.events({ run_id: id, after, limit: 1000 })
      setFeed((prev) => {
        if (!prev || prev.runId !== id || after === undefined) return { runId: id, events: page.events, cursor: page.next_after }
        const seen = new Set(prev.events.map((e) => e.index))
        return { runId: id, events: [...prev.events, ...page.events.filter((e) => !seen.has(e.index))], cursor: page.next_after }
      })
    } catch (e) {
      setLinkError(errorText(e))
    }
  }, [])

  useEffect(() => {
    if (runId) loadFeed(runId, false)
    else setFeed(null)
  }, [runId, loadFeed])
  useInterval(() => runId && loadFeed(runId, true), running ? 1000 : null)

  // ---------------------------------------------------------------- approvals for the selected ticket
  const loadApprovals = useCallback(async (id: number) => {
    try {
      setApprovals(await api.approvals(id))
    } catch {
      setApprovals(null)
    }
  }, [])
  useEffect(() => {
    if (selectedId !== null) loadApprovals(selectedId)
  }, [selectedId, runStatus, loadApprovals])

  // ---------------------------------------------------------------- landing / abort announcements
  const lastStatus = useRef<Record<string, string>>({})
  useEffect(() => {
    if (!tickets) return
    for (const t of tickets) {
      const r = t.last_run
      if (!r) continue
      const before = lastStatus.current[r.run_id]
      lastStatus.current[r.run_id] = r.status
      if (before === 'running' && r.status !== 'running') {
        if (r.status === 'done') toast({ tone: 'ok', title: `CC-${t.id} resolved`, text: 'The run finished. Check the summary and any approvals.' })
        else toast({ tone: 'error', title: `CC-${t.id} failed`, text: 'The run stopped with an error. See the activity log for details.' })
        if (r.run_id === runId) loadFeed(r.run_id, true)
        if (t.id === selectedId) loadApprovals(t.id)
        document.title = `${r.status === 'done' ? '✓' : '⚠'} CC-${t.id} · Campus Customs`
        window.setTimeout(() => (document.title = 'Campus Customs Desk'), 8000)
      }
    }
  }, [tickets, runId, selectedId, loadFeed, loadApprovals, toast])

  // ---------------------------------------------------------------- actions
  const launch = useCallback(async () => {
    if (!selected || launching) return
    setLaunching(true)
    try {
      const run = await api.runTicket(selected.id)
      lastStatus.current[run.run_id] = 'running'
      setTickets((ts) => ts?.map((t) => (t.id === selected.id ? { ...t, last_run: { run_id: run.run_id, status: 'running' } } : t)) ?? ts)
      toast({ tone: 'info', title: `CC-${selected.id} started`, text: 'The Boss has the ticket. Watch the agents and the activity log.' })
    } catch (e) {
      toast({ tone: 'error', title: 'Run not started', text: errorText(e) })
    } finally {
      setLaunching(false)
      refreshBoard()
    }
  }, [selected, launching, toast, refreshBoard])

  const approve = useCallback(
    async (opt: ApprovalOption, amount: number, qty?: number, vendorId?: number) => {
      if (!selected || !approvals?.run_id) return false
      try {
        const res = await api.approve({
          ticket_id: selected.id,
          kind: opt.kind,
          run_id: approvals.run_id,
          approved_by: operator.trim(),
          qty,
          vendor_id: vendorId,
          expected_amount: amount,
        })
        toast({ tone: 'ok', title: 'Payment approved', text: res.message })
        return true
      } catch (e) {
        toast({ tone: 'error', title: 'Payment refused', text: errorText(e) })
        return false
      } finally {
        setProjected(null)
        await Promise.all([refreshBoard(), loadApprovals(selected.id), runId ? loadFeed(runId, true) : null])
      }
    },
    [selected, approvals, operator, toast, refreshBoard, loadApprovals, loadFeed, runId],
  )

  const doReset = useCallback(async () => {
    setResetting(true)
    try {
      const res = await api.reset()
      setFeed(null)
      lastStatus.current = {}
      toast({ tone: 'ok', title: 'Database reset', text: res.message })
      setResetOpen(false)
      await refreshBoard()
      if (selectedId !== null) await loadApprovals(selectedId)
    } catch (e) {
      toast({ tone: 'error', title: 'Reset refused', text: errorText(e) })
    } finally {
      setResetting(false)
    }
  }, [toast, refreshBoard, loadApprovals, selectedId])

  // ---------------------------------------------------------------- keyboard: 1-3 pick a ticket, R runs the team
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (resetOpen || e.metaKey || e.ctrlKey || e.altKey || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return
      const n = Number(e.key)
      if (tickets && n >= 1 && n <= tickets.length) setSelectedId(tickets[n - 1].id)
      else if (e.key.toLowerCase() === 'r') launch()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tickets, launch, resetOpen, setSelectedId])

  const view = useMemo(() => deriveRun(feed && feed.runId === runId ? feed.events : []), [feed, runId])
  const hasRun = !!runId

  return (
    <div className="app">
      <TopBar
        health={health}
        linkError={linkError}
        shopDate={cash?.shop_date ?? null}
        activeTicket={flying?.id ?? null}
        onReset={() => setResetOpen(true)}
        resetDisabled={!!flying || !!linkError}
      />
      {linkError && (
        <div className="banner banner-error" role="alert">
          <b>Backend offline.</b> {linkError}
        </div>
      )}

      <main className="deck">
        <aside className="col col-left">
          <FlightStrips tickets={tickets} selectedId={selectedId} onSelect={setSelectedId} />
          <section className="panel legend" aria-labelledby="legend-h">
            <PanelHead id="legend-h" code="PNL-00" title="How it works" />
            <ol className="howto">
              <li>Pick a ticket (keys <kbd>1</kbd>–<kbd>3</kbd>).</li>
              <li>Press <b>Run team</b> (<kbd>R</kbd>) and watch the agents work.</li>
              <li>When it finishes, read the summary and check <b>Approvals</b>.</li>
              <li>Approving is the only thing that moves cash. Watch the balance drop.</li>
            </ol>
          </section>
        </aside>

        <section className="col col-center">
          <MissionHeader ticket={selected} view={view} launching={launching} flying={flying} onLaunch={launch} />
          <Stations view={view} hasRun={hasRun} running={running} />
          <div className="duo">
            <CommLinks view={view} running={running} />
            <CommsLoop lines={view.lines} startTs={view.startTs} hasRun={hasRun} running={running} />
          </div>
          <Debrief ticket={selected} view={view} hasRun={hasRun} running={running} />
        </section>

        <aside className="col col-right">
          <FuelPanel cash={cash} projected={projected} />
          <GoNoGo
            ticket={selected}
            approvals={approvals}
            finalReply={view.finalReply}
            runStatus={runStatus}
            balance={cash?.balance ?? null}
            operator={operator}
            setOperator={setOperator}
            onApprove={approve}
            onProjected={setProjected}
          />
        </aside>
      </main>

      <footer className="statusbar">
        <span>Backend <code>{API_URL}</code></span>
        <span>Every step is appended to <code>output/audit_trail.json</code></span>
        <span>Agents read through MCP and never move cash</span>
      </footer>

      <Toasts toasts={toasts} dismiss={(id) => setToasts((ts) => ts.filter((t) => t.id !== id))} />
      <ResetDialog open={resetOpen} busy={resetting} onCancel={() => setResetOpen(false)} onConfirm={doReset} />
    </div>
  )
}

function MissionHeader({ ticket, view, launching, flying, onLaunch }: {
  ticket: Ticket | null
  view: RunView
  launching: boolean
  flying: Ticket | null
  onLaunch: () => void
}) {
  const now = useNow(1000)
  if (!ticket) return <section className="panel mission"><p className="muted pad">Select a ticket to begin.</p></section>
  const s = flightState(ticket)
  const endMs = view.endTs ? Date.parse(view.endTs) : now
  const met = view.startTs ? elapsed(view.startTs, endMs) : '00:00'
  const tokenShare = Math.min(1, view.tokens / TOKEN_BUDGET)

  let label = 'Run team'
  let disabled = launching
  if (launching) label = 'Starting…'
  else if (s === 'inflight') { label = 'Running…'; disabled = true }
  else if (ticket.resolved) { label = 'Resolved'; disabled = true }
  else if (flying) { label = `Wait · CC-${flying.id} is running`; disabled = true }
  else if (s === 'abort') label = 'Run team again'

  return (
    <section className={`panel mission mission-${s}`} aria-labelledby="mission-h">
      <div className="mission-id">
        <span className="mission-call">CC-{ticket.id}</span>
        <span className={`stamp stamp-${s}`}>{STATE_LABEL[s]}</span>
      </div>
      <div className="mission-main">
        <h1 id="mission-h">{ticket.subject}</h1>
        <p className="mission-meta">
          {TICKET_TYPE[ticket.type] ?? ticket.type} · {ticket.requester}
          {ticket.sku && <> · <span className="mono">{ticket.sku} {ticket.size} ×{ticket.qty}</span></>}
          {ticket.lease_id !== null && <> · lease {ticket.lease_id}</>}
          {ticket.invoice_id !== null && <> · invoice {ticket.invoice_id}</>}
        </p>
        {ticket.notes && <p className="mission-notes">“{ticket.notes}”</p>}
      </div>
      <div className="mission-side">
        <button type="button" className={`btn btn-launch${s === 'inflight' ? ' is-flying' : ''}`} onClick={onLaunch} disabled={disabled}>
          {label}
        </button>
        <dl className="telemetry">
          <div><dt>Elapsed</dt><dd>{met}</dd></div>
          <div><dt>Tool calls</dt><dd>{view.toolCalls}</dd></div>
          <div><dt>Hand-offs</dt><dd>{view.handoffs}</dd></div>
          <div className="wide">
            <dt>Tokens · {Math.round(tokenShare * 100)}% of budget</dt>
            <dd>
              <span className="meter"><span style={{ width: `${tokenShare * 100}%` }} /></span>
              <span className="mono small">{view.tokens.toLocaleString()} / {TOKEN_BUDGET.toLocaleString()}</span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
