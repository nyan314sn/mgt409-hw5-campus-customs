import type { Cash } from '../api'
import { money } from '../derive'
import { useAnimatedNumber } from '../hooks'
import { PanelHead } from './ui'

// The gauge shows checking against what the desk started with (balance + payments since reset).
const CX = 120
const CY = 118
const R = 92
const SWEEP = 120 // degrees each side of straight up
const RESERVE = 0.15 // below this share of the starting balance, the gauge shows reserve

function point(deg: number, r = R): [number, number] {
  const rad = (deg * Math.PI) / 180
  return [CX + r * Math.sin(rad), CY - r * Math.cos(rad)]
}

function arcPath(fromDeg: number, toDeg: number, r = R): string {
  const [x1, y1] = point(fromDeg, r)
  const [x2, y2] = point(toDeg, r)
  const large = toDeg - fromDeg > 180 ? 1 : 0
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))
const angleOf = (frac: number) => -SWEEP + frac * SWEEP * 2

export function FuelPanel({ cash, projected }: { cash: Cash | null; projected: number | null }) {
  const balance = cash?.balance ?? 0
  const spent = cash?.payments.reduce((s, p) => s + p.amount, 0) ?? 0
  const full = balance + spent || 1
  const shown = useAnimatedNumber(balance, 1400, cash !== null)
  const frac = clamp(shown / full)
  const reserve = cash !== null && balance / full < RESERVE
  const needle = angleOf(frac)
  const ghost = projected !== null ? angleOf(clamp(projected / full)) : null

  return (
    <section className={`panel fuel${reserve ? ' is-reserve' : ''}`} aria-labelledby="fuel-h">
      <PanelHead id="fuel-h" code="PNL-07" title="Cash" right={cash ? `checking · ${cash.as_of}` : ''} />
      <div className="gauge-wrap">
        <svg viewBox="0 0 240 170" className="gauge" role="img" aria-label={`Checking balance ${money(balance)} of ${money(full)} at start`}>
          <defs>
            <linearGradient id="fuel-fill" x1="0" x2="1">
              <stop offset="0%" stopColor="#ff3d9a" />
              <stop offset="100%" stopColor="#ff8cc4" />
            </linearGradient>
          </defs>
          <path d={arcPath(-SWEEP, SWEEP)} className="gauge-track" />
          <path d={arcPath(-SWEEP, angleOf(RESERVE))} className="gauge-reserve" />
          {frac > 0.001 && <path d={arcPath(-SWEEP, needle)} className="gauge-fill" />}
          {Array.from({ length: 11 }, (_, i) => {
            const d = angleOf(i / 10)
            const [x1, y1] = point(d, R + 8)
            const [x2, y2] = point(d, R + (i % 5 === 0 ? 17 : 13))
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={`gauge-tick${i % 5 === 0 ? ' major' : ''}`} />
          })}
          <text x={point(-SWEEP, R + 26)[0]} y={point(-SWEEP, R + 26)[1] + 4} className="gauge-end">$0</text>
          <text x={point(SWEEP, R + 26)[0] - 4} y={point(SWEEP, R + 26)[1] + 4} className="gauge-end">start</text>
          {ghost !== null && (
            <line x1={CX} y1={CY} x2={point(ghost, R - 10)[0]} y2={point(ghost, R - 10)[1]} className="gauge-ghost" />
          )}
          <line x1={CX} y1={CY} x2={point(needle, R - 6)[0]} y2={point(needle, R - 6)[1]} className="gauge-needle" />
          <circle cx={CX} cy={CY} r="6" className="gauge-hub" />
        </svg>
        <div className="gauge-readout">
          <div className="gauge-value" aria-live="polite">{money(Math.round(shown))}</div>
          <div className="gauge-label">{reserve ? 'Low cash' : 'Checking balance'}</div>
          {projected !== null && (
            <div className={`gauge-projected${projected < 0 ? ' neg' : ''}`}>After this approval: {money(projected)}</div>
          )}
        </div>
      </div>
      <dl className="fuel-stats">
        <div><dt>Started</dt><dd>{money(full)}</dd></div>
        <div><dt>Paid out</dt><dd>{money(spent)}</dd></div>
        <div><dt>Payments</dt><dd>{cash?.payments.length ?? 0}</dd></div>
      </dl>
      <h3 className="sub-head">Payments</h3>
      {cash && cash.payments.length > 0 ? (
        <ol className="burn-log">
          {[...cash.payments].reverse().map((p) => (
            <li key={p.id}>
              <span className={`burn-kind kind-${p.kind}`}>{p.kind}</span>
              <span className="burn-ref">{p.kind === 'invoice' ? `Inv ${p.ref_id}` : p.kind === 'rent' ? `Lease ${p.ref_id}` : `CC-${p.ref_id}`}</span>
              <span className="burn-amt">−{money(p.amount)}</span>
              <span className="burn-by">Approved by {p.approved_by} · {p.paid_at}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted small">No payments yet. Cash only moves when a human approves.</p>
      )}
    </section>
  )
}
