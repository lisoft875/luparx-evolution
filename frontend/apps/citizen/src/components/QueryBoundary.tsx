import * as React from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from '@luparx/i18n';
import { Alert, Button } from '@luparx/ui';
import { apiErrorMessage } from '../lib/apiErrors';

export interface QueryBoundaryProps<T> {
  query: UseQueryResult<T>;
  /** Rendered once the query has data that is not empty. */
  children: (data: T) => React.ReactNode;
  /** What "empty" means for this payload — a list with no rows, a page with no results. */
  isEmpty?: (data: T) => boolean;
  /** Rendered instead of `children` when the payload is empty. Omit to render nothing. */
  empty?: React.ReactNode;
  /** Rendered while the first fetch is in flight. Defaults to the shared "Cargando…" line. */
  loading?: React.ReactNode;
  /**
   * What failed, in the reader's terms — the label of the card this stands in for. Without it a
   * grid of cards that lose their titles when they fail leaves no way to tell which one broke.
   */
  errorTitle?: React.ReactNode;
}

/**
 * The three answers a query can give, and an exit from each.
 *
 * A screen that renders "Cargando…" whenever its data is `undefined` cannot tell "still loading"
 * apart from "the request failed" or "there is nothing here", so a 404 or a dropped connection
 * shows as a spinner that never stops — which is exactly how "Saldo disponible" and "Vehículo
 * principal" came to sit on "Cargando" forever. Failure states the error, names the server's own
 * code where there is one, and offers the retry; empty says it is empty. Nothing here can end in
 * a state the reader cannot leave.
 */
export function QueryBoundary<T>({
  query,
  children,
  isEmpty,
  empty,
  loading,
  errorTitle,
}: QueryBoundaryProps<T>): React.JSX.Element {
  const { t } = useTranslation();

  if (query.isError) {
    return (
      <Alert tone="danger">
        {/* `overflowWrap` is load-bearing in a grid: an unbroken token like a stable error code or
            a traceId is wider than a half-width card and would otherwise stretch its column and
            push the neighbouring card off the screen. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--lx-space-2)',
            alignItems: 'flex-start',
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {errorTitle ? <strong>{errorTitle}</strong> : null}
          <span>{apiErrorMessage(query.error, t)}</span>
          <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      </Alert>
    );
  }

  if (query.data === undefined) {
    return <>{loading ?? <p className="lx-text-meta" style={{ margin: 0 }}>{t('common.loading')}</p>}</>;
  }

  if (isEmpty?.(query.data)) {
    return <>{empty ?? null}</>;
  }

  return <>{children(query.data)}</>;
}
