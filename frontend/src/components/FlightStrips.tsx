import type { Ticket } from '../api'
import { TICKET_TYPE } from '../crew'
import { PanelHead } from './ui'

export type FlightState = 'standby' | 'inflight' | 'landed' | 'abort'

export function flightState(t: Ticket): FlightState {
  if (t.last_run?.status === 'running') return 'inflight'
  if (t.resolved) return 'landed'
  if (t.last_run && (t.last_run.status === 'error' || t.last_run.status === 'interrupted')) return 'abort'
  return 'standby'
}

export const STATE_LABEL: Record<FlightState, string> = {
  standby: 'Open',
  inflight: 'Running',
  landed: 'Resolved',
  abort: 'Failed',
}

function itemLine(t: Ticket): string {
  const parts: string[] = []
  if (t.sku) parts.push(`${t.sku} · ${t.size} · ×${t.qty}`)
  if (t.lease_id !== null) parts.push(`Lease ${t.lease_id}`)
  if (t.invoice_id !== null) parts.push(`Inv ${t.invoice_id}`)
  return parts.join(' · ')
}

function clock(iso: string): string {
  const m = iso.match(/T(\d{2}:\d{2})/)
  return m ? m[1] : ''
}

interface Props {
  tickets: Ticket[] | null
  selectedId: number | null
  onSelect: (id: number) => void
}

export function FlightStrips({ tickets, selectedId, onSelect }: Props) {
  const landed = tickets?.filter((t) => t.resolved).length ?? 0
  return (
    <section className="panel strips" aria-labelledby="strips-h">
      <PanelHead id="strips-h" code="PNL-01" title="Tickets" right={tickets ? `${landed}/${tickets.length} resolved` : ''} />
      {!tickets && <p className="muted pad">Contacting the backend…</p>}
      <ol className="strip-list">
        {tickets?.map((t, i) => {
          const s = flightState(t)
          const selected = t.id === selectedId
          return (
            <li key={t.id}>
              <button
                type="button"
                className={`strip strip-${s}${selected ? ' is-selected' : ''}`}
                aria-pressed={selected}
                onClick={() => onSelect(t.id)}
              >
                <span className="strip-bay" aria-hidden="true" />
                <span className="strip-main">
                  <span className="strip-top">
                    <span className="strip-call">CC-{t.id}</span>
                    <span className={`stamp stamp-${s}`}>{STATE_LABEL[s]}</span>
                  </span>
                  <span className="strip-type">{TICKET_TYPE[t.type] ?? t.type}</span>
                  <span className="strip-subject">{t.subject}</span>
                  <span className="strip-meta">{t.requester}</span>
                  <span className="strip-meta mono">
                    {itemLine(t)}
                    {itemLine(t) && ' · '}
                    filed {clock(t.created_at)}
                  </span>
                  <kbd className="strip-key" aria-label={`Shortcut ${i + 1}`}>{i + 1}</kbd>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
