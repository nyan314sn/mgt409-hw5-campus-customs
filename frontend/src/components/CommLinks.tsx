import { AGENT_IDS, CREW, type AgentId } from '../crew'
import type { Link, LinkState, RunView } from '../derive'
import { Glyph, PanelHead } from './ui'

// Crew positions around the radar scope (a pentagon, FLIGHT at the top).
const POS: Record<AgentId, [number, number]> = {
  boss: [160, 46],
  inventory: [276, 118],
  accounting: [232, 226],
  facilities: [88, 226],
  customer_service: [44, 118],
}
const CENTER: [number, number] = [160, 146]
const RANK: Record<LinkState, number> = { live: 4, pending: 3, refused: 2, done: 1 }

function arc(from: AgentId, to: AgentId): string {
  const [x1, y1] = POS[from]
  const [x2, y2] = POS[to]
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const sx = x1 + ux * 24
  const sy = y1 + uy * 24
  const ex = x2 - ux * 27
  const ey = y2 - uy * 27
  // bend to the right of travel, so A->B and B->A never overlap
  const cx = (sx + ex) / 2 - uy * 16
  const cy = (sy + ey) / 2 + ux * 16
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`
}

export function CommLinks({ view, running }: { view: RunView; running: boolean }) {
  const pairs = new Map<string, Link & { count: number }>()
  for (const l of view.links) {
    const k = `${l.from}>${l.to}`
    const prev = pairs.get(k)
    if (!prev) pairs.set(k, { ...l, count: 1 })
    else {
      prev.count += 1
      if (RANK[l.state] > RANK[prev.state]) prev.state = l.state
    }
  }
  const links = [...pairs.values()]
  const description = links.length
    ? links.map((l) => `${CREW[l.from].callsign} to ${CREW[l.to].callsign} (${l.state})`).join(', ')
    : 'No hand-offs yet'

  return (
    <section className="panel links-panel" aria-labelledby="links-h">
      <PanelHead id="links-h" code="PNL-04" title="Hand-offs" right={`${view.handoffs} on this run`} />
      <svg viewBox="0 0 320 280" className={`links-svg${running ? ' is-running' : ''}`} role="img" aria-label={`Hand-offs: ${description}`}>
        <defs>
          {(['live', 'pending', 'done', 'refused'] as const).map((s) => (
            <marker key={s} id={`arrow-${s}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className={`arrowhead arrow-${s}`} />
            </marker>
          ))}
          <radialGradient id="scope" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,61,154,0.10)" />
            <stop offset="100%" stopColor="rgba(255,61,154,0)" />
          </radialGradient>
        </defs>

        <g className="scope">
          <circle cx={CENTER[0]} cy={CENTER[1]} r="128" fill="url(#scope)" />
          {[42, 84, 126].map((r) => (
            <circle key={r} cx={CENTER[0]} cy={CENTER[1]} r={r} className="scope-ring" />
          ))}
          <line x1={CENTER[0] - 128} y1={CENTER[1]} x2={CENTER[0] + 128} y2={CENTER[1]} className="scope-ring" />
          <line x1={CENTER[0]} y1={CENTER[1] - 128} x2={CENTER[0]} y2={CENTER[1] + 128} className="scope-ring" />
          <g className="sweep">
            <path d={`M ${CENTER[0]} ${CENTER[1]} L ${CENTER[0]} ${CENTER[1] - 126} A 126 126 0 0 1 ${CENTER[0] + 63} ${CENTER[1] - 109} Z`} />
          </g>
        </g>

        {links.map((l) => (
          <g key={`${l.from}>${l.to}`} className={`link link-${l.state}`}>
            <path d={arc(l.from, l.to)} markerEnd={`url(#arrow-${l.state})`}>
              <title>{`${CREW[l.from].callsign} → ${CREW[l.to].callsign}: ${l.task}`}</title>
            </path>
          </g>
        ))}

        {AGENT_IDS.map((id) => {
          const [x, y] = POS[id]
          const m = CREW[id]
          const st = view.stations[id]
          return (
            <g key={id} className={`node node-${st.status}${st.status === 'active' && running ? ' is-live' : ''}`} transform={`translate(${x} ${y})`}>
              <circle r="21" className="node-ring" style={{ stroke: m.color }} />
              <circle r="21" className="node-pulse" style={{ stroke: m.color }} />
              <g transform="translate(-9 -9)">
                <Glyph shape={m.glyph} color={m.color} size={18} hollow={st.status === 'standby'} />
              </g>
              <text y="36" className="node-label" style={{ fill: st.status === 'standby' ? undefined : m.color }}>
                {m.name.split(' ').map((word, i) => (
                  <tspan key={word} x="0" dy={i === 0 ? 0 : 12}>{word}</tspan>
                ))}
              </text>
            </g>
          )
        })}
      </svg>
      <ul className="links-legend" aria-label="Link legend">
        <li><span className="swatch swatch-live" />Working</li>
        <li><span className="swatch swatch-pending" />Asked</li>
        <li><span className="swatch swatch-done" />Answered</li>
        <li><span className="swatch swatch-refused" />Refused</li>
      </ul>
    </section>
  )
}
