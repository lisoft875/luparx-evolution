import * as React from 'react';
import { useTranslation, localeEndonym, isSupportedLocale, type SupportedLocale } from '@luparx/i18n';
import { IconGlobe } from '../icons';
import { Select } from './Select';

export interface LocaleSelectProps {
  /**
   * BCP 47 tags to offer, in the order the municipality configured them
   * (CONTRACT.md v0.3 §"Idiomas por municipalidad"). Never a list hardcoded in a component.
   */
  locales: readonly string[];
  /** `compact` is the floating control used on auth screens; `field` is a normal form control. */
  variant?: 'compact' | 'field';
  id?: string;
  className?: string;
  /** Called after the interface has switched, so the caller can persist the choice. */
  onLocaleChange?: (locale: SupportedLocale) => void;
}

/**
 * Language dropdown.
 *
 * A dropdown and not a two-state pill on purpose: the list is whatever the municipality enabled,
 * so it can be two entries today and six tomorrow, and a control that only cycles hides that.
 * Options are labelled with each language's endonym, so the entry a reader is looking for is
 * legible even when the interface is currently in a language they do not read.
 *
 * Locales the app has no dictionary for are still shown when the municipality enabled them —
 * hiding them would silently contradict the administrator — but they are marked as unavailable
 * and cannot be selected, which is the honest version of the same information.
 */
export function LocaleSelect({
  locales,
  variant = 'field',
  id,
  className,
  onLocaleChange,
}: LocaleSelectProps): React.JSX.Element {
  const { t, locale, setLocale } = useTranslation();
  const options = locales.length > 0 ? locales : [locale];

  return (
    <span className={['lx-locale-select', `lx-locale-select--${variant}`, className].filter(Boolean).join(' ')}>
      <span className="lx-locale-select__icon" aria-hidden="true">
        <IconGlobe size={16} />
      </span>
      {/* The platform's own dropdown, like every other list on every other screen. The native
          control this replaced opened the operating system's menu — a light sheet in the OS font
          over a dark app, which is precisely the break the v0.6 review flagged. */}
      <Select
        id={id}
        className="lx-locale-select__control"
        aria-label={t('common.languageSwitcher.label')}
        value={locale}
        onChange={(next) => {
          if (!isSupportedLocale(next)) return;
          setLocale(next);
          onLocaleChange?.(next);
        }}
        options={options.map((option) => {
          const available = isSupportedLocale(option);
          return {
            value: option,
            label: localeEndonym(option),
            detail: available ? undefined : t('common.languageSwitcher.unavailable'),
            disabled: !available,
          };
        })}
      />
    </span>
  );
}
