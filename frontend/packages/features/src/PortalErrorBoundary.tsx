import * as React from 'react';
import { useTranslation } from '@luparx/i18n';
import { ErrorBoundary } from '@luparx/ui';

/**
 * El {@link ErrorBoundary} con los textos del idioma de quien mira.
 *
 * <p>Existe porque `packages/ui` no traduce —recibe cadenas ya resueltas— y porque los cuatro
 * portales necesitan exactamente el mismo envoltorio. Va DENTRO de `I18nProvider` y FUERA de todo
 * lo demás: si estuviera más adentro, un fallo del proveedor de autenticación o del router pasaría
 * por encima de él y volveríamos a la pantalla en blanco.</p>
 */
export function PortalErrorBoundary({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <ErrorBoundary
      title={t('app.error.title')}
      body={t('app.error.body')}
      retryLabel={t('common.retry')}
    >
      {children}
    </ErrorBoundary>
  );
}
