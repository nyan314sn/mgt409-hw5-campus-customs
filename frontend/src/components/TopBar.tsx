import type { Health } from '../api'
import { useNow } from '../hooks'
import { Led } from './ui'

interface Props {
  health: Health | null
  linkError: string | null
  shopDate: string | null
  activeTicket: number | null
  onReset: () => void
  resetDisabled: boolean
}

export function TopBar({ health, linkError, shopDate, activeTicket, onReset, resetDisabled }: Props) {
  const now = useNow(1000)
  const time = new Date(now).toLocaleTimeString('en-US', { hour12: false })
  const uplink = linkError ? 'lost' : health ? 'ok' : 'warn'

  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <div>
          <div className="brand-name">Campus Customs</div>
          <div className="brand-sub">Back-office desk · agent team</div>
        </div>
      </div>

      <div className="readouts" role="list" aria-label="Desk status">
        <Readout label="Shop date" value={shopDate ?? '—'} />
        <Readout label="Local time" value={time} />
        <Readout label="Model" value={health?.model ?? '—'} />
        <Readout label="Backend" value={uplink === 'ok' ? 'Connected' : uplink === 'lost' ? 'Offline' : 'Connecting'} tone={uplink} />
        <Readout label="Running" value={activeTicket ? `CC-${activeTicket}` : 'None'} tone={activeTicket ? 'live' : 'off'} />
      </div>

      <button
        type="button"
        className="btn btn-scrub"
        onClick={onReset}
        disabled={resetDisabled}
        title={resetDisabled ? 'Wait for the run in progress to finish' : 'Restore the original database for a fresh run'}
      >
        Reset database
      </button>
    </header>
  )
}

function Readout({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'live' | 'warn' | 'lost' | 'off' }) {
  return (
    <div className="readout" role="listitem">
      <span className="readout-label">{label}</span>
      <span className="readout-value">
        {tone && <Led tone={tone} />}
        {value}
      </span>
    </div>
  )
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="none" stroke="var(--line-2)" />
      <ellipse cx="24" cy="24" rx="20" ry="8" fill="none" stroke="var(--pink)" strokeWidth="1.6" transform="rotate(-28 24 24)" />
      <circle cx="24" cy="24" r="6" fill="var(--pink)" />
      <g className="logo-orbit">
        <circle cx="42" cy="24" r="2.4" fill="var(--pink-2)" />
      </g>
    </svg>
  )
}
