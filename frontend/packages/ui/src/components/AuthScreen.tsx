import * as React from 'react';
import { useTranslation } from '@luparx/i18n';
import { Brand } from './Brand';

export interface AuthScreenProps {
  /** One-line product tagline shown under the brand mark (e.g. t('app.tagline')). */
  heroTitle: string;
  /** Two-line supporting copy, max ~46ch (design system rule), already translated. */
  heroDescription: string;
  /** The auth card (login/register/etc.) — rendered in the right-hand panel. */
  children: React.ReactNode;
  /**
   * Optional dimmed background art for the hero column (e.g. `BRAND_ASSETS.heroCitizen`).
   * Rendered as pure atmosphere behind a scrim/mask — the supplied hero photography has its
   * (Spanish) tagline baked into the pixels, so it is never the message on its own: `heroTitle`/
   * `heroDescription` above remain the only readable copy, always real translated text on top.
   */
  heroImage?: string;
  /**
   * The language dropdown, floated over the screen. Injected rather than rendered here because
   * the list belongs to the municipality and has to be fetched (see `LocaleSwitcher` in
   * @luparx/features); this package stays presentational and free of data dependencies.
   */
  localeSwitcher?: React.ReactNode;
}

/**
 * Full-bleed two-column shell for public auth screens (login and friends),
 * matching the reference marketing entry point: a dark hero column with the
 * real brand lockup on the left (top, stacked, on narrow viewports) and the
 * auth card on the right — never a shared nav chrome, this is
 * pre-authentication. The lockup is opaque artwork composed on near-black,
 * so it is only ever placed on this dark hero surface.
 */
export function AuthScreen({ heroTitle, heroDescription, children, heroImage, localeSwitcher }: AuthScreenProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="lx-auth-screen">
      <p className="lx-auth-screen__watermark" aria-hidden="true">
        {t('app.name')}
      </p>
      <div
        className="lx-auth-screen__hero"
        style={heroImage ? ({ '--lx-auth-hero-image': `url(${heroImage})` } as React.CSSProperties) : undefined}
      >
        <Brand name={t('app.name')} variant="lockup" size={32} />
        <div className="lx-auth-screen__hero-bar" aria-hidden="true" />
        <p className="lx-auth-screen__hero-title">{heroTitle}</p>
        <p className="lx-auth-screen__hero-description">{heroDescription}</p>
      </div>
      <div className="lx-auth-screen__panel">
        <div className="lx-auth-screen__panel-inner">{children}</div>
      </div>
      {localeSwitcher}
    </div>
  );
}
