import * as React from 'react';
import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CitationHistory, EvidenceGallery, citationStatusKey, citationStatusTone } from '@luparx/features';
import { useAuth } from '@luparx/auth';
import { formatCurrencyMinor, formatDateTime, useTranslation } from '@luparx/i18n';
import { Alert, Badge, Button, Card, SectionHeader, SummaryList, SummaryRow } from '@luparx/ui';
import type { CitationStatus } from '@luparx/api-client';
import { CitizenShell } from '../components/CitizenShell';
import { PayFineDialog } from '../components/PayFineDialog';
import { QueryBoundary } from '../components/QueryBoundary';
import { useFine } from '../lib/queries';

/**
 * The statuses the server will move to `PAID` — `CitationStatus`' own transition table, read from
 * the outside. Duplicated here knowingly and kept to one line: the alternative is a screen that
 * offers a live button for a fine the server will refuse, and the citizen reads that refusal as the
 * app being broken. The server remains the authority; this only decides whether to ask.
 *
 * `APPEALED` is on the list since v0.41 — paying is how a citizen ends their own claim.
 */
const PAYABLE_STATUSES: readonly CitationStatus[] = ['ISSUED', 'APPEALED', 'UPHELD', 'EXPIRED'];

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
 * Live since v0.41: `POST /citizen/fines/{id}/payments` charges the wallet, and the confirmation
 * the citizen reads before it does lives in {@link PayFineDialog}. The button is shown only for a
 * status the server would actually accept and for a fine this platform collects — a mirrored fine
 * (v0.34) keeps the disabled button and the sentence saying which window takes the money, because
 * "no se puede pagar" with no reason reads as a broken app rather than another counter's business.
 *
 * A fine that is already paid, void or dismissed gets no card at all: the status badge at the top
 * has said so, and a second box repeating it in the negative only invites the question of whether
 * something went wrong.
 */
export function FineDetailPage(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { apiClient } = useAuth();
  const query = useFine(id);
  const [payOpen, setPayOpen] = useState(false);
  // Held on the page and not inside the dialog: the dialog closes the moment the money moves, and a
  // confirmation that leaves with it is one the citizen never got to read.
  const [paid, setPaid] = useState<{ withdrewAppeal: boolean } | null>(null);

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
                    label={t(
                  // «Monto original» cuando hay un descuento vigente y por tanto DOS cifras en
                  // pantalla; «Monto» a secas cuando sólo hay una y no hay nada que distinguir.
                  fine.amountPayableMinor !== fine.fineMinor
                    ? 'citizen.fines.amountOriginal'
                    : 'citation.field.fine',
                )}
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

              {fine.managedHere === false ? (
                <Card>
                  {/* Disabled and honest about why. Deliberately not the primary style: the glow
                      marks the one live action on a screen, and a glowing button that does nothing
                      is the visual version of the lie this block avoids. */}
                  <Button type="button" variant="secondary" fullWidth disabled>
                    {t('citizen.fines.pay')}
                  </Button>
                  <div style={{ marginTop: 'var(--lx-space-3)' }}>
                    <Alert tone="info">{t('citizen.fines.payElsewhere')}</Alert>
                  </div>
                </Card>
              ) : paid ? (
                <Card>
                  <Alert tone="success">
                    {t(paid.withdrewAppeal ? 'citizen.fines.pay.successWithdrew' : 'citizen.fines.pay.success')}
                  </Alert>
                </Card>
              ) : PAYABLE_STATUSES.includes(fine.status) ? (
                <Card>
                  <Button type="button" variant="primary" fullWidth onClick={() => setPayOpen(true)}>
                    {t('citizen.fines.pay')}
                  </Button>
                </Card>
              ) : null}

              {payOpen ? (
                <PayFineDialog
                  open
                  onClose={() => setPayOpen(false)}
                  fine={fine}
                  appealWaiting={detail.appeal?.status === 'SUBMITTED'}
                  onPaid={(result) => {
                    setPayOpen(false);
                    setPaid({ withdrewAppeal: result.appealWithdrawn });
                  }}
                />
              ) : null}

              {/*
                El historial es la única fuente que sabe que hubo pruebas cuando la lista llega
                vacía: el servidor las omite a propósito para quien comparte la placa pero no tiene
                el vehículo vinculado (ADR 0029). Sin esto la pantalla decía «no tiene pruebas» y
                «Prueba adjuntada» a la vez.
              */}
              <EvidenceGallery
                evidence={detail.evidence}
                loadContent={loadEvidence}
                evidenceWithheld={
                  detail.evidence.length === 0 &&
                  detail.history.some((event) => event.action === 'EVIDENCE_ATTACHED')
                }
              />
              <CitationHistory events={detail.history} />
            </>
          );
        }}
      </QueryBoundary>
    </CitizenShell>
  );
}
