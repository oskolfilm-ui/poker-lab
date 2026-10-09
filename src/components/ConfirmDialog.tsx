import { useEffect, useId, useRef } from 'react'
import { RefreshCw, X } from 'lucide-react'

export function ConfirmDialog({ title, description, confirmLabel, busy, onClose, onConfirm }: {
  title: string; description: string; confirmLabel: string; busy?: boolean; onClose: () => void; onConfirm: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="reset-dialog" onCancel={onClose} aria-labelledby={titleId}>
    <button className="dialog-close icon-button" onClick={onClose} aria-label="Закрыть"><X size={20} /></button>
    <div className="reset-symbol"><RefreshCw size={24} /></div>
    <h2 id={titleId}>{title}</h2><p>{description}</p>
    <div><button className="secondary-button" autoFocus onClick={onClose}>Отмена</button><button className="primary-button" disabled={busy} onClick={onConfirm}>{busy ? 'Сохраняем…' : confirmLabel}</button></div>
  </dialog>
}
