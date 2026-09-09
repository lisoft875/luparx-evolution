import * as React from 'react';
import type { CitationEvent } from '@luparx/api-client';
import { formatDateTime, useTranslation } from '@luparx/i18n';
import { Badge, Card, SectionHeader } from '@luparx/ui';
import { actorPortalKey, citationActionKey, citationStatusKey } from './labels';

export interface CitationHistoryProps {
  events: readonly CitationEvent[];
  /** Municipality time zone, when the caller knows it; otherwise the device's. */
  timeZone?: string;
}

/**
 * A citation's own history, rendered identically in all three portals.
 *
 * It is deliberately the same component for the officer, the administration and the citizen who
 * was fined: the history is part of the citation (CONTRACT.md v0.7), not an internal log, and the
 * person challenging the act is entitled to read exactly what the office reads — including the
 * reason an annulment was granted or refused. Building a narrower version for the citizen would be
 * the beginning of two versions of what happened.
 */
export function CitationHistory({ events, timeZone }: CitationHistoryProps): React.JSX.Element {
  const { t, locale } = useTranslation();

  return (
    <Card>
      <SectionHeader title={t('citation.history.title')} />
      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--lx-space-3)',
        }}
      >
        {events.map((event) => {
          const portalKey = actorPortalKey(event.actorPortal);
          return (
            <li
              key={event.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--lx-space-1)',
                paddingInlineStart: 'var(--lx-space-3)',
                borderInlineStart: '2px solid var(--lx-border)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 'var(--lx-space-2)',
                }}
              >
                <strong className="lx-text-card-title">{t(citationActionKey(event.action))}</strong>
                {event.toStatus ? (
                  <Badge tone="neutral">{t(citationStatusKey(event.toStatus))}</Badge>
                ) : null}
              </div>
              <span className="lx-text-meta">
                {formatDateTime(event.occurredAt, locale, timeZone ? { timeZone } : undefined)}
                {portalKey ? ` · ${t(portalKey)}` : ''}
              </span>
              {event.reason ? (
                <span className="lx-text-body">
                  {t('citation.history.reason')}: {event.reason}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
