import { useState, type CSSProperties } from 'react'
import type { Ticket } from '../api'
import { AGENT_IDS, CREW, TOOL_LABEL } from '../crew'
import type { RunView } from '../derive'
import { FLIGHT_PLAN } from '../flightPlan'
import { Glyph, PanelHead } from './ui'

type Tab = 'call' | 'crew' | 'plan'

export function Debrief({ ticket, view, hasRun, running }: { ticket: Ticket | null; view: RunView; hasRun: boolean; running: boolean }) {
  const [tab, setTab] = useState<Tab>('call')
  const tabs: { id: Tab; label: string }[] = [
    { id: 'call', label: "Boss's final answer" },
    { id: 'crew', label: 'What each agent did' },
    { id: 'plan', label: 'Expected vs. actual' },
  ]
  return (
    <section className="panel debrief" aria-labelledby="debrief-h">
      <PanelHead id="debrief-h" code="PNL-06" title="Summary" right={running ? 'Filling in as agents report…' : undefined} />
      <div className="tabs" role="tablist" aria-label="Summary views">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="debrief-body" role="tabpanel">
        {!hasRun ? (
          <p className="muted">The team hasn't run on this ticket yet. The summary fills in as the agents work.</p>
        ) : tab === 'call' ? (
          <FinalCall view={view} running={running} />
        ) : tab === 'crew' ? (
          <CrewReports view={view} />
        ) : (
          <PlanVsTrack ticket={ticket} view={view} />
        )}
      </div>
    </section>
  )
}

function FinalCall({ view, running }: { view: RunView; running: boolean }) {
  const r = view.finalReply
  if (!r) return <p className="muted">{running ? 'The Boss has not given a final answer yet.' : 'This run ended without a final answer.'}</p>
  return (
    <div className="call">
      <div className="call-head">
        <p className="call-summary">{r.summary}</p>
        <span className={`badge ${r.needs_human_approval ? 'badge-go' : 'badge-quiet'}`}>
          {r.needs_human_approval ? 'Human decision needed' : 'No approval needed'}
        </span>
      </div>
      <div className="call-grid">
        <ListBlock title="Verified facts" items={r.facts} className="facts" />
        <ListBlock title="Recommended actions" items={r.proposed_actions} className="actions" />
        {r.open_questions.length > 0 && <ListBlock title="Open questions" items={r.open_questions} className="questions" />}
      </div>
    </div>
  )
}

function ListBlock({ title, items, className }: { title: string; items: string[]; className: string }) {
  return (
    <div className={`list-block ${className}`}>
      <h3>{title}</h3>
      {items.length ? <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="muted">None.</p>}
    </div>
  )
}

