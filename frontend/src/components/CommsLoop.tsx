import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AGENT_IDS, CREW, TOOL_LABEL, callsign, colorOf } from '../crew'
import { elapsed, type Line } from '../derive'
import { Glyph, PanelHead } from './ui'

function pretty(raw: string | undefined): string {
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

interface Props {
  lines: Line[]
  startTs: string | null
  hasRun: boolean
  running: boolean
}

export function CommsLoop({ lines, startTs, hasRun, running }: Props) {
  const [filter, setFilter] = useState<string | null>(null)
  const [follow, setFollow] = useState(true)
  const listRef = useRef<HTMLOListElement>(null)
  const shown = filter ? lines.filter((l) => l.agent === filter) : lines

  useEffect(() => {
    const el = listRef.current
    if (follow && el) el.scrollTop = el.scrollHeight
  }, [shown.length, follow])

  const onScroll = () => {
    const el = listRef.current
    if (!el) return
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 32)
  }

  return (
    <section className="panel loop-panel" aria-labelledby="loop-h">
      <PanelHead
        id="loop-h"
        code="PNL-05"
        title="Activity log"
        right={running ? <span className="rec">● Live</span> : `${lines.length} entries`}
      />
      <div className="loop-filters" role="toolbar" aria-label="Show activity from">
        <button type="button" className={`chip${filter === null ? ' is-on' : ''}`} onClick={() => setFilter(null)}>
          All
        </button>
        {AGENT_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={`chip${filter === id ? ' is-on' : ''}`}
            style={{ '--crew': CREW[id].color } as CSSProperties}
            onClick={() => setFilter(filter === id ? null : id)}
            aria-pressed={filter === id}
          >
            <Glyph shape={CREW[id].glyph} color={CREW[id].color} size={10} />
            {CREW[id].callsign}
          </button>
        ))}
      </div>
      <ol className="loop" ref={listRef} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions">
        {shown.length === 0 && (
          <li className="loop-empty">
            {hasRun ? 'No activity from this agent.' : 'No activity yet. Pick a ticket and press Run team.'}
          </li>
        )}
        {shown.map((l) => (
          <LoopLine key={l.key} line={l} startTs={startTs} />
        ))}
      </ol>
      {!follow && (
        <button type="button" className="loop-jump" onClick={() => setFollow(true)}>
          ↓ Latest
        </button>
      )}
    </section>
  )
}

function LoopLine({ line: l, startTs }: { line: Line; startTs: string | null }) {
  const t = startTs ? elapsed(startTs, Date.parse(l.ts)) : ''
  let body
  switch (l.kind) {
    case 'say':
      body = <p className="say">“{l.text}”</p>
      break
    case 'task':
      body = <p><span className="op">Task received</span> {l.text}</p>
      break
    case 'tool':
      body = (
        <p>
          <span className="op">▸ {TOOL_LABEL[l.text] ?? l.text}</span> <code>{l.text}({l.extra})</code>
        </p>
      )
      break
    case 'handoff':
      body = (
        <p>
          <span className="op">⇢ Hands off to <b style={{ color: colorOf(l.to ?? null) }}>{callsign(l.to ?? null)}</b></span> “{l.text}”
        </p>
      )
      break
    case 'result':
      body = (
        <details>
          <summary><span className="op">◂ {TOOL_LABEL[l.text] ?? l.text} returned</span></summary>
          <pre>{pretty(l.extra)}</pre>
        </details>
      )
      break
    case 'final':
      body = <p className="final"><span className="op">■ Answer</span> {l.text}</p>
      break
    case 'gap':
      body = (
        <p className="gap">
          <span className="op">
            ⚠ Couldn't answer
            {l.to ? <> for <b style={{ color: colorOf(l.to) }}>{callsign(l.to)}</b></> : ' · needs a human'}
          </span>{' '}
          {l.text}
        </p>
      )
      break
    case 'landed':
      body = <p className="landed">✓ {l.text}</p>
      break
    default:
      body = <p>{l.text}</p>
  }
  return (
    <li className={`line line-${l.kind}`} style={{ '--crew': colorOf(l.agent) } as CSSProperties}>
      <span className="line-t">{t}</span>
      <span className="line-who">{callsign(l.agent)}</span>
      <div className="line-body">{body}</div>
    </li>
  )
}
