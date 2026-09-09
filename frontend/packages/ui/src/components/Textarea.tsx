import * as React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /**
   * Shows `value.length / maxLength` under the field. Only meaningful with `maxLength`, and only
   * worth turning on where the limit is part of the task — a defence has 4000 characters and a
   * person writing one is entitled to know how many are left before they lose the tail of it.
   */
  showCount?: boolean;
  countLabel?: string;
}

/**
 * Multi-line text (CONTRACT.md v0.17).
 *
 * <p>Added because the two places that needed one — the citizen's defence and the municipality's
 * reason for deciding it — were both about to be typed into a single-line `Input`. A 4000-character
 * argument in a field that shows forty of them is a field that invites people to give up halfway,
 * and the whole point of a defence is that it is read.</p>
 *
 * <p>Shares `.lx-input` with {@link Input} rather than restating its surface: they are the same
 * field, one of them taller, and the day the border radius changes it must change in both.</p>
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, showCount, countLabel, rows = 6, value, maxLength, ...rest },
  ref,
) {
  const classes = ['lx-input', 'lx-textarea', invalid ? 'lx-input--invalid' : '', className]
    .filter(Boolean)
    .join(' ');
  const length = typeof value === 'string' ? value.length : 0;
  return (
    <>
      <textarea
        ref={ref}
        className={classes}
        rows={rows}
        value={value}
        maxLength={maxLength}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      {showCount && maxLength ? (
        // `aria-live="off"`: a counter that announced itself on every keystroke would make the
        // field unusable with a screen reader. It is there to be checked, not to interrupt.
        <div className="lx-textarea-count" aria-live="off">
          {countLabel ?? `${length} / ${maxLength}`}
        </div>
      ) : null}
    </>
  );
});
