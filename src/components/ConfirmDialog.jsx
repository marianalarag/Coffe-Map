import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Coffee, Loader2, X } from 'lucide-react';

export default function ConfirmDialog({ title, description, confirmLabel, busy, error, onConfirm, onCancel }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return createPortal(<dialog ref={dialogRef} className="app-confirm-dialog" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description" onCancel={(event) => {
    event.preventDefault();
    if (!busy) onCancel();
  }} onClick={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <section>
      <button className="app-confirm-close" type="button" onClick={onCancel} disabled={busy} aria-label="Cerrar confirmación"><X size={20} /></button>
      <span className="app-confirm-icon"><Coffee size={25} /></span>
      <h2 id="confirm-dialog-title">{title}</h2>
      <p id="confirm-dialog-description">{description}</p>
      {error && <p className="app-confirm-error" role="alert">{error}</p>}
      <div className="app-confirm-actions">
        <button type="button" onClick={onCancel} disabled={busy} autoFocus>Cancelar</button>
        <button type="button" onClick={onConfirm} disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />}{busy ? 'Guardando…' : confirmLabel}</button>
      </div>
    </section>
  </dialog>, document.body);
}
