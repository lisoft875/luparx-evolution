import * as React from 'react';
import { useEffect } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, closeLabel, children }: ModalProps): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="lx-modal-backdrop" onClick={onClose}>
      <div
        className="lx-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lx-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="lx-modal__header">
          <h2 id="lx-modal-title" className="lx-modal__title">
            {title}
          </h2>
          <button type="button" className="lx-modal__close" onClick={onClose} aria-label={closeLabel}>
            ×
          </button>
        </div>
        <div className="lx-modal__body">{children}</div>
      </div>
    </div>
  );
}
