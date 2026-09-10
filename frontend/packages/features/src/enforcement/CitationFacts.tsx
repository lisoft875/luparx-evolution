import * as React from 'react';
import type { Citation } from '@luparx/api-client';
import { formatCurrencyMinor, formatDateTime, formatNumber, useTranslation } from '@luparx/i18n';
import { Alert, Badge, Card, SectionHeader, SummaryList, SummaryRow } from '@luparx/ui';
import { citationStatusKey, citationStatusTone } from './labels';

export interface CitationFactsProps {
  citation: Citation;
  /** Municipality time zone, when the caller knows it; otherwise the reader's device. */
  timeZone?: string;
  /** Officer-only facts: the device clock offset and the internal session reference. */
  showInternal?: boolean;
}

/**
 * Everything an act states about itself, in one block, for the officer and the administration.
 *
 * The citizen deliberately does not use this component: their view is narrower by design (no
 * officer identifier, no device clock offset, no internal session reference), and the narrowing has
 * to be a property of the API and the screen rather than a `hidden` prop somebody can flip.
 * `showInternal` only separates the two municipal audiences from each other.
 *
 * The absence of coordinates is stated rather than skipped. A citation with no GPS is a normal,
 * defensible citation; a citation whose location section simply is not there reads like data that
 * went missing.
 */
export function CitationFacts({ citation, timeZone, showInternal = false }: CitationFactsProps): React.JSX.Element {
  const { t, locale } = useTranslation();
  const zone = timeZone ? { timeZone } : undefined;
  const hasCoordinates = citation.latitude != null && citation.longitude != null;

  return (
    <Card>
      <SectionHeader
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-2)', flexWrap: 'wrap' }}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {citation.number ?? t('citation.field.noNumber')}
            </span>
            <Badge tone={citationStatusTone(citation.status)}>{t(citationStatusKey(citation.status))}</Badge>
            {/* Said next to the status and not buried among the rows: whether this platform is the
                one that decides changes what every other line on the screen means (v0.34). */}
            {citation.source === 'EXTERNAL' ? (
              <Badge tone="info">
                {citation.sourceSystem
                  ? t('citation.source.external.named', { system: citation.sourceSystem })
                  : t('citation.source.external')}
              </Badge>
            ) : null}
          </span>
        }
        description={citation.infractionName}
      />
      <SummaryList>
        <SummaryRow label={t('citation.field.plate')} value={citation.plate} />
        <SummaryRow
          label={t('citation.field.infraction')}
          value={`${citation.infractionCode} · ${citation.infractionName}`}
        />
        <SummaryRow label={t('citation.field.fine')} value={formatCurrencyMinor(citation.fineMinor, citation.currencyCode, locale)} />
        <SummaryRow
          label={t('citation.field.amountPayable')}
          value={formatCurrencyMinor(citation.amountPayableMinor, citation.currencyCode, locale)}
        />
        {citation.discountUntil ? (
          <SummaryRow
            label={t('citation.field.discountUntil')}
            value={formatDateTime(citation.discountUntil, locale, zone)}
          />
        ) : null}
        {citation.dueAt ? (
          <SummaryRow label={t('citation.field.dueAt')} value={formatDateTime(citation.dueAt, locale, zone)} />
        ) : null}
        <SummaryRow
          label={t('citation.field.zone')}
          value={citation.zoneName ? `${citation.zoneName} (${citation.zoneCode})` : '—'}
        />
        <SummaryRow label={t('citation.field.bay')} value={citation.spaceCode ?? '—'} />
        {citation.addressText ? (
          <SummaryRow label={t('citation.field.address')} value={citation.addressText} />
        ) : null}
        <SummaryRow
          label={t('citation.field.coordinates')}
          value={
            hasCoordinates
              ? `${citation.latitude?.toFixed(5)}, ${citation.longitude?.toFixed(5)}`
              : t('citation.field.noCoordinates')
          }
        />
        {hasCoordinates && citation.locationAccuracyM != null ? (
          <SummaryRow
            label={t('citation.field.accuracy')}
            value={`±${formatNumber(Math.round(citation.locationAccuracyM), locale)} m`}
          />
        ) : null}
        <SummaryRow label={t('citation.field.occurredAt')} value={formatDateTime(citation.occurredAt, locale, zone)} />
        {citation.issuedAt ? (
          <SummaryRow label={t('citation.field.issuedAt')} value={formatDateTime(citation.issuedAt, locale, zone)} />
        ) : null}
        {showInternal && citation.deviceClockSkewSeconds != null ? (
          <SummaryRow
            label={t('citation.field.clockSkew')}
            value={t('citation.clockSkew.seconds', { seconds: citation.deviceClockSkewSeconds })}
          />
        ) : null}
        {/* The other system's own word for the state. The office is going to be quoted this on the
            telephone, and our mapped status will not be the phrase the citizen read. */}
        {citation.externalStatus ? (
          <SummaryRow label={t('citation.field.externalStatus')} value={citation.externalStatus} />
        ) : null}
        {showInternal && citation.lastSeenAt ? (
          <SummaryRow
            label={t('citation.field.lastSeenAt')}
            value={formatDateTime(citation.lastSeenAt, locale, zone)}
          />
        ) : null}
        {citation.notes ? <SummaryRow label={t('citation.field.notes')} value={citation.notes} /> : null}
        {citation.statusReason ? (
          <SummaryRow label={t('citation.field.statusReason')} value={citation.statusReason} />
        ) : null}
      </SummaryList>
      {/* Before the missing-coordinates hint, because it is the more consequential of the two: it is
          the difference between "this citation is incomplete" and "this citation is not ours to
          settle". Somebody reading this screen is about to try to do something with it. */}
      {citation.managedHere === false ? (
        <Alert tone="info">
          {citation.sourceSystem
            ? t('citation.source.mirrorNotice.named', { system: citation.sourceSystem })
            : t('citation.source.mirrorNotice')}
        </Alert>
      ) : null}
      {!hasCoordinates ? <Alert tone="info">{t('citation.field.noCoordinates.hint')}</Alert> : null}
    </Card>
  );
}
