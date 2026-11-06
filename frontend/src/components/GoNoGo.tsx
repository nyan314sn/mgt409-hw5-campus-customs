import { useEffect, useState } from 'react'
import type { AgentReply, ApprovalOption, Approvals, RunStatus, Ticket } from '../api'
import { money } from '../derive'
import { PanelHead } from './ui'

interface Props {
  ticket: Ticket | null
  approvals: Approvals | null
  finalReply: AgentReply | null
  runStatus: RunStatus | null
  balance: number | null
  operator: string
  setOperator: (v: string) => void
  onApprove: (opt: ApprovalOption, amount: number, qty?: number, vendorId?: number) => Promise<boolean>
  onProjected: (n: number | null) => void
}

export function GoNoGo(p: Props) {
  const [showAnyway, setShowAnyway] = useState(false)
  useEffect(() => setShowAnyway(false), [p.ticket?.id])

  const asked = !!p.finalReply?.needs_human_approval
  let body
  if (!p.ticket) body = <p className="muted">Select a ticket.</p>
  else if (p.runStatus === 'running') body = <p className="muted">The agents are still working. Approvals open when the Boss gives the final answer.</p>
  else if (!p.approvals?.ready) body = <p className="muted">The team hasn't finished a run on this ticket yet. Humans approve only what the agents have prepared, so run the team first.</p>
  else {
    const options = p.approvals.options
    const allDone = options.length > 0 && options.every((o) => o.done)
    body = (
      <>
        <div className={`poll-banner${asked && !allDone ? ' is-asked' : ''}`}>
          {allDone ? 'All decisions recorded' : asked ? 'The Boss asks for a human decision' : 'The agents did not ask for a decision'}
        </div>
        {p.finalReply && p.finalReply.proposed_actions.length > 0 && (
          <div className="poll-recs">
            <h3 className="sub-head">Agents recommend</h3>
            <ul>{p.finalReply.proposed_actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </div>
        )}
        {options.length === 0 ? (
          <p className="muted small">Nothing on this ticket moves cash. No payment or purchase to approve.</p>
        ) : !asked && !showAnyway ? (
          <button type="button" className="btn btn-ghost small" onClick={() => setShowAnyway(true)}>
            Show approvals anyway ({options.length} option{options.length === 1 ? '' : 's'})
          </button>
        ) : (
          <>
            <label className="operator">
              <span>Approved by</span>
              <input value={p.operator} onChange={(e) => p.setOperator(e.target.value)} placeholder="Your name (recorded with every approval)" maxLength={80} />
            </label>
            {options.map((o) => (
              <PollCard key={`${p.ticket!.id}-${o.kind}`} opt={o} balance={p.balance ?? p.approvals!.balance} operator={p.operator.trim()} onApprove={p.onApprove} onProjected={p.onProjected} />
            ))}
          </>
        )}
      </>
    )
  }

  return (
    <section className="panel gonogo" aria-labelledby="go-h">
      <PanelHead id="go-h" code="PNL-08" title="Approvals" right={p.ticket ? `CC-${p.ticket.id}` : ''} />
      <div className="gonogo-body">{body}</div>
    </section>
  )
}

function PollCard({ opt, balance, operator, onApprove, onProjected }: {
  opt: ApprovalOption
  balance: number
  operator: string
  onApprove: Props['onApprove']
  onProjected: Props['onProjected']
}) {
  const [qty, setQty] = useState(opt.qty ?? 1)
  const [vendorId, setVendorId] = useState(opt.vendor_id)
  const [armed, setArmed] = useState(false)
  const [held, setHeld] = useState(false)
  const [busy, setBusy] = useState(false)

  const isPurchase = opt.kind === 'purchase' && opt.unit_cost !== undefined
  const amount = isPurchase ? Math.round(opt.unit_cost! * qty * 100) / 100 : opt.amount
  const vendor = opt.vendors?.find((v) => v.id === vendorId)
  const payee = isPurchase ? vendor?.name ?? opt.payee : opt.payee
  const after = balance - amount
  const short = after < 0

  // Two-step approve: an armed approval cancels itself after 6 seconds.
  useEffect(() => {
    if (!armed) return
    onProjected(after)
    const id = window.setTimeout(() => setArmed(false), 6000)
    return () => {
      window.clearTimeout(id)
      onProjected(null)
    }
  }, [armed, after, onProjected])

  if (opt.done) {
    return (
      <article className="poll poll-done">
        <header><span className="poll-title">{opt.title}</span><span className="stamp stamp-landed">Approved</span></header>
        <p className="muted small">{opt.done_reason}</p>
      </article>
    )
  }

  const fire = async () => {
    setBusy(true)
    await onApprove(opt, amount, isPurchase ? qty : undefined, isPurchase ? vendorId : undefined)
    setBusy(false)
    setArmed(false)
  }

  return (
    <article className={`poll${armed ? ' is-armed' : ''}${held ? ' is-held' : ''}`}>
      <header>
        <span className="poll-title">{opt.title}</span>
        <span className="poll-amount">{money(amount)}</span>
      </header>
      <dl className="poll-facts">
        <div><dt>Pay to</dt><dd>{payee}</dd></div>
        <div><dt>Detail</dt><dd>{opt.detail}</dd></div>
        <div><dt>Cash after</dt><dd className={short ? 'neg' : after < balance * 0.15 ? 'warn' : ''}>{money(after)}</dd></div>
      </dl>
      {isPurchase && (
        <div className="poll-inputs">
          <label>
            <span>Qty</span>
            <input type="number" min={1} max={500} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} />
          </label>
          <label className="grow">
            <span>Vendor</span>
            <select value={vendorId} onChange={(e) => setVendorId(Number(e.target.value))}>
              {opt.vendors?.map((v) => (
                <option key={v.id} value={v.id}>{v.name} · {v.specialty} · {v.lead_days}d</option>
              ))}
            </select>
          </label>
          <p className="muted small">At unit cost {money(opt.unit_cost!)}. Stock lands after the vendor's lead time.</p>
        </div>
      )}
      {held ? (
        <div className="poll-held">
          <span>On hold for now</span>
          <button type="button" className="btn btn-ghost small" onClick={() => setHeld(false)}>Reopen</button>
        </div>
      ) : (
        <div className="poll-actions">
          {!armed ? (
            <>
              <button
                type="button"
                className="btn btn-go"
                disabled={!operator || short || busy}
                onClick={() => setArmed(true)}
                title={!operator ? 'Enter your name first' : short ? 'Not enough cash' : 'Approve (you will confirm next)'}
              >
                {short ? 'Not enough cash' : 'Approve'}
              </button>
              <button type="button" className="btn btn-nogo" onClick={() => setHeld(true)}>Hold</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-confirm" onClick={fire} disabled={busy} autoFocus>
                {busy ? 'Paying…' : `Confirm · pay ${money(amount)}`}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setArmed(false)} disabled={busy}>Cancel</button>
            </>
          )}
        </div>
      )}
      {!operator && !held && <p className="hint">Enter your name above to approve.</p>}
    </article>
  )
}
