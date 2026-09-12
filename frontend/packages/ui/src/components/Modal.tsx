import * as React from 'react';
import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

export type ModalVariant = 'dialog' | 'sheet';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: React.ReactNode;
  /**
   * False when the dialog is a **step** and not an interruption — the municipality picker for an
   * account that has not chosen one yet is the case this exists for. It removes the close button,
   * makes Escape and the backdrop inert, and is announced by leaving the dialog with no dismissal
   * affordance at all. Offering an X that cannot honestly close anything is worse than offering
   * none: it reads as a way out and is not one.
   */
  dismissible?: boolean;
  /**
   * `sheet` is the full-height panel the municipality picker uses: it fills the screen on a phone
   * so the grid it carries is the whole context, and settles into a centred panel once there is
   * room for one. `dialog` is the small centred box every confirm/extend dialog already uses.
   */
  variant?: ModalVariant;
  /** Supporting line under the title, inside the header. */
  description?: React.ReactNode;
  /** Pinned under the scrolling body — an escape hatch that must stay reachable, e.g. "sign out". */
  footer?: React.ReactNode;
  /**
   * Id of the element inside the body that *is* the message, wired to `aria-describedby`.
   *
   * Focus moves to the first control, so the title and that control are announced and the body is
   * not. For a dialog whose body is a form that is correct — the fields announce themselves. For
   * one whose body is a sentence the citizen has to read (see `ErrorDialog`), it is the whole
   * point, and this is what makes it reach a screen reader.
   */
  describedBy?: string;
}

/** Everything that can hold focus inside the dialog, in DOM order. */
const FOCUSABLE =
  'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex]:not([tabindex="-1"]), [contenteditable]';

export function Modal({
  open,
  onClose,
  title,
  closeLabel,
  children,
  dismissible = true,
  variant = 'dialog',
  description,
  footer,
  describedBy,
}: ModalProps): React.JSX.Element | null {
  // `useId` and not a fixed string: two dialogs mounted at once (the parking flow can have the
  // municipality sheet over a card that owns its own dialog) would otherwise both point their
  // `aria-labelledby` at the same id, and a screen reader would read one of them the other's name.
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // The element focus has to go back to. A dialog that drops focus on the body when it closes
  // leaves a keyboard user at the top of the page, having lost the badge they just pressed.
  const returnFocusRef = useRef<Element | null>(null);

  const requestClose = useCallback(() => {
    if (dismissible) onClose();
  }, [dismissible, onClose]);

  /** Everything inside the dialog that can hold focus right now, in DOM order. */
  const focusables = useCallback((): HTMLElement[] => {
    const dialog = dialogRef.current;
    if (!dialog) return [];
    return [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (node) => node.offsetParent !== null || node === document.activeElement,
    );
  }, []);

  /*
   * OPENING AND CLOSING. Depends on `open` and on nothing else, and that is the whole point.
   *
   * These four things happen once per opening: remember where focus came from, lock the page
   * behind, move focus in, and — on the way out — give focus back. Until v0.40 they shared one
   * effect with the key handler below, whose dependencies include `onClose`. Almost every caller
   * passes an inline arrow or a function declared in its component body, so `onClose` is a NEW
   * identity on every render: the effect tore down and re-ran on every keystroke, the cleanup
   * returned focus to the element outside the dialog and the body then focused the first control
   * again. Typing in any field inside any modal lost focus after each character.
   *
   * So: anything that must happen once per opening goes here, and nothing that changes per render
   * may enter this dependency list. `focusables` is a stable useCallback, which is why it can.
   */
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement;

    // The page behind must not scroll under the dialog: on a phone that is the difference between
    // a sheet and a translucent layer the content slides beneath.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus moves into the dialog rather than staying on whatever opened it, so the next Tab is
    // inside the dialog and a screen reader starts reading here.
    const first = focusables()[0];
    (first ?? dialogRef.current)?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      // A dialog that drops focus on the body when it closes leaves a keyboard user at the top of
      // the page, having lost the badge they just pressed.
      const target = returnFocusRef.current;
      if (target instanceof HTMLElement && document.contains(target)) target.focus();
    };
  }, [open, focusables]);

  /*
   * THE KEYBOARD. This one may re-run as often as it likes: adding and removing a listener is
   * cheap and leaves no state behind, which is exactly why it belongs apart from the effect above.
   */
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        // Only when there is something to close. See `dismissible`.
        if (dismissible) {
          event.stopPropagation();
          onClose();
        }
        return;
      }
      if (event.key !== 'Tab') return;
      // The trap. Without it Tab walks out of the dialog into the page behind it, which is still
      // rendered and still focusable — the classic way a modal stops being modal for a keyboard.
      const nodes = focusables();
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }
      const firstNode = nodes[0]!;
      const lastNode = nodes[nodes.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === firstNode || !dialogRef.current?.contains(active))) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && active === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, dismissible, onClose, focusables]);

  if (!open) return null;

  // Rendered via a portal straight onto `document.body`: a caller can (and does — the parking
  // Extend/Finish dialogs live inside the active-session `Card`) mount this from anywhere in the
  // tree. Without the portal, any ancestor with `backdrop-filter`/`transform`/`filter` (every
  // "Level 1 glass" surface in this design system has one) becomes the containing block for this
  // backdrop's `position: fixed`, trapping it inside that ancestor instead of covering the
  // viewport — it stops centering correctly and other fixed chrome (e.g. the sticky timer bar)
  // paints over it instead of being dimmed underneath.
  return createPortal(
    <div
      className={`lx-modal-backdrop${variant === 'sheet' ? ' lx-modal-backdrop--sheet' : ''}`}
      onClick={requestClose}
    >
      <div
        ref={dialogRef}
        className={`lx-modal${variant === 'sheet' ? ' lx-modal--sheet' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="lx-modal__header">
          <div className="lx-modal__heading">
            <h2 id={titleId} className="lx-modal__title">
              {title}
            </h2>
            {description ? <p className="lx-modal__description">{description}</p> : null}
          </div>
          {dismissible ? (
            <button type="button" className="lx-modal__close" onClick={onClose} aria-label={closeLabel}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
        <div className="lx-modal__body">{children}</div>
        {footer ? <div className="lx-modal__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
