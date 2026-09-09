import * as React from 'react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
  /**
   * Second line under the label — a price, a plate, a reason. The reference product puts the
   * money on the option itself ("30 minutos · ₡300,00") rather than only in a summary below, so
   * choosing and knowing the cost are the same glance.
   */
  detail?: string;
  /** Leading mark for this row: a pin, a car, a municipality's emblem. */
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  id?: string;
  name?: string;
  value: string;
  /** The chosen value, not a DOM event: nothing outside this file should know how it is rendered. */
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Shown, muted, while nothing is chosen. Never a selectable row. */
  placeholder?: string;
  /** Leading icon inside the closed field (DESIGN_SYSTEM.md §3 "Flujo de estacionamiento"). */
  icon?: React.ReactNode;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  onBlur?: () => void;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

/** How far the list may grow before it scrolls inside itself. */
const MAX_LIST_HEIGHT = 320;
/** Below this much room the list flips above the field rather than squeezing into a sliver. */
const MIN_LIST_HEIGHT = 168;
const VIEWPORT_MARGIN = 8;

interface PopupBox {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  /** True when the list opens upward — the field then rounds its bottom into the list, not its top. */
  above: boolean;
}

/**
 * The platform's own dropdown (combobox + listbox, WAI-ARIA APG).
 *
 * <p>A native `<select>` renders its menu with the operating system's own widget: a white sheet in
 * the middle of a dark screen, in the OS font, ignoring every token in this design system, and
 * incapable of showing a second line or an icon per row. Screens 1 and 2 of the v0.6 review are
 * exactly that — the menu that appears over our parking flow is visibly not part of it. So the
 * menu is ours: the same surface, radius, border and type scale as the closed field, extended
 * with the two-line rows the reference product uses to put a price next to every duration.</p>
 *
 * <p><b>Focus never leaves the trigger.</b> This is the `aria-activedescendant` half of the APG
 * pattern rather than the roving-tabindex half: the button keeps DOM focus and points at the
 * active row by id, so closing the list cannot strand focus and a dialog's focus trap has nothing
 * new to contain. Escape, Tab and a click outside all close it with focus already in the right
 * place.</p>
 *
 * <p><b>The list is a portal, positioned against the viewport.</b> Every "glass" surface in this
 * system carries a `backdrop-filter`, which makes it the containing block for any `position:
 * fixed` descendant — a list rendered in place would be trapped inside the card and clipped by it.
 * The geometry is measured from the trigger and re-measured on scroll and resize, and it is
 * measured against `visualViewport` where there is one: on a phone that is the part of the screen
 * the software keyboard has not covered, which is the difference between a list you can read and
 * one that opens underneath the keyboard.</p>
 */
