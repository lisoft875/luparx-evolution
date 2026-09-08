import * as React from 'react';
import { useTranslation } from '@luparx/i18n';
import { Brand } from './Brand';
import { LanguagePill } from './LanguagePill';

export interface AuthScreenProps {
  /** One-line product tagline shown under the brand mark (e.g. t('app.tagline')). */
  heroTitle: string;
  /** Two-line supporting copy, max ~46ch (design system rule), already translated. */
  heroDescription: string;
  /** The auth card (login/register/etc.) — rendered in the right-hand panel. */
  children: React.ReactNode;
}

/**
 * Full-bleed two-column shell for public auth screens (login and friends),
 * matching the reference marketing entry point: a dark hero column with the
 * brand mark on the left (top, stacked, on narrow viewports) and the auth
 * card on the right — never a shared nav chrome, this is pre-authentication.
 */
export function AuthScreen({ heroTitle, heroDescription, children }: AuthScreenProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="lx-auth-screen">
      <p className="lx-auth-screen__watermark" aria-hidden="true">
        {t('app.name')}
      </p>
      <div className="lx-auth-screen__hero">
        <Brand name={t('app.name')} size={32} />
        <div className="lx-auth-screen__hero-bar" aria-hidden="true" />
        <p className="lx-auth-screen__hero-title">{heroTitle}</p>
        <p className="lx-auth-screen__hero-description">{heroDescription}</p>
      </div>
      <div className="lx-auth-screen__panel">
        <div className="lx-auth-screen__panel-inner">{children}</div>
      </div>
      <LanguagePill />
    </div>
  );
}
