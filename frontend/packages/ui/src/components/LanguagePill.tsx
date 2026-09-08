import * as React from 'react';
import { SUPPORTED_LOCALES, useTranslation } from '@luparx/i18n';
import { IconGlobe } from '../icons';

export interface LanguagePillProps {
  className?: string;
}

/**
 * Floating locale switcher pill (auth screens, DESIGN_SYSTEM.md hero login).
 * Cycles through every locale in `SUPPORTED_LOCALES` and shows the active
 * locale's primary language subtag (e.g. "ES", "EN") — never a hardcoded
 * label, since adding a market only means adding an entry to that list.
 */
export function LanguagePill({ className }: LanguagePillProps): React.JSX.Element {
  const { t, locale, setLocale } = useTranslation();

  function cycleLocale(): void {
    const index = SUPPORTED_LOCALES.indexOf(locale);
    // Non-null: SUPPORTED_LOCALES is a non-empty compile-time constant.
    setLocale(SUPPORTED_LOCALES[(index + 1) % SUPPORTED_LOCALES.length]!);
  }

  const code = locale.split('-')[0]?.toUpperCase() ?? locale.toUpperCase();

  return (
    <button
      type="button"
      className={['lx-language-pill', className].filter(Boolean).join(' ')}
      onClick={cycleLocale}
      aria-label={t('common.languageSwitcher.label')}
    >
      <IconGlobe size={16} />
      <span>{code}</span>
    </button>
  );
}
