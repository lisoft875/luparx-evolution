import * as React from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

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

  // Rendered via a portal straight onto `document.body`: a caller can (and does — the parking
  // Extend/Finish dialogs live inside the active-session `Card`) mount this from anywhere in the
  // tree. Without the portal, any ancestor with `backdrop-filter`/`transform`/`filter` (every
  // "Level 1 glass" surface in this design system has one) becomes the containing block for this
  // backdrop's `position: fixed`, trapping it inside that ancestor instead of covering the
  // viewport — it stops centering correctly and other fixed chrome (e.g. the sticky timer bar)
  // paints over it instead of being dimmed underneath.
  return createPortal(
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
    </div>,
    document.body,
  );
}
