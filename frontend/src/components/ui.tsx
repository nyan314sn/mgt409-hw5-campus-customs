import type { ReactNode } from 'react'
import type { GlyphShape } from '../crew'

export function PanelHead({ id, code, title, right }: { id?: string; code: string; title: string; right?: ReactNode }) {
  return (
    <div className="panel-head">
      <span className="panel-code">{code}</span>
      <h2 id={id}>{title}</h2>
      {right !== undefined && <div className="panel-right">{right}</div>}
    </div>
  )
}

/** Each crew member has its own shape, so agents differ by more than color. */
export function Glyph({ shape, color, size = 14, hollow = false }: { shape: GlyphShape; color: string; size?: number; hollow?: boolean }) {
  const paint = { fill: hollow ? 'none' : color, stroke: color, strokeWidth: 1.6, strokeLinejoin: 'round' as const }
  let el: ReactNode
  switch (shape) {
    case 'circle':
      el = <circle cx="8" cy="8" r="6" {...paint} />
      break
    case 'square':
      el = <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" {...paint} />
      break
    case 'triangle':
      el = <polygon points="8,1.8 14.6,13.6 1.4,13.6" {...paint} />
      break
    case 'diamond':
      el = <polygon points="8,1.4 14.6,8 8,14.6 1.4,8" {...paint} />
      break
    case 'hex':
      el = <polygon points="8,1.4 13.8,4.7 13.8,11.3 8,14.6 2.2,11.3 2.2,4.7" {...paint} />
      break
  }
  return (
    <svg className="glyph" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {el}
    </svg>
  )
}

export function Led({ tone }: { tone: 'ok' | 'live' | 'warn' | 'lost' | 'off' }) {
  return <span className={`led led-${tone}`} aria-hidden="true" />
}
