import * as React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation, formatDate } from '@luparx/i18n';
import { Alert, Button, Modal } from '@luparx/ui';
import type { ParkingPolicy, ParkingSession } from '@luparx/api-client';
import { useFinishParkingSession } from '../lib/queries';
import { parkingErrorMessage } from '../lib/apiErrors';

export interface FinishSessionConfirmProps {
  open: boolean;
  onClose: () => void;
  session: ParkingSession;
  policy: ParkingPolicy;
}

/**
 * Explains plainly what happens to the remaining minutes (CONTRACT.md v0.2 rule 5) — no
 * euphemisms: either they're credited (how many, and exactly when they expire) or they're lost
 * outright. The parent only renders this when `policy.earlyFinishEnabled` is true, mirroring how
 * the extend sheet is gated (the finish CTA itself doesn't show otherwise).
 */
export function FinishSessionConfirm({ open, onClose, session, policy }: FinishSessionConfirmProps): React.JSX.Element {
  const { t, tPlural, locale } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const finish = useFinishParkingSession();

  const remainingMinutes = useMemo(
    () => Math.max(0, Math.round((new Date(session.expiresAt).getTime() - Date.now()) / 60_000)),
    // Recomputed each time the dialog opens (open toggling to true), not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.expiresAt, open],
  );
  const willCredit = policy.creditOnEarlyFinishEnabled && remainingMinutes >= policy.creditMinRemainingMinutes;
  const creditExpiryDate =
    policy.creditExpiryDays > 0 ? new Date(Date.now() + policy.creditExpiryDays * 24 * 60 * 60 * 1000) : null;

  async function handleSubmit(): Promise<void> {
    setError(null);
    try {
      await finish.mutateAsync(session.id);
      onClose();
    } catch (err) {
      setError(parkingErrorMessage(err, t));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('citizen.parking.finish.confirmTitle')} closeLabel={t('common.close')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lx-space-4)' }}>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Alert tone={willCredit ? 'info' : 'danger'}>
          {willCredit
            ? t('citizen.parking.finish.confirmDescription.credited', {
                minutes: tPlural('citizen.parking.durationMinutes', remainingMinutes),
                date: creditExpiryDate ? formatDate(creditExpiryDate, locale) : t('citizen.wallet.timeCredits.noExpiry'),
              })
            : t('citizen.parking.finish.confirmDescription.lost', {
                minutes: tPlural('citizen.parking.durationMinutes', remainingMinutes),
              })}
        </Alert>
        <div style={{ display: 'flex', gap: 'var(--lx-space-2)' }}>
          <Button type="button" variant="secondary" fullWidth onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" variant="danger" fullWidth loading={finish.isPending} onClick={handleSubmit}>
            {t('citizen.parking.finish.confirmSubmit')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
