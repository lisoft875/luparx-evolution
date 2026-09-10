import * as React from 'react';
import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CitationHistory, EvidenceGallery, citationStatusKey, citationStatusTone } from '@luparx/features';
import { useAuth } from '@luparx/auth';
import { formatCurrencyMinor, formatDateTime, useTranslation } from '@luparx/i18n';
import { Alert, Badge, Button, Card, SectionHeader, SummaryList, SummaryRow } from '@luparx/ui';
import { CitizenShell } from '../components/CitizenShell';
import { QueryBoundary } from '../components/QueryBoundary';
import { useFine } from '../lib/queries';

/**
 * One fine, as the person who was fined is entitled to read it.
 *
 * Narrower than the municipal view by construction, not by hiding: the server's `FineResponse`
 * carries no officer identifier, no device clock offset and no internal session reference, so this
 * screen could not show them if it wanted to. What it does show in full is the **evidence and the
 * history** — the same history the office reads — because that is what a person needs in order to
 * argue that an act was wrong.
 *
 * <h2>The payment button</h2>
 *
 * `POST /citizen/fines/{id}/payments` is declared and answers `501 NOT_IMPLEMENTED`: the contract
 * is fixed, the implementation arrives with the payments batch. So the button is here and disabled,
 * with the reason written next to it. A button that looked live and failed — or worse, a "pay"
 * flow that ended in a screen saying the payment was recorded — would be a lie about money.
 */
export function FineDetailPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { apiClient } = useAuth();
  const query = useFine(id);

  const loadEvidence = useCallback(
    (evidenceId: string) => apiClient.citizenFines.evidenceContent(id as string, evidenceId),
    [apiClient, id],
  );

  return (
    <CitizenShell title={t('citizen.fines.detail.title')} onBack={() => navigate('/fines')}>
      <QueryBoundary query={query} errorTitle={t('citizen.fines.detail.title')}>
        {(detail) => {
          const fine = detail.fine;
          return (
            <>
              <Card>
                <SectionHeader
                  title={
                    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--lx-space-2)', flexWrap: 'wrap' }}>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {fine.number ?? t('citation.field.noNumber')}
                      </span>
                      <Badge tone={citationStatusTone(fine.status)}>{t(citationStatusKey(fine.status))}</Badge>
                    </span>
                  }
                  description={fine.infractionName}
                />
                <p
                  style={{
                    margin: '0 0 var(--lx-space-3) 0',
                    fontSize: 28,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--lx-danger)',
                  }}
                >
                  {formatCurrencyMinor(fine.amountPayableMinor, fine.currencyCode, locale)}
                </p>
                <p className="lx-text-meta" style={{ margin: '0 0 var(--lx-space-3) 0' }}>
                  {t('citizen.fines.amountPayable')}
                  {fine.discountUntil
                    ? ` · ${t('citizen.fines.discountUntil', {
                        date: formatDateTime(fine.discountUntil, locale),
                      })}`
                    : ''}
                </p>
                {/* Said before the amount is acted on, not after. Somebody who reads "pagar no
                    disponible" at the bottom of the screen concludes the platform is broken; what is
                    true is that this fine belongs to the municipality's other window (v0.34). */}
                {fine.managedHere === false ? (
                  <div style={{ margin: '0 0 var(--lx-space-3) 0' }}>
                    <Alert tone="info">
                      {fine.sourceSystem
                        ? t('citizen.fines.managedElsewhere.named', { system: fine.sourceSystem })
                        : t('citizen.fines.managedElsewhere')}
                    </Alert>
                  </div>
                ) : null}
                <SummaryList>
                  <SummaryRow label={t('citation.field.plate')} value={fine.plate} />
                  {fine.externalStatus ? (
                    <SummaryRow label={t('citation.field.externalStatus')} value={fine.externalStatus} />
                  ) : null}
                  <SummaryRow
                    label={t('citation.field.infraction')}
                    value={`${fine.infractionCode} · ${fine.infractionName}`}
                  />
                  <SummaryRow
                    label={t('citation.field.fine')}
                    value={formatCurrencyMinor(fine.fineMinor, fine.currencyCode, locale)}
                  />
                  <SummaryRow label={t('citation.field.zone')} value={fine.zoneName ?? '—'} />
                  <SummaryRow label={t('citation.field.bay')} value={fine.spaceCode ?? '—'} />
                  {fine.addressText ? (
                    <SummaryRow label={t('citation.field.address')} value={fine.addressText} />
                  ) : null}
                  <SummaryRow
                    label={t('citation.field.occurredAt')}
                    value={formatDateTime(fine.occurredAt, locale)}
                  />
                  {fine.issuedAt ? (
                    <SummaryRow label={t('citation.field.issuedAt')} value={formatDateTime(fine.issuedAt, locale)} />
                  ) : null}
                  {fine.dueAt ? (
                    <SummaryRow label={t('citation.field.dueAt')} value={formatDateTime(fine.dueAt, locale)} />
                  ) : null}
                  <SummaryRow
                    label={t('citizen.fines.appealable')}
                    value={fine.appealable ? t('common.yes') : t('citizen.fines.notAppealable')}
                  />
                </SummaryList>
              </Card>

              {/* The defence (CONTRACT.md v0.17). One button, two meanings, and the label says
                  which: write one, or read the one already filed and the answer to it. It is not
                  hidden once resolved — the reason the municipality gave is the part that matters
                  most, and burying it would be the second injustice. */}
              {detail.appeal || fine.appealable ? (
                <Card>
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth
                    onClick={() => navigate(`/fines/${fine.id}/appeal`)}
                  >
                    {t(detail.appeal ? 'citizen.fines.viewAppeal' : 'citizen.fines.appeal')}
                  </Button>
                </Card>
              ) : null}

              <Card>
                {/* Prepared, disabled, and honest about why. Deliberately not the primary style:
                    the glow marks the one live action on a screen, and a glowing button that does
                    nothing is the visual version of the lie this whole block avoids. */}
                <Button type="button" variant="secondary" fullWidth disabled>
                  {t('citizen.fines.pay')}
                </Button>
                <div style={{ marginTop: 'var(--lx-space-3)' }}>
                  <Alert tone="info">
                    {fine.managedHere === false
                      ? t('citizen.fines.payElsewhere')
                      : t('citizen.fines.payUnavailable')}
                  </Alert>
                </div>
              </Card>

              <EvidenceGallery evidence={detail.evidence} loadContent={loadEvidence} />
              <CitationHistory events={detail.history} />
            </>
          );
        }}
      </QueryBoundary>
    </CitizenShell>
  );
}
