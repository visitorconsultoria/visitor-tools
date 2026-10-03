import { useEffect, useRef } from 'react'

export default function ConfirmationDialog({ message, onResult }: {
  message: string
  onResult: (confirmed: boolean) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="estimativas-modal app-confirm-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="app-confirm-title"
      aria-describedby="app-confirm-message"
      onCancel={(event) => { event.preventDefault(); onResult(false) }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onResult(false)
        }
      }}
      onClose={() => onResult(false)}
    >
      <header className="estimativas-modal__header">
        <h3 id="app-confirm-title">Confirmar ação</h3>
      </header>
      <p id="app-confirm-message" className="app-confirm-dialog__message">{message}</p>
      <div className="app-confirm-dialog__actions">
        <button type="button" className="button-secondary" autoFocus onClick={() => onResult(false)}>Cancelar</button>
        <button type="button" className="button-primary" onClick={() => onResult(true)}>Confirmar</button>
      </div>
    </dialog>
  )
}
