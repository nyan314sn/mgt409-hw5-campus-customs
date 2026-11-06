import type { CSSProperties } from 'react'
import { AGENT_IDS, CREW, TOOL_LABEL } from '../crew'
import type { RunView, Station } from '../derive'
import { Glyph, Led, PanelHead } from './ui'

interface Props {
  view: RunView
  hasRun: boolean
  running: boolean
}

export function Stations({ view, hasRun, running }: Props) {
  const onLoop = AGENT_IDS.filter((id) => view.stations[id].status !== 'standby').length
  return (
    <section className="panel" aria-labelledby="consoles-h">
      <PanelHead id="consoles-h" code="PNL-03" title="Agents" right={hasRun ? `${onLoop}/5 called on this ticket` : 'Waiting for a run'} />
      <div className="consoles">
        {AGENT_IDS.map((id) => (
          <Console key={id} st={view.stations[id]} hasRun={hasRun} running={running} />
        ))}
      </div>
    </section>
  )
}

function Console({ st, hasRun, running }: { st: Station; hasRun: boolean; running: boolean }) {
  const m = CREW[st.id]
  const tools = Object.values(st.toolCounts).reduce((a, b) => a + b, 0)
  const live = st.status === 'active' && running

  let label = hasRun ? 'Not called' : 'Idle'
  let tone: 'ok' | 'live' | 'warn' | 'lost' | 'off' = 'off'
  if (st.status === 'active') {
    label = running ? 'Working' : 'Interrupted'
    tone = running ? 'live' : 'warn'
  } else if (st.status === 'done') {
    label = 'Done'
    tone = 'ok'
  } else if (st.status === 'error') {
    label = 'Error'
    tone = 'lost'
  }

  const activity =
    st.activityKind === 'tool' && st.activity
      ? `${TOOL_LABEL[st.activity.split('(')[0]] ?? 'Tool'} · ${st.activity}`
      : st.activity

  return (
    <article
      className={`console console-${st.status}${live ? ' is-live' : ''}${st.status === 'standby' ? ' is-idle' : ''}`}
      style={{ '--crew': m.color } as CSSProperties}
      aria-label={`${m.name}: ${label}`}
    >
      <header className="console-head">
        <Glyph shape={m.glyph} color={m.color} size={16} hollow={st.status === 'standby'} />
        <span className="console-call">{m.name}</span>
        <Led tone={tone} />
      </header>
      <div className="console-status">{label}</div>
      <p key={st.activity ?? 'idle'} className={`console-activity kind-${st.activityKind ?? 'idle'}`}>
        {activity ?? m.post}
      </p>
      <footer className="console-foot">
        <span>{tools} tool{tools === 1 ? '' : 's'}</span>
        <span>{st.handoffsTo.length} hand-off{st.handoffsTo.length === 1 ? '' : 's'}</span>
        <span>{st.steps} step{st.steps === 1 ? '' : 's'}</span>
      </footer>
    </article>
  )
}
