import * as React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation, formatCurrencyMinor, formatDateTime } from '@luparx/i18n';
import { Alert, Button, Modal, RadioCardGroup, SummaryList, SummaryRow } from '@luparx/ui';
import type { ParkingExtensionOption, ParkingSession } from '@luparx/api-client';
import { useExtendParkingSession, useExtensionOptions, useTenantTimeZone } from '../lib/queries';
import { parkingErrorMessage, parkingReasonMessage } from '../lib/apiErrors';
import { formatDurationLabel } from '../lib/duration';

export interface ExtendSessionSheetProps {
  open: boolean;
  onClose: () => void;
  session: ParkingSession;
}

/**
 * "Ampliar tiempo", rebuilt on `GET /citizen/parking/sessions/{id}/extension-options`.
 *
 * <p>What it replaced derived the options from the policy and then <em>estimated</em> each price by
 * dividing the amount already charged by the minutes already booked. That average is right only
 * for a municipality whose tariff is linear, which most are not: a ladder that charges ₡150 for
 * the first quarter hour and ₡500 for the hour makes the estimate wrong in both directions, and
 * the citizen learns the real number after the wallet has been debited. It also could not say when
 * the stay would then end, because it did not know whether the extra minutes fell inside a
 * charging band.</p>
 *
 * <p>All of that is now one request. Every row carries the server's own amount, the summary states
 * the expiry the server would set and what would leave the wallet, and an option the municipality
 * will not sell arrives with `allowed: false` and a reason — shown disabled, never dropped.</p>
 *
 * <p>The confirm button is disabled while the extension is in flight, and the api-client stamps a
 * fresh `Idempotency-Key` on each logical call — so a second tap cannot start a second purchase,
 * and a retry of the same one is the server's to collapse.</p>
 */
export function ExtendSessionSheet({ open, onClose, session }: ExtendSessionSheetProps): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const timeZone = useTenantTimeZone();
  const optionsQuery = useExtensionOptions(session.id, open);
  const extend = useExtendParkingSession();
  const [minutes, setMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = optionsQuery.data ?? [];
  const allowed = options.filter((option) => option.allowed);

  // The first option the municipality will actually sell, chosen once the list arrives. Selecting
  // a disabled row by default would put a price in the summary that cannot be bought.
  useEffect(() => {
    if (!open) {
      setMinutes(null);
      setError(null);
      return;
    }
    if (minutes === null && allowed.length > 0) setMinutes(allowed[0]!.minutes);
  }, [open, minutes, allowed]);

  const selected: ParkingExtensionOption | undefined = options.find((option) => option.minutes === minutes);

  async function handleSubmit(): Promise<void> {
    if (!selected?.allowed) return;
    setError(null);
    try {
      await extend.mutateAsync({ id: session.id, payload: { minutes: selected.minutes } });
      onClose();
    } catch (err) {
      setError(parkingErrorMessage(err, t));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('citizen.parking.extend.title')} closeLabel={t('common.close')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
        {/* When the stay ends today, before anything is chosen — the sentence the reference dialog
            opens with, so the new expiry below has something to be compared against. */}
        <p className="lx-text-meta" style={{ margin: 0 }}>
          {t('citizen.parking.extend.currentlyEndsAt', {
            time: formatDateTime(session.expiresAt, locale, { timeZone }),
          })}
        </p>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {optionsQuery.isPending ? <p className="lx-text-meta">{t('common.loading')}</p> : null}
        {optionsQuery.isError ? <Alert tone="danger">{parkingErrorMessage(optionsQuery.error, t)}</Alert> : null}

        {optionsQuery.isSuccess && options.length === 0 ? (
          <Alert tone="info">{t('citizen.parking.extend.noOptions')}</Alert>
        ) : null}

        {options.length > 0 ? (
          <RadioCardGroup
            name="extension-minutes"
            legend={t('citizen.parking.extend.chooseLabel')}
            value={minutes !== null ? String(minutes) : ''}
            onChange={(value) => setMinutes(Number(value))}
            options={options.map((option) => ({
              value: String(option.minutes),
              label: formatDurationLabel(option.minutes, tPlural),
              // The server's amount, verbatim. Never minutes × a rate, not even as a preview.
              trailing: formatCurrencyMinor(option.payableMinor, option.currencyCode, locale),
              detail: option.allowed
                ? // Both facts can hold at once, and both explain the amount beside them: only the
                  // minutes inside a charging band are billed, and the citizen's own minutes are
                  // spent before their money. An amount of ₡0 with neither stated is a number
                  // nobody can act on.
                  [
                    option.chargeableMinutes !== option.minutes
                      ? t('citizen.parking.extend.chargeableMinutes', {
                          minutes: tPlural('citizen.parking.durationMinutes', option.chargeableMinutes),
                        })
                      : undefined,
                    option.creditMinutesApplied > 0
                      ? t('citizen.parking.extend.creditApplied', {
                          minutes: tPlural('citizen.parking.durationMinutes', option.creditMinutesApplied),
                        })
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                : // Exactly which rule refused it. "No disponible" would send the citizen to look
                  // for a fault that is not theirs when the answer is "top up your wallet".
                  parkingReasonMessage(option.unavailableReason, t),
              disabled: !option.allowed,
            }))}
          />
        ) : null}

        {selected ? (
          <SummaryList>
            <SummaryRow
              label={t('citizen.parking.extend.newExpiryLabel')}
              value={formatDateTime(selected.newExpiresAt, locale, { timeZone })}
            />
            <SummaryRow
              label={t('citizen.parking.extend.costLabel')}
              value={formatCurrencyMinor(selected.payableMinor, selected.currencyCode, locale)}
            />
          </SummaryList>
        ) : null}

        <p className="lx-text-meta" style={{ margin: 0 }}>
          {t('citizen.parking.extend.walletNote')}
        </p>

        <div className="lx-dialog-actions">
          <Button type="button" variant="secondary" fullWidth onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            fullWidth
            loading={extend.isPending}
            disabled={!selected?.allowed}
            onClick={handleSubmit}
          >
            {t('citizen.parking.extend.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
