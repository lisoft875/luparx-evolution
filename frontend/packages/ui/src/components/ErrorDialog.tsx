import * as React from 'react';
import { useId } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

export interface ErrorDialogProps {
  open: boolean;
  onClose: () => void;
  /** What failed, in the caller's words — e.g. "No se pudo iniciar el estacionamiento". */
  title: string;
  /** Why it failed: already resolved to a sentence by the caller's error mapper. */
  message: string;
  /** Accessible name for the header's close control. */
  closeLabel: string;
  /** The single acknowledging action — e.g. "Entendido". */
  dismissLabel: string;
}

/**
 * The answer to a submit that failed.
 *
 * <p>An inline `Alert` is the right shape for a condition the screen already carries — a zone list
 * that came back empty, a municipality that is not charging right now. It is the wrong shape for
 * the outcome of a button the citizen just pressed at the bottom of a long form: the message
 * renders above the fold, the page does not move, and the only visible change is a spinner that
 * stopped. The citizen reads that as "nothing happened" and presses again.</p>
 *
 * <p>So a failed action interrupts. The dialog takes focus (which is what makes a screen reader
 * announce it), dims the form behind it, and offers exactly one way out, because there is nothing
 * to decide here — the work is to read the reason and go fix the field it names. Anything the
 * citizen can act on directly belongs on the field itself, not here.</p>
 *
 * <p>Deliberately free of any error-shaped decoration: the title states the failure, and a red
 * banner inside a dialog that already says "no se pudo" only repeats it.</p>
 */
export function ErrorDialog({
  open,
  onClose,
  title,
  message,
  closeLabel,
  dismissLabel,
}: ErrorDialogProps): React.JSX.Element | null {
  // Pointed at by the dialog's `aria-describedby`: focus lands on the dismiss button, so without
  // this the reason — the only thing on screen worth reading — is the one part that is not read.
  const messageId = useId();

  return (
    <Modal open={open} onClose={onClose} title={title} closeLabel={closeLabel} describedBy={messageId}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
        <p id={messageId} className="lx-text-body" style={{ margin: 0 }}>
          {message}
        </p>
        <div className="lx-dialog-actions">
          <Button type="button" variant="primary" fullWidth onClick={onClose}>
            {dismissLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
