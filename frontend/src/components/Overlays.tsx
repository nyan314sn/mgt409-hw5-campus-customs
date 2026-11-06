import { useEffect, useRef } from 'react'

export interface Toast {
  id: number
  tone: 'ok' | 'info' | 'error'
  title: string
  text?: string
}

export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <div>
            <div className="toast-title">{t.title}</div>
            {t.text && <div className="toast-text">{t.text}</div>}
          </div>
          <button type="button" className="toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  )
}

export function ResetDialog({ open, busy, onCancel, onConfirm }: { open: boolean; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])
  if (!open) return null
  return (
    <div className="scrim" onClick={onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="reset-h" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-stripe" aria-hidden="true" />
        <h2 id="reset-h">Reset the database?</h2>
        <p>This copies the original database over the working copy:</p>
        <ul>
          <li>Checking goes back to its starting balance and the payments list empties.</li>
          <li>All three tickets go back to <b>open</b>, and invoices and rent go back to unpaid.</li>
          <li>The audit trail is <b>kept</b>. The reset itself is logged.</li>
        </ul>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>{busy ? 'Resetting…' : 'Reset database'}</button>
        </div>
      </div>
    </div>
  )
}