function CrewReports({ view }: { view: RunView }) {
  const flown = AGENT_IDS.filter((id) => view.stations[id].status !== 'standby')
  const idle = AGENT_IDS.filter((id) => view.stations[id].status === 'standby')
  return (
    <div className="crew-reports">
      {flown.map((id) => {
        const st = view.stations[id]
        const m = CREW[id]
        return (
          <article key={id} className="report" style={{ '--crew': m.color } as CSSProperties}>
            <header>
              <Glyph shape={m.glyph} color={m.color} size={14} />
              <span className="report-call">{m.callsign}</span>
              <span className="muted">{m.name}</span>
            </header>
            {st.tasks.length > 0 && (
              <p className="report-task"><span className="op">Asked</span> {st.tasks.join(' / ')}</p>
            )}
            <p className="report-summary">{st.summary ?? (st.status === 'error' ? 'Stopped with an error before answering.' : 'Still working…')}</p>
            {(st.reply?.open_questions.length ?? 0) > 0 && (
              <div className="report-gaps">
                <span className="op">⚠ Couldn't answer</span>
                <ul>{st.reply!.open_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
              </div>
            )}
            <div className="report-tags">
              {Object.entries(st.toolCounts).map(([tool, n]) => (
                <span key={tool} className="tag" title={tool}>
                  {TOOL_LABEL[tool] ?? tool}{n > 1 ? ` ×${n}` : ''}
                </span>
              ))}
              {st.handoffsTo.map((to, i) => (
                <span key={`${to}${i}`} className="tag tag-handoff" style={{ '--crew': CREW[to].color } as CSSProperties}>
                  ⇢ {CREW[to].callsign}
                </span>
              ))}
            </div>
          </article>
        )
      })}
      {idle.length > 0 && (
        <p className="muted small">Not called: {idle.map((id) => CREW[id].callsign).join(', ')}</p>
      )}
    </div>
  )
}

function PlanVsTrack({ ticket, view }: { ticket: Ticket | null; view: RunView }) {
  const plan = ticket ? FLIGHT_PLAN[ticket.id] : undefined
  if (!plan) return <p className="muted">No expected plan was written for this ticket.</p>
  const flown = view.links.filter((l) => l.state !== 'refused')
  const flew = (from: string, to: string) => flown.some((l) => l.from === from && l.to === to)
  const planned = plan.handoffs.map((h) => ({ ...h, ok: flew(h.from, h.to) }))
  const extra = [...new Map(flown.filter((l) => !plan.handoffs.some((h) => h.from === l.from && h.to === l.to))
    .map((l) => [`${l.from}>${l.to}`, l])).values()]
  const refused = view.links.filter((l) => l.state === 'refused')
  const onPlan = planned.filter((h) => h.ok).length
  const first = view.firstHandoffs.map((id) => CREW[id].callsign).join(' + ') || '—'

  return (
    <div className="plan">
      <div className="plan-score">
        <span className="plan-big">{onPlan}/{planned.length}</span>
        <span>expected hand-offs happened{extra.length ? ` · ${extra.length} not expected` : ''}{refused.length ? ` · ${refused.length} refused` : ''}</span>
      </div>
      <dl className="plan-first">
        <div><dt>Expected first call</dt><dd>{plan.first}</dd></div>
        <div><dt>Actual first call</dt><dd>{first}</dd></div>
      </dl>
      <p className="muted small">{plan.why}</p>
      <h3>Hand-offs</h3>
      <ul className="plan-list">
        {planned.map((h) => (
          <li key={`${h.from}>${h.to}`} className={h.ok ? 'ok' : 'miss'}>
            <span className="mark">{h.ok ? '✓' : '✕'}</span>
            <b>{CREW[h.from].callsign} → {CREW[h.to].callsign}</b> <span className="muted">{h.note}</span>
          </li>
        ))}
        {extra.map((l) => (
          <li key={`x${l.from}>${l.to}`} className="extra">
            <span className="mark">+</span>
            <b>{CREW[l.from].callsign} → {CREW[l.to].callsign}</b> <span className="muted">not expected: “{l.task}”</span>
          </li>
        ))}
        {refused.map((l, i) => (
          <li key={`r${i}`} className="refused">
            <span className="mark">⊘</span>
            <b>{CREW[l.from].callsign} → {CREW[l.to].callsign}</b> <span className="muted">refused (would have looped back)</span>
          </li>
        ))}
      </ul>
      <h3>MCP tools</h3>
      <div className="report-tags">
        {plan.tools.map((t) => (
          <span key={t} className={`tag ${view.toolSet.includes(t) ? 'tag-ok' : 'tag-miss'}`}>
            {view.toolSet.includes(t) ? '✓' : '✕'} {t}
          </span>
        ))}
        {view.toolSet.filter((t) => !plan.tools.includes(t)).map((t) => (
          <span key={t} className="tag tag-extra">+ {t}</span>
        ))}
      </div>
      <h3>Should not be called</h3>
      <ul className="plan-list">
        {plan.notCalled.map((id) => {
          const called = view.stations[id].status !== 'standby'
          return (
            <li key={id} className={called ? 'miss' : 'ok'}>
              <span className="mark">{called ? '✕' : '✓'}</span>
              <b>{CREW[id].callsign}</b> <span className="muted">{called ? 'was called' : 'was not called'}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