export function Select({
  id,
  name,
  value,
  onChange,
  options,
  placeholder,
  icon,
  invalid,
  disabled,
  required,
  className,
  onBlur,
  ...aria
}: SelectProps): React.JSX.Element {
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-trigger`;
  const listId = `${generatedId}-list`;
  const optionId = (index: number): string => `${generatedId}-opt-${index}`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeaheadRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [box, setBox] = useState<PopupBox | null>(null);

  const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value]);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const measure = useCallback((): void => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    // The *visual* viewport, so an open software keyboard shrinks the space we are allowed to use
    // instead of the list being drawn behind it.
    const viewport = typeof window !== 'undefined' ? window.visualViewport : null;
    const viewTop = viewport?.offsetTop ?? 0;
    const viewHeight = viewport?.height ?? window.innerHeight;
    // Chrome pinned to an edge of the app — the tab bar at the bottom, the running-stay timer at
    // the top — is measured rather than assumed: the timer is only there while a stay is running,
    // so a fixed inset would be wrong half the time. Anything that covers an edge of the viewport
    // marks itself with `data-lx-bottom-chrome` / `data-lx-top-chrome`, and the list stops short of
    // it. Each edge is taken as the innermost edge among its nodes rather than as a sum of heights:
    // stacked bars overlap, and adding heights would double-count and cut the list short.
    const viewportBottom = viewTop + viewHeight;
    const chromeTop = [...document.querySelectorAll<HTMLElement>('[data-lx-bottom-chrome]')].reduce(
      (highest, node) => {
        const box = node.getBoundingClientRect();
        return box.height > 0 ? Math.min(highest, box.top) : highest;
      },
      viewportBottom,
    );
    const chromeBottom = [...document.querySelectorAll<HTMLElement>('[data-lx-top-chrome]')].reduce(
      (lowest, node) => {
        const box = node.getBoundingClientRect();
        return box.height > 0 ? Math.max(lowest, box.bottom) : lowest;
      },
      viewTop,
    );
    const below = Math.min(chromeTop, viewportBottom) - rect.bottom - VIEWPORT_MARGIN;
    const above = rect.top - Math.max(chromeBottom, viewTop) - VIEWPORT_MARGIN;
    const flip = below < MIN_LIST_HEIGHT && above > below;
    const room = Math.max(MIN_LIST_HEIGHT, Math.floor(flip ? above : below));
    setBox({
      left: rect.left,
      top: flip ? rect.top : rect.bottom,
      width: rect.width,
      maxHeight: Math.min(MAX_LIST_HEIGHT, room),
      above: flip,
    });
  }, []);

  // Before paint, so the list never appears at 0,0 for a frame and then jumps into place.
  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const reposition = (): void => measure();
    // `true`: a list anchored to a field inside a scrolling card has to follow that card too, and
    // scroll events on inner elements do not bubble.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
    };
  }, [open, measure]);

  // Anything outside the field and its list closes it — a tap on the page behind, on another
  // field, on the dialog's backdrop. `pointerdown` and not `click`, so the list is already gone
  // by the time the thing underneath reacts.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent): void {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [open]);

  // Keep the active row visible while the arrows walk past the fold.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(activeIndex))}`)?.scrollIntoView({
      block: 'nearest',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  const firstEnabled = useCallback(
    (from: number, step: number): number => {
      if (options.length === 0) return -1;
      for (let i = 0; i < options.length; i += 1) {
        const index = (from + step * i + options.length * options.length) % options.length;
        if (!options[index]!.disabled) return index;
      }
      return -1;
    },
    [options],
  );

  const openList = useCallback(
    (start?: 'first' | 'last'): void => {
      if (disabled) return;
      const from = selectedIndex >= 0 ? selectedIndex : start === 'last' ? options.length - 1 : 0;
      setActiveIndex(options[from]?.disabled ? firstEnabled(from, start === 'last' ? -1 : 1) : from);
      setOpen(true);
    },
    [disabled, firstEnabled, options, selectedIndex],
  );

  const close = useCallback((): void => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const commit = useCallback(
    (index: number): void => {
      const option = options[index];
      if (!option || option.disabled) return;
      onChange(option.value);
      close();
      triggerRef.current?.focus();
    },
    [close, onChange, options],
  );

  const move = useCallback(
    (step: number): void => {
      setActiveIndex((current) => firstEnabled(current < 0 ? (step > 0 ? 0 : options.length - 1) : current + step, step));
    },
    [firstEnabled, options.length],
  );

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (disabled) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openList('first');
        else move(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openList('last');
        else move(-1);
        return;
      case 'Home':
        if (!open) return;
        event.preventDefault();
        setActiveIndex(firstEnabled(0, 1));
        return;
      case 'End':
        if (!open) return;
        event.preventDefault();
        setActiveIndex(firstEnabled(options.length - 1, -1));
        return;
      case 'Enter':
        event.preventDefault();
        if (open) commit(activeIndex);
        else openList();
        return;
      case ' ':
      case 'Spacebar':
        // A space typed into a typeahead is part of a name ("San José"), not a command.
        if (open && typeaheadRef.current.text.length > 0) break;
        event.preventDefault();
        if (open) commit(activeIndex);
        else openList();
        return;
      case 'Escape':
        if (!open) return;
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      case 'Tab':
        // Tab is a decision: take the highlighted row and let focus move on, exactly as a native
        // select does. It is never a silent cancel.
        if (open) {
          if (activeIndex >= 0) onChange(options[activeIndex]!.value);
          close();
        }
        return;
      default:
        break;
    }

    // Typeahead. One key jumps to the next option starting with it; typed quickly, the keys build
    // a prefix — which is what makes a list of 82 municipalities usable from a keyboard.
    if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
    const now = Date.now();
    const state = typeaheadRef.current;
    state.text = now - state.at > 700 ? event.key : state.text + event.key;
    state.at = now;
    const needle = state.text.toLocaleLowerCase();
    const from = (open ? Math.max(activeIndex, 0) : Math.max(selectedIndex, 0)) + (state.text.length > 1 ? 0 : 1);
    for (let i = 0; i < options.length; i += 1) {
      const index = (from + i) % options.length;
      const option = options[index]!;
      if (option.disabled) continue;
      if (option.label.toLocaleLowerCase().startsWith(needle)) {
        if (open) setActiveIndex(index);
        else onChange(option.value);
        return;
      }
    }
  }

  const classes = ['lx-select', invalid ? 'lx-select--invalid' : '', open ? 'lx-select--open' : '', className]
    .filter(Boolean)
    .join(' ');

  const list =
    open && box
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={aria['aria-label'] ? undefined : triggerId}
            aria-label={aria['aria-label']}
            className={`lx-listbox${box.above ? ' lx-listbox--above' : ''}`}
            style={{
              left: box.left,
              width: box.width,
              maxHeight: box.maxHeight,
              ...(box.above ? { bottom: `calc(100% - ${box.top}px)` } : { top: box.top }),
            }}
          >
            {options.length === 0 ? (
              <li className="lx-listbox__empty" role="presentation">
                {placeholder ?? ''}
              </li>
            ) : (
              options.map((option, index) => (
                <li
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  className={[
                    'lx-listbox__option',
                    index === activeIndex ? 'lx-listbox__option--active' : '',
                    option.value === value ? 'lx-listbox__option--selected' : '',
                    option.disabled ? 'lx-listbox__option--disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  // Pointer, not click: the trigger keeps focus and `pointerdown` outside would
                  // otherwise close the list before the click could land.
                  onPointerDown={(event) => {
                    event.preventDefault();
                    commit(index);
                  }}
                  onPointerEnter={() => {
                    if (!option.disabled) setActiveIndex(index);
                  }}
                >
                  <span className="lx-listbox__check" aria-hidden="true">
                    {option.value === value ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" focusable="false">
                        <path
                          d="M3.5 8.5l3 3 6-7"
                          stroke="currentColor"
                          strokeWidth="1.9"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </span>
                  {option.icon ? (
                    <span className="lx-listbox__icon" aria-hidden="true">
                      {option.icon}
                    </span>
                  ) : null}
                  <span className="lx-listbox__text">
                    <span className="lx-listbox__label">{option.label}</span>
                    {option.detail ? <span className="lx-listbox__detail">{option.detail}</span> : null}
                  </span>
                </li>
              ))
            )}
          </ul>,
          document.body,
        )
      : null;

  return (
    <span className={`lx-select-wrap${icon ? ' lx-select-wrap--with-icon' : ''}`}>
      {icon ? (
        <span className="lx-select-wrap__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        role="combobox"
        className={classes}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        onClick={() => (open ? close() : openList())}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
      >
        {/* The closed field is one line — the option's own name and nothing else. The second line
            belongs in the list, where it distinguishes options from each other; carried up here it
            only makes the field taller and, for a zone with a paragraph of description, unreadable
            at 320 px. */}
        <span className={`lx-select__value${selected ? '' : ' lx-select__value--placeholder'}`}>
          <span className="lx-select__label">{selected ? selected.label : (placeholder ?? '')}</span>
        </span>
        <span className="lx-select__caret" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" focusable="false">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {/* So a surrounding <form> still submits this choice, and so tests can read the value. */}
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {list}
    </span>
  );
}
